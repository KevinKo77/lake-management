// LANOVA Winter Transfer Intelligence — Release 3, role-based player profiles. Equivalence with the experiment,
// scaling by minutes and availability, the adaptation ramp, ranges, labels that never change a figure, missing and
// invalid inputs, comparisons that say when ranges overlap, and the exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {context, compare, scenario, scenarioBy, report, reportHtml, HYPOTHETICAL} from '../lanova/cases/malaga-winter-2027/case.js';
import {ROLES, emptyProfile, ILLUSTRATION, LABEL_NOTE, checkProfile, factors, profileImpact, compareProfiles} from '../lanova/cases/malaga-winter-2027/player.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), ctx = context(D);
const JAN = ctx.remaining.find(m => m.date >= '2027-01-02').date, close = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const P = (o = {}) => ({label: '', role: 'striker', from: JAN, minutesPct: 100, availabilityPct: 100, rampMatches: 0, attack: {low: 20, central: 20, high: 20}, defence: {low: 0, central: 0, high: 0}, ...o});

test('equivalence: a full-time, always-available profile with no adaptation equals the experiment', () => {
  const r = profileImpact(ctx, P()), c = compare(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 0, defenceFrom: JAN});
  assert.ok(r.computed); close(r.central.gain, c.attack.gain, 'attack', 1e-12);
  const d = profileImpact(ctx, P({role: 'centre-back', attack: {low: 0, central: 0, high: 0}, defence: {low: 25, central: 25, high: 25}})), c2 = compare(ctx, {attackPct: 0, attackFrom: JAN, defencePct: 25, defenceFrom: JAN});
  close(d.central.gain, c2.defence.gain, 'defence', 1e-12);
  // scenarioBy with constant factors reproduces scenario
  const s1 = scenario(ctx, {attackPct: 30, defencePct: 10}), s2 = scenarioBy(ctx, () => ({attack: 1.3, defence: 0.9})); close(s2.points, s1.points, 'scenarioBy', 1e-12);
  assert.throws(() => scenarioBy(ctx, () => ({attack: 0, defence: 1})), RangeError);
});

test('minutes and availability scale the on-pitch effect: 50% of minutes at +40% equals +20% all the time', () => {
  const half = profileImpact(ctx, P({minutesPct: 50, attack: {low: 40, central: 40, high: 40}})), full = profileImpact(ctx, P());
  close(half.central.gain, full.central.gain, 'scaled', 1e-12); close(half.equivalentAtFullEffect.attackPct, 20, 'equivalent setting');
  const avail = profileImpact(ctx, P({minutesPct: 80, availabilityPct: 50, attack: {low: 50, central: 50, high: 50}}));
  close(avail.equivalentAtFullEffect.attackPct, 20, '0.8 × 0.5 × 50'); close(avail.central.gain, full.central.gain, 'same expected effect', 1e-12);
  assert.equal(profileImpact(ctx, P({minutesPct: 0})).central.gain, 0, 'no minutes, no effect');
});

test('adaptation ramp: linear build-up over R matches, nothing before the first match', () => {
  const p = P({rampMatches: 3, attack: {low: 40, central: 40, high: 40}}), f = factors(ctx, p, 'central'), start = ctx.remaining.findIndex(m => m.date === JAN);
  for (let i = 0; i < start; i++) assert.deepEqual(f[i], {attack: 1, defence: 1});
  [0.25, 0.5, 0.75, 1, 1].forEach((w, k) => close(f[start + k].attack, 1 + 0.4 * w, `match ${k}`, 1e-12));
  const r = profileImpact(ctx, p), noRamp = profileImpact(ctx, P({attack: {low: 40, central: 40, high: 40}}));
  assert.ok(r.central.gain < noRamp.central.gain && r.central.gain > 0, 'adaptation costs points'); assert.equal(r.fullEffectFrom, ctx.remaining[start + 3].date);
  // A later first match costs points too.
  const late = profileImpact(ctx, P({from: ctx.remaining.at(-10).date})); assert.ok(late.central.gain < profileImpact(ctx, P()).central.gain); assert.equal(late.matches, 10);
});

test('ranges: low ≤ central ≤ high in points; a negative low (worse than the current option) can lose points', () => {
  const r = profileImpact(ctx, P({attack: {low: -10, central: 15, high: 40}, defence: {low: -5, central: 5, high: 15}}));
  assert.ok(r.low.gain < 0 && r.low.gain < r.central.gain && r.central.gain < r.high.gain, JSON.stringify([r.low.gain, r.central.gain, r.high.gain]));
  assert.ok(r.high.goalsFor > 0 && r.high.goalsAgainst < 0);
});

test('labels: never change a figure, are marked exploratory and unverified; no player data in the module', () => {
  const a = profileImpact(ctx, P()), b = profileImpact(ctx, P({label: 'Any Real Name'}));
  for (const lv of ['low', 'central', 'high']) assert.deepEqual(b[lv], a[lv]);
  assert.equal(a.label, null); assert.equal(a.labelNote, null); assert.equal(b.label, 'Any Real Name'); assert.equal(b.labelNote, LABEL_NOTE); assert.match(LABEL_NOTE, /exploratory.*no verified data/);
  assert.ok(ILLUSTRATION.every(x => /^Profile [AB] \(illustration\)$/.test(x.label)), 'illustrations carry no real name');
  const src = readFileSync('lanova/cases/malaga-winter-2027/player.js', 'utf8'); assert.doesNotMatch(src, /fetch\(|https?:\/\//, 'no lookup of any player');
});

test('roles: eight roles with a main channel; an empty profile for a role sets only the other channel to an explicit 0', () => {
  assert.equal(Object.keys(ROLES).length, 8); assert.deepEqual([...new Set(Object.values(ROLES).map(r => r.channel))].sort(), ['attack', 'both', 'defence']);
  const s = emptyProfile('striker'); assert.deepEqual(s.defence, {low: 0, central: 0, high: 0}); assert.deepEqual(s.attack, {low: null, central: null, high: null});
  const cb = emptyProfile('centre-back'); assert.deepEqual(cb.attack, {low: 0, central: 0, high: 0}); assert.equal(cb.defence.central, null);
  const cm = emptyProfile('central-midfielder'); assert.equal(cm.attack.central, null); assert.equal(cm.defence.central, null);
  assert.equal(emptyProfile('striker').minutesPct, null, 'no invented minutes'); assert.equal(emptyProfile('striker').from, null);
});

test('missing and invalid inputs: nothing is computed until every value is given and valid', () => {
  const e = profileImpact(ctx, emptyProfile()); assert.equal(e.computed, false); assert.ok(e.missing.includes('role') && e.missing.includes('share of minutes') && e.missing.includes('goals scored (central)'));
  const cases = [[{attack: {low: 30, central: 20, high: 40}}, /low ≤ central ≤ high/], [{minutesPct: 120}, /share of minutes: 0 to 100/], [{attack: {low: 0, central: 0, high: 400}}, /goals scored \(high\): -50 to 300/],
    [{defence: {low: 0, central: 0, high: 95}}, /goals conceded \(high\): -50 to 90/], [{rampMatches: 2.5}, /whole number/], [{from: '2027-01-01'}, /not a remaining Málaga fixture/], [{availabilityPct: -1}, /availability/]];
  for (const [o, re] of cases) { const r = profileImpact(ctx, P(o)); assert.equal(r.computed, false, JSON.stringify(o)); assert.match(r.problems.join('; '), re); }
  assert.deepEqual(checkProfile(ctx, P()), {missing: [], problems: []});
  assert.equal(profileImpact(ctx, P({role: 'libero'})).computed, false);
  assert.equal(profileImpact(ctx, P({minutesPct: NaN})).computed, false);
});

test('comparison: ranking can reverse with the hypotheses, and overlapping ranges are reported as not separated', () => {
  const striker = o => P({attack: {low: 10, central: 25, high: 40}, ...o}), cb = o => P({role: 'centre-back', attack: {low: 0, central: 0, high: 0}, defence: {low: 10, central: 20, high: 30}, ...o});
  const r1 = compareProfiles([profileImpact(ctx, striker()), profileImpact(ctx, cb())]);
  const r2 = compareProfiles([profileImpact(ctx, striker({attack: {low: 40, central: 60, high: 80}})), profileImpact(ctx, cb({defence: {low: 2, central: 5, high: 8}}))]);
  assert.ok(r1.comparable && r2.comparable); assert.equal(r2.best, 0, 'a much stronger striker wins'); assert.equal(r2.separated, true);
  const r3 = compareProfiles([profileImpact(ctx, striker({attack: {low: 2, central: 5, high: 8}})), profileImpact(ctx, cb({defence: {low: 25, central: 35, high: 45}}))]);
  assert.equal(r3.best, 1, 'a much stronger centre-back wins: the ranking reverses'); assert.equal(r3.separated, true);
  const ill = compareProfiles(ILLUSTRATION.map(x => profileImpact(ctx, {...x, from: JAN}))); assert.equal(ill.comparable, true); assert.equal(ill.separated, false); assert.match(ill.verdict, /overlap/);
  assert.equal(compareProfiles([profileImpact(ctx, P()), profileImpact(ctx, emptyProfile())]).comparable, false);
});

test('exports: profiles appear as hypotheses and estimates; labels are escaped; incomplete profiles say what is missing', () => {
  const h = {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}, ps = [P({label: '<script>x</script>'}), emptyProfile('winger')];
  const rep = report(ctx, h, structuredClone(HYPOTHETICAL), '2026-11-24', ps.map(p => ({input: p, result: profileImpact(ctx, p)})));
  assert.equal(rep.hypotheses.profiles.length, 2); assert.equal(rep.profiles.items[0].role, 'striker'); close(rep.profiles.items[0].central.expectedPointsGained, +profileImpact(ctx, P()).central.gain.toFixed(3), 'json');
  assert.equal(rep.profiles.items[1].notComputed, true); assert.ok(rep.profiles.items[1].missing.length > 0);
  const html = reportHtml(rep); assert.ok(!html.includes('<script>x'), 'label escaped'); assert.match(html, /Role-based player profiles/); assert.match(html, /Not computed — missing/);
  assert.ok(rep.notShown.some(x => /No named player data/.test(x)));
  const none = report(ctx, h, structuredClone(HYPOTHETICAL), '2026-11-24'); assert.deepEqual(none.profiles.items, []); assert.doesNotMatch(reportHtml(none), /Role-based player profiles/);
});
