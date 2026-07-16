/**
 * Nightglass-style history watermarks for the six daily statistic cards.
 *
 * The former locally sampled 60-minute lines were visually attractive but had
 * no fixed relationship with the daily value shown in the card. This module
 * instead uses Domoticz' own day graph endpoint, exactly like the Nightglass
 * device cards:
 *
 *   json.htm?type=command&param=graph&sensor=...&idx=...&range=day
 *
 * Direct device history is preferred. House consumption and the two solar
 * percentages are derived only when Domoticz has no dedicated history device,
 * and then exclusively from aligned, real P1 and solar history points.
 */

import { api, ensureDeviceIds } from '../services/domoticzService.js';
import { getLocale, t } from '../i18n.js';

export const HISTORY_REFRESH_MS = 5 * 60_000;
export const HISTORY_CACHE_TTL = 4 * 60_000;
export const HISTORY_MAX_POINTS = 120;

const SENSOR_CANDIDATES = {
  grid:     ['counter'],
  house:    ['counter'],
  solar:    ['counter'],
  gas:      ['counter'],
  selfSuff: ['Percentage', 'counter', 'temp'],
  selfCons: ['Percentage', 'counter', 'temp'],
};

const DEVICE_KEYS = {
  grid:     'p1',
  house:    'usage',
  solar:    'solar',
  gas:      'gas',
  selfSuff: 'selfSufficiency',
  selfCons: 'selfConsumption',
};

const HISTORY_KEYS = Object.keys(DEVICE_KEYS);
const SVG_NS = 'http://www.w3.org/2000/svg';
const LEGACY_STORAGE_KEYS = [
  'nightglass-energy-sparklines-v2',
  'nightglass-energy-sparklines-v3',
];

let refreshTimer = null;
let refreshPromise = null;
let lastRefreshAt = 0;
const lastSnapshots = new Map();

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function firstNumber(row, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = finiteNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function sumPresentFields(row, keys) {
  let found = false;
  let total = 0;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = finiteNumber(row[key]);
    if (value === null) continue;
    found = true;
    total += value;
  }
  return found ? total : null;
}

function p1ImportValue(row) {
  // Most Domoticz P1 rows use v/v2; some plugins expose v1/v2 instead.
  const tariffPair = Object.prototype.hasOwnProperty.call(row, 'v1')
    ? sumPresentFields(row, ['v1', 'v2'])
    : sumPresentFields(row, ['v', 'v2']);
  if (tariffPair !== null) return tariffPair;

  const namedTariffs = sumPresentFields(row, [
    'usage1', 'usage2', 'used1', 'used2', 'import1', 'import2',
    'consumption1', 'consumption2',
  ]);
  if (namedTariffs !== null) return namedTariffs;

  return firstNumber(row, [
    'usage', 'used', 'import', 'imported', 'consumption', 'consumed',
    'usageCurrent', 'usage_current', 'counterUsed', 'counter_used',
  ]);
}

function p1ExportValue(row) {
  const tariffPair = sumPresentFields(row, ['v3', 'v4']);
  if (tariffPair !== null) return tariffPair;

  const returnPair = sumPresentFields(row, ['r1', 'r2']);
  if (returnPair !== null) return returnPair;

  const namedTariffs = sumPresentFields(row, [
    'return1', 'return2', 'returned1', 'returned2', 'export1', 'export2',
    'delivery1', 'delivery2', 'delivered1', 'delivered2',
  ]);
  if (namedTariffs !== null) return namedTariffs;

  return firstNumber(row, [
    'r', 'return', 'returned', 'export', 'exported', 'delivery', 'delivered',
    'usageDelivered', 'usage_delivered', 'counterDelivered', 'counter_delivered',
  ]);
}

/**
 * Extracts one numeric point from a Domoticz graph row.
 * Grid export is negative, so its zero line has an actual physical meaning.
 */
export function historyValueFromRow(role, row) {
  if (!row || typeof row !== 'object') return null;

  if (role === 'grid') {
    const directSigned = firstNumber(row, [
      'net', 'netValue', 'net_value', 'netUsage', 'net_usage',
      'signed', 'signedPower', 'signed_power',
    ]);
    if (directSigned !== null) return directSigned;

    const imported = p1ImportValue(row);
    const exported = p1ExportValue(row);
    if (imported !== null || exported !== null) {
      return (imported || 0) - (exported || 0);
    }
  }

  const value = firstNumber(row, [
    'v', 'v_max', 'value', 'Value', 'val', 'Data', 'sValue',
    'te', 'hu', 'ba', 'sp', 'u', 'lux', 'mm', 'baro',
    'percentage', 'Percentage', 'p',
  ]);
  if (value === null) return null;
  if (role === 'selfSuff' || role === 'selfCons') {
    return Math.max(0, Math.min(100, value));
  }
  return value;
}

function localTimestamp(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Safari-safe parser for the date formats returned by Domoticz graph rows. */
export function parseHistoryTimestamp(value, now = Date.now()) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  if (/^\d{10,13}$/.test(text)) {
    const timestamp = Number(text);
    return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  }

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/);
  if (match) {
    return localTimestamp(
      Number(match[1]), Number(match[2]), Number(match[3]),
      Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0),
    );
  }

  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/);
  if (match) {
    return localTimestamp(
      Number(match[3]), Number(match[2]), Number(match[1]),
      Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0),
    );
  }

  match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const date = new Date(now);
    return localTimestamp(
      date.getFullYear(), date.getMonth() + 1, date.getDate(),
      Number(match[1]), Number(match[2]), Number(match[3] || 0),
    );
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowTimestamp(row, index, count, now) {
  const candidates = [
    row.d, row.date, row.Date, row.datetime, row.timestamp,
    row.ts, row.t, row.time,
  ];
  for (const candidate of candidates) {
    const timestamp = parseHistoryTimestamp(candidate, now);
    if (timestamp !== null) return timestamp;
  }

  // Some custom graph plugins omit timestamps. Preserve their real row order;
  // only the horizontal placement is then distributed over today-to-now.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const elapsed = Math.max(1, now - start.getTime());
  const fraction = count <= 1 ? 1 : index / (count - 1);
  return start.getTime() + elapsed * fraction;
}

function downsample(points, maxPoints = HISTORY_MAX_POINTS) {
  if (points.length <= maxPoints) return points;
  const sampled = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round(i * lastIndex / (maxPoints - 1));
    const point = points[index];
    if (!sampled.length || sampled.at(-1).t !== point.t) sampled.push(point);
  }
  return sampled;
}

/** Converts raw Domoticz rows into sorted, deduplicated chart points. */
export function parseDomoticzHistoryRows(role, rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const byTimestamp = new Map();
  rows.forEach((row, index) => {
    const value = historyValueFromRow(role, row);
    if (value === null || !Number.isFinite(value)) return;
    const timestamp = rowTimestamp(row, index, rows.length, now);
    if (!Number.isFinite(timestamp)) return;
    byTimestamp.set(timestamp, { t: timestamp, v: value });
  });

  return downsample(Array.from(byTimestamp.values()).sort((a, b) => a.t - b.t));
}

function typicalStep(points) {
  if (!points || points.length < 2) return 60 * 60_000;
  const steps = [];
  for (let i = 1; i < points.length; i += 1) {
    const step = points[i].t - points[i - 1].t;
    if (step > 0) steps.push(step);
  }
  if (!steps.length) return 60 * 60_000;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

function nearestPoint(points, timestamp, maxDistanceMs) {
  let best = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(point.t - timestamp);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistanceMs ? best : null;
}

function alignmentTolerance(...series) {
  const largestStep = Math.max(...series.map(points => typicalStep(points)));
  return Math.max(15 * 60_000, Math.min(2 * 60 * 60_000, largestStep * 0.65));
}

/** Derives house consumption from real signed grid-net and solar history. */
export function deriveHouseHistory(gridPoints, solarPoints) {
  if (!gridPoints?.length || !solarPoints?.length) return [];
  const tolerance = alignmentTolerance(gridPoints, solarPoints);
  const derived = [];

  for (const solar of solarPoints) {
    const grid = nearestPoint(gridPoints, solar.t, tolerance);
    if (!grid) continue;
    derived.push({ t: solar.t, v: Math.max(0, solar.v + grid.v) });
  }
  return downsample(derived);
}

/** Derives self-sufficiency and self-consumption from aligned real histories. */
export function deriveKpiHistories(housePoints, solarPoints) {
  const selfSuff = [];
  const selfCons = [];
  if (!housePoints?.length || !solarPoints?.length) return { selfSuff, selfCons };

  const tolerance = alignmentTolerance(housePoints, solarPoints);
  for (const house of housePoints) {
    const solar = nearestPoint(solarPoints, house.t, tolerance);
    if (!solar) continue;

    const localSolar = Math.max(0, Math.min(solar.v, house.v));
    selfSuff.push({
      t: house.t,
      v: house.v > 0 ? Math.min(100, localSolar / house.v * 100) : 0,
    });
    selfCons.push({
      t: house.t,
      v: solar.v > 0 ? Math.min(100, localSolar / solar.v * 100) : 0,
    });
  }

  return {
    selfSuff: downsample(selfSuff),
    selfCons: downsample(selfCons),
  };
}

function scaleForRole(role, points) {
  const values = points.map(point => point.v).filter(Number.isFinite);
  if (!values.length) return { min: 0, max: 1 };

  if (role === 'selfSuff' || role === 'selfCons') return { min: 0, max: 100 };

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  if (role === 'grid') {
    if (rawMin < 0 && rawMax > 0) {
      const extent = Math.max(1, Math.abs(rawMin), Math.abs(rawMax));
      return { min: -extent * 1.08, max: extent * 1.08 };
    }
    if (rawMax <= 0) return { min: Math.min(-1, rawMin * 1.08), max: 0 };
    return { min: 0, max: Math.max(1, rawMax * 1.08) };
  }

  const max = Math.max(1, rawMax);
  return { min: 0, max: max * 1.08 };
}

function pathFromCoords(coords) {
  if (!coords.length) return '';
  return coords
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
}

function pathFromSegments(segments) {
  return segments
    .filter(segment => segment.length >= 2)
    .map(pathFromCoords)
    .join(' ');
}

function areaFromSegments(segments, baselineY) {
  return segments
    .filter(segment => segment.length >= 2)
    .map(segment => {
      const line = pathFromCoords(segment);
      const first = segment[0];
      const last = segment.at(-1);
      return `${line} L${last.x.toFixed(2)},${baselineY.toFixed(2)} L${first.x.toFixed(2)},${baselineY.toFixed(2)} Z`;
    })
    .join(' ');
}

function appendSignedSegment(collection, sign, first, second) {
  const segments = collection[sign];
  const current = segments.at(-1);
  const last = current?.at(-1);
  if (!current || !last || last.x !== first.x || last.y !== first.y) {
    segments.push([first, second]);
    return;
  }
  current.push(second);
}

/** Splits a signed line at every zero crossing so import/export can use their own theme colours. */
function splitSignedCoords(coords, zeroY) {
  const result = { positive: [], negative: [] };

  for (let index = 1; index < coords.length; index += 1) {
    const first = coords[index - 1];
    const second = coords[index];
    const firstPositive = first.v >= 0;
    const secondPositive = second.v >= 0;

    if (firstPositive === secondPositive || first.v === second.v) {
      appendSignedSegment(result, firstPositive ? 'positive' : 'negative', first, second);
      continue;
    }

    const ratio = (0 - first.v) / (second.v - first.v);
    const crossing = {
      t: first.t + (second.t - first.t) * ratio,
      v: 0,
      x: first.x + (second.x - first.x) * ratio,
      y: zeroY,
    };
    appendSignedSegment(result, firstPositive ? 'positive' : 'negative', first, crossing);
    appendSignedSegment(result, secondPositive ? 'positive' : 'negative', crossing, second);
  }

  return result;
}

/** Builds the SVG line and area geometry for a full-card watermark. */
export function buildHistoryGeometry(role, rawPoints, width = 100, height = 56) {
  const points = downsample((rawPoints || [])
    .filter(point => point && Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t));
  if (points.length < 2) return null;

  const domainStart = points[0].t;
  const domainEnd = Math.max(domainStart + 1, points.at(-1).t);
  const scale = scaleForRole(role, points);
  const top = 5;
  const bottom = height - 2;
  const chartHeight = bottom - top;
  const range = scale.max - scale.min || 1;

  const coords = points.map(point => ({
    t: point.t,
    v: point.v,
    x: (point.t - domainStart) / (domainEnd - domainStart) * width,
    y: top + (1 - (point.v - scale.min) / range) * chartHeight,
  }));

  const zeroY = top + (1 - (0 - scale.min) / range) * chartHeight;
  const baselineY = role === 'grid' ? zeroY : bottom;
  const line = pathFromCoords(coords);
  const area = `${line} L${coords.at(-1).x.toFixed(2)},${baselineY.toFixed(2)} L${coords[0].x.toFixed(2)},${baselineY.toFixed(2)} Z`;
  const signed = role === 'grid' ? splitSignedCoords(coords, zeroY) : null;

  return {
    points,
    coords,
    scale,
    line,
    area,
    positiveLine: signed ? pathFromSegments(signed.positive) : '',
    negativeLine: signed ? pathFromSegments(signed.negative) : '',
    positiveArea: signed ? areaFromSegments(signed.positive, zeroY) : '',
    negativeArea: signed ? areaFromSegments(signed.negative, zeroY) : '',
    zeroY,
    width,
    height,
  };
}

function validIdx(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && String(value) !== '-1';
}

function hasPlaywrightHistory() {
  return typeof window !== 'undefined'
    && window.__PLAYWRIGHT__ === true
    && window.__MOCK_DEVICE_HISTORY__
    && typeof window.__MOCK_DEVICE_HISTORY__ === 'object';
}

function playwrightHistory(role) {
  if (!hasPlaywrightHistory()) return null;
  const points = window.__MOCK_DEVICE_HISTORY__[role];
  return Array.isArray(points) && points.length >= 2
    ? { points: downsample(points), sensor: 'mock', idx: 'mock', source: 'direct' }
    : null;
}

async function fetchRoleHistory(idx, role) {
  const mocked = playwrightHistory(role);
  if (mocked) return mocked;
  if (!validIdx(idx)) return null;

  const sensors = SENSOR_CANDIDATES[role] || SENSOR_CANDIDATES.house;
  for (const sensor of sensors) {
    try {
      const data = await api({ param: 'graph', sensor, idx, range: 'day' }, HISTORY_CACHE_TTL);
      const points = parseDomoticzHistoryRows(role, data?.result || []);
      if (points.length >= 2) {
        return { points, sensor, idx: String(idx), source: 'direct' };
      }
    } catch {
      // Try the next sensor type, matching Nightglass' resilient behaviour.
    }
  }
  return null;
}

function createSvgElement(name, className) {
  const element = document.createElementNS(SVG_NS, name);
  if (className) element.setAttribute('class', className);
  return element;
}

function ensureWatermark(card, role) {
  let wrap = card.querySelector(':scope > .history-watermark');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.className = 'history-watermark';
  wrap.dataset.historyRole = role;
  wrap.setAttribute('aria-hidden', 'true');

  const svg = createSvgElement('svg', 'history-watermark-svg');
  svg.setAttribute('viewBox', '0 0 100 56');
  svg.setAttribute('preserveAspectRatio', 'none');

  const zero = createSvgElement('line', 'history-watermark-zero');
  zero.setAttribute('x1', '0');
  zero.setAttribute('x2', '100');
  const area = createSvgElement('path', 'history-watermark-area history-watermark-area--main');
  const positiveArea = createSvgElement('path', 'history-watermark-area history-watermark-area--positive');
  const negativeArea = createSvgElement('path', 'history-watermark-area history-watermark-area--negative');
  const line = createSvgElement('path', 'history-watermark-line history-watermark-line--main');
  const positiveLine = createSvgElement('path', 'history-watermark-line history-watermark-line--positive');
  const negativeLine = createSvgElement('path', 'history-watermark-line history-watermark-line--negative');

  svg.append(zero, area, positiveArea, negativeArea, line, positiveLine, negativeLine);
  wrap.appendChild(svg);
  card.insertBefore(wrap, card.firstChild);
  return wrap;
}

function cardForRole(role) {
  return typeof document === 'undefined'
    ? null
    : document.querySelector(`[data-history-card="${role}"]`);
}

function stateDescription(role, snapshot) {
  const card = cardForRole(role);
  const name = card?.querySelector('h3')?.textContent?.trim() || role;
  if (!snapshot?.points?.length) return `${name}: ${t('history-watermark-no-data')}`;

  const time = new Date(snapshot.loadedAt || Date.now()).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const source = snapshot.source === 'derived'
    ? t('history-watermark-derived')
    : t('history-watermark-domoticz');
  return `${name}: ${t('history-watermark-day')} · ${source} · ${snapshot.points.length} ${t('history-watermark-points')} · ${time}`;
}

function renderRole(role, snapshot) {
  const card = cardForRole(role);
  if (!card) return;

  const wrap = ensureWatermark(card, role);
  const geometry = snapshot?.points?.length
    ? buildHistoryGeometry(role, snapshot.points)
    : null;
  const description = stateDescription(role, snapshot);

  card.dataset.historyState = geometry ? 'ready' : (snapshot?.state || 'empty');
  card.dataset.historySource = snapshot?.source || 'none';
  card.setAttribute('aria-description', description);
  card.title = description;

  const svg = wrap.querySelector('svg');
  const line = wrap.querySelector('.history-watermark-line--main');
  const area = wrap.querySelector('.history-watermark-area--main');
  const positiveLine = wrap.querySelector('.history-watermark-line--positive');
  const negativeLine = wrap.querySelector('.history-watermark-line--negative');
  const positiveArea = wrap.querySelector('.history-watermark-area--positive');
  const negativeArea = wrap.querySelector('.history-watermark-area--negative');
  const zero = wrap.querySelector('.history-watermark-zero');

  if (!geometry) {
    wrap.classList.remove('is-visible', 'has-zero');
    line?.removeAttribute('d');
    area?.removeAttribute('d');
    positiveLine?.removeAttribute('d');
    negativeLine?.removeAttribute('d');
    positiveArea?.removeAttribute('d');
    negativeArea?.removeAttribute('d');
    return;
  }

  if (svg) svg.dataset.historyScale = role;
  line?.setAttribute('d', role === 'grid' ? '' : geometry.line);
  area?.setAttribute('d', role === 'grid' ? '' : geometry.area);
  positiveLine?.setAttribute('d', geometry.positiveLine);
  negativeLine?.setAttribute('d', geometry.negativeLine);
  positiveArea?.setAttribute('d', geometry.positiveArea);
  negativeArea?.setAttribute('d', geometry.negativeArea);
  if (zero) {
    zero.setAttribute('y1', geometry.zeroY.toFixed(2));
    zero.setAttribute('y2', geometry.zeroY.toFixed(2));
  }

  wrap.classList.add('is-visible');
  wrap.classList.toggle('has-zero', role === 'grid');
}

function renderLoading() {
  HISTORY_KEYS.forEach(role => {
    const card = cardForRole(role);
    if (!card) return;
    ensureWatermark(card, role);
    if (!lastSnapshots.has(role)) card.dataset.historyState = 'loading';
  });
}

function removeLegacySparklineStorage() {
  if (typeof localStorage === 'undefined') return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in private or locked-down kiosk sessions.
    }
  }
}

/** Loads direct day histories and derives only cards without their own source. */
export async function refreshDeviceHistoryWatermarks({ force = false } = {}) {
  const now = Date.now();
  if (!force && lastRefreshAt && now - lastRefreshAt < HISTORY_CACHE_TTL) {
    return lastSnapshots;
  }
  if (refreshPromise) return refreshPromise;

  renderLoading();
  refreshPromise = (async () => {
    let ids;
    if (hasPlaywrightHistory()) {
      ids = Object.fromEntries(Object.values(DEVICE_KEYS).map(key => [key, 'mock']));
    } else {
      try {
        ids = await ensureDeviceIds();
      } catch {
        HISTORY_KEYS.forEach(role => renderRole(role, { state: 'error', points: [] }));
        return lastSnapshots;
      }
    }

    const direct = new Map();
    await Promise.all(HISTORY_KEYS.map(async role => {
      const idx = ids[DEVICE_KEYS[role]];
      const snapshot = await fetchRoleHistory(idx, role);
      if (snapshot) direct.set(role, snapshot);
    }));

    const snapshots = new Map();
    direct.forEach((snapshot, role) => {
      snapshots.set(role, { ...snapshot, loadedAt: now });
    });

    const grid = snapshots.get('grid')?.points || [];
    const solar = snapshots.get('solar')?.points || [];
    let house = snapshots.get('house')?.points || [];

    if (!house.length) {
      house = deriveHouseHistory(grid, solar);
      if (house.length >= 2) {
        snapshots.set('house', {
          points: house,
          source: 'derived',
          loadedAt: now,
        });
      }
    }

    const derivedKpis = deriveKpiHistories(house, solar);
    if (!snapshots.has('selfSuff') && derivedKpis.selfSuff.length >= 2) {
      snapshots.set('selfSuff', {
        points: derivedKpis.selfSuff,
        source: 'derived',
        loadedAt: now,
      });
    }
    if (!snapshots.has('selfCons') && derivedKpis.selfCons.length >= 2) {
      snapshots.set('selfCons', {
        points: derivedKpis.selfCons,
        source: 'derived',
        loadedAt: now,
      });
    }

    HISTORY_KEYS.forEach(role => {
      const configured = validIdx(ids[DEVICE_KEYS[role]]);
      const snapshot = snapshots.get(role) || {
        state: configured ? 'empty' : 'unavailable',
        points: [],
      };
      lastSnapshots.set(role, snapshot);
      renderRole(role, snapshot);
    });

    lastRefreshAt = now;
    return lastSnapshots;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/** Initialises the card watermarks and their deliberately slow refresh timer. */
export function initDeviceHistoryWatermarks() {
  if (typeof document === 'undefined') return;
  removeLegacySparklineStorage();
  HISTORY_KEYS.forEach(role => {
    const card = cardForRole(role);
    if (card) ensureWatermark(card, role);
  });
  refreshDeviceHistoryWatermarks();
  if (refreshTimer === null) {
    refreshTimer = window.setInterval(
      () => refreshDeviceHistoryWatermarks({ force: true }),
      HISTORY_REFRESH_MS,
    );
  }
}

/** Rebuilds translated descriptions without requesting the histories again. */
export function retranslateDeviceHistoryWatermarks() {
  HISTORY_KEYS.forEach(role => {
    renderRole(role, lastSnapshots.get(role) || { state: 'empty', points: [] });
  });
}

/** Stops the history refresh timer while hidden or before the page unloads. */
export function destroyDeviceHistoryWatermarks() {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
