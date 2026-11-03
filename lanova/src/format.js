export const esc = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(value) : 'Undefined';
export const pct = value => Number.isFinite(value) ? (value * 100).toFixed(1) + ' %' : 'Undefined';
export const multiple = value => Number.isFinite(value) ? value.toFixed(2) + '×' : 'Undefined';
export function csv(rows) {
  // CSV quoting alone does not prevent spreadsheet formula execution.
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
export function parseDatedFlows(text) {
  if (typeof text !== 'string' || text.length > 20000) throw Error('Dated cash-flow input too large');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > 100) throw Error('Enter between 2 and 100 cash flows');
  const dates = [], flows = [];
  for (const line of lines) {
    const parts = line.split(';').map(x => x.trim());
    if (parts.length !== 2 || !/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(parts[1])) throw Error('Required format: YYYY-MM-DD ; amount (no thousands separators)');
    const amount = Number(parts[1].replace(',', '.'));
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e12) throw Error('Invalid dated amount');
    dates.push(parts[0]); flows.push(amount);
  }
  return {dates, flows};
}

