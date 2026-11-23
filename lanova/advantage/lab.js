/**
 * LANOVA Advantage Lab — decision engine (pure functions, no DOM). Schema: lanova-advantage-v0. Formulas: README.md.
 *
 * Every cash figure comes from the LANOVA Finance engine already published at ../finance/engine/ (copied byte for
 * byte from KevinKo77/lake-intelligence, SHA-256 manifest): each option is translated into Finance decisions and the
 * monthly cash is forecast by that engine. This file adds only what the Finance engine does not do: cost totals per
 * option, hard constraints, Pareto dominance, the search over combinations of options and the decision brief.
 *
 * Sporting contributions are the user's own estimates on a 0–10 scale. They are never presented as measured or
 * predicted performance; no probability is computed.
 */
import {forecast, validatePlan, REVENUE, EXPENSE, monthLabel} from '../finance/engine/model.js';

export const SCHEMA = 'lanova-advantage-v0';
export const HORIZONS = [12, 24, 36];
export const MAX_OPTIONS = 10;
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

// ------------------------------------------------------------------ validation
/** Problems in the inputs; empty = computable. Never guesses a missing value. */
export function check(m) {
  const p = [];
  const num = (v, path, lo = 0, hi = 1e10) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) p.push(`${path}: a number between ${lo.toLocaleString('en-GB')} and ${hi.toLocaleString('en-GB')} is required (a missing value is not zero)`); };
  const int = (v, path, lo, hi) => { if (!Number.isInteger(v) || v < lo || v > hi) p.push(`${path}: a whole number between ${lo} and ${hi} is required`); };
  if (!m || typeof m !== 'object') return ['model: object required'];
  if (m.schema !== SCHEMA) p.push(`schema: ${SCHEMA} required`);
  if (!HORIZONS.includes(m.horizonMonths)) p.push('Decision horizon: 12, 24 or 36 months');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.startMonth ?? '')) p.push('First month: YYYY-MM');
  const f = m.finance ?? {};
  num(f.openingCash, 'Cash available today', -1e10); num(f.annualRevenue, 'Annual revenue'); num(f.annualOperatingCosts, 'Annual operating costs');
  num(f.minimumCash, 'Minimum cash reserve'); num(f.decisionBudget, 'Budget available for these decisions'); num(f.downsideRevenuePct, 'Downside: revenue reduction (%)', 0, 90);
  if (!OBJECTIVES[m.objective]) p.push('Objective: immediate, development or financial');
  if (!Array.isArray(m.options)) return [...p, 'options: list required'];
  if (m.options.length > MAX_OPTIONS) p.push(`At most ${MAX_OPTIONS} options`);
  const H = m.horizonMonths, ids = new Set();
  m.options.forEach((o, i) => {
    const q = `Option ${i + 1}${o?.name ? ` (${o.name})` : ''}`;
    if (!o || typeof o !== 'object') return p.push(`${q}: object required`);
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(o.id) || ids.has(o.id)) p.push(`${q}: unique identifier required`); ids.add(o.id);
    if (typeof o.name !== 'string' || !o.name.trim()) p.push(`${q}: name required`);
    num(o.upfront, `${q}: immediate cost`); num(o.monthlyCost, `${q}: running cost per month`);
    if (!['capital', 'expense'].includes(o.upfrontType)) p.push(`${q}: immediate cost type must be capital or expense`);
    if (o.upfrontType === 'capital' && o.upfront > 0) int(o.usefulLifeMonths, `${q}: useful life (months)`, 1, 600);
    int(o.startMonth, `${q}: start month`, 0, (H ?? 12) - 1); int(o.commitmentMonths, `${q}: commitment (months)`, 0, 120);
    int(o.effectMonths, `${q}: time to effect (months)`, 0, 120);
    if (o.monthlyGain !== null) { num(o.monthlyGain, `${q}: financial gain per month`, -1e10); int(o.gainMonths, `${q}: gain duration (months)`, 1, 120); }
    for (const k of ['shortTermScore', 'longTermScore']) if (o[k] !== null) num(o[k], `${q}: ${k === 'shortTermScore' ? 'immediate' : 'long-term'} contribution (0–10)`, 0, 10);
    if (o.risk !== null && !RISK[o.risk]) p.push(`${q}: risk must be low, medium or high`);
  });
  return p;
}

// ------------------------------------------------------------------ Finance engine plan
const prov = (m, kind = 'assumption') => ({kind, source: m.fictional ? 'Illustrative example — invented figure' : 'Entered in the LANOVA Advantage Lab', asOf: m.asOf ?? '2026-11-23'});
const scenario = (id, label, revenueFactor) => ({id, label, revenueFactors: Object.fromEntries(REVENUE.map(c => [c, revenueFactor])), costFactors: Object.fromEntries(EXPENSE.map(c => [c, 1])),
  capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: ''});
/** Finance decisions for one option (at most 3: capital investment, costs, financial gains). */
export function optionDecisions(m, o) {
  const H = m.horizonMonths, s = o.startMonth, out = [], base = {selected: true, startMonth: s, ...prov(m), notes: ''};
  if (o.upfrontType === 'capital' && o.upfront > 0)
    out.push({...base, id: `${o.id}-capital`, label: `${o.name} — investment`, type: 'investment', amount: o.upfront, usefulLifeMonths: o.usefulLifeMonths, payments: [{month: s, amount: o.upfront}],
      capexCategory: 'other', revenueCategory: 'commercial', monthlyRevenue: 0, monthlyOperatingCost: 0, operationsStartMonth: s});
  const oneOff = o.upfrontType === 'expense' ? o.upfront : 0;
  if (oneOff > 0 || (o.monthlyCost > 0 && o.commitmentMonths > 0))
    out.push({...base, id: `${o.id}-costs`, label: `${o.name} — costs`, type: 'cost_change', monthlyAmount: o.commitmentMonths > 0 ? o.monthlyCost : 0, oneOffCost: oneOff,
      endMonth: Math.min(H - 1, s + Math.max(1, o.commitmentMonths) - 1)});
  const g0 = s + o.effectMonths;
  if (o.monthlyGain !== null && o.monthlyGain !== 0 && g0 < H)
    out.push({...base, id: `${o.id}-gain`, label: `${o.name} — financial gain`, type: 'revenue_change', startMonth: g0, category: 'commercial', mode: 'amount', value: o.monthlyGain, endMonth: Math.min(H - 1, g0 + o.gainMonths - 1)});
  return out;
}
/** The organisation's plan without any option, in the Finance engine's lanova-finance-v1 format. */
export function basePlan(m, decisions = []) {
  const H = m.horizonMonths, f = m.finance, flat = v => Array(H).fill(v);
  return {schema: 'lanova-finance-v1', name: m.label || 'Advantage Lab plan', currency: 'EUR', fictional: Boolean(m.fictional), startMonth: m.startMonth, horizonMonths: H,
    openingCash: f.openingCash, minimumCash: f.minimumCash, policy: {payrollRatioLimit: null, minimumDscr: null}, source: prov(m).source, asOf: prov(m).asOf,
    lines: [{id: 'revenue', label: 'Operating revenue (all sources)', category: 'other_revenue', values: flat(f.annualRevenue / 12), cashLagMonths: 0, ...prov(m)},
      {id: 'costs', label: 'Operating costs (all, including staff)', category: 'operating', values: flat(f.annualOperatingCosts / 12), cashLagMonths: 0, ...prov(m)}],
    capex: [], loans: [], decisions, imports: [],
    scenarios: [scenario('base', 'Base case', 1), scenario('downside', `Downside: revenue −${f.downsideRevenuePct}%`, 1 - f.downsideRevenuePct / 100), scenario('upside', 'Upside (same as base in this lab)', 1)]};
}
const cashOf = (plan, scen, ids) => forecast(plan, {scenario: scen, decisions: ids}).months.map(x => x.closingCash);

// ------------------------------------------------------------------ evaluation
/** Cost and gain totals of one option, computed from its inputs (no engine needed). */
export function optionTotals(m, o) {
  const H = m.horizonMonths, s = o.startMonth;
  const activeMonths = o.commitmentMonths > 0 ? Math.max(0, Math.min(H, s + o.commitmentMonths) - s) : 0;
  const runningInHorizon = o.monthlyCost * activeMonths, after = o.monthlyCost * Math.max(0, o.commitmentMonths - activeMonths);
  const g0 = s + o.effectMonths, gainMonthsIn = o.monthlyGain === null ? 0 : Math.max(0, Math.min(H, g0 + o.gainMonths) - Math.min(H, g0));
  const gainInHorizon = o.monthlyGain === null ? null : o.monthlyGain * gainMonthsIn;
  return {upfront: o.upfront, runningInHorizon, commitmentsAfterHorizon: after, totalCost: o.upfront + runningInHorizon + after,
    gainInHorizon, netFinancialInHorizon: gainInHorizon === null ? null : gainInHorizon - o.upfront - runningInHorizon, gainEstimable: o.monthlyGain !== null};
}
const contribution = (m, o, t) => m.objective === 'immediate' ? o.shortTermScore : m.objective === 'development' ? o.longTermScore : t.netFinancialInHorizon;

/**
 * Full evaluation. Returns {problems} when the inputs cannot be computed; otherwise the baseline, every option with
 * its totals, engine cash, hard-constraint status, dominance, and the best combination under each strategy.
 */
export function evaluate(m, {weights} = {}) {
  const problems = check(m);
  if (problems.length) return {problems};
  const H = m.horizonMonths, f = m.finance, months = Array.from({length: H}, (_, t) => monthLabel(m.startMonth, t));
  const empty = basePlan(m); const engineProblems = validatePlan(empty); if (engineProblems.length) return {problems: engineProblems.map(x => `Finance engine: ${x}`)};
  const base = {base: cashOf(empty, 'base', []), downside: cashOf(empty, 'downside', [])};
  const options = m.options.map(o => {
    const decisions = optionDecisions(m, o), plan = basePlan(m, decisions), ep = validatePlan(plan);
    if (ep.length) return {id: o.id, name: o.name, invalid: ep};
    const ids = decisions.map(d => d.id), cash = {base: cashOf(plan, 'base', ids), downside: cashOf(plan, 'downside', ids)};
    const delta = {base: cash.base.map((v, t) => v - base.base[t]), downside: cash.downside.map((v, t) => v - base.downside[t])};
    const t = optionTotals(m, o), minBase = Math.min(...cash.base), minDown = Math.min(...cash.downside);
    const reasons = [];
    if (o.upfront > f.decisionBudget + 0.005) reasons.push(`Immediate cost ${fmt(o.upfront)} exceeds the budget available for these decisions (${fmt(f.decisionBudget)}).`);
    const breach = cash.base.findIndex(v => v < f.minimumCash - 0.005);
    if (breach >= 0) reasons.push(`Month-end cash falls below the minimum reserve (${fmt(f.minimumCash)}) in ${months[breach]}: ${fmt(cash.base[breach])}.`);
    const warnings = [];
    if (t.commitmentsAfterHorizon > 0) warnings.push(`${fmt(t.commitmentsAfterHorizon)} of running costs fall after the ${H}-month horizon.`);
    if (minDown < f.minimumCash - 0.005) warnings.push(`In the downside case (revenue −${f.downsideRevenuePct}%), cash falls to ${fmt(minDown)}, below the reserve.`);
    if (o.effectMonths >= H - o.startMonth) warnings.push('Its expected effect starts after the decision horizon.');
    const missing = [];
    if (o.shortTermScore === null) missing.push('immediate contribution'); if (o.longTermScore === null) missing.push('long-term contribution');
    if (o.monthlyGain === null) missing.push('financial gain (not estimable)'); if (o.risk === null) missing.push('risk level');
    return {id: o.id, name: o.name, category: o.category ?? '', input: o, totals: t, cash, delta, minCashBase: minBase, minCashDownside: minDown,
      cashImpactLowest: minBase - Math.min(...base.base), closingCashDelta: delta.base[H - 1], feasible: reasons.length === 0, reasons, warnings, missing,
      horizonMonths: o.startMonth + o.effectMonths, contribution: contribution(m, o, t), risk: o.risk, confidence: o.confidence ?? null};
  });
  const invalid = options.filter(o => o.invalid);
  if (invalid.length) return {problems: invalid.flatMap(o => o.invalid.map(x => `${o.name}: ${x}`))};
  markDominance(options);
  const strategies = Object.fromEntries(Object.keys(STRATEGIES).map(k => [k, bestCombination(m, base, options, weights?.[k] ?? STRATEGIES[k].weights)]));
  return {problems: [], months, horizon: H, base, baseMinCash: Math.min(...base.base), baseMinCashDownside: Math.min(...base.downside), options, strategies, objective: m.objective};
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
    const dims = [[b.totals.totalCost, a.totals.totalCost, -1], [b.contribution, a.contribution, 1], [RISK[b.risk], RISK[a.risk], -1], [b.minCashBase, a.minCashBase, 1]];
    const noWorse = dims.every(([x, y, s]) => s * (x - y) >= -1e-9), better = dims.some(([x, y, s]) => s * (x - y) > 1e-9);
    if (noWorse && better) a.dominatedBy.push(b.name);
  }
  for (const o of options) o.status = !o.feasible ? 'infeasible' : !o.comparable ? 'not-comparable' : o.dominatedBy.length ? 'dominated' : 'frontier';
  return options;
}

/**
 * Best combination of feasible options for one strategy. Hard constraints first: total immediate cost within the
 * budget, and base-case month-end cash at or above the reserve in every month (cash of a combination = baseline +
 * sum of each option's engine cash change; the engine is linear here, checked by the tests). Then the preference
 * score: weighted sum of criteria, each scaled between the worst and the best feasible combination (0 to 1).
 * "Do nothing" is always a candidate. Missing estimates count as 0 and are reported.
 */
export function bestCombination(m, base, options, weights) {
  const f = m.finance, pool = options.filter(o => o.feasible), H = m.horizonMonths, n = pool.length, combos = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = pool.filter((_, i) => mask & (1 << i));
    const upfront = sum(set.map(o => o.totals.upfront));
    const cashBase = base.base.map((v, t) => v + sum(set.map(o => o.delta.base[t]))), cashDown = base.downside.map((v, t) => v + sum(set.map(o => o.delta.downside[t])));
    const minBase = Math.min(...cashBase), feasible = upfront <= f.decisionBudget + 0.005 && minBase >= f.minimumCash - 0.005;
    if (!feasible) continue;
    combos.push({options: set.map(o => o.name), ids: set.map(o => o.id), upfront, totalCost: sum(set.map(o => o.totals.totalCost)), minCashBase: minBase, minCashDownside: Math.min(...cashDown),
      closingCash: cashBase[H - 1], cashBase,
      // Each criterion as an interval [low, high]. A missing 0–10 estimate is unknown, not zero: it spans 0 to 10 and its
      // midpoint (5) is used for the ranking, so an undocumented option is neither rewarded nor penalised. A gain that is
      // not estimable cannot be bounded: only its costs are counted, and the option is flagged.
      crit: interval(set, cashDown),
      unknown: {short: set.filter(o => o.input.shortTermScore === null).map(o => o.name), long: set.filter(o => o.input.longTermScore === null).map(o => o.name), money: set.filter(o => o.input.monthlyGain === null).map(o => o.name)},
      missing: [...new Set(set.flatMap(o => o.missing.map(x => `${o.name}: ${x}`)))], highRisk: set.filter(o => o.risk === 'high').map(o => o.name)});
  }
  const w = normaliseWeights(weights), keys = Object.keys(w);
  if (!combos.length) {
    // Even "do nothing" breaks a hard constraint: the organisation's own plan already falls below the reserve.
    const best = {options: [], ids: [], upfront: 0, totalCost: 0, minCashBase: Math.min(...base.base), minCashDownside: Math.min(...base.downside), closingCash: base.base[H - 1], cashBase: base.base,
      crit: {short: [0, 0], long: [0, 0], money: [0, 0], security: [Math.min(...base.downside), Math.min(...base.downside)]}, unknown: {short: [], long: [], money: []}, parts: {}, score: 0, scoreLow: 0, scoreHigh: 0, missing: [], highRisk: []};
    return {weights: w, candidates: 0, best, runnerUp: null, status: 'no-feasible', missingUsed: [], contenders: [], assumptionsNeeded: [], unboundedGains: []};
  }
  // Scale every criterion between the lowest low and the highest high over all candidates, then score each candidate
  // three times: at the low ends, at the midpoints (the ranking) and at the high ends (the range missing data allows).
  const lo = Object.fromEntries(keys.map(k => [k, Math.min(...combos.map(c => c.crit[k][0]))])), hi = Object.fromEntries(keys.map(k => [k, Math.max(...combos.map(c => c.crit[k][1]))]));
  const scale = (k, v) => (hi[k] - lo[k] > 1e-9 ? (v - lo[k]) / (hi[k] - lo[k]) : 0);
  for (const c of combos) {
    c.parts = Object.fromEntries(keys.map(k => [k, scale(k, (c.crit[k][0] + c.crit[k][1]) / 2)]));
    c.score = sum(keys.map(k => w[k] * c.parts[k])); c.scoreLow = sum(keys.map(k => w[k] * scale(k, c.crit[k][0]))); c.scoreHigh = sum(keys.map(k => w[k] * scale(k, c.crit[k][1])));
  }
  combos.sort((a, b) => b.score - a.score || a.totalCost - b.totalCost || a.options.length - b.options.length);
  const best = combos[0], runnerUp = combos.find(c => c !== best) ?? null;
  // Missing data that a weighted criterion uses, for a candidate.
  const used = c => [...(w.short > 0 ? c.unknown.short.map(n => `${n}: immediate contribution`) : []), ...(w.long > 0 ? c.unknown.long.map(n => `${n}: long-term contribution`) : [])];
  // Contenders: candidates whose range reaches above the best's once the missing 0–10 estimates are known. Only
  // missing data can make this happen; with complete estimates the ranges are points and there is no contender.
  const contenders = combos.filter(c => c !== best && (used(c).length || used(best).length) && c.scoreHigh > best.scoreLow + 1e-9);
  const missingUsed = used(best), assumptionsNeeded = [...new Set([...missingUsed, ...contenders.slice(0, 3).flatMap(used)])];
  // Financial gains that are not estimable cannot be bounded: they are excluded (costs only) and listed, not guessed.
  const unboundedGains = w.money > 0 ? [...new Set([best, ...contenders].flatMap(c => c.unknown.money))] : [];
  const close = runnerUp && best.score - runnerUp.score < 0.05;
  const status = contenders.length ? 'uncertain' : close ? 'close-call' : 'indicative';
  return {weights: w, candidates: combos.length, best, runnerUp, status, missingUsed, contenders: contenders.slice(0, 3).map(c => ({options: c.options, score: c.score, scoreHigh: c.scoreHigh})), assumptionsNeeded, unboundedGains};
}
function interval(set, cashDown) {
  const est = k => [sum(set.map(o => o.input[k] ?? 0)), sum(set.map(o => o.input[k] ?? 10))];
  const money = sum(set.map(o => o.totals.netFinancialInHorizon ?? -(o.totals.upfront + o.totals.runningInHorizon))), sec = Math.min(...cashDown);
  return {short: est('shortTermScore'), long: est('longTermScore'), money: [money, money], security: [sec, sec]};
}
export function normaliseWeights(w) {
  const k = Object.keys(CRITERIA), v = k.map(x => Math.max(0, Number(w?.[x]) || 0)), s = sum(v);
  return Object.fromEntries(k.map((x, i) => [x, s > 0 ? v[i] / s : 1 / k.length]));
}

// ------------------------------------------------------------------ brief and exports
export function brief(m, r) {
  const f = m.finance;
  return {
    schema: 'lanova-advantage-brief-v0', generatedFor: m.label || 'Untitled', fictional: Boolean(m.fictional), sport: m.sport, structure: m.structure,
    objective: OBJECTIVES[m.objective].label, horizon: `${m.horizonMonths} months from ${m.startMonth}`,
    hardConstraints: [`Immediate cost of the selected options within the budget available: ${fmt(f.decisionBudget)}`, `Month-end cash at or above the minimum reserve in every month (base case): ${fmt(f.minimumCash)}`],
    preferences: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [STRATEGIES[k].label, s.weights])),
    scenariosStudied: ['Base case: revenue and costs as entered', `Downside: revenue −${f.downsideRevenuePct}% in every month (option gains included)`],
    baseline: {lowestCash: round2(r.baseMinCash), lowestCashDownside: round2(r.baseMinCashDownside), cashAtEnd: round2(r.base.base.at(-1))},
    options: r.options.map(o => ({name: o.name, status: o.status, immediateCost: o.totals.upfront, runningCostInHorizon: o.totals.runningInHorizon, commitmentsAfterHorizon: o.totals.commitmentsAfterHorizon,
      totalCost: o.totals.totalCost, financialGainInHorizon: o.totals.gainInHorizon, netFinancialInHorizon: o.totals.netFinancialInHorizon, lowestCashWithOption: round2(o.minCashBase), lowestCashDownside: round2(o.minCashDownside),
      immediateContributionEstimate: o.input.shortTermScore, longTermContributionEstimate: o.input.longTermScore, risk: o.risk, confidence: o.confidence, monthsToEffect: o.horizonMonths,
      infeasibleBecause: o.reasons, dominatedBy: o.dominatedBy, warnings: o.warnings, missingData: o.missing})),
    strategies: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [STRATEGIES[k].label, {status: s.status, options: s.best.options, immediateCost: s.best.upfront, totalCost: s.best.totalCost,
      lowestCash: round2(s.best.minCashBase), lowestCashDownside: round2(s.best.minCashDownside), alternative: s.runnerUp ? s.runnerUp.options : null, missingDataUsed: s.missingUsed,
      couldRankHigherOnceKnown: s.contenders.map(c => c.options), estimatesNeededToSettle: s.assumptionsNeeded, gainsNotEstimableExcluded: s.unboundedGains}])),
    assumptions: ['Contributions to performance and development are the organisation\'s own estimates on a 0–10 scale, not measured or predicted results.',
      'A missing estimate is treated as unknown, not as zero: it spans 0 to 10, its midpoint is used for the ranking, and a ranking that missing data could change is reported as uncertain.',
      'Risk level and confidence are the organisation\'s own judgement: risk is used only in the dominance comparison; confidence is recorded in the brief and does not change any calculation.',
      'Financial gains are entered only where they can be estimated; "not estimable" is never counted as zero in the option totals.',
      'Cash is forecast monthly by the LANOVA Finance engine: month-end balances, no tax, no financing, no payment delays.',
      'Revenue and operating costs of the organisation are spread evenly over the months.'],
    limits: ['No probability is attached to any result. A strategy shows the best combination under the stated preferences, not a forecast of results.',
      'Options are assumed independent: effects that depend on each other (e.g. a coach and a facility) are not modelled.',
      'Contributions are added across options, which assumes they do not overlap.'],
    missingForADecision: [...new Set(r.options.flatMap(o => o.missing.map(x => `${o.name}: ${x}`)))].concat(['Actual budget and cash plan of the organisation (monthly, with payment dates)', 'Evidence for the contribution estimates (past results, comparable organisations, staff assessment)']),
  };
}
export function briefCsv(m, r) {
  const head = ['Option', 'Status', 'Immediate cost', 'Running cost in horizon', 'Commitments after horizon', 'Total cost', 'Financial gain in horizon', 'Net financial in horizon', 'Lowest cash (base)', 'Lowest cash (downside)', 'Immediate contribution (estimate)', 'Long-term contribution (estimate)', 'Risk', 'Months to effect', 'Reasons / dominated by'];
  const cell = v => (v === null || v === undefined ? '' : typeof v === 'number' ? String(round2(v)) : `"${String(v).replace(/"/g, '""')}"`);
  const rows = r.options.map(o => [o.name, o.status, o.totals.upfront, o.totals.runningInHorizon, o.totals.commitmentsAfterHorizon, o.totals.totalCost, o.totals.gainInHorizon, o.totals.netFinancialInHorizon, o.minCashBase, o.minCashDownside, o.input.shortTermScore, o.input.longTermScore, o.risk, o.horizonMonths, [...o.reasons, ...o.dominatedBy.map(x => `dominated by ${x}`)].join(' | ')]);
  return [[`LANOVA Advantage Lab — ${m.label || 'Untitled'}${m.fictional ? ' (illustrative example, all figures invented)' : ''}. Contributions are your estimates (0–10), not predictions. EUR.`], head, ...rows].map(l => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function briefHtml(m, r, when = new Date().toISOString().slice(0, 10)) {
  const b = brief(m, r), li = a => `<ul>${a.map(x => `<li>${h(x)}</li>`).join('')}</ul>`;
  const strat = Object.entries(b.strategies).map(([k, s]) => `<tr><td>${h(k)}</td><td>${s.status === 'no-feasible' ? 'None meets the hard constraints' : s.options.length ? h(s.options.join(', ')) : 'Do nothing'}</td><td>${fmt(s.immediateCost)}</td><td>${fmt(s.totalCost)}</td><td>${fmt(s.lowestCash)}</td><td>${fmt(s.lowestCashDownside)}</td><td>${h({indicative: 'Indicative', 'close-call': 'Close call — examine the alternative', uncertain: 'Uncertain — depends on missing estimates', 'no-feasible': 'Even without any option, cash falls below the reserve'}[s.status])}${s.estimatesNeededToSettle?.length ? `<br><small>Needed to settle: ${h(s.estimatesNeededToSettle.join('; '))}</small>` : ''}${''}${s.alternative ? `<br><small>Alternative: ${h(s.alternative.join(', ') || 'Do nothing')}</small>` : ''}</td></tr>`).join('');
  const opts = b.options.map(o => `<tr><td>${h(o.name)}</td><td>${h(o.status)}</td><td>${fmt(o.immediateCost)}</td><td>${fmt(o.totalCost)}</td><td>${o.netFinancialInHorizon === null ? 'not estimable' : fmt(o.netFinancialInHorizon)}</td><td>${fmt(o.lowestCashWithOption)}</td><td>${o.immediateContributionEstimate ?? '—'} / ${o.longTermContributionEstimate ?? '—'}</td><td>${h(o.risk ?? '—')}</td><td>${h([...o.infeasibleBecause, ...o.dominatedBy.map(x => `Dominated by ${x}`), ...o.warnings].join(' '))}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decision brief — ${h(b.generatedFor)}</title>
<style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#141821;max-width:1050px;margin:24px auto;padding:0 16px}h1{margin:0 0 4px;font-size:24px}h2{font-size:17px;margin:22px 0 6px}.note{border:1px solid #c9a227;background:#fff9e6;padding:8px 10px;border-radius:6px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13px}th,td{border:1px solid #d6d9e0;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f2f5}small{color:#555}</style></head><body>
<p><small>LANOVA Advantage Lab · decision brief · ${h(when)}</small></p><h1>${h(b.generatedFor)}</h1><p>${h(b.sport)} · ${h(b.structure)} · objective: <b>${h(b.objective)}</b> · ${h(b.horizon)}</p>
<p class="note">${b.fictional ? '<b>Illustrative example: every figure is invented.</b> ' : ''}Decision support, not a recommendation to act. Contributions to performance are the organisation's own estimates, not predictions; no probability is given.</p>
<h2>Hard constraints</h2>${li(b.hardConstraints)}<h2>Scenarios studied</h2>${li(b.scenariosStudied)}
<h2>Best combination under each strategy</h2><table><tr><th>Strategy</th><th>Options</th><th>Immediate cost</th><th>Total cost</th><th>Lowest cash</th><th>Lowest cash, downside</th><th>Reading</th></tr>${strat}</table>
<h2>Options: full costs, constraints and dominance</h2><table><tr><th>Option</th><th>Status</th><th>Immediate cost</th><th>Total cost</th><th>Net financial (horizon)</th><th>Lowest cash with it</th><th>Contribution est. (now / long term)</th><th>Risk</th><th>Notes</th></tr>${opts}</table>
<h2>Assumptions</h2>${li(b.assumptions)}<h2>Limits</h2>${li(b.limits)}<h2>Data missing for a definitive decision</h2>${li(b.missingForADecision)}
<p><small>Cash forecast by the LANOVA Finance engine. LANOVA is decision-support software, not financial, investment, legal or tax advice.</small></p></body></html>`;
}
export const fmt = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
