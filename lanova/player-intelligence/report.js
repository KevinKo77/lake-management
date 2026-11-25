/** LANOVA Player Intelligence — readable comparison report (self-contained HTML) with provenance and disclaimers. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = v => (v === null || v === undefined ? '— (not available)' : typeof v === 'number' ? v.toLocaleString('en-GB') : esc(v));

export function comparisonReport(cmp, dataset, {generatedAt} = {}) {
  const src = dataset.source ?? {};
  const head = `<tr><th>Measure</th><th>Category</th>${cmp.players.map(p => `<th>${esc(p.label)}<br><small>${esc(p.club)} · ${esc(p.season)} · ${esc(p.effectivePosition ?? 'position not documented')}${p.sourcePosition && p.sourcePosition !== p.effectivePosition ? ` (source: ${esc(p.sourcePosition)})` : ''} · identity ${esc(p.identity)}</small></th>`).join('')}</tr>`;
  const rows = cmp.measures.map(m => `<tr><td>${esc(m.label)}${m.note ? `<br><small>${esc(m.note)}</small>` : ''}</td><td>${esc(m.category)}</td>${m.values.map(v => `<td>${fmt(v.value)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LANOVA player comparison</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#0c1a2a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d5d9e0;padding:6px 8px;text-align:left;vertical-align:top}small{color:#5b6573}.warn{background:#fff7ea;border:1px solid #ecd2a8;padding:10px 12px}</style></head><body>
<h1>Player comparison — historical observations</h1>
${dataset.synthetic ? '<p class="warn"><b>DEMONSTRATION DATA — FICTIONAL PLAYERS AND CLUBS.</b> No real player is described in this report.</p>' : ''}
<p>Season ${esc(dataset.season)} · ${esc(dataset.competition)}. Generated ${esc(generatedAt ?? '')} by LANOVA Player Intelligence V1.</p>
<table>${head}${rows}</table>
<h2>Not available</h2><p>${esc((cmp.unavailable ?? []).join(', '))}: not in the source, so never shown as a number.</p>
<h2>Warnings</h2><ul>${cmp.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
<h2>Method</h2><p>OBSERVED = counted directly from the source. DERIVED = calculated: ${esc(dataset.minutesMethod.formula)}.</p><ul>${dataset.minutesMethod.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
<p>${esc(cmp.note)}</p>
<h2>Provenance</h2><p>Source: ${esc(src.description ?? '')}${src.url ? ` — ${esc(src.url)}` : ''}${src.revision ? ` · revision ${esc(src.revision)}` : ''}${src.sha256 ? ` · SHA-256 ${esc(src.sha256)}` : ''}${src.licence ? ` · licence: ${esc(src.licence)}` : ''}.</p>
<p><small>Decision-support information, not sporting, financial or investment advice. Historical observations do not describe current or future performance; no valuation, rating or prediction is included.</small></p>
</body></html>`;
}
