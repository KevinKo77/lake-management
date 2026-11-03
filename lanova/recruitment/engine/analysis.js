/**
 * Decision analysis: optimal portfolio + the reasons behind it.
 *
 * Everything here is derived by re-running the exact optimizer or the
 * independent evaluator — no explanation is hand-written or inferred.
 */
import {prepare, optimize, evaluate} from './optimizer.js';
import {spreadsheetShortlist, solverStyleShortlist} from './baseline.js';
import {ENGINE_VERSION} from './contract.js';

// Counts explanation re-optimisations that hit the search budget (reset per analysis).
const truncatedProbes = {count: 0};

export const MONEY_CONSTRAINTS = new Set(['transferBudget', 'squadCost', 'cashFloor', 'minNpv', 'lifetimeCapital', 'maxLoss']);

/** Relative slack; ≤ 2% is reported as binding/near-binding. */
function tightness(u) {
  const scale = Math.max(1, Math.abs(u.limit));
  return u.slack / scale;
}

export function bindingConstraints(evaluation, threshold = 0.02) {
  return evaluation.usage
    .filter(u => !u.violated && (MONEY_CONSTRAINTS.has(u.id) ? tightness(u) <= threshold : u.slack <= 0))
    .sort((a, b) => tightness(a) - tightness(b));
}

/** Objective lost by removing each selected player (accounts for diminishing returns). */
function marginalContributions(prepared, best) {
  return best.selection.map(id => {
    const without = evaluate(prepared, best.selection.filter(x => x !== id));
    return {
      id,
      marginal: best.objective.primary - without.objective.primary,
      removalBreaks: without.violations.map(v => v.label),
    };
  });
}

// Constraints that adding players can only worsen. A standalone breach of one of these proves that no
// portfolio containing the player can satisfy it; any other standalone breach (cash floor, max loss,
// min NPV, position needs) may be repaired by other signings and proves nothing on its own.
const MONOTONE = new Set(['transferBudget', 'squadCost', 'lifetimeCapital', 'squadSize', 'nonEU', 'maxSignings', 'exclusiveGroup']);

function standaloneBreaches(prepared, ids) {
  return evaluate(prepared, ids).violations.filter(v => v.id !== 'positionNeed');
}

function describeViolation(v, money) {
  const when = v.season === null ? '' : v.id === 'cashFloor' ? ` at t=${v.season}` : ` in season ${v.season}`;
  const amount = MONEY_CONSTRAINTS.has(v.id) ? `${money(v.used)} vs ${money(v.limit)}` : `${v.used} vs ${v.limit}`;
  return `${v.label}${when}: ${amount}`;
}

/** What standalone breaches do and do not prove, in words. */
function aloneSentence(breaches, money) {
  if (!breaches.length) return 'On its own this signing breaches no limit.';
  const monotone = breaches.filter(v => MONOTONE.has(v.id)), other = breaches.filter(v => !MONOTONE.has(v.id));
  const parts = [];
  if (monotone.length) parts.push(`On its own it already breaches ${monotone.map(v => describeViolation(v, money)).join('; ')} — limits that additional signings can only make worse.`);
  if (other.length) parts.push(`On its own it would breach ${other.map(v => describeViolation(v, money)).join('; ')}; other signings could in principle repair ${other.length > 1 ? 'these' : 'this'} (e.g. cash-generating players), so this alone does not prove it cannot be signed.`);
  return parts.join(' ');
}

function explainExclusions(prepared, result, money, force, nodeLimit) {
  const best = result.best;
  // Objective amounts are points under the points objective, euros otherwise (limits stay in euros).
  const objAmount = prepared.ctx.objective === 'points' ? x => `${x.toFixed(2)} points` : money;
  const excludedByAnalyst = new Set(force.forceExclude ?? []);
  const names = new Map(prepared.items.map(it => [it.c.id, it.c.name]));
  return prepared.items.filter(it => !best.selection.includes(it.c.id)).map(it => {
    const id = it.c.id;
    if (excludedByAnalyst.has(id)) return {id, kind: 'excluded', proven: true, delta: null, displaced: [], text: 'Excluded by the analyst for this run.'};
    const alone = standaloneBreaches(prepared, [id]);
    // Never conclude anything about signability without a forced-inclusion search.
    const forced = optimize(prepared, {forceInclude: [...(force.forceInclude ?? []), id], forceExclude: force.forceExclude, keep: 1, nodeLimit});
    if (!forced.provenOptimal) truncatedProbes.count++;
    const added = evaluate(prepared, [...best.selection, id]);
    const breaks = added.violations.map(v => describeViolation(v, money));
    const because = breaks.length ? ` Adding this player to the recommendation would breach ${breaks.slice(0, 3).join('; ')}.` : '';
    if (!forced.best) {
      if (!forced.provenOptimal) {
        return {id, kind: 'undetermined', proven: false, delta: null, displaced: [], breaks: added.violations,
          text: `NOT DETERMINED: the forced-inclusion search reached its search budget (${forced.nodes.toLocaleString('en-GB')} nodes) before finding any feasible portfolio with ${names.get(id)}. This is not proof that none exists. ${aloneSentence(alone, money)}${because}`};
      }
      const cause = alone.some(v => MONOTONE.has(v.id))
        ? ''
        : alone.length ? ' The conflict comes from combining it with the other requirements, not from this signing alone.' : ' The signing is affordable on its own; the conflict arises with the position needs, must-sign players, registrations or the downside cash path of every compatible combination.';
      return {id, kind: alone.length && alone.every(v => MONOTONE.has(v.id)) ? 'infeasible-alone' : 'infeasible-every-portfolio', proven: true, delta: null, displaced: [], breaks: added.violations,
        text: `PROVEN by a complete search: no portfolio that includes ${names.get(id)} meets every limit. ${aloneSentence(alone, money)}${cause}${because}`};
    }
    const delta = forced.best.objective.primary - best.objective.primary;
    const displaced = best.selection.filter(x => !forced.best.selection.includes(x));
    // A truncated forced search found *a* portfolio with the player; the best one may be better.
    const exact = forced.provenOptimal;
    const cost = exact ? `lowering the objective by ${objAmount(-delta)}` : `lowering the objective by at most ${objAmount(-delta)} (search budget reached — the exact cost may be smaller)`;
    const text = displaced.length
      ? `Signing ${names.get(id)} would force out ${displaced.map(x => names.get(x)).join(', ')}, ${cost}.${because}`
      : `Adding ${names.get(id)} to the recommended portfolio ${exact ? `changes the objective by ${objAmount(delta)}` : `changes the objective by at least ${objAmount(delta)} (search budget reached)`}: its costs outweigh its financial and sporting value under the current assumptions.${because}`;
    return {id, kind: displaced.length ? 'displaces' : 'negative', proven: exact, delta, displaced, breaks: added.violations, text};
  });
}

/** Why the must-sign players make every portfolio infeasible (replaces the misleading "signing nobody" report). */
function diagnoseMustSign(prepared, result, force, money, nodeLimit) {
  const must = force.forceInclude ?? [];
  const names = new Map(prepared.items.map(it => [it.c.id, it.c.name]));
  const lines = [];
  const together = standaloneBreaches(prepared, must);
  lines.push(must.length > 1 ? `Together, the must-sign players: ${aloneSentence(together, money).replace(/^On its own (it|this signing) /, '')}` : `${names.get(must[0])}: ${aloneSentence(together, money)}`);
  if (must.length > 1) {
    for (const id of must) {
      const r = optimize(prepared, {forceInclude: [id], forceExclude: force.forceExclude, keep: 1, nodeLimit});
      lines.push(`${names.get(id)} alone as a must-sign: ${r.best ? 'a feasible portfolio exists' : r.provenOptimal ? 'proven infeasible in every portfolio' : 'not determined within the search budget'}.`);
    }
  }
  const free = optimize(prepared, {forceExclude: force.forceExclude, keep: 1, nodeLimit});
  lines.push(free.best ? `Without the must-sign requirement a feasible portfolio exists: ${free.best.selection.map(id => names.get(id)).join(', ') || 'no signing'}.` : free.provenOptimal ? 'Even without the must-sign requirement no portfolio meets every limit.' : 'Without the must-sign requirement, feasibility was not determined within the search budget.');
  return {proven: result.provenOptimal, mustSign: must.map(id => names.get(id)), lines};
}

function shadowPrices(candidates, context, best, options, force) {
  const tests = [
    {label: 'Transfer budget +€1m', patch: c => ({...c, transferBudget: c.transferBudget + 1e6})},
    {label: 'Squad-cost limit +€1m every season', patch: c => ({...c, squadCostLimit: c.squadCostLimit.map(x => x + 1e6)})},
    {label: 'Cash floor −€1m', patch: c => ({...c, minCash: c.minCash - 1e6})},
    {label: 'One more signing slot', patch: c => ({...c, maxSignings: c.maxSignings + 1, maxSquadSize: c.maxSquadSize + 1})},
  ];
  if (context.protectedReserve > 0) {
    const cut = Math.min(1e6, context.protectedReserve);
    tests.push({label: `Protected reserve −€${cut >= 1e6 ? '1m' : Math.round(cut / 1e3) + 'k'}`, patch: c => ({...c, protectedReserve: c.protectedReserve - cut})});
  }
  if (context.lifetimeCapital !== null) tests.push({label: 'Lifetime capital +€1m', patch: c => ({...c, lifetimeCapital: c.lifetimeCapital + 1e6})});
  if (context.maxDownsideLoss !== null) tests.push({label: 'Maximum downside loss +€1m', patch: c => ({...c, maxDownsideLoss: c.maxDownsideLoss + 1e6})});
  // Limits can bind jointly: each alone may show €0 while relaxing them together pays.
  tests.push({label: 'Every money limit relaxed by €1m together', patch: c => ({
    ...c, transferBudget: c.transferBudget + 1e6, squadCostLimit: c.squadCostLimit.map(x => x + 1e6), minCash: c.minCash - 1e6,
    ...(c.lifetimeCapital !== null ? {lifetimeCapital: c.lifetimeCapital + 1e6} : {}),
    ...(c.maxDownsideLoss !== null ? {maxDownsideLoss: c.maxDownsideLoss + 1e6} : {}),
  })});
  // Patch the normalised context (arrays always expanded); a probe that cannot run is reported, never fatal.
  return tests.map(({label, patch}) => {
    try {
      const r = optimize(prepare(candidates, patch(context)), {...force, keep: 1, nodeLimit: options.nodeLimit});
      const value = r.best ? r.best.objective.primary : null;
      return {label, delta: value === null || !best ? null : value - best.objective.primary, selection: r.best?.selection ?? [], provenOptimal: r.provenOptimal};
    } catch (error) {
      return {label, delta: null, selection: [], provenOptimal: false, unavailable: error.message};
    }
  });
}

/**
 * Main entry: optimise, explain, compare with two spreadsheet-style baselines (simple greedy
 * shortlist; exact optimum of a simplified spreadsheet model). Neither is a claim about Excel itself.
 * `money` formats amounts inside generated sentences.
 */
export function analyse(candidates, context, options = {}) {
  const money = options.money ?? (x => `€${Math.round(x).toLocaleString('en-GB')}`);
  const prepared = prepare(candidates, context);
  const force = {forceInclude: options.forceInclude ?? [], forceExclude: options.forceExclude ?? []};
  truncatedProbes.count = 0;
  const result = optimize(prepared, {...force, keep: options.keep ?? 5, nodeLimit: options.nodeLimit});
  const baselinePick = spreadsheetShortlist(prepared);
  const baseline = {...baselinePick, label: 'Simple greedy spreadsheet-style shortlist', evaluation: evaluate(prepared, baselinePick.selection)};
  let solverBaseline;
  if (prepared.items.length <= 20) {
    const pick = solverStyleShortlist(prepared);
    solverBaseline = {...pick, label: 'Exact optimum of a simplified spreadsheet model (Solver-style)', evaluation: pick.selection === null ? null : evaluate(prepared, pick.selection)};
  } else solverBaseline = {selection: null, label: 'Exact optimum of a simplified spreadsheet model (Solver-style)', unavailable: 'Computed for shortlists of up to 20 candidates', evaluation: null, rules: []};
  const out = {
    engineVersion: ENGINE_VERSION,
    force,
    generatedAt: options.now ?? new Date().toISOString(),
    context: prepared.ctx,
    economics: prepared.items.map(it => it.e),
    result, baseline, solverBaseline,
  };
  if (!result.best) {
    out.summary = force.forceInclude.length
      ? `${result.provenOptimal ? 'PROVEN by a complete search' : 'Within the search budget'}: no portfolio containing the must-sign player${force.forceInclude.length > 1 ? 's' : ''} satisfies every constraint.`
      : 'No portfolio satisfies every constraint — not even signing nobody. Check position needs against candidates, and the cash floor against the club’s own cash path.';
    // Only describe the empty portfolio when no must-sign is set; otherwise explain the must-sign itself.
    out.noSigningEvaluation = force.forceInclude.length ? null : evaluate(prepared, []);
    out.mustSignDiagnosis = force.forceInclude.length ? diagnoseMustSign(prepared, result, force, money, options.nodeLimit) : null;
    out.warnings = result.provenOptimal ? [] : [`Search budget reached after ${result.nodes.toLocaleString('en-GB')} nodes before any feasible portfolio was found: infeasibility is NOT proven.`];
    if (!result.provenOptimal) out.summary = 'No feasible portfolio found within the search budget — this is NOT proof that none exists. Increase the search budget or reduce the shortlist.';
    return out;
  }
  out.marginals = marginalContributions(prepared, result.best);
  out.binding = bindingConstraints(result.best);
  out.exclusions = options.explainExclusions === false ? [] : explainExclusions(prepared, result, money, force, options.nodeLimit);
  out.shadowPrices = options.shadowPrices === false ? [] : shadowPrices(candidates, prepared.ctx, result.best, options, force);
  const truncatedShadow = out.shadowPrices.filter(sp => !sp.provenOptimal && !sp.unavailable).length;
  out.warnings = [];
  if (!result.provenOptimal) out.warnings.push(`Search budget reached after ${result.nodes.toLocaleString('en-GB')} nodes: the recommendation is the best portfolio found, NOT proven optimal.`);
  if (truncatedProbes.count || truncatedShadow) out.warnings.push(`${truncatedProbes.count + truncatedShadow} explanation re-runs also hit the search budget; their figures are lower bounds, not exact.`);
  const b = baseline.evaluation;
  out.versusBaseline = {
    baselineFeasible: b.feasible,
    baselineViolations: b.violations,
    objectiveGain: b.feasible ? result.best.objective.primary - b.objective.primary : null,
    npvGain: result.best.npv - b.npv,
    pointsGain: result.best.objective.totalPoints - b.objective.totalPoints,
  };
  const sv = solverBaseline.evaluation;
  out.versusSolver = !sv ? {available: false, reason: solverBaseline.unavailable ?? 'The simplified model has no feasible portfolio'} : {
    available: true, baselineFeasible: sv.feasible, baselineViolations: sv.violations,
    objectiveGain: sv.feasible ? result.best.objective.primary - sv.objective.primary : null,
    npvGain: result.best.npv - sv.npv, pointsGain: result.best.objective.totalPoints - sv.objective.totalPoints,
  };
  const names = new Map(prepared.items.map(it => [it.c.id, it.c.name]));
  out.summary = result.best.selection.length
    ? `Recommended: ${result.best.selection.map(id => names.get(id)).join(', ')}. ${result.provenOptimal ? 'Proven optimal' : 'Best found within the search budget (not proven optimal)'} among ${result.searchSpace.toLocaleString('en-GB')} possible portfolios.`
    : 'Recommended: no signing. No affordable combination improves the chosen objective under the current assumptions.';
  return out;
}
