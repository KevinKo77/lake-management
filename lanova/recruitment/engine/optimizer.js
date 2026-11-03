/**
 * Exact multi-player recruitment portfolio optimisation.
 *
 * Chooses the subset of candidates (including "sign nobody") that maximises a
 * transparent objective subject to every club constraint, by depth-first
 * branch-and-bound with provably valid bounds. When the node budget is
 * exhausted the result says so (`provenOptimal: false`) instead of claiming
 * optimality.
 *
 * Objectives (all reported, one chosen):
 *   npv      Σ base-case NPV of the signings' incremental cash flows
 *   blended  NPV + valuePerPoint × discounted squad-adjusted points
 *   points   squad-adjusted league points over each player's stay
 *            (subject to optional minimum portfolio NPV)
 *
 * Squad-adjusted points apply diminishing returns within a position each
 * season: the best signing at a position counts fully, the next one ×f, the
 * next ×f², ... (f = samePositionFactor). This captures that two strikers do
 * not add twice the points of one, which an additive spreadsheet cannot.
 *
 * Constraints (seasons 1..horizon):
 *   transfer budget     upfront outlay at signing (fee instalment 1 + agent fee + loan fee + first signing-bonus part)
 *   squad-cost limit    committed squad cost + Σ (wages + bonuses + signing bonus + amortisation) per season
 *   cash floor          opening cash + club operating cash + Σ downside player cash ≥ floor at t = 0..horizon
 *   squad registration  current squad + signings ≤ max squad; non-EU slots; max signings
 *   position needs      minimum signings per position
 *   exclusive groups    at most one option per group (e.g. loan vs permanent for the same player)
 *   minimum NPV         optional floor on Σ base NPV
 */
import {economics, normalizeCandidate, normalizeContext} from './contract.js';

/**
 * Objective tie tolerance: absorbs floating-point noise only (1e-6 absolute, +1e-13 relative — about
 * €0.00001 at €100m). It was a relative 1e-7, which treated €99,999,999 and €100,000,000 as tied and
 * could pick the worse one while reporting proven optimality.
 */
export const objectiveTie = x => 1e-6 + 1e-13 * Math.abs(x);
/** Constraint tolerance: one cent, plus floating-point noise on very large amounts. Never lets a limit be exceeded by more. */
export const limitTolerance = x => 0.01 + 1e-12 * Math.abs(x);

/** Precompute per-candidate vectors used by both evaluation and search. */
export function prepare(candidatesInput, contextInput) {
  const ctx = normalizeContext(contextInput);
  const candidates = candidatesInput.map(normalizeCandidate);
  const ids = new Set();
  for (const c of candidates) { if (ids.has(c.id)) throw new RangeError(`Duplicate candidate id ${c.id}`); ids.add(c.id); }
  const H = ctx.horizon;
  const items = candidates.map(c => {
    const e = economics(c, ctx);
    const cumDown = [];
    let running = 0;
    for (let t = 0; t <= H; t++) { running += e.cash.downside[t] ?? 0; cumDown.push(running); }
    const cumUp = [];
    running = 0;
    for (let t = 0; t <= H; t++) { running += e.cash.upside[t] ?? 0; cumUp.push(running); }
    const cumBase = [];
    running = 0;
    for (let t = 0; t <= H; t++) { running += e.cash.base[t] ?? 0; cumBase.push(running); }
    return {
      c, e,
      upfront: e.upfrontOutlay,
      squadCost: Array.from({length: H}, (_, s) => e.squadCost[s] ?? 0),
      cumDown, cumBase, cumUp,
      beyondHorizon: {
        squadCost: e.squadCost.slice(H).reduce((a, b) => a + b, 0),
        cash: e.cash.base.slice(H + 1).reduce((a, b) => a + b, 0),
      },
    };
  });
  return {ctx, items};
}

/** Cash that must remain at every season end: operating floor plus ring-fenced reserve. */
export function cashFloorOf(ctx) {
  return ctx.minCash + ctx.protectedReserve;
}

function clubCashPath(ctx) {
  const path = [ctx.openingCash];
  for (let s = 1; s <= ctx.horizon; s++) path.push(path[s - 1] + ctx.operatingCashFlow[s - 1]);
  return path;
}

/** Squad-adjusted points per season with within-position diminishing returns. */
export function adjustedPoints(selected, ctx) {
  const seasons = Math.max(0, ...selected.map(it => it.e.exitSeason));
  const bySeason = [];
  for (let s = 1; s <= seasons; s++) {
    const groups = new Map();
    for (const it of selected) if (s <= it.e.exitSeason) {
      const list = groups.get(it.c.position) ?? [];
      list.push(it.c.points);
      groups.set(it.c.position, list);
    }
    let total = 0;
    for (const list of groups.values()) {
      list.sort((a, b) => b - a);
      list.forEach((p, k) => { total += p * ctx.samePositionFactor ** k; });
    }
    bySeason.push(total);
  }
  return bySeason;
}

function objectiveOf(npvSum, pointsBySeason, ctx, npvDownSum = 0) {
  const totalPoints = pointsBySeason.reduce((a, b) => a + b, 0);
  const discountedPoints = pointsBySeason.reduce((sum, p, i) => sum + p / (1 + ctx.discountRate) ** (i + 1), 0);
  const pointsValue = ctx.valuePerPoint * discountedPoints;
  const primary = ctx.objective === 'npv' ? npvSum : ctx.objective === 'points' ? totalPoints : ctx.objective === 'downside' ? npvDownSum : npvSum + pointsValue;
  const secondary = ctx.objective === 'points' || ctx.objective === 'downside' ? npvSum : ctx.objective === 'npv' ? totalPoints : npvSum;
  return {primary, secondary, totalPoints, discountedPoints, pointsValue};
}

/** Full, independent evaluation of one selection: metrics, constraint usage and violations. */
export function evaluate(prepared, selectedIds) {
  const {ctx, items} = prepared;
  const H = ctx.horizon;
  const chosen = items.filter(it => selectedIds.includes(it.c.id));
  if (chosen.length !== new Set(selectedIds).size) throw new RangeError('Unknown candidate in selection');
  const sum = f => chosen.reduce((a, it) => a + f(it), 0);
  const npvSum = sum(it => it.e.npv);
  const npvDownside = sum(it => it.e.npvDownside);
  const pointsBySeason = adjustedPoints(chosen, ctx);
  const objective = objectiveOf(npvSum, pointsBySeason, ctx, npvDownside);
  const npvUpside = sum(it => it.e.npvUpside);
  const club = clubCashPath(ctx);
  const cashDownside = club.map((x, t) => x + sum(it => it.cumDown[t]));
  const cashBase = club.map((x, t) => x + sum(it => it.cumBase[t]));
  const cashUpside = club.map((x, t) => x + sum(it => it.cumUp[t]));
  const grossCommitment = sum(it => it.e.grossCommitment);
  const squadCost = Array.from({length: H}, (_, s) => ctx.committedSquadCost[s] + sum(it => it.squadCost[s]));
  const upfront = sum(it => it.upfront);
  const nonEU = chosen.filter(it => it.c.nonEU).length;
  const positionCounts = {};
  for (const it of chosen) positionCounts[it.c.position] = (positionCounts[it.c.position] ?? 0) + 1;
  const groups = new Map();
  for (const it of chosen) if (it.c.group) groups.set(it.c.group, (groups.get(it.c.group) ?? 0) + 1);

  const usage = [];
  const add = (id, label, season, used, limit, sense) => {
    const slack = sense === '<=' ? limit - used : used - limit;
    usage.push({id, label, season, used, limit, sense, slack, violated: slack < -limitTolerance(limit)});
  };
  add('transferBudget', 'Transfer budget (upfront outlay)', null, upfront, ctx.transferBudget, '<=');
  for (let s = 0; s < H; s++) add('squadCost', 'Squad-cost limit', s + 1, squadCost[s], ctx.squadCostLimit[s], '<=');
  const floor = cashFloorOf(ctx);
  for (let t = 0; t <= H; t++) add('cashFloor', ctx.protectedReserve ? 'Downside cash floor + protected reserve' : 'Downside cash floor', t, cashDownside[t], floor, '>=');
  if (ctx.lifetimeCapital !== null) add('lifetimeCapital', 'Gross commitments within lifetime capital less protected reserve', null, grossCommitment, ctx.lifetimeCapital - ctx.protectedReserve, '<=');
  if (ctx.maxDownsideLoss !== null) add('maxLoss', 'Maximum downside NPV loss', null, npvDownside, -ctx.maxDownsideLoss, '>=');
  add('squadSize', 'Registered squad size', null, ctx.currentSquadSize + chosen.length, ctx.maxSquadSize, '<=');
  add('nonEU', 'Non-EU registrations', null, ctx.currentNonEU + nonEU, ctx.maxNonEU, '<=');
  add('maxSignings', 'Maximum signings', null, chosen.length, ctx.maxSignings, '<=');
  for (const [pos, n] of Object.entries(ctx.positionNeeds)) if (n > 0) add('positionNeed', `Minimum ${pos} signings`, null, positionCounts[pos] ?? 0, n, '>=');
  for (const [g, n] of groups) add('exclusiveGroup', `One option for ${g}`, null, n, 1, '<=');
  if (ctx.minPortfolioNpv !== null) add('minNpv', 'Minimum portfolio NPV', null, npvSum, ctx.minPortfolioNpv, '>=');

  const violations = usage.filter(u => u.violated);
  return {
    selection: chosen.map(it => it.c.id), feasible: violations.length === 0, violations, usage,
    objective, npv: npvSum, npvDownside, npvUpside, pointsBySeason,
    upfront, squadCost, cashBase, cashDownside, cashUpside, cashFloor: floor,
    grossCommitment,
    beyondHorizonSquadCost: sum(it => it.beyondHorizon.squadCost),
  };
}

function better(a, b) {
  if (Math.abs(a.primary - b.primary) > objectiveTie(b.primary)) return a.primary > b.primary;
  if (Math.abs(a.secondary - b.secondary) > objectiveTie(b.secondary)) return a.secondary > b.secondary;
  return false;
}

/** Optimistic per-candidate contribution to the primary objective (valid upper bound). */
function upperContribution(it, ctx) {
  const pts = it.e.totalPoints, dp = it.e.discountedPoints;
  const raw = ctx.objective === 'npv' ? it.e.npv : ctx.objective === 'points' ? pts : ctx.objective === 'downside' ? it.e.npvDownside : it.e.npv + ctx.valuePerPoint * dp;
  return Math.max(0, raw);
}

/**
 * Branch-and-bound. Options:
 *   forceInclude / forceExclude  candidate ids
 *   keep                         number of best distinct portfolios returned (default 5)
 *   nodeLimit                    search budget (default 2,000,000 nodes)
 */
export function optimize(prepared, options = {}) {
  const {ctx} = prepared;
  const keep = options.keep ?? 5;
  const nodeLimit = options.nodeLimit ?? 2e6;
  const forceIn = new Set(options.forceInclude ?? []);
  const forceOut = new Set(options.forceExclude ?? []);
  const H = ctx.horizon;
  const started = Date.now();

  const pool = prepared.items.filter(it => !forceOut.has(it.c.id));
  for (const id of forceIn) if (!pool.some(it => it.c.id === id)) throw new RangeError(`Cannot force unknown or excluded candidate ${id}`);
  const forced = pool.filter(it => forceIn.has(it.c.id));
  const free = pool.filter(it => !forceIn.has(it.c.id))
    .map(it => ({it, ub: upperContribution(it, ctx)}))
    .sort((a, b) => b.ub - a.ub || a.it.c.id.localeCompare(b.it.c.id));
  const n = free.length;

  // Suffix aggregates for bounds: from index j onward.
  const suffixUb = Array(n + 1).fill(0);
  // prefixUb[i] = Σ ub of the i best free candidates; at most `slots` more can join (sorted by ub).
  const prefixUb = [0];
  for (const {ub} of free) prefixUb.push(prefixUb[prefixUb.length - 1] + ub);
  const suffixNpvPos = Array(n + 1).fill(0);
  const suffixDownPos = Array(n + 1).fill(0);
  const suffixCashPos = Array.from({length: n + 1}, () => Array(H + 1).fill(0));
  const suffixPositions = Array.from({length: n + 1}, () => ({}));
  for (let j = n - 1; j >= 0; j--) {
    const {it, ub} = free[j];
    suffixUb[j] = suffixUb[j + 1] + ub;
    suffixNpvPos[j] = suffixNpvPos[j + 1] + Math.max(0, it.e.npv);
    suffixDownPos[j] = suffixDownPos[j + 1] + Math.max(0, it.e.npvDownside);
    for (let t = 0; t <= H; t++) suffixCashPos[j][t] = suffixCashPos[j + 1][t] + Math.max(0, it.cumDown[t]);
    suffixPositions[j] = {...suffixPositions[j + 1], [it.c.position]: (suffixPositions[j + 1][it.c.position] ?? 0) + 1};
  }

  const club = clubCashPath(ctx);
  const state = {
    chosen: [], upfront: 0, squadCost: [...ctx.committedSquadCost], cash: [...club],
    npv: 0, npvDown: 0, gross: 0, nonEU: 0, positions: {}, groups: new Set(),
  };
  const floor = cashFloorOf(ctx);
  const capitalLimit = ctx.lifetimeCapital === null ? Infinity : ctx.lifetimeCapital - ctx.protectedReserve;
  const push = it => {
    state.chosen.push(it); state.upfront += it.upfront; state.npv += it.e.npv; state.npvDown += it.e.npvDownside; state.gross += it.e.grossCommitment;
    for (let s = 0; s < H; s++) state.squadCost[s] += it.squadCost[s];
    for (let t = 0; t <= H; t++) state.cash[t] += it.cumDown[t];
    if (it.c.nonEU) state.nonEU++;
    state.positions[it.c.position] = (state.positions[it.c.position] ?? 0) + 1;
    if (it.c.group) state.groups.add(it.c.group);
  };
  const pop = () => {
    const it = state.chosen.pop(); state.upfront -= it.upfront; state.npv -= it.e.npv; state.npvDown -= it.e.npvDownside; state.gross -= it.e.grossCommitment;
    for (let s = 0; s < H; s++) state.squadCost[s] -= it.squadCost[s];
    for (let t = 0; t <= H; t++) state.cash[t] -= it.cumDown[t];
    if (it.c.nonEU) state.nonEU--;
    state.positions[it.c.position]--;
    if (it.c.group) state.groups.delete(it.c.group);
  };
  const tol = limitTolerance;
  // Monotone constraints: once violated, adding players cannot repair them.
  const canAdd = it => {
    if (state.chosen.length + 1 > ctx.maxSignings) return false;
    if (ctx.currentSquadSize + state.chosen.length + 1 > ctx.maxSquadSize) return false;
    if (it.c.nonEU && ctx.currentNonEU + state.nonEU + 1 > ctx.maxNonEU) return false;
    if (it.c.group && state.groups.has(it.c.group)) return false;
    if (state.upfront + it.upfront > ctx.transferBudget + tol(ctx.transferBudget)) return false;
    if (state.gross + it.e.grossCommitment > capitalLimit + tol(capitalLimit)) return false; // commitments ≥ 0: monotone
    for (let s = 0; s < H; s++) if (state.squadCost[s] + it.squadCost[s] > ctx.squadCostLimit[s] + tol(ctx.squadCostLimit[s])) return false;
    return true;
  };

  const best = [];
  let nodes = 0, truncated = false, forcedFeasible = true;
  for (const it of forced) {
    if (!canAdd(it)) forcedFeasible = false;
    push(it);
  }
  const kth = () => (best.length < keep ? -Infinity : best[best.length - 1].objective.primary);
  const record = current => {
    // Monotone constraints are guaranteed by canAdd; check the rest from search state.
    for (let t = 0; t <= H; t++) if (state.cash[t] < floor - tol(floor)) return;
    if (ctx.maxDownsideLoss !== null && state.npvDown < -ctx.maxDownsideLoss - tol(ctx.maxDownsideLoss)) return;
    for (const [pos, need] of Object.entries(ctx.positionNeeds)) if ((state.positions[pos] ?? 0) < need) return;
    if (ctx.minPortfolioNpv !== null && state.npv < ctx.minPortfolioNpv - tol(ctx.minPortfolioNpv)) return;
    if (best.length === keep && !better(current, best[best.length - 1].objective)) return;
    // Authoritative re-evaluation; disagreement would be an engine defect, never silently accepted.
    const ev = evaluate(prepared, state.chosen.map(it => it.c.id));
    if (!ev.feasible) throw new Error(`Optimizer state inconsistent with evaluation: ${ev.violations.map(v => v.id).join(', ')}`);
    best.push(ev);
    best.sort((a, b) => (better(a.objective, b.objective) ? -1 : better(b.objective, a.objective) ? 1 : a.selection.join().localeCompare(b.selection.join())));
    if (best.length > keep) best.pop();
  };
  // Relaxation-based prune for everything reachable from index j.
  const hopeless = (j, current) => {
    const slots = Math.max(0, Math.min(ctx.maxSignings, ctx.maxSquadSize - ctx.currentSquadSize) - state.chosen.length);
    const optimistic = Math.min(suffixUb[j], prefixUb[Math.min(n, j + slots)] - prefixUb[j]);
    if (best.length === keep && current + optimistic < kth() - tol(kth())) return true;
    for (let t = 0; t <= H; t++) if (state.cash[t] + suffixCashPos[j][t] < floor - tol(floor)) return true;
    if (ctx.maxDownsideLoss !== null && state.npvDown + suffixDownPos[j] < -ctx.maxDownsideLoss - tol(ctx.maxDownsideLoss)) return true;
    if (ctx.minPortfolioNpv !== null && state.npv + suffixNpvPos[j] < ctx.minPortfolioNpv - tol(ctx.minPortfolioNpv)) return true;
    let outstanding = 0;
    for (const [pos, need] of Object.entries(ctx.positionNeeds)) {
      const missing = Math.max(0, need - (state.positions[pos] ?? 0));
      if (missing > (suffixPositions[j][pos] ?? 0)) return true;
      outstanding += missing;
    }
    return state.chosen.length + outstanding > ctx.maxSignings;
  };
  function visit(start) {
    nodes++;
    const current = objectiveOf(state.npv, adjustedPoints(state.chosen, ctx), ctx, state.npvDown);
    record(current);
    if (nodes >= nodeLimit) { truncated = true; return; }
    for (let j = start; j < n; j++) {
      if (hopeless(j, current.primary)) break; // suffix bounds only shrink as j grows
      const {it} = free[j];
      if (!canAdd(it)) continue;
      push(it);
      visit(j + 1);
      pop();
      if (truncated) return;
    }
  }
  if (forcedFeasible) visit(0);

  return {
    best: best[0] ?? null,
    alternatives: best,
    provenOptimal: !truncated,
    nodes,
    candidates: prepared.items.length,
    searchSpace: 2 ** n,
    milliseconds: Date.now() - started,
    forced: [...forceIn], excluded: [...forceOut],
    objectiveName: ctx.objective,
  };
}

/** Exhaustive reference used by tests to verify branch-and-bound optimality. */
export function bruteForce(prepared, {forceInclude = [], forceExclude = []} = {}) {
  const items = prepared.items;
  if (items.length > 16) throw new RangeError('Brute force limited to 16 candidates');
  let best = null;
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    const ids = items.filter((_, i) => mask & (1 << i)).map(it => it.c.id);
    if (forceInclude.some(id => !ids.includes(id)) || forceExclude.some(id => ids.includes(id))) continue;
    const ev = evaluate(prepared, ids);
    if (ev.feasible && (!best || better(ev.objective, best.objective))) best = ev;
  }
  return best;
}

export {better as isBetterObjective, clubCashPath};
