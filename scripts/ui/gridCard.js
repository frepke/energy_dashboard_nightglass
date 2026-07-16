/**
 * Grid card breakdown rendering.
 * Renders the import/export daily totals in #gridToday with
 * conditional separator so orphan separators never appear.
 */

import { isNum, fmt } from '../core/formatters.js';

function ensureGridTodaySpan(el, key, className) {
  let node = el.querySelector(`[data-part="${key}"]`);
  if (!node) {
    node = document.createElement('span');
    node.dataset.part = key;
    if (className) node.className = className;
    el.appendChild(node);
  }
  return node;
}

/**
 * Renders the import/export breakdown inside the given element.
 * - Both values present  → "↓ x kWh · ↑ y kWh"
 * - Only one value       → that value without separator
 * - Neither value        → "--" plain text fallback
 *
 * Clears any stale placeholder text (e.g. the initial "--" text node)
 * before the first span is appended, so no orphan dashes appear.
 */
export function renderGridTodayBreakdown(el, importToday, exportToday) {
  if (!el) return;
  const hasImport = isNum(importToday) && importToday > 0;
  const hasExport = isNum(exportToday) && exportToday > 0;

  if (!hasImport && !hasExport) {
    el.textContent = '--';
    return;
  }

  // Clear placeholder text before first span is inserted
  if (!el.querySelector('[data-part="import"]')) {
    el.textContent = '';
  }

  const importNode = ensureGridTodaySpan(el, 'import', 'orange');
  const sepNode    = ensureGridTodaySpan(el, 'separator');
  const exportNode = ensureGridTodaySpan(el, 'export', 'green');

  importNode.textContent = hasImport ? `↓ ${fmt.kwh(importToday)}` : '';
  sepNode.textContent    = (hasImport && hasExport) ? ' · ' : '';
  exportNode.textContent = hasExport  ? `↑ ${fmt.kwh(exportToday)}` : '';
}
