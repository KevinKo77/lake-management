// LaLiga ranking with the RFEF tie-breakers (lanova/cases/ranking.js). Synthetic fixtures for every rule (two clubs,
// three or more, the head-to-head table, partial resolution, incomplete head-to-head, fallbacks, unresolved ties,
// point adjustments), the real historical ties at the relegation line, and every rebuilt final table against the
// verified official outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {standings, resolveTie, amongFrom, tally, positionShares, straddlesRelegation, RULES} from '../lanova/cases/ranking.js';
import {allMatches, canonical, simulateSeason, replay} from '../lanova/cases/forecast.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), OFF = JSON.parse(readFileSync('lanova/cases/data/official-outcomes.json', 'utf8')), ALL = allMatches(D);
const M = (h, a, hg, ag) => ({h, a, hg, ag});
const order = t => t.rows.map(r => r.team);
const season = s => { const ms = ALL.filter(m => m.season === s), teams = [...new Set(ms.flatMap(m => [m.h, m.a]))], name = Object.fromEntries(ms.flatMap(m => [[m.h, m.home], [m.a, m.away]]));
  const adjust = Object.fromEntries(Object.entries(OFF.adjustments?.[s] ?? {}).map(([n, x]) => [canonical(n), x.points])); return {ms, teams, name, table: standings(teams, ms, {adjust})}; };

test('rules: the criteria are declared in the RFEF order; fair play is declared unavailable', () => {
  assert.deepEqual(RULES.criteria, ['points', 'head-to-head points', 'head-to-head goal difference', 'goal difference', 'goals scored', 'fair play (not available)']);
  assert.equal(RULES.headToHeadOnlyWhenComplete, true);
});

test('two clubs: head-to-head beats a better overall goal difference; level head-to-head falls back to goal difference, then goals scored', () => {
  // X and Y both 6 points; X has the better overall goal difference, Y won the head-to-head on goal difference.
  const fx = [M('X', 'Y', 1, 0), M('Y', 'X', 3, 0), M('X', 'Z', 6, 0), M('Z', 'X', 0, 0), M('Y', 'Z', 1, 0), M('Z', 'Y', 0, 0)];
  const t = standings(['X', 'Y', 'Z'], fx); assert.equal(t.rows[0].points, t.rows[1].points); assert.equal(t.rows[0].points, 7);
  assert.ok(tally(['X', 'Y', 'Z'], fx).X.gd > tally(['X', 'Y', 'Z'], fx).Y.gd, 'X has the better overall goal difference');
  assert.deepEqual(order(t).slice(0, 2), ['Y', 'X']); assert.equal(t.rows[0].decidedBy, 'head-to-head goal difference');
  // Head-to-head level (1–1 twice): overall goal difference decides; then goals scored.
  const g = [M('X', 'Y', 1, 1), M('Y', 'X', 1, 1), M('X', 'Z', 3, 0), M('Z', 'X', 0, 0), M('Y', 'Z', 1, 0), M('Z', 'Y', 0, 0)];
  const t2 = standings(['X', 'Y', 'Z'], g); assert.deepEqual(order(t2).slice(0, 2), ['X', 'Y']); assert.equal(t2.rows[0].decidedBy, 'goal difference');
  const h = [M('X', 'Y', 1, 1), M('Y', 'X', 1, 1), M('X', 'Z', 3, 1), M('Z', 'X', 0, 0), M('Y', 'Z', 2, 0), M('Z', 'Y', 0, 0)];
  const t3 = standings(['X', 'Y', 'Z'], h); assert.equal(t3.rows[0].gd, t3.rows[1].gd); assert.deepEqual(order(t3).slice(0, 2), ['X', 'Y']); assert.equal(t3.rows[0].decidedBy, 'goals scored');
});

test('three clubs: the head-to-head table decides first; a partial split re-applies the rules to the clubs still level', () => {
  // A, B, C all on 9 points. Head-to-head table: A 9, B 9, C 0 → C last. A and B still level: their own two matches
  // (A 1–0 B, B 2–0 A) put B first, although A's goal difference in the three-club table is better (+9 vs +3).
  const fx = [M('A', 'C', 5, 0), M('C', 'A', 0, 5), M('B', 'C', 1, 0), M('C', 'B', 0, 1), M('A', 'B', 1, 0), M('B', 'A', 2, 0),
    M('C', 'D', 1, 0), M('D', 'C', 0, 1), M('C', 'E', 1, 0), M('D', 'E', 0, 0)];
  const t = standings(['A', 'B', 'C', 'D', 'E'], fx), top = t.rows.slice(0, 3);
  assert.deepEqual(top.map(r => r.points), [9, 9, 9]);
  assert.deepEqual(top.map(r => r.team), ['B', 'A', 'C']);
  assert.equal(t.rows.find(r => r.team === 'C').decidedBy, 'head-to-head points');
  assert.equal(t.rows.find(r => r.team === 'B').decidedBy, 'head-to-head goal difference', 'the pair is decided by its own head-to-head');
  // The same clubs without the restart would follow the three-club goal difference (A first): the rule matters.
  const among = amongFrom(fx), h3 = tally(['A', 'B', 'C'], among(new Set(['A', 'B', 'C'])));
  assert.ok(h3.A.gd > h3.B.gd);
});

test('head-to-head is used only when complete: during a season an unplayed meeting means overall criteria', () => {
  const fx = [M('X', 'Y', 1, 0), M('Y', 'X', null, null), M('X', 'Z', 0, 3), M('Z', 'Y', 3, 0), M('Y', 'Z', 4, 0), M('Z', 'X', 2, 0)];
  const t = standings(['X', 'Y', 'Z'], fx); const x = t.rows.find(r => r.team === 'X'), y = t.rows.find(r => r.team === 'Y');
  assert.equal(x.points, y.points); assert.ok(y.gd > x.gd); assert.ok(y.position < x.position, 'overall goal difference, not the one played meeting');
  assert.equal(y.decidedBy, 'goal difference');
  assert.deepEqual(resolveTie(['X'], () => [], {}), [{teams: ['X'], decidedBy: null}]);
});

test('a tie only fair play could break is never broken at random: shared positions, equal shares, reported', () => {
  const fx = [M('X', 'Y', 1, 1), M('Y', 'X', 1, 1), M('X', 'Z', 2, 0), M('Z', 'X', 0, 1), M('Y', 'Z', 2, 0), M('Z', 'Y', 0, 1)];
  const t = standings(['X', 'Y', 'Z'], fx);
  assert.equal(t.unresolved.length, 1); assert.deepEqual(t.unresolved[0], {teams: ['X', 'Y'], positions: [1, 2]});
  assert.match(t.rows[0].decidedBy, /fair play needed/);
  const sh = positionShares(t, 1); assert.deepEqual(sh.X.positions, [0.5, 0.5, 0]); assert.equal(sh.Z.relegated, 1);
  assert.equal(straddlesRelegation(t, 2), true, 'positions 1–2 straddle a 2-club relegation line in a 3-club league');
  // The same input always gives the same table (no random element).
  assert.deepEqual(standings(['X', 'Y', 'Z'], fx), t);
  // In a simulation with nothing left to play, the block's clubs share the positions and the share is reported.
  const sim = simulateSeason({played: fx, remaining: [], ratings: {c: 1, home: 1, attack: {}, defence: {}, rho: 0}, n: 3, seed: 1, relegated: 2});
  assert.deepEqual(sim.X.positions, [0.5, 0.5, 0]); assert.equal(sim.X.relegated, 0.5); assert.equal(sim.unresolvedRelegationTies, 1);
});

test('point adjustments decided by the competition count in the overall points only', () => {
  const fx = [M('X', 'Y', 1, 0), M('Y', 'X', 1, 0), M('X', 'Z', 1, 0), M('Z', 'X', 0, 1), M('Y', 'Z', 1, 0), M('Z', 'Y', 0, 1)];
  const t = standings(['X', 'Y', 'Z'], fx, {adjust: {X: -3}}); assert.equal(t.rows.find(r => r.team === 'X').points, 6); assert.equal(t.rows[0].team, 'Y');
});

test('historical relegation ties: 2025/26 (three clubs on 42), 2014/15 (three on 35), 2015/16 (two on 39)', () => {
  const s26 = season('2025-26'), by = n => s26.table.rows.find(r => s26.name[r.team] === n);
  assert.deepEqual(['Levante UD', 'CA Osasuna', 'RCD Mallorca'].map(n => [by(n).points, by(n).position]), [[42, 16], [42, 17], [42, 18]]);
  assert.match(by('RCD Mallorca').decidedBy, /head-to-head/);
  const old = [...s26.table.rows].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  assert.equal(s26.name[old[17].team], 'Levante UD', 'the previous rule (overall goal difference) relegated Levante instead');
  const s15 = season('2014-15'), n15 = s15.table.rows.slice(15, 18).map(r => s15.name[r.team]);
  assert.deepEqual(n15, ['Deportivo La Coruña', 'Granada CF', 'SD Eibar']);
  const s16 = season('2015-16'), g = s16.table.rows.find(r => s16.name[r.team] === 'Granada CF'), sp = s16.table.rows.find(r => s16.name[r.team] === 'Sporting Gijón');
  assert.equal(g.points, sp.points); assert.ok(g.gd < sp.gd && g.position < sp.position, 'Granada above Sporting on head-to-head despite a worse goal difference');
  // Almería 2014/15: the deduction is applied (29 points), and changes no position.
  assert.equal(s15.table.rows.find(r => s15.name[r.team] === 'UD Almería').points, 29); assert.equal(s15.table.rows.find(r => s15.name[r.team] === 'UD Almería').position, 19);
});

test('every rebuilt final table: relegated clubs and every verified position equal the official outcome; no unresolved tie', () => {
  let checked = 0;
  for (const [s, off] of Object.entries(OFF.seasons)) {
    const x = season(s);
    assert.deepEqual(x.table.rows.slice(17).map(r => canonical(x.name[r.team])).sort(), off.relegated.map(canonical).sort(), `${s}: relegated`);
    for (const [p, team, points] of off.positions) { const r = x.table.rows.find(y => y.team === canonical(team)); assert.ok(r, `${s} ${team}`); assert.deepEqual([r.position, r.points], [p, points], `${s} ${team}`); checked++; }
    assert.equal(x.table.unresolved.length, 0, `${s}: unresolved`);
  }
  assert.equal(Object.keys(OFF.seasons).length, 14); assert.equal(checked, Object.values(OFF.seasons).reduce((n, x) => n + x.positions.length, 0)); assert.ok(checked >= 35, `${checked} verified positions`);
});

test('applied consistently: replay labels and simulated tables use the same rules; relegation shares sum to 3', () => {
  const rp = replay(D, '2025-26', 13, {halfLife: 730, k: 8, dixonColes: false, n: 500, seed: 3});
  assert.equal(rp.actual[canonical('RCD Mallorca')].relegated, true); assert.equal(rp.actual[canonical('Levante UD')].relegated, false);
  const sum = Object.values(rp.sim).reduce((a, x) => a + x.relegated, 0); assert.ok(Math.abs(sum - 3) < 1e-9, String(sum));
  assert.equal(typeof rp.unresolvedRelegationTies, 'number');
  // The table at the cut-off uses the same rules (head-to-head skipped while incomplete).
  assert.equal(rp.table.length, 20); assert.ok(rp.table.every((r, i) => i === 0 || rp.table[i - 1].points >= r.points));
});
