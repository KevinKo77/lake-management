/** Public demo charts: every drawn value reconciles with the unchanged engine output; no invented figure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS} from '../lanova/v3/demo/scenarios.js';
import {analyse} from '../lanova/recruitment/engine/analysis.js';
import {canonicalScenario} from '../lanova/recruitment/scenario.js';
import {forceOf, story} from '../lanova/v3/demo/explain.js';
import {paymentsData, paymentsChart, squadCostChart, cashChart, limitsChart, compareChart} from '../lanova/workspace/charts.js';

const run = s => { const sc = canonicalScenario(s.scenario); const a = analyse(sc.candidates, sc.context, {...forceOf(sc), nodeLimit: 200000}); return {sc, a, st: story(s, sc, a, {})}; };

test('payments by season add up exactly to the engine total commitment, by type and by season', () => {
  for (const s of SCENARIOS) {
    const {a, st} = run(s), b = a.result.best; assert.ok(b, s.id);
    const d = paymentsData(b.selection, a.economics);
    assert.ok(Math.abs(d.total - b.grossCommitment) < 0.01, `${s.id}: ${d.total} vs ${b.grossCommitment}`);
    assert.ok(Math.abs(d.total - st.spend.totalCommitment) < 0.01);
    assert.ok(Math.abs(d.rows[0].fees + d.rows[0].wages + d.rows[0].other - b.upfront) < 0.01, `${s.id}: payments at signing = engine upfront`);
  }
});

test('charts render finite SVG with the engine figures, at desktop and phone widths', () => {
  for (const s of SCENARIOS) {
    const {a, st, sc} = run(s), b = a.result.best;
    for (const w of [560, 300]) {
      const svg = paymentsChart(paymentsData(b.selection, a.economics), sc.context.horizon, w) + squadCostChart(st.spend, w) + cashChart(b.cashBase, b.cashDownside, b.cashFloor, w);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/, s.id);
      assert.match(svg, new RegExp(`viewBox="0 0 ${Math.max(280, w)} `));
    }
    const low = Math.min(...b.cashDownside);
    assert.match(cashChart(b.cashBase, b.cashDownside, b.cashFloor), /Lowest /);
    assert.ok(low >= b.cashFloor, `${s.id}: the recommended option keeps the floor`);
  }
});

test('limit usage and A/B chart: shares, deltas and colours follow the figures given', () => {
  const html = limitsChart([{label: 'Budget at signing', used: 50, limit: 100, sense: '<=', money: true, status: 'ok'}, {label: 'New signings', used: 3, limit: 3, sense: '<=', money: false, status: 'tight'}, {label: 'Required strikers', used: 1, limit: 1, sense: '>=', money: false, status: 'tight'}]);
  assert.ok(html.indexOf('New signings') < html.indexOf('Budget at signing'), 'most used first');
  assert.doesNotMatch(html, /Required strikers/, 'minimum requirements are not shown as usage of a cap');
  assert.match(html, /100% used · decides the choice/);
  const ab = compareChart([['Paid at signing', 187000, 55000, false], ['Lowest cash in a bad case', 400000, 605000, true]]);
  assert.match(ab, /ab-delta good">−€132,000/); assert.match(ab, /ab-delta good">\+€205,000/);
  assert.match(compareChart([['Paid at signing', 1, 2, false]]), /ab-delta bad/);
});
