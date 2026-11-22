/**
 * Three synthetic, documented business cases for LANOVA Finance V1 (fictional organisations; every figure is
 * invented for testing and labelled as such). They are used by the tests, the independent Python reference, the
 * spreadsheet model and the import files in finance/cases/.
 *
 *  1. football  — professional football club preparing its 2026/27 annual budget: payroll, recruitment, existing
 *                 transfer instalments, an existing bank loan, seasonal matchday revenue and delayed media receipts.
 *  2. basketball — basketball club facing a fall in commercial revenue and the end of its main sponsorship contract,
 *                 and adapting payroll and costs over 24 months.
 *  3. groupNorth / groupSouth — two clubs of one owner group, each with its own plan (separate organisations), each
 *                 considering a capital investment; compared side by side without any data shared between them.
 */
import {SCHEMA, defaultScenarios, REVENUE, EXPENSE} from './model.js';

const AS_OF = '2026-06-15';
const flat = (n, v) => Array(n).fill(v);
/** Months t whose calendar month (1..12) is in `months` get v, others 0. */
const seasonal = (n, startMonth, months, v) => Array.from({length: n}, (_, t) => (months.includes(((Number(startMonth.slice(5)) - 1 + t) % 12) + 1) ? v : 0));
const window = (n, from, to, v) => Array.from({length: n}, (_, t) => (t >= from && t <= to ? v : 0));
const at = (n, pairs) => { const a = flat(n, 0); for (const [t, v] of pairs) a[t] += v; return a; };
const line = (id, label, category, values, kind, source, cashLagMonths = 0) => ({id, label, category, values, cashLagMonths, kind, source, asOf: AS_OF});
/**
 * Opening balances implied by cash timing: a line collected (or paid) L months after it is earned leaves the amounts
 * of the previous L months to be collected (or paid) at the start of the plan. They are entered as explicit cash-only
 * lines, never as revenue or expense again. Synthetic assumption: the previous months mirror the same calendar months.
 */
function openingBalances(lines, H) {
  const inflow = Array(H).fill(0), outflow = Array(H).fill(0);
  for (const l of lines) for (let t = 0; t < l.cashLagMonths; t++) {
    const v = l.values[(t - l.cashLagMonths + 12) % H];
    if (['ticketing', 'sponsorship', 'media', 'commercial', 'other_revenue'].includes(l.category)) inflow[t] += v; else outflow[t] += v;
  }
  return [line('opening-receivables', 'Collection of receivables at the start of the plan', 'opening_receivables', inflow, 'observed', 'Fictional aged receivables listing'),
    line('opening-payables', 'Settlement of payables at the start of the plan', 'opening_payables', outflow, 'observed', 'Fictional aged payables listing')];
}
const withOpening = (lines, H) => [...lines, ...openingBalances(lines, H)];
const scenario = (id, label, rev = {}, cost = {}, extra = {}) => ({id, label,
  revenueFactors: Object.fromEntries(REVENUE.map(c => [c, rev[c] ?? 1])), costFactors: Object.fromEntries(EXPENSE.map(c => [c, cost[c] ?? 1])),
  capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: '', ...extra});

export function football() {
  const H = 12, S = '2026-07', season = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  return {schema: SCHEMA, name: 'Fictional Athletic FC — budget 2026/27', currency: 'EUR', fictional: true, startMonth: S, horizonMonths: H,
    openingCash: 5_000_000, minimumCash: 2_000_000, policy: {payrollRatioLimit: 0.7, minimumDscr: 1.2},
    source: 'Synthetic case 1 (LANOVA Finance V1 validation). Every figure is fictional.', asOf: AS_OF,
    lines: withOpening([
      line('media', 'League media rights', 'media', flat(H, 2_600_000), 'observed', 'Fictional league distribution statement 2026/27', 2),
      line('ticketing', 'Season tickets and matchday', 'ticketing', seasonal(H, S, season, 1_100_000), 'assumption', 'Fictional: last season attendance × 2026/27 prices'),
      line('sponsor-main', 'Main shirt sponsor', 'sponsorship', flat(H, 800_000), 'observed', 'Fictional sponsorship contract to 2028', 1),
      line('sponsor-other', 'Secondary sponsors', 'sponsorship', flat(H, 250_000), 'assumption', 'Fictional: renewals expected at current value', 1),
      line('commercial', 'Merchandising and hospitality', 'commercial', flat(H, 500_000), 'assumption', 'Fictional: trailing 12 months'),
      line('wages-players', 'First-team player wages', 'payroll', flat(H, 2_600_000), 'observed', 'Fictional payroll register, contracts signed'),
      line('wages-staff', 'Technical and administrative staff', 'payroll', flat(H, 400_000), 'observed', 'Fictional payroll register'),
      line('charges', 'Employer social charges', 'payroll_taxes', flat(H, 350_000), 'observed', 'Fictional payroll register'),
      line('opex', 'Operations, travel, facilities', 'operating', flat(H, 900_000), 'assumption', 'Fictional budget 2026/27', 1),
      line('matchday-ops', 'Matchday operations', 'operating', seasonal(H, S, season, 150_000), 'assumption', 'Fictional budget 2026/27'),
      line('amortisation', 'Amortisation of existing player registrations', 'existing_depreciation', flat(H, 500_000), 'observed', 'Fictional fixed-asset register'),
      line('tax-expense', 'Income tax expense', 'tax_expense', flat(H, 0), 'assumption', 'Fictional: losses carried forward, no tax expected'),
      line('tax-paid', 'Income tax paid', 'tax_paid', flat(H, 0), 'assumption', 'Fictional: no instalment due'),
      line('instalments-owed', 'Transfer instalments owed (past signings)', 'transfer_payments', at(H, [[2, 1_500_000], [8, 1_500_000]]), 'observed', 'Fictional transfer agreements'),
      line('instalment-due', 'Transfer instalment receivable (past sale)', 'transfer_receipts', at(H, [[4, 1_000_000]]), 'observed', 'Fictional transfer agreement'),
    ], H),
    capex: [{id: 'pitch', label: 'Training ground pitch renewal', category: 'infrastructure', acquisitionMonth: 3, amount: 600_000, usefulLifeMonths: 120, payments: [{month: 3, amount: 600_000}], kind: 'assumption', source: 'Fictional quotation', asOf: AS_OF}],
    loans: [{id: 'bank', label: 'Existing bank loan', existing: true, principal: 6_000_000, annualRate: 0.045, drawMonth: null, termMonths: 48, repayment: 'annuity', kind: 'observed', source: 'Fictional loan agreement', asOf: AS_OF}],
    scenarios: [scenario('base', 'Base case'),
      scenario('downside', 'Downside: lower crowds, late media receipts', {ticketing: 0.85, sponsorship: 0.95, commercial: 0.9}, {operating: 1.03}, {extraCollectionLagMonths: 1, notes: 'Attendance −15%, commercial −10%, secondary sponsors −5%, costs +3%, receipts one month later.'}),
      scenario('upside', 'Upside: cup run', {ticketing: 1.08, commercial: 1.1}, {}, {notes: 'Attendance +8%, commercial +10%.'})],
    decisions: [
      {id: 'striker', label: 'Sign a striker (4-year contract)', type: 'player', selected: true, startMonth: 1, kind: 'assumption', source: 'Fictional negotiation terms', asOf: AS_OF, notes: 'Second fee instalment due in month 13, after the horizon.',
        transferFee: 4_000_000, feePayments: [{month: 1, amount: 2_000_000}, {month: 13, amount: 2_000_000}], agentFee: 400_000, contractMonths: 48, monthlyWage: 120_000, employerChargeRate: 0.3, signingBonus: 300_000},
      {id: 'midfielder', label: 'Season loan of a midfielder', type: 'player', selected: false, startMonth: 1, kind: 'assumption', source: 'Fictional offer', asOf: AS_OF, notes: '',
        transferFee: 500_000, feePayments: [{month: 1, amount: 500_000}], agentFee: 0, contractMonths: 11, monthlyWage: 80_000, employerChargeRate: 0.3, signingBonus: 0},
      {id: 'cost-plan', label: 'Operating cost savings plan', type: 'cost_change', selected: true, startMonth: 2, kind: 'assumption', source: 'Fictional management plan', asOf: AS_OF, notes: 'One-off restructuring cost in the first month.',
        monthlyAmount: -60_000, oneOffCost: 150_000, endMonth: null},
      {id: 'credit-line', label: 'New 3-year term loan', type: 'loan', selected: false, startMonth: 6, kind: 'assumption', source: 'Fictional bank indication', asOf: AS_OF, notes: '',
        principal: 3_000_000, annualRate: 0.055, termMonths: 36, repayment: 'annuity'},
    ], imports: []};
}

export function basketball() {
  const H = 24, S = '2026-09', season = [10, 11, 12, 1, 2, 3, 4, 5];
  return {schema: SCHEMA, name: 'Fictional Basket Club — 24-month plan', currency: 'EUR', fictional: true, startMonth: S, horizonMonths: H,
    openingCash: 1_200_000, minimumCash: 500_000, policy: {payrollRatioLimit: 0.7, minimumDscr: null},
    source: 'Synthetic case 2 (LANOVA Finance V1 validation). Every figure is fictional.', asOf: AS_OF,
    lines: withOpening([
      line('sponsor-main', 'Main sponsor (contract ends 2027-08)', 'sponsorship', window(H, 0, 11, 350_000), 'observed', 'Fictional sponsorship contract', 1),
      line('sponsor-renewal', 'Main sponsor slot after 2027-08 (renewal or replacement)', 'sponsorship', window(H, 12, 23, 250_000), 'projection', 'Fictional: management expectation, no contract', 1),
      line('sponsor-other', 'Partner sponsors', 'sponsorship', flat(H, 90_000), 'assumption', 'Fictional: current partners', 1),
      line('ticketing', 'Season tickets and games', 'ticketing', seasonal(H, S, season, 180_000), 'assumption', 'Fictional: last season × prices'),
      line('media', 'League media distribution', 'media', flat(H, 50_000), 'observed', 'Fictional league statement', 3),
      line('commercial', 'Hospitality and merchandising', 'commercial', flat(H, 120_000), 'assumption', 'Fictional: trailing 12 months', 1),
      line('wages', 'Players and coaching staff', 'payroll', flat(H, 420_000), 'observed', 'Fictional payroll register'),
      line('charges', 'Employer social charges', 'payroll_taxes', flat(H, 118_000), 'observed', 'Fictional payroll register'),
      line('opex', 'Arena rent, travel, operations', 'operating', flat(H, 180_000), 'assumption', 'Fictional budget', 1),
      line('depreciation', 'Depreciation of equipment', 'existing_depreciation', flat(H, 15_000), 'observed', 'Fictional fixed-asset register'),
      line('tax-expense', 'Income tax expense', 'tax_expense', flat(H, 0), 'assumption', 'Fictional: losses carried forward'),
      line('tax-paid', 'Income tax paid', 'tax_paid', flat(H, 0), 'assumption', 'Fictional: none due'),
    ], H),
    capex: [], loans: [],
    scenarios: [scenario('base', 'Base case'),
      scenario('downside', 'Downside: commercial revenue falls', {commercial: 0.7, sponsorship: 0.85, ticketing: 0.95}, {}, {fromMonth: 3, notes: 'From month 4: commercial −30%, sponsorship −15%, ticketing −5%.'}),
      scenario('upside', 'Upside: playoff run', {ticketing: 1.12, commercial: 1.05}, {}, {fromMonth: 6, notes: 'From month 7: ticketing +12%, commercial +5%.'})],
    decisions: [
      {id: 'sponsor-loss', label: 'Main sponsor leaves at the end of its contract', type: 'revenue_change', selected: false, startMonth: 12, kind: 'assumption', source: 'Fictional risk event', asOf: AS_OF, notes: 'Models the loss of the renewal slot: −100% of sponsorship is too much, so a fixed amount is used.',
        category: 'sponsorship', mode: 'amount', value: -250_000, endMonth: null},
      {id: 'payroll-cut', label: 'Reduce payroll at the next registration window', type: 'payroll_change', selected: true, startMonth: 4, kind: 'assumption', source: 'Fictional sporting plan', asOf: AS_OF, notes: '',
        monthlyAmount: -40_000, employerChargeRate: 0.28, endMonth: null},
      {id: 'cost-savings', label: 'Operating savings (travel, arena services)', type: 'cost_change', selected: true, startMonth: 3, kind: 'assumption', source: 'Fictional management plan', asOf: AS_OF, notes: '',
        monthlyAmount: -25_000, oneOffCost: 30_000, endMonth: null},
      {id: 'bridge-loan', label: 'Bridge loan', type: 'loan', selected: false, startMonth: 5, kind: 'assumption', source: 'Fictional bank indication', asOf: AS_OF, notes: '',
        principal: 600_000, annualRate: 0.04, termMonths: 24, repayment: 'linear'},
    ], imports: []};
}

/** Group case: two separate organisations. Each plan stands alone; no figure of one is used in the other. */
export function groupNorth() {
  const H = 36, S = '2026-07', season = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  return {schema: SCHEMA, name: 'Fictional North United — 36-month plan', currency: 'EUR', fictional: true, startMonth: S, horizonMonths: H,
    openingCash: 9_000_000, minimumCash: 3_000_000, policy: {payrollRatioLimit: 0.7, minimumDscr: 1.25},
    source: 'Synthetic case 3, club 1 of 2 (LANOVA Finance V1 validation). Every figure is fictional.', asOf: AS_OF,
    lines: withOpening([
      line('media', 'Media rights', 'media', flat(H, 1_500_000), 'observed', 'Fictional league distribution', 2),
      line('ticketing', 'Matchday', 'ticketing', seasonal(H, S, season, 700_000), 'assumption', 'Fictional: average attendance'),
      line('sponsorship', 'Sponsorship', 'sponsorship', flat(H, 500_000), 'observed', 'Fictional contracts', 1),
      line('commercial', 'Commercial', 'commercial', flat(H, 250_000), 'assumption', 'Fictional trailing 12 months'),
      line('wages', 'Payroll', 'payroll', flat(H, 1_500_000), 'observed', 'Fictional payroll register'),
      line('charges', 'Employer charges', 'payroll_taxes', flat(H, 250_000), 'observed', 'Fictional payroll register'),
      line('opex', 'Operating expenses', 'operating', flat(H, 550_000), 'assumption', 'Fictional budget', 1),
      line('amortisation', 'Existing amortisation', 'existing_depreciation', flat(H, 300_000), 'observed', 'Fictional fixed-asset register'),
      line('tax-expense', 'Income tax expense', 'tax_expense', flat(H, 0), 'assumption', 'Fictional: none'),
      line('tax-paid', 'Income tax paid', 'tax_paid', flat(H, 0), 'assumption', 'Fictional: none'),
    ], H),
    capex: [], loans: [{id: 'bank', label: 'Existing bank loan', existing: true, principal: 4_000_000, annualRate: 0.04, drawMonth: null, termMonths: 60, repayment: 'linear', kind: 'observed', source: 'Fictional loan agreement', asOf: AS_OF}],
    scenarios: [scenario('base', 'Base case'),
      scenario('downside', 'Downside: relegation battle', {ticketing: 0.8, commercial: 0.85, sponsorship: 0.9, media: 0.9}, {operating: 1.02}, {fromMonth: 6, extraCollectionLagMonths: 1, notes: 'From month 7: matchday −20%, commercial −15%, sponsorship −10%, media −10%, costs +2%, receipts one month later.'}),
      scenario('upside', 'Upside: European qualification', {media: 1.1, ticketing: 1.1, commercial: 1.1}, {}, {fromMonth: 12})],
    decisions: [
      {id: 'stadium-hospitality', label: 'Stadium hospitality extension', type: 'investment', selected: true, startMonth: 2, kind: 'assumption', source: 'Fictional feasibility study', asOf: AS_OF, notes: 'Construction paid in three instalments; operations start in month 10.',
        amount: 8_000_000, usefulLifeMonths: 300, payments: [{month: 2, amount: 3_000_000}, {month: 6, amount: 3_000_000}, {month: 9, amount: 2_000_000}], capexCategory: 'infrastructure',
        revenueCategory: 'commercial', monthlyRevenue: 160_000, monthlyOperatingCost: 60_000, operationsStartMonth: 10},
      {id: 'north-financing', label: 'Construction loan (hospitality)', type: 'loan', selected: true, startMonth: 2, kind: 'assumption', source: 'Fictional bank indication', asOf: AS_OF, notes: 'Only relevant with the hospitality extension.',
        principal: 5_000_000, annualRate: 0.05, termMonths: 84, repayment: 'annuity'},
    ], imports: []};
}
export function groupSouth() {
  const H = 36, S = '2026-07', season = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  return {schema: SCHEMA, name: 'Fictional South Athletic — 36-month plan', currency: 'EUR', fictional: true, startMonth: S, horizonMonths: H,
    openingCash: 3_500_000, minimumCash: 1_500_000, policy: {payrollRatioLimit: 0.7, minimumDscr: null},
    source: 'Synthetic case 3, club 2 of 2 (LANOVA Finance V1 validation). Every figure is fictional.', asOf: AS_OF,
    lines: withOpening([
      line('media', 'Media rights', 'media', flat(H, 700_000), 'observed', 'Fictional league distribution', 2),
      line('ticketing', 'Matchday', 'ticketing', seasonal(H, S, season, 300_000), 'assumption', 'Fictional: average attendance'),
      line('sponsorship', 'Sponsorship', 'sponsorship', flat(H, 220_000), 'observed', 'Fictional contracts', 1),
      line('commercial', 'Commercial', 'commercial', flat(H, 80_000), 'assumption', 'Fictional trailing 12 months'),
      line('wages', 'Payroll', 'payroll', flat(H, 620_000), 'observed', 'Fictional payroll register'),
      line('charges', 'Employer charges', 'payroll_taxes', flat(H, 100_000), 'observed', 'Fictional payroll register'),
      line('opex', 'Operating expenses', 'operating', flat(H, 260_000), 'assumption', 'Fictional budget', 1),
      line('amortisation', 'Existing amortisation', 'existing_depreciation', flat(H, 90_000), 'observed', 'Fictional fixed-asset register'),
      line('tax-expense', 'Income tax expense', 'tax_expense', flat(H, 0), 'assumption', 'Fictional: none'),
      line('tax-paid', 'Income tax paid', 'tax_paid', flat(H, 0), 'assumption', 'Fictional: none'),
    ], H),
    capex: [], loans: [],
    scenarios: [scenario('base', 'Base case'),
      scenario('downside', 'Downside: weaker season', {ticketing: 0.8, commercial: 0.85, sponsorship: 0.9}, {operating: 1.02}, {fromMonth: 6, extraCollectionLagMonths: 1}),
      scenario('upside', 'Upside: promotion push', {ticketing: 1.15, commercial: 1.1}, {}, {fromMonth: 12})],
    decisions: [
      {id: 'academy', label: 'Youth academy and training centre', type: 'investment', selected: true, startMonth: 3, kind: 'assumption', source: 'Fictional feasibility study', asOf: AS_OF, notes: 'Savings on external training facilities are modelled as negative cost through a separate decision.',
        amount: 2_500_000, usefulLifeMonths: 240, payments: [{month: 3, amount: 1_500_000}, {month: 8, amount: 1_000_000}], capexCategory: 'infrastructure',
        revenueCategory: 'other_revenue', monthlyRevenue: 40_000, monthlyOperatingCost: 25_000, operationsStartMonth: 9},
      {id: 'academy-savings', label: 'Training facility rent no longer paid', type: 'cost_change', selected: true, startMonth: 9, kind: 'assumption', source: 'Fictional rental contract', asOf: AS_OF, notes: 'Only with the academy.',
        monthlyAmount: -30_000, oneOffCost: 0, endMonth: null},
    ], imports: []};
}
export const CASES = {football, basketball, groupNorth, groupSouth};
