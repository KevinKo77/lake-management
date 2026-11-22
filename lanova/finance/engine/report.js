/**
 * LANOVA Finance V1 reports: one content model, three formats.
 *  - HTML: standalone, printable (inline styles only, no script, every value escaped);
 *  - PDF: generated directly (finance/pdf.js), for board and investor packs;
 *  - CSV: every figure unrounded, for checking in a spreadsheet (text cells protected against formula injection).
 * The same analysis object (finance/model.js analyse()) feeds all three, so the formats cannot disagree.
 */
import {CATEGORIES, REVENUE, EXPENSE, KINDS, MONTH_END_NOTICE, PRUDENT_BOUND_LABEL, INTERNAL_RATIO_NOTICE, RETURN_LABEL} from './model.js';
import {PdfDocument} from './pdf.js';

export const LIMITATIONS = [
  'Decision-support model: results follow from the figures and assumptions entered; they are not a prediction, an audit or statutory accounts.',
  `${MONTH_END_NOTICE} Cash timing follows the delay entered for each line. ${PRUDENT_BOUND_LABEL}`,
  `Debt-service and commitment cover ratios: ${INTERNAL_RATIO_NOTICE}`,
  `Investment returns: ${RETURN_LABEL} The asset alone, the effect of other decisions and the combination are always shown separately.`,
  'Taxes, VAT and social charges are entered by the organisation; LANOVA does not compute them.',
  'Scenarios have no probability. The downside and upside cases contain only the assumptions shown in this report.',
  'No terminal value, refinancing or asset sale is assumed. Payments after the horizon are reported, not forecast.',
  'Group comparisons put independent plans side by side; they are not a consolidation (no intra-group eliminations).',
];
const fmtMoney = (v, cur) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v < 0 ? '−' : ''}${cur} ${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
const COVER = ['dscr', 'commitmentCover'];
const fmtValue = (i, cur) => i.value === null ? 'n/a' : i.unit === 'ratio' ? (COVER.includes(i.id) ? `${i.value.toFixed(2)}×` : `${(i.value * 100).toFixed(1)}%`) : fmtMoney(i.value, cur);
/** Yield of the asset or of the combination as %, effect of other decisions as percentage points. */
export const yieldText = (v, component) => (v === null || v === undefined ? 'n/a' : /^Other/.test(component) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts` : `${(v * 100).toFixed(1)}%`);
const pct = v => `${(v * 100).toFixed(0)}%`;
const factorText = v => (v === 1 ? '—' : `${v > 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 1000) / 10)}%`);

/** Financial commitments of months 1–12 as a signed waterfall that ends on the change in cash, plus the two ratios. */
function commitmentRows(base) {
  const c = base.commitments, ind = id => base.indicators.find(i => i.id === id)?.value ?? null;
  return {period: c.period, notice: c.notice, rows: [
    ['Operating cash flow', c.operatingCashFlow], ['Loan debt service (interest + principal)', -c.bankDebtService],
    ['Transfer instalments of past deals', -c.transferPaymentsPastDeals], ['Transfer and agent fees of new signings', -c.playerRegistrationsPaid],
    ['Other financial commitments', -c.otherCommitments], ['= Total financial commitments', -c.total],
    ['Transfer instalments received', c.transferReceipts], ['Other capital spending', -c.otherCapitalSpending], ['Loan drawdowns', c.loanDrawdowns], ['Other receipts', c.otherReceipts],
    ['= Cash generated after all commitments (change in cash)', c.cashAfterCommitments]],
    ratios: [['Bank debt-service cover (internal indicator)', ind('dscr')], ['Financial commitments cover (internal indicator)', ind('commitmentCover')]],
    afterHorizon: c.transferPaymentsAfterHorizon};
}
/** Investment returns, always split: each investment alone, then for the selection: asset, other decisions, combination. */
function returnRows(sc) {
  const out = [];
  for (const d of sc.decisions.filter(x => x.returns)) out.push([d.label, 'Asset alone (this decision)', d.returns.amount, d.returns.incrementalEbitda, d.returns.ebitdaYield, d.returns.simplePaybackYears, d.returns.cumulativeCashWithinHorizon, d.returns.definition]);
  const r = sc.combined?.returns;
  if (r) {
    out.push(['Selected decisions', 'Asset: selected investments alone', r.amount, r.asset.incrementalEbitda, r.asset.ebitdaYield, r.asset.simplePaybackYears, r.asset.cumulativeCashWithinHorizon, r.definition]);
    out.push(['Selected decisions', 'Other selected decisions and interactions', null, r.others.incrementalEbitda, r.others.yieldPoints, null, null, r.definition]);
    out.push(['Selected decisions', 'Combined scenario', r.amount, r.combined.incrementalEbitda, r.combined.ebitdaYield, r.combined.simplePaybackYears, r.combined.cumulativeCashWithinHorizon, r.definition]);
  }
  return out;
}

/** Plain content model shared by the three formats. */
export function reportModel(plan, a, meta = {}) {
  const cur = plan.currency, base = a.base, H = plan.horizonMonths;
  const kinds = KINDS.map(k => [k, plan.lines.filter(l => l.kind === k).length]);
  const decisionsById = Object.fromEntries(plan.decisions.map(d => [d.id, d]));
  return {
    title: plan.name, organisation: meta.organisation ?? null, currency: cur, fictional: plan.fictional,
    subtitle: `${H}-month forecast from ${base.months[0].month} to ${base.months.at(-1).month} · ${cur} · base case${a.selected.length ? ` with ${a.selected.length} selected decision(s)` : ', no decision applied'}`,
    evidence: [meta.revision ? `Saved revision r${meta.revision}` : 'Unsaved working copy (not a saved revision)', meta.hash ? `plan SHA-256 ${meta.hash}` : null, `engine ${a.engine}`, `generated ${meta.generatedAt ?? new Date().toISOString()}`].filter(Boolean).join(' · '),
    summary: base.indicators.map(i => ({label: i.label, value: fmtValue(i, cur), raw: i.value, period: i.period, definition: i.definition})),
    risks: base.risks,
    assumptions: {
      plan: [['Start month', plan.startMonth], ['Horizon', `${H} months`], ['Opening cash', fmtMoney(plan.openingCash, cur)], ['Minimum cash policy', fmtMoney(plan.minimumCash, cur)],
        ['Payroll-to-revenue limit', plan.policy.payrollRatioLimit === null ? 'not monitored' : pct(plan.policy.payrollRatioLimit)], ['Minimum debt-service cover', plan.policy.minimumDscr === null ? 'not monitored' : `${plan.policy.minimumDscr}×`],
        ['Data', kinds.map(([k, c]) => `${c} ${k}`).join(', ') + ' line(s)'], ['Source', plan.source], ['Evidence date', plan.asOf]],
      scenarios: {columns: plan.scenarios.map(s => s.label), rows: [
        ...REVENUE.map(c => [CATEGORIES[c].label, ...plan.scenarios.map(s => factorText(s.revenueFactors[c]))]),
        ...EXPENSE.map(c => [CATEGORIES[c].label, ...plan.scenarios.map(s => factorText(s.costFactors[c]))]),
        ['Capital expenditure (excl. player registrations)', ...plan.scenarios.map(s => factorText(s.capexFactor))],
        ['Extra delay in collecting revenue', ...plan.scenarios.map(s => (s.extraCollectionLagMonths ? `+${s.extraCollectionLagMonths} month(s)` : '—'))],
        ['Rate change on new loans', ...plan.scenarios.map(s => (s.newLoanRateDelta ? `${s.newLoanRateDelta > 0 ? '+' : '−'}${Math.abs(s.newLoanRateDelta * 100).toFixed(2)} pts` : '—'))],
        ['Applies from', ...plan.scenarios.map(s => base.months[s.fromMonth]?.month ?? '')],
      ], notes: plan.scenarios.filter(s => s.notes).map(s => `${s.label}: ${s.notes}`)},
      lines: plan.lines.map(l => [l.label, CATEGORIES[l.category].label, l.kind, l.cashLagMonths ? `${l.cashLagMonths} month(s)` : 'same month', fmtMoney(l.values.reduce((x, y) => x + y, 0), cur), l.source, l.asOf]),
      decisions: plan.decisions.map(d => [d.label, d.type.replace('_', ' '), d.selected ? 'selected' : 'not selected', base.months[d.startMonth].month, d.kind, d.source]),
      imports: (plan.imports ?? []).map(x => [x.file, x.format.toUpperCase(), String(x.rows), x.lines.length + ' line(s)', x.sha256.slice(0, 16) + '…', x.importedAt]),
    },
    years: base.years.map(y => [`Year ${y.year} (${y.from} → ${y.to})`, y.revenue, y.ebitda, y.operatingResult, y.netResult, y.operatingCashFlow, -y.capexPaid, y.financingCashFlow, y.otherCashFlow, y.netCashFlow, y.closingCash]),
    months: base.months.map(m => [m.month, m.revenue, m.ebitda, m.netResult, m.receipts, m.operatingPayments + m.taxPaid, m.capexPaid, m.financingCashFlow, m.otherCashFlow, m.netCashFlow, m.closingCash, m.cashOutGross, m.prudentLowerBound]),
    monthEndNotice: MONTH_END_NOTICE, boundLabel: PRUDENT_BOUND_LABEL,
    commitments: commitmentRows(base),
    bridge: base.bridge.map(b => [b.label, b.amount]).concat([['Net cash flow over the horizon', base.totals.netCashFlow]]),
    scenarios: a.scenarios.map(s => [s.label, s.kpis.revenue, s.kpis.ebitda, s.kpis.netResult, s.kpis.minimumCash, s.kpis.closingCash, s.kpis.liquidityHeadroom, s.kpis.investmentCapacity, s.breaches ? 'breached' : 'met']),
    impact: a.impact.map(sc => ({scenario: sc.label, baseline: sc.baseline, rows: [...sc.decisions, ...(sc.combined ? [{...sc.combined, id: 'combined', type: 'combination'}] : [])].map(d => (d.invalid
      ? [d.label, decisionsById[d.id]?.selected ? 'selected' : d.id === 'combined' ? 'combination' : '', 'not valid: ' + d.invalid, '', '', '', '', '']
      : [d.label, decisionsById[d.id]?.selected ? 'selected' : d.id === 'combined' ? 'combination' : '', d.yearly[0].ebitda, d.yearly.at(-1).netResult, d.closingCashDelta, d.minimumCashDelta, d.minimumCash, d.breachesPolicy ? 'breached' : 'met', d.prudentLowerBound])),
      returns: returnRows(sc)})),
    capex: base.capex.map(c => [c.label, c.category.replace('_', ' '), c.amount, c.paidInHorizon, c.paidAfterHorizon, c.depreciationInHorizon, c.netBookValue]),
    loans: base.loans.map(l => [l.label, l.existing ? 'existing' : 'new', l.drawdown, l.interest, l.principalRepaid, l.closingBalance]),
    limitations: LIMITATIONS,
  };
}

// ------------------------------------------------------------------ HTML
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function reportHtml(plan, a, meta = {}) {
  const r = reportModel(plan, a, meta), cur = r.currency, m = v => (typeof v === 'number' ? fmtMoney(v, cur) : esc(v));
  const table = (head, rows, numeric = () => true) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((c, i) => `<td class="${typeof c === 'number' && numeric(i) ? 'n' : ''}">${m(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.title)} — LANOVA Finance report</title><style>
body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#15171c;margin:32px auto;max-width:1100px;padding:0 20px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #4b4f9c;padding-bottom:4px}h3{font-size:14px;margin:16px 0 6px}
.muted{color:#5b6070}.banner{background:#fff4d6;border:1px solid #e3c36a;padding:8px 12px;border-radius:6px;margin:12px 0}
table{border-collapse:collapse;width:100%;margin:6px 0 14px;font-size:12px}th,td{border-bottom:1px solid #e3e5ea;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef0f6}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.kpi{border:1px solid #dfe2ea;border-radius:8px;padding:10px}.kpi b{display:block;font-size:18px;margin:2px 0}.kpi small{color:#5b6070}
.risk{border-left:4px solid #c0392b;padding:4px 10px;margin:6px 0}.risk.medium{border-color:#d68910}.risk.info{border-color:#7f8c8d}
@media print{body{margin:0}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
</style></head><body>
<p class="muted">LANOVA Finance · financial report</p><h1>${esc(r.title)}</h1><p class="muted">${esc(r.organisation ? `${r.organisation} · ` : '')}${esc(r.subtitle)}</p>
${r.fictional ? '<p class="banner"><b>Fictional data.</b> Every figure in this report is synthetic and for demonstration or testing only.</p>' : ''}
<p class="muted">${esc(r.evidence)}</p>
<h2>1. Financial summary</h2><div class="kpis">${r.summary.map(k => `<div class="kpi"><small>${esc(k.label)}</small><b>${esc(k.value)}</b><small>${esc(k.period)}</small><br><small>${esc(k.definition)}</small></div>`).join('')}</div>
<h2>2. Main risks</h2>${r.risks.length ? r.risks.map(x => `<p class="risk ${esc(x.severity)}"><b>${esc(x.severity.toUpperCase())}</b> · ${esc(x.message)}</p>`).join('') : '<p>No rule-based risk flag was raised by the base case.</p>'}
<h2>3. Assumptions</h2>${table(['Item', 'Value'], r.assumptions.plan)}
<h3>Scenario assumptions (changes against the budget as entered)</h3>${table(['Assumption', ...r.assumptions.scenarios.columns], r.assumptions.scenarios.rows)}${r.assumptions.scenarios.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}
<h3>Data lines and provenance</h3>${table(['Line', 'Category', 'Basis', 'Cash timing', 'Total in horizon', 'Source', 'Evidence date'], r.assumptions.lines)}
${r.assumptions.decisions.length ? `<h3>Decisions considered</h3>${table(['Decision', 'Type', 'Status', 'From', 'Basis', 'Source'], r.assumptions.decisions)}` : ''}
${r.assumptions.imports.length ? `<h3>Imported files</h3>${table(['File', 'Format', 'Rows', 'Lines', 'SHA-256', 'Imported at'], r.assumptions.imports)}` : ''}
<h2>4. Forecast — base case</h2><h3>By fiscal year</h3>${table(['Period', 'Revenue', 'EBITDA', 'Operating result', 'Net result', 'Operating cash flow', 'Capital spending', 'Financing', 'Other cash', 'Net cash flow', 'Closing cash'], r.years)}
<h3>Net result to cash (whole horizon)</h3>${table(['Item', 'Amount'], r.bridge)}
<h3>Financial commitments — ${esc(r.commitments.period)}</h3>${table(['Item', 'Amount'], r.commitments.rows)}${table(['Ratio', 'Value'], r.commitments.ratios.map(([l, v]) => [l, v === null ? 'n/a' : `${v.toFixed(2)}×`]))}<p class="muted">${esc(r.commitments.notice)}${r.commitments.afterHorizon > 0.005 ? ` Transfer and agent fees due after the horizon, not in this period: ${esc(fmtMoney(r.commitments.afterHorizon, cur))}.` : ''}</p>
<h3>By month</h3><p class="muted">${esc(r.monthEndNotice)} ${esc(r.boundLabel)}</p>${table(['Month', 'Revenue', 'EBITDA', 'Net result', 'Cash received', 'Operating & tax paid', 'Capital paid', 'Financing', 'Other cash', 'Net cash flow', 'Closing cash', 'All payments of the month', 'Prudent bound (not a forecast)'], r.months)}
${r.capex.length ? `<h3>Capital items</h3>${table(['Item', 'Category', 'Amount', 'Paid in horizon', 'Paid after horizon', 'Depreciation in horizon', 'Net book value at end'], r.capex)}` : ''}
${r.loans.length ? `<h3>Loans</h3>${table(['Loan', 'Status', 'Drawn', 'Interest', 'Principal repaid', 'Balance at end'], r.loans)}` : ''}
<h2>5. Scenario comparison</h2>${table(['Scenario', 'Revenue (Y1)', 'EBITDA (Y1)', 'Net result (Y1)', 'Lowest cash', 'Closing cash', 'Headroom vs policy', 'Investment capacity', 'Cash policy'], r.scenarios)}
<h2>6. Decisions — consequences against the plan without any decision</h2>${r.impact.map(sc => `<h3>${esc(sc.scenario)}</h3>${table(['Decision', 'Status', 'EBITDA year 1', 'Net result last year', 'Closing cash', 'Lowest cash', 'Lowest cash after', 'Cash policy', 'Prudent bound after (not a forecast)'], sc.rows)}${sc.returns.length ? table(['Investment', 'Component', 'Amount', 'Incremental EBITDA (run-rate)', 'Simple EBITDA yield', 'Simple payback (years)', 'Cash effect within horizon'], sc.returns.map(x => [x[0], x[1], x[2] ?? '—', x[3], yieldText(x[4], x[1]), x[5] === null ? 'n/a' : x[5].toFixed(1), x[6] ?? '—']), i => ![4, 5].includes(i)) + `<p class="muted">${esc(sc.returns[0][7])}</p>` : ''}`).join('')}
<h2>7. Limitations</h2><ul>${r.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
</body></html>`;
}

// ------------------------------------------------------------------ CSV
const csvCell = v => { if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : ''; let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(plan, a, meta = {}) {
  const r = reportModel(plan, a, meta), out = [], row = cells => out.push(cells.map(csvCell).join(','));
  row(['LANOVA Finance report', r.title]); row(['Evidence', r.evidence]); row(['Currency', r.currency]); if (r.fictional) row(['Data', 'FICTIONAL — synthetic figures']); row([]);
  row(['Section', 'Indicator', 'Value', 'Period', 'Definition']); for (const k of r.summary) row(['Summary', k.label, k.raw, k.period, k.definition]); row([]);
  row(['Section', 'Month', ...Object.keys(a.base.months[0]).filter(k => k !== 't' && k !== 'month')]);
  for (const mo of a.base.months) row(['Monthly (base)', mo.month, ...Object.entries(mo).filter(([k]) => k !== 't' && k !== 'month').map(([, v]) => v)]); row([]);
  row(['Section', 'Period', 'Revenue', 'EBITDA', 'Operating result', 'Net result', 'Operating cash flow', 'Capital spending', 'Financing', 'Other cash', 'Net cash flow', 'Closing cash']); for (const y of r.years) row(['Annual (base)', ...y]); row([]);
  row(['Section', 'Item', 'Amount']); for (const b of r.bridge) row(['Result to cash', ...b]); row([]);
  row(['Section', 'Item', 'Amount', 'Period']); for (const b of r.commitments.rows) row(['Financial commitments', ...b, r.commitments.period]);
  for (const [l, v] of r.commitments.ratios) row(['Financial commitments', l, v, r.commitments.period]); row(['Financial commitments', 'Transfer and agent fees due after the horizon', r.commitments.afterHorizon, 'after the horizon']);
  row(['Financial commitments', r.commitments.notice]); row(['Month-end balances', r.monthEndNotice]); row(['Month-end balances', r.boundLabel]); row([]);
  row(['Section', 'Scenario', 'Revenue Y1', 'EBITDA Y1', 'Net result Y1', 'Lowest cash', 'Closing cash', 'Headroom', 'Investment capacity', 'Cash policy']); for (const s of r.scenarios) row(['Scenarios', ...s]); row([]);
  row(['Section', 'Scenario', 'Decision', 'Status', 'EBITDA year 1 change', 'Net result last year change', 'Closing cash change', 'Lowest cash change', 'Lowest cash after', 'Cash policy', 'Prudent bound after (not a forecast)']);
  for (const sc of r.impact) for (const d of sc.rows) row(['Decision impact', sc.scenario, ...d]); row([]);
  row(['Section', 'Scenario', 'Investment', 'Component', 'Amount', 'Incremental EBITDA', 'Simple EBITDA yield (fraction; points for other decisions)', 'Simple payback years', 'Cash effect within horizon', 'Basis']);
  for (const sc of r.impact) for (const x of sc.returns) row(['Investment returns', sc.scenario, ...x]); row([]);
  row(['Section', 'Line', 'Category', 'Basis', 'Cash timing', 'Total', 'Source', 'Evidence date']); for (const l of r.assumptions.lines) row(['Data lines', ...l]); row([]);
  row(['Section', 'Severity', 'Risk']); for (const x of r.risks) row(['Risks', x.severity, x.message]); row([]);
  for (const l of r.limitations) row(['Limitation', l]);
  return '﻿' + out.join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ PDF
export function reportPdf(plan, a, meta = {}) {
  const r = reportModel(plan, a, meta), cur = r.currency, d = new PdfDocument({title: `${r.title} — LANOVA Finance report`});
  const m = v => (typeof v === 'number' ? fmtMoney(v, cur) : String(v ?? ''));
  d.footer = `LANOVA Finance · ${r.title}${r.fictional ? ' · FICTIONAL DATA' : ''}`;
  d.text(d.margin, d.y - 9, 'LANOVA FINANCE · FINANCIAL REPORT', {size: 8, bold: true, color: [0.3, 0.33, 0.6]}); d.y -= 22;
  d.paragraph(r.title, {size: 18, bold: true, gap: 2});
  d.paragraph(`${r.organisation ? `${r.organisation} · ` : ''}${r.subtitle}`, {size: 9.5, color: [0.35, 0.37, 0.42]});
  if (r.fictional) d.paragraph('Fictional data: every figure in this report is synthetic and for demonstration or testing only.', {size: 9, bold: true, color: [0.6, 0.4, 0]});
  d.paragraph(r.evidence, {size: 7.5, color: [0.4, 0.42, 0.46]});
  d.heading('1. Financial summary');
  d.table([{label: 'Indicator', width: 0.4}, {label: 'Value', width: 0.22, align: 'right'}, {label: 'Period', width: 0.38}], r.summary.map(k => [k.label, k.value, k.period]), {size: 7.6});
  d.heading('Definitions', 2);
  for (const k of r.summary) d.paragraph(`${k.label}: ${k.definition}`, {size: 7.4, gap: 0});
  d.y -= 4;
  d.heading('2. Main risks');
  if (r.risks.length) for (const x of r.risks) d.paragraph(`${x.severity.toUpperCase()} · ${x.message}`, {size: 8.6}); else d.paragraph('No rule-based risk flag was raised by the base case.');
  d.heading('3. Assumptions');
  d.table([{label: 'Item', width: 0.3}, {label: 'Value', width: 0.7}], r.assumptions.plan);
  d.heading('Scenario assumptions (changes against the budget as entered)', 2);
  const sw = 0.55 / r.assumptions.scenarios.columns.length;
  d.table([{label: 'Assumption', width: 0.45}, ...r.assumptions.scenarios.columns.map(c => ({label: c, width: sw, align: 'right'}))], r.assumptions.scenarios.rows);
  for (const n of r.assumptions.scenarios.notes) d.paragraph(n, {size: 8});
  d.heading('Data lines and provenance', 2);
  d.table([{label: 'Line', width: 0.22}, {label: 'Category', width: 0.17}, {label: 'Basis', width: 0.09}, {label: 'Timing', width: 0.09}, {label: 'Total', width: 0.13, align: 'right'}, {label: 'Source', width: 0.21}, {label: 'Date', width: 0.09}], r.assumptions.lines, {size: 6.8});
  if (r.assumptions.decisions.length) { d.heading('Decisions considered', 2); d.table([{label: 'Decision', width: 0.3}, {label: 'Type', width: 0.13}, {label: 'Status', width: 0.12}, {label: 'From', width: 0.09}, {label: 'Basis', width: 0.1}, {label: 'Source', width: 0.26}], r.assumptions.decisions, {size: 7}); }
  if (r.assumptions.imports.length) { d.heading('Imported files', 2); d.table([{label: 'File', width: 0.28}, {label: 'Format', width: 0.08}, {label: 'Rows', width: 0.08, align: 'right'}, {label: 'Lines', width: 0.12}, {label: 'SHA-256', width: 0.2}, {label: 'Imported at', width: 0.24}], r.assumptions.imports, {size: 7}); }
  d.heading('4. Forecast — base case');
  const yc = [{label: 'Period', width: 0.19}, ...['Revenue', 'EBITDA', 'Op. result', 'Net result', 'Op. cash flow', 'Capital', 'Financing', 'Other cash', 'Net cash', 'Closing cash'].map(l => ({label: l, width: 0.081, align: 'right'}))];
  d.table(yc, r.years.map(y => [y[0], ...y.slice(1).map(v => m(v).replace(`${cur} `, ''))]), {size: 6.4});
  d.paragraph(`Amounts in ${cur}.`, {size: 7, color: [0.4, 0.42, 0.46]});
  d.heading('Net result to cash (whole horizon)', 2);
  d.table([{label: 'Item', width: 0.72}, {label: 'Amount', width: 0.28, align: 'right'}], r.bridge.map(([l, v]) => [l, m(v)]));
  d.heading(`Financial commitments — ${r.commitments.period}`, 2);
  d.table([{label: 'Item', width: 0.72}, {label: 'Amount', width: 0.28, align: 'right'}], [...r.commitments.rows.map(([l, v]) => [l, m(v)]), ...r.commitments.ratios.map(([l, v]) => [l, v === null ? 'n/a' : `${v.toFixed(2)}x`])]);
  d.paragraph(`${r.commitments.notice}${r.commitments.afterHorizon > 0.005 ? ` Transfer and agent fees due after the horizon, not in this period: ${m(r.commitments.afterHorizon)}.` : ''}`, {size: 7.5, color: [0.35, 0.37, 0.42]});
  d.heading('By month', 2);
  d.paragraph(`${r.monthEndNotice} ${r.boundLabel}`, {size: 7.5, color: [0.35, 0.37, 0.42]});
  const mc = [{label: 'Month', width: 0.076}, ...['Revenue', 'EBITDA', 'Net result', 'Received', 'Op. & tax paid', 'Capital paid', 'Financing', 'Other cash', 'Net cash', 'Closing cash', 'All payments', 'Prudent bound'].map(l => ({label: l, width: 0.077, align: 'right'}))];
  d.table(mc, r.months.map(x => [x[0], ...x.slice(1).map(v => m(v).replace(`${cur} `, ''))]), {size: 5.6});
  if (r.capex.length) { d.heading('Capital items', 2); d.table([{label: 'Item', width: 0.28}, {label: 'Category', width: 0.14}, ...['Amount', 'Paid in horizon', 'Paid after', 'Depreciation', 'Book value at end'].map(l => ({label: l, width: 0.116, align: 'right'}))], r.capex.map(c => [c[0], c[1], ...c.slice(2).map(m)]), {size: 6.8}); }
  if (r.loans.length) { d.heading('Loans', 2); d.table([{label: 'Loan', width: 0.3}, {label: 'Status', width: 0.1}, ...['Drawn', 'Interest', 'Principal repaid', 'Balance at end'].map(l => ({label: l, width: 0.15, align: 'right'}))], r.loans.map(c => [c[0], c[1], ...c.slice(2).map(m)]), {size: 7}); }
  d.heading('5. Scenario comparison');
  d.table([{label: 'Scenario', width: 0.2}, ...['Revenue Y1', 'EBITDA Y1', 'Net result Y1', 'Lowest cash', 'Closing cash', 'Headroom', 'Inv. capacity'].map(l => ({label: l, width: 0.1, align: 'right'})), {label: 'Policy', width: 0.1}], r.scenarios.map(s => [s[0], ...s.slice(1, 8).map(m), s[8]]), {size: 6.8});
  d.heading('6. Decisions — consequences against the plan without any decision');
  for (const sc of r.impact) {
    d.heading(sc.scenario, 2);
    d.table([{label: 'Decision', width: 0.24}, {label: 'Status', width: 0.09}, ...['EBITDA Y1', 'Net result last Y', 'Closing cash', 'Lowest cash', 'Lowest after', 'Prudent bound'].map(l => ({label: l, width: 0.1, align: 'right'})), {label: 'Policy', width: 0.07}], sc.rows.map(x => [x[0], x[1], ...x.slice(2, 7).map(m), x[7], m(x[8])]).map(x => [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[8], x[7]]), {size: 6.4});
    if (sc.returns.length) d.table([{label: 'Investment', width: 0.2}, {label: 'Component', width: 0.25}, ...['Amount', 'Run-rate EBITDA', 'Simple yield', 'Payback (y)', 'Cash in horizon'].map(l => ({label: l, width: 0.11, align: 'right'}))], sc.returns.map(x => [x[0], x[1], x[2] === null ? '—' : m(x[2]), m(x[3]), yieldText(x[4], x[1]), x[5] === null ? 'n/a' : x[5].toFixed(1), x[6] === null ? '—' : m(x[6])]), {size: 6.4});
  }
  if (r.impact.some(sc => sc.returns.length)) d.paragraph(r.impact.flatMap(sc => sc.returns.map(x => x[7]))[0], {size: 7.5, color: [0.35, 0.37, 0.42]});
  d.heading('7. Limitations');
  for (const l of r.limitations) d.paragraph(`• ${l}`, {size: 8.4, gap: 1});
  return d.bytes();
}
