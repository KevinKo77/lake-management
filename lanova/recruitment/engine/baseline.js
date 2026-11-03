/**
 * A codified simple greedy spreadsheet-style recruitment shortlist, used only as a
 * comparison baseline. It mirrors the common workflow of ranking targets by a
 * value-for-money ratio and ticking them off against this window's transfer
 * budget and wage room, one season at a time:
 *
 *   1. score = expected points per season ÷ nominal contract cost
 *      (fee + agent fee + signing bonus + wages × contract years)
 *   2. fill each minimum position need with its best-ranked candidate
 *   3. add remaining candidates in rank order while they fit:
 *        Σ (fee + agent fee)        ≤ transfer budget       (full fee, instalments ignored)
 *        Σ season-1 wages           ≤ season-1 squad-cost limit − committed squad cost
 *        signings, squad size, non-EU slots and exclusive groups
 *        Σ nominal contract cost ≤ lifetime capital − protected reserve (when set)
 *
 * What the spreadsheet does NOT see — amortisation in the squad-cost limit,
 * later-season instalments, wage growth, downside cash, diminishing returns
 * within a position, resale/sell-on and the time value of money — is exactly
 * what the full engine evaluates afterwards. This is a transparent proxy of a
 * typical workflow, not a claim about any particular club's spreadsheet.
 */
export const BASELINE_RULES = Object.freeze([
  'Rank by expected points per season ÷ nominal contract cost (fee + agent + signing bonus + wages × years).',
  'Fill minimum position needs first with the best-ranked candidate at each position.',
  'Add the rest in rank order while full fees + agent fees fit the transfer budget and season-1 wages fit the season-1 squad-cost room.',
  'Respect signings, squad-size, non-EU and one-option-per-player limits.',
  'If the club sets lifetime capital, keep the sum of nominal contract costs within lifetime capital less the protected reserve.',
]);

export function nominalCost(c) {
  return c.fee + c.agentFee + c.signingBonus + c.wage * c.wageShare * c.contractYears;
}

export function spreadsheetShortlist(prepared) {
  const {ctx, items} = prepared;
  const ranked = items
    .map(it => ({it, score: it.c.points / Math.max(1, nominalCost(it.c))}))
    .sort((a, b) => b.score - a.score || a.it.c.id.localeCompare(b.it.c.id));
  const wageRoom = ctx.squadCostLimit[0] - ctx.committedSquadCost[0];
  const chosen = [];
  let feesUsed = 0, wagesUsed = 0, nonEU = 0, nominalUsed = 0;
  const capitalRoom = ctx.lifetimeCapital === null ? Infinity : ctx.lifetimeCapital - ctx.protectedReserve;
  const groups = new Set();
  const fits = it => {
    const c = it.c;
    return chosen.length < ctx.maxSignings
      && ctx.currentSquadSize + chosen.length < ctx.maxSquadSize
      && (!c.nonEU || ctx.currentNonEU + nonEU < ctx.maxNonEU)
      && (!c.group || !groups.has(c.group))
      && feesUsed + c.fee + c.agentFee <= ctx.transferBudget
      && wagesUsed + c.wage * c.wageShare <= wageRoom
      && nominalUsed + nominalCost(c) <= capitalRoom;
  };
  const take = it => {
    chosen.push(it); feesUsed += it.c.fee + it.c.agentFee; wagesUsed += it.c.wage * it.c.wageShare; nominalUsed += nominalCost(it.c);
    if (it.c.nonEU) nonEU++;
    if (it.c.group) groups.add(it.c.group);
  };
  for (const [pos, need] of Object.entries(ctx.positionNeeds)) {
    for (let k = 0; k < need; k++) {
      const next = ranked.find(r => r.it.c.position === pos && !chosen.includes(r.it) && fits(r.it));
      if (next) take(next.it);
    }
  }
  for (const r of ranked) if (!chosen.includes(r.it) && fits(r.it)) take(r.it);
  return {
    selection: chosen.map(it => it.c.id),
    ranking: ranked.map(r => ({id: r.it.c.id, pointsPerMillion: r.score * 1e6})),
    seenByTheSpreadsheet: {feesUsed, wagesUsed, wageRoom, transferBudget: ctx.transferBudget},
    rules: BASELINE_RULES,
  };
}

/**
 * Exact "Solver-style" baseline: the best subset under a SIMPLIFIED model that a competent analyst
 * could build in a spreadsheet and solve exactly (as Excel Solver does with binary decision cells).
 * The search is exact; only the model is simpler. Its pick is then judged by the full engine.
 *
 * Simplified per-player value (no instalments, sell-on, sale costs, amortisation or diminishing returns):
 *   simple NPV = −(fee + agent fee + signing bonus) at t=0
 *                + Σ_{s ≤ exit} (revenue − wage_s − expected bonus) / (1+r)^s + exit value / (1+r)^exit
 *   simple downside NPV: revenue and exit value cut by the club haircuts (or analyst downside exit value)
 *   points: additive, no diminishing returns within a position
 * Constraints: Σ(fee + agent fee) ≤ transfer budget; Σ wages_s ≤ squad-cost room_s for every season;
 *   Σ nominal cost ≤ lifetime capital − reserve (if set); opening cash − Σ upfront ≥ cash floor + reserve
 *   at signing; min NPV and max loss on the simple NPVs; registrations, needs and exclusive groups.
 */
export const SOLVER_RULES = Object.freeze([
  'Exact best subset (like Excel Solver with binary decision cells) — the search is exact, only the model is simpler.',
  'Per-player NPV with the full fee, agent fee and signing bonus paid at signing; wages (with growth), bonuses and revenue each season; exit value at exit. No instalments, sell-on, sale costs or amortisation.',
  'Wages only (no amortisation) against each season’s squad-cost room; nominal contract cost against lifetime capital less reserve; cash checked at signing only.',
  'Points are additive (no diminishing returns at the same position). Registrations, position needs, exclusive options, minimum NPV and maximum loss on the simplified figures.',
]);

function simpleValues(c, ctx) {
  const r = ctx.discountRate, e = c.exitSeason;
  let npvBase = -(c.fee + c.agentFee + c.signingBonus), npvDown = npvBase, dpts = 0;
  const wages = [];
  for (let s = 1; s <= e; s++) {
    const w = c.wage * (1 + c.wageGrowth) ** (s - 1) * c.wageShare;
    wages.push(w);
    const d = (1 + r) ** s;
    npvBase += (c.revenue - w - c.bonusExpected) / d;
    npvDown += (c.revenue * (1 - ctx.stress.revenueHaircut) - w - c.bonusExpected) / d;
    dpts += c.points / d;
  }
  const exitDown = c.exitValueDownside ?? c.exitValue * (1 - ctx.stress.resaleHaircut);
  npvBase += c.exitValue / (1 + r) ** e;
  npvDown += exitDown / (1 + r) ** e;
  return {npvBase, npvDown, points: c.points * e, dpts, wages};
}

export function solverStyleShortlist(prepared) {
  const {ctx, items} = prepared;
  if (items.length > 20) throw new RangeError('Solver-style baseline limited to 20 candidates');
  const H = ctx.horizon;
  const rows = items.map(it => ({it, v: simpleValues(it.c, ctx), upfront: it.c.fee + it.c.agentFee, nominal: nominalCost(it.c)}));
  const room = Array.from({length: H}, (_, s) => ctx.squadCostLimit[s] - ctx.committedSquadCost[s]);
  const capitalRoom = ctx.lifetimeCapital === null ? Infinity : ctx.lifetimeCapital - ctx.protectedReserve;
  const score = sel => {
    const npv = sel.reduce((a, x) => a + x.v.npvBase, 0), down = sel.reduce((a, x) => a + x.v.npvDown, 0);
    const pts = sel.reduce((a, x) => a + x.v.points, 0), dpts = sel.reduce((a, x) => a + x.v.dpts, 0);
    const primary = ctx.objective === 'npv' ? npv : ctx.objective === 'points' ? pts : ctx.objective === 'downside' ? down : npv + ctx.valuePerPoint * dpts;
    return {primary, secondary: ctx.objective === 'npv' ? pts : npv, npv, down};
  };
  const feasible = sel => {
    if (sel.length > ctx.maxSignings || ctx.currentSquadSize + sel.length > ctx.maxSquadSize) return false;
    if (ctx.currentNonEU + sel.filter(x => x.it.c.nonEU).length > ctx.maxNonEU) return false;
    const groups = sel.map(x => x.it.c.group).filter(Boolean);
    if (new Set(groups).size !== groups.length) return false;
    for (const [pos, n] of Object.entries(ctx.positionNeeds)) if (sel.filter(x => x.it.c.position === pos).length < n) return false;
    const upfront = sel.reduce((a, x) => a + x.upfront, 0);
    if (upfront > ctx.transferBudget) return false;
    if (sel.reduce((a, x) => a + x.nominal, 0) > capitalRoom) return false;
    if (ctx.openingCash - sel.reduce((a, x) => a + x.it.c.fee + x.it.c.agentFee + x.it.c.signingBonus, 0) < ctx.minCash + ctx.protectedReserve) return false;
    for (let s = 0; s < H; s++) if (sel.reduce((a, x) => a + (x.v.wages[s] ?? 0), 0) > room[s]) return false;
    const sc = score(sel);
    if (ctx.minPortfolioNpv !== null && sc.npv < ctx.minPortfolioNpv) return false;
    if (ctx.maxDownsideLoss !== null && sc.down < -ctx.maxDownsideLoss) return false;
    return true;
  };
  let best = null, bestScore = null;
  for (let mask = 0; mask < 2 ** rows.length; mask++) {
    const sel = rows.filter((_, i) => mask & (1 << i));
    if (!feasible(sel)) continue;
    const sc = score(sel);
    if (!best || sc.primary > bestScore.primary + 1e-9 || (Math.abs(sc.primary - bestScore.primary) <= 1e-9 && sc.secondary > bestScore.secondary + 1e-9)) { best = sel; bestScore = sc; }
  }
  return {selection: best ? best.map(x => x.it.c.id) : null, simplifiedObjective: bestScore?.primary ?? null, rules: SOLVER_RULES};
}
