import {esc, money, pct} from './format.js';
export const metric = (label, value, note = '', tone = '') => `<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric ${tone}">${esc(value)}</strong><small>${esc(note)}</small></article>`;
export const badge = (text, type = '') => `<span class="badge ${type}">${esc(text)}</span>`;
export const empty = (title, text) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
export const table = (headers, rows, caption = '') => `<div class="table-scroll"><table>${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
export function exposures(groups, name = x => x) {
  if (!groups.length) return '<p class="muted">No exposure.</p>';
  return groups.map(g => `<div class="exposure"><div class="flex split"><span>${esc(name(g.name))}</span><strong>${pct(g.weight)} <small>${money(g.amount)}</small></strong></div><div class="bar"><span style="width:${Math.max(0, Math.min(100, g.weight * 100))}%"></span></div></div>`).join('');
}
export function cashChart(rows) {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.flatMap(r => r.cases));
  return `<div class="cash-chart" role="img" aria-label="Annual distributions by scenario; exact values in the following table">${rows.map(r => `<div class="cash-year"><div class="columns">${r.cases.map((v, i) => `<span class="column case-${i}" style="height:${Math.max(0, v / max * 100)}%" title="Year ${r.year} : ${money(v)}"></span>`).join('')}</div><small>Y${r.year}</small></div>`).join('')}</div><div class="legend"><span>● Downside</span><span>● Base</span><span>● Upside</span></div>`;
}

/** Signed bars use one common zero baseline, never truncate negative NPV. */
export function comparisonChart(rows) {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map(r => Math.abs(r.analysis.expectedNpv)));
  return `<div class="comparison-chart" role="img" aria-label="Weighted case NPVs on a common scale with a central zero axis; exact values in the tables">${rows.map(r => {
    const value = r.analysis.expectedNpv, width = Math.abs(value) / max * 50;
    return `<div class="chart-row"><span>${esc(r.label)}</span><div class="signed-track"><i class="zero-axis"></i><b class="signed-bar ${value < 0 ? 'negative-fill' : 'positive-fill'}" style="left:${value < 0 ? 50 - width : 50}%;width:${width}%"></b></div><strong class="${value < 0 ? 'negative' : 'positive'}">${money(value)}</strong></div>`;
  }).join('')}</div>`;
}
export function scenarioChart(cases) {
  const max = Math.max(1, ...cases.map(c => c.proceeds));
  return `<div class="scenario-chart" role="img" aria-label="Cumulative scenario distributions; amounts and IRRs detailed in the following table">${cases.map((c, i) => `<div class="scenario-tile"><small>${['Downside', 'Base', 'Upside'][i]}</small><strong>${money(c.proceeds)}</strong><div class="bar"><span class="case-${i}" style="width:${c.proceeds / max * 100}%"></span></div><small>MOIC ${c.moic.toFixed(2)}× · IRR ${pct(c.irr)}</small></div>`).join('')}</div>`;
}

