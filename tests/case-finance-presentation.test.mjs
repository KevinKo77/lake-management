// Málaga CF case — financial presentation (independent review fixture). Every expected value below is computed by
// hand from the hypothetical inputs, not by the code under test. It checks that cash paid in 2027, cash at signing,
// future instalments, total contractual commitments, budget commitment, accounting cost, reserve, missing costs and
// base/downside cases are each defined once and reconcile with the LANOVA Finance engine.
//
// Hypothetical inputs (HYPOTHETICAL in case.js; not Málaga CF data):
//   attack:  fee 800,000 in 1 instalment, agent 80,000, bonus 0, wage 110,000/month + 30% charges, 6 months
//   defence: fee 1,800,000 in 2 yearly instalments, agent 150,000, bonus 120,000, wage 75,000/month + 30%, 18 months
//   club:    opening cash 12,000,000; revenue 70,000,000/yr; costs 68,000,000/yr; reserve 4,000,000; budget 3,000,000;
//            downside: revenue −45% from July 2027 (month 7). Signing in January 2027.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {context, compare, affordability, report, reportHtml, HYPOTHETICAL, FIN_DEFINITIONS} from '../lanova/cases/malaga-winter-2027/case.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), ctx = context(D);
const near = (a, b, msg, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const H = () => structuredClone(HYPOTHETICAL), JAN = ctx.remaining.find(m => m.date >= '2027-01-02').date;
const wageD = 75_000 * 1.3, wageA = 110_000 * 1.3; // 97,500 and 143,000 per month

test('Work fixture (defence): cash paid in 2027 2,340,000; total committed 3,825,000; future instalment 900,000 identified separately', () => {
  const p = affordability(H(), null).items.defence.payments;
  near(p.cashPaid2027, 900_000 + 150_000 + 120_000 + 12 * wageD, 'cash paid 2027'); near(p.cashPaid2027, 2_340_000, 'cash paid 2027 (Work)');
  near(p.totalCommitment, 1_800_000 + 150_000 + 120_000 + 18 * wageD, 'total'); near(p.totalCommitment, 3_825_000, 'total (Work)');
  assert.deepEqual(p.futurePayments.transferInstalments.map(x => [x.month, Math.round(x.amount)]), [['2028-01', 900_000]], 'the second instalment is future, dated January 2028');
  near(p.futurePayments.wagesAfter2027, 6 * wageD, 'wages Jan–Jun 2028'); near(p.futurePayments.total, 900_000 + 585_000, 'future total');
  near(p.cashPaid2027 + p.futurePayments.total, p.totalCommitment, 'cash 2027 + future = total');
  near(p.cashAtSigning, 900_000 + 150_000 + 120_000, 'paid at signing'); near(p.cashInSigningMonth, 1_170_000 + wageD, 'January 2027 including wages');
  near(p.budgetCommitment, 2_070_000, 'budget commitment (Advantage Lab definition: fee + agent + bonus in full)');
  // The defective measure: committed one-off amounts + 2027 wages = 3,240,000, which counted the 2028 instalment in 2027.
  assert.notEqual(Math.round(p.cashPaid2027), 3_240_000); near(3_240_000 - p.cashPaid2027, 900_000, 'the correction is exactly the future instalment');
  // Never presented as paid: no month of 2027 contains it, and the 2027 months add up to the 2027 cash.
  near(p.cashByMonth.reduce((s, x) => s + x.amount, 0), p.cashPaid2027, 'monthly schedule sums to cash paid'); assert.ok(p.cashByMonth.every(x => x.month < '2028-01'));
  assert.deepEqual(p.cashByMonth.map(x => Math.round(x.amount)), [1_267_500, ...Array(11).fill(97_500)]);
});

test('attack and combined: hand-computed cash, commitments and budget', () => {
  const a = affordability(H(), null).items, at = a.attack.payments, b = a.both.payments;
  near(at.cashAtSigning, 880_000, 'attack at signing'); near(at.cashPaid2027, 880_000 + 6 * wageA, 'attack cash 2027'); near(at.cashPaid2027, 1_738_000, 'attack');
  near(at.futurePayments.total, 0, 'attack future'); near(at.totalCommitment, 1_738_000, 'attack total'); near(at.budgetCommitment, 880_000, 'attack budget');
  near(b.cashAtSigning, 880_000 + 1_170_000, 'both at signing'); near(b.cashPaid2027, 1_738_000 + 2_340_000, 'both cash 2027');
  near(b.futurePayments.total, 1_485_000, 'both future'); near(b.totalCommitment, 1_738_000 + 3_825_000, 'both total'); near(b.budgetCommitment, 880_000 + 2_070_000, 'both budget');
  assert.equal(a.both.withinBudget, true); assert.equal(a.defence.withinBudget, true);
});

test('reconciliation with the Finance engine: cash paid equals the change in month-end cash (base and downside); future fee equals the engine\'s payments after the horizon; total equals the Advantage Lab total', () => {
  for (const [k, v] of Object.entries(affordability(H(), null).items)) {
    const r = v.payments.reconciliation;
    near(r.engineCashPaid2027.base, v.payments.cashPaid2027, `${k} base`, 1e-6); near(r.engineCashPaid2027.downside, v.payments.cashPaid2027, `${k} downside (costs do not depend on the revenue scenario)`, 1e-6);
    assert.ok(r.maxMonthlyDifference < 1e-6, `${k} month by month`); assert.ok(r.futureFeeDifference < 1e-6 && r.totalVsAdvantageLab < 1e-6, k);
    near(v.totalCost, v.payments.totalCommitment, `${k} vs Advantage Lab`, 1e-6);
  }
});

test('accounting cost 2027 (engine): expense and amortisation, kept apart from cash', () => {
  const d = affordability(H(), null).items.defence.payments.accounting2027, a = affordability(H(), null).items.attack.payments.accounting2027;
  near(d.operatingExpense, 12 * wageD + 120_000 * 12 / 18, 'defence expense: wages + bonus spread over 18 months');
  near(d.amortisation, (1_800_000 + 150_000) / 18 * 11, 'defence amortisation: fee + agent over 18 months, from the month after signing');
  near(a.operatingExpense, 6 * wageA, 'attack expense'); near(a.amortisation, 880_000, 'attack amortisation: fully within 2027');
});

test('reserve, base and downside: lowest month-end cash by hand', () => {
  const a = affordability(H(), null), net = (70_000_000 - 68_000_000) / 12, down = 70_000_000 / 12 * 0.55 - 68_000_000 / 12;
  // Defence: January 12,000,000 + net − 1,267,500; then + (net − 97,500) for Feb–Jun; then (down − 97,500) Jul–Dec.
  const dJan = 12_000_000 + net - 1_267_500, dJun = dJan + 5 * (net - wageD), dDec = dJun + 6 * (down - wageD);
  near(a.items.defence.base.lowest, dJan, 'defence base lowest (January)'); near(a.items.defence.downside.lowest, dDec, 'defence downside lowest (December)');
  assert.equal(a.items.defence.base.meetsReserve, true); assert.equal(a.items.defence.downside.meetsReserve, false); assert.equal(a.reserve, 4_000_000);
  // Attack: wages end in June.
  const aJan = 12_000_000 + net - 1_023_000, aJun = aJan + 5 * (net - wageA), aDec = aJun + 6 * down;
  near(a.items.attack.base.lowest, aJan, 'attack base'); near(a.items.attack.downside.lowest, aDec, 'attack downside');
});

test('alternative payment schedules: one, two or three instalments; a longer contract', () => {
  const run = mod => { const f = H(); mod(f); return affordability(f, null).items.defence.payments; };
  const one = run(f => { f.defence.feeInstalments = 1; });
  near(one.cashPaid2027, 1_800_000 + 270_000 + 12 * wageD, 'single instalment'); near(one.futurePayments.total, 6 * wageD, 'only wages remain'); assert.deepEqual(one.futurePayments.transferInstalments, []);
  const three = run(f => { f.defence.feeInstalments = 3; });
  near(three.cashPaid2027, 600_000 + 270_000 + 12 * wageD, 'three instalments'); assert.deepEqual(three.futurePayments.transferInstalments.map(x => [x.month, Math.round(x.amount)]), [['2028-01', 600_000], ['2029-01', 600_000]]);
  near(three.totalCommitment, 3_825_000, 'same total whatever the schedule');
  const long = run(f => { f.defence.contractMonths = 30; });
  near(long.futurePayments.wagesAfter2027, 18 * wageD, '30-month contract: 18 months of wages after 2027'); near(long.totalCommitment, 2_070_000 + 30 * wageD, 'total');
});

test('activation dates move the sporting effect, not the payments; commitment per expected point follows the gain', () => {
  const early = compare(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}), late = compare(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: ctx.remaining.at(-8).date});
  const a = affordability(H(), early), b = affordability(H(), late);
  assert.deepEqual(a.items.defence.payments, b.items.defence.payments, 'same payments');
  near(a.items.defence.costPerExpectedPoint, 3_825_000 / early.defence.gain, 'per point, early', 1e-6); near(b.items.defence.costPerExpectedPoint, 3_825_000 / late.defence.gain, 'per point, late', 1e-6);
  assert.ok(b.items.defence.costPerExpectedPoint > a.items.defence.costPerExpectedPoint);
});

test('missing costs: never priced; the known intervention keeps its hand-computed figures', () => {
  const f = H(); f.defence.transferFee = null;
  const a = affordability(f, null);
  assert.equal(a.items.defence.known, false); assert.equal(a.items.both.known, false); assert.match(a.items.defence.reason, /Costs unknown for defence/);
  near(a.items.attack.payments.cashPaid2027, 1_738_000, 'attack unchanged');
  const rep = report(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}, f, '2026-11-24'), html = reportHtml(rep);
  assert.equal(rep.estimates.affordability.defence.costs, 'unknown'); assert.deepEqual(rep.estimates.affordability.missingFinancialInputs, ['defence intervention: transferFee']);
  assert.ok(html.includes('costs unknown')); assert.ok(!/NaN|undefined/.test(html));
});

test('exports: JSON and HTML carry the hand-computed figures with their definitions; the defective measure is gone', () => {
  const rep = report(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}, H(), '2026-11-24'), A = rep.estimates.affordability, html = reportHtml(rep);
  assert.equal(A.defence.cashPaid2027, 2_340_000); assert.equal(A.defence.totalContractualCommitment, 3_825_000); assert.equal(A.defence.cashAtSigning, 1_170_000);
  assert.deepEqual(A.defence.futurePayments.transferInstalments.map(x => [x.month, x.amount]), [['2028-01', 900_000]]); assert.equal(A.defence.budgetCommitment, 2_070_000);
  assert.equal(A.attack.cashPaid2027, 1_738_000); assert.equal(A.both.cashPaid2027, 4_078_000); assert.equal(A.both.totalContractualCommitment, 5_563_000);
  assert.deepEqual(A.defence.definitions, FIN_DEFINITIONS); assert.equal(A.defence.costIn2027, undefined); assert.equal(A.defence.immediateCost, undefined);
  for (const x of ['2,340,000', '3,825,000', '1,170,000', '900,000 due 2028-01', '1,485,000', '2,070,000', '1,738,000', '4,078,000', '5,563,000']) assert.ok(html.includes(x), x);
  assert.ok(!html.includes('3,240,000'), 'no 2027 figure that includes the 2028 instalment'); assert.ok(!/Cost in 2027/.test(html));
  for (const d of Object.values(FIN_DEFINITIONS)) assert.ok(html.includes(d.replace(/&/g, '&amp;').replace(/'/g, '&#39;')), d.slice(0, 40));
});
