/**
 * LANOVA Finance V1 — monthly budget, forecast, scenarios and decision impact for a sports organisation.
 *
 * Pure JavaScript, no dependency, no network: the same file runs in the browser (interactive forecast) and on the
 * server (saved evidence and exports). Every amount is an explicit input with its provenance (observed, assumption or
 * projection); nothing missing is replaced by zero or by an estimate. Accounting result and cash are computed
 * separately and reconciled by an explicit bridge (see `bridge` in the result).
 *
 * Conventions (documented in finance/README.md):
 *  - Months t = 0..H-1, H = 12, 24 or 36, starting at `startMonth` (YYYY-MM). All flows occur within their month.
 *  - Line values are accrual amounts (income statement). Cash follows `cashLagMonths` (0..6) for revenue and operating
 *    expense lines; amounts still uncollected or unpaid at the end of the horizon are reported as receivables/payables.
 *  - Capital expenditure (including player registrations) is capitalised and depreciated straight-line from the month
 *    after acquisition; its cash follows its own payment schedule.
 *  - Loans: monthly rate = annual rate / 12. Interest is an expense and a financing cash outflow in the same month.
 *  - Taxes are explicit inputs: `tax_expense` (income statement) and `tax_paid` (cash). No tax is computed.
 */

export const SCHEMA = 'lanova-finance-v1';
export const VERSION = 'finance-1.1';
export const HORIZONS = [12, 24, 36];
export const LIMITS = Object.freeze({lines: 80, capex: 40, loans: 10, decisions: 12, scenarios: 6, imports: 20, amount: 1e10, lag: 6, paymentMonths: 120});

export const REVENUE = ['ticketing', 'sponsorship', 'media', 'commercial', 'other_revenue'];
export const EXPENSE = ['payroll', 'payroll_taxes', 'operating'];
export const CATEGORIES = Object.freeze({
  ticketing: {label: 'Ticketing and matchday', group: 'revenue'},
  sponsorship: {label: 'Sponsorship', group: 'revenue'},
  media: {label: 'Media and broadcasting rights', group: 'revenue'},
  commercial: {label: 'Commercial (merchandising, hospitality, other trading)', group: 'revenue'},
  other_revenue: {label: 'Other operating revenue', group: 'revenue'},
  payroll: {label: 'Payroll — gross wages and bonuses (players and staff)', group: 'expense'},
  payroll_taxes: {label: 'Employer social charges on payroll', group: 'expense'},
  operating: {label: 'Other operating expenses', group: 'expense'},
  existing_depreciation: {label: 'Depreciation and amortisation of existing assets (non-cash)', group: 'pnl'},
  tax_expense: {label: 'Income tax expense (income statement only)', group: 'pnl'},
  tax_paid: {label: 'Income tax paid (cash only)', group: 'cash_out'},
  opening_receivables: {label: 'Collection of receivables existing at the start (operating cash, not revenue)', group: 'cash_in'},
  opening_payables: {label: 'Settlement of operating payables existing at the start (operating cash, not expense)', group: 'cash_out'},
  transfer_receipts: {label: 'Transfer instalments receivable for players sold before the plan (cash only)', group: 'cash_in'},
  transfer_payments: {label: 'Transfer instalments payable for players signed before the plan (cash only)', group: 'cash_out'},
  cash_in_other: {label: 'Other cash receipts, not revenue (e.g. equity injection, grants)', group: 'cash_in'},
  cash_out_other: {label: 'Other financial commitments paid, not expenses (e.g. litigation settlement, dividends)', group: 'cash_out'},
});
export const KINDS = ['observed', 'assumption', 'projection'];
export const CAPEX_CATEGORIES = ['infrastructure', 'player_registration', 'equipment', 'other'];
export const REPAYMENTS = ['annuity', 'linear', 'bullet'];
export const DECISION_TYPES = ['player', 'payroll_change', 'cost_change', 'revenue_change', 'loan', 'investment'];
export const REQUIRED_SCENARIOS = ['base', 'downside', 'upside'];
/** Shown wherever month-end balances are shown: the order of flows within a month is unknown. */
export const MONTH_END_NOTICE = 'Month-end balances: payments and receipts within a month are not modelled, and their order is unknown.';
export const PRUDENT_BOUND_LABEL = 'Prudent bound: if every payment of the month came before every receipt — not a forecast.';
export const INTERNAL_RATIO_NOTICE = 'Internal LANOVA calculation, not certified; not a bank covenant calculation.';
export const RETURN_LABEL = 'Simple EBITDA yield (run-rate year, undiscounted) — not an IRR or an NPV.';

export class FinanceError extends Error { constructor(problems) { super(problems.join('; ')); this.problems = problems; } }

// ------------------------------------------------------------------ helpers
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sum = a => a.reduce((s, v) => s + v, 0);
const zeros = n => Array(n).fill(0);
const round2 = v => Math.round(v * 100) / 100;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export function monthLabel(startMonth, t) {
  const [, y, m] = startMonth.match(MONTH);
  const k = Number(y) * 12 + Number(m) - 1 + t;
  return `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`;
}
export function monthIndex(startMonth, month) {
  const a = startMonth.match(MONTH), b = String(month).match(MONTH);
  if (!a || !b) return null;
  return (Number(b[1]) * 12 + Number(b[2])) - (Number(a[1]) * 12 + Number(a[2]));
}
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

// ------------------------------------------------------------------ validation (strict allow-list)
const PLAN_KEYS = ['schema', 'name', 'currency', 'fictional', 'startMonth', 'horizonMonths', 'openingCash', 'minimumCash', 'policy', 'source', 'asOf', 'lines', 'capex', 'loans', 'scenarios', 'decisions', 'imports'];

/** Returns a list of problems (empty when the plan is valid). Unknown fields are refused, never dropped. */
export function validatePlan(m) {
  const p = [];
  if (!obj(m)) return ['plan: object required'];
  const known = (o, keys, path) => { if (obj(o)) for (const k of Object.keys(o)) if (!keys.includes(k)) p.push(`${path}.${k}: unsupported field`); };
  const text = (v, path, max = 120) => { if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) p.push(`${path}: non-empty text, at most ${max} characters`); };
  const optText = (v, path, max = 1000) => { if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))) p.push(`${path}: text, at most ${max} characters`); };
  const num = (v, path, lo = 0, hi = LIMITS.amount) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) p.push(`${path}: number between ${lo} and ${hi} required (a missing value is not zero)`); };
  const int = (v, path, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) p.push(`${path}: whole number ${lo}..${hi} required`); };
  const date = (v, path) => { if (!validDate(v)) p.push(`${path}: valid ISO date (YYYY-MM-DD) required`); };
  const prov = (x, path) => { text(x.source, `${path}.source`, 300); date(x.asOf, `${path}.asOf`); if (!KINDS.includes(x.kind)) p.push(`${path}.kind: observed, assumption or projection required`); };
  const ids = new Set();
  const ident = (x, path) => {
    if (typeof x.id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(x.id)) p.push(`${path}.id: safe identifier (letters, digits, - or _) required`);
    else if (ids.has(x.id)) p.push(`${path}.id: "${x.id}" is used twice`);
    else ids.add(x.id);
    text(x.label, `${path}.label`, 80);
  };

  known(m, PLAN_KEYS, 'plan');
  if (m.schema !== SCHEMA) p.push(`schema: ${SCHEMA} required`);
  text(m.name, 'name'); text(m.source, 'source', 1000); date(m.asOf, 'asOf');
  if (!/^[A-Z]{3}$/.test(m.currency ?? '')) p.push('currency: three uppercase letters required (ISO 4217)');
  if (typeof m.fictional !== 'boolean') p.push('fictional: explicit true or false required');
  if (typeof m.startMonth !== 'string' || !MONTH.test(m.startMonth)) p.push('startMonth: YYYY-MM required');
  if (!HORIZONS.includes(m.horizonMonths)) return [...p, 'horizonMonths: 12, 24 or 36 required'];
  const H = m.horizonMonths, validStart = typeof m.startMonth === 'string' && MONTH.test(m.startMonth);
  num(m.openingCash, 'openingCash', -LIMITS.amount); num(m.minimumCash, 'minimumCash');
  if (!obj(m.policy)) p.push('policy: object required (use null values for thresholds you do not monitor)');
  else {
    known(m.policy, ['payrollRatioLimit', 'minimumDscr'], 'policy');
    for (const [k, hi] of [['payrollRatioLimit', 2], ['minimumDscr', 10]]) if (m.policy[k] !== null) num(m.policy[k], `policy.${k}`, 0, hi);
  }
  const series = (a, path) => {
    if (!Array.isArray(a) || a.length !== H) return p.push(`${path}: exactly ${H} monthly amounts required`);
    a.forEach((v, i) => num(v, `${path}[${i}]${validStart ? ` (${monthLabel(m.startMonth, i)})` : ''}`));
  };
  const payments = (a, total, path) => {
    if (!Array.isArray(a) || a.length > 24) return p.push(`${path}: list of at most 24 payments required`);
    a.forEach((x, i) => { if (!obj(x)) return p.push(`${path}[${i}]: object required`); known(x, ['month', 'amount'], `${path}[${i}]`); int(x.month, `${path}[${i}].month`, 0, LIMITS.paymentMonths - 1); num(x.amount, `${path}[${i}].amount`, 0.01); });
    if (a.every(x => typeof x?.amount === 'number') && Number.isFinite(total) && Math.abs(sum(a.map(x => x.amount)) - total) > 0.005) p.push(`${path}: payments must add up to ${total}`);
  };

  // Lines
  if (!Array.isArray(m.lines) || m.lines.length > LIMITS.lines) p.push(`lines: list of at most ${LIMITS.lines} lines required`);
  else {
    const seen = new Map();
    m.lines.forEach((x, i) => {
      const q = `lines[${i}]`; if (!obj(x)) return p.push(`${q}: object required`);
      known(x, ['id', 'label', 'category', 'values', 'cashLagMonths', 'kind', 'source', 'asOf'], q);
      ident(x, q); prov(x, q); series(x.values, `${q}.values`);
      if (!CATEGORIES[x.category]) p.push(`${q}.category: one of ${Object.keys(CATEGORIES).join(', ')}`);
      const lagAllowed = REVENUE.includes(x.category) || EXPENSE.includes(x.category);
      int(x.cashLagMonths, `${q}.cashLagMonths`, 0, lagAllowed ? LIMITS.lag : 0);
      if (typeof x.label === 'string' && /\b(sub-?total|total|sous-total|grand total)\b/i.test(x.label)) p.push(`${q}.label: "${x.label}" looks like a total; enter detail lines only, totals are calculated (prevents double counting)`);
      const key = `${x.category}|${String(x.label ?? '').trim().toLowerCase()}`;
      if (seen.has(key)) p.push(`${q}: same category and label as ${seen.get(key)} — possible double counting; merge or rename the lines`); else seen.set(key, q);
    });
  }
  // Capital expenditure
  const capexItem = (x, q, {acquisitionMax = H - 1} = {}) => {
    known(x, ['id', 'label', 'category', 'acquisitionMonth', 'amount', 'usefulLifeMonths', 'payments', 'kind', 'source', 'asOf'], q);
    ident(x, q); prov(x, q);
    if (!CAPEX_CATEGORIES.includes(x.category)) p.push(`${q}.category: one of ${CAPEX_CATEGORIES.join(', ')}`);
    int(x.acquisitionMonth, `${q}.acquisitionMonth`, 0, acquisitionMax); num(x.amount, `${q}.amount`, 0.01); int(x.usefulLifeMonths, `${q}.usefulLifeMonths`, 1, 600);
    payments(x.payments, x.amount, `${q}.payments`);
  };
  if (!Array.isArray(m.capex) || m.capex.length > LIMITS.capex) p.push(`capex: list of at most ${LIMITS.capex} items required`);
  else m.capex.forEach((x, i) => obj(x) ? capexItem(x, `capex[${i}]`) : p.push(`capex[${i}]: object required`));
  // Loans
  const loanTerms = (x, q) => { num(x.principal, `${q}.principal`, 0.01); num(x.annualRate, `${q}.annualRate`, 0, 1); int(x.termMonths, `${q}.termMonths`, 1, 600); if (!REPAYMENTS.includes(x.repayment)) p.push(`${q}.repayment: annuity, linear or bullet`); };
  if (!Array.isArray(m.loans) || m.loans.length > LIMITS.loans) p.push(`loans: list of at most ${LIMITS.loans} loans required`);
  else m.loans.forEach((x, i) => {
    const q = `loans[${i}]`; if (!obj(x)) return p.push(`${q}: object required`);
    known(x, ['id', 'label', 'existing', 'principal', 'annualRate', 'drawMonth', 'termMonths', 'repayment', 'kind', 'source', 'asOf'], q);
    ident(x, q); prov(x, q); loanTerms(x, q);
    if (typeof x.existing !== 'boolean') p.push(`${q}.existing: explicit true (already drawn; principal = outstanding balance) or false`);
    else if (x.existing && x.drawMonth !== null) p.push(`${q}.drawMonth: must be null for an existing loan (its balance is already in opening cash)`);
    else if (!x.existing) int(x.drawMonth, `${q}.drawMonth`, 0, H - 1);
  });
  // Scenarios
  if (!Array.isArray(m.scenarios) || m.scenarios.length < 3 || m.scenarios.length > LIMITS.scenarios) p.push(`scenarios: 3 to ${LIMITS.scenarios} scenarios required`);
  else {
    const sids = new Set();
    m.scenarios.forEach((s, i) => {
      const q = `scenarios[${i}]`; if (!obj(s)) return p.push(`${q}: object required`);
      known(s, ['id', 'label', 'revenueFactors', 'costFactors', 'capexFactor', 'extraCollectionLagMonths', 'newLoanRateDelta', 'fromMonth', 'notes'], q);
      if (typeof s.id !== 'string' || !/^[a-z0-9_-]{1,30}$/.test(s.id) || sids.has(s.id)) p.push(`${q}.id: unique lowercase identifier required`); else sids.add(s.id);
      text(s.label, `${q}.label`, 60); optText(s.notes, `${q}.notes`);
      if (!obj(s.revenueFactors)) p.push(`${q}.revenueFactors: one factor per revenue category required`);
      else { known(s.revenueFactors, REVENUE, `${q}.revenueFactors`); for (const c of REVENUE) num(s.revenueFactors[c], `${q}.revenueFactors.${c}`, 0, 3); }
      if (!obj(s.costFactors)) p.push(`${q}.costFactors: one factor per expense category required`);
      else { known(s.costFactors, EXPENSE, `${q}.costFactors`); for (const c of EXPENSE) num(s.costFactors[c], `${q}.costFactors.${c}`, 0, 3); }
      num(s.capexFactor, `${q}.capexFactor`, 0, 3); int(s.extraCollectionLagMonths, `${q}.extraCollectionLagMonths`, 0, LIMITS.lag);
      num(s.newLoanRateDelta, `${q}.newLoanRateDelta`, -0.2, 0.2); int(s.fromMonth, `${q}.fromMonth`, 0, H - 1);
    });
    for (const id of REQUIRED_SCENARIOS) if (!sids.has(id)) p.push(`scenarios: a "${id}" scenario is required`);
  }
  // Decisions
  if (!Array.isArray(m.decisions) || m.decisions.length > LIMITS.decisions) p.push(`decisions: list of at most ${LIMITS.decisions} decisions required`);
  else m.decisions.forEach((d, i) => {
    const q = `decisions[${i}]`; if (!obj(d)) return p.push(`${q}: object required`);
    const common = ['id', 'label', 'type', 'selected', 'startMonth', 'kind', 'source', 'asOf', 'notes'];
    const extra = {player: ['transferFee', 'feePayments', 'agentFee', 'contractMonths', 'monthlyWage', 'employerChargeRate', 'signingBonus'],
      payroll_change: ['monthlyAmount', 'employerChargeRate', 'endMonth'], cost_change: ['monthlyAmount', 'oneOffCost', 'endMonth'],
      revenue_change: ['category', 'mode', 'value', 'endMonth'], loan: ['principal', 'annualRate', 'termMonths', 'repayment'],
      investment: ['amount', 'usefulLifeMonths', 'payments', 'capexCategory', 'revenueCategory', 'monthlyRevenue', 'monthlyOperatingCost', 'operationsStartMonth']}[d.type];
    if (!extra) return p.push(`${q}.type: one of ${DECISION_TYPES.join(', ')}`);
    known(d, [...common, ...extra], q); ident(d, q); prov(d, q); optText(d.notes, `${q}.notes`);
    if (typeof d.selected !== 'boolean') p.push(`${q}.selected: explicit true (in the decided plan) or false`);
    int(d.startMonth, `${q}.startMonth`, 0, H - 1);
    const end = () => { if (d.endMonth !== null) { int(d.endMonth, `${q}.endMonth`, 0, H - 1); if (Number.isInteger(d.endMonth) && d.endMonth < d.startMonth) p.push(`${q}.endMonth: not before startMonth`); } };
    if (d.type === 'player') {
      num(d.transferFee, `${q}.transferFee`); num(d.agentFee, `${q}.agentFee`); int(d.contractMonths, `${q}.contractMonths`, 1, 72);
      num(d.monthlyWage, `${q}.monthlyWage`); num(d.employerChargeRate, `${q}.employerChargeRate`, 0, 1); num(d.signingBonus, `${q}.signingBonus`);
      if (d.transferFee > 0) payments(d.feePayments, d.transferFee, `${q}.feePayments`);
      else if (!Array.isArray(d.feePayments) || d.feePayments.length) p.push(`${q}.feePayments: empty list when there is no transfer fee`);
      if (Array.isArray(d.feePayments) && d.feePayments.some(x => Number.isInteger(x?.month) && x.month < d.startMonth)) p.push(`${q}.feePayments: no instalment before the signing month`);
    } else if (d.type === 'payroll_change') { num(d.monthlyAmount, `${q}.monthlyAmount`, -LIMITS.amount); num(d.employerChargeRate, `${q}.employerChargeRate`, 0, 1); end(); }
    else if (d.type === 'cost_change') { num(d.monthlyAmount, `${q}.monthlyAmount`, -LIMITS.amount); num(d.oneOffCost, `${q}.oneOffCost`); end(); }
    else if (d.type === 'revenue_change') {
      if (!REVENUE.includes(d.category)) p.push(`${q}.category: one of ${REVENUE.join(', ')}`);
      if (!['percent', 'amount'].includes(d.mode)) p.push(`${q}.mode: percent (of the category) or amount (per month)`);
      else if (d.mode === 'percent') num(d.value, `${q}.value`, -1, 2); else num(d.value, `${q}.value`, -LIMITS.amount);
      end();
    } else if (d.type === 'loan') loanTerms(d, q);
    else if (d.type === 'investment') {
      num(d.amount, `${q}.amount`, 0.01); int(d.usefulLifeMonths, `${q}.usefulLifeMonths`, 1, 600); payments(d.payments, d.amount, `${q}.payments`);
      if (!CAPEX_CATEGORIES.includes(d.capexCategory) || d.capexCategory === 'player_registration') p.push(`${q}.capexCategory: infrastructure, equipment or other (players use the player decision)`);
      if (!REVENUE.includes(d.revenueCategory)) p.push(`${q}.revenueCategory: one of ${REVENUE.join(', ')}`);
      num(d.monthlyRevenue, `${q}.monthlyRevenue`); num(d.monthlyOperatingCost, `${q}.monthlyOperatingCost`); int(d.operationsStartMonth, `${q}.operationsStartMonth`, 0, H - 1);
      if (Array.isArray(d.payments) && d.payments.some(x => Number.isInteger(x?.month) && x.month < d.startMonth)) p.push(`${q}.payments: no payment before the decision month`);
    }
  });
  // Import metadata (provenance of imported files)
  if (!Array.isArray(m.imports) || m.imports.length > LIMITS.imports) p.push(`imports: list of at most ${LIMITS.imports} records required`);
  else m.imports.forEach((x, i) => {
    const q = `imports[${i}]`; if (!obj(x)) return p.push(`${q}: object required`);
    known(x, ['file', 'format', 'sha256', 'rows', 'lines', 'importedAt'], q);
    text(x.file, `${q}.file`, 200); if (!['csv', 'xlsx'].includes(x.format)) p.push(`${q}.format: csv or xlsx`);
    if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256)) p.push(`${q}.sha256: hex digest required`);
    int(x.rows, `${q}.rows`, 1, 100000); if (!Array.isArray(x.lines) || x.lines.some(id => typeof id !== 'string')) p.push(`${q}.lines: imported line ids required`);
    if (typeof x.importedAt !== 'string' || Number.isNaN(Date.parse(x.importedAt))) p.push(`${q}.importedAt: ISO timestamp required`);
  });
  return p;
}
export function canonicalPlan(input) { const p = validatePlan(input); if (p.length) throw new FinanceError(p); return structuredClone(input); }

// ------------------------------------------------------------------ schedules
/** Monthly schedule of one loan over the horizon. Payments at the end of each month. */
export function loanSchedule(loan, H, rateDelta = 0) {
  const r = Math.max(0, loan.annualRate + (loan.existing ? 0 : rateDelta)) / 12;
  const draw = loan.existing ? 0 : loan.drawMonth, first = loan.existing ? 0 : loan.drawMonth + 1, n = loan.termMonths;
  const drawdown = zeros(H), interest = zeros(H), principal = zeros(H), balance = zeros(H);
  if (!loan.existing && draw < H) drawdown[draw] = loan.principal;
  let bal = loan.principal;
  const pmt = loan.repayment === 'annuity' ? (r ? loan.principal * r / (1 - (1 + r) ** -n) : loan.principal / n) : null;
  for (let t = 0; t < H; t++) {
    const k = t - first; // payment number 0..n-1
    if (k >= 0 && k < n && bal > 0) {
      const i = bal * r;
      let pr = loan.repayment === 'annuity' ? pmt - i : loan.repayment === 'linear' ? loan.principal / n : (k === n - 1 ? bal : 0);
      if (k === n - 1 || pr > bal) pr = bal;
      interest[t] = i; principal[t] = pr; bal -= pr;
    }
    balance[t] = t < draw ? 0 : bal;
  }
  return {drawdown, interest, principal, balance};
}
/** Straight-line depreciation from the month after acquisition; cash per payment schedule (scaled by factor). */
function capexSchedule(c, H, factor = 1) {
  const f = c.category === 'player_registration' ? 1 : factor, amount = c.amount * f;
  const paid = zeros(H), dep = zeros(H); let later = 0;
  for (const x of c.payments) { if (x.month < H) paid[x.month] += x.amount * f; else later += x.amount * f; }
  for (let t = c.acquisitionMonth + 1; t < H && t <= c.acquisitionMonth + c.usefulLifeMonths; t++) dep[t] = amount / c.usefulLifeMonths;
  const netBookValue = amount - sum(dep);
  return {amount, paid, dep, paidAfterHorizon: later, netBookValue};
}

// ------------------------------------------------------------------ decisions → explicit components
/** Each decision becomes lines, capital items, loans and prepaid items. These are the only effects a decision has. */
export function decisionComponents(d, plan, baseRevenueByCategory) {
  const H = plan.horizonMonths, span = (from, to, v) => zeros(H).map((_, t) => (t >= from && t <= to ? v : 0));
  const prov = {kind: d.kind, source: d.source, asOf: d.asOf};
  const out = {lines: [], capex: [], loans: [], prepaid: []};
  const end = d.endMonth ?? H - 1;
  if (d.type === 'player') {
    const last = d.startMonth + d.contractMonths - 1;
    out.lines.push({id: `${d.id}:wage`, label: `${d.label} — wages`, category: 'payroll', values: span(d.startMonth, last, d.monthlyWage), cashLagMonths: 0, ...prov});
    out.lines.push({id: `${d.id}:charges`, label: `${d.label} — employer charges`, category: 'payroll_taxes', values: span(d.startMonth, last, d.monthlyWage * d.employerChargeRate), cashLagMonths: 0, ...prov});
    if (d.transferFee + d.agentFee > 0) out.capex.push({id: `${d.id}:registration`, label: `${d.label} — registration (fee + agent)`, category: 'player_registration', acquisitionMonth: d.startMonth,
      amount: d.transferFee + d.agentFee, usefulLifeMonths: d.contractMonths, payments: [...d.feePayments, ...(d.agentFee > 0 ? [{month: d.startMonth, amount: d.agentFee}] : [])], ...prov});
    // Signing bonus: paid in cash at signing, expensed straight-line over the contract (prepaid expense).
    if (d.signingBonus > 0) out.prepaid.push({id: `${d.id}:signing`, category: 'payroll', paidMonth: d.startMonth, amount: d.signingBonus, fromMonth: d.startMonth, months: d.contractMonths});
  } else if (d.type === 'payroll_change') {
    out.lines.push({id: `${d.id}:payroll`, label: d.label, category: 'payroll', values: span(d.startMonth, end, d.monthlyAmount), cashLagMonths: 0, signed: true, ...prov});
    out.lines.push({id: `${d.id}:charges`, label: `${d.label} — employer charges`, category: 'payroll_taxes', values: span(d.startMonth, end, d.monthlyAmount * d.employerChargeRate), cashLagMonths: 0, signed: true, ...prov});
  } else if (d.type === 'cost_change') {
    const v = span(d.startMonth, end, d.monthlyAmount); v[d.startMonth] += d.oneOffCost;
    out.lines.push({id: `${d.id}:operating`, label: d.label, category: 'operating', values: v, cashLagMonths: 0, signed: true, ...prov});
  } else if (d.type === 'revenue_change') {
    const base = baseRevenueByCategory[d.category];
    const v = zeros(H).map((_, t) => (t >= d.startMonth && t <= end ? (d.mode === 'percent' ? base[t] * d.value : d.value) : 0));
    out.lines.push({id: `${d.id}:revenue`, label: d.label, category: d.category, values: v, cashLagMonths: 0, signed: true, preScaled: d.mode === 'percent', ...prov});
  } else if (d.type === 'loan') {
    out.loans.push({id: `${d.id}:loan`, label: d.label, existing: false, principal: d.principal, annualRate: d.annualRate, drawMonth: d.startMonth, termMonths: d.termMonths, repayment: d.repayment, ...prov});
  } else if (d.type === 'investment') {
    out.capex.push({id: `${d.id}:capex`, label: d.label, category: d.capexCategory, acquisitionMonth: d.startMonth, amount: d.amount, usefulLifeMonths: d.usefulLifeMonths, payments: d.payments, ...prov});
    if (d.monthlyRevenue > 0) out.lines.push({id: `${d.id}:revenue`, label: `${d.label} — revenue`, category: d.revenueCategory, values: span(d.operationsStartMonth, H - 1, d.monthlyRevenue), cashLagMonths: 0, ...prov});
    if (d.monthlyOperatingCost > 0) out.lines.push({id: `${d.id}:costs`, label: `${d.label} — operating costs`, category: 'operating', values: span(d.operationsStartMonth, H - 1, d.monthlyOperatingCost), cashLagMonths: 0, ...prov});
  }
  return out;
}

// ------------------------------------------------------------------ forecast
export function scenarioOf(plan, id) {
  const s = plan.scenarios.find(x => x.id === id);
  if (!s) throw new FinanceError([`Unknown scenario "${id}"`]);
  return s;
}

/**
 * Monthly forecast of the plan under one scenario, with the given decisions applied (ids; default: the selected ones).
 * Returns monthly rows, fiscal-year totals (12-month blocks from startMonth), horizon totals, the accounting-to-cash
 * bridge, indicators with definitions and sources, and rule-based risk flags.
 */
export function forecast(input, {scenario = 'base', decisions} = {}) {
  const plan = canonicalPlan(input);
  return compute(plan, scenarioOf(plan, scenario), decisions ?? plan.decisions.filter(d => d.selected).map(d => d.id));
}

function compute(plan, sc, decisionIds) {
  const H = plan.horizonMonths, applied = plan.decisions.filter(d => decisionIds.includes(d.id));
  const unknown = decisionIds.filter(id => !plan.decisions.some(d => d.id === id));
  if (unknown.length) throw new FinanceError([`Unknown decision(s): ${unknown.join(', ')}`]);
  const factorOf = cat => REVENUE.includes(cat) ? sc.revenueFactors[cat] : EXPENSE.includes(cat) ? sc.costFactors[cat] : 1;
  const scaled = (values, cat) => values.map((v, t) => (t >= sc.fromMonth ? v * factorOf(cat) : v));
  const accrual = Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, zeros(H)]));
  const cash = Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, zeros(H)]));
  const pending = {receivables: 0, payables: 0};
  const sourcesByCategory = Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, {lines: [], kinds: {observed: 0, assumption: 0, projection: 0}}]));

  // Base revenue per category after the scenario (percent-based revenue decisions apply to it).
  const baseRevenue = Object.fromEntries(REVENUE.map(c => [c, zeros(H)]));
  for (const l of plan.lines) if (REVENUE.includes(l.category)) scaled(l.values, l.category).forEach((v, t) => { baseRevenue[l.category][t] += v; });

  const components = applied.map(d => decisionComponents(d, plan, baseRevenue));
  const lines = [...plan.lines, ...components.flatMap(c => c.lines)];
  for (const l of lines) {
    const vals = l.preScaled ? l.values : scaled(l.values, l.category); // percent changes already apply to the scenario's revenue
    const lag = l.cashLagMonths + (REVENUE.includes(l.category) ? sc.extraCollectionLagMonths : 0);
    vals.forEach((v, t) => {
      accrual[l.category][t] += v;
      if (t + lag < H) cash[l.category][t + lag] += v;
      else if (REVENUE.includes(l.category)) pending.receivables += v;
      else if (EXPENSE.includes(l.category)) pending.payables += v;
    });
    const src = sourcesByCategory[l.category], total = sum(vals);
    src.lines.push({id: l.id, label: l.label, kind: l.kind, source: l.source, asOf: l.asOf, total, decision: l.id.includes(':') ? l.id.split(':')[0] : null});
    src.kinds[l.kind] += total;
  }
  // Prepaid items (signing bonuses): cash when paid, expense spread over the contract months (within the horizon).
  let prepaidCash = 0, prepaidExpense = 0;
  for (const c of components) for (const x of c.prepaid) {
    const f = factorOf(x.category);
    if (x.paidMonth < H) { cash[x.category][x.paidMonth] += x.amount * f; prepaidCash += x.amount * f; }
    for (let t = x.fromMonth; t < Math.min(H, x.fromMonth + x.months); t++) { accrual[x.category][t] += x.amount * f / x.months; prepaidExpense += x.amount * f / x.months; }
  }
  for (const [cat, a] of Object.entries(accrual)) if (a.some(v => v < -0.005)) throw new FinanceError([`Decisions make ${CATEGORIES[cat].label} negative in ${monthLabel(plan.startMonth, a.findIndex(v => v < -0.005))}; this combination is not valid`]);

  const capexItems = [...plan.capex, ...components.flatMap(c => c.capex)].map(c => ({...c, ...capexSchedule(c, H, sc.capexFactor)}));
  const loanItems = [...plan.loans, ...components.flatMap(c => c.loans)].map(l => ({...l, ...loanSchedule(l, H, sc.newLoanRateDelta)}));
  const col = (items, k) => zeros(H).map((_, t) => sum(items.map(x => x[k][t])));
  const depNew = col(capexItems, 'dep'), capexPaid = col(capexItems, 'paid'), playerPaid = col(capexItems.filter(c => c.category === 'player_registration'), 'paid');
  const interest = col(loanItems, 'interest'), principal = col(loanItems, 'principal'), drawdowns = col(loanItems, 'drawdown'), debt = col(loanItems, 'balance');

  let cashBal = plan.openingCash;
  const months = Array.from({length: H}, (_, t) => {
    const rev = Object.fromEntries(REVENUE.map(c => [c, accrual[c][t]]));
    const revenue = sum(Object.values(rev));
    const payroll = accrual.payroll[t], payrollTaxes = accrual.payroll_taxes[t], operating = accrual.operating[t];
    const ebitda = revenue - payroll - payrollTaxes - operating;
    const depreciation = accrual.existing_depreciation[t] + depNew[t];
    const operatingResult = ebitda - depreciation, preTaxResult = operatingResult - interest[t], taxExpense = accrual.tax_expense[t];
    const netResult = preTaxResult - taxExpense;
    // Receivables and payables existing at the start are operating cash (working capital), never revenue or expense.
    const receipts = sum(REVENUE.map(c => cash[c][t])) + cash.opening_receivables[t], operatingPayments = sum(EXPENSE.map(c => cash[c][t])) + cash.opening_payables[t], taxPaid = cash.tax_paid[t];
    const operatingCashFlow = receipts - operatingPayments - taxPaid;
    const investingCashFlow = -capexPaid[t], financingCashFlow = drawdowns[t] - principal[t] - interest[t];
    // Transfer instalments of past deals stay in the same "other cash" bucket as before (balances unchanged); they are
    // also reported separately as transfer commitments.
    const otherCashFlow = cash.cash_in_other[t] + cash.transfer_receipts[t] - cash.cash_out_other[t] - cash.transfer_payments[t];
    const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow + otherCashFlow;
    // Gross monthly flows actually known to the model. netCashFlow = cashIn − cashOut exactly.
    const cashIn = receipts + drawdowns[t] + cash.cash_in_other[t] + cash.transfer_receipts[t];
    const cashOut = operatingPayments + taxPaid + capexPaid[t] + principal[t] + interest[t] + cash.cash_out_other[t] + cash.transfer_payments[t];
    const openingCash = cashBal; cashBal += netCashFlow;
    return {t, month: monthLabel(plan.startMonth, t), ...rev, revenue, payroll, payrollTaxes, operating, ebitda, depreciation, operatingResult, interest: interest[t], preTaxResult, taxExpense, netResult,
      receipts, operatingPayments, taxPaid, operatingCashFlow, capexPaid: capexPaid[t], investingCashFlow, loanDrawdowns: drawdowns[t], principalRepaid: principal[t], interestPaid: interest[t], financingCashFlow,
      otherCashIn: cash.cash_in_other[t], otherCashOut: cash.cash_out_other[t], otherCashFlow, netCashFlow, openingCash, closingCash: cashBal, debtBalance: debt[t],
      // Added in finance-1.1 (appended so that existing export columns keep their order).
      transferPayments: cash.transfer_payments[t], transferReceipts: cash.transfer_receipts[t], playerRegistrationsPaid: playerPaid[t],
      cashInGross: cashIn, cashOutGross: cashOut, prudentLowerBound: openingCash - cashOut};
  });
  const FLOWS = ['revenue', ...REVENUE, 'payroll', 'payrollTaxes', 'operating', 'ebitda', 'depreciation', 'operatingResult', 'interest', 'preTaxResult', 'taxExpense', 'netResult', 'receipts', 'operatingPayments', 'taxPaid',
    'operatingCashFlow', 'capexPaid', 'investingCashFlow', 'loanDrawdowns', 'principalRepaid', 'interestPaid', 'financingCashFlow', 'otherCashIn', 'otherCashOut', 'otherCashFlow', 'netCashFlow',
    'transferPayments', 'transferReceipts', 'playerRegistrationsPaid', 'cashInGross', 'cashOutGross'];
  const aggregate = rows => ({...Object.fromEntries(FLOWS.map(k => [k, sum(rows.map(r => r[k]))])), openingCash: rows[0].openingCash, closingCash: rows.at(-1).closingCash,
    minimumCash: Math.min(...rows.map(r => r.closingCash)), debtBalance: rows.at(-1).debtBalance, prudentLowerBound: Math.min(...rows.map(r => r.prudentLowerBound))});
  const years = Array.from({length: H / 12}, (_, y) => ({year: y + 1, from: months[y * 12].month, to: months[y * 12 + 11].month, ...aggregate(months.slice(y * 12, y * 12 + 12))}));
  const totals = aggregate(months);

  // Accounting result → cash: every difference is an explicit, named item. Must reconcile to the cent.
  const depTotal = totals.depreciation, receivables = pending.receivables, payables = pending.payables;
  const bridge = [
    ['Net result', totals.netResult],
    ['Add back depreciation and amortisation (non-cash)', depTotal],
    ['Tax expense not paid in cash (tax expense − tax paid)', totals.taxExpense - totals.taxPaid],
    ['Revenue accrued but not yet collected at the end of the horizon', -receivables],
    ['Expenses accrued but not yet paid at the end of the horizon', payables],
    ['Receivables collected less payables settled that existed at the start', sum(cash.opening_receivables) - sum(cash.opening_payables)],
    ['Signing bonuses paid in cash but expensed over the contract (prepaid)', prepaidExpense - prepaidCash],
    ['Capital expenditure paid', -totals.capexPaid],
    ['Loan drawdowns', totals.loanDrawdowns],
    ['Loan principal repaid', -totals.principalRepaid],
    ['Other cash receipts and payments (not in the result)', totals.otherCashFlow],
  ].map(([label, amount]) => ({label, amount}));
  const bridgeTotal = sum(bridge.map(b => b.amount));
  if (Math.abs(bridgeTotal - totals.netCashFlow) > 0.01) throw new FinanceError([`Internal reconciliation failed by ${round2(bridgeTotal - totals.netCashFlow)}; no result is shown`]);

  const closingDebt = months.at(-1).debtBalance, nextYear = months.slice(0, 12);
  const minRow = months.reduce((a, b) => (b.closingCash < a.closingCash ? b : a));
  const belowFloor = months.filter(r => r.closingCash < plan.minimumCash - 0.005);
  const capacity = Math.max(0, minRow.closingCash - plan.minimumCash);
  const debtService12 = sum(nextYear.map(r => r.principalRepaid + r.interestPaid));
  const ocf12 = sum(nextYear.map(r => r.operatingCashFlow));
  const dscr12 = debtService12 > 0 ? ocf12 / debtService12 : null;
  // Financial commitments, months 1–12. Each payment is counted once, in exactly one group: bank debt service (loans),
  // transfer commitments (past deals' instalments + fees and agent fees of player registrations), other commitments.
  // Signing bonuses and wages are payroll, already inside operating cash flow, and are not counted again.
  const transferCommitments12 = sum(nextYear.map(r => r.transferPayments + r.playerRegistrationsPaid));
  const otherCommitments12 = sum(nextYear.map(r => r.otherCashOut));
  const commitments12 = debtService12 + transferCommitments12 + otherCommitments12;
  const commitmentCover12 = commitments12 > 0 ? ocf12 / commitments12 : null;
  const transferAfterHorizon = sum(capexItems.filter(c => c.category === 'player_registration').map(c => c.paidAfterHorizon));
  const commitments = {period: null, operatingCashFlow: ocf12, bankDebtService: debtService12, transferPaymentsPastDeals: sum(nextYear.map(r => r.transferPayments)),
    playerRegistrationsPaid: sum(nextYear.map(r => r.playerRegistrationsPaid)), transferCommitments: transferCommitments12, otherCommitments: otherCommitments12, total: commitments12,
    transferReceipts: sum(nextYear.map(r => r.transferReceipts)), otherCapitalSpending: sum(nextYear.map(r => r.capexPaid - r.playerRegistrationsPaid)),
    loanDrawdowns: sum(nextYear.map(r => r.loanDrawdowns)), otherReceipts: sum(nextYear.map(r => r.otherCashIn)), cashAfterCommitments: sum(nextYear.map(r => r.netCashFlow)),
    transferPaymentsAfterHorizon: transferAfterHorizon, cover: commitmentCover12, notice: INTERNAL_RATIO_NOTICE};
  const waterfall = commitments.operatingCashFlow - commitments.total + commitments.transferReceipts - commitments.otherCapitalSpending + commitments.loanDrawdowns + commitments.otherReceipts;
  if (Math.abs(waterfall - commitments.cashAfterCommitments) > 0.01) throw new FinanceError([`Internal commitments reconciliation failed by ${round2(waterfall - commitments.cashAfterCommitments)}; no result is shown`]);
  const boundRow = months.reduce((a, b) => (b.prudentLowerBound < a.prudentLowerBound ? b : a));
  const boundOnly = months.filter(r => r.prudentLowerBound < plan.minimumCash - 0.005 && r.closingCash >= plan.minimumCash - 0.005);
  const y1 = years[0], kindsOf = cats => cats.reduce((a, c) => { for (const k of KINDS) a[k] += sourcesByCategory[c].kinds[k]; return a; }, {observed: 0, assumption: 0, projection: 0});
  const linesOf = cats => cats.flatMap(c => sourcesByCategory[c].lines.map(l => ({...l, category: c})));
  const period = `Year 1 (${y1.from} → ${y1.to})`, horizon = `${H} months (${months[0].month} → ${months.at(-1).month})`;
  commitments.period = `Months 1–12 (${y1.from} → ${y1.to})`;
  const capexLines = capexItems.map(c => ({id: c.id, label: c.label, kind: c.kind, source: c.source, asOf: c.asOf, total: c.amount, category: c.category}));
  const loanLines = loanItems.map(l => ({id: l.id, label: l.label, kind: l.kind, source: l.source, asOf: l.asOf, total: l.principal, category: l.existing ? 'existing loan' : 'new loan'}));
  const indicators = [
    {id: 'revenue', label: 'Revenue', value: y1.revenue, unit: 'currency', period, definition: 'Sum of revenue lines (accrual), after scenario factors and applied decisions.', lines: linesOf(REVENUE), kinds: kindsOf(REVENUE)},
    {id: 'expenses', label: 'Operating expenses incl. payroll', value: y1.payroll + y1.payrollTaxes + y1.operating, unit: 'currency', period, definition: 'Payroll + employer charges + other operating expenses (accrual). Excludes depreciation, interest and tax.', lines: linesOf(EXPENSE), kinds: kindsOf(EXPENSE)},
    {id: 'ebitda', label: 'EBITDA', value: y1.ebitda, unit: 'currency', period, definition: 'Revenue − payroll − employer charges − other operating expenses.', lines: linesOf([...REVENUE, ...EXPENSE]), kinds: kindsOf([...REVENUE, ...EXPENSE])},
    {id: 'ebitdaMargin', label: 'EBITDA margin', value: y1.revenue ? y1.ebitda / y1.revenue : null, unit: 'ratio', period, definition: 'EBITDA ÷ revenue. Not shown when revenue is zero.', lines: [], kinds: null},
    {id: 'operatingResult', label: 'Operating result (EBIT)', value: y1.operatingResult, unit: 'currency', period, definition: 'EBITDA − depreciation and amortisation (existing assets entered as a line + capitalised spending, incl. player registrations).', lines: [...linesOf(['existing_depreciation']), ...capexLines], kinds: null},
    {id: 'netResult', label: 'Net result', value: y1.netResult, unit: 'currency', period, definition: 'Operating result − interest − entered tax expense. A model subtotal, not statutory accounts.', lines: linesOf(['tax_expense']), kinds: null},
    {id: 'payrollRatio', label: 'Payroll to revenue', value: y1.revenue ? (y1.payroll + y1.payrollTaxes) / y1.revenue : null, unit: 'ratio', period, definition: '(Payroll + employer charges) ÷ revenue. Not a league squad-cost rule calculation.', lines: linesOf(['payroll', 'payroll_taxes']), kinds: kindsOf(['payroll', 'payroll_taxes'])},
    {id: 'closingCash', label: 'Cash at end of horizon', value: totals.closingCash, unit: 'currency', period: horizon, definition: 'Opening cash + all monthly net cash flows (operating, investing, financing, other).', lines: [], kinds: null},
    {id: 'minimumCash', label: 'Lowest month-end cash', value: minRow.closingCash, unit: 'currency', period: `${horizon}; lowest in ${minRow.month}`, definition: `Minimum of month-end cash balances. ${MONTH_END_NOTICE}`, lines: [], kinds: null},
    {id: 'prudentLowerBound', label: 'Prudent intra-month bound (not a forecast)', value: boundRow.prudentLowerBound, unit: 'currency', period: `${horizon}; lowest in ${boundRow.month}`, definition: `${PRUDENT_BOUND_LABEL} Opening cash of the month − all payments of the month. Uses only the monthly totals already in the plan; no payment date is assumed.`, lines: [], kinds: null},
    {id: 'liquidityHeadroom', label: 'Liquidity headroom', value: minRow.closingCash - plan.minimumCash, unit: 'currency', period: horizon, definition: `Lowest month-end cash − your minimum cash policy (${plan.minimumCash}). Negative means the policy is breached. Not a credit facility.`, lines: [], kinds: null},
    {id: 'investmentCapacity', label: 'Investment capacity (one-off, now)', value: capacity, unit: 'currency', period: horizon, definition: 'Largest one-off payment in the first month that keeps every month-end cash balance at or above the minimum cash policy, all else unchanged. Not borrowing capacity.', lines: [], kinds: null},
    {id: 'debt', label: 'Debt at end of horizon', value: closingDebt, unit: 'currency', period: horizon, definition: 'Outstanding principal of existing and new loans after scheduled repayments.', lines: loanLines, kinds: null},
    {id: 'debtService', label: 'Debt service, first 12 months', value: debtService12, unit: 'currency', period, definition: 'Scheduled interest + principal in months 1–12.', lines: loanLines, kinds: null},
    {id: 'dscr', label: 'Bank debt-service cover (internal indicator)', value: dscr12, unit: 'ratio', period, definition: `Operating cash flow (cash received − operating payments − tax paid, including working capital existing at the start) ÷ scheduled loan interest and principal, months 1–12. Covers bank and other loans only, not transfer or other commitments. ${INTERNAL_RATIO_NOTICE}`, lines: [], kinds: null},
    {id: 'transferCommitments', label: 'Transfer commitments paid, first 12 months', value: transferCommitments12, unit: 'currency', period, definition: 'Instalments of past transfer deals (transfer payments lines) + transfer and agent fees of player registrations paid in months 1–12. Fees due after the horizon are shown separately.', lines: [...linesOf(['transfer_payments']), ...capexLines.filter(l => l.category === 'player_registration')], kinds: null},
    {id: 'otherCommitments', label: 'Other financial commitments, first 12 months', value: otherCommitments12, unit: 'currency', period, definition: 'Other financial commitments paid (cash-only lines), months 1–12. Wages, signing bonuses and operating costs are in operating cash flow, not here.', lines: linesOf(['cash_out_other']), kinds: null},
    {id: 'commitmentCover', label: 'Financial commitments cover (internal indicator)', value: commitmentCover12, unit: 'ratio', period, definition: `Operating cash flow ÷ (loan debt service + transfer commitments + other commitments), months 1–12. Each payment counted once. ${INTERNAL_RATIO_NOTICE}`, lines: [], kinds: null},
    {id: 'cashAfterCommitments', label: 'Cash generated after all commitments, first 12 months', value: commitments.cashAfterCommitments, unit: 'currency', period, definition: 'Operating cash flow − all commitments + transfer receipts − other capital spending + loan drawdowns + other receipts = net change in cash over months 1–12.', lines: [], kinds: null},
    {id: 'capex', label: 'Capital expenditure paid', value: totals.capexPaid, unit: 'currency', period: horizon, definition: 'Cash paid for capitalised items, including player registration fees and agent fees.', lines: capexLines, kinds: null},
  ];

  // Rule-based risk flags: transparent tests on computed values, never a prediction.
  const risks = [];
  const fmt = v => `${plan.currency} ${Math.round(v).toLocaleString('en-GB')}`;
  if (belowFloor.length) risks.push({id: 'cash-floor', severity: 'high', message: `Month-end cash falls below the minimum cash policy (${fmt(plan.minimumCash)}) in ${belowFloor.length} month(s), first in ${belowFloor[0].month}; lowest ${fmt(minRow.closingCash)} in ${minRow.month}.`, months: belowFloor.map(r => r.month)});
  const negative = months.filter(r => r.closingCash < 0);
  if (negative.length) risks.push({id: 'negative-cash', severity: 'high', message: `Cash is negative in ${negative.length} month(s), first in ${negative[0].month}: funding is required before then.`, months: negative.map(r => r.month)});
  if (plan.policy.payrollRatioLimit !== null) years.forEach(y => { const r = y.revenue ? (y.payroll + y.payrollTaxes) / y.revenue : null; if (r !== null && r > plan.policy.payrollRatioLimit) risks.push({id: `payroll-ratio-y${y.year}`, severity: 'medium', message: `Payroll is ${(r * 100).toFixed(1)}% of revenue in year ${y.year}, above your limit of ${(plan.policy.payrollRatioLimit * 100).toFixed(1)}%.`, months: []}); });
  if (dscr12 !== null && plan.policy.minimumDscr !== null && dscr12 < plan.policy.minimumDscr) risks.push({id: 'dscr', severity: 'high', message: `Operating cash flow covers first-year loan debt service ${dscr12.toFixed(2)}×, below your minimum of ${plan.policy.minimumDscr.toFixed(2)}× (internal indicator, not a covenant calculation).`, months: []});
  if (commitmentCover12 !== null && commitmentCover12 < 1) risks.push({id: 'commitment-cover', severity: 'high', message: `Operating cash flow of the first 12 months (${fmt(ocf12)}) does not cover financial commitments (${fmt(commitments12)}: loans ${fmt(debtService12)}, transfers ${fmt(transferCommitments12)}, other ${fmt(otherCommitments12)}); cover ${commitmentCover12.toFixed(2)}× (internal indicator).`, months: []});
  if (boundOnly.length) risks.push({id: 'intra-month', severity: 'medium', message: `In ${boundOnly.length} month(s) the month-end cash meets the policy but the prudent intra-month bound does not; worst ${fmt(boundRow.prudentLowerBound)} in ${boundRow.month} (month-end ${fmt(boundRow.closingCash)}). The bound assumes every payment of the month comes before every receipt: it is not a forecast. Check the timing of large payments.`, months: boundOnly.map(r => r.month)});
  const revCats = REVENUE.map(c => ({c, v: sum(accrual[c])})).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  if (revCats.length && totals.revenue > 0 && revCats[0].v / totals.revenue > 0.5) risks.push({id: 'concentration', severity: 'medium', message: `${CATEGORIES[revCats[0].c].label} is ${(revCats[0].v / totals.revenue * 100).toFixed(1)}% of revenue: a fall in this source drives the result.`, months: []});
  for (const l of loanItems.filter(x => x.repayment === 'bullet')) {
    const t = l.principal.findIndex(v => v > 0.005);
    if (t >= 0) risks.push({id: `bullet-${l.id}`, severity: 'medium', message: `${l.label}: ${fmt(l.principal[t])} of principal falls due in a single payment in ${months[t].month}.`, months: [months[t].month]});
  }
  const rk = kindsOf(REVENUE), rkTotal = rk.observed + rk.assumption + rk.projection;
  if (rkTotal > 0 && rk.observed / rkTotal < 0.5) risks.push({id: 'evidence', severity: 'medium', message: `Only ${(rk.observed / rkTotal * 100).toFixed(1)}% of revenue is observed (contracted or actual); the rest is assumption or projection.`, months: []});
  if (receivables > 0.005 || payables > 0.005) risks.push({id: 'horizon-timing', severity: 'info', message: `At the end of the horizon ${fmt(receivables)} of revenue is still to be collected and ${fmt(payables)} of expenses still to be paid (cash timing).`, months: []});
  const after = capexItems.reduce((a, c) => a + c.paidAfterHorizon, 0);
  if (after > 0.005) risks.push({id: 'payments-after-horizon', severity: 'info', message: `${fmt(after)} of capital payments (e.g. transfer instalments) fall after the horizon and are not in this cash forecast.`, months: []});

  return {schema: SCHEMA, engine: VERSION, scenario: {id: sc.id, label: sc.label}, decisions: applied.map(d => d.id), currency: plan.currency, startMonth: plan.startMonth, horizonMonths: H,
    months, years, totals, bridge, receivablesAtEnd: receivables, payablesAtEnd: payables, capitalPaymentsAfterHorizon: after,
    netBookValueAtEnd: sum(capexItems.map(c => c.netBookValue)), indicators, risks, commitments, monthEndNotice: MONTH_END_NOTICE,
    capex: capexItems.map(c => ({id: c.id, label: c.label, category: c.category, amount: c.amount, paidInHorizon: sum(c.paid), paidAfterHorizon: c.paidAfterHorizon, depreciationInHorizon: sum(c.dep), netBookValue: c.netBookValue})),
    loans: loanItems.map(l => ({id: l.id, label: l.label, existing: l.existing, interest: sum(l.interest), principalRepaid: sum(l.principal), drawdown: sum(l.drawdown), closingBalance: l.balance.at(-1)})),
    minimumCashPolicy: plan.minimumCash};
}

// ------------------------------------------------------------------ comparison and decision impact
const KPI = ['revenue', 'ebitda', 'operatingResult', 'netResult', 'closingCash', 'minimumCash', 'liquidityHeadroom', 'investmentCapacity', 'debt'];
const pick = r => Object.fromEntries(r.indicators.filter(i => KPI.includes(i.id)).map(i => [i.id, i.value]));

/** Every scenario with the same decisions (default: the selected ones). Assumptions differ only through each scenario. */
export function compareScenarios(input, {decisions} = {}) {
  const plan = canonicalPlan(input), ids = decisions ?? plan.decisions.filter(d => d.selected).map(d => d.id);
  return plan.scenarios.map(s => { const r = compute(plan, s, ids); return {id: s.id, label: s.label, kpis: pick(r), years: r.years.map(y => ({year: y.year, revenue: y.revenue, ebitda: y.ebitda, netResult: y.netResult, netCashFlow: y.netCashFlow, closingCash: y.closingCash})), cash: r.months.map(m => m.closingCash), breaches: r.risks.filter(x => x.id === 'cash-floor').length > 0}; });
}

/**
 * Impact of each decision alone and of the selected combination, in every scenario, against the same plan without
 * any decision. Differences are exact recomputations, never linear approximations.
 */
export function decisionImpact(input) {
  const plan = canonicalPlan(input), out = [];
  for (const s of plan.scenarios) {
    const base = compute(plan, s, []);
    const delta = (r, label, ids) => {
      const yearly = r.years.map((y, i) => ({year: y.year, ebitda: y.ebitda - base.years[i].ebitda, netResult: y.netResult - base.years[i].netResult, operatingCashFlow: y.operatingCashFlow - base.years[i].operatingCashFlow, netCashFlow: y.netCashFlow - base.years[i].netCashFlow}));
      const monthly = r.months.map((m, i) => m.closingCash - base.months[i].closingCash);
      const k = pick(r), b = pick(base);
      return {label, decisions: ids, monthlyCashDelta: monthly, yearly, closingCashDelta: k.closingCash - b.closingCash, minimumCashDelta: k.minimumCash - b.minimumCash,
        investmentCapacityDelta: k.investmentCapacity - b.investmentCapacity, debtDelta: k.debt - b.debt, minimumCash: k.minimumCash, breachesPolicy: k.liquidityHeadroom < -0.005,
        worstMonth: r.months.reduce((a, m) => (m.closingCash < a.closingCash ? m : a)).month,
        prudentLowerBound: r.totals.prudentLowerBound, prudentLowerBoundDelta: r.totals.prudentLowerBound - base.totals.prudentLowerBound};
    };
    const rows = [];
    for (const d of plan.decisions) {
      try {
        const row = {id: d.id, type: d.type, ...delta(compute(plan, s, [d.id]), d.label, [d.id])};
        if (d.type === 'investment') row.returns = investmentReturns(d, row, s, plan);
        rows.push(row);
      }
      catch (e) { if (!(e instanceof FinanceError)) throw e; rows.push({id: d.id, type: d.type, label: d.label, decisions: [d.id], invalid: e.problems.join('; ')}); }
    }
    const selected = plan.decisions.filter(d => d.selected).map(d => d.id);
    let combined = null;
    if (selected.length) { try {
      combined = delta(compute(plan, s, selected), 'Selected decisions together', selected);
      const inv = plan.decisions.filter(d => d.selected && d.type === 'investment');
      if (inv.length) {
        // Asset = the selected investments alone; other decisions (savings, financing, …) and interactions = the rest.
        const asset = delta(compute(plan, s, inv.map(d => d.id)), 'Selected investments alone', inv.map(d => d.id));
        combined.returns = splitReturns(inv, asset, combined, s, plan, selected.filter(id => !inv.some(d => d.id === id)));
      }
    } catch (e) { if (!(e instanceof FinanceError)) throw e; combined = {label: 'Selected decisions together', decisions: selected, invalid: e.problems.join('; ')}; } }
    out.push({scenario: s.id, label: s.label, baseline: {minimumCash: pick(base).minimumCash, closingCash: pick(base).closingCash, investmentCapacity: pick(base).investmentCapacity}, decisions: rows, combined});
  }
  return out;
}

/**
 * Simple, transparent return measures of an investment decision within the horizon. Last fiscal year of the horizon is
 * used as the run-rate; no terminal value, residual value, growth or discounting is assumed. These are estimates.
 */
function investmentReturns(ds, row, s, plan) {
  ds = [].concat(ds);
  const amount = sum(ds.map(d => d.amount)) * s.capexFactor, last = row.yearly.at(-1), full = ds.every(d => d.operationsStartMonth <= plan.horizonMonths - 12);
  return {amount, runRateYear: last.year, runRateComplete: full, incrementalEbitda: last.ebitda, incrementalOperatingCashFlow: last.operatingCashFlow,
    ebitdaYield: amount ? last.ebitda / amount : null, simplePaybackYears: last.operatingCashFlow > 0 ? amount / last.operatingCashFlow : null,
    cumulativeCashWithinHorizon: row.closingCashDelta,
    label: RETURN_LABEL, definition: `${RETURN_LABEL} Run-rate = incremental results of year ${last.year}${full ? '' : ' (operations do not cover the whole year: run-rate understated)'}. EBITDA yield = incremental EBITDA ÷ investment. Simple payback = investment ÷ incremental operating cash flow per year (undiscounted, estimate). No terminal or residual value.`};
}

/**
 * Returns of the selected combination, always split: the asset alone, the effect of the other selected decisions
 * (including interactions), and the combination. asset + others = combined exactly. Simple, undiscounted run-rate
 * measures — not an IRR or an NPV.
 */
function splitReturns(inv, asset, combined, s, plan, otherIds) {
  const a = investmentReturns(inv, asset, s, plan), c = investmentReturns(inv, combined, s, plan), amount = a.amount;
  const part = r => ({incrementalEbitda: r.incrementalEbitda, incrementalOperatingCashFlow: r.incrementalOperatingCashFlow, ebitdaYield: r.ebitdaYield, simplePaybackYears: r.simplePaybackYears});
  return {amount, runRateYear: a.runRateYear, runRateComplete: a.runRateComplete, label: RETURN_LABEL,
    asset: {...part(a), cumulativeCashWithinHorizon: asset.closingCashDelta, decisions: inv.map(d => d.id)},
    others: {incrementalEbitda: c.incrementalEbitda - a.incrementalEbitda, incrementalOperatingCashFlow: c.incrementalOperatingCashFlow - a.incrementalOperatingCashFlow,
      yieldPoints: amount ? (c.incrementalEbitda - a.incrementalEbitda) / amount : null, decisions: otherIds},
    combined: {...part(c), cumulativeCashWithinHorizon: combined.closingCashDelta},
    definition: `${RETURN_LABEL} Run-rate = incremental results of year ${a.runRateYear}${a.runRateComplete ? '' : ' (operations do not cover the whole year: run-rate understated)'}. Asset = the selected investments alone against the plan without decisions; other decisions = the combination minus the asset (savings, revenue or payroll changes and their interactions; financing does not change EBITDA). Scenario cost factors also apply to cost savings. Simple payback = investment ÷ incremental operating cash flow per year (undiscounted). No terminal or residual value.`};
}

/** Everything a report needs, computed once: base forecast, every scenario, decision impact. */
export function analyse(input) {
  const plan = canonicalPlan(input);
  const selected = plan.decisions.filter(d => d.selected).map(d => d.id);
  return {schema: SCHEMA, engine: VERSION, selected,
    base: compute(plan, scenarioOf(plan, 'base'), selected),
    baseWithoutDecisions: compute(plan, scenarioOf(plan, 'base'), []),
    scenarios: compareScenarios(plan, {decisions: selected}),
    impact: decisionImpact(plan)};
}

// ------------------------------------------------------------------ templates
export function defaultScenarios() {
  const f = (r, c) => ({revenueFactors: Object.fromEntries(REVENUE.map(k => [k, r])), costFactors: Object.fromEntries(EXPENSE.map(k => [k, c]))});
  return [
    {id: 'base', label: 'Base case', ...f(1, 1), capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: 'Budget as entered.'},
    {id: 'downside', label: 'Downside case', ...f(1, 1), capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: 'Set your own downside assumptions (no default stress is applied).'},
    {id: 'upside', label: 'Upside case', ...f(1, 1), capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: 'Set your own upside assumptions.'},
  ];
}
/** A new empty plan. Opening cash and the minimum cash policy are left null: they must be entered. */
export function blankPlan({name = 'New budget', currency = 'EUR', startMonth, horizonMonths = 12, asOf} = {}) {
  return {schema: SCHEMA, name, currency, fictional: false, startMonth, horizonMonths, openingCash: null, minimumCash: null, policy: {payrollRatioLimit: null, minimumDscr: null},
    source: '', asOf, lines: [], capex: [], loans: [], scenarios: defaultScenarios(), decisions: [], imports: []};
}
