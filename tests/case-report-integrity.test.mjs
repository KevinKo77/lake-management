// Málaga CF case — report integrity. The JSON and HTML exports must carry exactly the calculation they describe:
// intervention magnitude, activation date, expected points, financial assumptions, missing-data labels and the
// identity of every scenario. No mismatch and no silent substitution, across many settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {context, compare, scenario, report, reportHtml, affordability, emptyFinance, HYPOTHETICAL, missingFinance} from '../lanova/cases/malaga-winter-2027/case.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), ctx = context(D), dates = ctx.remaining.map(m => m.date);
const SETTINGS = [
  {attackPct: 20, attackFrom: dates[5], defencePct: 20, defenceFrom: dates[5]},
  {attackPct: 0, attackFrom: dates[0], defencePct: 35, defenceFrom: dates[12]},
  {attackPct: 75, attackFrom: dates[20], defencePct: 0, defenceFrom: dates[0]},
  {attackPct: 300, attackFrom: dates[0], defencePct: 90, defenceFrom: dates.at(-1)},
  {attackPct: 13, attackFrom: dates[9], defencePct: 7, defenceFrom: dates[3]},
];
const r1 = v => (Math.round(v * 10) / 10).toFixed(1);

test('magnitude, activation date and scenario identity: every scenario says exactly what it was computed with', () => {
  for (const h of SETTINGS) {
    const rep = report(ctx, h, emptyFinance(), '2026-11-24'), c = compare(ctx, h), e = rep.estimates;
    assert.deepEqual(rep.hypotheses.interventions, h, 'the hypotheses are exported unchanged');
    assert.deepEqual(e.baseline.intervention, {attackPct: 0, attackFrom: null, defencePct: 0, defenceFrom: null});
    assert.deepEqual(e.attack.intervention, {attackPct: h.attackPct, attackFrom: h.attackFrom, defencePct: 0, defenceFrom: null});
    assert.deepEqual(e.defence.intervention, {attackPct: 0, attackFrom: null, defencePct: h.defencePct, defenceFrom: h.defenceFrom});
    assert.deepEqual(e.both.intervention, {attackPct: h.attackPct, attackFrom: h.attackFrom, defencePct: h.defencePct, defenceFrom: h.defenceFrom});
    for (const k of ['baseline', 'attack', 'defence', 'both']) assert.equal(e[k].scenario, k);
    // Each identity, re-run on its own, gives the exported figures (the scenario is what it says it is).
    for (const k of ['attack', 'defence', 'both']) {
      const again = scenario(ctx, e[k].intervention), base = scenario(ctx);
      assert.equal(e[k].expectedPointsGained, +(again.points - base.points).toFixed(3), `${k} gain`);
      assert.equal(e[k].expectedFinalPoints, +again.finalPoints.toFixed(2), `${k} final points`);
      assert.deepEqual(e[k].matchesAffected, {attack: again.affected.attack, defence: again.affected.defence}, `${k} matches affected`);
    }
    // Activation date: the matches affected are exactly those on or after the date.
    assert.equal(e.attack.matchesAffected.attack, h.attackPct ? dates.filter(d => d >= h.attackFrom).length : 0);
    assert.equal(e.defence.matchesAffected.defence, h.defencePct ? dates.filter(d => d >= h.defenceFrom).length : 0);
    assert.equal(e.best, c.best);
  }
});

test('expected points: JSON equals the model to the stated rounding; HTML shows the on-screen figures, rounded once (regression: double rounding)', () => {
  for (const h of SETTINGS) {
    const rep = report(ctx, h, emptyFinance(), '2026-11-24'), c = compare(ctx, h), html = reportHtml(rep);
    for (const k of ['baseline', 'attack', 'defence', 'both']) {
      assert.equal(rep.estimates[k].expectedFinalPoints, +c[k].finalPoints.toFixed(2)); assert.equal(rep.estimates[k].expectedPointsGained, +c[k].gain.toFixed(3));
      const row = html.match(new RegExp(`<tr data-scenario="${k}">[\\s\\S]*?</tr>`))[0], cells = [...row.matchAll(/<td>([^<]*)<\/td>/g)].map(x => x[1]);
      // Rounded once from the unrounded model value, exactly as on screen (no double rounding of the JSON figures).
      const want = [r1(c[k].gain), r1(c[k].finalPoints), r1(c[k].goalsFor), r1(c[k].goalsAgainst)];
      assert.deepEqual(cells, want, `${k} row`); assert.deepEqual(Object.values(rep.estimates[k].shown), want, `${k} shown`);
    }
    if (h.attackPct) assert.ok(html.includes(`goals scored +${h.attackPct}% from ${h.attackFrom}`), 'attack identity in HTML');
    if (h.defencePct) assert.ok(html.includes(`goals conceded −${h.defencePct}% from ${h.defenceFrom}`), 'defence identity in HTML');
    assert.ok(html.includes(`Attack: +${h.attackPct}% goals scored from ${h.attackFrom}`)); assert.ok(html.includes(`Defence: −${h.defencePct}% goals conceded from ${h.defenceFrom}`));
  }
});

test('financial assumptions: exported unchanged; every financial figure equals the engine run', () => {
  const f = structuredClone(HYPOTHETICAL), h = SETTINGS[0], rep = report(ctx, h, f, '2026-11-24'), a = affordability(f, compare(ctx, h));
  assert.deepEqual(rep.hypotheses.finance, f);
  for (const k of ['attack', 'defence', 'both']) {
    const x = rep.estimates.affordability[k], v = a.items[k];
    assert.deepEqual([x.immediateCost, x.costIn2027, x.totalCommitted, x.withinBudget, x.lowestCashBase, x.lowestCashDownside], [v.upfront, v.costInYear, v.totalCost, v.withinBudget, Math.round(v.base.lowest), Math.round(v.downside.lowest)], k);
    assert.ok(v.reconciled < 1e-6, `${k}: reconciled with a direct engine run (${v.reconciled})`);
  }
  assert.deepEqual(rep.estimates.affordability.missingFinancialInputs, []);
});

test('missing-data labels: nothing assumed; each missing input is named in JSON and HTML; a missing cost is never replaced', () => {
  // Nothing entered.
  const e0 = report(ctx, SETTINGS[0], emptyFinance(), '2026-11-24'), html0 = reportHtml(e0);
  assert.ok(e0.estimates.affordability.notComputed); assert.deepEqual(e0.estimates.affordability.missing, missingFinance(emptyFinance()));
  assert.deepEqual(e0.estimates.affordability.missingFinancialInputs, missingFinance(emptyFinance()));
  assert.ok(html0.includes('Inputs not entered (never assumed): organisation: openingCash'));
  // Organisation known, one defence cost missing: defence and both are "costs unknown", with the reason and the field.
  const f = structuredClone(HYPOTHETICAL); f.defence.monthlyWage = null;
  const e1 = report(ctx, SETTINGS[0], f, '2026-11-24'), aff = e1.estimates.affordability, html1 = reportHtml(e1);
  assert.equal(aff.attack.costs, undefined); assert.equal(aff.defence.costs, 'unknown'); assert.equal(aff.both.costs, 'unknown');
  assert.match(aff.defence.reason, /Costs unknown for defence/); assert.deepEqual(aff.missingFinancialInputs, ['defence intervention: monthlyWage']);
  assert.equal(e1.hypotheses.finance.defence.monthlyWage, null, 'the missing value is exported as missing, not as 0');
  assert.ok(html1.includes('Costs unknown — not computed. Costs unknown for defence')); assert.ok(html1.includes('Inputs not entered (never assumed): defence intervention: monthlyWage'));
  assert.ok(!/missingFinancialInputs/.test(html1), 'no internal key in the HTML table');
});

test('exports are deterministic for a given date and inputs (no hidden state)', () => {
  const a = report(ctx, SETTINGS[4], structuredClone(HYPOTHETICAL), '2026-11-24'), b = report(ctx, SETTINGS[4], structuredClone(HYPOTHETICAL), '2026-11-24');
  assert.deepEqual(a, b); assert.equal(reportHtml(a), reportHtml(b));
});
