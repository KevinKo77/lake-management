/** Deterministic EUR cash-flow model. No sporting predictions or market marks. */
export const MODEL_VERSION = '2.0';
export const defaults = Object.freeze({
  capital: 150000, revenue: 450000, growth: 0.08, share: 0.15, years: 5,
  cost: 3000, discount: 0.15, cap: 2.5, upfrontFee: 0, paymentDelay: 0,
  collectionRate: 1, probabilities: Object.freeze([0.3, 0.5, 0.2]),
  multipliers: Object.freeze([0.35, 1, 1.7]),
});
const ranges = {
  capital: [1, 1e9], revenue: [0, 1e9], growth: [-0.99, 2], share: [0, 1],
  years: [1, 20], cost: [0, 1e9], discount: [0, 2], cap: [0, 100],
  upfrontFee: [0, 1e9], paymentDelay: [0, 5], collectionRate: [0, 1],
};
const fail = message => { throw new RangeError(message); };

/** Optional v2 fields default explicitly, preserving v1 economics. Unknown fields discarded. */
export function normalizeModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid model');
  const model = {};
  for (const key of Object.keys(ranges)) model[key] = input[key] === undefined && ['upfrontFee', 'paymentDelay', 'collectionRate'].includes(key) ? defaults[key] : input[key];
  model.probabilities = Array.isArray(input.probabilities) ? [...input.probabilities] : input.probabilities;
  model.multipliers = input.multipliers === undefined ? [...defaults.multipliers] : Array.isArray(input.multipliers) ? [...input.multipliers] : input.multipliers;
  validate(model);
  const probabilitySum = model.probabilities.reduce((a, b) => a + b, 0);
  model.probabilities = model.probabilities.map(p => p / probabilitySum);
  return model;
}
export function validate(model) {
  if (!model || typeof model !== 'object') fail('Invalid model');
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = model[key] === undefined && ['upfrontFee', 'paymentDelay', 'collectionRate'].includes(key) ? defaults[key] : model[key];
    if (!Number.isFinite(value) || value < min || value > max) fail(`${key} : expected value between ${min} and ${max}`);
  }
  if (!Number.isInteger(model.years) || !Number.isInteger(model.paymentDelay ?? 0)) fail('Horizon and delay: whole years required');
  const p = model.probabilities;
  if (!Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x) || x < 0 || x > 1) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-8) fail('Probabilities must total 100%');
  const multipliers = model.multipliers === undefined ? defaults.multipliers : model.multipliers;
  if (!Array.isArray(multipliers) || multipliers.length !== 3 || multipliers.some(x => !Number.isFinite(x) || x < 0 || x > 10) || multipliers[0] > multipliers[1] || multipliers[1] > multipliers[2]) fail('Scenario factors: three ascending values between 0 and 10');
  return model;
}
function checkFlows(flows) {
  if (!Array.isArray(flows) || flows.length < 2 || flows.some(x => !Number.isFinite(x))) fail('Finite cash flows required, at least two periods');
}
export function npv(flows, rate) {
  checkFlows(flows);
  if (!Number.isFinite(rate) || rate <= -1) fail('Discount rate must exceed −100%');
  return discounted(flows, flows.map((_, i) => i), Math.log1p(rate));
}
function discounted(flows, times, logRate) {
  // Skip zeros to avoid 0 * Infinity at extreme negative rates.
  return flows.reduce((sum, cash, i) => sum + (cash === 0 ? 0 : cash * Math.exp(-times[i] * logRate)), 0);
}
function solveIrr(flows, times) {
  checkFlows(flows);
  if (flows[0] >= 0 || flows.slice(1).some(x => x < 0)) fail('IRR: initial outlay followed by non-negative cash flows required; non-conventional flows unsupported');
  if (!flows.slice(1).some(x => x > 0)) return null;
  // Solve in log(1+r), supporting roots much nearer −100% than the v1 bound.
  let lo = -700, hi = 700;
  if (discounted(flows, times, lo) < 0 || discounted(flows, times, hi) > 0) return null;
  for (let i = 0; i < 180; i++) {
    const mid = (lo + hi) / 2;
    if (discounted(flows, times, mid) > 0) lo = mid; else hi = mid;
  }
  const result = Math.expm1((lo + hi) / 2);
  return Number.isFinite(result) && result > -1 ? result : null;
}
export function irr(flows) { checkFlows(flows); return solveIrr(flows, flows.map((_, i) => i)); }
export function dateEpoch(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('ISO date YYYY-MM-DD required');
  const value = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) fail('Invalid date');
  return value;
}
function datedTimes(flows, dates) {
  checkFlows(flows);
  if (!Array.isArray(dates) || dates.length !== flows.length) fail('One date per cash flow required');
  const epochs = dates.map(dateEpoch);
  if (epochs.some((d, i) => i > 0 && d <= epochs[i - 1])) fail('Distinct strictly increasing dates required');
  return epochs.map(t => (t - epochs[0]) / (365 * 86400000));
}
export function xnpv(flows, dates, rate) {
  const times = datedTimes(flows, dates);
  if (!Number.isFinite(rate) || rate <= -1) fail('Invalid rate');
  return discounted(flows, times, Math.log1p(rate));
}
export function xirr(flows, dates) { return solveIrr(flows, datedTimes(flows, dates)); }

export function scenario(input, multiplier = 1) {
  const model = normalizeModel(input);
  if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 10) fail('Invalid scenario factor');
  const outlay = model.capital + model.upfrontFee;
  const flows = Array(model.years + model.paymentDelay + 1).fill(0);
  flows[0] = -outlay;
  let gross = 0;
  const rows = [];
  for (let year = 1; year <= model.years; year++) {
    const revenue = model.revenue * multiplier * (1 + model.growth) ** (year - 1);
    const entitlement = Math.min(revenue * model.share, Math.max(0, model.capital * model.cap - gross));
    gross += entitlement;
    const collected = entitlement * model.collectionRate;
    const fee = Math.min(collected, model.cost);
    const distribution = collected - fee;
    const paymentYear = year + model.paymentDelay;
    flows[paymentYear] = distribution;
    rows.push({year, paymentYear, revenue, entitlement, collected, fee, distribution});
  }
  const proceeds = flows.slice(1).reduce((a, b) => a + b, 0);
  const presentValue = npv([0, ...flows.slice(1)], model.discount);
  return {
    flows, rows, outlay, proceeds, presentValue, moic: proceeds / outlay,
    npv: presentValue - outlay, irr: irr(flows), loss: Math.max(0, outlay - proceeds),
    payback: payback(flows), discountedPayback: payback(flows, model.discount),
  };
}
/** First whole year of cumulative recovery; no invented within-year interpolation. */
export function payback(flows, rate = 0) {
  checkFlows(flows);
  if (!Number.isFinite(rate) || rate <= -1) fail('Invalid rate');
  let cumulative = flows[0];
  for (let i = 1; i < flows.length; i++) {
    cumulative += flows[i] / (1 + rate) ** i;
    if (cumulative >= -1e-8) return i;
  }
  return null;
}
export function analyze(input) {
  const model = normalizeModel(input);
  const cases = model.multipliers.map(x => scenario(model, x));
  const expectedFlows = cases[0].flows.map((_, i) => cases.reduce((s, c, j) => s + c.flows[i] * model.probabilities[j], 0));
  const outlay = cases[0].outlay;
  expectedFlows[0] = -outlay;
  const presentValue = npv([0, ...expectedFlows.slice(1)], model.discount);
  const expectedNpv = presentValue - outlay;
  return {
    cases, expectedFlows, outlay, presentValue, expectedNpv,
    profitabilityIndex: presentValue / outlay,
    expectedMoic: cases.reduce((s, c, i) => s + c.moic * model.probabilities[i], 0),
    weightedFlowIrr: irr(expectedFlows),
    lossProbability: cases.reduce((s, c, i) => s + (c.proceeds + 1e-8 < outlay ? model.probabilities[i] : 0), 0),
    expectedLoss: cases.reduce((s, c, i) => s + c.loss * model.probabilities[i], 0),
  };
}
export function risk(input) {
  const model = normalizeModel(input), a = analyze(model);
  const components = [
    {name: 'Downside scenario capital loss', weight: 0.5, value: a.cases[0].loss / a.outlay * 100},
    {name: 'Weight of loss scenarios', weight: 0.3, value: a.lossProbability * 100},
    {name: 'Contract horizon + payment delay', weight: 0.2, value: Math.min(100, (model.years + model.paymentDelay) / 10 * 100)},
  ];
  return {score: components.reduce((s, c) => s + c.value * c.weight, 0), components};
}
/** Reprice all scenarios; discount/revenue effects are never linearized. */
export function sensitivity(input) {
  const m = normalizeModel(input);
  const revenueFactors = [0.5, 0.75, 1, 1.25, 1.5];
  const discountRates = [...new Set([Math.max(0, m.discount - 0.1), Math.max(0, m.discount - 0.05), m.discount, Math.min(2, m.discount + 0.05), Math.min(2, m.discount + 0.1)])];
  return {revenueFactors, discountRates, values: revenueFactors.map(f => discountRates.map(d => analyze({...m, revenue: Math.min(1e9, m.revenue * f), discount: d}).expectedNpv))};
}
export function breakEvenRevenue(input) {
  const model = normalizeModel(input);
  if (analyze({...model, revenue: 0}).expectedNpv >= 0) return 0;
  // Keep all terms fixed, including capital-based cap. Return null if not reachable
  // within the documented model domain; never report an infinite/fictional target.
  let lo = 0, hi = 1e9;
  if (analyze({...model, revenue: hi}).expectedNpv < 0) return null;
  for (let i = 0; i < 75; i++) {
    const mid = (lo + hi) / 2;
    if (analyze({...model, revenue: mid}).expectedNpv >= 0) hi = mid; else lo = mid;
  }
  return hi;
}
function exposureGroups(positions, key, invested) {
  const groups = new Map();
  for (const p of positions) {
    const label = key(p);
    groups.set(label, (groups.get(label) ?? 0) + normalizeModel(p.model).capital + normalizeModel(p.model).upfrontFee);
  }
  return [...groups].map(([name, amount]) => ({name, amount, weight: invested ? amount / invested : 0})).sort((a, b) => b.amount - a.amount);
}
export function portfolio(positions, budget, profiles = []) {
  if (!Number.isFinite(budget) || budget <= 0 || budget > 1e10 || !Array.isArray(positions)) fail('Budget ou positions invalids');
  let invested = 0, expectedValue = 0, expectedNpv = 0;
  const buckets = [0, 0, 0], annual = [], weightedFlows = [];
  const lookup = new Map(profiles.map(a => [a.id, a]));
  for (const p of positions) {
    const model = normalizeModel(p.model), a = analyze(model);
    invested += a.outlay; expectedValue += a.outlay * a.expectedMoic; expectedNpv += a.expectedNpv;
    a.cases.forEach((c, i) => { buckets[i] += c.proceeds; });
    a.expectedFlows.forEach((cash, i) => { weightedFlows[i] = (weightedFlows[i] ?? 0) + cash; });
    a.cases.forEach((c, j) => c.flows.slice(1).forEach((cash, i) => {
      annual[i] ??= {year: i + 1, cases: [0, 0, 0]}; annual[i].cases[j] += cash;
    }));
  }
  const byAthlete = exposureGroups(positions, p => p.athleteId, invested);
  const byCountry = exposureGroups(positions, p => lookup.get(p.athleteId)?.country ?? 'Not provided', invested);
  const byMaturity = exposureGroups(positions, p => {
    const m = normalizeModel(p.model), y = m.years + m.paymentDelay;
    return y <= 3 ? '1–3 ans' : y <= 5 ? '4–5 ans' : '6–25 ans';
  }, invested);
  const hhi = byAthlete.reduce((s, a) => s + a.weight ** 2, 0);
  return {
    invested, cash: budget - invested, expectedValue, expectedNpv, buckets, annual,
    weightedFlows, weightedFlowIrr: positions.length ? irr(weightedFlows) : null,
    concentration: byAthlete[0]?.weight ?? 0, topThree: byAthlete.slice(0, 3).reduce((s, a) => s + a.weight, 0),
    hhi, effectiveNames: hhi ? 1 / hhi : 0, byAthlete, byCountry, byMaturity,
    largestNameCapital: byAthlete[0]?.amount ?? 0,
  };
}
/** Comparison is between independently saved assumptions, never inferred athlete returns. */
export function compareOpportunities(opportunities, sort = 'npv', options = {}) {
  const rows = opportunities.map(o => {
    const originalModel = normalizeModel(o.model);
    const model = options.discountRate === undefined ? originalModel : normalizeModel({...originalModel, discount: options.discountRate});
    const a = analyze(model), r = risk(model);
    return {id: o.id, label: o.label, athleteId: o.athleteId, originalDiscount: originalModel.discount, model, analysis: a, risk: r};
  });
  const selectors = {npv: r => r.analysis.expectedNpv, efficiency: r => r.analysis.profitabilityIndex, downside: r => r.analysis.cases[0].moic, risk: r => -r.risk.score, capital: r => -r.analysis.outlay};
  if (!selectors[sort]) fail('Tri de comparaison inconnu');
  return rows.sort((a, b) => selectors[sort](b) - selectors[sort](a) || a.label.localeCompare(b.label));
}

/** Standalone deterministic collection and timing stresses, not probability forecasts. */
export function portfolioStresses(positions, budget) {
  const definitions = [
    {id: 'base', label: 'Saved assumptions', patch: m => m},
    {id: 'collection', label: 'Collection rate halved', patch: m => ({...m, collectionRate: m.collectionRate * 0.5})},
    {id: 'delay', label: 'Payment delay +1 year (maximum 5)', patch: m => ({...m, paymentDelay: Math.min(5, m.paymentDelay + 1)})},
    {id: 'combined', label: 'Collection halved and delay +1 (maximum 5)', patch: m => ({...m, collectionRate: m.collectionRate * 0.5, paymentDelay: Math.min(5, m.paymentDelay + 1)})},
  ];
  return definitions.map(d => {
    const stressed = positions.map(p => ({...p, model: d.patch(normalizeModel(p.model))}));
    const result = portfolio(stressed, budget);
    return {id: d.id, label: d.label, expectedNpv: result.expectedNpv, expectedDistributions: result.expectedValue, downsideDistributions: result.buckets[0]};
  });
}

