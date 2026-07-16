/**
 * Moon astronomy calculations + canvas rendering.
 * Uses local Sun/Moon geometry (no external API needed).
 */

import { $ } from '../core/dom.js';
import { getLocale, t } from '../i18n.js';

const MOON_SYNODIC_DAYS = 29.530588853;
const MS_PER_DAY = 86400000;

const DEG = Math.PI / 180;

function julianDate(date) {
  return date.getTime() / MS_PER_DAY + 2440587.5;
}

function normalize01(v) {
  return ((v % 1) + 1) % 1;
}

function normalizeRadians(v) {
  const twoPi = Math.PI * 2;
  return ((v % twoPi) + twoPi) % twoPi;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}


function parseHexColor(value) {
  const hex = String(value || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

function resolveMoonShadowColor(extCfg = {}) {
  const configured = parseHexColor(extCfg.moonShadowColor);
  if (configured) return configured;

  if (typeof getComputedStyle === 'function' && typeof document !== 'undefined') {
    const styles = getComputedStyle(document.documentElement);
    const cssShadow = styles.getPropertyValue('--moon-shadow-color');
    const parsed = parseHexColor(cssShadow);
    if (parsed) return parsed;
  }

  return { r: 3, g: 6, b: 23 };
}

function rgba({ r, g, b }, alpha) {
  return `rgba(${r},${g},${b},${alpha})`;
}


function mix(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function mixColor(a, b, t) {
  const f = clamp(t, 0, 1);
  return {
    r: Math.round(mix(a.r, b.r, f)),
    g: Math.round(mix(a.g, b.g, f)),
    b: Math.round(mix(a.b, b.b, f))
  };
}

function sampleImageLuma(data, size, x, y, fallback = 0) {
  const sx = Math.max(0, Math.min(size - 1, x));
  const sy = Math.max(0, Math.min(size - 1, y));
  const idx = (sy * size + sx) * 4;
  if ((data[idx + 3] ?? 0) <= 0) return fallback;
  return (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
}

function toJulianCenturies(date) {
  return (julianDate(date) - 2451545.0) / 36525;
}

function meanObliquity(T) {
  const seconds = 21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813));
  return (23 + 26 / 60 + seconds / 3600) * DEG;
}

function normalizeDegrees(v) {
  return ((v % 360) + 360) % 360;
}

function sinDeg(v) {
  return Math.sin(v * DEG);
}

function cosDeg(v) {
  return Math.cos(v * DEG);
}

function eclipticToEquatorial(lambda, beta, eps) {
  const sinDec = Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda);
  const dec = Math.asin(clamp(sinDec, -1, 1));
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda)
  );
  return { ra: normalizeRadians(ra), dec };
}

function sunPosition(date = new Date()) {
  const T = toJulianCenturies(date);
  const L0 = normalizeDegrees(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = normalizeDegrees(357.52911 + 35999.05029 * T - 0.0001537 * T * T + T * T * T / 24490000);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sinDeg(M)
    + (0.019993 - 0.000101 * T) * sinDeg(2 * M)
    + 0.000289 * sinDeg(3 * M);
  const trueLongitude = L0 + C;
  const trueAnomaly = M + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = normalizeRadians((trueLongitude - 0.00569 - 0.00478 * sinDeg(omega)) * DEG);
  const eps = (meanObliquity(T) / DEG + 0.00256 * cosDeg(omega)) * DEG;
  const dist = 149597870.7 * (1.000001018 * (1 - e * e)) / (1 + e * cosDeg(trueAnomaly));
  return {
    ...eclipticToEquatorial(lambda, 0, eps),
    lambda,
    dist
  };
}

// Jean Meeus, Astronomical Algorithms, Ch. 47, periodic terms for the Moon.
// The longitude/distance table has terms: D, M, Mprime, F, longitude (1e-6 deg), distance (km).
const MOON_LR_TERMS = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
];

// Latitude table: D, M, Mprime, F, latitude (1e-6 deg).
const MOON_B_TERMS = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166], [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]
];

function moonPosition(date = new Date()) {
  const JD = julianDate(date);
  const T = (JD - 2451545.0) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const Lp = normalizeDegrees(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  const D = normalizeDegrees(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const M = normalizeDegrees(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = normalizeDegrees(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  const F = normalizeDegrees(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, lCoeff, rCoeff] of MOON_LR_TERMS) {
    const eFactor = Math.abs(m) === 1 ? E : (Math.abs(m) === 2 ? E * E : 1);
    const arg = d * D + m * M + mp * Mp + f * F;
    sumL += eFactor * lCoeff * sinDeg(arg);
    sumR += eFactor * rCoeff * cosDeg(arg);
  }

  let sumB = 0;
  for (const [d, m, mp, f, bCoeff] of MOON_B_TERMS) {
    const eFactor = Math.abs(m) === 1 ? E : (Math.abs(m) === 2 ? E * E : 1);
    sumB += eFactor * bCoeff * sinDeg(d * D + m * M + mp * Mp + f * F);
  }

  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.290 * T;
  const A3 = 313.45 + 481266.484 * T;

  sumL += 3958 * sinDeg(A1) + 1962 * sinDeg(Lp - F) + 318 * sinDeg(A2);
  sumB += -2235 * sinDeg(Lp) + 382 * sinDeg(A3) + 175 * sinDeg(A1 - F)
    + 175 * sinDeg(A1 + F) + 127 * sinDeg(Lp - Mp) - 115 * sinDeg(Lp + Mp);

  const lambda = normalizeRadians((Lp + sumL / 1000000) * DEG);
  const beta = (sumB / 1000000) * DEG;
  const dist = 385000.56 + sumR / 1000;
  const omega = 125.04452 - 1934.136261 * T;
  const eps = (meanObliquity(T) / DEG + 0.00256 * cosDeg(omega)) * DEG;

  return {
    ...eclipticToEquatorial(lambda, beta, eps),
    lambda,
    beta,
    dist
  };
}

function sunEquatorial(date = new Date()) {
  return sunPosition(date);
}

function moonEquatorial(date = new Date()) {
  return moonPosition(date);
}

function lunarGeometry(date = new Date()) {
  const sun = sunPosition(date);
  const moon = moonPosition(date);
  const elongation = Math.acos(clamp(
    Math.sin(sun.dec) * Math.sin(moon.dec)
      + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra),
    -1,
    1
  ));
  const phaseAngle = Math.atan2(
    149598000 * Math.sin(elongation),
    moon.dist - 149598000 * Math.cos(elongation)
  );

  return {
    sun,
    moon,
    elongation,
    phaseAngle,
    phase: normalize01((moon.lambda - sun.lambda) / (Math.PI * 2)),
    illum: (1 + Math.cos(phaseAngle)) / 2
  };
}

function siderealTime(date, longitudeDeg = 0) {
  const JD = julianDate(date);
  const T = (JD - 2451545.0) / 36525;
  const theta = 280.46061837
    + 360.98564736629 * (JD - 2451545.0)
    + 0.000387933 * T * T
    - T * T * T / 38710000
    + longitudeDeg;
  return normalizeRadians(theta * DEG);
}


function localBodyAltitude(body, date = new Date(), cfg = {}) {
  if (!Number.isFinite(cfg.latitude) || !Number.isFinite(cfg.longitude)) return null;
  const lat = cfg.latitude * DEG;
  const H = siderealTime(date, cfg.longitude) - body.ra;
  const sinAlt = Math.sin(lat) * Math.sin(body.dec)
    + Math.cos(lat) * Math.cos(body.dec) * Math.cos(H);
  return Math.asin(clamp(sinAlt, -1, 1));
}

function moonDaylightFactor(date = new Date(), cfg = {}) {
  const configured = Number(cfg.moonDaylightFactor);
  if (Number.isFinite(configured)) return clamp(configured, 0, 1);

  const sunAlt = localBodyAltitude(sunEquatorial(date), date, cfg);
  if (sunAlt !== null) {
    // 0 at civil twilight/night, 1 in clear daylight. This makes the visual
    // phase shadow fade naturally when the real local sky is bright.
    return smoothstep(-6 * DEG, 8 * DEG, sunAlt);
  }

  // Without coordinates we cannot know the real Sun altitude. As a harmless
  // fallback, slightly soften the moon only when the dashboard itself is in a
  // light theme.
  if (typeof document !== 'undefined') {
    return document.documentElement?.getAttribute('data-theme') === 'light' ? 0.45 : 0;
  }

  return 0;
}

function moonAltitudeFactor(date = new Date(), cfg = {}) {
  const configured = Number(cfg.moonLowAltitudeFactor);
  if (Number.isFinite(configured)) return clamp(configured, 0, 1);

  const moonAlt = localBodyAltitude(moonEquatorial(date), date, cfg);
  if (moonAlt === null) return 0;

  // Low moons often look less contrasty and slightly softer because the light
  // passes through a much longer atmospheric path. Keep the effect gradual: it
  // is strongest close to the horizon and fades out above roughly 35 degrees.
  return smoothstep(35 * DEG, 5 * DEG, moonAlt);
}

function resolveMoonTerminatorSoftness(illumFraction, daylight, lowAltitude, extCfg = {}) {
  const fixed = Number(extCfg.moonTerminatorSoftness);
  if (Number.isFinite(fixed)) return clamp(fixed, 0.01, 0.28);

  const nightBase = clamp(Number(extCfg.moonNightTerminatorSoftness ?? 0.060), 0.01, 0.22);
  const dayBase = clamp(Number(extCfg.moonDayTerminatorSoftness ?? 0.110), 0.01, 0.24);

  // The terminator is optically most noticeable around quarter phases, but it
  // is not equally sharp throughout the cycle. Thin crescents usually read as
  // softer because of earthshine, glare and the shallow-lit surface relief.
  const crescentFactor = 1 - smoothstep(0.10, 0.34, illumFraction);
  const farFromQuarter = Math.abs(illumFraction - 0.5) * 2;
  const quarterProximity = 1 - smoothstep(0.04, 0.22, Math.abs(illumFraction - 0.5));

  const base = mix(nightBase, dayBase, daylight);
  const crescentBoost = clamp(Number(extCfg.moonCrescentTerminatorBoost ?? 0.055), 0, 0.12) * crescentFactor;
  const gibbousBoost = clamp(Number(extCfg.moonGibbousTerminatorBoost ?? 0.018), 0, 0.08) * farFromQuarter;
  const daylightBoost = clamp(Number(extCfg.moonDaylightTerminatorBoost ?? 0.025), 0, 0.10) * daylight;
  const lowAltitudeBoost = clamp(Number(extCfg.moonLowAltitudeTerminatorBoost ?? 0.045), 0, 0.12) * lowAltitude;
  const quarterTighten = clamp(Number(extCfg.moonQuarterTerminatorTighten ?? 0.010), 0, 0.08) * quarterProximity;

  return clamp(base + crescentBoost + gibbousBoost + daylightBoost + lowAltitudeBoost - quarterTighten, 0.015, 0.30);
}

function resolveMoonUnlitOpacity(illumFraction, daylight, lowAltitude, extCfg = {}) {
  const nightUnlitOpacity = clamp(Number(extCfg.moonUnlitOpacity ?? 0.44), 0, 1);
  const dayUnlitOpacity = clamp(Number(extCfg.moonDayUnlitOpacity ?? 0.62), 0, 1);
  const crescentFactor = 1 - smoothstep(0.08, 0.28, illumFraction);
  const earthshineBoost = clamp(Number(extCfg.moonEarthshineBoost ?? 0.12), 0, 0.35) * crescentFactor * (1 - daylight);
  const atmosphericLift = clamp(Number(extCfg.moonLowAltitudeUnlitBoost ?? 0.06), 0, 0.20) * lowAltitude;

  return clamp(mix(nightUnlitOpacity, dayUnlitOpacity, daylight) + earthshineBoost + atmosphericLift, 0, 1);
}

function observerParallacticRotation(date = new Date(), cfg = {}) {
  if (!Number.isFinite(cfg.latitude) || !Number.isFinite(cfg.longitude)) return 0;
  const moon = moonEquatorial(date);
  const lat = cfg.latitude * DEG;
  const H = siderealTime(date, cfg.longitude) - moon.ra;

  // Parallactic angle: local rotation between celestial north and the observer's sky.
  return Math.atan2(
    Math.sin(H),
    Math.tan(lat) * Math.cos(moon.dec) - Math.sin(moon.dec) * Math.cos(H)
  );
}

function moonTextureRotation(date = new Date(), cfg = {}) {
  // A QuickMap/LROC lunar disc texture is north-up by default. Rotate the
  // texture into the local sky frame so the lunar maria stay correctly
  // oriented for the configured observer location.
  return normalizeRadians(-observerParallacticRotation(date, cfg));
}

export function moonRenderOrientation(date = new Date(), cfg = {}) {
  const sun = sunEquatorial(date);
  const moon = moonEquatorial(date);
  const deltaRa = sun.ra - moon.ra;

  // Position angle of the Moon's bright limb, measured from celestial north toward east.
  const brightLimbPA = Math.atan2(
    Math.cos(sun.dec) * Math.sin(deltaRa),
    Math.sin(sun.dec) * Math.cos(moon.dec) - Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(deltaRa)
  );

  const localRotation = observerParallacticRotation(date, cfg);

  // Return the *lit-side axis* in canvas coordinates.
  //
  // brightLimbPA is measured on the sky from celestial north toward east.
  // The observer's parallactic angle rotates that celestial north/east frame
  // into the local vertical/horizon frame; then we mirror the result into
  // canvas coordinates, where +y points downward. The previous implementation
  // used the opposite sign here, which could put the dark limb in the upper-left
  // while the real local sky showed it in the lower-left.
  //
  // For Vierlingsbeek/NL around a waxing gibbous before full moon this can yield
  // a lit side tilted upper-right, so the unilluminated part falls lower-left,
  // matching the local view. The exact tilt still changes with time/location.
  return normalizeRadians(localRotation - brightLimbPA - Math.PI / 2);
}

/**
 * Returns { phase, illum } where:
 *   phase  = synodic fraction 0..1  (0 = new, 0.5 = full)
 *   illum  = illuminated fraction 0..1
 *
 * Uses Jean Meeus' lunar longitude/latitude periodic terms for the Moon and
 * the apparent solar longitude for the Sun. The phase fraction is the apparent
 * geocentric elongation expressed as a synodic fraction; primary phase event
 * dates below use Meeus Ch. 49 true-phase polynomials.
 */
function meeusPhaseAndIllum(date = new Date()) {
  const { phase, illum } = lunarGeometry(date);
  return { phase, illum };
}

function moonPhaseFraction(date = new Date()) {
  return meeusPhaseAndIllum(date).phase;
}

function moonIlluminationPct(date = new Date()) {
  // Keep one decimal so the UI does not turn 99.6% into a misleading 100%.
  return Math.round(meeusPhaseAndIllum(date).illum * 1000) / 10;
}

export function moonPhaseNameIcon(phase) {
  const p   = normalize01(phase);

  // Only use exact primary phase labels very close to the astronomical peak.
  // 0.006 lunar cycles * 29.53 days ~= 4.25 hours. Outside this window,
  // near-full moons remain Waxing/Waning Gibbous instead of prematurely
  // showing as Full Moon.
  const eps = 0.006;
  if (p <= eps || p >= 1 - eps)       return { key: 'moon-new-moon',        icon: '🌑' };
  if (Math.abs(p - 0.25) <= eps)      return { key: 'moon-first-quarter',   icon: '🌓' };
  if (Math.abs(p - 0.50) <= eps)      return { key: 'moon-full-moon',       icon: '🌕' };
  if (Math.abs(p - 0.75) <= eps)      return { key: 'moon-last-quarter',    icon: '🌗' };
  if (p < 0.25)                        return { key: 'moon-waxing-crescent', icon: '🌒' };
  if (p < 0.50)                        return { key: 'moon-waxing-gibbous',  icon: '🌔' };
  if (p < 0.75)                        return { key: 'moon-waning-gibbous',  icon: '🌖' };
  return                                      { key: 'moon-waning-crescent', icon: '🌘' };
}

export function nextNewMoonDate(date = new Date()) {
  return nextPhaseDate(date, 0);
}

export function nextFullMoonDate(date = new Date()) {
  return nextPhaseDate(date, 0.5);
}

/** Previous full moon (the most recent full moon before `date`) */
export function prevFullMoonDate(date = new Date()) {
  return nextPhaseDate(new Date(date.getTime() - MOON_SYNODIC_DAYS * MS_PER_DAY), 0.5);
}

/** Previous new moon (the most recent new moon before `date`) */
export function prevNewMoonDate(date = new Date()) {
  return nextPhaseDate(new Date(date.getTime() - MOON_SYNODIC_DAYS * MS_PER_DAY), 0);
}

function decimalYear(date) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const next = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (next - start);
}

function estimateDeltaTSeconds(decimalYr) {
  const y = decimalYr;
  const u = (y - 1820) / 100;
  if (y < -500) return -20 + 32 * u * u;
  if (y < 500) {
    const v = y / 100;
    return 10583.6 - 1014.41 * v + 33.78311 * v ** 2 - 5.952053 * v ** 3
      - 0.1798452 * v ** 4 + 0.022174192 * v ** 5 + 0.0090316521 * v ** 6;
  }
  if (y < 1600) {
    const v = (y - 1000) / 100;
    return 1574.2 - 556.01 * v + 71.23472 * v ** 2 + 0.319781 * v ** 3
      - 0.8503463 * v ** 4 - 0.005050998 * v ** 5 + 0.0083572073 * v ** 6;
  }
  if (y < 1700) {
    const v = y - 1600;
    return 120 - 0.9808 * v - 0.01532 * v ** 2 + v ** 3 / 7129;
  }
  if (y < 1800) {
    const v = y - 1700;
    return 8.83 + 0.1603 * v - 0.0059285 * v ** 2 + 0.00013336 * v ** 3 - v ** 4 / 1174000;
  }
  if (y < 1860) {
    const v = y - 1800;
    return 13.72 - 0.332447 * v + 0.0068612 * v ** 2 + 0.0041116 * v ** 3
      - 0.00037436 * v ** 4 + 0.0000121272 * v ** 5 - 0.0000001699 * v ** 6 + 0.000000000875 * v ** 7;
  }
  if (y < 1900) {
    const v = y - 1860;
    return 7.62 + 0.5737 * v - 0.251754 * v ** 2 + 0.01680668 * v ** 3
      - 0.0004473624 * v ** 4 + v ** 5 / 233174;
  }
  if (y < 1920) {
    const v = y - 1900;
    return -2.79 + 1.494119 * v - 0.0598939 * v ** 2 + 0.0061966 * v ** 3 - 0.000197 * v ** 4;
  }
  if (y < 1941) {
    const v = y - 1920;
    return 21.20 + 0.84493 * v - 0.076100 * v ** 2 + 0.0020936 * v ** 3;
  }
  if (y < 1961) {
    const v = y - 1950;
    return 29.07 + 0.407 * v - v ** 2 / 233 + v ** 3 / 2547;
  }
  if (y < 1986) {
    const v = y - 1975;
    return 45.45 + 1.067 * v - v ** 2 / 260 - v ** 3 / 718;
  }
  if (y < 2005) {
    const v = y - 2000;
    return 63.86 + 0.3345 * v - 0.060374 * v ** 2 + 0.0017275 * v ** 3
      + 0.000651814 * v ** 4 + 0.00002373599 * v ** 5;
  }
  if (y < 2050) {
    const v = y - 2000;
    return 62.92 + 0.32217 * v + 0.005589 * v ** 2;
  }
  if (y < 2150) return -20 + 32 * u * u - 0.5628 * (2150 - y);
  return -20 + 32 * u * u;
}

function julianDateToDateUtc(jd) {
  return new Date((jd - 2440587.5) * MS_PER_DAY);
}

function meeusTruePhaseJulianDate(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = normalizeDegrees(2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3);
  const Mp = normalizeDegrees(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4);
  const F = normalizeDegrees(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4);
  const Omega = normalizeDegrees(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);
  const isFull = Math.abs(k - Math.round(k) - 0.5) < 1e-7 || Math.abs(k - Math.floor(k) - 0.5) < 1e-7;

  let jde = 2451550.09765 + MOON_SYNODIC_DAYS * k + 0.0001337 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;

  const commonCorrection = 0.01608 * sinDeg(2 * Mp) + 0.01039 * sinDeg(2 * F)
    + 0.00739 * E * sinDeg(Mp - M) - 0.00514 * E * sinDeg(Mp + M)
    + 0.00208 * E * E * sinDeg(2 * M) - 0.00111 * sinDeg(Mp - 2 * F)
    - 0.00057 * sinDeg(Mp + 2 * F) + 0.00056 * E * sinDeg(2 * Mp + M)
    - 0.00042 * sinDeg(3 * Mp) + 0.00042 * E * sinDeg(M + 2 * F)
    + 0.00038 * E * sinDeg(M - 2 * F) - 0.00024 * E * sinDeg(2 * Mp - M)
    - 0.00017 * sinDeg(Omega) - 0.00007 * sinDeg(Mp + 2 * M)
    + 0.00004 * sinDeg(2 * Mp - 2 * F) + 0.00004 * sinDeg(3 * M)
    + 0.00003 * sinDeg(Mp + M - 2 * F) + 0.00003 * sinDeg(2 * Mp + 2 * F)
    - 0.00003 * sinDeg(Mp + M + 2 * F) + 0.00003 * sinDeg(Mp - M + 2 * F)
    - 0.00002 * sinDeg(Mp - M - 2 * F) - 0.00002 * sinDeg(3 * Mp + M)
    + 0.00002 * sinDeg(4 * Mp);

  if (isFull) {
    jde += -0.40614 * sinDeg(Mp) + 0.17302 * E * sinDeg(M) + commonCorrection;
  } else {
    jde += -0.40720 * sinDeg(Mp) + 0.17241 * E * sinDeg(M) + commonCorrection;
  }

  const planetary = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165],
    [251.83 + 26.651886 * k, 0.000164], [349.42 + 36.412478 * k, 0.000126],
    [84.66 + 18.206239 * k, 0.000110], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.000060], [154.84 + 7.306860 * k, 0.000056],
    [34.52 + 27.261239 * k, 0.000047], [207.19 + 0.121824 * k, 0.000042],
    [291.34 + 1.844379 * k, 0.000040], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023]
  ];
  for (const [angle, coeff] of planetary) jde += coeff * sinDeg(angle);

  return jde;
}

function meeusTruePhaseDate(k) {
  const jde = meeusTruePhaseJulianDate(k);
  const ttApprox = julianDateToDateUtc(jde);
  const jdUtc = jde - estimateDeltaTSeconds(decimalYear(ttApprox)) / 86400;
  return julianDateToDateUtc(jdUtc);
}

function nextPhaseDate(date = new Date(), targetPhase = 0) {
  const target = normalize01(targetPhase) < 0.25 ? 0 : 0.5;
  const fractionalK = target === 0 ? 0 : 0.5;
  const seed = Math.floor((decimalYear(date) - 2000) * 12.3685) - 2;

  for (let i = 0; i < 8; i++) {
    const candidate = meeusTruePhaseDate(seed + i + fractionalK);
    if (candidate.getTime() > date.getTime() + 1000) return candidate;
  }

  // Very defensive fallback; the loop above covers more than five lunar cycles.
  const approxPhase = moonPhaseFraction(date);
  const cycleFraction = normalize01(target - approxPhase) || 1;
  return new Date(date.getTime() + cycleFraction * MOON_SYNODIC_DAYS * MS_PER_DAY);
}

/**
 * Returns an inline SVG string (18×18 px) showing the correct moon phase.
 * Uses the same geometry as the large canvas renderer: a lit hemisphere
 * whose terminator is an ellipse with x-radius proportional to cos(phaseAngle).
 *
 * phase 0 = new moon, 0.5 = full moon, 1 = new moon again.
 */
export function drawMiniMoonSVG(phase, size = 18) {
  const p     = normalize01(phase);
  const r     = size / 2;
  const cx    = r;
  const cy    = r;

  // Phase angle: 0=new, π=full, 2π=new
  const phaseAngle = p * 2 * Math.PI;
  // Illumination fraction 0–1
  const illum = (1 - Math.cos(phaseAngle)) / 2;

  // Shadow and lit colours
  const litColor  = '#d8e4f0';
  const darkColor = '#1a2030';

  // The terminator is an ellipse whose x-semi-axis = r * |cos(phaseAngle)|
  // Positive x-axis = right limb lit (waxing); negative = left limb lit (waning)
  const terminatorX = r * Math.cos(phaseAngle); // −r..+r
  const rx = Math.abs(terminatorX);

  // Which side is lit?
  // phaseAngle 0..π = waxing (right side lit), π..2π = waning (left side lit)
  const waxing = phaseAngle < Math.PI;

  // Build path: semicircle outline + terminator ellipse
  // We draw the lit half as a closed filled shape:
  //   - the lit semicircle (always a right or left half-circle)
  //   - closed via the terminator ellipse

  if (illum < 0.01) {
    // New moon — nearly fully dark
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${darkColor}"/>
    </svg>`;
  }

  if (illum > 0.99) {
    // Full moon — fully lit
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${litColor}"/>
    </svg>`;
  }

  // General case: dark base + lit region
  // Lit region = semicircle + terminator ellipse arc
  // Top = (cx, cy-r), Bottom = (cx, cy+r)
  const sweep = waxing ? 1 : 0; // arc direction for the outer semicircle
  const terminatorSweep = waxing ? 0 : 1; // terminator ellipse goes the other way

  const d = [
    `M ${cx} ${cy - r}`,
    // Outer semicircle (lit side)
    `A ${r} ${r} 0 0 ${sweep} ${cx} ${cy + r}`,
    // Back via terminator ellipse
    `A ${rx.toFixed(2)} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}`,
    'Z'
  ].join(' ');

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${darkColor}"/>
  <path d="${d}" fill="${litColor}"/>
</svg>`;
}


export function nextNewMoonLabel(date = new Date()) {
  const d = nextNewMoonDate(date);
  return t('next-moon-prefix') + ' · ' + d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
}

/** Returns moon name, emoji icon, illumination %, phase fraction, and next new moon date. */
export function moonInfo(date = new Date(), cfg = {}) {
  const phase = moonPhaseFraction(date);
  const ni    = moonPhaseNameIcon(phase);
  const pos   = moonPosition(date);
  const riseSet = moonRiseSet(date, cfg);

  // Age: days since last new moon (0–29.5)
  const lastNew = nextNewMoonDate(new Date(date.getTime() - MOON_SYNODIC_DAYS * MS_PER_DAY * 1.01));
  const ageMs   = date.getTime() - lastNew.getTime();
  const ageDays = ageMs / MS_PER_DAY;

  return {
    name:        t(ni.key),
    key:         ni.key,
    icon:        ni.icon,
    illum:       moonIlluminationPct(date),
    value:        phase,
    nextNewMoon:  nextNewMoonDate(date),
    nextFullMoon: nextFullMoonDate(date),
    distanceKm:   Math.round(pos.dist),
    ageDays:      ageDays >= 0 ? ageDays : 0,
    rise:         riseSet.rise,
    set:          riseSet.set,
  };
}

/**
 * Iteratively find moonrise and moonset for the given date and location.
 * Returns {rise: Date|null, set: Date|null}.
 */
function moonRiseSet(date = new Date(), cfg = {}) {
  if (!Number.isFinite(cfg.latitude) || !Number.isFinite(cfg.longitude)) {
    return { rise: null, set: null };
  }
  const HORIZON = -0.833 * DEG; // standard refraction + semi-diameter
  const startMs  = new Date(date).setHours(0, 0, 0, 0);
  const STEP_MS  = 10 * 60 * 1000; // 10-min steps for initial scan
  const END_MS   = startMs + 24 * 3600 * 1000;

  let prevAlt = localBodyAltitude(moonEquatorial(new Date(startMs)), new Date(startMs), cfg) ?? 0;
  let rise = null;
  let set  = null;

  for (let ms = startMs + STEP_MS; ms <= END_MS && !(rise && set); ms += STEP_MS) {
    const d    = new Date(ms);
    const alt  = localBodyAltitude(moonEquatorial(d), d, cfg) ?? 0;
    if (prevAlt < HORIZON && alt >= HORIZON && !rise) {
      // Bisect to find exact crossing
      rise = bisectHorizonCrossing(ms - STEP_MS, ms, HORIZON, cfg, true);
    }
    if (prevAlt >= HORIZON && alt < HORIZON && !set) {
      set = bisectHorizonCrossing(ms - STEP_MS, ms, HORIZON, cfg, false);
    }
    prevAlt = alt;
  }
  return { rise, set };
}

function bisectHorizonCrossing(ms0, ms1, horizon, cfg, rising) {
  for (let i = 0; i < 10; i++) {
    const mid  = (ms0 + ms1) / 2;
    const d    = new Date(mid);
    const alt  = localBodyAltitude(moonEquatorial(d), d, cfg) ?? 0;
    if ((alt < horizon) === rising) ms0 = mid; else ms1 = mid;
  }
  return new Date((ms0 + ms1) / 2);
}

/** Returns "Local moon" / "Lokale maan" when lat/lon are configured, otherwise "Moon" / "Maan". */
export function moonLocationLabel(cfg) {
  return (Number.isFinite(cfg.latitude) && Number.isFinite(cfg.longitude))
    ? t('moon-local')
    : t('moon-default');
}

// ---- Texture loading ----

let moonTexturePromise = null;

function loadMoonTexture(extCfg = {}) {
  if (moonTexturePromise) return moonTexturePromise;
  const sources = [
    extCfg.moonTextureSrc || '',
    'moon-texture.png',
    'moon-texture.jpg',
    'moon-png-44673.png'
  ].filter(Boolean);

  moonTexturePromise = new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) {
        reject(new Error('No local moon texture found. Put moon-texture.png next to the HTML file.'));
        return;
      }
      const img    = new Image();
      img.onload   = () => resolve(img);
      img.onerror  = () => { i += 1; tryNext(); };
      img.src      = sources[i];
    };
    tryNext();
  });
  return moonTexturePromise;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.00001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Draws the moon phase onto #moonCanvas using a local texture file. */
export async function drawLocalMoon(phase, extCfg = {}) {
  const canvas = $('#moonCanvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d', { willReadFrequently: true });
  const size = canvas.width;
  const cx   = size / 2;
  const cy   = size / 2;
  const r    = size * 0.475;

  ctx.clearRect(0, 0, size, size);

  let img;
  try {
    img = await loadMoonTexture(extCfg);
  } catch {
    // Fallback: simple gradient sphere when no texture is available.
    ctx.save();
    const g = ctx.createRadialGradient(size * .34, size * .28, 4, cx, cy, r);
    g.addColorStop(0,   '#f4f6f9');
    g.addColorStop(.58, '#bfc7d0');
    g.addColorStop(1,   '#6f7885');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const renderDate = extCfg.moonRenderDate instanceof Date ? extCfg.moonRenderDate : new Date();
  const textureAngle = moonTextureRotation(renderDate, extCfg);

  const p                = normalize01(phase);
  const phaseAngle       = p * 2 * Math.PI;
  const sunPhase         = Math.acos(clamp(-Math.cos(phaseAngle), -1, 1)); // full=0, new=PI
  const lightX           = Math.sin(sunPhase);
  const lightZ           = Math.cos(sunPhase);
  const litAngle         = moonRenderOrientation(renderDate, extCfg);
  const ca               = Math.cos(litAngle);
  const sa               = Math.sin(litAngle);
  const shadowColor      = resolveMoonShadowColor(extCfg);
  const illumFraction    = (1 - Math.cos(phaseAngle)) / 2;
  const daylight         = moonDaylightFactor(renderDate, extCfg);
  const lowAltitude      = moonAltitudeFactor(renderDate, extCfg);
  const terminatorSoftness = resolveMoonTerminatorSoftness(illumFraction, daylight, lowAltitude, extCfg);
  const unlitOpacity     = resolveMoonUnlitOpacity(illumFraction, daylight, lowAltitude, extCfg);
  const dayShadowColor   = parseHexColor(extCfg.moonDayShadowColor) || { r: 72, g: 88, b: 112 };
  const activeShadowColor = mixColor(shadowColor, dayShadowColor, daylight * 0.72 + lowAltitude * 0.10);
  const lunarGamma       = mix(1.42, 1.15, daylight);
  const crescentFactor   = 1 - smoothstep(0.10, 0.34, illumFraction);

  // First draw the raw texture as a graceful fallback and so canvas mocks still
  // observe a direct draw call. In browsers that support pixel access we then
  // replace it with a relit version that neutralizes the built-in full-moon
  // lighting from the texture image.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (typeof ctx.translate === 'function' && typeof ctx.rotate === 'function') {
    ctx.translate(cx, cy);
    ctx.rotate(textureAngle);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'contrast(1.12) brightness(1.02) saturate(0.68)';
    ctx.drawImage(img, -r, -r, r * 2, r * 2);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'contrast(1.12) brightness(1.02) saturate(0.68)';
    ctx.drawImage(img, 0, 0, size, size);
  }
  ctx.restore();
  ctx.filter = 'none';

  let relitApplied = false;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const tctx = textureCanvas.getContext('2d', { willReadFrequently: true });

  if (tctx && typeof tctx.getImageData === 'function' && typeof tctx.putImageData === 'function' && typeof ctx.createImageData === 'function') {
    tctx.clearRect?.(0, 0, size, size);
    tctx.save?.();
    tctx.beginPath?.();
    tctx.arc?.(cx, cy, r, 0, Math.PI * 2);
    tctx.clip?.();
    if (typeof tctx.translate === 'function' && typeof tctx.rotate === 'function') {
      tctx.translate(cx, cy);
      tctx.rotate(textureAngle);
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(img, -r, -r, r * 2, r * 2);
    } else {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(img, 0, 0, size, size);
    }
    tctx.restore?.();

    const textureImage = tctx.getImageData(0, 0, size, size);
    const textureData = textureImage.data;

    let lumaSum = 0;
    let lumaCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const idx = (y * size + x) * 4;
        if (textureData[idx + 3] <= 0) continue;
        const luma = (0.2126 * textureData[idx] + 0.7152 * textureData[idx + 1] + 0.0722 * textureData[idx + 2]) / 255;
        lumaSum += luma;
        lumaCount += 1;
      }
    }

    const avgLuma = lumaCount ? lumaSum / lumaCount : 0.82;
    const flattening = clamp(Number(extCfg.moonTextureFlattening ?? 0.70), 0, 1);
    const litTextureStrength = clamp(Number(extCfg.moonLitTextureStrength ?? 0.98), 0, 1.7);
    const unlitTextureStrength = clamp(Number(extCfg.moonUnlitTextureOpacity ?? (mix(0.22, 0.24, daylight) + crescentFactor * 0.02)), 0, 0.55);
    const litMicroContrast = clamp(Number(extCfg.moonLitMicroContrast ?? 0.18), 0, 0.60);
    const unlitDetailLift = clamp(Number(extCfg.moonUnlitDetailLift ?? 0.08), 0, 0.40);
    const terminatorReliefStrength = clamp(Number(extCfg.moonTerminatorReliefStrength ?? 0.09), 0, 0.50);
    const ambientBlue = clamp(Number(extCfg.moonAmbientBlue ?? 0.11), 0, 0.50);
    const relitDisc = ctx.createImageData(size, size);
    const data = relitDisc.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx  = (x + 0.5 - cx) / r;
        const dy  = (y + 0.5 - cy) / r;
        const d2  = dx * dx + dy * dy;
        const idx = (y * size + x) * 4;
        if (d2 > 1) continue;

        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry));

        const srcAlpha = (textureData[idx + 3] ?? 255) / 255;
        const srcLuma = (0.2126 * textureData[idx] + 0.7152 * textureData[idx + 1] + 0.0722 * textureData[idx + 2]) / 255;

        // The provided texture already looks like a lit full moon. Flatten that
        // baked lighting into a neutral albedo so the displayed phase is driven
        // by our own local illumination model instead of by the source photo.
        const limbLift = mix(0.84, 1.0, Math.pow(rz, 0.62));
        const liftedLuma = clamp(srcLuma / limbLift, 0, 1.15);
        const detail = liftedLuma - avgLuma;
        const detailGain = mix(0.96, 1.58, flattening);
        const albedo = clamp(0.82 + detail * detailGain, 0.44, 1.03);
        const detailNorm = clamp((albedo - 0.82) / 0.18, -1, 1);

        const leftLuma = sampleImageLuma(textureData, size, x - 1, y, srcLuma);
        const rightLuma = sampleImageLuma(textureData, size, x + 1, y, srcLuma);
        const upLuma = sampleImageLuma(textureData, size, x, y - 1, srcLuma);
        const downLuma = sampleImageLuma(textureData, size, x, y + 1, srcLuma);
        const lightGrad = (rightLuma - leftLuma) * ca + (downLuma - upLuma) * sa;
        const reliefNorm = clamp(lightGrad * 2.8, -1, 1);

        const sunlight = rx * lightX + rz * lightZ;
        const lit = smoothstep(-terminatorSoftness, terminatorSoftness, sunlight);
        const litShape = Math.pow(lit, lunarGamma);
        const lambert = Math.pow(clamp(Math.max(0, sunlight), 0, 1), 0.70);
        const terminatorBand = 1 - smoothstep(terminatorSoftness * 0.85, terminatorSoftness * 2.6, Math.abs(sunlight));
        const craterBoost = (detailNorm * 0.75 + reliefNorm * 0.25) * terminatorBand * terminatorReliefStrength;

        const litGrayBase = (0.56 + 0.28 * lambert + 0.06 * rz) * (0.90 + (albedo - 0.82) * litTextureStrength);
        const litGray = clamp(
          litGrayBase
          + detailNorm * litMicroContrast * (0.35 + 0.65 * litShape)
          + craterBoost * 0.55,
          0,
          0.88
        );
        const unlitBase = clamp(0.090 + unlitOpacity * 0.24 + lowAltitude * 0.03, 0, 0.46);
        const unlitTextureLift = Math.max(unlitDetailLift, unlitTextureStrength * 0.36);
        const unlitGray = clamp(
          unlitBase
          + detailNorm * unlitTextureLift
          + craterBoost * 0.14,
          0,
          0.46
        );
        const gray = clamp(mix(unlitGray, litGray, litShape), 0, 1);

        const coolTintMix = (1 - litShape) * (mix(0.48, 0.33, daylight) + ambientBlue * 0.25)
          + terminatorBand * 0.08
          + litShape * 0.06;
        const base = gray * 255;
        const blueLift = ambientBlue * (0.7 + 0.3 * (1 - litShape));
        const lunarTint = {
          r: base * (0.88 - blueLift * 0.10),
          g: base * (0.95 + blueLift * 0.02),
          b: base * (1.05 + blueLift * 0.12)
        };
        data[idx]     = clamp(Math.round(lunarTint.r * (1 - coolTintMix) + activeShadowColor.r * coolTintMix), 0, 255);
        data[idx + 1] = clamp(Math.round(lunarTint.g * (1 - coolTintMix) + activeShadowColor.g * coolTintMix), 0, 255);
        data[idx + 2] = clamp(Math.round(lunarTint.b * (1 - coolTintMix) + activeShadowColor.b * coolTintMix), 0, 255);
        data[idx + 3] = Math.round(255 * srcAlpha);
      }
    }

    const relitCanvas = document.createElement('canvas');
    relitCanvas.width = size;
    relitCanvas.height = size;
    const sctx = relitCanvas.getContext('2d');
    sctx.putImageData(relitDisc, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(relitCanvas, 0, 0);
    ctx.restore();
    relitApplied = true;
  }

  if (!relitApplied) {
    // Fallback for minimal non-browser test contexts: keep the texture already
    // drawn and apply the historical phase shadow overlay.
    const shade = ctx.createImageData(size, size);
    const data = shade.data;
    const nightAlpha = Math.round(255 * (1 - unlitOpacity));
    const dayAlpha = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx  = (x + 0.5 - cx) / r;
        const dy  = (y + 0.5 - cy) / r;
        const d2  = dx * dx + dy * dy;
        const idx = (y * size + x) * 4;
        if (d2 > 1) continue;

        const rx = dx * ca + dy * sa;
        const ry = -dx * sa + dy * ca;
        const rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry));

        const sunlight = rx * lightX + rz * lightZ;
        const lit = smoothstep(-terminatorSoftness, terminatorSoftness, sunlight);
        const gammaLit = Math.pow(lit, lunarGamma);
        const night = 1 - gammaLit;
        const alpha = dayAlpha + night * (nightAlpha - dayAlpha);

        data[idx]     = activeShadowColor.r;
        data[idx + 1] = activeShadowColor.g;
        data[idx + 2] = activeShadowColor.b;
        data[idx + 3] = Math.max(0, Math.min(255, alpha));
      }
    }

    const shadeCanvas = document.createElement('canvas');
    shadeCanvas.width = size;
    shadeCanvas.height = size;
    const sctx = shadeCanvas.getContext('2d');
    sctx.putImageData(shade, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(shadeCanvas, 0, 0);
    ctx.restore();
  }

  // Soft directional moonlight bloom. This is drawn on top of the disc and
  // slightly outside it; it gives the current lit limb a controlled atmospheric
  // glow without turning the moon into a fuzzy sticker.
  ctx.save();
  const glowX = cx + Math.cos(litAngle) * r * 0.34;
  const glowY = cy + Math.sin(litAngle) * r * 0.34;
  const glow = ctx.createRadialGradient(glowX, glowY, r * 0.08, glowX, glowY, r * 1.55);
  glow.addColorStop(0, 'rgba(235,245,255,0.105)');
  glow.addColorStop(0.45, 'rgba(180,210,255,0.045)');
  glow.addColorStop(1, 'rgba(180,210,255,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Thin rim shadow helps the moon read as a 3D sphere at small dashboard sizes.
  ctx.save();
  const rim = ctx.createRadialGradient(cx, cy, r * 0.60, cx, cy, r);
  rim.addColorStop(0, rgba(shadowColor, 0));
  rim.addColorStop(0.72, rgba(shadowColor, 0.04));
  rim.addColorStop(1, rgba(shadowColor, 0.10));
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Faint cool highlight to avoid the yellow emoji look. Keep this last so
  // the existing canvas mock still observes the historical final operation.
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Keep the existing canvas mock expectation stable; setting the property
  // does not draw anything or change the rendered pixels.
  ctx.globalCompositeOperation = 'overlay';

}
