/**
 * LANOVA Recruitment Workspace — financial charts (inline SVG, no library).
 * Every value drawn is an engine output passed in by app.js; nothing is estimated here.
 * Colours come from classes in workspace.css (the page's CSP forbids inline styles).
 */
import {eur} from '../v3/demo/explain.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const short = v => {
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}€${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}m`;
  if (a >= 1e3) return `${sign}€${Math.round(a / 1e3)}k`;
  return `${sign}€${Math.round(a)}`;
};
const nice = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
const f1 = x => x.toFixed(1);
const legend = items => `<ul class="chart-legend">${items.map(([cls, label, value]) => `<li><i class="sw ${cls}" aria-hidden="true"></i>${esc(label)}${value !== undefined ? ` <b>${esc(value)}</b>` : ''}</li>`).join('')}</ul>`;

/** Payments of the recommended signings by period (t = 0 at signing, then each season), stacked by type. */
export const PAY_TYPES = [
  ['fees', 'Transfer and agent fees, signing bonuses', ['fee', 'agent', 'signing']],
  ['wages', 'Wages', ['wages']],
  ['other', 'Expected bonuses and exit costs', ['bonus', 'exit']],
];
export function paymentsData(selection, economics) {
  const econ = new Map(economics.map(e => [e.id, e]));
  const T = Math.max(1, ...selection.map(id => econ.get(id).components.outflows.wages.length));
  const rows = Array.from({length: T}, () => ({fees: 0, wages: 0, other: 0}));
  for (const id of selection) {
    const o = econ.get(id).components.outflows;
    for (const [key, , parts] of PAY_TYPES) for (const p of parts) (o[p] ?? []).forEach((v, t) => { rows[t][key] += v; });
  }
  while (rows.length > 1 && rows.at(-1).fees + rows.at(-1).wages + rows.at(-1).other === 0) rows.pop();
  const totals = Object.fromEntries(PAY_TYPES.map(([k]) => [k, rows.reduce((s, r) => s + r[k], 0)]));
  return {rows, totals, total: Object.values(totals).reduce((a, b) => a + b, 0)};
}
export function paymentsChart(d, horizon, width = 560) {
  const n = d.rows.length, W = Math.max(280, Math.round(width)), H = 230, L = 52, R = 8, T = 18, B = 34;
  const max = nice(Math.max(...d.rows.map(r => r.fees + r.wages + r.other)));
  const bw = (W - L - R) / n, y = v => T + (1 - v / max) * (H - T - B);
  const bars = d.rows.map((r, t) => {
    let acc = 0; const x = L + t * bw + bw * 0.2, w = bw * 0.6;
    const segs = PAY_TYPES.map(([k, label]) => { const v = r[k]; if (v <= 0) return ''; const y1 = y(acc + v), h = y(acc) - y1; acc += v; return `<rect class="c-${k}" x="${f1(x)}" y="${f1(y1)}" width="${f1(w)}" height="${f1(Math.max(h, .5))}"><title>${esc(label)}: ${esc(eur(v))}</title></rect>`; }).join('');
    const total = r.fees + r.wages + r.other;
    return `${segs}${total > 0 ? `<text class="c-val" x="${f1(x + w / 2)}" y="${f1(y(total) - 5)}" text-anchor="middle">${esc(short(total))}</text>` : ''}
      <text class="c-axis" x="${f1(x + w / 2)}" y="${H - 14}" text-anchor="middle">${t === 0 ? 'Signing' : bw < 70 ? `S${t}` : `Season ${t}`}</text>${t > horizon ? `<text class="c-axis c-note" x="${f1(x + w / 2)}" y="${H - 2}" text-anchor="middle">after plan</text>` : ''}`;
  }).join('');
  const ticks = [0, max / 2, max].map(v => `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="c-axis" x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${esc(short(v))}</text>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Payments of the recommended signings by season">${ticks}${bars}</svg>
    ${legend(PAY_TYPES.map(([k, label]) => [`c-${k}`, label, eur(d.totals[k])]))}</figure>`;
}

/** Squad cost per season: already committed + added by the signings, against the season's limit. */
export function squadCostChart(spend, width = 560) {
  const n = spend.squadCostLimit.length, W = Math.max(280, Math.round(width)), H = 230, L = 52, R = 8, T = 18, B = 34;
  const committed = spend.squadCostTotal.map((x, i) => x - spend.addedSquadCost[i]);
  const max = nice(Math.max(...spend.squadCostLimit, ...spend.squadCostTotal) * 1.05);
  const bw = (W - L - R) / n, y = v => T + (1 - v / max) * (H - T - B);
  const bars = spend.squadCostLimit.map((lim, i) => {
    const x = L + i * bw + bw * 0.22, w = bw * 0.56, c = committed[i], a = spend.addedSquadCost[i], head = lim - spend.squadCostTotal[i];
    return `<rect class="c-committed" x="${f1(x)}" y="${f1(y(c))}" width="${f1(w)}" height="${f1(y(0) - y(c))}"><title>Already committed: ${esc(eur(c))}</title></rect>
      ${a > 0 ? `<rect class="c-added" x="${f1(x)}" y="${f1(y(c + a))}" width="${f1(w)}" height="${f1(Math.max(.5, y(c) - y(c + a)))}"><title>Added by the signings: ${esc(eur(a))}</title></rect>` : ''}
      <line class="c-limit" x1="${f1(x - 6)}" x2="${f1(x + w + 6)}" y1="${f1(y(lim))}" y2="${f1(y(lim))}"><title>Limit: ${esc(eur(lim))}</title></line>
      <text class="c-val" x="${f1(x + w / 2)}" y="${f1(y(lim) - 6)}" text-anchor="middle">${head >= 0 ? `${esc(short(head))} left` : `${esc(short(-head))} over`}</text>
      <text class="c-axis" x="${f1(x + w / 2)}" y="${H - 14}" text-anchor="middle">${bw < 70 ? 'S' : 'Season '}${i + 1}</text>`;
  }).join('');
  const ticks = [0, max / 2, max].map(v => `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="c-axis" x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${esc(short(v))}</text>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Squad cost by season against the limit">${ticks}${bars}</svg>
    ${legend([['c-committed', 'Already committed'], ['c-added', 'Added by the signings'], ['c-limit-key', 'Squad-cost limit']])}</figure>`;
}

/** Club cash at each season end (t = 0 just after signing): expected case and bad case, against the cash floor. */
export function cashChart(base, downside, floor, width = 560) {
  const n = downside.length, W = Math.max(280, Math.round(width)), H = 230, L = 52, R = 14, T = 18, B = 34;
  const lo = Math.min(0, floor, ...downside, ...base), hi = nice(Math.max(floor, ...downside, ...base) * 1.08);
  const x = t => L + (n === 1 ? (W - L - R) / 2 : t * (W - L - R) / (n - 1)), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const path = arr => arr.map((v, t) => `${t ? 'L' : 'M'}${f1(x(t))} ${f1(y(v))}`).join(' ');
  const low = downside.reduce((m, v, t) => (v < m.v ? {v, t} : m), {v: Infinity, t: 0});
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="c-axis" x="${L - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${esc(short(v))}</text>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Club cash by season, expected case and bad case">${ticks}
    <line class="c-floor" x1="${L}" x2="${W - R}" y1="${f1(y(floor))}" y2="${f1(y(floor))}"><title>Cash that must always remain: ${esc(eur(floor))}</title></line>
    <path class="c-line-base" d="${path(base)}"/><path class="c-line-down" d="${path(downside)}"/>
    ${base.map((v, t) => `<circle class="c-dot-base" cx="${f1(x(t))}" cy="${f1(y(v))}" r="3"><title>Expected, ${t === 0 ? 'after signing' : `end of season ${t}`}: ${esc(eur(v))}</title></circle>`).join('')}
    ${downside.map((v, t) => `<circle class="c-dot-down" cx="${f1(x(t))}" cy="${f1(y(v))}" r="3.4"><title>Bad case, ${t === 0 ? 'after signing' : `end of season ${t}`}: ${esc(eur(v))}</title></circle>`).join('')}
    <text class="c-val c-val-down" x="${f1(x(low.t))}" y="${f1(y(low.v) + 18)}" text-anchor="middle">Lowest ${esc(short(low.v))}</text>
    ${downside.map((_, t) => `<text class="c-axis" x="${f1(x(t))}" y="${H - 14}" text-anchor="middle">${t === 0 ? 'Signing' : `End S${t}`}</text>`).join('')}
    </svg>${legend([['c-base-key', 'Expected case'], ['c-down-key', 'Bad case'], ['c-floor-key', `Cash to keep (${eur(floor)})`]])}</figure>`;
}

/** Share of each limit used by the recommendation (or by signing nobody), most used first. */
export function limitsChart(rows) {
  const items = rows.filter(r => r.sense === '<=' && r.limit > 0).map(r => ({...r, share: r.used / r.limit})).sort((a, b) => b.share - a.share);
  return `<ul class="usage">${items.map(r => `<li class="${r.status}"><div class="usage-top"><span>${esc(r.label)}</span><b>${esc(r.money ? eur(r.used) : String(r.used))} <span class="muted">of ${esc(r.money ? eur(r.limit) : String(r.limit))}</span></b></div>
    <div class="usage-bar" role="img" aria-label="${esc(r.label)}: ${Math.round(r.share * 100)}% used"><span data-w="${Math.max(0, Math.min(100, r.share * 100)).toFixed(1)}"></span></div>
    <div class="usage-note">${Math.round(r.share * 100)}% used${r.status === 'tight' ? ' · decides the choice' : r.status === 'broken' ? ' · broken' : ''}</div></li>`).join('')}</ul>`;
}

/** Scenario A vs B on the money metrics both results report. Values: [label, a, b, higherIsBetter]. */
export function compareChart(items) {
  const max = Math.max(1, ...items.flatMap(([, a, b]) => [Math.abs(a ?? 0), Math.abs(b ?? 0)]));
  return `<div class="ab-chart">${items.map(([label, a, b, better]) => {
    const delta = a !== null && b !== null ? b - a : null;
    const tone = delta === null || delta === 0 ? '' : (delta > 0) === better ? 'good' : 'bad';
    return `<div class="ab-row"><div class="ab-label">${esc(label)}${delta !== null && delta !== 0 ? ` <span class="ab-delta ${tone}">${delta > 0 ? '+' : '−'}${esc(eur(Math.abs(delta)))}</span>` : ''}</div>
      <div class="ab-bars"><div class="ab-bar a"><span data-w="${(100 * Math.abs(a ?? 0) / max).toFixed(1)}"></span><em>A ${a === null ? '—' : esc(eur(a))}</em></div>
      <div class="ab-bar b"><span data-w="${(100 * Math.abs(b ?? 0) / max).toFixed(1)}"></span><em>B ${b === null ? '—' : esc(eur(b))}</em></div></div></div>`;
  }).join('')}</div>`;
}
