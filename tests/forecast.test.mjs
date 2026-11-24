// LANOVA Winter Transfer Intelligence — Release 2, Football Forecast Lab. No look-ahead (changing later results
// changes no earlier forecast), seeded reproducibility, team identity across seasons, scoring rules and calibration
// against closed forms, the validation report reproduced from the code, and the page's publication promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical, allMatches, fit, means, scoreMatrix, probabilities, brier, logLoss, rps, calibration, walkForward, score, rng, simulateSeason, replay} from '../lanova/cases/forecast.js';
import {poisson} from '../lanova/cases/football.js';
import {CRITERIA, TUNE, TEST, wilson, bands, bootstrap} from '../scripts/forecast-validation-v2.mjs';
import {standings} from '../lanova/cases/ranking.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), V = JSON.parse(readFileSync('lanova/cases/data/forecast-validation-v2.json', 'utf8')), V1 = JSON.parse(readFileSync('lanova/cases/data/forecast-validation-v1.json', 'utf8'));
const ALL = allMatches(D), CHOSEN = {...V.tuning.chosen, halfLife: V.tuning.chosen.halfLife === 'none' ? Infinity : V.tuning.chosen.halfLife};
const close = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
/** A copy of the dataset in which every result of `season` dated on or after `from` is replaced (0–5 / 5–0 swaps). */
function tamper(season, from) {
  const d = structuredClone(D); let k = 0;
  for (const r of d.seasons[season].matches) if (r[0] >= from && r[4] !== null) { r[4] = k % 2 ? 0 : 5; r[5] = k % 2 ? 5 : 0; k++; }
  assert.ok(k > 50, 'enough results tampered'); return d;
}

test('identity: every complete season has 20 clubs, 380 matches, each club 38; spellings unify across seasons', () => {
  for (const [s, x] of Object.entries(D.seasons)) {
    const ms = ALL.filter(m => m.season === s), teams = new Set(ms.flatMap(m => [m.h, m.a]));
    assert.equal(teams.size, 20, `${s}: ${[...teams].join(', ')}`);
    if (x.played < x.matches.length) continue;
    assert.equal(ms.length, 380, s);
    for (const t of teams) assert.equal(ms.filter(m => m.h === t || m.a === t).length, 38, `${s} ${t}`);
  }
  for (const [a, b] of [['Real Madrid C.F.', 'Real Madrid CF'], ['Málaga CF', 'Malaga CF'], ['RCD Espanyol', 'RCD Espanyol Barcelona'], ['Rayo Vallecano de Madrid', 'Rayo Vallecano'], ['Deportivo Alavés', 'Alaves']]) assert.equal(canonical(a), canonical(b), `${a} ≡ ${b}`);
  assert.notEqual(canonical('Real Madrid CF'), canonical('Atlético de Madrid'));
  const seasonsWithMadrid = Object.keys(D.seasons).filter(s => ALL.some(m => m.season === s && m.h === canonical('Real Madrid CF')));
  assert.equal(seasonsWithMadrid.length, Object.keys(D.seasons).length, 'Real Madrid found under one id in every season');
});

test('scoring rules and calibration against closed forms', () => {
  const U = [1 / 3, 1 / 3, 1 / 3];
  close(brier([1, 0, 0], 0), 0, 'perfect Brier'); close(brier(U, 1), 2 / 3, 'uniform Brier'); close(brier([0, 0, 1], 0), 2, 'worst Brier');
  close(logLoss(U, 2), Math.log(3), 'uniform log loss'); close(logLoss([0.5, 0.3, 0.2], 1), -Math.log(0.3), 'log loss');
  close(rps([1, 0, 0], 0), 0, 'perfect RPS'); close(rps([0, 0, 1], 0), 1, 'worst RPS'); close(rps(U, 1), (1 / 9 + 1 / 9) / 2, 'uniform RPS, draw');
  close(rps([0, 1, 0], 0), 0.5, 'RPS rewards a near miss'); assert.ok(rps([0, 1, 0], 0) < rps([0, 0, 1], 0));
  // Calibration: two bins, known frequencies, known ECE.
  const pairs = [...Array(10).fill([0.15, 0]), [0.15, 1], [0.15, 1], ...Array(4).fill([0.75, 1]), [0.75, 0], [0.75, 0], [0.75, 0], [0.75, 0]];
  const c = calibration(pairs, 10);
  assert.equal(c.n, 20); assert.deepEqual(c.bins.map(b => [b.lo, b.n]), [[0.1, 12], [0.7, 8]]);
  close(c.bins[0].observed, 2 / 12, 'low bin'); close(c.bins[1].observed, 0.5, 'high bin');
  close(c.ece, 12 / 20 * Math.abs(0.15 - 2 / 12) + 8 / 20 * 0.25, 'ECE');
  close(calibration([[1, 1]], 10).bins[0].lo, 0.9, 'p = 1 falls in the last bin');
});

test('score matrix: independent Poisson when ρ = 0, sums to 1, Dixon–Coles moves only the four low scores', () => {
  const M = scoreMatrix(1.4, 1.1, 0), ph = poisson(1.4, 10), pa = poisson(1.1, 10), s = ph.reduce((a, b) => a + b) * pa.reduce((a, b) => a + b);
  close(M[2][1], ph[2] * pa[1] / s, 'cell 2–1'); close(M.flat().reduce((a, b) => a + b), 1, 'sum');
  const R = scoreMatrix(1.4, 1.1, -0.1), ratio = (i, j) => R[i][j] / M[i][j];
  assert.ok(ratio(0, 0) > 1 && ratio(1, 1) > 1 && ratio(1, 0) < 1 && ratio(0, 1) < 1, 'ρ < 0 adds 0–0 and 1–1');
  close(ratio(3, 2), ratio(2, 0), 'other cells scaled only by renormalisation', 1e-12);
  // probabilities() on a hand-made rating set
  const r = {c: 1, home: 1.25, attack: {a: 1.2, b: 0.8}, defence: {a: 0.9, b: 1.1}, rho: 0};
  const m = means(r, 'a', 'b'); close(m.home, 1.25 * 1.2 * 1.1, 'λ home'); close(m.away, 0.8 * 0.9, 'λ away');
  const p = probabilities(r, 'a', 'b'); close(p.home + p.draw + p.away, 1, 'sum'); assert.ok(p.home > 0.5);
});

test('fit: recovers known strengths on synthetic data; ignores every match on or after the forecast date', () => {
  // Deterministic league where each team's goals follow its expected value exactly (large sample).
  const T = ['p', 'q', 'r', 's'], att = {p: 1.5, q: 1, r: 1, s: 0.6}, def = {p: 0.7, q: 1, r: 1.2, s: 1.3}, ms = [];
  let d = Date.UTC(2020, 0, 1);
  for (let rep = 0; rep < 40; rep++) for (const h of T) for (const a of T) if (h !== a) {
    const lh = 1.2 * 1.3 * att[h] * def[a], la = 1.2 * att[a] * def[h], date = new Date(d += 86400e3).toISOString().slice(0, 10);
    ms.push({date, h, a, hg: lh * 10, ag: la * 10, season: 'x', matchday: 1});
  }
  const r = fit(ms, '2099-01-01', {halfLife: Infinity, k: 0, window: 1e6, dixonColes: false, iterations: 2000, tolerance: 1e-12});
  for (const t of T) close(r.attack[t] / r.attack.q, att[t] / att.q, `attack ${t}`, 1e-6);
  for (const t of T) close(r.defence[t] / r.defence.q, def[t] / def.q, `defence ${t}`, 1e-6);
  close(r.home, 1.3, 'home advantage', 1e-6);
  // Look-ahead: results on or after asOf change nothing.
  const asOf = '2023-01-15', a = fit(ALL, asOf, CHOSEN), changed = ALL.map(m => (m.date >= asOf && m.hg !== null ? {...m, hg: 9, ag: 0} : m)), b = fit(changed, asOf, CHOSEN);
  assert.deepEqual(b, a); assert.ok(a.latest < asOf, `latest result used ${a.latest}`);
});

test('walk-forward: no forecast changes when later results change; each forecast uses only earlier results', () => {
  const season = '2023-24', from = '2024-01-15';
  const base = walkForward(D, [season], CHOSEN), alt = walkForward(tamper(season, from), [season], CHOSEN);
  assert.equal(base.length, 380); assert.equal(alt.length, 380);
  let before = 0, after = 0;
  base.forEach((f, i) => {
    assert.ok(f.latestUsed < f.cutOff && f.cutOff <= f.date, `forecast ${f.date} cut ${f.cutOff} used ${f.latestUsed}`);
    if (f.cutOff <= from) { assert.deepEqual(alt[i].p, f.p, `${f.date} ${f.home}–${f.away}`); before++; } else if (alt[i].p.some((x, k) => x !== f.p[k])) after++;
  });
  assert.ok(before > 150 && after > 50, `unchanged before ${before}, changed after ${after}`);
  for (const f of base) close(f.p.reduce((a, b) => a + b), 1, 'probabilities sum to 1', 1e-9);
});

test('season simulation: seeded and reproducible; shares are coherent; a settled season is reproduced exactly', () => {
  const a = replay(D, '2018-19', 13, {...CHOSEN, n: 1500, seed: 7}), b = replay(D, '2018-19', 13, {...CHOSEN, n: 1500, seed: 7}), c = replay(D, '2018-19', 13, {...CHOSEN, n: 1500, seed: 8});
  assert.deepEqual(a, b, 'same seed, same output');
  assert.notDeepEqual(a.sim, c.sim, 'another seed, another draw');
  const teams = Object.keys(a.sim); assert.equal(teams.length, 20);
  close(teams.reduce((s, t) => s + a.sim[t].relegated, 0), 3, 'three relegated per simulation', 1e-9);
  for (let k = 0; k < 20; k++) close(teams.reduce((s, t) => s + a.sim[t].positions[k], 0), 1, `position ${k + 1} filled once`, 1e-9);
  for (const t of teams) { close(a.sim[t].positions.reduce((x, y) => x + y), 1, t, 1e-9); assert.ok(a.sim[t].expectedPoints >= a.sim[t].currentPoints); }
  // Nothing left to play: the simulation returns the real final table.
  const ms = ALL.filter(m => m.season === '2018-19'), fin = simulateSeason({played: ms, remaining: [], ratings: {c: 1, home: 1, attack: {}, defence: {}, rho: 0}, n: 3, seed: 1});
  const champion = Object.entries(fin).find(([, x]) => x.positions[0] === 1)[0]; assert.equal(champion, canonical('FC Barcelona'));
  assert.equal(Object.values(fin).filter(x => x.relegated === 1).length, 3);
  // rng: same seed, same sequence; in [0, 1)
  const r1 = rng(42), r2 = rng(42), xs = Array.from({length: 1000}, r1); assert.deepEqual(Array.from({length: 1000}, r2), xs); assert.ok(xs.every(x => x >= 0 && x < 1));
  close(xs.reduce((s, x) => s + x) / 1000, 0.5, 'rng mean', 0.03);
});

test('replay: reads no result after the cut-off (tampering later results changes nothing), attaches the outcome afterwards', () => {
  const season = '2021-22', a = replay(D, season, 13, {...CHOSEN, n: 800, seed: 3});
  assert.ok(a.latestResultUsed < a.cutOff, `${a.latestResultUsed} < ${a.cutOff}`);
  const b = replay(tamper(season, a.cutOff), season, 13, {...CHOSEN, n: 800, seed: 3});
  assert.deepEqual(b.sim, a.sim, 'simulation unchanged'); assert.notDeepEqual(b.actual, a.actual, 'only the attached outcome changes');
  assert.equal(Object.values(a.actual).filter(x => x.relegated).length, 3);
  // Current season: incomplete, so no outcome is attached.
  const cur = Object.entries(D.seasons).find(([, x]) => x.played < x.matches.length)?.[0];
  if (cur) assert.equal(replay(D, cur, 5, {...CHOSEN, n: 10, seed: 1}).actual, null);
});

test('validation v2: settings chosen on the tuning seasons only (grid beyond 730 days and two windows); hold-out and relegation figures reproduced from the code', () => {
  assert.equal(V.schema, 'lanova-forecast-validation-v2'); assert.equal(V.source.commit, D.source.commit);
  assert.deepEqual(V.tuning.seasons, TUNE); assert.deepEqual(V.holdout.seasons, TEST); assert.ok(TUNE.every(s => TEST.every(t => s < t)), 'every tuning season precedes every test season');
  assert.ok(V.tuning.grid.some(g => g.halfLife === 'none') && V.tuning.grid.some(g => g.halfLife === 1460) && V.tuning.grid.some(g => g.halfLife === 1095) && new Set(V.tuning.grid.map(g => g.window)).size === 2, 'grid extended beyond 730 days');
  const best = V.tuning.grid.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)); assert.deepEqual(V.tuning.chosen, {halfLife: best.halfLife, k: best.k, dixonColes: best.dixonColes, window: best.window});
  // One hold-out season recomputed now.
  const s = '2024-25', x = score(walkForward(D, [s], CHOSEN)), rep = V.holdout.perSeason.find(p => p.season === s);
  close(x.model.logLoss, rep.model.logLoss, 'log loss', 1e-6); close(x.baseRates.logLoss, rep.baseRates.logLoss, 'base rates', 1e-6); assert.equal(x.n, rep.n);
  close(V.holdout.perSeason.reduce((t, p) => t + p.n * p.model.logLoss, 0) / V.holdout.n, V.holdout.model.logLoss, 'weighted mean', 1e-5);
  // One relegation season recomputed now, with the RFEF labels.
  const rp = replay(D, '2025-26', V.matchdayForRelegation, {...CHOSEN, n: V.simulations, seed: V.seed});
  for (const t of V.relegation.teams.filter(t => t.season === '2025-26')) { const id = canonical(t.team); close(rp.sim[id].relegated, t.p, t.team, 1e-4); assert.equal(rp.actual[id].relegated, t.relegated, t.team); }
  assert.equal(V.relegation.teams.length, 20 * V.relegation.seasons.length);
  // Intervals contain their point estimates.
  const ci = V.relegation.all.ci95; assert.ok(ci.modelBrier[0] <= V.relegation.all.model.brier && V.relegation.all.model.brier <= ci.modelBrier[1]);
  assert.ok(V.holdout.ci95.logLoss[0] <= V.holdout.model.logLoss && V.holdout.model.logLoss <= V.holdout.ci95.logLoss[1]);
});

test('relegation labels: from the RFEF final tables; the corrected labels since v1 are exactly the 2025/26 head-to-head case', () => {
  assert.deepEqual(V.relegation.labelsCorrected.map(x => [x.season, x.team, x.before, x.after]), [['2025-26', 'RCD Mallorca', false, true], ['2025-26', 'Levante UD', true, false]]);
  for (const s of V.relegation.seasons) {
    const ms = ALL.filter(m => m.season === s), teams = [...new Set(ms.flatMap(m => [m.h, m.a]))], t = standings(teams, ms), name = Object.fromEntries(ms.flatMap(m => [[m.h, m.home], [m.a, m.away]]));
    const rel = new Set(t.rows.slice(17).map(r => name[r.team])); for (const x of V.relegation.teams.filter(x => x.season === s)) assert.equal(x.relegated, rel.has(x.team), `${s} ${x.team}`);
  }
  assert.equal(V.rankingSummary.relegationMatchesOfficial, 14); assert.equal(V.rankingSummary.previousRuleMatchesOfficial, 12); assert.equal(V.rankingSummary.unresolvedBlocks, 0);
  // Before/after: the v1 figures are carried unchanged from the archived v1 report.
  assert.equal(V.before.relegationAll.model.brier, V1.relegation.all.model.brier); assert.equal(V.before.holdout.logLoss, V1.holdout.model.logLoss);
});

test('postponed fixtures: a match played after the cut-off is unplayed in the table and unseen by the ratings (replay and walk-forward)', () => {
  // Move one matchday-10 result of 2021-22 to after the matchday-14 start: the replay at matchday 13 must ignore it.
  const season = '2021-22', d = structuredClone(D), rows = d.seasons[season].matches, md14 = rows.filter(r => r[1] === 14).map(r => r[0]).sort()[0];
  const i = rows.findIndex(r => r[1] === 10), moved = [...rows[i]]; rows[i] = [md14.replace(/\d\d$/, x => String(Math.min(28, +x + 2)).padStart(2, '0')), ...moved.slice(1)];
  const rp = replay(d, season, 13, {...CHOSEN, n: 50, seed: 1}), home = canonical(moved[2]);
  assert.ok(rp.latestResultUsed < rp.cutOff);
  const played = rp.table.find(r => r.team === home), direct = ALL.filter(m => m.season === season && m.matchday <= 13 && (m.h === home || m.a === home)).length;
  assert.ok(rp.sim[home].currentPoints <= played.points + 3);
  const before = replay(d, season, 13, {...CHOSEN, n: 50, seed: 1}); rows[i][4] = 9; rows[i][5] = 0; const after = replay(d, season, 13, {...CHOSEN, n: 50, seed: 1});
  assert.deepEqual(after.table, before.table, 'the postponed result does not enter the matchday-13 table'); assert.equal(after.latestResultUsed, before.latestResultUsed);
  assert.ok(direct >= 13);
  // Walk-forward: the forecast of the postponed match is made at its own (later) date and never sees its result.
  const wf = walkForward(d, [season], CHOSEN), f = wf.find(x => x.home === moved[2] && x.away === moved[3] && x.matchday === 10);
  assert.ok(f.latestUsed < f.date && f.cutOff <= f.date);
});

test('statistics helpers: Wilson interval, calibration bands with counts, seeded bootstrap', () => {
  const [lo, hi] = wilson(3, 10); close(lo, 0.1078, 'wilson low', 1e-3); close(hi, 0.6032, 'wilson high', 1e-3); assert.deepEqual(wilson(0, 0), [null, null]);
  const b = bands([[0.01, 0], [0.02, 1], [0.5, 1], [0.55, 0], [0.95, 1]]); assert.equal(b.reduce((n, x) => n + x.n, 0), 5); assert.equal(b[0].n, 2); assert.equal(b[0].events, 1);
  const x = bootstrap([1, 2, 3, 4], a => a.reduce((s, y) => s + y, 0) / a.length, {b: 500, seed: 9}); assert.deepEqual(x, bootstrap([1, 2, 3, 4], a => a.reduce((s, y) => s + y, 0) / a.length, {b: 500, seed: 9})); assert.ok(x[0] >= 1 && x[1] <= 4);
});

test('criteria: pre-registered texts unchanged; flags agree with the figures; publication not authorised whatever the flags', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(V.criteria).map(([k, x]) => [k, x.text])), {...CRITERIA});
  assert.deepEqual(Object.fromEntries(Object.entries(V1.criteria).map(([k, x]) => [k, x.text])), {...CRITERIA}, 'same criteria as v1');
  const h = V.holdout, r = V.relegation.all;
  assert.equal(V.criteria.logLossBelowBaseRates.passed, h.model.logLoss <= 0.98 * h.baseRates.logLoss);
  assert.equal(V.criteria.calibrationEce.passed, ['home', 'draw', 'away'].every(k => h.ece[k] <= 0.05));
  assert.equal(V.criteria.relegationBrierBelowPosition.passed, r.model.brier < r.position.brier);
  assert.equal(V.internalCriteriaPassed, Object.values(V.criteria).every(x => x.passed));
  assert.match(V.publication, /^Not authorised/);
  assert.ok(V.relegation.teams.every(t => t.positionBaseline > 0 && t.positionBaseline < 1));
});

test('Forecast Lab page: no current-season probability, links and CTAs, status shown, Málaga page links to it', () => {
  const html = readFileSync('lanova/cases/forecast-lab/index.html', 'utf8'), app = readFileSync('lanova/cases/forecast-lab/app.js', 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /No probability for the current season is published/);
  assert.match(app, /Independent validation: pending/); assert.match(app, /Current season: blocked/);
  // The current season is read only to list its missing results; the replay offers the validated seasons only.
  assert.equal((app.match(/2026-27/g) ?? []).length, 1); assert.match(app, /function missingCurrent\(\) \{\n  const s = D\.seasons\['2026-27'\]/);
  assert.match(app, /seasons\.slice\(\)\.reverse\(\)/); assert.match(app, /seasons = r\.seasons/);
  assert.match(app, /forecast-validation-v2\.json/);
  assert.match(html, /data-cta="software"[^>]*>Explore LANOVA Sports Software|href="..\/..\/..\/platform.html" data-cta="software">Explore LANOVA Sports Software/);
  assert.match(html, /data-cta="review" href="mailto:kevin@lake-am\.com\?subject=LANOVA%20%E2%80%94%20Winter%20Transfer%20Strategy%20Review/);
  assert.match(app, /Not a betting tool/); assert.doesNotMatch(html + app, /betting tip|place a bet/i);
  assert.match(readFileSync('lanova/cases/malaga-winter-2027/app.js', 'utf8'), /\.\.\/forecast-lab\//, 'linked from the Málaga case');
});
