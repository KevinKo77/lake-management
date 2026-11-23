// LANOVA Advantage Lab: costs and commitments, hard constraints (budget, reserve), dominance, strategies, edge cases,
// exports, examples and page guarantees. Cash comes from the published LANOVA Finance engine (no second engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {evaluate, check, optionTotals, optionDecisions, basePlan, markDominance, brief, briefCsv, briefHtml, SCHEMA} from '../lanova/advantage/lab.js';
import {EXAMPLES, blank, newOption} from '../lanova/advantage/examples.js';
import {forecast} from '../lanova/finance/engine/model.js';

const dir = 'lanova/advantage/', read = f => readFileSync(dir + f, 'utf8');
const opt = (id, o) => ({id, name: id, category: '', upfront: 0, upfrontType: 'expense', usefulLifeMonths: null, startMonth: 0, commitmentMonths: 0, monthlyCost: 0, effectMonths: 0, monthlyGain: 0, gainMonths: 12, shortTermScore: 5, longTermScore: 5, risk: 'low', confidence: 'medium', ...o});
const model = (options, f = {}, o = {}) => ({schema: SCHEMA, fictional: true, label: 'Test', sport: 'Handball', structure: 'Test', startMonth: '2027-01', horizonMonths: 12, objective: 'immediate',
  finance: {openingCash: 100_000, annualRevenue: 120_000, annualOperatingCosts: 120_000, minimumCash: 20_000, decisionBudget: 50_000, downsideRevenuePct: 10, ...f}, options, ...o});
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test('one engine: the lab imports only the published Finance engine; the page sends and stores nothing', () => {
  const imports = f => [...read(f).matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
  assert.deepEqual(imports('lab.js'), ['../finance/engine/model.js']); assert.deepEqual(imports('examples.js'), ['./lab.js']); assert.deepEqual(imports('app.js'), ['./lab.js', './examples.js']);
  const all = readdirSync(dir).filter(f => /\.(js|html|css)$/.test(f)).map(read).join('\n');
  assert.doesNotMatch(all, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|sendBeacon|https?:\/\/(?!www\.lakecapitalmanagement)/);
  assert.match(read('index.html'), /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'self'/);
  assert.doesNotMatch(all, / style="/); assert.match(read('index.html'), /<title>LANOVA Advantage Lab<\/title>/); assert.match(read('app.js'), /Discover what your resources could achieve\./);
});

test('costs and commitments: immediate, running within the horizon, after the horizon; gains only when estimable', () => {
  const m = model([]), o = opt('a', {upfront: 10_000, monthlyCost: 1_000, startMonth: 6, commitmentMonths: 12, monthlyGain: 500, effectMonths: 2, gainMonths: 24});
  assert.deepEqual(optionTotals(m, o), {upfront: 10_000, runningInHorizon: 6_000, commitmentsAfterHorizon: 6_000, totalCost: 22_000, gainInHorizon: 2_000, netFinancialInHorizon: -14_000, gainEstimable: true});
  const na = optionTotals(m, {...o, monthlyGain: null}); assert.equal(na.gainInHorizon, null); assert.equal(na.netFinancialInHorizon, null); assert.equal(na.totalCost, 22_000);
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
  const imm = r2.strategies.immediate; if (imm.best.ids.includes('signings')) assert.equal(imm.status, 'insufficient-data');
  const all = Object.values(r2.strategies).every(s => ['indicative', 'close-call', 'insufficient-data'].includes(s.status)); assert.ok(all);
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
  assert.equal(b.options.length, r.options.length); assert.equal(csv.length, r.options.length + 2);
  r.options.forEach((o, i) => { assert.equal(b.options[i].status, o.status); assert.equal(b.options[i].totalCost, o.totals.totalCost); assert.ok(csv[i + 2].startsWith(`"${o.name}","${o.status}",${o.totals.upfront},`)); assert.ok(html.includes(o.name)); });
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
