/**
 * LANOVA Finance — public interactive demonstration (fictional clubs only).
 * Every figure comes from the LANOVA Finance engine in ./engine/ (copied unchanged from KevinKo77/lake-intelligence;
 * see BUILD.txt and the SHA-256 manifest). This file only edits the fictional plan and displays the engine's results:
 * it contains no financial calculation of its own. Nothing is sent or stored.
 */
import {analyse, validatePlan, REVENUE, EXPENSE, CATEGORIES, MONTH_END_NOTICE, PRUDENT_BOUND_LABEL, RETURN_LABEL, monthLabel} from './engine/model.js';
import {CASES} from './engine/cases.js';
import {reportPdf, reportCsv, reportHtml} from './engine/report.js';

const CLUBS = [
  {id: 'football', title: 'Professional football club', text: 'Annual budget 2026/27: payroll, a striker signing with fee instalments, a bank loan, matchday seasonality.'},
  {id: 'basketball', title: 'Basketball club', text: 'Commercial revenue falls and the main sponsor contract ends: adapt payroll and costs over 24 months.'},
  {id: 'groupNorth', title: 'Group club — North', text: '36-month plan with an €8M stadium hospitality investment and a construction loan.'},
  {id: 'groupSouth', title: 'Group club — South', text: '36-month plan with a €2.5M youth academy and the rent it saves.'},
];
const TEMPLATES = {
  player: {football: {transferFee: 1_500_000, agentFee: 150_000, contractMonths: 36, monthlyWage: 60_000, employerChargeRate: 0.3, signingBonus: 100_000},
    basketball: {transferFee: 100_000, agentFee: 20_000, contractMonths: 24, monthlyWage: 25_000, employerChargeRate: 0.28, signingBonus: 0},
    groupNorth: {transferFee: 1_000_000, agentFee: 100_000, contractMonths: 36, monthlyWage: 45_000, employerChargeRate: 0.3, signingBonus: 50_000},
    groupSouth: {transferFee: 300_000, agentFee: 30_000, contractMonths: 36, monthlyWage: 20_000, employerChargeRate: 0.3, signingBonus: 0}},
  investment: {amount: 1_000_000, usefulLifeMonths: 120, capexCategory: 'infrastructure', revenueCategory: 'commercial', monthlyRevenue: 25_000, monthlyOperatingCost: 5_000},
};
const S = {club: null, plan: null, analysis: null, problems: [], view: 'overview', impactScenario: 'base', instalments: {}, added: 0};
const $ = id => document.getElementById(id);
const main = document.getElementById('main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const money = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
const signed = v => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
const pct = v => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const times = v => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)}×`);
const cls = v => (v < -0.005 ? 'neg' : v > 0.005 ? 'pos' : '');
const cur = () => S.plan.currency;
const kpi = (r, id) => r.indicators.find(i => i.id === id);
const table = (head, rows, numeric = i => i > 0) => `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${numeric(i) ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.cls ?? ''}">${(r.cells ?? r).map((c, i) => `<td class="${numeric(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const month = t => monthLabel(S.plan.startMonth, t);

/** Equal instalments that add up exactly to the amount (cents), spaced `gap` months from `start`. */
function split(amount, n, start, gap) {
  const cents = Math.round(amount * 100), part = Math.floor(cents / n);
  return Array.from({length: n}, (_, i) => ({month: start + i * gap, amount: (i === n - 1 ? cents - part * (n - 1) : part) / 100}));
}
function recompute() {
  const p = validatePlan(S.plan);
  if (p.length) { S.analysis = null; S.problems = p; return; }
  try { S.analysis = analyse(S.plan); S.problems = []; } catch (e) { S.analysis = null; S.problems = e.problems ?? [e.message]; }
}
function choose(id) {
  S.club = id; S.plan = CASES[id](); S.instalments = {}; S.impactScenario = 'base';
  for (const d of S.plan.decisions) S.instalments[d.id] = d.type === 'player' ? Math.max(1, d.feePayments.length) : d.type === 'investment' ? d.payments.length : 1;
  recompute(); render();
}

// ------------------------------------------------------------------ chart (display only)
function chart(series, {policy = null, labels = []} = {}) {
  const all = series.flatMap(s => s.values), lo = Math.min(0, policy ?? 0, ...all), hi0 = Math.max(0, policy ?? 0, ...all), hi = hi0 > lo ? hi0 : lo + 1;
  const W = 1000, H = 280, L = 92, B = 26, n = Math.max(...series.map(s => s.values.length));
  const x = t => L + (t / Math.max(1, n - 1)) * (W - L - 12), y = v => 10 + (hi - v) / (hi - lo || 1) * (H - B - 10);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Month-end cash by scenario; the figures are in the tables">
    ${[hi, (hi + lo) / 2, lo].map(v => `<line class="axis" x1="${L}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}"/><text x="4" y="${y(v) + 4}">${esc(money(v))}</text>`).join('')}
    ${lo < 0 ? `<line class="zero" x1="${L}" x2="${W - 12}" y1="${y(0)}" y2="${y(0)}"/>` : ''}${policy !== null ? `<line class="policy" x1="${L}" x2="${W - 12}" y1="${y(policy)}" y2="${y(policy)}"/>` : ''}
    ${series.map((s, k) => `<polyline class="s${k % 5}" points="${s.values.map((v, t) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`).join('')}
    ${labels.map((l, t) => (t % Math.ceil(n / 7) === 0 ? `<text x="${x(t) - 22}" y="${H - 6}">${esc(l)}</text>` : '')).join('')}</svg>
    <p class="legend">${series.map((s, k) => `<span><i class="sw${k % 5}"></i>${esc(s.label)}</span>`).join('')}${policy !== null ? '<span>– – minimum cash policy</span>' : ''}</p>`;
}

// ------------------------------------------------------------------ views
const TABS = [['overview', '1 · Cash forecast'], ['assumptions', '2 · Assumptions'], ['scenarios', '3 · Scenarios'], ['decisions', '4 · Decisions'], ['report', '5 · Risks & report']];
function render() {
  const intro = `<h1>Financial planning for sports clubs</h1><p class="lede">Pick a fictional club, change its assumptions and test a signing or an investment. LANOVA recalculates the monthly accounts and cash, the scenarios, the financial commitments and the risks — then exports a board report.</p>`;
  const clubs = `<div class="clubs" role="group" aria-label="Fictional clubs">${CLUBS.map(c => `<button type="button" class="club" data-club="${c.id}" aria-pressed="${S.club === c.id}"><b>${esc(c.title)}</b><span>${esc(c.text)}</span></button>`).join('')}</div>`;
  if (!S.plan) { main.innerHTML = intro + clubs; return; }
  const tabs = `<nav class="tabs" aria-label="Demonstration steps">${TABS.map(([id, l]) => `<button type="button" data-view="${id}" aria-pressed="${S.view === id}">${esc(l)}</button>`).join('')}</nav>`;
  const problems = S.problems.length ? `<div class="notice bad" role="alert"><b>These inputs cannot be calculated yet:</b><ul>${S.problems.slice(0, 8).map(p => `<li>${esc(p)}</li>`).join('')}</ul>Correct the value or choose the club again to reset it.</div>` : '';
  const body = S.analysis ? ({overview, assumptions, scenarios, decisions, report})[S.view]() : (S.view === 'assumptions' || S.view === 'decisions' ? ({assumptions, decisions})[S.view]() : '');
  main.innerHTML = intro + clubs + `<p class="muted small">${esc(S.plan.name)} · ${S.plan.horizonMonths} months from ${esc(S.plan.startMonth)} · amounts in ${esc(cur())} · fictional data</p>` + tabs + problems + body + next();
}
function next() {
  const i = TABS.findIndex(([id]) => id === S.view), n = TABS[i + 1];
  return `<div class="next">${n ? `<button type="button" class="btn" data-view="${n[0]}">Next: ${esc(n[1].replace(/^\d · /, ''))} →</button>` : ''}<a class="btn primary" href="/demo.html" data-cta="finance-demo-request">Request a demo on your figures</a></div>`;
}
function overview() {
  const a = S.analysis, b = a.base, k = id => kpi(b, id);
  const card = (i, extra = '') => `<div class="kpi ${extra}"><span>${esc(i.label)}</span><b>${i.unit === 'ratio' ? (['dscr', 'commitmentCover'].includes(i.id) ? times(i.value) : pct(i.value)) : `${money(i.value)} <small>${esc(cur())}</small>`}</b><small>${esc(i.period)}</small></div>`;
  const head = ['revenue', 'ebitda', 'netResult', 'closingCash', 'minimumCash', 'liquidityHeadroom', 'commitmentCover', 'prudentLowerBound'].map(id => card(k(id), id === 'liquidityHeadroom' ? (k(id).value < 0 ? 'bad' : 'good') : id === 'commitmentCover' && k(id).value !== null && k(id).value < 1 ? 'bad' : '')).join('');
  const c = b.commitments;
  const rows = [['Operating cash flow', c.operatingCashFlow], ['Loan debt service', -c.bankDebtService], ['Transfer instalments of past deals', -c.transferPaymentsPastDeals], ['Transfer and agent fees of new signings', -c.playerRegistrationsPaid], ['Other financial commitments', -c.otherCommitments], ['Other capital spending', -c.otherCapitalSpending], ['Transfer receipts, loan drawdowns and other receipts', c.transferReceipts + c.loanDrawdowns + c.otherReceipts], ['Cash generated after all commitments', c.cashAfterCommitments]];
  return `<section class="card"><header><div><h2>Base case${a.selected.length ? ` with ${a.selected.length} selected decision(s)` : ''}</h2><p class="muted small">${esc(MONTH_END_NOTICE)}</p></div></header><div class="kpis">${head}</div></section>
    <section class="card"><h2>Month-end cash, by scenario</h2>${chart([...a.scenarios.map(s => ({label: s.label, values: s.cash})), {label: 'Prudent intra-month bound, base (not a forecast)', values: b.months.map(m => m.prudentLowerBound)}], {policy: S.plan.minimumCash, labels: b.months.map(m => m.month)})}<p class="muted small">${esc(PRUDENT_BOUND_LABEL)}</p></section>
    <section class="card"><h2>Financial commitments — ${esc(c.period)}</h2>${table(['Item', `Amount (${cur()})`], rows.map(([l, v], i) => ({cls: i === rows.length - 1 ? 'total' : '', cells: [esc(l), `<span class="${cls(v)}">${money(v)}</span>`]})))}
    <p>Bank debt-service cover: <b>${times(k('dscr').value)}</b> · Financial commitments cover: <b>${times(c.cover)}</b></p><p class="muted small">${esc(c.notice)}</p></section>`;
}
function assumptions() {
  const p = S.plan, used = cat => p.lines.some(l => l.category === cat && l.values.some(v => v > 0));
  const pctInput = (bind, v) => `<input type="number" step="1" inputmode="decimal" data-bind="${bind}" data-type="factor" value="${v === null ? '' : +((v - 1) * 100).toFixed(2)}" aria-label="change in %">`;
  const rows = [...REVENUE.filter(used).map(c => [`${CATEGORIES[c].label} — % change`, ...p.scenarios.map((s, i) => pctInput(`scenarios.${i}.revenueFactors.${c}`, s.revenueFactors[c]))]),
    ...EXPENSE.filter(used).map(c => [`${CATEGORIES[c].label} — % change`, ...p.scenarios.map((s, i) => pctInput(`scenarios.${i}.costFactors.${c}`, s.costFactors[c]))]),
    ['Extra delay collecting revenue (months)', ...p.scenarios.map((s, i) => `<input type="number" min="0" max="6" step="1" data-bind="scenarios.${i}.extraCollectionLagMonths" data-type="int" value="${s.extraCollectionLagMonths}">`)],
    ['Applies from', ...p.scenarios.map((s, i) => `<select data-bind="scenarios.${i}.fromMonth" data-type="int">${Array.from({length: p.horizonMonths}, (_, t) => `<option value="${t}" ${t === s.fromMonth ? 'selected' : ''}>${month(t)}</option>`).join('')}</select>`)]];
  return `<section class="card"><h2>Club position</h2><div class="grid">
      <label>Opening cash (${esc(cur())})<input type="number" step="1000" data-bind="openingCash" data-type="num" value="${p.openingCash}"></label>
      <label>Minimum cash policy (${esc(cur())})<input type="number" step="1000" min="0" data-bind="minimumCash" data-type="num" value="${p.minimumCash}"></label></div></section>
    <section class="card"><h2>Scenario assumptions</h2><p class="muted small">Each scenario has its own assumptions, applied to the club's budget from the month chosen. 0 = as budgeted. Changing one scenario never changes another.</p>
    ${table(['Assumption', ...p.scenarios.map(s => s.label)], rows.map(r => [esc(r[0]), ...r.slice(1)]), () => false)}</section>`;
}
function scenarios() {
  const a = S.analysis, ids = ['revenue', 'ebitda', 'netResult', 'minimumCash', 'closingCash', 'liquidityHeadroom', 'investmentCapacity', 'debt'];
  const names = {revenue: 'Revenue, year 1', ebitda: 'EBITDA, year 1', netResult: 'Net result, year 1', minimumCash: 'Lowest month-end cash', closingCash: 'Cash at the end', liquidityHeadroom: 'Headroom vs policy', investmentCapacity: 'Investment capacity (one-off, now)', debt: 'Debt at the end'};
  return `<section class="card"><h2>Scenario comparison</h2><p class="muted small">Same club and same selected decisions; only the scenario assumptions differ. Amounts in ${esc(cur())}.</p>
    ${table(['Indicator', ...a.scenarios.map(s => s.label)], [...ids.map(id => [esc(names[id]), ...a.scenarios.map(s => `<span class="${id === 'liquidityHeadroom' ? cls(s.kpis[id]) : ''}">${money(s.kpis[id])}</span>`)]), ['Cash policy', ...a.scenarios.map(s => (s.breaches ? '<span class="neg">breached</span>' : '<span class="pos">met</span>'))]])}
    ${chart(a.scenarios.map(s => ({label: s.label, values: s.cash})), {policy: S.plan.minimumCash, labels: a.base.months.map(m => m.month)})}</section>`;
}
const DEC_FIELDS = {
  player: [['transferFee', 'Transfer fee', 'num'], ['agentFee', 'Agent fee', 'num'], ['contractMonths', 'Contract (months)', 'int'], ['monthlyWage', 'Gross wage per month', 'num'], ['employerChargeRate', 'Employer charges (%)', 'rate'], ['signingBonus', 'Signing bonus', 'num']],
  investment: [['amount', 'Amount', 'num'], ['usefulLifeMonths', 'Useful life (months)', 'int'], ['monthlyRevenue', 'Extra revenue per month', 'num'], ['monthlyOperatingCost', 'Extra operating cost per month', 'num']],
  loan: [['principal', 'Principal', 'num'], ['annualRate', 'Annual rate (%)', 'rate'], ['termMonths', 'Term (months)', 'int']],
  cost_change: [['monthlyAmount', 'Change per month (negative = saving)', 'num'], ['oneOffCost', 'One-off cost', 'num']],
  payroll_change: [['monthlyAmount', 'Payroll change per month (negative = cut)', 'num']],
  revenue_change: [['value', 'Change per month', 'num']],
};
const TYPE = {player: 'Signing', investment: 'Investment', loan: 'New loan', cost_change: 'Cost change', payroll_change: 'Payroll change', revenue_change: 'Revenue change'};
function decisions() {
  const p = S.plan;
  const forms = p.decisions.map((d, i) => {
    const fields = (DEC_FIELDS[d.type] ?? []).filter(([k]) => !(d.type === 'revenue_change' && d.mode === 'percent' && k === 'value')).map(([k, l, t]) => `<label>${esc(l)}${t === 'num' ? ` (${esc(cur())})` : ''}<input type="number" step="any" data-dec="${i}" data-key="${k}" data-type="${t}" value="${t === 'rate' ? +(d[k] * 100).toFixed(4) : d[k]}"></label>`).join('');
    const inst = d.type === 'player' || d.type === 'investment' ? `<label>${d.type === 'player' ? 'Fee paid in (yearly instalments)' : 'Paid in (quarterly payments)'}<select data-dec="${i}" data-key="_instalments" data-type="int">${[1, 2, 3].map(n => `<option value="${n}" ${S.instalments[d.id] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : '';
    return `<div class="decision"><header><div><span class="tag">${esc(TYPE[d.type])}</span> <b>${esc(d.label)}</b></div><div class="next"><label class="check"><input type="checkbox" data-dec="${i}" data-key="selected" data-type="bool" ${d.selected ? 'checked' : ''}>Include in the plan</label>${d.id.startsWith('demo-') ? `<button type="button" class="btn small ghost" data-remove="${i}">Remove</button>` : ''}</div></header>
      <div class="grid"><label>From<select data-dec="${i}" data-key="startMonth" data-type="int">${Array.from({length: p.horizonMonths}, (_, t) => `<option value="${t}" ${t === d.startMonth ? 'selected' : ''}>${month(t)}</option>`).join('')}</select></label>${fields}${inst}</div></div>`;
  }).join('');
  let impact = '';
  if (S.analysis) {
    const sc = S.analysis.impact.find(x => x.scenario === S.impactScenario) ?? S.analysis.impact[0];
    const rows = [...sc.decisions, ...(sc.combined ? [{...sc.combined, id: '__c', label: 'Selected decisions together'}] : [])].map(d => d.invalid
      ? [esc(d.label), `<span class="neg">${esc(d.invalid)}</span>`, '', '', '', '', '']
      : [esc(d.label), `<span class="${cls(d.yearly[0].ebitda)}">${signed(d.yearly[0].ebitda)}</span>`, `<span class="${cls(d.closingCashDelta)}">${signed(d.closingCashDelta)}</span>`, `<span class="${cls(d.minimumCashDelta)}">${signed(d.minimumCashDelta)}</span>`, money(d.minimumCash), esc(d.worstMonth), d.breachesPolicy ? '<span class="neg">breached</span>' : '<span class="pos">met</span>']);
    const r = sc.combined?.returns;
    const returns = r ? `<h3>Investment return (estimate)</h3><p class="small"><b>${esc(RETURN_LABEL)}</b></p>${table(['Component', 'Run-rate EBITDA', 'Simple EBITDA yield', 'Simple payback (years)'], [
      ['Asset: selected investments alone', money(r.asset.incrementalEbitda), pct(r.asset.ebitdaYield), r.asset.simplePaybackYears?.toFixed(1) ?? 'n/a'],
      ['Other selected decisions and interactions', signed(r.others.incrementalEbitda), r.others.yieldPoints === null ? 'n/a' : `${r.others.yieldPoints >= 0 ? '+' : '−'}${Math.abs(r.others.yieldPoints * 100).toFixed(1)} pts`, '—'],
      {cls: 'total', cells: ['Combined scenario', money(r.combined.incrementalEbitda), pct(r.combined.ebitdaYield), r.combined.simplePaybackYears?.toFixed(1) ?? 'n/a']}])}` : '';
    impact = `<section class="card"><header><div><h2>Consequences</h2><p class="muted small">Each line is a full recalculation of the club with the decision, against the same club without any decision. Amounts in ${esc(cur())}.</p></div>
      <label>Scenario<select data-ui="impactScenario">${S.plan.scenarios.map(s => `<option value="${s.id}" ${s.id === sc.scenario ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label></header>
      <p class="muted small">Without any decision: lowest cash ${money(sc.baseline.minimumCash)}, cash at the end ${money(sc.baseline.closingCash)}.</p>
      ${table(['Decision', 'EBITDA, year 1', 'Cash at the end', 'Lowest cash', 'Lowest cash after', 'Worst month', 'Cash policy'], rows)}${returns}</section>`;
  }
  return `<section class="card"><header><div><h2>Decisions</h2><p class="muted small">Tick the decisions to include, change their terms, or add one. Fee and agent fee are capitalised and amortised over the contract; the signing bonus is paid at signing and expensed over the contract.</p></div>
    <div class="next"><button type="button" class="btn" data-add="player">+ Add a signing</button><button type="button" class="btn" data-add="investment">+ Add an investment</button></div></header>${forms}</section>${impact}`;
}
function report() {
  const b = S.analysis.base;
  const risks = b.risks.length ? b.risks.map(x => `<p class="risk ${esc(x.severity)}"><b>${esc(x.severity.toUpperCase())}</b> · ${esc(x.message)}</p>`).join('') : '<p class="muted">No rule-based risk flag in the base case.</p>';
  return `<section class="card"><h2>Main risks — base case</h2><p class="muted small">Transparent rules on the calculated figures and the club's own thresholds; not predictions.</p>${risks}</section>
    <section class="card"><h2>Board report</h2><p>Summary with definitions, risks, assumptions and data provenance, monthly forecast and result-to-cash bridge, financial commitments, scenario comparison, consequences of the decisions and limitations — from the plan as you changed it.</p>
    <div class="next"><button type="button" class="btn primary" data-export="pdf">Download PDF</button><button type="button" class="btn" data-export="csv">Download CSV</button><button type="button" class="btn" data-export="html">Download HTML</button></div>
    <p class="muted small">Generated in your browser; marked as a fictional demonstration.</p></section>`;
}

// ------------------------------------------------------------------ events
function parse(type, el) {
  if (type === 'bool') return el.checked;
  const raw = String(el.value).trim(); if (raw === '') return null;
  const n = Number(raw);
  return type === 'factor' ? +(1 + n / 100).toFixed(8) : type === 'rate' ? +(n / 100).toFixed(8) : n;
}
function setPath(path, value) { const keys = path.split('.'); let o = S.plan; for (const k of keys.slice(0, -1)) o = o[k]; o[keys.at(-1)] = value; }
function syncPayments(d) {
  const n = S.instalments[d.id] ?? 1;
  if (d.type === 'player') d.feePayments = d.transferFee > 0 ? split(d.transferFee, n, d.startMonth, 12) : [];
  if (d.type === 'investment') { d.payments = d.amount > 0 ? split(d.amount, n, d.startMonth, 3) : []; d.operationsStartMonth = Math.min(S.plan.horizonMonths - 1, Math.max(d.operationsStartMonth ?? 0, d.startMonth + 3 * n)); }
}
function addDecision(type) {
  const id = `demo-${type}-${++S.added}`, base = {id, selected: true, startMonth: 1, kind: 'assumption', source: 'Demonstration assumption (fictional)', asOf: '2026-06-15', notes: ''};
  const d = type === 'player' ? {...base, label: `New signing ${S.added}`, type, ...TEMPLATES.player[S.club], feePayments: []}
    : {...base, label: `New investment ${S.added}`, type, ...TEMPLATES.investment, payments: [], operationsStartMonth: 7};
  S.instalments[id] = type === 'player' ? 2 : 2; syncPayments(d); S.plan.decisions.push(d);
}
main.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.club) return choose(t.dataset.club);
  if (t.dataset.view) { S.view = t.dataset.view; render(); return main.querySelector('.tabs')?.scrollIntoView({block: 'nearest'}); }
  if (t.dataset.add) { if (S.plan.decisions.length >= 12) return; addDecision(t.dataset.add); recompute(); return render(); }
  if (t.dataset.remove) { S.plan.decisions.splice(Number(t.dataset.remove), 1); recompute(); return render(); }
  if (t.dataset.export) {
    const fmt = t.dataset.export, meta = {organisation: 'LANOVA Finance demonstration — fictional club', generatedAt: new Date().toISOString()};
    const data = fmt === 'pdf' ? reportPdf(S.plan, S.analysis, meta) : fmt === 'csv' ? reportCsv(S.plan, S.analysis, meta) : reportHtml(S.plan, S.analysis, meta);
    const url = URL.createObjectURL(new Blob([data], {type: {pdf: 'application/pdf', csv: 'text/csv', html: 'text/html'}[fmt]}));
    const a = document.createElement('a'); a.href = url; a.download = `lanova-finance-demo-${S.club}.${fmt}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
});
main.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ui) { S[el.dataset.ui] = el.value; return render(); }
  if (el.dataset.bind) setPath(el.dataset.bind, parse(el.dataset.type, el));
  else if (el.dataset.dec !== undefined) {
    const d = S.plan.decisions[Number(el.dataset.dec)], k = el.dataset.key, v = parse(el.dataset.type, el);
    if (k === '_instalments') S.instalments[d.id] = v; else d[k] = v;
    if (['transferFee', 'amount', 'startMonth', '_instalments'].includes(k)) syncPayments(d);
  } else return;
  recompute(); render();
});
render();
