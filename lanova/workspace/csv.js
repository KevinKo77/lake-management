/**
 * CSV cell encoding for exports (RFC 4180 quoting + spreadsheet formula neutralisation).
 *
 * Numbers are written as plain numeric cells, so negative cash flows stay numeric.
 * Text is always quoted. Text that a spreadsheet could read as a formula gets a leading apostrophe:
 *   - control characters (tab, CR, LF, …) are first replaced by spaces;
 *   - then text starting with = + - @ (or their full-width forms), possibly after spaces, gets a leading apostrophe;
 *   - the same initiators right after a separator (, ; |) are neutralised too, in case a consumer splits the field differently. See https://owasp.org/www-community/attacks/CSV_Injection.
 * No single strategy covers every spreadsheet or downstream consumer.
 */
const INITIATOR = '=+\\-@\\uFF1D\\uFF0B\\uFF0D\\uFF20';
const LEADING = new RegExp(`^\\s*[${INITIATOR}]`);
const AFTER_SEPARATOR = new RegExp(`([,;|]\\s*)(?=[${INITIATOR}])`, 'g');

export function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '';
  if (value === null || value === undefined) return '';
  let s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' '); // tab, CR, LF and other controls become spaces first
  if (LEADING.test(s)) s = `'${s}`;
  s = s.replace(AFTER_SEPARATOR, "$1'");
  return `"${s.replace(/"/g, '""')}"`;
}

export const csvRow = cells => cells.map(csvCell).join(',');
