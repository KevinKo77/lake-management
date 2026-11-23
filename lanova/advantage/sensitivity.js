/**
 * LANOVA Advantage Lab — sensitivity and break-even analysis (pure functions, no DOM).
 *
 * Every figure here is found by recalculating with the LANOVA Finance engine (through lab.js): a search changes one
 * input, reruns the engine, and checks the hard constraints again. Nothing is extrapolated from a formula of our own.
 * Searches are bisections on a bracket where the tested quantity is shown to be monotonic (checked on sample points);
 * each result states its bracket, its tolerance, the number of engine recalculations and a verification at the
 * threshold. When a threshold cannot be identified (no change of state within the tested bounds, a non-monotonic
 * response, or a constraint that the input cannot affect), the result says so instead of inventing a number.
 *
 * An unknown financial gain is never treated as zero: it is excluded from the cash (prudent), and, where useful, its
 * break-even value is searched as an explicit figure ("the gain would have to be at least …").
 */
import {evaluate, check, prepare, engineCombination, optionTotals, gainStatus, LEVERS, SCENARIOS, STRATEGIES, fmt} from './lab.js';

export const NOT_DETERMINABLE = 'Not determinable from the available assumptions';
const TOL = 0.005, sum = a => a.reduce((x, y) => x + y, 0);

/** Lowest headroom over the reserve across the scenarios that are hard constraints (base, and downside if required). */
function headroom(m, run, scenarios) { return Math.min(...scenarios.map(s => Math.min(...run.cash[s]) - m.finance.minimumCash)); }
const required = m => (m.constraints.downsideMustHold ? ['base', 'downside'] : ['base']);
/** Bisection for the boundary of a monotonic predicate ok(x) on [lo, hi] (ok(lo) !== ok(hi)). */
function bisect(f, lo, hi, tol, maxIter = 60) {
  let a = lo, b = hi, fa = f(a), it = 0;
  while (Math.abs(b - a) > tol && it < maxIter) { const c = (a + b) / 2, fc = f(c); if (fc === fa) a = c; else b = c; it++; }
  return {a, b, iterations: it};
}
/** Checks that g is monotonic (non-decreasing if dir > 0, non-increasing if dir < 0) on sample points of [lo, hi]. */
function monotonic(g, lo, hi, dir, n = 6) {
  const xs = Array.from({length: n + 1}, (_, i) => lo + (hi - lo) * i / n), ys = xs.map(g);
  return ys.every((y, i) => i === 0 || dir * (y - ys[i - 1]) >= -0.01);
}
const withOption = (m, id, patch) => ({...m, options: m.options.map(o => (o.id === id ? {...o, ...patch} : o))});
/**
 * Budget assumptions, changed by a percentage in the organisation's own budget (so the change carries into every
 * scenario): budgeted revenue, budgeted operating costs other than staff, budgeted staff costs.
 */
export const BUDGET_LEVERS = Object.freeze({
  revenuePct: {label: 'Budgeted revenue', lo: -90, hi: 200},
  operatingPct: {label: 'Budgeted operating costs, excluding staff', lo: -90, hi: 300},
  wagePct: {label: 'Budgeted staff costs', lo: -90, hi: 300},
});
export function budgetChange(m, lever, pct) {
  const f = m.finance, staff = f.staffCosts ?? 0, k = 1 + pct / 100;
  const finance = lever === 'revenuePct' ? {...f, annualRevenue: f.annualRevenue * k}
    : lever === 'operatingPct' ? {...f, annualOperatingCosts: staff + (f.annualOperatingCosts - staff) * k}
    : {...f, staffCosts: staff * k, annualOperatingCosts: f.annualOperatingCosts - staff + staff * k};
  return {...m, finance};
}
const levers = m => Object.entries(BUDGET_LEVERS).filter(([k]) => k !== 'wagePct' || m.finance.staffCosts > 0);
const counter = () => { let n = 0; return {tick: () => n++, get: () => n}; };

/**
 * Additional revenue needed, per month from the first month to the end of the horizon, for a combination to keep
 * month-end cash at or above the reserve in a scenario. The revenue is added to the budget before the scenario's own
 * revenue change (so a downside −10% also reduces it from its activation month). Found by bisection on Finance engine
 * runs; cash is non-decreasing in this revenue (checked).
 */
export function requiredRevenue(m0, ids, scenario = 'base', {tolerance = 1} = {}) {
  const m = prepare(m0), runs = counter(), H = m.horizonMonths;
  const extra = x => [{id: 'sens-revenue', label: 'Sensitivity: additional revenue', type: 'revenue_change', selected: true, startMonth: 0, endMonth: H - 1, category: 'other_revenue', mode: 'amount', value: x,
    kind: 'assumption', source: 'Sensitivity analysis', asOf: m.asOf ?? '2026-11-24', notes: ''}];
  const g = x => { runs.tick(); const r = engineCombination(m, ids, null, x === 0 ? [] : extra(x)); if (r.problems) throw new Error(r.problems.join('; ')); return Math.min(...r.cash[scenario]) - m.finance.minimumCash; };
  const base = engineCombination(m, ids);
  const out = {scenario, ids, unit: 'EUR per month, every month of the horizon (budgeted, before the scenario\'s revenue change)', method: 'bisection on Finance engine recalculations', tolerance};
  if (base.upfront > m.finance.decisionBudget + TOL) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: the immediate cost (${fmt(base.upfront)}) exceeds the budget (${fmt(m.finance.decisionBudget)}); revenue does not change that constraint.`, engineRuns: runs.get()};
  const g0 = g(0);
  if (g0 >= -TOL) return {...out, value: 0, determinable: true, met: true, headroom: g0, explanation: `Already met: lowest month-end cash is ${fmt(g0)} above the reserve.`, engineRuns: runs.get()};
  let hi = Math.max(1000, -g0 / H);
  while (g(hi) < -TOL) { hi *= 2; if (hi > 1e9) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: not reached with up to ${fmt(1e9)} a month of additional revenue.`, engineRuns: runs.get()}; }
  if (!monotonic(g, 0, hi, 1)) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: cash does not increase steadily with revenue in this plan.`, engineRuns: runs.get()};
  const b = bisect(x => g(x) >= -TOL, 0, hi, tolerance);
  const value = Math.ceil(b.b * 100) / 100;
  return {...out, value, determinable: true, met: false, bracket: [b.a, b.b], iterations: b.iterations, engineRuns: runs.get(),
    verification: {belowThreshold: g(Math.max(0, value - tolerance)), atThreshold: g(value)},
    explanation: `${fmt(value)} a month more revenue, from the first month, is the least that keeps month-end cash at or above the reserve (${fmt(m.finance.minimumCash)}) in the ${SCENARIOS[scenario].toLowerCase()} scenario (±${fmt(tolerance)}).`};
}

/**
 * Largest immediate cost of one option (a project's immediate cost, or a signing's transfer fee) at which the
 * combination still meets every hard constraint: the budget, and the reserve in the base case (and the downside
 * if required). The payment schedule keeps its shape. Cash is non-increasing in this cost (checked).
 */
export function maxAffordableCost(m0, ids, optionId, {tolerance = 100} = {}) {
  const m = prepare(m0), runs = counter(), o = m.options.find(x => x.id === optionId), sc = required(m);
  const field = o.kind === 'signing' ? 'transferFee' : 'upfront', current = o[field], fixed = o.kind === 'signing' ? o.agentFee + o.signingBonus : 0;
  const others = sum(m.options.filter(x => ids.includes(x.id) && x.id !== optionId).map(x => (x.kind === 'signing' ? x.transferFee + x.agentFee + x.signingBonus : x.upfront)));
  const budgetMax = m.finance.decisionBudget - others - fixed;
  const g = x0 => { const x = Math.round(x0 * 100) / 100; runs.tick(); const r = engineCombination(withOption(m, optionId, {[field]: x, ...(o.kind !== 'signing' && x > 0 && o.upfrontType === 'capital' && !o.usefulLifeMonths ? {usefulLifeMonths: 60} : {})}), ids); if (r.problems) throw new Error(r.problems.join('; ')); return headroom(m, r, sc); };
  const out = {optionId, option: o.name, field: o.kind === 'signing' ? 'transfer fee' : 'immediate cost', current, ids, tolerance, method: 'bisection on Finance engine recalculations'};
  if (budgetMax < 0) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: the other options already use more than the budget.`};
  if (g(0) < -TOL) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: even at zero ${out.field}, the combination breaks the cash reserve.`, engineRuns: runs.get()};
  if (g(budgetMax) >= -TOL) return {...out, value: budgetMax, determinable: true, binding: 'budget', margin: budgetMax - current, engineRuns: runs.get(),
    explanation: `Up to ${fmt(budgetMax)}: the budget binds first (the cash reserve still holds at that cost).`};
  if (!monotonic(g, 0, budgetMax, -1)) return {...out, value: null, determinable: false, reason: `${NOT_DETERMINABLE}: cash does not fall steadily as the cost rises.`, engineRuns: runs.get()};
  const b = bisect(x => g(x) >= -TOL, 0, budgetMax, tolerance), value = Math.floor(b.a);
  return {...out, value, determinable: true, binding: sc.length > 1 ? 'reserve (base or downside)' : 'cash reserve', margin: value - current, bracket: [b.a, b.b], iterations: b.iterations, engineRuns: runs.get(),
    verification: {atThreshold: g(value), aboveThreshold: g(value + tolerance)},
    explanation: `Up to ${fmt(value)} (±${fmt(tolerance)}): above that, month-end cash falls below the reserve. Current: ${fmt(current)}.`};
}

/**
 * For each assumption, the change at which the combination stops meeting the hard constraints (or, if it already
 * fails, starts meeting them). Budget assumptions (revenue, operating costs, staff costs) are changed in the
 * organisation's budget, so the change carries into every scenario; option assumptions are the option's own running
 * cost (or a signing's wage) and its known financial gain.
 */
export function assumptionThresholds(m0, ids, {tolerance = 0.05} = {}) {
  const m = prepare(m0), runs = counter(), sc = required(m), out = [];
  for (const [k, d] of levers(m)) {
    const g = x => { runs.tick(); const r = engineCombination(budgetChange(m, k, x), ids); if (r.problems) throw new Error(r.problems.join('; ')); return headroom(m, r, sc); };
    // Revenue helps cash (search downwards for a fall); costs hurt it (search upwards for a rise).
    const dir = k === 'revenuePct' ? -1 : 1, edge = dir < 0 ? d.lo : d.hi;
    out.push(threshold({lever: k, label: `${d.label} (change, %)`, unit: '%', current: 0, g, edge, dir, tolerance, kind: 'budget'}));
  }
  for (const o of m.options.filter(x => ids.includes(x.id))) {
    const field = o.kind === 'signing' ? 'monthlyWage' : 'monthlyCost', cur = o[field];
    if (cur > 0 && (o.kind === 'signing' || o.commitmentMonths > 0)) {
      const g = x => { runs.tick(); const r = engineCombination(withOption(m, o.id, {[field]: cur * (1 + x / 100)}), ids); if (r.problems) throw new Error(r.problems.join('; ')); return headroom(m, r, sc); };
      out.push(threshold({lever: `${o.id}:${field}`, label: `${o.name}: ${o.kind === 'signing' ? 'gross wage' : 'running cost'} per month (change, %)`, unit: '%', current: 0, g, edge: 500, dir: 1, tolerance, kind: 'option', base: cur}));
    }
    const st = gainStatus(o);
    if (st === 'known' && o.monthlyGain > 0) {
      const g = x => { runs.tick(); const r = engineCombination(withOption(m, o.id, {monthlyGain: o.monthlyGain * (1 + x / 100)}), ids); if (r.problems) throw new Error(r.problems.join('; ')); return headroom(m, r, sc); };
      out.push(threshold({lever: `${o.id}:monthlyGain`, label: `${o.name}: financial gain per month (change, %)`, unit: '%', current: 0, g, edge: -100, dir: -1, tolerance, kind: 'option', base: o.monthlyGain}));
    } else if (st === 'unknown') out.push({lever: `${o.id}:monthlyGain`, label: `${o.name}: financial gain`, kind: 'option', determinable: false, reason: 'Gain not estimable: it is left out of the cash (never counted as zero), so no threshold is computed on it.'});
  }
  return {ids, items: out, engineRuns: runs.get(), method: 'bisection on Finance engine recalculations', scenarios: sc};
}
function threshold({lever, label, unit, current, g, edge, dir, tolerance, kind, base}) {
  const out = {lever, label, unit, kind, current, base, tolerance};
  const g0 = g(current), ok0 = g0 >= -TOL, gE = g(edge), okE = gE >= -TOL;
  if (ok0 === okE) return {...out, determinable: true, reached: false, explanation: ok0 ? `Constraints still met at the end of the tested range (${edge > 0 ? '+' : ''}${edge}${unit}): no threshold within it.` : `Constraints not met anywhere in the tested range (to ${edge > 0 ? '+' : ''}${edge}${unit}).`};
  if (!monotonic(g, Math.min(current, edge), Math.max(current, edge), dir > 0 ? -1 : 1)) return {...out, determinable: false, reason: `${NOT_DETERMINABLE}: the cash response is not monotonic over the tested range.`};
  const b = bisect(x => g(x) >= -TOL, current, edge, tolerance), value = ok0 ? b.a : b.b;
  return {...out, determinable: true, reached: true, value, bracket: [b.a, b.b], iterations: b.iterations,
    explanation: ok0 ? `The constraints stop being met at ${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}${base !== undefined ? ` (${fmt(base * (1 + value / 100))} a month)` : ''}.` : `The constraints start being met at ${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}.`};
}

/**
 * For each option outside the recommended combination, the monthly financial gain at which it would enter the best
 * combination of the strategy (full re-evaluation with the engine for each tested value). For an option whose gain is
 * unknown, this is the break-even figure the organisation would need to evidence; it is not an estimate.
 */
export function preferenceThresholds(m0, strategy, {weights, points = 6, maxIter = 14} = {}) {
  const m = prepare(m0), H = m.horizonMonths, r0 = evaluate(m, {weights, only: strategy}), s0 = r0.strategies[strategy], items = [];
  let evaluations = 1;
  if (s0.status === 'no-feasible') return {strategy, items, evaluations, note: 'No feasible combination: there is no recommendation to compare against.'};
  const inBest = (patch, id) => { evaluations++; const r = evaluate(withOption(m, id, patch), {weights, only: strategy}); return !r.problems.length && r.strategies[strategy].best.ids.includes(id); };
  for (const o of r0.options.filter(x => !s0.best.ids.includes(x.id))) {
    const input = m.options.find(x => x.id === o.id), st = gainStatus(input), start = input.startMonth + input.effectMonths;
    const gainMonths = input.gainMonths ?? H - start, monthsIn = Math.max(0, Math.min(H, start + gainMonths) - start);
    const item = {optionId: o.id, option: o.name, gainStatus: st, currentGain: st === 'known' ? input.monthlyGain : st === 'range' ? input.gainRange.low : null};
    if (!o.budgetOk) { items.push({...item, determinable: false, reason: `${NOT_DETERMINABLE}: its immediate cost is above the budget; a gain does not change that.`}); continue; }
    if (!monthsIn) { items.push({...item, determinable: false, reason: `${NOT_DETERMINABLE}: its effect starts after the horizon.`}); continue; }
    const from = item.currentGain ?? 0, span = Math.max(5000, 3 * o.totals.totalCost / monthsIn), to = from + span;
    const patch = x => ({monthlyGain: x, gainRange: null, gainMonths});
    const grid = Array.from({length: points + 1}, (_, i) => from + span * i / points), member = grid.map(x => inBest(patch(x), o.id));
    const firstIn = member.indexOf(true);
    if (firstIn < 0) { items.push({...item, determinable: true, reached: false, testedUpTo: to, explanation: `Not in the best combination even with a gain of ${fmt(to)} a month (tested range).`}); continue; }
    if (member.slice(firstIn).some(x => !x)) { items.push({...item, determinable: false, reason: `${NOT_DETERMINABLE}: the ranking does not change steadily with this gain (it enters and leaves within the tested range).`}); continue; }
    if (firstIn === 0) { items.push({...item, determinable: true, reached: true, value: from, explanation: 'Enters the best combination at its current figure once its gain is counted as a single figure.'}); continue; }
    const tol = Math.max(10, span / 1000), b = bisect(x => inBest(patch(x), o.id), grid[firstIn - 1], grid[firstIn], tol, maxIter);
    items.push({...item, determinable: true, reached: true, value: Math.ceil(b.b), bracket: [b.a, b.b], tolerance: tol,
      explanation: `${st === 'unknown' ? 'Its gain, not estimable today, would have to be' : 'Its gain would have to be'} at least ${fmt(Math.ceil(b.b))} a month (±${fmt(tol)}) for it to enter the best combination under "${STRATEGIES[strategy].label}".`});
  }
  return {strategy, best: s0.best.ids, items, evaluations, method: 'full re-evaluation (Finance engine and combination search) for each tested gain'};
}

/**
 * Which assumptions move the result most: each assumption is changed by a fixed step in both directions and the
 * engine is rerun; the effect on the lowest month-end cash (base and downside) and whether the recommendation of
 * the strategy changes are reported, largest effect first.
 */
export function influence(m0, strategy, {weights, scenarioStep = 5, optionStep = 10} = {}) {
  const m = prepare(m0), r0 = evaluate(m, {weights, only: strategy}), s0 = r0.strategies[strategy], ids = s0.best.ids, runs = counter();
  const lowest = (r, s) => Math.min(...r.cash[s]);
  const ref = engineCombination(m, ids), base = {base: lowest(ref, 'base'), downside: lowest(ref, 'downside')};
  const items = [], recommendation = mm => { const r = evaluate(mm, {weights, only: strategy}); return r.problems.length ? null : r.strategies[strategy].best.ids.join('+'); };
  const record = (label, kind, step, make) => {
    const eff = [-1, 1].map(sgn => { runs.tick(); const mm = make(sgn * step); const r = engineCombination(mm, ids); const rec = recommendation(mm);
      return {change: sgn * step, base: lowest(r, 'base') - base.base, downside: lowest(r, 'downside') - base.downside, meetsReserve: lowest(r, 'base') >= m.finance.minimumCash - TOL, recommendationChanges: rec !== null && rec !== ids.join('+')}; });
    items.push({label, kind, step, effects: eff, magnitude: Math.max(...eff.map(e => Math.max(Math.abs(e.base), Math.abs(e.downside))))});
  };
  for (const [k, d] of levers(m)) record(`${d.label} ±${scenarioStep}%`, 'budget', scenarioStep, x => budgetChange(m, k, x));
  const excluded = [];
  for (const o of m.options.filter(x => ids.includes(x.id))) {
    const cost = o.kind === 'signing' ? 'transferFee' : 'upfront', run = o.kind === 'signing' ? 'monthlyWage' : 'monthlyCost';
    if (o[cost] > 0) record(`${o.name}: ${o.kind === 'signing' ? 'transfer fee' : 'immediate cost'} ±${optionStep}%`, 'option', optionStep, x => (withOption(m, o.id, {[cost]: o[cost] * (1 + x / 100)})));
    if (o[run] > 0) record(`${o.name}: ${o.kind === 'signing' ? 'gross wage' : 'running cost'} ±${optionStep}%`, 'option', optionStep, x => (withOption(m, o.id, {[run]: o[run] * (1 + x / 100)})));
    const st = gainStatus(o);
    if (st === 'known' && o.monthlyGain !== 0) record(`${o.name}: financial gain ±${optionStep}%`, 'option', optionStep, x => (withOption(m, o.id, {monthlyGain: o.monthlyGain * (1 + x / 100)})));
    if (st === 'range') record(`${o.name}: low end of the documented gain range ±${optionStep}%`, 'option', optionStep, x => (withOption(m, o.id, {gainRange: {...o.gainRange, low: Math.min(o.gainRange.high, o.gainRange.low * (1 + x / 100))}})));
    if (st === 'unknown') excluded.push(`${o.name}: financial gain not estimable (left out of the cash, not tested)`);
  }
  items.sort((a, b) => b.magnitude - a.magnitude);
  return {strategy, ids, reference: base, items, excluded, engineRuns: runs.get(), method: 'one-at-a-time changes, each recalculated with the Finance engine'};
}

/**
 * The whole sensitivity analysis for one strategy's recommendation, in the order a board reads it. Throws nothing on
 * valid inputs; returns {problems} otherwise.
 */
export function analyse(m0, strategy, {weights} = {}) {
  const problems = check(m0); if (problems.length) return {problems};
  const t0 = Date.now(), m = prepare(m0), r = evaluate(m, {weights, only: strategy}), s = r.strategies[strategy];
  if (s.status === 'no-feasible') return {problems: [], strategy, status: s.status, note: s.noFeasibleReason};
  const ids = s.best.ids;
  const revenue = [requiredRevenue(m, ids, 'downside')];
  // The combination the preferences favour but a hard constraint rules out: what would make it affordable?
  const top = s.rejectedBest[0];
  if (top) revenue.push({...requiredRevenue(m, top.ids, 'base'), forRejected: top.options, because: top.because});
  const costs = ids.map(id => maxAffordableCost(m, ids, id)).filter(x => x.current > 0 || x.value !== null);
  return {problems: [], strategy, label: STRATEGIES[strategy].label, recommendation: s.best.options, ids, alternative: s.runnerUp?.options ?? null,
    requiredRevenue: revenue, maxAffordableCost: costs, thresholds: assumptionThresholds(m, ids), preference: preferenceThresholds(m, strategy, {weights}),
    influence: influence(m, strategy, {weights}), elapsedMs: Date.now() - t0, totals: optionTotals};
}
