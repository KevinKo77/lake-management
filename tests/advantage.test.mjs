// LANOVA Advantage Lab: costs and commitments, hard constraints (budget, reserve), dominance, strategies, edge cases,
// exports, examples and page guarantees. Cash comes from the published LANOVA Finance engine (no second engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {evaluate, check, optionTotals, optionDecisions, basePlan, markDominance, brief, briefCsv, briefHtml, financialNotice, FINANCIAL_INCOMPLETE, STRATEGIES, SCHEMA} from '../lanova/advantage/lab.js';
import {EXAMPLES, blank, newOption} from '../lanova/advantage/examples.js';
import {forecast} from '../lanova/finance/engine/model.js';

const dir = 'lanova/advantage/', read = f => readFileSync(dir + f, 'utf8');
const opt = (id, o) => ({id, name: id, category: '', upfront: 0, upfrontType: 'expense', usefulLifeMonths: null, startMonth: 0, commitmentMonths: 0, monthlyCost: 0, effectMonths: 0, monthlyGain: 0, gainMonths: 12, shortTermScore: 5, longTermScore: 5, risk: 'low', confidence: 'medium', ...o});
const model = (options, f = {}, o = {}) => ({schema: SCHEMA, fictional: true, label: 'Test', sport: 'Handball', structure: 'Test', startMonth: '2027-01', horizonMonths: 12, objective: 'immediate',
  finance: {openingCash: 100_000, annualRevenue: 120_000, annualOperatingCosts: 120_000, minimumCash: 20_000, decisionBudget: 50_000, downsideRevenuePct: 10, ...f}, options, ...o});
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test('one engine: the lab imports only the published Finance engine; the page sends and stores nothing', () => {
  const imports = f => [...read(f).matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
  assert.deepEqual(imports('lab.js'), ['../finance/engine/model.js']); assert.deepEqual(imports('examples.js'), ['./lab.js']); assert.deepEqual(imports('app.js'), ['./lab.js', './examples.js', './map.js']); assert.deepEqual(imports('map.js'), ['./lab.js']);
  const all = readdirSync(dir).filter(f => /\.(js|html|css)$/.test(f)).map(read).join('\n');
  assert.doesNotMatch(all, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|sendBeacon|https?:\/\/(?!www\.lakecapitalmanagement)/);
  assert.match(read('index.html'), /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'self'/);
  assert.doesNotMatch(all, / style="/); assert.match(read('index.html'), /<title>LANOVA Advantage Lab<\/title>/); assert.match(read('app.js'), /Discover what your resources could achieve\./);
});

test('costs and commitments: immediate, running within the horizon, after the horizon; gains only when estimable', () => {
  const m = model([]), o = opt('a', {upfront: 10_000, monthlyCost: 1_000, startMonth: 6, commitmentMonths: 12, monthlyGain: 500, effectMonths: 2, gainMonths: 24});
  assert.deepEqual(optionTotals(m, o), {upfront: 10_000, runningInHorizon: 6_000, commitmentsAfterHorizon: 6_000, totalCost: 22_000, gainInHorizon: 2_000, netFinancialInHorizon: -14_000, gainEstimable: true,
    financialStatus: 'complete', gainRangeInHorizon: [2_000, 2_000], netFinancialRange: [-14_000, -14_000], prudentNetInHorizon: -14_000, gainUncertainInHorizon: false});
  const na = optionTotals(m, {...o, monthlyGain: null}); assert.equal(na.gainInHorizon, null); assert.equal(na.netFinancialInHorizon, null); assert.equal(na.totalCost, 22_000);
  assert.equal(na.financialStatus, 'unknown'); assert.equal(na.prudentNetInHorizon, -16_000, 'prudent: costs only, never a zero gain'); assert.equal(na.gainUncertainInHorizon, true);
  const rg = optionTotals(m, {...o, monthlyGain: null, gainRange: {low: 200, high: 800, basis: 'signed sponsor letter'}});
  assert.equal(rg.financialStatus, 'range'); assert.equal(rg.gainInHorizon, null); assert.deepEqual(rg.gainRangeInHorizon, [800, 3_200]); assert.deepEqual(rg.netFinancialRange, [-15_200, -12_800]); assert.equal(rg.prudentNetInHorizon, -15_200);
  assert.equal(optionTotals(m, {...o, startMonth: 11, effectMonths: 3}).gainInHorizon, 0, 'effect after the horizon');
});

test('cash comes from the Finance engine and matches the option terms month by month', () => {
  const o = opt('a', {upfront: 12_000, upfrontType: 'capital', usefulLifeMonths: 60, monthlyCost: 1_000, startMonth: 2, commitmentMonths: 6, monthlyGain: 400, effectMonths: 3, gainMonths: 4});
  const r = evaluate(model([o])), x = r.options[0];
  const want = Array.from({length: 12}, (_, t) => -(t >= 2 ? 12_000 : 0) - 1_000 * Math.max(0, Math.min(t, 7) - 2 + 1) * (t >= 2 ? 1 : 0) + 400 * Math.max(0, Math.min(t, 8) - 5 + 1) * (t >= 5 ? 1 : 0));
  x.delta.base.forEach((v, t) => close(v, want[t], `month ${t + 1}`));
  close(x.closingCashDelta, x.totals.netFinancialInHorizon, 'closing cash change = net financial effect');
  // Downside: revenue −10% applies to the organisation's revenue and to the option's gains.
  close(x.delta.downside.at(-1), x.delta.base.at(-1) - 0.1 * 400 * 4, 'downside gains stressed');
});

test('combinations: summed engine cash changes equal a direct engine run of the combined decisions', () => {
  const m = EXAMPLES.amateur.make(), r = evaluate(m), pick = r.options.filter(o => ['coach', 'youth', 'physio', 'lights'].includes(o.id));
  const decisions = pick.flatMap(o => optionDecisions(m, o.input)); assert.ok(decisions.length <= 12);
  for (const sc of ['base', 'downside']) {
    const direct = forecast(basePlan(m, decisions), {scenario: sc, decisions: decisions.map(d => d.id)}).months.map(x => x.closingCash);
    direct.forEach((v, t) => close(v, r.base[sc][t] + pick.reduce((a, o) => a + o.delta[sc][t], 0), `${sc} month ${t + 1}`));
  }
});

test('hard constraints: budget and minimum reserve make options infeasible, with the reason', () => {
  const r = evaluate(model([opt('big', {upfront: 60_000}), opt('drain', {monthlyCost: 9_000, commitmentMonths: 12}), opt('ok', {upfront: 5_000})]));
  const [big, drain, ok] = r.options;
  assert.equal(big.feasible, false); assert.match(big.reasons[0], /exceeds the budget available/);
  assert.equal(drain.feasible, false); assert.match(drain.reasons[0], /below the minimum reserve \(20,000\)/);
  assert.equal(ok.feasible, true); assert.equal(ok.status, 'frontier');
  for (const s of Object.values(r.strategies)) { assert.ok(s.best.upfront <= 50_000); assert.ok(s.best.minCashBase >= 20_000); assert.ok(!s.best.ids.includes('big') && !s.best.ids.includes('drain')); }
});

test('parameter changes: a higher reserve or a lower budget never makes more options feasible', () => {
  const base = EXAMPLES.semipro.make(), n = m => evaluate(m).options.filter(o => o.feasible).length;
  let prev = Infinity; for (const reserve of [0, 250_000, 400_000, 500_000, 600_000]) { const m = structuredClone(base); m.finance.minimumCash = reserve; const k = n(m); assert.ok(k <= prev, `reserve ${reserve}`); prev = k; }
  prev = Infinity; for (const budget of [1e6, 300_000, 50_000, 10_000, 0]) { const m = structuredClone(base); m.finance.decisionBudget = budget; const k = n(m); assert.ok(k <= prev, `budget ${budget}`); prev = k; }
  const m = structuredClone(base); m.finance.decisionBudget = 0; const r = evaluate(m);
  assert.ok(r.options.every(o => o.feasible === (o.totals.upfront === 0)), 'budget 0: only options without immediate cost');
});

test('dominance: only feasible options on comparable dimensions; missing estimates are not compared', () => {
  const r = evaluate(model([opt('a', {upfront: 5_000, shortTermScore: 6}), opt('b', {upfront: 8_000, shortTermScore: 5}), opt('c', {upfront: 8_000, shortTermScore: 7, risk: 'high'}),
    opt('d', {upfront: 3_000, shortTermScore: null}), opt('e', {upfront: 70_000, shortTermScore: 10})]));
  const s = Object.fromEntries(r.options.map(o => [o.id, o]));
  assert.equal(s.b.status, 'dominated'); assert.deepEqual(s.b.dominatedBy, ['a']);
  assert.equal(s.a.status, 'frontier'); assert.equal(s.c.status, 'frontier', 'better objective, worse risk: not dominated');
  assert.equal(s.d.status, 'not-comparable'); assert.equal(s.e.status, 'infeasible', 'infeasible, never on the frontier');
  // An infeasible option never dominates a feasible one.
  assert.ok(Object.values(s).every(o => !o.dominatedBy.includes('e')));
  // Ties on every dimension: neither dominates.
  const t = markDominance([{name: 'x', feasible: true, contribution: 5, risk: 'low', minCashBase: 1, totals: {totalCost: 1}}, {name: 'y', feasible: true, contribution: 5, risk: 'low', minCashBase: 1, totals: {totalCost: 1}}]);
  assert.ok(t.every(o => o.status === 'frontier'));
});

test('strategies: preferences only after constraints; "do nothing" is a candidate; missing estimates block a categorical answer', () => {
  const r = evaluate(EXAMPLES.amateur.make(), {weights: {security: {short: 0, long: 0, money: 0, security: 1}}});
  const best = r.strategies.security.best;
  const max = Math.max(...[r.baseMinCashDownside, ...r.options.filter(o => o.feasible).map(o => o.minCashDownside)]); assert.ok(best.minCashDownside >= max - 0.01, 'pure security picks the highest downside cash');
  assert.deepEqual(best.options, [], 'here: do nothing');
  const m = EXAMPLES.amateur.make(); m.options[5].shortTermScore = null; const r2 = evaluate(m);
  const imm = r2.strategies.immediate; if (imm.best.ids.includes('signings')) assert.equal(imm.status, 'uncertain');
  const all = Object.values(r2.strategies).every(s => ['indicative', 'close-call', 'uncertain'].includes(s.status)); assert.ok(all);
  const empty = evaluate(model([])); for (const s of Object.values(empty.strategies)) assert.deepEqual(s.best.options, []);
});

test('edge cases: invalid inputs are refused with a reason, never computed', () => {
  const bad = (f, re) => { const m = EXAMPLES.semipro.make(); f(m); const r = evaluate(m); assert.ok(r.problems.length, 'refused'); assert.match(r.problems.join(' | '), re); assert.equal(r.options, undefined); };
  bad(m => { m.options[0].upfront = -1; }, /immediate cost/);
  bad(m => { m.options[0].monthlyCost = -50; }, /running cost/);
  bad(m => { m.finance.decisionBudget = NaN; }, /Budget available/);
  bad(m => { m.finance.minimumCash = null; }, /Minimum cash reserve/);
  bad(m => { m.horizonMonths = 18; }, /12, 24 or 36/);
  bad(m => { m.options[1].shortTermScore = 11; }, /0–10/);
  bad(m => { m.options[2].name = ' '; }, /name required/);
  bad(m => { m.options[2].id = m.options[1].id; }, /unique identifier/);
  bad(m => { m.options[0].startMonth = 24; }, /start month/);
  bad(m => { while (m.options.length < 11) m.options.push(newOption(m.options.length + 1)); }, /At most 10 options/);
  const b = evaluate(blank()); assert.ok(b.problems.length >= 5, 'blank workspace: nothing computed until the figures are entered');
  assert.deepEqual(check(EXAMPLES.pro.make()), []);
});

test('exports: brief JSON, CSV and HTML carry the same figures as the evaluation, with assumptions, limits and missing data', () => {
  const m = EXAMPLES.pro.make(), r = evaluate(m), b = brief(m, r), csv = briefCsv(m, r).trim().split('\r\n'), html = briefHtml(m, r, '2026-11-23');
  assert.equal(b.options.length, r.options.length); assert.equal(csv.length, r.options.length + 3 + 2 + Object.keys(r.strategies).length, 'notice, header, options, blank line, strategy header, strategies');
  r.options.forEach((o, i) => { assert.equal(b.options[i].status, o.status); assert.equal(b.options[i].totalCost, o.totals.totalCost); assert.ok(csv[i + 3].startsWith(`"${o.name}","${o.status}",${o.totals.upfront},`)); assert.ok(html.includes(o.name)); });
  for (const k of ['objective', 'scenariosStudied', 'hardConstraints', 'assumptions', 'limits', 'missingForADecision', 'strategies']) assert.ok(b[k], k);
  assert.ok(b.options.find(o => o.status === 'infeasible').infeasibleBecause.length); assert.ok(b.options.some(o => o.dominatedBy.length));
  assert.match(html, /every figure is invented/); assert.match(html, /not predictions; no probability is given/); assert.doesNotMatch(html, /<script/);
  assert.match(csv[0], /your estimates \(0–10\), not predictions/);
});

test('illustrative examples: anonymous, fictional, three sports and three structures, results calculated not stored', () => {
  const ms = Object.values(EXAMPLES).map(e => e.make());
  assert.equal(new Set(ms.map(m => m.sport)).size, 3); assert.equal(new Set(ms.map(m => m.structure)).size, 3);
  for (const m of ms) { assert.equal(m.fictional, true); assert.match(m.label, /anonymous; all figures invented/); assert.deepEqual(check(m), []); }
  assert.doesNotMatch(read('examples.js'), /status|dominated|feasible|minCash/, 'no pre-written result in the examples');
  const m = EXAMPLES.pro.make(), r1 = evaluate(m); m.finance.minimumCash = 500_000; const r2 = evaluate(m);
  assert.notEqual(r1.options.find(o => o.id === 'centre').status, r2.options.find(o => o.id === 'centre').status, 'changing an input changes the result');
  const b = blank(); assert.equal(b.options.length, 0); assert.equal(b.fictional, false); assert.equal(b.sport, '');
});

test('no feasible plan: when the organisation alone falls below the reserve, nothing is recommended and the reason is stated', () => {
  const m = EXAMPLES.semipro.make(); m.finance.minimumCash = 600_000; const r = evaluate(m);
  assert.ok(r.baseMinCash < 600_000); assert.ok(r.options.every(o => !o.feasible));
  for (const s of Object.values(r.strategies)) { assert.equal(s.status, 'no-feasible'); assert.deepEqual(s.best.options, []); }
  assert.match(briefHtml(m, r), /Even without any option, cash falls below the reserve/);
});

// ------------------------------------------------------------------ P0: missing data is unknown, never an implicit zero
test('missing data: an undocumented option is not penalised; the ranking is flagged uncertain with the estimate needed', () => {
  const two = (a, b) => evaluate(model([opt('documented', {upfront: 5_000, shortTermScore: b}), opt('undocumented', {upfront: 5_000, shortTermScore: a})], {decisionBudget: 5_000}), {weights: {immediate: {short: 1, long: 0, money: 0, security: 0}}}).strategies.immediate;
  // Before the fix, a missing estimate counted as 0 and the documented option always won. Now the unknown spans 0–10:
  // against a documented 4, the undocumented option (midpoint 5) may rank first, and the ranking is reported as uncertain.
  const u = two(null, 4);
  assert.equal(u.status, 'uncertain'); assert.deepEqual(u.best.options, ['undocumented']);
  assert.deepEqual(u.assumptionsNeeded, ['undocumented: immediate contribution']);
  assert.ok(u.best.scoreLow < u.best.score && u.best.score < u.best.scoreHigh, 'range shown');
  // Against a documented 9, the documented option ranks first, and the result is still uncertain: the unknown could be 10.
  const v = two(null, 9); assert.deepEqual(v.best.options, ['documented']); assert.equal(v.status, 'uncertain'); assert.deepEqual(v.contenders.map(c => c.options), [['undocumented']]);
  // Once the estimate is known, the uncertainty disappears and the ranking follows the numbers.
  const k = two(6, 4); assert.notEqual(k.status, 'uncertain'); assert.deepEqual(k.best.options, ['undocumented']); assert.deepEqual(k.contenders, []);
});

test('missing data: estimates no weighted criterion uses do not make a ranking uncertain; complete data is unchanged', () => {
  const r = evaluate(model([opt('a', {upfront: 5_000, longTermScore: null}), opt('b', {upfront: 4_000})]), {weights: {immediate: {short: 1, long: 0, money: 0, security: 0}}});
  assert.notEqual(r.strategies.immediate.status, 'uncertain'); assert.deepEqual(r.strategies.immediate.assumptionsNeeded, []);
  for (const k of Object.keys(EXAMPLES)) for (const s of Object.values(evaluate(EXAMPLES[k].make()).strategies)) {
    assert.notEqual(s.status, 'uncertain', `${k}: complete 0–10 estimates`); assert.deepEqual(s.contenders, []);
    assert.ok(Math.abs(s.best.scoreLow - s.best.score) < 1e-12 && Math.abs(s.best.scoreHigh - s.best.score) < 1e-12, 'point scores');
  }
});

test('missing data in combinations: every combination keeps its unknowns listed, and the brief states what would settle the ranking', () => {
  const m = EXAMPLES.amateur.make(); m.options[5].shortTermScore = null; m.options[0].longTermScore = null; const r = evaluate(m), b = brief(m, r);
  const imm = r.strategies.immediate; assert.equal(imm.status, 'uncertain');
  assert.ok(imm.assumptionsNeeded.includes('Two experienced players (expenses paid): immediate contribution'));
  const label = Object.keys(b.strategies).find(x => /immediate/.test(x)); assert.deepEqual(b.strategies[label].estimatesNeededToSettle, imm.assumptionsNeeded);
  assert.match(briefHtml(m, r), /Uncertain — depends on missing estimates/); assert.match(briefHtml(m, r), /Needed to settle:/);
  assert.match(b.assumptions.join(' '), /treated as unknown, not as zero/);
  // Financial gains that are not estimable are excluded and listed, not guessed.
  const p = evaluate(EXAMPLES.pro.make()); assert.ok(Object.values(p.strategies).some(s => s.unboundedGains.includes('Data and decision-support department')));
});

// ------------------------------------------------------------------ P0 corrective: financial gains that are not estimable
// Reproducible case: two options, both feasible, sporting estimates known for both, "do nothing" available. Option B's
// financial gain is not estimable. Before the fix, B counted for its costs only and the ranking read "indicative" or
// "close call": the unknown gain was silently treated as no gain.
const gainCase = (gainB = null, extra = {}) => model([
  opt('a', {name: 'Option A', upfront: 10_000, monthlyCost: 500, commitmentMonths: 12, monthlyGain: 1_000, gainMonths: 12, shortTermScore: 6, longTermScore: 5}),
  opt('b', {name: 'Option B', upfront: 12_000, monthlyCost: 800, commitmentMonths: 12, monthlyGain: gainB, gainMonths: 12, shortTermScore: 7, longTermScore: 5, ...extra}),
]);

test('P0 · an unknown gain is never a zero gain: every strategy that weighs money or cash reads "Financial comparison incomplete"', () => {
  const m = gainCase(), r = evaluate(m);
  assert.deepEqual(r.problems, []);
  assert.ok(r.options.every(o => o.feasible), 'both options are financially feasible');
  for (const [k, s] of Object.entries(r.strategies)) {
    assert.ok(s.candidates >= 3, `${k}: do nothing, A, B (and A + B) are candidates`);
    assert.equal(s.status, 'financial-incomplete', `${k}: the ranking must not look settled`);
    assert.ok(s.financial.incomplete); assert.match(s.financial.reasons.join(' '), /not estimable/);
    assert.deepEqual(s.financial.optionsWithUnknownGain.map(x => x.name), ['Option B'], `${k}: B is named, selected or not`);
    assert.ok(s.unboundedGains.includes('Option B'));
  }
  // B is named even where it is neither selected nor the alternative.
  const roles = Object.values(r.strategies).map(s => s.financial.optionsWithUnknownGain[0].role);
  assert.ok(roles.every(x => ['in the best combination', 'in the alternative', 'feasible, not selected'].includes(x)));
  // Prudent cash is kept: B's cash change has no gain in it, and its net effect is costs only, labelled as such.
  const b = r.options.find(o => o.id === 'b');
  assert.equal(b.totals.financialStatus, 'unknown'); assert.equal(b.totals.netFinancialInHorizon, null); assert.equal(b.totals.prudentNetInHorizon, -(12_000 + 800 * 12));
  close(b.closingCashDelta, -(12_000 + 800 * 12), 'cash change of B = its costs only (prudent)');
  assert.match(b.warnings.join(' '), /not estimable: the cash figures exclude it \(prudent cash\)/);
  // Not dominated because of a cash figure that leaves its gain out.
  assert.notEqual(b.status, 'dominated');
});

test('P0 · the same case with every gain known is computed as before (no false alarm); a gain after the horizon changes nothing', () => {
  for (const g of [0, 300, 2_000]) {
    const r = evaluate(gainCase(g));
    assert.deepEqual(r.financial.optionsWithUnknownGain, []); assert.equal(financialNotice(r), null);
    for (const s of Object.values(r.strategies)) { assert.notEqual(s.status, 'financial-incomplete'); assert.equal(s.financial.incomplete, false); }
  }
  // With different known gains, the ranking can change: the unknown really could have changed it.
  const low = evaluate(gainCase(0)).strategies.security.best.options, high = evaluate(gainCase(5_000)).strategies.security.best.options;
  assert.notDeepEqual(low, high, 'B\'s gain decides the security strategy');
  // An unknown gain that would only start after the horizon cannot change these figures: no warning.
  const late = evaluate(gainCase(null, {effectMonths: 12}));
  assert.deepEqual(late.financial.optionsWithUnknownGain, []);
  for (const s of Object.values(late.strategies)) assert.notEqual(s.status, 'financial-incomplete');
});

test('P0 · a strategy that weighs neither money nor cash is not flagged, but the notice still says the cash leaves the gain out', () => {
  const m = gainCase(), r = evaluate(m, {weights: {immediate: {short: 1, long: 0, money: 0, security: 0}}});
  assert.notEqual(r.strategies.immediate.status, 'financial-incomplete'); assert.equal(r.strategies.development.status, 'financial-incomplete');
  const r2 = evaluate(m, {weights: Object.fromEntries(Object.keys(STRATEGIES).map(k => [k, {short: 1, long: 0, money: 0, security: 0}]))});
  for (const s of Object.values(r2.strategies)) assert.notEqual(s.status, 'financial-incomplete');
  const n = financialNotice(r2); assert.equal(n.incomplete, false); assert.match(n.text, /Option B is not estimable and is left out of the cash figures \(prudent cash\)/);
});

test('P0 · an option excluded by the reserve without its unknown gain is named: its gain could make it feasible', () => {
  // C alone breaks the reserve on costs; its gain is unknown, so the exclusion itself is uncertain.
  const m = model([opt('a', {name: 'Option A', upfront: 5_000, shortTermScore: 5}), opt('c', {name: 'Option C', upfront: 0, monthlyCost: 8_000, commitmentMonths: 12, monthlyGain: null, gainMonths: 12, shortTermScore: 9})],
    {minimumCash: 40_000});
  const r = evaluate(m), c = r.options.find(o => o.id === 'c');
  assert.equal(c.feasible, false); assert.equal(c.couldBecomeFeasible, true);
  const w = {short: 1, long: 0, money: 0, security: 0};
  const s = evaluate(m, {weights: {immediate: w, development: w, security: w}}).strategies.immediate;
  assert.equal(s.status, 'financial-incomplete', 'even a strategy that ignores money: the unknown gain decides feasibility');
  assert.deepEqual(s.financial.optionsWithUnknownGain, [{name: 'Option C', role: 'not feasible without its gain; the gain could make it feasible'}]);
});

test('P0 · a documented gain range: validated, prudent cash at its low end, ranking reads both ends, no fabricated figure', () => {
  const range = (low, high, basis = 'two signed sponsor offers') => ({gainRange: {low, high, basis}});
  // Validation: both ends, in order, with a source; a range is only used when there is no single figure.
  assert.match(check(gainCase(null, {gainRange: {low: 900, high: 100, basis: 'x'}})).join(' '), /lowest documented gain must not exceed the highest/);
  assert.match(check(gainCase(null, {gainRange: {low: 100, high: 900, basis: ' '}})).join(' '), /a range is not a guess/);
  assert.match(check(gainCase(500, range(100, 900))).join(' '), /only when the gain per month is not a single figure/);
  const r = evaluate(gainCase(null, range(400, 1_600))), b = r.options.find(o => o.id === 'b');
  assert.deepEqual(r.problems, []); assert.equal(b.totals.financialStatus, 'range'); assert.deepEqual(r.financial.optionsWithGainRange, ['Option B']);
  assert.deepEqual(b.totals.netFinancialRange, [400 * 12 - 21_600, 1_600 * 12 - 21_600]);
  close(b.closingCashDelta, 400 * 12 - 21_600, 'cash uses the low end of the range');
  // A range is bounded: the comparison is complete, and it is uncertain only if the two ends could reorder the ranking.
  for (const s of Object.values(r.strategies)) { assert.notEqual(s.status, 'financial-incomplete'); assert.deepEqual(s.unboundedGains, []); }
  assert.ok(Object.values(r.strategies).some(s => s.status === 'uncertain' && s.assumptionsNeeded.some(x => /Option B: financial gain within its documented range/.test(x))));
  // A range of zero width is the same as the known figure.
  const point = evaluate(gainCase(null, range(1_000, 1_000))), known = evaluate(gainCase(1_000));
  for (const k of Object.keys(STRATEGIES)) { assert.deepEqual(point.strategies[k].best.options, known.strategies[k].best.options); assert.equal(point.strategies[k].status, known.strategies[k].status); }
  // A long option name still gives valid Finance engine decisions (labels are at most 80 characters).
  assert.deepEqual(evaluate(gainCase(null, {name: 'A very long option name that describes a whole programme in detail', ...range(400, 1_600)})).problems, []);
  const bj = brief(gainCase(null, range(400, 1_600)), r).options[1];
  assert.deepEqual(bj.gainRangePerMonth, [400, 1_600]); assert.equal(bj.gainRangeBasis, 'two signed sponsor offers'); assert.equal(bj.financialStatus, 'range');
});

test('P0 · consistency: the interface notice, the brief (JSON), the HTML export and the CSV export name the same options', () => {
  for (const m of [gainCase(), EXAMPLES.semipro.make(), EXAMPLES.pro.make()]) {
    const r = evaluate(m), n = financialNotice(r), b = brief(m, r), html = briefHtml(m, r, '2026-11-23'), csv = briefCsv(m, r).split('\r\n');
    assert.ok(n.incomplete); assert.equal(n.title, FINANCIAL_INCOMPLETE);
    const names = r.financial.optionsWithUnknownGain; assert.ok(names.length);
    // JSON
    assert.equal(b.financialComparison.status, 'incomplete'); assert.equal(b.financialComparison.warning, n.text); assert.deepEqual(b.financialComparison.optionsWithUnknownGain, names);
    for (const [k, s] of Object.entries(r.strategies)) {
      const bs = b.strategies[STRATEGIES[k].label];
      assert.equal(bs.status, s.status); assert.equal(bs.financialComparison, s.financial.incomplete ? FINANCIAL_INCOMPLETE : 'complete');
      assert.deepEqual(bs.optionsWithUnknownGain.map(x => x.name), names, 'every option concerned, in every strategy');
    }
    // HTML
    const esc = x => x.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
    assert.ok(html.includes(`<p class="warn" id="financial-notice"><b>${FINANCIAL_INCOMPLETE}.</b> ${esc(n.text)}</p>`));
    assert.ok(html.includes(`${FINANCIAL_INCOMPLETE} — a gain that is not estimable could change the ranking`));
    for (const x of names) assert.ok(html.includes(`Gain not estimable: ${esc(x)}`) || html.includes(`; ${esc(x)} (`), x);
    // CSV: a warning line, a financial status per option, and the reading per strategy
    assert.equal(csv[1], `"WARNING — ${n.text.replace(/"/g, '""')}"`);
    for (const x of names) assert.ok(csv.find(l => l.startsWith(`"${x}",`)).endsWith('"gain not estimable: excluded from cash (prudent)"'), x);
    for (const k of r.financial.strategiesAffected) assert.ok(csv.some(l => l.startsWith(`"${STRATEGIES[k].label}","${FINANCIAL_INCOMPLETE} — `) && names.every(x => l.includes(x))), k);
  }
  // With complete data, no warning anywhere.
  const m = EXAMPLES.amateur.make(), r = evaluate(m);
  assert.equal(financialNotice(r), null); assert.equal(brief(m, r).financialComparison.status, 'complete');
  assert.doesNotMatch(briefHtml(m, r) + briefCsv(m, r), /id="financial-notice"|WARNING —|a gain that is not estimable could change the ranking/);
});
