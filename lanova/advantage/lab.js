/**
 * LANOVA Advantage Lab — decision engine (pure functions, no DOM). Schema: lanova-advantage-v1 (v0 is migrated on
 * load, with identical results). Formulas: README.md.
 *
 * Every cash figure comes from the LANOVA Finance engine already published at ../finance/engine/ (copied byte for
 * byte from KevinKo77/lake-intelligence, SHA-256 manifest): each option is translated into Finance decisions and the
 * monthly cash is forecast by that engine, in the base, downside and upside scenarios. This file adds only what the
 * Finance engine does not do: cost totals per option, hard constraints, structural constraints between options
 * (mandatory, dependencies, mutually exclusive groups), Pareto dominance, the search over combinations of options and
 * the decision brief. Sensitivity and break-even analysis is in sensitivity.js, on the same engine.
 *
 * Sporting contributions are the user's own estimates on a 0–10 scale. They are never presented as measured or
 * predicted performance; no probability is computed.
 */
import {forecast, validatePlan, REVENUE, EXPENSE, monthLabel} from '../finance/engine/model.js';

export const SCHEMA = 'lanova-advantage-v1';
export const SCHEMA_V0 = 'lanova-advantage-v0';
export const HORIZONS = [12, 24, 36];
export const MAX_OPTIONS = 10;
export const MAX_INSTALMENTS = 8;
export const SCENARIOS = Object.freeze({base: 'Base case', downside: 'Downside', upside: 'Upside'});
/** Scenario levers: a % change applied by the Finance engine from the scenario's activation month. */
export const LEVERS = Object.freeze({
  revenuePct: {label: 'Revenue change (%)', short: 'revenue', lo: -90, hi: 200},
  operatingPct: {label: 'Operating cost change, excluding staff (%)', short: 'operating costs', lo: -90, hi: 200},
  wagePct: {label: 'Wage change, staff and players, employer charges included (%)', short: 'wages', lo: -90, hi: 200},
});
export const OBJECTIVES = Object.freeze({
  immediate: {label: 'Immediate performance', axis: 'Your estimate: contribution to immediate performance (0–10)', estimate: true},
  development: {label: 'Long-term development', axis: 'Your estimate: contribution to long-term development (0–10)', estimate: true},
  financial: {label: 'Financial return', axis: 'Calculated: net financial effect over the horizon (EUR)', estimate: false},
});
/** Preference weights (hard constraints are applied before any preference). Editable in the interface. */
export const STRATEGIES = Object.freeze({
  immediate: {label: 'Maximise estimated immediate benefits', weights: {short: 0.6, money: 0.25, long: 0.05, security: 0.1}},
  development: {label: 'Prioritise long-term development', weights: {short: 0.1, money: 0.15, long: 0.6, security: 0.15}},
  security: {label: 'Preserve financial security', weights: {short: 0.075, money: 0.3, long: 0.075, security: 0.55}},
});
export const CRITERIA = Object.freeze({short: 'Immediate performance (your estimate)', long: 'Long-term development (your estimate)', money: 'Net financial effect (calculated)', security: 'Lowest cash in the downside case (calculated)'});
const RISK = {low: 1, medium: 2, high: 3};
const sum = a => a.reduce((x, y) => x + y, 0);
const round2 = v => Math.round(v * 100) / 100;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const TOL = 0.005;

// ------------------------------------------------------------------ schema: v0 → v1
const OPTION_DEFAULTS = {kind: 'project', costType: 'operating', mandatory: false, requires: [], exclusiveGroup: '', instalments: 1, instalmentEveryMonths: 1};
/**
 * A model in the current schema. A v0 model is migrated: its single downside (revenue −x% from the first month)
 * becomes the v1 downside scenario, the upside stays equal to the base case, staff costs are "not split" (null), and
 * every option is a stand-alone project paid at once. The results are identical (tested). Other schemas are returned
 * unchanged, so that check() rejects them.
 */
export function migrate(m) {
  if (!obj(m) || m.schema !== SCHEMA_V0) return m;
  const f = obj(m.finance) ? m.finance : {}, {downsideRevenuePct, ...rest} = f;
  return {...m, schema: SCHEMA, finance: {...rest, staffCosts: null},
    scenarios: {downside: {revenuePct: typeof downsideRevenuePct === 'number' ? -downsideRevenuePct : downsideRevenuePct, operatingPct: 0, wagePct: 0, fromMonth: 0}, upside: {revenuePct: 0, operatingPct: 0, wagePct: 0, fromMonth: 0}},
    constraints: {downsideMustHold: false}, options: Array.isArray(m.options) ? m.options.map(o => (obj(o) ? {...OPTION_DEFAULTS, ...o} : o)) : m.options};
}
/** Equal instalments rounded to the cent; the remainder goes to the last one, so they add up exactly. */
export function instalments(total, n, first, every) {
  const each = Math.floor(total / n * 100) / 100, out = Array.from({length: n}, (_, k) => ({month: first + k * every, amount: each}));
  out[n - 1].amount = total - each * (n - 1); // exact remainder: the instalments add up to the total
  return out.filter(x => x.amount > 0);
}
/** Derived amounts of a signing (committed one-off amounts, and the monthly cost with employer charges). */
const signingDerived = o => ({upfront: o.transferFee + o.agentFee + o.signingBonus, upfrontType: 'capital', usefulLifeMonths: o.contractMonths,
  monthlyCost: o.monthlyWage * (1 + o.employerChargeRate), commitmentMonths: o.contractMonths, costType: 'staff'});
/** The model ready for calculation: migrated, and each signing with its derived amounts. Call after check(). */
export function prepare(m) {
  const v = migrate(m);
  return {...v, options: v.options.map(o => (o.kind === 'signing' ? {...o, ...signingDerived(o)} : o))};
}

// ------------------------------------------------------------------ validation
/** Problems in the inputs; empty = computable. Never guesses a missing value. Accepts v1, and v0 (migrated). */
export function check(m0) {
  const p = [], m = migrate(m0);
  const num = (v, path, lo = 0, hi = 1e10) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) p.push(`${path}: a number between ${lo.toLocaleString('en-GB')} and ${hi.toLocaleString('en-GB')} is required (a missing value is not zero)`); };
  const int = (v, path, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) p.push(`${path}: a whole number between ${lo} and ${hi} is required`); };
  if (!obj(m)) return ['model: object required'];
  if (m.schema !== SCHEMA) p.push(`schema: ${SCHEMA} required (${SCHEMA_V0} is migrated automatically)`);
  if (!HORIZONS.includes(m.horizonMonths)) p.push('Decision horizon: 12, 24 or 36 months');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.startMonth ?? '')) p.push('First month: YYYY-MM');
  const f = obj(m.finance) ? m.finance : {}, H = HORIZONS.includes(m.horizonMonths) ? m.horizonMonths : 12;
  num(f.openingCash, 'Cash available today', -1e10); num(f.annualRevenue, 'Annual revenue'); num(f.annualOperatingCosts, 'Annual operating costs');
  num(f.minimumCash, 'Minimum cash reserve'); num(f.decisionBudget, 'Budget available for these decisions');
  if (f.staffCosts !== null) num(f.staffCosts, 'Staff costs included in operating costs', 0, Number.isFinite(f.annualOperatingCosts) ? f.annualOperatingCosts : 1e10);
  const sc = obj(m.scenarios) ? m.scenarios : {};
  for (const k of ['downside', 'upside']) {
    const s = obj(sc[k]) ? sc[k] : {}, q = `${SCENARIOS[k]} scenario`;
    for (const [l, d] of Object.entries(LEVERS)) num(s[l], `${q}: ${d.label}`, d.lo, d.hi);
    int(s.fromMonth, `${q}: applies from (month index)`, 0, H - 1);
    if (s.wagePct !== 0 && Number.isFinite(s.wagePct) && f.staffCosts === null) p.push(`${q}: a wage change needs the staff costs included in operating costs (not entered; a missing value is not zero)`);
  }
  if (!obj(m.constraints) || typeof m.constraints.downsideMustHold !== 'boolean') p.push('Constraints: say whether the reserve must also hold in the downside scenario (true or false)');
  if (!OBJECTIVES[m.objective]) p.push('Objective: immediate, development or financial');
  if (!Array.isArray(m.options)) return [...p, 'options: list required'];
  if (m.options.length > MAX_OPTIONS) p.push(`At most ${MAX_OPTIONS} options`);
  const ids = new Set();
  m.options.forEach((o, i) => {
    const q = `Option ${i + 1}${o?.name ? ` (${o.name})` : ''}`;
    if (!obj(o)) return p.push(`${q}: object required`);
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(o.id) || ids.has(o.id)) p.push(`${q}: unique identifier required`); ids.add(o.id);
    if (typeof o.name !== 'string' || !o.name.trim()) p.push(`${q}: name required`);
    if (!['project', 'signing'].includes(o.kind)) p.push(`${q}: kind must be project or signing`);
    int(o.startMonth, `${q}: start month`, 0, H - 1); int(o.effectMonths, `${q}: time to effect (months)`, 0, 120);
    if (o.kind === 'signing') {
      num(o.transferFee, `${q}: transfer fee`); num(o.agentFee, `${q}: agent fee`); num(o.signingBonus, `${q}: signing bonus`); int(o.contractMonths, `${q}: contract (months)`, 1, 72);
      num(o.monthlyWage, `${q}: gross wage per month`); num(o.employerChargeRate, `${q}: employer charges (share of wages, 0 to 1)`, 0, 1); int(o.feeInstalments, `${q}: transfer fee instalments (yearly)`, 1, 6);
    } else {
      num(o.upfront, `${q}: immediate cost`); num(o.monthlyCost, `${q}: running cost per month`);
      if (!['capital', 'expense'].includes(o.upfrontType)) p.push(`${q}: immediate cost type must be capital or expense`);
      if (o.upfrontType === 'capital' && o.upfront > 0) int(o.usefulLifeMonths, `${q}: useful life (months)`, 1, 600);
      int(o.commitmentMonths, `${q}: commitment (months)`, 0, 120);
      if (!['operating', 'staff'].includes(o.costType)) p.push(`${q}: running cost type must be operating or staff`);
      int(o.instalments, `${q}: number of instalments for the immediate cost`, 1, MAX_INSTALMENTS); int(o.instalmentEveryMonths, `${q}: months between instalments`, 1, 12);
      if (Number.isInteger(o.instalments) && Number.isInteger(o.instalmentEveryMonths) && Number.isInteger(o.startMonth) && o.upfront > 0 && o.startMonth + (o.instalments - 1) * o.instalmentEveryMonths > H - 1)
        p.push(`${q}: the last instalment of the immediate cost falls after the horizon (month ${o.startMonth + (o.instalments - 1) * o.instalmentEveryMonths + 1} of ${H})`);
    }
    if (o.monthlyGain !== null) {
      num(o.monthlyGain, `${q}: financial gain per month`, -1e10); int(o.gainMonths, `${q}: gain duration (months)`, 1, 120);
      if (o.gainRange != null) p.push(`${q}: a gain range is used only when the gain per month is not a single figure`);
    } else if (o.gainRange != null) {
      // A documented range instead of a single figure: both ends, in order, with the source of the range. Never invented.
      const g = o.gainRange;
      if (typeof g !== 'object') p.push(`${q}: gain range: low and high required`);
      else {
        num(g.low, `${q}: lowest documented gain per month`, -1e10); num(g.high, `${q}: highest documented gain per month`, -1e10);
        if (Number.isFinite(g.low) && Number.isFinite(g.high) && g.low > g.high) p.push(`${q}: the lowest documented gain must not exceed the highest`);
        if (typeof g.basis !== 'string' || !g.basis.trim()) p.push(`${q}: gain range: say what documents it (a quote, a past season, a signed offer); a range is not a guess`);
      }
      int(o.gainMonths, `${q}: gain duration (months)`, 1, 120);
    }
    for (const k of ['shortTermScore', 'longTermScore']) if (o[k] !== null) num(o[k], `${q}: ${k === 'shortTermScore' ? 'immediate' : 'long-term'} contribution (0–10)`, 0, 10);
    if (o.risk !== null && !RISK[o.risk]) p.push(`${q}: risk must be low, medium or high`);
    if (typeof o.mandatory !== 'boolean') p.push(`${q}: say whether it is mandatory (true or false)`);
    if (!Array.isArray(o.requires) || o.requires.some(x => typeof x !== 'string')) p.push(`${q}: "requires" must be a list of option identifiers`);
    if (typeof o.exclusiveGroup !== 'string' || !/^[A-Za-z0-9 _-]{0,30}$/.test(o.exclusiveGroup)) p.push(`${q}: exclusive group: up to 30 letters, digits, spaces, - or _`);
  });
  if (!p.length) p.push(...structureProblems(m.options));
  return p;
}
/**
 * Contradictory or impossible structures are rejected, never resolved silently: unknown or self dependencies, cycles,
 * an option whose required options include two of one mutually exclusive group (it could never be chosen), and
 * mandatory options that cannot all be chosen together.
 */
export function structureProblems(options) {
  const p = [], byId = new Map(options.map(o => [o.id, o])), name = id => byId.get(id)?.name ?? id;
  for (const o of options) for (const r of o.requires) {
    if (r === o.id) p.push(`${o.name}: an option cannot require itself`);
    else if (!byId.has(r)) p.push(`${o.name}: requires an unknown option (${r})`);
  }
  if (p.length) return p;
  // Cycles (depth-first search with colours).
  const colour = new Map(), stack = [];
  const visit = id => {
    colour.set(id, 1); stack.push(id);
    for (const r of byId.get(id).requires) {
      if (colour.get(r) === 1) { const c = stack.slice(stack.indexOf(r)).concat(r); p.push(`Circular dependency: ${c.map(name).join(' → ')}. Merge these options into one, or remove a dependency.`); return true; }
      if (!colour.get(r) && visit(r)) return true;
    }
    colour.set(id, 2); stack.pop(); return false;
  };
  for (const o of options) if (!colour.get(o.id) && visit(o.id)) return p;
  const closure = id => { const out = new Set([id]), todo = [id]; while (todo.length) for (const r of byId.get(todo.pop()).requires) if (!out.has(r)) { out.add(r); todo.push(r); } return out; };
  const groupClash = set => { const seen = new Map(); for (const id of set) { const g = byId.get(id).exclusiveGroup.trim().toLowerCase(); if (!g) continue; if (seen.has(g)) return [seen.get(g), id, g]; seen.set(g, id); } return null; };
  for (const o of options) { const c = groupClash(closure(o.id)); if (c) p.push(`${o.name} can never be chosen: it needs both ${name(c[0])} and ${name(c[1])}, which are mutually exclusive (group "${c[2]}").`); }
  const mand = options.filter(o => o.mandatory), all = new Set(mand.flatMap(o => [...closure(o.id)]));
  const c = groupClash(all);
  if (c && !p.length) p.push(`The mandatory decisions cannot all be met: they need both ${name(c[0])} and ${name(c[1])}, which are mutually exclusive (group "${c[2]}").`);
  return p;
}
/** Does a set of option ids respect the structural constraints? Returns null, or the first reason it does not. */
export function structureReason(options, ids) {
  const set = new Set(ids), groups = new Map();
  for (const o of options) {
    if (o.input.mandatory && !set.has(o.id)) return `${o.name} is mandatory`;
    if (!set.has(o.id)) continue;
    const missing = o.input.requires.find(r => !set.has(r)); if (missing) return `${o.name} requires ${options.find(x => x.id === missing)?.name ?? missing}`;
    const g = o.input.exclusiveGroup.trim().toLowerCase(); if (g) { if (groups.has(g)) return `${groups.get(g)} and ${o.name} are mutually exclusive`; groups.set(g, o.name); }
  }
  return null;
}

// ------------------------------------------------------------------ Finance engine plan
const prov = (m, kind = 'assumption') => ({kind, source: m.fictional ? 'Illustrative example — invented figure' : 'Entered in the LANOVA Advantage Lab', asOf: m.asOf ?? '2026-11-23'});
const factor = pct => 1 + pct / 100;
const engineScenario = (id, label, s) => ({id, label, revenueFactors: Object.fromEntries(REVENUE.map(c => [c, factor(s.revenuePct)])),
  costFactors: {payroll: factor(s.wagePct), payroll_taxes: factor(s.wagePct), operating: factor(s.operatingPct)}, capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: s.fromMonth, notes: ''});
/** Human description of a scenario's levers. */
export function scenarioText(m, k) {
  if (k === 'base') return 'Base case: revenue and costs as entered';
  const s = m.scenarios[k], ch = [];
  for (const [l, d] of Object.entries(LEVERS)) if (s[l]) ch.push(`${d.short} ${s[l] > 0 ? '+' : '−'}${Math.abs(s[l])}%`);
  return `${SCENARIOS[k]}: ${ch.length ? ch.join(', ') : 'same as the base case'}${ch.length ? `, from ${monthLabel(m.startMonth, s.fromMonth)} (month ${s.fromMonth + 1})` : ''}; option gains and costs included`;
}
/**
 * How much is known about an option's financial gain: 'known' (a single figure), 'range' (a documented range) or
 * 'unknown' (not estimable). An unknown gain is never counted as zero; it is excluded from the cash, and reported.
 */
export const gainStatus = o => (o.monthlyGain !== null && o.monthlyGain !== undefined ? 'known' : o.gainRange ? 'range' : 'unknown');
/**
 * Finance decisions for one option (prepared model). The gain used is the known figure; for a documented range, its low
 * end ('low', the prudent view) or its high end ('high'); an unknown gain is left out (prudent: it is never assumed).
 * - signing → a Finance "player" decision (fee capitalised and amortised, wages and employer charges in payroll, signing
 *   bonus paid at signing and expensed over the contract: the engine's corrected treatment);
 * - project → an investment (capital, paid by instalments) or one-off costs (expense, by instalments), and running
 *   costs as operating costs or as payroll (staff);
 * - financial gain → a revenue change (commercial revenue).
 */
export function optionDecisions(m, o, end = 'low') {
  const H = m.horizonMonths, s = o.startMonth, out = [], base = {selected: true, startMonth: s, ...prov(m), notes: ''}, label = t => `${o.name} — ${t}`.slice(0, 80);
  if (o.kind === 'signing') {
    out.push({...base, id: `${o.id}-player`, label: label('signing'), type: 'player', transferFee: o.transferFee, feePayments: o.transferFee > 0 ? instalments(o.transferFee, o.feeInstalments, s, 12) : [],
      agentFee: o.agentFee, contractMonths: o.contractMonths, monthlyWage: o.monthlyWage, employerChargeRate: o.employerChargeRate, signingBonus: o.signingBonus});
  } else {
    const plan = o.upfront > 0 ? instalments(o.upfront, o.instalments ?? 1, s, o.instalmentEveryMonths ?? 1) : [];
    if (o.upfrontType === 'capital' && o.upfront > 0)
      out.push({...base, id: `${o.id}-capital`, label: label('investment'), type: 'investment', amount: o.upfront, usefulLifeMonths: o.usefulLifeMonths, payments: plan,
        capexCategory: 'other', revenueCategory: 'commercial', monthlyRevenue: 0, monthlyOperatingCost: 0, operationsStartMonth: s});
    const oneOff = o.upfrontType === 'expense' ? plan : [], runEnd = Math.min(H - 1, s + Math.max(1, o.commitmentMonths) - 1), running = o.commitmentMonths > 0 && o.monthlyCost > 0;
    if (o.costType === 'staff' && running) out.push({...base, id: `${o.id}-staff`, label: label('staff costs'), type: 'payroll_change', monthlyAmount: o.monthlyCost, employerChargeRate: 0, endMonth: runEnd});
    const opRunning = o.costType !== 'staff' && running;
    if (oneOff.length || opRunning) {
      // First (or only) cost decision: running operating costs and the first expensed instalment; then one per instalment.
      const first = oneOff[0]?.month === s ? oneOff.shift().amount : 0;
      if (first > 0 || opRunning) out.push({...base, id: `${o.id}-costs`, label: label('costs'), type: 'cost_change', monthlyAmount: opRunning ? o.monthlyCost : 0, oneOffCost: first, endMonth: opRunning ? runEnd : s});
      oneOff.forEach((x, k) => out.push({...base, id: `${o.id}-instalment-${k + 2}`, label: label(`instalment ${k + 2}`), type: 'cost_change', startMonth: x.month, monthlyAmount: 0, oneOffCost: x.amount, endMonth: x.month}));
    }
  }
  const g0 = s + o.effectMonths, st = gainStatus(o), gain = st === 'known' ? o.monthlyGain : st === 'range' ? o.gainRange[end] : 0;
  if (gain !== 0 && g0 < H)
    out.push({...base, id: `${o.id}-gain`, label: label(`financial gain${st === 'range' ? ` (${end})` : ''}`), type: 'revenue_change', startMonth: g0, category: 'commercial', mode: 'amount', value: gain, endMonth: Math.min(H - 1, g0 + o.gainMonths - 1)});
  return out;
}
/**
 * The organisation's plan, in the Finance engine's lanova-finance-v1 format. Revenue and operating costs are spread
 * evenly; when staff costs are entered, they are payroll (wage scenarios apply to them), the rest is operating costs.
 * `stress` (sensitivity analysis only) changes the base case itself, from the first month.
 */
export function basePlan(m0, decisions = [], stress = null) {
  const m = migrate(m0), H = m.horizonMonths, f = m.finance, flat = v => Array(H).fill(v), staff = f.staffCosts ?? 0;
  const lines = [{id: 'revenue', label: 'Operating revenue (all sources)', category: 'other_revenue', values: flat(f.annualRevenue / 12), cashLagMonths: 0, ...prov(m)}];
  if (staff > 0) lines.push({id: 'staff', label: 'Staff costs (wages and charges)', category: 'payroll', values: flat(staff / 12), cashLagMonths: 0, ...prov(m)});
  lines.push({id: 'costs', label: staff > 0 ? 'Other operating costs' : 'Operating costs (all, including staff)', category: 'operating', values: flat((f.annualOperatingCosts - staff) / 12), cashLagMonths: 0, ...prov(m)});
  const zero = {revenuePct: 0, operatingPct: 0, wagePct: 0, fromMonth: 0};
  return {schema: 'lanova-finance-v1', name: m.label || 'Advantage Lab plan', currency: 'EUR', fictional: Boolean(m.fictional), startMonth: m.startMonth, horizonMonths: H,
    openingCash: f.openingCash, minimumCash: f.minimumCash, policy: {payrollRatioLimit: null, minimumDscr: null}, source: prov(m).source, asOf: prov(m).asOf,
    lines, capex: [], loans: [], decisions, imports: [],
    scenarios: [engineScenario('base', 'Base case', {...zero, ...(stress ?? {})}), engineScenario('downside', 'Downside', m.scenarios.downside), engineScenario('upside', 'Upside', m.scenarios.upside)]};
}
const SC = ['base', 'downside', 'upside'];
const cashOf = (plan, scen, ids) => forecast(plan, {scenario: scen, decisions: ids}).months.map(x => x.closingCash);
// Engine runs are cached by their exact inputs (an evaluation reruns only what changed, e.g. during sensitivity analysis).
const CACHE = new Map();
function engineCash(m, decisions, stress) {
  const plan = basePlan(m, decisions, stress), key = JSON.stringify(plan);
  if (CACHE.has(key)) return CACHE.get(key);
  const problems = validatePlan(plan);
  const out = problems.length ? {problems} : Object.fromEntries(SC.map(s => [s, cashOf(plan, s, decisions.map(d => d.id))]));
  if (CACHE.size > 6000) CACHE.clear();
  CACHE.set(key, out); return out;
}
const minus = (a, b) => Object.fromEntries(SC.map(s => [s, a[s].map((v, t) => v - b[s][t])]));
/**
 * Direct engine run of a whole combination (one plan with every option's decisions), to reconcile the combination cash
 * (baseline + sum of option changes) to the cent. The engine accepts at most 12 decisions per plan: larger combinations
 * return null (their reconciliation rests on the per-option runs, whose additivity the tests check).
 */
export function directCombination(m0, ids, stress = null) {
  const m = prepare(m0), decisions = m.options.filter(o => ids.includes(o.id)).flatMap(o => optionDecisions(m, o));
  if (decisions.length > 12) return null;
  const r = engineCash(m, decisions, stress); return r.problems ? null : r;
}

/**
 * Cash of a combination in the three scenarios, from per-option engine runs (cached): baseline + sum of each option's
 * cash change. Used by the sensitivity analysis to recalculate a combination after changing one input.
 */
export function engineCombination(m0, ids, stress = null, extra = []) {
  const m = prepare(m0), base = engineCash(m, [], stress);
  if (base.problems) return {problems: base.problems};
  const parts = [...m.options.filter(o => ids.includes(o.id)).map(o => optionDecisions(m, o)), ...extra.map(d => [d])];
  const cash = Object.fromEntries(SC.map(s => [s, [...base[s]]]));
  for (const ds of parts) { const r = engineCash(m, ds, stress); if (r.problems) return {problems: r.problems}; for (const s of SC) r[s].forEach((v, t) => { cash[s][t] += v - base[s][t]; }); }
  return {cash, upfront: sum(m.options.filter(o => ids.includes(o.id)).map(o => (o.kind === 'signing' ? o.transferFee + o.agentFee + o.signingBonus : o.upfront)))};
}

// ------------------------------------------------------------------ evaluation
/** Cost and gain totals of one option (prepared model), computed from its inputs (no engine needed). */
export function optionTotals(m, o) {
  const H = m.horizonMonths, s = o.startMonth;
  const activeMonths = o.commitmentMonths > 0 ? Math.max(0, Math.min(H, s + o.commitmentMonths) - s) : 0;
  const runningInHorizon = o.monthlyCost * activeMonths, after = o.monthlyCost * Math.max(0, o.commitmentMonths - activeMonths);
  const st = gainStatus(o), g0 = s + o.effectMonths, costsIn = o.upfront + runningInHorizon;
  const gainMonthsIn = st === 'unknown' ? null : Math.max(0, Math.min(H, g0 + o.gainMonths) - Math.min(H, g0));
  const gainInHorizon = st === 'known' ? o.monthlyGain * gainMonthsIn : null;
  const gainRangeInHorizon = st === 'known' ? [gainInHorizon, gainInHorizon] : st === 'range' ? [o.gainRange.low * gainMonthsIn, o.gainRange.high * gainMonthsIn] : null;
  const netFinancialRange = gainRangeInHorizon && gainRangeInHorizon.map(g => g - costsIn);
  return {upfront: o.upfront, runningInHorizon, commitmentsAfterHorizon: after, totalCost: o.upfront + runningInHorizon + after,
    gainInHorizon, netFinancialInHorizon: gainInHorizon === null ? null : gainInHorizon - costsIn, gainEstimable: st === 'known',
    // 'complete' (single figure), 'range' (documented range) or 'unknown' (not estimable).
    financialStatus: st === 'known' ? 'complete' : st, gainRangeInHorizon, netFinancialRange,
    // Prudent net effect: known gain, low end of a range, or costs only when the gain is unknown. A floor, not an estimate of benefits.
    prudentNetInHorizon: netFinancialRange ? netFinancialRange[0] : -costsIn,
    // Can the unknown or uncertain part of the gain change anything inside the horizon?
    gainUncertainInHorizon: st === 'unknown' ? g0 < H : st === 'range' ? gainMonthsIn > 0 && o.gainRange.high > o.gainRange.low : false};
}
const contribution = (m, o, t) => m.objective === 'immediate' ? o.shortTermScore : m.objective === 'development' ? o.longTermScore : t.netFinancialInHorizon;

/**
 * Full evaluation. Returns {problems} when the inputs cannot be computed; otherwise the baseline in the three
 * scenarios, every option with its totals, engine cash, hard-constraint status, dominance, and the best combination
 * under each strategy. `stress` (sensitivity analysis) changes the base case, from the first month.
 */
export function evaluate(m0, {weights, stress = null, only = null} = {}) {
  const problems = check(m0);
  if (problems.length) return {problems};
  const m = prepare(m0), H = m.horizonMonths, f = m.finance, months = Array.from({length: H}, (_, t) => monthLabel(m.startMonth, t)), mustHold = m.constraints.downsideMustHold;
  const base = engineCash(m, [], stress); if (base.problems) return {problems: base.problems.map(x => `Finance engine: ${x}`)};
  const options = m.options.map(o => {
    const decisions = optionDecisions(m, o), run = engineCash(m, decisions, stress);
    if (run.problems) return {id: o.id, name: o.name, invalid: run.problems};
    const cash = run, delta = minus(cash, base);
    const t = optionTotals(m, o), minBase = Math.min(...cash.base), minDown = Math.min(...cash.downside);
    // Cash at the high end of a documented gain range (the prudent figures above use the low end).
    let deltaHigh = delta;
    if (t.financialStatus === 'range') { const rh = engineCash(m, optionDecisions(m, o, 'high'), stress); if (rh.problems) return {id: o.id, name: o.name, invalid: rh.problems}; deltaHigh = minus(rh, base); }
    const unknownGain = t.financialStatus === 'unknown' && t.gainUncertainInHorizon;
    // Highest month-end cash the option could have: unbounded when its gain is unknown and could start within the horizon.
    const minCashUpper = unknownGain ? Infinity : Math.min(...base.base.map((v, i) => v + deltaHigh.base[i]));
    const reasons = [];
    const budgetOk = o.upfront <= f.decisionBudget + TOL;
    if (!budgetOk) reasons.push(`Immediate cost ${fmt(o.upfront)} exceeds the budget available for these decisions (${fmt(f.decisionBudget)}).`);
    const breach = cash.base.findIndex(v => v < f.minimumCash - TOL);
    if (breach >= 0) reasons.push(`Month-end cash falls below the minimum reserve (${fmt(f.minimumCash)}) in ${months[breach]}: ${fmt(cash.base[breach])}.`);
    const breachDown = cash.downside.findIndex(v => v < f.minimumCash - TOL);
    if (mustHold && breachDown >= 0) reasons.push(`In the downside scenario, month-end cash falls below the reserve in ${months[breachDown]}: ${fmt(cash.downside[breachDown])} (the reserve must also hold in the downside).`);
    const warnings = [];
    if (t.commitmentsAfterHorizon > 0) warnings.push(`${fmt(t.commitmentsAfterHorizon)} of running costs fall after the ${H}-month horizon.`);
    if (!mustHold && minDown < f.minimumCash - TOL) warnings.push(`In the downside scenario (${scenarioText(m, 'downside').replace(/^Downside: /, '')}), cash falls to ${fmt(minDown)}, below the reserve.`);
    if (o.effectMonths >= H - o.startMonth) warnings.push('Its expected effect starts after the decision horizon.');
    if (unknownGain) warnings.push('Its financial gain is not estimable: the cash figures exclude it (prudent cash). They are not an estimate of its full benefit.');
    if (t.financialStatus === 'range') warnings.push(`Cash uses the low end of its documented gain range (${fmt(o.gainRange.low)} to ${fmt(o.gainRange.high)} per month; source: ${o.gainRange.basis}).`);
    // Excluded only by the reserve, and its gain could lift cash: the unknown (or the top of the range) could make it feasible.
    const couldBecomeFeasible = reasons.length > 0 && budgetOk && (unknownGain || minCashUpper >= f.minimumCash - TOL);
    if (couldBecomeFeasible) warnings.push(unknownGain ? 'It fails the reserve without its gain, which is not estimable: once known, the gain could make it feasible.' : 'It fails the reserve at the low end of its gain range but not at the high end.');
    if (o.requires.length) warnings.push(`Requires: ${o.requires.map(r => m.options.find(x => x.id === r).name).join(', ')}.`);
    if (o.exclusiveGroup.trim()) warnings.push(`Mutually exclusive group "${o.exclusiveGroup.trim()}": at most one option of the group in a combination.`);
    const missing = [];
    if (o.shortTermScore === null) missing.push('immediate contribution'); if (o.longTermScore === null) missing.push('long-term contribution');
    if (o.monthlyGain === null) missing.push('financial gain (not estimable)'); if (o.risk === null) missing.push('risk level');
    return {id: o.id, name: o.name, category: o.category ?? '', input: o, totals: t, cash, delta, deltaHigh, unknownGain, minCashUpper, couldBecomeFeasible, budgetOk, minCashBase: minBase, minCashDownside: minDown,
      minCashUpside: Math.min(...cash.upside), cashImpactLowest: minBase - Math.min(...base.base), closingCashDelta: delta.base[H - 1], feasible: reasons.length === 0, reasons, warnings, missing,
      horizonMonths: o.startMonth + o.effectMonths, contribution: contribution(m, o, t), risk: o.risk, confidence: o.confidence ?? null, decisions: optionDecisions(m, o).length};
  });
  const invalid = options.filter(o => o.invalid);
  if (invalid.length) return {problems: invalid.flatMap(o => o.invalid.map(x => `${o.name}: ${x}`))};
  markDominance(options);
  const strategies = Object.fromEntries(Object.keys(STRATEGIES).filter(k => !only || k === only).map(k => [k, bestCombination(m, base, options, weights?.[k] ?? STRATEGIES[k].weights)]));
  const financial = {optionsWithUnknownGain: options.filter(o => o.unknownGain).map(o => o.name), optionsWithGainRange: options.filter(o => o.totals.financialStatus === 'range').map(o => o.name),
    strategiesAffected: Object.keys(strategies).filter(k => strategies[k].financial.incomplete)};
  financial.complete = financial.optionsWithUnknownGain.length === 0 && financial.optionsWithGainRange.length === 0;
  return {problems: [], model: m, months, horizon: H, base, baseMinCash: Math.min(...base.base), baseMinCashDownside: Math.min(...base.downside), baseMinCashUpside: Math.min(...base.upside),
    options, strategies, objective: m.objective, financial, downsideMustHold: mustHold};
}

/**
 * Pareto dominance among FEASIBLE options, on the dimensions that can be compared for both options:
 * total cost (lower is better), contribution to the selected objective (higher), risk level (lower) and lowest base
 * month-end cash with the option (higher). B dominates A when B is no worse on every one of them and strictly better
 * on at least one. When the contribution or the risk of either option is missing, the pair is not compared.
 */
export function markDominance(options) {
  const ok = options.filter(o => o.feasible);
  for (const a of options) { a.dominatedBy = []; a.comparable = a.contribution !== null && a.risk !== null; }
  for (const a of ok) for (const b of ok) {
    if (a === b || !a.comparable || !b.comparable) continue;
    // B's cash is its prudent figure; A's is the highest it could be, so an unknown or ranged gain never makes A look dominated.
    const dims = [[b.totals.totalCost, a.totals.totalCost, -1], [b.contribution, a.contribution, 1], [RISK[b.risk], RISK[a.risk], -1], [b.minCashBase, a.minCashUpper ?? a.minCashBase, 1]];
    const noWorse = dims.every(([x, y, s]) => s * (x - y) >= -1e-9), better = dims.some(([x, y, s]) => s * (x - y) > 1e-9);
    if (noWorse && better) a.dominatedBy.push(b.name);
  }
  for (const o of options) o.status = !o.feasible ? 'infeasible' : !o.comparable ? 'not-comparable' : o.dominatedBy.length ? 'dominated' : 'frontier';
  return options;
}

/**
 * Combination cash in each scenario: baseline + sum of each option's engine cash change (the engine is linear for
 * these decisions; directCombination() and the tests check it to the cent).
 */
export function combinationCash(r, ids) {
  const set = r.options.filter(o => ids.includes(o.id));
  return Object.fromEntries(SC.map(s => [s, r.base[s].map((v, t) => v + sum(set.map(o => o.delta[s][t])))]));
}
/** Scenario results of a combination: lowest cash, its month, headroom over the reserve, cash at the end, reserve met. */
export function scenarioResults(r, ids) {
  const m = r.model, cash = combinationCash(r, ids), set = r.options.filter(o => ids.includes(o.id)), upfront = sum(set.map(o => o.totals.upfront));
  return {ids, upfront, withinBudget: upfront <= m.finance.decisionBudget + TOL, budgetHeadroom: m.finance.decisionBudget - upfront,
    scenarios: Object.fromEntries(SC.map(s => { const c = cash[s], lo = Math.min(...c), i = c.indexOf(lo);
      return [s, {label: SCENARIOS[s], text: scenarioText(m, s), cash: c, lowest: lo, lowestMonth: r.months[i], headroom: lo - m.finance.minimumCash, end: c.at(-1), meetsReserve: lo >= m.finance.minimumCash - TOL,
        firstBelow: (() => { const k = c.findIndex(v => v < m.finance.minimumCash - TOL); return k < 0 ? null : r.months[k]; })()}]; }))};
}

/**
 * Best combination for one strategy. Candidates: every subset of the options within the budget on their own
 * (at most 2¹⁰), including "do nothing". Structural constraints first (mandatory options, dependencies, mutually
 * exclusive groups), then hard constraints: total immediate cost within the budget, base-case month-end cash at or
 * above the reserve in every month, and the same in the downside scenario when required. Then the preference score:
 * weighted sum of criteria, each scaled between the worst and the best feasible combination (0 to 1).
 *
 * Missing data is never read as zero. A missing 0–10 estimate spans 0 to 10. A documented gain range spans its two
 * ends. A gain that is not estimable cannot be bounded: the cash is computed without it (prudent cash), and when the
 * strategy uses money or cash, or when the gain could lift a combination over the reserve, the strategy is reported
 * as "Financial comparison incomplete", with every option concerned.
 */
export function bestCombination(m, base, options, weights) {
  const f = m.finance, pool = options.filter(o => o.budgetOk ?? o.feasible), H = m.horizonMonths, n = pool.length, combos = [], reserveExcluded = [], rejected = [];
  const mustHold = Boolean(m.constraints?.downsideMustHold), counts = {structure: 0, budget: 0, reserve: 0, downside: 0};
  const w = normaliseWeights(weights), keys = Object.keys(w), usesCash = w.money > 0 || w.security > 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = pool.filter((_, i) => mask & (1 << i)), ids = set.map(o => o.id);
    const why = structureReason(options, ids); if (why) { counts.structure++; continue; }
    const upfront = sum(set.map(o => o.totals.upfront));
    const cashBase = base.base.map((v, t) => v + sum(set.map(o => o.delta.base[t]))), cashDown = base.downside.map((v, t) => v + sum(set.map(o => o.delta.downside[t])));
    const minBase = Math.min(...cashBase), minDown = Math.min(...cashDown), withinBudget = upfront <= f.decisionBudget + TOL;
    const unknownMoney = set.filter(o => o.unknownGain).map(o => o.name), rangeMoney = set.filter(o => o.totals.financialStatus === 'range' && o.totals.gainUncertainInHorizon).map(o => o.name);
    const cashDownHigh = base.downside.map((v, t) => v + sum(set.map(o => o.deltaHigh.downside[t])));
    const c = {options: set.map(o => o.name), ids, upfront, totalCost: sum(set.map(o => o.totals.totalCost)), minCashBase: minBase, minCashDownside: minDown,
      minCashUpside: Math.min(...base.upside.map((v, t) => v + sum(set.map(o => o.delta.upside[t])))), closingCash: cashBase[H - 1], cashBase, holdsDownside: minDown >= f.minimumCash - TOL,
      // Each criterion as an interval [low, high]; the ranking uses the midpoint. See the comment above.
      crit: interval(set, cashDown, cashDownHigh),
      unknown: {short: set.filter(o => o.input.shortTermScore === null).map(o => o.name), long: set.filter(o => o.input.longTermScore === null).map(o => o.name), money: unknownMoney, range: rangeMoney},
      missing: [...new Set(set.flatMap(o => o.missing.map(x => `${o.name}: ${x}`)))], highRisk: set.filter(o => o.risk === 'high').map(o => o.name)};
    if (!withinBudget) { counts.budget++; rejected.push({...c, because: `immediate cost ${fmt(upfront)} exceeds the budget (${fmt(f.decisionBudget)})`}); continue; }
    const failsBase = minBase < f.minimumCash - TOL, failsDown = mustHold && minDown < f.minimumCash - TOL;
    if (failsBase || failsDown) {
      if (failsBase) counts.reserve++; else counts.downside++;
      rejected.push({...c, because: failsBase ? `month-end cash falls to ${fmt(minBase)}, below the reserve (${fmt(f.minimumCash)})` : `in the downside scenario, cash falls to ${fmt(minDown)}, below the reserve`});
      // Fails the reserve with prudent cash. Could the gains left out (unknown) or the top of a documented range lift it?
      const highMin = Math.min(...base.base.map((v, t) => v + sum(set.map(o => o.deltaHigh.base[t])))), highDown = Math.min(...cashDownHigh);
      if (unknownMoney.length) reserveExcluded.push({options: c.options, because: 'unknown', gains: unknownMoney});
      else if (rangeMoney.length && highMin >= f.minimumCash - TOL && (!mustHold || highDown >= f.minimumCash - TOL)) reserveExcluded.push({options: c.options, because: 'range', gains: rangeMoney});
      continue;
    }
    combos.push(c);
  }
  if (!combos.length) {
    // Nothing meets the constraints: either the organisation's own plan already breaks the reserve ("do nothing" fails),
    // or the mandatory decisions cannot be met within the budget and the reserve.
    const mandatory = options.filter(o => o.input.mandatory);
    const best = {options: [], ids: [], upfront: 0, totalCost: 0, minCashBase: Math.min(...base.base), minCashDownside: Math.min(...base.downside), minCashUpside: Math.min(...base.upside), closingCash: base.base[H - 1], cashBase: base.base,
      crit: {short: [0, 0], long: [0, 0], money: [0, 0], security: [Math.min(...base.downside), Math.min(...base.downside)]}, unknown: {short: [], long: [], money: [], range: []}, parts: {}, score: 0, scoreLow: 0, scoreHigh: 0, missing: [], highRisk: []};
    const financial = financialReading(options, best, null, reserveExcluded, usesCash, true);
    const noFeasibleReason = mandatory.length && Math.min(...base.base) >= f.minimumCash - TOL && (!mustHold || Math.min(...base.downside) >= f.minimumCash - TOL)
      ? `The mandatory decisions (${mandatory.map(o => o.name).join(', ')}) cannot be met within the budget and the cash reserve${mustHold ? ', in the base and downside scenarios' : ''}.`
      : `Even without any option, month-end cash falls below the reserve${Math.min(...base.base) >= f.minimumCash - TOL ? ' in the downside scenario' : ''}.`;
    return {weights: w, candidates: 0, best, runnerUp: null, status: 'no-feasible', noFeasibleReason, missingUsed: [], contenders: [], assumptionsNeeded: [], unboundedGains: financial.optionsWithUnknownGain.map(x => x.name), financial,
      rejectedCounts: counts, rejectedBest: [], bestRobust: null};
  }
  // Scale every criterion between the lowest low and the highest high over all candidates, then score each candidate
  // three times: at the low ends, at the midpoints (the ranking) and at the high ends (the range missing data allows).
  const lo = Object.fromEntries(keys.map(k => [k, Math.min(...combos.map(c => c.crit[k][0]))])), hi = Object.fromEntries(keys.map(k => [k, Math.max(...combos.map(c => c.crit[k][1]))]));
  const scale = (k, v) => (hi[k] - lo[k] > 1e-9 ? (v - lo[k]) / (hi[k] - lo[k]) : 0);
  const score = c => {
    c.parts = Object.fromEntries(keys.map(k => [k, scale(k, (c.crit[k][0] + c.crit[k][1]) / 2)]));
    c.score = sum(keys.map(k => w[k] * c.parts[k])); c.scoreLow = sum(keys.map(k => w[k] * scale(k, c.crit[k][0]))); c.scoreHigh = sum(keys.map(k => w[k] * scale(k, c.crit[k][1])));
  };
  combos.forEach(score);
  combos.sort((a, b) => b.score - a.score || a.totalCost - b.totalCost || a.options.length - b.options.length);
  const best = combos[0], runnerUp = combos.find(c => c !== best) ?? null;
  // Combinations ruled out by a hard constraint that the preferences alone would have ranked above the best (scored on
  // the same scale as the feasible ones), with the constraint that rules each out.
  rejected.forEach(score);
  const rejectedBest = rejected.filter(c => c.score > best.score + 1e-9).sort((a, b) => b.score - a.score).slice(0, 3).map(c => ({options: c.options, ids: c.ids, score: c.score, because: c.because}));
  const bestRobust = mustHold || best.holdsDownside ? null : (combos.find(c => c.holdsDownside) ?? null);
  // Missing data that a weighted criterion uses, for a candidate (0–10 estimates, and documented gain ranges).
  const used = c => [...(w.short > 0 ? c.unknown.short.map(n => `${n}: immediate contribution`) : []), ...(w.long > 0 ? c.unknown.long.map(n => `${n}: long-term contribution`) : []),
    ...(usesCash ? c.unknown.range.map(n => `${n}: financial gain within its documented range`) : [])];
  // Contenders: candidates whose range reaches above the best's once the missing data is known. Only missing data can
  // make this happen; with complete data the ranges are points and there is no contender.
  const contenders = combos.filter(c => c !== best && (used(c).length || used(best).length) && c.scoreHigh > best.scoreLow + 1e-9);
  const rangeExcluded = reserveExcluded.filter(x => x.because === 'range');
  const missingUsed = used(best), assumptionsNeeded = [...new Set([...missingUsed, ...contenders.slice(0, 3).flatMap(used),
    ...rangeExcluded.flatMap(x => x.gains.map(g => `${g}: financial gain within its documented range (decides whether ${x.options.join(' + ')} keeps the reserve)`))])].slice(0, 12);
  const financial = financialReading(options, best, runnerUp, reserveExcluded, usesCash, false);
  const close = runnerUp && best.score - runnerUp.score < 0.05;
  const status = financial.incomplete ? 'financial-incomplete' : contenders.length || rangeExcluded.length ? 'uncertain' : close ? 'close-call' : 'indicative';
  return {weights: w, candidates: combos.length, best, runnerUp, status, missingUsed, contenders: contenders.slice(0, 3).map(c => ({options: c.options, score: c.score, scoreHigh: c.scoreHigh})), assumptionsNeeded,
    unboundedGains: financial.optionsWithUnknownGain.map(x => x.name), financial, rejectedCounts: counts, rejectedBest, bestRobust, why: runnerUp ? whyNotAlternative(w, best, runnerUp) : null};
}
/** Why the alternative ranks below the best: the weighted criteria where it is behind, largest first. */
export function whyNotAlternative(w, best, alt) {
  return Object.keys(w).filter(k => w[k] > 0).map(k => ({criterion: k, label: CRITERIA[k], weighted: w[k] * (best.parts[k] - alt.parts[k]),
    best: (best.crit[k][0] + best.crit[k][1]) / 2, alternative: (alt.crit[k][0] + alt.crit[k][1]) / 2})).filter(x => x.weighted > 1e-9).sort((a, b) => b.weighted - a.weighted);
}
/**
 * Is the financial comparison complete for this strategy? It is not when a gain that is not estimable could change the
 * ranking: the strategy weighs money or cash and a feasible option has such a gain, or such a gain could lift an option
 * or a combination over the reserve. Every option with an unknown gain is listed with its role, selected or not.
 */
function financialReading(options, best, runnerUp, reserveExcluded, usesCash, noFeasible) {
  const role = o => !o.feasible ? (o.couldBecomeFeasible ? 'not feasible without its gain; the gain could make it feasible' : 'not feasible on its own')
    : best.ids.includes(o.id) ? 'in the best combination' : runnerUp?.ids.includes(o.id) ? 'in the alternative' : 'feasible, not selected';
  const list = options.filter(o => o.unknownGain).map(o => ({name: o.name, role: role(o)}));
  const reasons = [];
  if (!noFeasible && usesCash && options.some(o => o.feasible && o.unknownGain)) reasons.push('This strategy weighs net financial effect or cash, and a feasible option has a gain that is not estimable.');
  if (options.some(o => o.unknownGain && o.couldBecomeFeasible)) reasons.push('An option fails the reserve without its gain, which is not estimable.');
  const ex = reserveExcluded.filter(x => x.because === 'unknown');
  if (ex.length) reasons.push(`${ex.length} combination${ex.length > 1 ? 's fail' : ' fails'} the reserve without gains that are not estimable.`);
  return {incomplete: reasons.length > 0, reasons, optionsWithUnknownGain: list};
}
function interval(set, cashDown, cashDownHigh) {
  const est = k => [sum(set.map(o => o.input[k] ?? 0)), sum(set.map(o => o.input[k] ?? 10))];
  // Net financial effect: a known gain is a point, a documented range spans its two ends, an unknown gain counts its
  // costs only (prudent). The unknown is not hidden: it is reported by financialReading().
  const money = [sum(set.map(o => o.totals.prudentNetInHorizon)), sum(set.map(o => o.totals.netFinancialRange?.[1] ?? o.totals.prudentNetInHorizon))];
  return {short: est('shortTermScore'), long: est('longTermScore'), money, security: [Math.min(...cashDown), Math.min(...cashDownHigh)]};
}
export function normaliseWeights(w) {
  const k = Object.keys(CRITERIA), v = k.map(x => Math.max(0, Number(w?.[x]) || 0)), s = sum(v);
  return Object.fromEntries(k.map((x, i) => [x, s > 0 ? v[i] / s : 1 / k.length]));
}


// ------------------------------------------------------------------ brief and exports
export const FINANCIAL_INCOMPLETE = 'Financial comparison incomplete';
export const READINGS = Object.freeze({indicative: 'Indicative', 'close-call': 'Close call — examine the alternative', uncertain: 'Uncertain — depends on missing estimates',
  'financial-incomplete': `${FINANCIAL_INCOMPLETE} — a gain that is not estimable could change the ranking`, 'no-feasible': 'Even without any option, cash falls below the reserve'});
export const PRUDENT_CASH = 'Cash and net financial figures are prudent: they include known gains and the low end of documented gain ranges, and leave out gains that are not estimable. They are not an estimate of total benefits.';
/**
 * The single financial-completeness notice shared by the interface, the brief (JSON, HTML) and the CSV export, so the
 * five always name the same options. null when every gain is a single known figure.
 */
export function financialNotice(r) {
  const {optionsWithUnknownGain: unknown, optionsWithGainRange: ranges, strategiesAffected: affected} = r.financial;
  if (!unknown.length && !ranges.length) return null;
  const incomplete = affected.length > 0, strategies = affected.map(k => STRATEGIES[k].label);
  const parts = [];
  if (unknown.length) parts.push(incomplete
    ? `The financial gain of ${unknown.join(', ')} is not estimable. The cash figures leave it out (prudent cash), so they do not describe its full benefit, and the ranking could change once it is known (${strategies.join('; ')}).`
    : `The financial gain of ${unknown.join(', ')} is not estimable and is left out of the cash figures (prudent cash). No strategy ranking here depends on it.`);
  if (ranges.length) parts.push(`Documented gain ranges for ${ranges.join(', ')}: cash uses the low end; the ranking accounts for both ends.`);
  const title = incomplete ? FINANCIAL_INCOMPLETE : unknown.length ? 'Financial gains not estimable' : 'Financial gains as documented ranges', text = parts.join(' ');
  // The title is stated once, followed by the explanation (full = what every export prints).
  return {incomplete, title, text, full: `${title}. ${text}`, optionsWithUnknownGain: unknown, optionsWithGainRange: ranges, strategies};
}
/** Net financial effect over the horizon, as text: a figure, a documented range, or costs only when the gain is unknown. */
export const netFinancialText = o => o.totals.financialStatus === 'complete' ? fmt(o.totals.netFinancialInHorizon) : o.totals.financialStatus === 'range'
  ? `${fmt(o.totals.netFinancialRange[0])} to ${fmt(o.totals.netFinancialRange[1])} (documented range)` : 'gain not estimable: costs only';
/** Structural constraints of the options, in words. */
export function structureText(m) {
  const name = id => m.options.find(o => o.id === id)?.name ?? id, out = [];
  for (const o of m.options.filter(x => x.mandatory)) out.push(`Mandatory: ${o.name}`);
  for (const o of m.options.filter(x => x.requires.length)) out.push(`${o.name} requires ${o.requires.map(name).join(' and ')}`);
  const groups = {}; for (const o of m.options.filter(x => x.exclusiveGroup.trim())) (groups[o.exclusiveGroup.trim()] ??= []).push(o.name);
  for (const [g, n] of Object.entries(groups)) out.push(`At most one of (group "${g}"): ${n.join(', ')}`);
  return out;
}
const scenarioBrief = (r, ids) => { const x = scenarioResults(r, ids);
  return Object.fromEntries(Object.entries(x.scenarios).map(([k, v]) => [k, {lowestCash: round2(v.lowest), lowestMonth: v.lowestMonth, headroomOverReserve: round2(v.headroom), cashAtEnd: round2(v.end), reserveMet: v.meetsReserve, firstMonthBelowReserve: v.firstBelow}])); };
export function brief(m0, r, {sensitivity = null, origin = null} = {}) {
  const m = r.model ?? prepare(m0), f = m.finance, notice = financialNotice(r);
  return {
    schema: 'lanova-advantage-brief-v1', dataOrigin: origin ?? (m.fictional ? 'Illustrative example — every figure is invented' : 'Entered by the user — not verified by LANOVA'),
    financialPosition: {openingCash: f.openingCash, annualRevenue: f.annualRevenue, annualOperatingCosts: f.annualOperatingCosts, staffCostsIncluded: f.staffCosts, minimumCashReserve: f.minimumCash, budgetForTheseDecisions: f.decisionBudget},
    scenarioAssumptions: Object.fromEntries(['downside', 'upside'].map(k => [SCENARIOS[k], {...m.scenarios[k], activationMonth: monthLabel(m.startMonth, m.scenarios[k].fromMonth)}])),
    structuralConstraints: structureText(m), reserveMustHoldInDownside: m.constraints.downsideMustHold,
    generatedFor: m.label || 'Untitled', fictional: Boolean(m.fictional), sport: m.sport, structure: m.structure,
    objective: OBJECTIVES[m.objective].label, horizon: `${m.horizonMonths} months from ${m.startMonth}`,
    hardConstraints: [`Immediate cost of the selected options within the budget available: ${fmt(f.decisionBudget)}`, `Month-end cash at or above the minimum reserve in every month (base case${m.constraints.downsideMustHold ? ' and downside scenario' : ''}): ${fmt(f.minimumCash)}`],
    preferences: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [STRATEGIES[k].label, s.weights])),
    scenariosStudied: ['base', 'downside', 'upside'].map(k => scenarioText(m, k)),
    baseline: {lowestCash: round2(r.baseMinCash), lowestCashDownside: round2(r.baseMinCashDownside), cashAtEnd: round2(r.base.base.at(-1))},
    financialComparison: {status: notice?.incomplete ? 'incomplete' : 'complete', title: notice?.title ?? null, warning: notice?.full ?? null, optionsWithUnknownGain: r.financial.optionsWithUnknownGain, optionsWithGainRange: r.financial.optionsWithGainRange,
      strategiesAffected: notice?.strategies ?? [], prudentCash: PRUDENT_CASH},
    options: r.options.map(o => ({name: o.name, status: o.status, financialStatus: o.totals.financialStatus, immediateCost: o.totals.upfront, runningCostInHorizon: o.totals.runningInHorizon, commitmentsAfterHorizon: o.totals.commitmentsAfterHorizon,
      totalCost: o.totals.totalCost, financialGainInHorizon: o.totals.gainInHorizon, netFinancialInHorizon: o.totals.netFinancialInHorizon,
      gainRangePerMonth: o.input.gainRange && gainStatus(o.input) === 'range' ? [o.input.gainRange.low, o.input.gainRange.high] : null, gainRangeBasis: gainStatus(o.input) === 'range' ? o.input.gainRange.basis : null,
      netFinancialRangeInHorizon: o.totals.financialStatus === 'range' ? o.totals.netFinancialRange : null, prudentNetFinancialInHorizon: o.totals.prudentNetInHorizon, lowestCashWithOption: round2(o.minCashBase), lowestCashDownside: round2(o.minCashDownside),
      immediateContributionEstimate: o.input.shortTermScore, longTermContributionEstimate: o.input.longTermScore, risk: o.risk, confidence: o.confidence, monthsToEffect: o.horizonMonths,
      infeasibleBecause: o.reasons, dominatedBy: o.dominatedBy, warnings: o.warnings, missingData: o.missing,
      kind: o.input.kind, mandatory: o.input.mandatory, requires: o.input.requires.map(id => r.options.find(x => x.id === id)?.name ?? id), exclusiveGroup: o.input.exclusiveGroup || null,
      paymentSchedule: o.input.kind === 'signing' ? `transfer fee in ${o.input.feeInstalments} yearly instalment(s); agent fee and signing bonus at signing` : o.input.upfront > 0 ? `${o.input.instalments} instalment(s), every ${o.input.instalmentEveryMonths} month(s), from month ${o.input.startMonth + 1}` : 'none',
      lowestCashUpside: round2(o.minCashUpside)})),
    strategies: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [STRATEGIES[k].label, {status: s.status, options: s.best.options, immediateCost: s.best.upfront, totalCost: s.best.totalCost,
      lowestCash: round2(s.best.minCashBase), lowestCashDownside: round2(s.best.minCashDownside), alternative: s.runnerUp ? s.runnerUp.options : null, missingDataUsed: s.missingUsed,
      couldRankHigherOnceKnown: s.contenders.map(c => c.options), estimatesNeededToSettle: s.assumptionsNeeded, gainsNotEstimableExcluded: s.unboundedGains,
      financialComparison: s.financial.incomplete ? FINANCIAL_INCOMPLETE : 'complete', financialIncompleteBecause: s.financial.reasons, optionsWithUnknownGain: s.financial.optionsWithUnknownGain,
      cashByScenario: s.status === 'no-feasible' ? null : scenarioBrief(r, s.best.ids), noFeasibleReason: s.noFeasibleReason ?? null,
      alternativeRanksLowerOn: (s.why ?? []).map(x => ({criterion: x.label, best: round2(x.best), alternative: round2(x.alternative), weightedGap: +x.weighted.toFixed(4)})),
      ruledOutByConstraints: (s.rejectedBest ?? []).map(x => ({options: x.options, because: x.because})),
      bestThatAlsoHoldsInDownside: s.bestRobust ? s.bestRobust.options : null, combinationsExcluded: s.rejectedCounts ?? null}])),
    sensitivity: sensitivity ? sensitivityBrief(sensitivity) : null,
    assumptions: ['Contributions to performance and development are the organisation\'s own estimates on a 0–10 scale, not measured or predicted results.',
      'A missing estimate is treated as unknown, not as zero: it spans 0 to 10, its midpoint is used for the ranking, and a ranking that missing data could change is reported as uncertain.',
      'Risk level and confidence are the organisation\'s own judgement: risk is used only in the dominance comparison; confidence is recorded in the brief and does not change any calculation.',
      'Financial gains are entered only where they can be estimated; "not estimable" is never counted as zero. ' + PRUDENT_CASH,
      'A gain that is not estimable cannot be bounded: when it could change a ranking (the strategy weighs money or cash, or the gain could lift an option over the reserve), the strategy reads "Financial comparison incomplete" and every option concerned is listed.',
      'A documented gain range (with its source) can replace a single figure: the cash uses its low end, and the ranking accounts for both ends.',
      'Cash is forecast monthly by the LANOVA Finance engine: month-end balances, no tax, no financing, no payment delays.',
      'Revenue and operating costs of the organisation are spread evenly over the months. Staff costs, when entered, are payroll: wage changes apply to them.',
      'Scenarios change revenue, operating costs and wages by a percentage from their activation month; amounts paid before that month are not changed (including a signing bonus).',
      'A signing is a Finance engine player decision: transfer and agent fees are capitalised and amortised over the contract, wages and employer charges are payroll, and the signing bonus is paid at signing and expensed over the contract.',
      'Sensitivity thresholds are found by recalculating with the Finance engine (bisection), with a stated tolerance; where no threshold can be identified, the brief says so.'],
    limits: ['No probability is attached to any result. A strategy shows the best combination under the stated preferences, not a forecast of results.',
      'Dependencies, mutually exclusive choices and mandatory decisions are constraints on which options can be combined; the effects of the options are still added, so interactions between them (e.g. a coach who is more effective with a facility) are not modelled.',
      'Contributions are added across options, which assumes they do not overlap.'],
    missingForADecision: [...new Set(r.options.flatMap(o => o.missing.map(x => `${o.name}: ${x}`)))].concat(['Actual budget and cash plan of the organisation (monthly, with payment dates)', 'Evidence for the contribution estimates (past results, comparable organisations, staff assessment)']),
  };
}
export function briefCsv(m, r) {
  const notice = financialNotice(r);
  const head = ['Option', 'Status', 'Immediate cost', 'Running cost in horizon', 'Commitments after horizon', 'Total cost', 'Financial gain in horizon', 'Net financial in horizon', 'Lowest cash (base, prudent)', 'Lowest cash (downside, prudent)', 'Immediate contribution (estimate)', 'Long-term contribution (estimate)', 'Risk', 'Months to effect', 'Reasons / dominated by', 'Financial status'];
  const cell = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(round2(v)) : `"${String(v).replace(/"/g, '""')}"`);
  const rows = r.options.map(o => [o.name, o.status, o.totals.upfront, o.totals.runningInHorizon, o.totals.commitmentsAfterHorizon, o.totals.totalCost, o.totals.gainInHorizon, o.totals.netFinancialInHorizon, o.minCashBase, o.minCashDownside, o.input.shortTermScore, o.input.longTermScore, o.risk, o.horizonMonths, [...o.reasons, ...o.dominatedBy.map(x => `dominated by ${x}`)].join(' | '),
    o.totals.financialStatus === 'complete' ? 'complete' : o.totals.financialStatus === 'range' ? `documented range: ${netFinancialText(o)}` : 'gain not estimable: excluded from cash (prudent)']);
  const strat = Object.entries(r.strategies).map(([k, s]) => [STRATEGIES[k].label, READINGS[s.status], s.status === 'no-feasible' ? 'none' : s.best.options.join(' + ') || 'Do nothing',
    s.financial.optionsWithUnknownGain.map(x => `${x.name} (${x.role})`).join(' | ')]);
  return [[`LANOVA Advantage Lab — ${m.label || 'Untitled'}${m.fictional ? ' (illustrative example, all figures invented)' : ''}. Contributions are your estimates (0–10), not predictions. EUR.`],
    [notice ? `WARNING — ${notice.full}` : `Financial comparison complete. ${PRUDENT_CASH}`], head, ...rows, [],
    ['Strategy', 'Reading', 'Best combination', 'Options with a gain that is not estimable (role)'], ...strat].map(l => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
/** Compact, board-readable summary of a sensitivity analysis (see sensitivity.js). */
export function sensitivityBrief(a) {
  const val = x => (x.determinable === false ? x.reason : x.explanation);
  return {strategy: a.label, recommendation: a.recommendation, method: 'Finance engine recalculations; bisection with stated tolerance',
    additionalRevenueNeeded: a.requiredRevenue.map(x => ({scenario: SCENARIOS[x.scenario], forCombination: x.forRejected ?? a.recommendation, value: x.value, determinable: x.determinable !== false, statement: val(x), because: x.because ?? null})),
    maximumAffordableCost: a.maxAffordableCost.map(x => ({option: x.option, of: x.field, current: x.current, maximum: x.value, binding: x.binding ?? null, statement: val(x)})),
    breakingPoints: a.thresholds.items.map(x => ({assumption: x.label, value: x.value ?? null, statement: val(x)})),
    gainNeededToEnterRecommendation: a.preference.items.map(x => ({option: x.option, gainStatus: x.gainStatus, value: x.value ?? null, statement: val(x)})),
    mostInfluentialAssumptions: a.influence.items.slice(0, 6).map(x => ({assumption: x.label, lowestCashChange: x.effects.map(e => ({change: e.change, base: round2(e.base), downside: round2(e.downside), recommendationChanges: e.recommendationChanges}))})),
    notTested: a.influence.excluded};
}
function sensitivityHtml(x) {
  const h2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])), li = a => `<ul>${a.map(v => `<li>${h2(v)}</li>`).join('')}</ul>`;
  return `<h2>Sensitivity and break-even — ${h2(x.strategy)}</h2><p><small>Recommendation tested: ${h2(x.recommendation.join(', ') || 'do nothing')}. Method: ${h2(x.method)}.</small></p>
<h3>Additional revenue needed</h3>${li(x.additionalRevenueNeeded.map(v => `${v.scenario}${v.because ? ` — for ${v.forCombination.join(' + ')} (ruled out: ${v.because})` : ''}: ${v.statement}`))}
<h3>Maximum affordable cost</h3>${li(x.maximumAffordableCost.map(v => `${v.option} (${v.of}): ${v.statement}`))}
<h3>Breaking points of the recommendation</h3>${li(x.breakingPoints.map(v => `${v.assumption}: ${v.statement}`))}
<h3>Gain at which another option enters the recommendation</h3>${li(x.gainNeededToEnterRecommendation.length ? x.gainNeededToEnterRecommendation.map(v => `${v.option}: ${v.statement}`) : ['Every option is already in the recommendation.'])}
<h3>Most influential assumptions (effect on the lowest month-end cash)</h3>${li(x.mostInfluentialAssumptions.map(v => `${v.assumption}: ${v.lowestCashChange.map(e => `${e.change > 0 ? '+' : ''}${e.change}% → base ${fmt(e.base)}, downside ${fmt(e.downside)}${e.recommendationChanges ? ' (the recommendation changes)' : ''}`).join('; ')}`))}${x.notTested.length ? `<p><small>Not tested: ${h2(x.notTested.join('; '))}.</small></p>` : ''}`;
}
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function briefHtml(m, r, when = new Date().toISOString().slice(0, 10), opts2 = {}) {
  const b = brief(m, r, opts2), why = Object.entries(b.strategies).flatMap(([k, s]) => [
    ...(s.alternativeRanksLowerOn.length ? [`${k}: the alternative (${(s.alternative ?? []).join(', ') || 'do nothing'}) ranks lower on ${s.alternativeRanksLowerOn.map(x => `${x.criterion} (${fmt(x.alternative)} vs ${fmt(x.best)})`).join('; ')}.`] : []),
    ...s.ruledOutByConstraints.map(x => `${k}: ${x.options.join(' + ') || 'do nothing'} would rank higher on the preferences but is ruled out: ${x.because}.`),
    ...(s.bestThatAlsoHoldsInDownside ? [`${k}: the recommendation does not keep the reserve in the downside scenario; the best that does is ${s.bestThatAlsoHoldsInDownside.join(' + ') || 'do nothing'}.`] : []),
    ...(s.noFeasibleReason ? [`${k}: ${s.noFeasibleReason}`] : [])]), li = a => `<ul>${a.map(x => `<li>${h(x)}</li>`).join('')}</ul>`, notice = financialNotice(r);
  const strat = Object.entries(b.strategies).map(([k, s]) => `<tr><td>${h(k)}</td><td>${s.status === 'no-feasible' ? 'None meets the hard constraints' : s.options.length ? h(s.options.join(', ')) : 'Do nothing'}</td><td>${fmt(s.immediateCost)}</td><td>${fmt(s.totalCost)}</td><td>${fmt(s.lowestCash)}</td><td>${fmt(s.lowestCashDownside)}</td><td>${s.status === 'financial-incomplete' ? `<b>${h(READINGS[s.status])}</b>` : h(READINGS[s.status])}${s.estimatesNeededToSettle?.length ? `<br><small>Needed to settle: ${h(s.estimatesNeededToSettle.join('; '))}</small>` : ''}${s.optionsWithUnknownGain.length ? `<br><small>Gain not estimable: ${h(s.optionsWithUnknownGain.map(x => `${x.name} (${x.role})`).join('; '))}</small>` : ''}${s.alternative ? `<br><small>Alternative: ${h(s.alternative.join(', ') || 'Do nothing')}</small>` : ''}</td></tr>`).join('');
  const opts = b.options.map(o => `<tr><td>${h(o.name)}</td><td>${h(o.status)}</td><td>${fmt(o.immediateCost)}</td><td>${fmt(o.totalCost)}</td><td>${h(netFinancialText(r.options.find(x => x.name === o.name)))}</td><td>${fmt(o.lowestCashWithOption)}</td><td>${o.immediateContributionEstimate ?? '—'} / ${o.longTermContributionEstimate ?? '—'}</td><td>${h(o.risk ?? '—')}</td><td>${h([...o.infeasibleBecause, ...o.dominatedBy.map(x => `Dominated by ${x}`), ...o.warnings].join(' '))}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decision brief — ${h(b.generatedFor)}</title>
<style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#141821;max-width:1050px;margin:24px auto;padding:0 16px}h1{margin:0 0 4px;font-size:24px}h2{font-size:17px;margin:22px 0 6px}.note{border:1px solid #c9a227;background:#fff9e6;padding:8px 10px;border-radius:6px}.warn{border:2px solid #b3261e;background:#fdecea;padding:8px 10px;border-radius:6px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13px}th,td{border:1px solid #d6d9e0;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f2f5}small{color:#555}h3{font-size:14.5px;margin:14px 0 4px}@media print{body{margin:0;max-width:none;font-size:11.5px}h2{break-after:avoid}table,tr{break-inside:avoid}.note,.warn{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<p><small>LANOVA Advantage Lab · decision brief · ${h(when)}</small></p><h1>${h(b.generatedFor)}</h1><p>${h(b.sport)} · ${h(b.structure)} · objective: <b>${h(b.objective)}</b> · ${h(b.horizon)}</p>
<p class="note">${b.fictional ? '<b>Illustrative example: every figure is invented.</b> ' : ''}Decision support, not a recommendation to act. Contributions to performance are the organisation's own estimates, not predictions; no probability is given.</p>
${notice ? `<p class="${notice.incomplete ? 'warn' : 'note'}" id="financial-notice"><b>${h(notice.title)}.</b> ${h(notice.text)}</p>` : ''}<p><small>${h(PRUDENT_CASH)}</small></p>
<h2>Financial position</h2><table><tr><th>Cash today</th><th>Annual revenue</th><th>Annual operating costs</th><th>of which staff</th><th>Minimum cash reserve</th><th>Budget for these decisions</th></tr><tr><td>${fmt(b.financialPosition.openingCash)}</td><td>${fmt(b.financialPosition.annualRevenue)}</td><td>${fmt(b.financialPosition.annualOperatingCosts)}</td><td>${b.financialPosition.staffCostsIncluded === null ? 'not split' : fmt(b.financialPosition.staffCostsIncluded)}</td><td>${fmt(b.financialPosition.minimumCashReserve)}</td><td>${fmt(b.financialPosition.budgetForTheseDecisions)}</td></tr></table>
<h2>Hard constraints</h2>${li(b.hardConstraints)}${b.structuralConstraints.length ? `<h2>Structural constraints between options</h2>${li(b.structuralConstraints)}` : ''}<h2>Scenarios studied</h2>${li(b.scenariosStudied)}
<h2>Cash commitments of each recommendation, by scenario</h2><table><tr><th>Strategy</th><th>Scenario</th><th>Lowest month-end cash</th><th>Month</th><th>Headroom over the reserve</th><th>Cash at the end</th><th>Reserve met</th></tr>${Object.entries(b.strategies).filter(([, s]) => s.cashByScenario).map(([k, s]) => Object.entries(s.cashByScenario).map(([sc, v], i) => `<tr>${i ? '' : `<td rowspan="3">${h(k)}</td>`}<td>${h(SCENARIOS[sc])}</td><td>${fmt(v.lowestCash)}</td><td>${h(v.lowestMonth)}</td><td>${fmt(v.headroomOverReserve)}</td><td>${fmt(v.cashAtEnd)}</td><td>${v.reserveMet ? 'yes' : `<b>no</b> (from ${h(v.firstMonthBelowReserve)})`}</td></tr>`).join('')).join('')}</table>
<h2>Why not the alternatives</h2>${li(why.length ? why : ['No alternative to compare.'])}
${b.sensitivity ? sensitivityHtml(b.sensitivity) : '<h2>Sensitivity and break-even</h2><p><small>Not run for this brief. Run the sensitivity analysis in the Advantage Lab before exporting to include it.</small></p>'}
<h2>Best combination under each strategy</h2><table><tr><th>Strategy</th><th>Options</th><th>Immediate cost</th><th>Total cost</th><th>Lowest cash</th><th>Lowest cash, downside</th><th>Reading</th></tr>${strat}</table>
<h2>Options: full costs, constraints and dominance</h2><table><tr><th>Option</th><th>Status</th><th>Immediate cost</th><th>Total cost</th><th>Net financial (horizon)</th><th>Lowest cash with it (prudent)</th><th>Contribution est. (now / long term)</th><th>Risk</th><th>Notes</th></tr>${opts}</table>
<h2>Assumptions</h2>${li(b.assumptions)}<h2>Limits</h2>${li(b.limits)}<h2>Data missing for a definitive decision</h2>${li(b.missingForADecision)}
<p><small>Cash forecast by the LANOVA Finance engine. LANOVA is decision-support software, not financial, investment, legal or tax advice.</small></p></body></html>`;
}
export const fmt = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
