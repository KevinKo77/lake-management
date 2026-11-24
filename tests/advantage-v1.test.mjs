// LANOVA Advantage Lab V1: scenarios, signings and payroll, instalments, structural constraints, the combination
// search, sensitivity and break-even analysis, project files and the board brief. Where possible, each result is
// compared with an independent reference: a closed-form calculation written here, an independent enumeration of the
// combinations, or a direct run of the Finance engine on the whole combination.
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate, check, migrate, prepare, basePlan, combinationCash, directCombination, scenarioResults, structureProblems, brief, briefHtml, SCHEMA, SCHEMA_V0, MAX_OPTIONS} from '../lanova/advantage/lab.js';
import {requiredRevenue, maxAffordableCost, assumptionThresholds, preferenceThresholds, influence, analyse, budgetChange, NOT_DETERMINABLE} from '../lanova/advantage/sensitivity.js';
import {exportProject, importProject, MAX_BYTES} from '../lanova/advantage/project.js';
import {EXAMPLES, WORKED} from '../lanova/advantage/examples.js';

const close = (a, b, msg, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const P = o => ({id: 'p', name: 'P', category: '', kind: 'project', upfront: 0, upfrontType: 'expense', usefulLifeMonths: null, instalments: 1, instalmentEveryMonths: 1, startMonth: 0, monthlyCost: 0, costType: 'operating',
  commitmentMonths: 0, effectMonths: 0, monthlyGain: 0, gainMonths: 12, shortTermScore: 5, longTermScore: 5, risk: 'low', confidence: 'medium', mandatory: false, requires: [], exclusiveGroup: '', ...o});
const SG = o => P({kind: 'signing', transferFee: 0, feeInstalments: 1, agentFee: 0, signingBonus: 0, contractMonths: 12, monthlyWage: 0, employerChargeRate: 0, ...o});
const zero = {revenuePct: 0, operatingPct: 0, wagePct: 0, fromMonth: 0};
const M = (options, f = {}, {downside = zero, upside = zero, mustHold = false, H = 12} = {}) => ({schema: SCHEMA, fictional: true, asOf: '2026-11-24', label: 'Test', sport: 'Handball', structure: 'Test', startMonth: '2027-01', horizonMonths: H,
  currency: 'EUR', objective: 'immediate', finance: {openingCash: 100_000, annualRevenue: 120_000, annualOperatingCosts: 120_000, staffCosts: 60_000, minimumCash: 20_000, decisionBudget: 50_000, ...f},
  scenarios: {downside: {...zero, ...downside}, upside: {...zero, ...upside}}, constraints: {downsideMustHold: mustHold}, options});
const subsets = n => Array.from({length: 1 << n}, (_, mask) => Array.from({length: n}, (_, i) => i).filter(i => mask & (1 << i)));

// ------------------------------------------------------------------ schema
test('v0 → v1 migration: the same Finance engine inputs (so the same results); v1 is required otherwise', () => {
  const v0 = {schema: SCHEMA_V0, fictional: true, label: 'x', sport: 'x', structure: 'x', startMonth: '2027-01', horizonMonths: 12, currency: 'EUR', objective: 'immediate',
    finance: {openingCash: 1, annualRevenue: 120_000, annualOperatingCosts: 100_000, minimumCash: 0, decisionBudget: 0, downsideRevenuePct: 15}, options: [{id: 'a', name: 'A', upfront: 0}]};
  const v1 = migrate(v0);
  assert.equal(v1.schema, SCHEMA); assert.equal(v1.finance.staffCosts, null); assert.equal('downsideRevenuePct' in v1.finance, false);
  assert.deepEqual(v1.scenarios, {downside: {revenuePct: -15, operatingPct: 0, wagePct: 0, fromMonth: 0}, upside: zero}); assert.deepEqual(v1.constraints, {downsideMustHold: false});
  assert.deepEqual(v1.options[0], {kind: 'project', costType: 'operating', mandatory: false, requires: [], exclusiveGroup: '', instalments: 1, instalmentEveryMonths: 1, id: 'a', name: 'A', upfront: 0});
  // The engine plan: a v0 downside was revenue × (1 − 15%) from the first month, costs unchanged; the upside equalled the base case.
  const plan = basePlan(v1), sc = id => plan.scenarios.find(s => s.id === id);
  for (const f of Object.values(sc('downside').revenueFactors)) close(f, 0.85, 'downside revenue factor');
  assert.deepEqual(Object.values(sc('downside').costFactors), [1, 1, 1]); assert.equal(sc('downside').fromMonth, 0);
  for (const id of ['base', 'upside']) { assert.ok(Object.values(sc(id).revenueFactors).every(f => f === 1)); assert.ok(Object.values(sc(id).costFactors).every(f => f === 1)); }
  assert.deepEqual(plan.lines.map(l => [l.category, l.values[0]]), [['other_revenue', 10_000], ['operating', 100_000 / 12]], 'staff not split: one operating line, as in v0');
  assert.match(check({...M([]), schema: 'lanova-advantage-v9'}).join(' '), /lanova-advantage-v1 required/);
});

// ------------------------------------------------------------------ scenarios (independent closed forms)
test('scenario activation: each lever changes the budget only from its month, by the stated percentage', () => {
  const rev = 120_000, ops = 120_000, staff = 60_000;
  const r = evaluate(M([], {}, {downside: {revenuePct: -10, fromMonth: 6}, upside: {operatingPct: 5, wagePct: 10, fromMonth: 3}}));
  assert.deepEqual(r.problems, []);
  r.base.base.forEach((b, t) => {
    close(r.base.downside[t], b - 0.10 * rev / 12 * Math.max(0, t - 5), `downside month ${t + 1}`);
    close(r.base.upside[t], b - (0.05 * (ops - staff) / 12 + 0.10 * staff / 12) * Math.max(0, t - 2), `upside month ${t + 1}`);
  });
  // Base case: opening cash + (revenue − costs) per month; here revenue = costs.
  r.base.base.forEach(v => close(v, 100_000, 'base flat'));
  // A wage change needs the staff costs: a missing figure is never zero.
  assert.match(check(M([], {staffCosts: null}, {downside: {wagePct: 5}})).join(' '), /wage change needs the staff costs/);
  assert.deepEqual(check(M([], {staffCosts: null}, {downside: {revenuePct: -5}})), []);
});

test('signing: fee instalments, agent fee, signing bonus at signing, wages and charges; bonus paid before a wage scenario is not scaled', () => {
  const s = SG({id: 'sig', name: 'Signing', startMonth: 2, transferFee: 24_000, feeInstalments: 2, agentFee: 3_000, signingBonus: 6_000, contractMonths: 12, monthlyWage: 4_000, employerChargeRate: 0.25});
  const m = M([s], {decisionBudget: 100_000}, {H: 24, downside: {wagePct: 10, fromMonth: 6}, upside: {wagePct: 10, fromMonth: 1}});
  const r = evaluate(m); assert.deepEqual(r.problems, []);
  const o = r.options[0];
  // Independent month-by-month cash out (base): instalments at months 2 and 14, agent fee and bonus at signing, wages × 1.25 for months 2–13.
  const out = t => (t === 2 ? 12_000 + 3_000 + 6_000 : 0) + (t === 14 ? 12_000 : 0) + (t >= 2 && t <= 13 ? 4_000 * 1.25 : 0);
  let cum = 0; o.delta.base.forEach((d, t) => { cum += out(t); close(d, -cum, `base cash change, month ${t + 1}`); });
  // Downside: wages (and charges) +10% from month 6; the bonus and fees paid in month 2 are not scaled.
  cum = 0; o.delta.downside.forEach((d, t) => { cum += out(t) + (t >= 6 && t <= 13 ? 4_000 * 1.25 * 0.10 : 0); close(d, -cum, `downside cash change, month ${t + 1}`); });
  // Upside (wages +10% from month 1): the bonus is paid after the activation month, so it is scaled too (the engine's rule).
  close(o.delta.upside[2] - o.delta.base[2], -(6_000 * 0.10 + 4_000 * 1.25 * 0.10), 'upside, signing month: bonus and wage scaled');
  // Totals and budget: committed one-off amounts = fee + agent + bonus; running cost = wage with charges.
  assert.equal(o.totals.upfront, 33_000); close(o.totals.runningInHorizon, 12 * 5_000, 'running in horizon');
  // The combination cash equals a direct engine run of the whole plan, in every scenario.
  const d = directCombination(m, ['sig']); for (const k of ['base', 'downside', 'upside']) combinationCash(r, ['sig'])[k].forEach((v, t) => close(v, d[k][t], `${k} month ${t + 1}`));
});

test('instalments: capital and expensed immediate costs paid on schedule, adding up to the cent; a schedule past the horizon is refused', () => {
  const cap = P({id: 'cap', name: 'Capital', upfront: 9_000.01, upfrontType: 'capital', usefulLifeMonths: 60, instalments: 3, instalmentEveryMonths: 3, startMonth: 1});
  const exp = P({id: 'exp', name: 'Expense', upfront: 9_000.01, instalments: 3, instalmentEveryMonths: 3, startMonth: 1, monthlyCost: 100, commitmentMonths: 6});
  for (const [o, run] of [[cap, 0], [exp, 100]]) {
    const r = evaluate(M([o])); assert.deepEqual(r.problems, []);
    const pay = {1: 3_000, 4: 3_000, 7: 3_000.01};
    let cum = 0; r.options[0].delta.base.forEach((d, t) => { cum += (pay[t] ?? 0) + (t >= 1 && t <= 6 ? run : 0); close(d, -cum, `${o.id} month ${t + 1}`, 0.005); });
  }
  assert.match(check(M([P({upfront: 10, instalments: 4, instalmentEveryMonths: 6})])).join(' '), /last instalment of the immediate cost falls after the horizon/);
});

test('reconciliation: combination cash = one Finance engine run of the whole combination, for every combination of every example, in all scenarios', () => {
  let checked = 0;
  for (const m of [...Object.values(EXAMPLES).map(e => e.make()), WORKED.make()]) {
    const r = evaluate(m); assert.deepEqual(r.problems, []);
    for (const s of subsets(r.options.length)) {
      const ids = s.map(i => r.options[i].id), d = directCombination(m, ids);
      if (!d) continue; // more than 12 Finance decisions: the engine's plan limit
      const c = combinationCash(r, ids);
      for (const k of ['base', 'downside', 'upside']) c[k].forEach((v, t) => close(v, d[k][t], `${m.label} ${ids.join('+')} ${k} ${t}`));
      checked++;
    }
  }
  assert.ok(checked > 300, `${checked} combinations reconciled`);
});

// ------------------------------------------------------------------ structure and search
test('structural constraints: unknown or self dependencies, cycles and impossible configurations are rejected', () => {
  const p = (id, o = {}) => P({id, name: id.toUpperCase(), ...o});
  assert.match(check(M([p('a', {requires: ['a']})])).join(' '), /cannot require itself/);
  assert.match(check(M([p('a', {requires: ['zz']})])).join(' '), /requires an unknown option/);
  assert.match(check(M([p('a', {requires: ['b']}), p('b', {requires: ['a']})])).join(' '), /Circular dependency: [AB] → [AB] → [AB]/);
  assert.match(check(M([p('a', {requires: ['b']}), p('b', {requires: ['c']}), p('c', {requires: ['a']})])).join(' '), /Circular dependency/);
  assert.match(check(M([p('a', {requires: ['b', 'c']}), p('b', {exclusiveGroup: 'g'}), p('c', {exclusiveGroup: 'G'})])).join(' '), /A can never be chosen: it needs both B and C, which are mutually exclusive/);
  assert.match(check(M([p('a', {requires: ['b']}), p('b', {exclusiveGroup: 'g'}), p('c', {exclusiveGroup: 'g', mandatory: true}), p('d', {mandatory: true, requires: ['a']})])).join(' '), /mandatory decisions cannot all be met/);
  assert.deepEqual(structureProblems([p('a', {requires: ['b']}), p('b'), p('c', {exclusiveGroup: 'g'}), p('d', {exclusiveGroup: 'g'})]), []);
  assert.ok(evaluate(M([p('a', {requires: ['a']})])).problems.length, 'evaluate refuses to compute');
});

/** Independent enumeration: structural rules, budget and reserve(s) on direct engine runs of each subset. */
function bruteForce(m) {
  const mm = prepare(m), opts = mm.options, f = mm.finance, budgetOk = o => (o.kind === 'signing' ? o.transferFee + o.agentFee + o.signingBonus : o.upfront) <= f.decisionBudget + 0.005;
  const pool = opts.filter(budgetOk), out = {feasible: [], structure: 0, budget: 0, reserve: 0, downside: 0};
  for (const s of subsets(pool.length)) {
    const set = s.map(i => pool[i]), ids = set.map(o => o.id), has = id => ids.includes(id);
    const groups = set.map(o => o.exclusiveGroup.trim().toLowerCase()).filter(Boolean);
    if (opts.some(o => o.mandatory && !has(o.id)) || set.some(o => o.requires.some(x => !has(x))) || new Set(groups).size !== groups.length) { out.structure++; continue; }
    if (set.reduce((a, o) => a + (o.kind === 'signing' ? o.transferFee + o.agentFee + o.signingBonus : o.upfront), 0) > f.decisionBudget + 0.005) { out.budget++; continue; }
    const d = directCombination(m, ids);
    if (Math.min(...d.base) < f.minimumCash - 0.005) { out.reserve++; continue; }
    if (mm.constraints.downsideMustHold && Math.min(...d.downside) < f.minimumCash - 0.005) { out.downside++; continue; }
    out.feasible.push(ids.slice().sort().join('+'));
  }
  return out;
}
test('combination search: mandatory, dependencies, exclusive groups, budget and reserve(s) — same feasible set as an independent enumeration', () => {
  const base = WORKED.make();
  for (const variant of [base, {...base, constraints: {downsideMustHold: true}}, {...base, finance: {...base.finance, decisionBudget: 300_000}}]) {
    const r = evaluate(variant), want = bruteForce(variant);
    for (const [k, s] of Object.entries(r.strategies)) {
      assert.equal(s.candidates, want.feasible.length, `${k}: number of feasible combinations`);
      assert.deepEqual(s.rejectedCounts, {structure: want.structure, budget: want.budget, reserve: want.reserve, downside: want.downside}, `${k}: exclusions by cause`);
      if (s.status !== 'no-feasible') {
        assert.ok(want.feasible.includes(s.best.ids.slice().sort().join('+')), `${k}: best is feasible`);
        assert.ok(s.best.ids.includes('licence'), 'mandatory option in the recommendation');
        assert.ok(!(s.best.ids.includes('keeper-a') && s.best.ids.includes('keeper-b')), 'never both goalkeepers');
        assert.ok(!s.best.ids.includes('academy') || s.best.ids.includes('pitch'), 'academy only with the pitch');
        if (variant.constraints.downsideMustHold) assert.ok(s.best.holdsDownside, 'holds in the downside when required');
      }
    }
  }
});

test('impossible decisions are reported, not guessed: mandatory option over budget, or a plan that breaks the reserve on its own', () => {
  const r = evaluate(M([P({id: 'm', name: 'Must', mandatory: true, upfront: 60_000})]));
  for (const s of Object.values(r.strategies)) { assert.equal(s.status, 'no-feasible'); assert.match(s.noFeasibleReason, /mandatory decisions \(Must\) cannot be met/); }
  const r2 = evaluate(M([P({id: 'a', name: 'A', upfront: 1})], {annualOperatingCosts: 240_000, staffCosts: 60_000}));
  for (const s of Object.values(r2.strategies)) assert.match(s.noFeasibleReason, /Even without any option, month-end cash falls below the reserve/);
});

test('why the alternative ranks lower, and combinations ruled out although preferred, are stated', () => {
  const r = evaluate(WORKED.make()), s = r.strategies.immediate;
  assert.ok(s.why.length && s.why.every(x => x.weighted > 0)); assert.deepEqual(s.why.map(x => x.criterion), ['short']);
  assert.ok(s.rejectedBest.some(x => x.ids.includes('striker') && /below the reserve/.test(x.because)), 'the striker combination is preferred but breaks the reserve');
  const x = scenarioResults(r, s.best.ids);
  assert.ok(x.withinBudget); assert.equal(x.scenarios.base.meetsReserve, true); close(x.scenarios.base.headroom, x.scenarios.base.lowest - 600_000, 'headroom');
});

// ------------------------------------------------------------------ sensitivity (independent closed forms)
test('required revenue (base): equals the closed form max_t (reserve − cash_t)/(t+1), and is verified around the threshold', () => {
  const m = WORKED.make(), top = evaluate(m).strategies.immediate.rejectedBest[0];
  const x = requiredRevenue(m, top.ids, 'base'), c = directCombination(m, top.ids).base;
  const ref = Math.max(0, ...c.map((v, t) => (600_000 - v) / (t + 1)));
  assert.ok(x.determinable && !x.met); close(x.value, ref, 'additional revenue per month', 1.01);
  assert.ok(x.verification.atThreshold >= -0.005 && x.verification.belowThreshold < 0, 'meets at the threshold, not just below it');
});

test('required revenue (downside): the scenario factor from its activation month is applied to the added revenue (closed form)', () => {
  const o = P({id: 'big', name: 'Big', upfront: 40_000, monthlyCost: 2_000, commitmentMonths: 12});
  const m = M([o], {}, {downside: {revenuePct: -20, fromMonth: 4}});
  const x = requiredRevenue(m, ['big'], 'downside'), c = directCombination(m, ['big']).downside;
  const coef = t => Math.min(t + 1, 4) + 0.8 * Math.max(0, t + 1 - 4), ref = Math.max(0, ...c.map((v, t) => (20_000 - v) / coef(t)));
  assert.ok(x.determinable); close(x.value, ref, 'additional revenue per month (downside)', 1.01);
  // Over budget: revenue cannot fix it.
  const y = requiredRevenue(M([P({id: 'x', name: 'X', upfront: 60_000})]), ['x'], 'base');
  assert.equal(y.determinable, false); assert.ok(y.reason.startsWith(NOT_DETERMINABLE));
});

test('maximum affordable cost: equals min(budget left, cost + min over months from the payment of (cash − reserve)) (closed form)', () => {
  const a = P({id: 'a', name: 'A', upfront: 10_000, startMonth: 3}), b = P({id: 'b', name: 'B', upfront: 5_000, monthlyCost: 1_000, commitmentMonths: 12});
  for (const [budget, binding] of [[200_000, 'cash reserve'], [30_000, 'budget']]) {
    const m = M([a, b], {decisionBudget: budget}), x = maxAffordableCost(m, ['a', 'b'], 'a'), c = directCombination(m, ['a', 'b']).base;
    const reserveMax = 10_000 + Math.min(...c.slice(3).map(v => v - 20_000)), ref = Math.min(budget - 5_000, reserveMax);
    assert.ok(x.determinable); assert.equal(x.binding, binding); close(x.value, ref, `max cost (budget ${budget})`, 101);
  }
});

test('breaking point of budgeted revenue: equals the closed form; budget changes carry into every scenario', () => {
  const m = WORKED.make(), ids = evaluate(m).strategies.immediate.best.ids, rev = m.finance.annualRevenue;
  const c = directCombination(m, ids).base, ref = Math.max(...c.map((v, t) => (600_000 - v) / (rev / 12 * (t + 1)))) * 100;
  const t = assumptionThresholds(m, ids).items.find(x => x.lever === 'revenuePct');
  assert.ok(t.determinable && t.reached); close(t.value, ref, 'revenue threshold (%)', 0.06);
  const lower = budgetChange(m, 'revenuePct', -10);
  assert.equal(lower.finance.annualRevenue, rev * 0.9); assert.equal(budgetChange(m, 'wagePct', 10).finance.staffCosts, m.finance.staffCosts * 1.1);
  close(budgetChange(m, 'wagePct', 10).finance.annualOperatingCosts, m.finance.annualOperatingCosts + m.finance.staffCosts * 0.1, 'operating costs include the staff change');
});

test('gain at which another option enters the recommendation: verified by re-evaluation on both sides of the threshold; an unknown gain is never zero', () => {
  const m = WORKED.make(), p = preferenceThresholds(m, 'immediate');
  const striker = p.items.find(x => x.optionId === 'striker');
  assert.equal(striker.gainStatus, 'unknown'); assert.equal(striker.currentGain, null); assert.match(striker.explanation, /not estimable today, would have to be at least/);
  const inBest = g => evaluate({...m, options: m.options.map(o => (o.id === 'striker' ? {...o, monthlyGain: g} : o))}, {only: 'immediate'}).strategies.immediate.best.ids.includes('striker');
  assert.equal(inBest(striker.value), true); assert.equal(inBest(striker.value - striker.tolerance * 1.01), false);
  // Thresholds never treat an unknown gain as zero.
  const th = assumptionThresholds(m, ['licence', 'striker']).items.find(x => x.lever === 'striker:monthlyGain');
  assert.equal(th.determinable, false); assert.match(th.reason, /never counted as zero/);
});

test('influence: one-at-a-time engine recalculations, largest first; unknown gains are listed as not tested', () => {
  const m = WORKED.make(), x = influence(m, 'development');
  assert.ok(x.items.length >= 5); assert.ok(x.items.every((a, i) => i === 0 || x.items[i - 1].magnitude >= a.magnitude));
  const rev = x.items.find(a => a.label.startsWith('Budgeted revenue'));
  const ids = x.ids, direct = budget => Math.min(...directCombination(budgetChange(m, 'revenuePct', budget), ids).base) - Math.min(...directCombination(m, ids).base);
  close(rev.effects[0].base, direct(-5), 'revenue −5% effect on lowest cash'); close(rev.effects[1].base, direct(5), 'revenue +5% effect on lowest cash');
  const all = influence(WORKED.make(), 'immediate'); assert.equal(all.ids.includes('striker'), false);
  const a = analyse(m, 'development'); assert.ok(a.influence.excluded.some(e => /Academy programme.*not estimable/.test(e)) || a.ids.every(id => id !== 'academy'));
});

test('not determinable: a threshold is never invented when the inputs cannot identify it', () => {
  const m = M([P({id: 'a', name: 'A', upfront: 10_000, monthlyCost: 9_000, commitmentMonths: 12})], {decisionBudget: 50_000});
  const x = maxAffordableCost(m, ['a'], 'a'); // breaks the reserve even at zero immediate cost
  assert.equal(x.determinable, false); assert.ok(x.reason.startsWith(NOT_DETERMINABLE));
  const t = assumptionThresholds(M([P({id: 'a', name: 'A'})]), ['a']).items.find(i => i.lever === 'operatingPct');
  assert.equal(t.reached, true, 'a reachable threshold is found'); assert.ok(t.value > 0);
});

// ------------------------------------------------------------------ project files
test('project files: export → import round trip gives the same model and results; strict rejection of anything else', () => {
  for (const m of [...Object.values(EXAMPLES).map(e => e.make()), WORKED.make()]) {
    const r = importProject(exportProject(m, {origin: 'example'}));
    assert.ok(r.ok, JSON.stringify(r.errors)); assert.deepEqual(r.model, JSON.parse(JSON.stringify(r.model)));
    const a = evaluate(m), b = evaluate(r.model);
    assert.deepEqual(Object.values(b.strategies).map(s => s.best.ids), Object.values(a.strategies).map(s => s.best.ids)); assert.deepEqual(b.base, a.base);
  }
  const good = JSON.parse(exportProject(WORKED.make()));
  const bad = (mut, re) => { const f = structuredClone(good); mut(f); const r = importProject(JSON.stringify(f)); assert.equal(r.ok, false); assert.match(r.errors.join(' '), re); };
  bad(f => { f.extra = 1; }, /file\.extra: unknown field/);
  bad(f => { f.model.options[0].script = '<x>'; }, /options\[0\]\.script: unknown field/);
  bad(f => { f.version = 2; }, /newer version/);
  bad(f => { f.format = 'other'; }, /not an Advantage Lab project/);
  bad(f => { f.model.options[0].upfront = -5; }, /Invalid input/);
  bad(f => { f.model.currency = 'USD'; }, /EUR is the only currency/);
  const proto = JSON.stringify(good).replace('"options":[{', '"options":[{"__proto__":{"polluted":1},');
  assert.equal(importProject(proto).ok, false); assert.equal(({}).polluted, undefined, 'no prototype pollution');
  assert.equal(importProject('not json').ok, false); assert.equal(importProject('x'.repeat(MAX_BYTES + 1)).ok, false);
  // A v0 model in a project file is converted, and the user is told.
  const v0 = {...good, model: {schema: SCHEMA_V0, fictional: true, label: 'Old', sport: 'x', structure: 'x', startMonth: '2027-01', horizonMonths: 12, currency: 'EUR', objective: 'immediate',
    finance: {openingCash: 10, annualRevenue: 0, annualOperatingCosts: 0, minimumCash: 0, decisionBudget: 0, downsideRevenuePct: 5}, options: []}};
  const r0 = importProject(JSON.stringify(v0)); assert.ok(r0.ok); assert.match(r0.notes.join(' '), /previous format \(v0\).*converted/); assert.equal(r0.model.scenarios.downside.revenuePct, -5);
  assert.equal(JSON.parse(exportProject({...WORKED.make(), fictional: false})).dataNotice, 'Entered by the user — not verified by LANOVA');
});

// ------------------------------------------------------------------ brief and performance
test('board brief: scenarios, constraints, cash by scenario, why not the alternatives, sensitivity thresholds, print styles', () => {
  const m = WORKED.make(), r = evaluate(m), a = analyse(m, 'immediate'), b = brief(m, r, {sensitivity: a}), html = briefHtml(m, r, '2026-11-24', {sensitivity: a});
  assert.equal(b.schema, 'lanova-advantage-brief-v1'); assert.equal(b.dataOrigin, 'Illustrative example — every figure is invented');
  assert.ok(b.structuralConstraints.some(x => /^Mandatory: Medical room/.test(x)) && b.structuralConstraints.some(x => /Academy programme .* requires Artificial training pitch/.test(x)) && b.structuralConstraints.some(x => /At most one of \(group "goalkeeper"\)/.test(x)));
  const s = b.strategies['Maximise estimated immediate benefits'];
  assert.deepEqual(Object.keys(s.cashByScenario), ['base', 'downside', 'upside']); assert.ok(s.ruledOutByConstraints.length && s.alternativeRanksLowerOn.length);
  assert.ok(b.sensitivity.additionalRevenueNeeded.length && b.sensitivity.breakingPoints.length && b.sensitivity.gainNeededToEnterRecommendation.length);
  for (const t of ['Financial position', 'Structural constraints between options', 'Cash commitments of each recommendation, by scenario', 'Why not the alternatives', 'Sensitivity and break-even', '@media print']) assert.ok(html.includes(t), t);
  assert.doesNotMatch(html, /<script|probability of success|will win|\bpredicts?\b/i);
});

test(`performance: ${MAX_OPTIONS} options (1,024 combinations) evaluated and analysed within bounds; the limit stays ${MAX_OPTIONS}`, () => {
  const opts = Array.from({length: MAX_OPTIONS}, (_, i) => (i % 3 === 2
    ? SG({id: `s${i}`, name: `Signing ${i}`, startMonth: i % 4, transferFee: 2_000 * i, agentFee: 500, signingBonus: 300 * i, contractMonths: 12, monthlyWage: 300 + 40 * i, employerChargeRate: 0.25, shortTermScore: (i * 3) % 11, longTermScore: (i * 7) % 11, monthlyGain: i % 2 ? null : 100})
    : P({id: `p${i}`, name: `Project ${i}`, upfront: 1_500 * (i + 1), upfrontType: i % 2 ? 'capital' : 'expense', usefulLifeMonths: 60, instalments: 1 + (i % 3), instalmentEveryMonths: 2, monthlyCost: 150 * i, costType: i % 2 ? 'staff' : 'operating', commitmentMonths: 12,
      monthlyGain: i % 4 === 0 ? 400 : i % 4 === 1 ? null : 0, shortTermScore: (i * 5) % 11, longTermScore: (i * 3) % 11, exclusiveGroup: i === 4 || i === 7 ? 'x' : ''})));
  opts[6].requires = ['p0']; opts[9].mandatory = true;
  const m = M(opts, {decisionBudget: 40_000}, {downside: {revenuePct: -8, wagePct: 3, fromMonth: 4}, upside: {revenuePct: 4, fromMonth: 6}});
  assert.deepEqual(check(m), []);
  let t0 = Date.now(); const r = evaluate(m); const tEval = Date.now() - t0;
  assert.deepEqual(r.problems, []); assert.ok(Object.values(r.strategies).every(s => s.candidates + Object.values(s.rejectedCounts).reduce((a, b) => a + b, 0) === 1 << r.options.filter(o => o.budgetOk).length));
  t0 = Date.now(); const a = analyse(m, 'immediate'); const tSens = Date.now() - t0;
  assert.deepEqual(a.problems, []);
  console.log(`  ${MAX_OPTIONS} options: evaluation ${tEval} ms, full sensitivity analysis ${tSens} ms (${a.preference.evaluations} re-evaluations)`);
  assert.ok(tEval < 3_000, `evaluation ${tEval} ms`); assert.ok(tSens < 60_000, `sensitivity ${tSens} ms`);
  assert.match(check(M(Array.from({length: MAX_OPTIONS + 1}, (_, i) => P({id: `o${i}`, name: `O${i}`})))).join(' '), new RegExp(`At most ${MAX_OPTIONS} options`));
});
