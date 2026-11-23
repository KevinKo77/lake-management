// The public copy of the LANOVA Finance engine is the validated candidate of lake-intelligence PR #58
// (commit 96b9909), which fixes how a scenario factor treats a signing bonus paid before the scenario applies.
// These tests run on the public copy (lanova/finance/engine/): they fail on the previous copy (aaac112) and pass now.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forecast, analyse} from '../lanova/finance/engine/model.js';
import {CASES} from '../lanova/finance/engine/cases.js';

const close = (a, b, msg, tol = 0.01) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} vs ${b}`);
const manifest = JSON.parse(readFileSync('lanova/finance/engine/MANIFEST.json', 'utf8'));

// A scenario that changes payroll only, from month index `from` (factor 0.5), nothing else.
function payrollScenario(plan, from) {
  const down = plan.scenarios.find(s => s.id === 'downside');
  Object.assign(down, {revenueFactors: Object.fromEntries(Object.keys(down.revenueFactors).map(k => [k, 1])),
    costFactors: Object.fromEntries(Object.keys(down.costFactors).map(k => [k, k === 'payroll' ? 0.5 : 1])), extraCollectionLagMonths: 0, capexFactor: 1, fromMonth: from});
  return plan;
}
const delta = (plan, sc, key) => { const w = forecast(plan, {scenario: sc, decisions: ['striker']}).months, wo = forecast(plan, {scenario: sc, decisions: []}).months; return w.map((m, t) => m[key] - wo[t][key]); };

test('provenance: the public engine is lake-intelligence commit 96b9909 (PR #58)', () => {
  assert.equal(manifest.commit, '96b99091b14af3d06d06a8baceda71e230d2e571');
  assert.match(manifest.sourceBranch, /PR #58/);
});

test('signing bonus paid BEFORE the scenario applies: not scaled by the scenario factor (cash and expense)', () => {
  const plan = payrollScenario(CASES.football(), 6), s = plan.decisions.find(d => d.id === 'striker');
  assert.ok(s.signingBonus > 0 && s.startMonth < 6, 'the case pays a bonus before month 7');
  const wage = s.monthlyWage * (1 + s.employerChargeRate);
  const down = delta(plan, 'downside', 'operatingPayments'), base = delta(plan, 'base', 'operatingPayments');
  // In the month the bonus is paid, the downside pays exactly what the base pays: full bonus and full wage.
  close(down[s.startMonth], s.signingBonus + wage, 'downside cash in the bonus month');
  close(down[s.startMonth], base[s.startMonth], 'same as base before the scenario applies');
  // From the "applies from" month, the factor applies to the wage only (employer charges have factor 1 here).
  close(down[7], s.monthlyWage * 0.5 + s.monthlyWage * s.employerChargeRate, 'wage scaled from month 7');
});

test('signing bonus paid ON OR AFTER the scenario applies: scaled once, the same factor for cash and expense', () => {
  const plan = payrollScenario(CASES.football(), 6), s = plan.decisions.find(d => d.id === 'striker');
  s.startMonth = 7; s.feePayments = s.feePayments.map(p => ({...p, month: Math.max(7, p.month)}));
  const cash = delta(plan, 'downside', 'operatingPayments');
  close(cash[7], s.signingBonus * 0.5 + s.monthlyWage * 0.5 + s.monthlyWage * s.employerChargeRate, 'bonus scaled once in its month');
});

test('cash and expense reconcile: the bonus expense spread over the contract adds up to the bonus cash paid', () => {
  for (const from of [0, 1, 6, 11]) {
    const plan = payrollScenario(CASES.football(), from), s = plan.decisions.find(d => d.id === 'striker'), H = plan.horizonMonths;
    s.contractMonths = Math.min(s.contractMonths, H - s.startMonth); // whole contract inside the horizon: everything is visible
    for (const sc of ['base', 'downside']) {
      const f = forecast(plan, {scenario: sc, decisions: ['striker']}), b = forecast(plan, {scenario: sc, decisions: []});
      const bonusFactor = sc === 'downside' && s.startMonth >= from ? 0.5 : 1;
      // Payroll expense attributable to the player = wages (scaled when the scenario applies) + bonus spread.
      const wageExpense = f.months.reduce((acc, m, t) => acc + (t >= s.startMonth && t < s.startMonth + s.contractMonths ? s.monthlyWage * (sc === 'downside' && t >= from ? 0.5 : 1) : 0), 0);
      const payrollDelta = f.months.reduce((a, m, t) => a + (m.payroll - b.months[t].payroll), 0);
      close(payrollDelta - wageExpense, s.signingBonus * bonusFactor, `${sc}, scenario from month ${from + 1}: bonus expense = bonus cash`, 0.05);
      // Month-end cash still reconciles: opening + receipts − payments + financing = closing, every month.
      f.months.forEach((m, t) => close(m.openingCash + m.netCashFlow, m.closingCash, `${sc} month ${t + 1} cash roll-forward`));
    }
  }
});

test('the four validated fictional cases are unchanged by the fix (no case pays a bonus before a later scenario start)', () => {
  const expected = {football: 5_092_149, basketball: 1_907_000, groupNorth: 22_727_905, groupSouth: 11_935_000};
  for (const [k, v] of Object.entries(expected)) close(analyse(CASES[k]()).base.totals.closingCash, v, k, 0.5);
});
