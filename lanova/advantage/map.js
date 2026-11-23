/**
 * LANOVA Advantage Lab — Resource Advantage Map, drawn as an SVG string from an evaluate() result (display only).
 * Shared by the Advantage Lab and the home page, so both always show the engine's own figures.
 */
import {OBJECTIVES, fmt} from './lab.js';

export const STATUS = {frontier: 'Efficient (not dominated)', dominated: 'Dominated', infeasible: 'Not feasible', 'not-comparable': 'Not comparable (estimate missing)'};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const short = n => (n.length > 22 ? `${n.slice(0, 21).trim()}…` : n);
/** Round axis ticks (1, 2 or 5 × a power of ten) covering [lo, hi]. */
export function nice(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(k => k * p).find(k => k >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v)); return out;
}
/** The map: x = total cost, y = contribution to the selected objective, size = drop in lowest cash, outline = risk view. */
export function mapSvg(r, m, {narrow = false, names = false} = {}) {
  const placedLabels = [], labelOk = (cx, cy) => { if (placedLabels.some(([x, y]) => Math.abs(x - cx) < 170 && Math.abs(y - cy) < 26)) return false; placedLabels.push([cx, cy]); return true; };

  const pts = r.options.map((o, i) => ({o, i, x: o.totals.totalCost, y: o.contribution}));
  const est = OBJECTIVES[m.objective].estimate, placed = pts.filter(p => p.y !== null), unplaced = pts.filter(p => p.y === null);
  const W = narrow ? 560 : 1000, H = narrow ? 620 : 480, L = narrow ? 112 : 96, R = 28, T = 24, B = unplaced.length ? (narrow ? 130 : 96) : 64;
  const xmax = Math.max(1, ...pts.map(p => p.x)) * 1.08;
  const ys = placed.map(p => p.y), ylo = est ? 0 : Math.min(0, ...ys) - (Math.max(0, ...ys) - Math.min(0, ...ys)) * 0.1, yhi0 = est ? 10 : Math.max(0, ...ys), yhi = yhi0 > ylo ? yhi0 + (est ? 0 : (yhi0 - ylo) * 0.08) : ylo + 1;
  const plotB = H - B, x = v => L + (v / xmax) * (W - L - R), y = v => T + (yhi - v) / (yhi - ylo) * (plotB - T);
  const imp = Math.max(1, ...pts.map(p => Math.abs(Math.min(0, p.o.cashImpactLowest)))), rad = p => 9 + 13 * Math.abs(Math.min(0, p.o.cashImpactLowest)) / imp;
  const ticksY = est ? [0, 2, 4, 6, 8, 10] : nice(ylo, yhi, narrow ? 4 : 5).filter(v => v >= ylo && v <= yhi);
  const ticksX = nice(0, xmax, narrow ? 3 : 5).filter(v => v <= xmax);
  const ax = v => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return a >= 1e6 ? `${sg}${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${sg}${+(a / 1e3).toFixed(0)}k` : `${sg}${a}`; };
  const dash = {low: '', medium: '6 4', high: ''}, sw = {low: 1.5, medium: 2, high: 4};
  const point = (p, cx, cy) => { const o = p.o, r0 = rad(p);
    const label = `Option ${p.i + 1}, ${o.name}: ${STATUS[o.status]}. Total cost ${fmt(o.totals.totalCost)} EUR. ${OBJECTIVES[m.objective].label}: ${o.contribution === null ? 'no estimate' : est ? `${o.contribution} out of 10 (your estimate)` : `${fmt(o.contribution)} EUR`}. Lowest cash with it ${fmt(o.minCashBase)} EUR. Risk: ${o.risk ?? 'no estimate'}. Effect after ${o.horizonMonths} months.`;
    return `<g class="pt ${o.status}" tabindex="0" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
      <circle cx="${cx}" cy="${cy}" r="${r0}" stroke-width="${o.risk ? sw[o.risk] : 1}" ${o.risk && dash[o.risk] ? `stroke-dasharray="${dash[o.risk]}"` : ''}/>
      ${o.status === 'infeasible' ? `<path class="x" d="M${cx - r0 * .55} ${cy - r0 * .55}L${cx + r0 * .55} ${cy + r0 * .55}M${cx + r0 * .55} ${cy - r0 * .55}L${cx - r0 * .55} ${cy + r0 * .55}"/>` : `<text class="n" x="${cx}" y="${cy + 4}" text-anchor="middle">${p.i + 1}</text>`}
      <text class="h" x="${cx + r0 + 4}" y="${cy - r0 + 2}">${o.horizonMonths}m</text>${names && labelOk(cx, cy) ? (cx > W * 0.72 ? `<text class="nm" x="${cx - r0 - 6}" y="${cy + 4}" text-anchor="end">${esc(short(o.name))}</text>` : `<text class="nm" x="${cx + r0 + 6}" y="${cy + 12}">${esc(short(o.name))}</text>`) : ''}</g>`; };
  return `<svg class="chart map" viewBox="0 0 ${W} ${H}" aria-label="Resource Advantage Map: ${pts.length} options; the same figures are in the table below">
    ${ticksY.map(v => `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${est ? v : ax(v)}</text>`).join('')}
    ${ticksX.map(v => `<text x="${x(v)}" y="${plotB + 18}" text-anchor="middle">${ax(v)}</text>`).join('')}
    ${!est && ylo < 0 ? `<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
    <text x="${(L + W - R) / 2}" y="${plotB + 38}" text-anchor="middle" class="axt">Total cost, all commitments (EUR) →</text>
    <text transform="translate(16 ${(T + plotB) / 2}) rotate(-90)" text-anchor="middle" class="axt">${esc(est ? 'Your estimate (0–10) →' : 'Net financial effect (EUR) →')}</text>
    ${unplaced.length ? `<text x="${L}" y="${H - (narrow ? 62 : 22)}" class="axt">No estimate for this objective:</text>${unplaced.map((p, k) => point(p, (narrow ? L + 20 : L + 250) + k * 60, H - (narrow ? 24 : 26))).join('')}` : ''}
    ${placed.sort((a, b) => rad(b) - rad(a)).map(p => point(p, x(p.x), y(p.y))).join('')}
  </svg>`;
}
