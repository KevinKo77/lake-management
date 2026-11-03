/**
 * LANOVA Recruitment Optimizer V2 — per-player contract economics.
 *
 * Pure, deterministic, no I/O. Every number a club decision depends on is
 * produced here, from explicit analyst inputs, on a documented timeline:
 *
 *   t = 0            signing date (start of season 1)
 *   t = s - 1        start of season s: transfer-fee instalment s, signing-bonus part s
 *   t = s            end of season s: wages, expected bonuses and attributable revenue
 *                    of season s; sale proceeds when the player leaves after season s
 *
 * Accounting view (what a squad-cost limit is measured on) follows the usual
 * football treatment: transfer fee + agent fee are capitalised as registration
 * rights and amortised straight-line over the contract; wages, bonuses and the
 * signing bonus are expensed in the season they relate to; a sale books a
 * profit/loss on disposal against net book value.
 *
 * Nothing here predicts sporting outcomes. `points` is the analyst's (or
 * scouting model's) expected league points added per season.
 */
import {npv} from '../../src/finance.js';

export const ENGINE_VERSION = 'recruitment-v2.0';
export const POSITIONS = Object.freeze(['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST']);
export const DEAL_TYPES = Object.freeze(['permanent', 'free', 'loan']);
export const MAX_CONTRACT_YEARS = 6;

const fail = message => { throw new RangeError(message); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const MONEY_MAX = 1e9;

/** Canonical candidate with explicit defaults; unknown fields are dropped. */
export function normalizeCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Candidate must be an object');
  const dealType = input.dealType ?? 'permanent';
  const contractYears = input.contractYears;
  const c = {
    id: String(input.id ?? '').trim(),
    name: String(input.name ?? '').trim(),
    position: input.position,
    age: input.age ?? null,
    nonEU: Boolean(input.nonEU),
    dealType,
    fee: input.fee ?? 0,
    instalments: Array.isArray(input.instalments) ? [...input.instalments] : [1],
    agentFee: input.agentFee ?? 0,
    signingBonus: input.signingBonus ?? 0,
    contractYears,
    wage: input.wage,
    wageGrowth: input.wageGrowth ?? 0,
    wageShare: dealType === 'loan' ? (input.wageShare ?? 1) : 1,
    bonusExpected: input.bonusExpected ?? 0,
    revenue: input.revenue ?? 0,
    points: input.points ?? 0,
    exitSeason: dealType === 'loan' ? contractYears : (input.exitSeason ?? contractYears),
    exitValue: dealType === 'loan' ? 0 : (input.exitValue ?? 0),
    exitValueDownside: dealType === 'loan' ? 0 : (input.exitValueDownside ?? null),
    exitValueUpside: dealType === 'loan' ? 0 : (input.exitValueUpside ?? null),
    sellOnPct: dealType === 'permanent' ? (input.sellOnPct ?? 0) : 0,
    saleCostPct: dealType === 'loan' ? 0 : (input.saleCostPct ?? 0),
    // Obligations that survive an early departure (exit before the contract ends).
    signingBonusOnExit: input.signingBonusOnExit ?? 'payable',
    releaseCompensationPct: dealType === 'loan' ? 0 : (input.releaseCompensationPct ?? 1),
    group: input.group ? String(input.group) : null,
    notes: input.notes ? String(input.notes).slice(0, 500) : '',
  };
  validateCandidate(c);
  return c;
}

export function validateCandidate(c) {
  const where = c.name || c.id || 'candidate';
  const need = (ok, message) => { if (!ok) fail(`${where}: ${message}`); };
  need(c.id.length > 0 && c.id.length <= 64, 'id required (≤64 characters)');
  need(c.name.length > 0 && c.name.length <= 90, 'name required (≤90 characters)');
  need(POSITIONS.includes(c.position), `position must be one of ${POSITIONS.join(', ')}`);
  need(DEAL_TYPES.includes(c.dealType), `deal type must be one of ${DEAL_TYPES.join(', ')}`);
  need(c.age === null || finite(c.age, 15, 45), 'age must be 15–45');
  need(Number.isInteger(c.contractYears) && c.contractYears >= 1 && c.contractYears <= MAX_CONTRACT_YEARS, `contract length must be 1–${MAX_CONTRACT_YEARS} whole seasons`);
  for (const key of ['fee', 'agentFee', 'signingBonus', 'wage', 'bonusExpected', 'revenue', 'exitValue']) need(finite(c[key], 0, MONEY_MAX), `${key} must be between 0 and ${MONEY_MAX}`);
  need(c.exitValueDownside === null || finite(c.exitValueDownside, 0, MONEY_MAX), 'downside exit value must be ≥ 0');
  need(c.exitValueDownside === null || c.exitValueDownside <= c.exitValue, 'downside exit value cannot exceed base exit value');
  need(c.exitValueUpside === null || (finite(c.exitValueUpside, 0, MONEY_MAX) && c.exitValueUpside >= c.exitValue), 'upside exit value must be at least the base exit value');
  need(finite(c.wageGrowth, -0.5, 1), 'wage growth must be between −50% and 100% a season');
  need(finite(c.wageShare, 0, 1), 'loan wage share must be 0–100%');
  // Non-negative by design: it keeps the optimizer's diminishing-returns bound valid, and a
  // signing expected to cost points is not a recruitment candidate.
  need(finite(c.points, 0, 50), 'expected points added per season must be between 0 and 50');
  need(finite(c.sellOnPct, 0, 1) && finite(c.saleCostPct, 0, 1), 'sell-on and sale-cost percentages must be 0–100%');
  need(Number.isInteger(c.exitSeason) && c.exitSeason >= 1 && c.exitSeason <= c.contractYears, 'exit season must be within the contract');
  need(['payable', 'lapses'].includes(c.signingBonusOnExit), 'unpaid signing bonus on early exit must be payable or lapses');
  need(finite(c.releaseCompensationPct, 0, 1), 'release compensation must be 0–100% of remaining wages');
  if (c.dealType === 'free') need(c.fee === 0, 'a free transfer has no transfer fee');
  if (c.dealType === 'permanent') {
    const k = c.instalments;
    need(k.length >= 1 && k.length <= c.contractYears && k.every(x => finite(x, 0, 1)), 'instalments: one share per season, within the contract');
    need(Math.abs(k.reduce((a, b) => a + b, 0) - 1) <= 1e-6, 'instalment shares must total 100%');
  }
  return c;
}

/** Downside exit value: analyst override, else the club-level resale haircut. */
export function downsideExitValue(c, stress) {
  return c.exitValueDownside ?? c.exitValue * (1 - stress.resaleHaircut);
}

/** Upside exit value: analyst override, else the club-level resale uplift. */
export function upsideExitValue(c, stress) {
  return c.exitValueUpside ?? c.exitValue * (1 + stress.upsideResale);
}

function saleProceeds(c, grossExit) {
  if (c.dealType === 'loan' || grossExit === 0) return {gross: grossExit, sellOn: 0, saleCost: 0, net: grossExit};
  const sellOn = c.sellOnPct * Math.max(0, grossExit - c.fee);
  const saleCost = c.saleCostPct * grossExit;
  return {gross: grossExit, sellOn, saleCost, net: grossExit - sellOn - saleCost};
}

/**
 * Full schedule for one candidate. Arrays are indexed by t (cash) or by
 * season-1 (accounting); `length` covers the latest dated obligation, which can
 * be after the player's exit (unpaid instalments remain owed after a sale).
 */
export function economics(input, context) {
  const c = normalizeCandidate(input);
  const stress = context.stress;
  const rate = context.discountRate;
  const e = c.exitSeason;
  const instalmentSeasons = c.dealType === 'permanent' ? c.instalments.length : 1;
  const T = Math.max(e, instalmentSeasons - 1, 1);
  const zeros = () => Array(T + 1).fill(0);
  const outflows = {fee: zeros(), agent: zeros(), signing: zeros(), wages: zeros(), bonus: zeros(), exit: zeros()};
  const inflows = {revenue: zeros(), sale: zeros()};

  // Start-of-season payments.
  if (c.dealType === 'permanent') c.instalments.forEach((share, k) => { outflows.fee[k] += c.fee * share; });
  else outflows.fee[0] += c.fee; // loan fee (free transfer: 0)
  outflows.agent[0] += c.agentFee;
  const signingPart = c.signingBonus / c.contractYears;
  for (let s = 1; s <= e; s++) outflows.signing[s - 1] += signingPart;

  // In-season flows, booked at season end.
  const wages = [];
  for (let s = 1; s <= e; s++) {
    const w = c.wage * (1 + c.wageGrowth) ** (s - 1) * c.wageShare;
    wages.push(w);
    outflows.wages[s] += w;
    outflows.bonus[s] += c.bonusExpected;
    inflows.revenue[s] += c.revenue;
  }
  const isSale = c.dealType !== 'loan' && c.exitValue > 0;
  // Early departure (exit before contract end). Obligations that survive it are paid at the exit date t = e:
  //  - unpaid signing-bonus instalments, unless the contract says they lapse (default: payable, conservative);
  //  - on a release WITHOUT a sale, compensation = releaseCompensationPct × remaining contracted wages
  //    (default 100%: the contract is paid out). On a sale the buying club takes over the wages.
  // Loans always run to the end of the loan, so neither applies.
  const remainingSeasons = c.contractYears - e;
  const acceleratedSigningBonus = remainingSeasons > 0 && c.signingBonusOnExit === 'payable' ? signingPart * remainingSeasons : 0;
  let remainingWages = 0;
  for (let s = e + 1; s <= c.contractYears; s++) remainingWages += c.wage * (1 + c.wageGrowth) ** (s - 1) * c.wageShare;
  const releaseCompensation = remainingSeasons > 0 && !isSale && c.dealType !== 'loan' ? c.releaseCompensationPct * remainingWages : 0;
  outflows.exit[e] += acceleratedSigningBonus + releaseCompensation;
  const baseSale = saleProceeds(c, isSale ? c.exitValue : 0);
  const downSale = saleProceeds(c, isSale ? downsideExitValue(c, stress) : 0);
  const upSale = saleProceeds(c, isSale ? upsideExitValue(c, stress) : 0);
  inflows.sale[e] += baseSale.net;

  const totalOut = t => outflows.fee[t] + outflows.agent[t] + outflows.signing[t] + outflows.wages[t] + outflows.bonus[t] + outflows.exit[t];
  const base = zeros().map((_, t) => inflows.revenue[t] + inflows.sale[t] - totalOut(t));
  const downside = zeros().map((_, t) => inflows.revenue[t] * (1 - stress.revenueHaircut) + (t === e ? downSale.net : 0) - totalOut(t));
  // Upside: revenue and resale raised; every cost line unchanged (reported, never relied on by constraints).
  const upside = zeros().map((_, t) => inflows.revenue[t] * (1 + stress.upsideRevenue) + (t === e ? upSale.net : 0) - totalOut(t));

  // Accounting: amortisation and squad cost by season (index s-1).
  const capitalised = c.dealType === 'loan' ? 0 : c.fee + c.agentFee;
  const annualAmortisation = capitalised / c.contractYears;
  const loanExpense = c.dealType === 'loan' ? (c.fee + c.agentFee) / c.contractYears : 0;
  const amortisation = [], squadCost = [], pnl = [], pnlDownside = [];
  for (let s = 1; s <= T; s++) {
    const present = s <= e;
    const a = present ? annualAmortisation : 0;
    // Exit obligations are expensed in the exit season (and count towards that season's squad cost).
    const cost = present ? wages[s - 1] + c.bonusExpected + signingPart + a + loanExpense + (s === e ? acceleratedSigningBonus + releaseCompensation : 0) : 0;
    amortisation.push(a);
    squadCost.push(cost);
    const revenue = present ? c.revenue : 0;
    pnl.push(revenue - cost);
    pnlDownside.push(revenue * (1 - stress.revenueHaircut) - cost);
  }
  const netBookValueAtExit = capitalised - annualAmortisation * e;
  const disposalBase = isSale ? baseSale.net - netBookValueAtExit : 0;
  const disposalDown = isSale ? downSale.net - netBookValueAtExit : 0;
  // Unamortised cost written off when the player leaves early without a fee.
  const writeOff = !isSale && c.dealType !== 'loan' ? netBookValueAtExit : 0;
  pnl[e - 1] += disposalBase - writeOff;
  pnlDownside[e - 1] += disposalDown - writeOff;

  const pointsBySeason = Array.from({length: e}, () => c.points);
  const discountedPoints = pointsBySeason.reduce((sum, p, i) => sum + p / (1 + rate) ** (i + 1), 0);
  const grossCommitment = outflows.fee.reduce((a, b) => a + b, 0) + c.agentFee + signingPart * e + wages.reduce((a, b) => a + b, 0) + c.bonusExpected * e + acceleratedSigningBonus + releaseCompensation;

  return {
    id: c.id, candidate: c, T, exitSeason: e,
    cash: {base, downside, upside},
    components: {outflows, inflows},
    upfrontOutlay: outflows.fee[0] + outflows.agent[0] + outflows.signing[0],
    wages, amortisation, squadCost, pnl, pnlDownside,
    capitalised, annualAmortisation, netBookValueAtExit,
    sale: {base: baseSale, downside: downSale, upside: upSale, profitOnDisposal: disposalBase, profitOnDisposalDownside: disposalDown, writeOff},
    npv: npv(base, rate), npvDownside: npv(downside, rate), npvUpside: npv(upside, rate),
    pointsBySeason, totalPoints: c.points * e, discountedPoints,
    grossCommitment,
    exitObligations: {acceleratedSigningBonus, releaseCompensation, remainingWages},
  };
}

/** Club planning context with explicit defaults and per-season arrays of length `horizon`. */
export function normalizeContext(input) {
  if (!input || typeof input !== 'object') fail('Club context required');
  const H = input.horizon;
  if (!Number.isInteger(H) || H < 1 || H > MAX_CONTRACT_YEARS) fail(`Planning horizon must be 1–${MAX_CONTRACT_YEARS} seasons`);
  const series = (key, fallback) => {
    const v = input[key] ?? fallback;
    const arr = Array.isArray(v) ? [...v] : Array(H).fill(v);
    if (arr.length !== H || arr.some(x => !finite(x, -MONEY_MAX, MONEY_MAX))) fail(`${key}: one finite value per planning season required`);
    return arr;
  };
  const ctx = {
    horizon: H,
    discountRate: input.discountRate ?? 0.1,
    transferBudget: input.transferBudget,
    squadCostLimit: series('squadCostLimit'),
    committedSquadCost: series('committedSquadCost', 0),
    openingCash: input.openingCash ?? 0,
    operatingCashFlow: series('operatingCashFlow', 0),
    minCash: input.minCash ?? 0,
    protectedReserve: input.protectedReserve ?? 0,
    lifetimeCapital: input.lifetimeCapital ?? null,
    maxDownsideLoss: input.maxDownsideLoss ?? null,
    currentSquadSize: input.currentSquadSize ?? 0,
    maxSquadSize: input.maxSquadSize ?? 25,
    currentNonEU: input.currentNonEU ?? 0,
    maxNonEU: input.maxNonEU ?? 3,
    maxSignings: input.maxSignings ?? 5,
    positionNeeds: {...(input.positionNeeds ?? {})},
    objective: input.objective ?? 'blended',
    valuePerPoint: input.valuePerPoint ?? 0,
    samePositionFactor: input.samePositionFactor ?? 0.5,
    minPortfolioNpv: input.minPortfolioNpv ?? null,
    stress: {
      resaleHaircut: input.stress?.resaleHaircut ?? 0.5, revenueHaircut: input.stress?.revenueHaircut ?? 0.3,
      upsideResale: input.stress?.upsideResale ?? 0.2, upsideRevenue: input.stress?.upsideRevenue ?? 0.2,
    },
  };
  const need = (ok, message) => { if (!ok) fail(message); };
  need(finite(ctx.discountRate, 0, 1), 'Discount rate must be 0–100%');
  need(finite(ctx.transferBudget, 0, MONEY_MAX), 'Transfer budget must be ≥ 0');
  need(ctx.squadCostLimit.every(x => x >= 0) && ctx.committedSquadCost.every(x => x >= 0), 'Squad-cost limit and committed squad cost must be ≥ 0');
  need(finite(ctx.openingCash, -MONEY_MAX, MONEY_MAX) && finite(ctx.minCash, -MONEY_MAX, MONEY_MAX), 'Opening cash and cash floor must be finite');
  for (const key of ['currentSquadSize', 'maxSquadSize', 'currentNonEU', 'maxNonEU', 'maxSignings']) need(Number.isInteger(ctx[key]) && ctx[key] >= 0 && ctx[key] <= 60, `${key} must be a whole number 0–60`);
  need(['npv', 'blended', 'points', 'downside'].includes(ctx.objective), 'Objective must be npv, blended, points or downside');
  need(finite(ctx.protectedReserve, 0, MONEY_MAX), 'Protected cash reserve must be ≥ 0');
  need(ctx.lifetimeCapital === null || finite(ctx.lifetimeCapital, 0, MONEY_MAX), 'Lifetime capital must be ≥ 0 or empty');
  need(ctx.lifetimeCapital === null || ctx.protectedReserve <= ctx.lifetimeCapital, 'Protected reserve cannot exceed lifetime capital');
  need(ctx.maxDownsideLoss === null || finite(ctx.maxDownsideLoss, 0, MONEY_MAX), 'Maximum downside loss must be ≥ 0 or empty');
  need(finite(ctx.valuePerPoint, 0, 1e8), 'Value per point must be ≥ 0');
  need(finite(ctx.samePositionFactor, 0, 1), 'Same-position factor must be 0–1');
  need(ctx.minPortfolioNpv === null || finite(ctx.minPortfolioNpv, -MONEY_MAX, MONEY_MAX), 'Minimum portfolio NPV must be finite or empty');
  need(finite(ctx.stress.resaleHaircut, 0, 1) && finite(ctx.stress.revenueHaircut, 0, 1), 'Stress haircuts must be 0–100%');
  need(finite(ctx.stress.upsideResale, 0, 2) && finite(ctx.stress.upsideRevenue, 0, 2), 'Upside uplifts must be 0–200%');
  for (const [pos, n] of Object.entries(ctx.positionNeeds)) need(POSITIONS.includes(pos) && Number.isInteger(n) && n >= 0 && n <= 10, `Position need ${pos}: whole number 0–10`);
  return ctx;
}
