/**
 * Plain-language explanation of an engine result. Pure functions (no DOM), used by the page, the printable report
 * and the tests. Every number comes from the unchanged engine (recruitment/engine); this module only selects,
 * re-labels and compares engine outputs. Extra engine runs (robustness, what would fix an infeasible case) are
 * full re-optimisations of modified copies of the inputs and are labelled as such.
 */
import {prepare, optimize} from '../../recruitment/engine/optimizer.js';

export const eur = n => (n < 0 ? '−' : '') + '€' + Math.round(Math.abs(n)).toLocaleString('en-GB');
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const list = a => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
const DEAL = {permanent: 'transfer', loan: 'loan', free: 'free agent'};
const POSN = {GK: 'goalkeeper', CB: 'centre-back', FB: 'full-back', DM: 'defensive midfielder', CM: 'central midfielder', AM: 'attacking midfielder', W: 'winger', ST: 'striker'};

export function forceOf(scenario) {
  const forceInclude = [], forceExclude = [];
  for (const [id, m] of Object.entries(scenario.modes ?? {})) { if (m === 'must') forceInclude.push(id); if (m === 'exclude') forceExclude.push(id); }
  return {forceInclude, forceExclude};
}

const best = (candidates, context, force) => optimize(prepare(candidates, context), {...force, keep: 1}).best;

/** Fixed robustness probes: does the recommendation survive realistic changes to the estimates? (engine re-runs) */
export function robustness(scenario, selection) {
  const {candidates: C, context: X} = scenario;
  const force = forceOf(scenario);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const probes = [
    ['Every expected-points estimate 20% lower', C.map(c => ({...c, points: c.points * 0.8})), X],
    ['Every expected-points estimate 20% higher', C.map(c => ({...c, points: Math.min(50, c.points * 1.2)})), X],
    ['Bad-case resale haircut 20 points deeper', C, {...X, stress: {...X.stress, resaleHaircut: clamp(X.stress.resaleHaircut + 0.2, 0, 1)}}],
    ['Discount rate 2 points higher', C, {...X, discountRate: clamp(X.discountRate + 0.02, 0, 1)}],
  ];
  if (X.objective === 'blended') probes.push(['A league point worth 25% less', C, {...X, valuePerPoint: X.valuePerPoint * 0.75}], ['A league point worth 25% more', C, {...X, valuePerPoint: X.valuePerPoint * 1.25}]);
  return probes.map(([label, cands, ctx]) => {
    const b = best(cands, ctx, force);
    return {label, selection: b ? b.selection : null, changes: !b || !sameSet(b.selection, selection)};
  });
}

/** For an infeasible case: which single realistic change would make a safe portfolio possible? (engine re-runs) */
export function fixes(scenario) {
  const {candidates: C, context: X} = scenario;
  const force = forceOf(scenario);
  const tries = [
    ['€250,000 more cash available today', {...X, openingCash: X.openingCash + 250000}],
    ['€500,000 more cash available today', {...X, openingCash: X.openingCash + 500000}],
    ['A smaller protected reserve (half of today’s)', {...X, protectedReserve: X.protectedReserve / 2}],
    ['€250,000 more signing budget', {...X, transferBudget: X.transferBudget + 250000}],
    ['€500,000 more squad-cost room every season', {...X, squadCostLimit: X.squadCostLimit.map(v => v + 500000)}],
    ['Dropping the minimum position requirements', {...X, positionNeeds: {}}],
  ];
  return tries.map(([label, ctx]) => { const b = best(C, ctx, force); return {label, works: Boolean(b), selection: b ? b.selection : null}; });
}

/** The page/report story: decision, recommendation, why, spend, risks, alternatives. */
export function story(meta, scenario, analysis, extras = {}) {
  const ctx = analysis.context;
  const byId = new Map(scenario.candidates.map(c => [c.id, c]));
  const nameOf = id => byId.get(id).name;
  const econ = new Map(analysis.economics.map(e => [e.id, e]));
  const b = analysis.result.best;
  const out = {club: meta.club, tier: meta.tier, decision: meta.decision, fictional: true, proven: analysis.result.provenOptimal, searchSpace: analysis.result.searchSpace};
  if (!b) {
    out.feasible = false;
    out.headline = analysis.result.provenOptimal ? 'No combination on this shortlist keeps the club within its limits.' : 'No safe combination was found within the search limit (this is not a proof that none exists).';
    out.why = (analysis.noSigningEvaluation?.violations ?? []).map(v => v.id === 'positionNeed' ? `The club must sign at least ${v.limit} ${POSN[v.label.replace('Minimum ', '').replace(' signings', '')] ?? v.label}, but every way of doing so breaks another limit — see what would make a safe choice possible.` : `Even signing nobody breaks: ${plainLimit(v)}.`);
    out.fixes = extras.fixes?.map(f => ({...f, names: f.selection?.map(nameOf) ?? []})) ?? [];
    out.risks = ['Treat this as a warning, not a recommendation: with these limits the shortlist cannot be signed safely.'];
    return out;
  }
  out.feasible = true;
  const players = b.selection.map(id => {
    const c = byId.get(id), e = econ.get(id);
    return {id, name: c.name, position: c.position, deal: DEAL[c.dealType], years: c.contractYears, points: c.points,
      atSigning: e.upfrontOutlay, wagesPerSeason: e.wages[0] ?? 0, totalCommitment: e.grossCommitment, npv: e.npv};
  });
  out.players = players;
  out.headline = players.length ? `Sign ${list(players.map(p => p.name))}.` : 'Sign nobody: no combination improves on the current squad under these limits.';
  // Why — from engine outputs only.
  const why = [];
  const needs = Object.entries(ctx.positionNeeds);
  if (needs.length) why.push(`It fills every required position (${needs.map(([p, n]) => `${n} ${POSN[p]}`).join(', ')}).`);
  why.push(`It is the best of ${analysis.result.searchSpace.toLocaleString('en-GB')} possible combinations for the club’s goal (${goalText(ctx)}) that respect every limit${analysis.result.provenOptimal ? ' — checked exhaustively' : ' found within the search limit'}.`);
  const tight = analysis.binding.filter(u => !['positionNeed'].includes(u.id)).map(plainBinding);
  if (tight.length) why.push(`What decides it: ${list([...new Set(tight)])}.`);
  for (const m of analysis.marginals) why.push(m.removalBreaks.length
    ? `${nameOf(m.id)} is needed: without this player the club would break ${list([...new Set(m.removalBreaks.map(l => { const p = l.match(/^Minimum (\w+) signings$/); return p ? `the requirement to sign a ${POSN[p[1]] ?? p[1]}` : l.toLowerCase(); }))])}.`
    : m.marginal >= 0 ? `${nameOf(m.id)} adds ${eur(m.marginal)} to the overall result.` : `${nameOf(m.id)} costs ${eur(-m.marginal)} more than the value it adds on its own, but is part of the best combination.`);
  out.why = why;
  // Spend
  const committed = ctx.committedSquadCost;
  out.spend = {
    atSigning: b.upfront, budget: ctx.transferBudget,
    addedSquadCost: b.squadCost.map((x, i) => x - committed[i]), squadCostLimit: ctx.squadCostLimit, squadCostTotal: b.squadCost,
    totalCommitment: b.grossCommitment, netValue: b.npv, objective: b.objective.primary,
  };
  // Risks
  const risks = [];
  const low = b.cashDownside.reduce((m, x, t) => x < m.v ? {v: x, t} : m, {v: Infinity, t: 0});
  risks.push(`In the bad case (every season goes badly: resale ${Math.round(ctx.stress.resaleHaircut * 100)}% lower, player revenue ${Math.round(ctx.stress.revenueHaircut * 100)}% lower), the club’s cash would reach its lowest point of ${eur(low.v)} ${low.t === 0 ? 'at signing' : `at the end of season ${low.t}`}, against a safety level of ${eur(b.cashFloor)}.`);
  if (b.npvDownside < 0) risks.push(`In that bad case, the signings’ net present value over their whole contracts would be ${eur(b.npvDownside)}: all their payments and receipts, discounted to today and added up across every season. This is not a one-season loss, and it leaves out the value of league points.`);
  risks.push('Expected points are estimates entered by the club (here: fictional). If a player under-performs, the sporting benefit shrinks; the costs do not.');
  const flips = (extras.robustness ?? []).filter(r => r.changes);
  if (extras.robustness) risks.push(flips.length
    ? `The choice is sensitive: it changes if ${list(flips.map(f => f.label.toLowerCase()))}.`
    : `The choice is stable: it stays the same under all ${extras.robustness.length} stress tests (points ±20%, worse resale, higher discount rate${ctx.objective === 'blended' ? ', point value ±25%' : ''}).`);
  const next = analysis.result.alternatives[1];
  if (next && Math.abs(b.objective.primary - next.objective.primary) < 0.02 * Math.max(1, Math.abs(b.objective.primary))) risks.push('Close call: the next-best option is within 2% of this one.');
  if (!analysis.result.provenOptimal) risks.push('The search limit was reached: this is the best option found, not a proven best.');
  out.risks = risks;
  out.robustness = extras.robustness ?? [];
  // Alternatives
  out.alternatives = analysis.result.alternatives.slice(1, 4).map(a => ({names: a.selection.map(nameOf), objective: a.objective.primary, gap: b.objective.primary - a.objective.primary, atSigning: a.upfront}));
  out.notChosen = analysis.exclusions.map(x => ({name: nameOf(x.id), reason: plainExclusion(x, nameOf)}));
  return out;
}

function goalText(ctx) {
  return {blended: `money plus ${eur(ctx.valuePerPoint)} per expected league point`, npv: 'best financial value', points: 'most expected league points', downside: 'best value in the bad case (present value over all seasons)'}[ctx.objective];
}
function plainLimit(v) {
  const L = {transferBudget: 'the signing budget', squadCost: `the squad-cost limit in season ${v.season}`, cashFloor: v.season === 0 ? 'the cash safety level at signing' : `the cash safety level in season ${v.season}`, lifetimeCapital: 'the total-commitment cap', maxLoss: 'the maximum acceptable bad-case loss (present value)', squadSize: 'the squad-size limit', nonEU: 'the non-EU slots', maxSignings: 'the maximum number of signings', exclusiveGroup: 'one option per player'};
  return L[v.id] ?? v.label;
}
function plainBinding(u) {
  const B = {nonEU: 'all non-EU places are used', maxSignings: 'the maximum number of signings is reached', squadSize: 'the squad is full', exclusiveGroup: 'only one option per player can be chosen'};
  return B[u.id] ?? `${plainLimit(u)} is almost fully used`;
}
function plainExclusion(x, nameOf) {
  if (x.kind === 'excluded') return 'Not available in this scenario.';
  if (x.kind === 'infeasible-alone' || x.kind === 'infeasible-every-portfolio') return `No combination that includes this player stays within the club’s limits${x.breaks?.length ? ` (with the recommended players it would break ${list([...new Set(x.breaks.map(plainLimit))])})` : ''}.`;
  if (x.kind === 'displaces') return `Would push out ${list(x.displaced.map(nameOf))} and lower the result by ${eur(-x.delta)}.`;
  if (x.kind === 'negative') return `Adding this player lowers the result by ${eur(-x.delta)}: the costs outweigh the value of the expected points.`;
  return 'Not determined within the search limit.';
}

/** What changed between two stories (for the what-if panel). */
export function diff(before, after) {
  const ids = s => s.feasible ? s.players.map(p => p.name) : [];
  const a = ids(before), b = ids(after);
  return {added: b.filter(x => !a.includes(x)), removed: a.filter(x => !b.includes(x)), feasibleBefore: before.feasible, feasibleAfter: after.feasible,
    atSigning: [before.spend?.atSigning ?? null, after.spend?.atSigning ?? null], objective: [before.spend?.objective ?? null, after.spend?.objective ?? null]};
}
