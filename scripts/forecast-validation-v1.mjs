/**
 * ARCHIVED (superseded by scripts/forecast-validation-v2.mjs). This produced forecast-validation-v1.json at commit
 * 2a05287 with the previous ranking (overall goal difference, random order for exact ties). It is kept, unchanged in
 * substance, as the 'before' reference; it no longer reproduces the v1 file because the engine now ranks with the
 * RFEF rules. To reproduce v1 exactly: git checkout 2a05287 && node scripts/forecast-validation.mjs --check.
 *
 * Walk-forward validation of the LANOVA Football Forecast Lab (lanova/cases/forecast.js) on the CC0 LaLiga dataset.
 *
 * 1. Tuning (2015/16–2018/19): a small grid of settings, chosen by mean log loss of match outcomes.
 * 2. Hold-out test (2019/20–2025/26): the chosen settings only; compared with two baselines (uniform; past
 *    home/draw/away frequencies). Brier score, log loss, ranked probability score, calibration (reliability, ECE).
 * 3. Relegation at matchday 13 (2015/16–2025/26): seeded season simulations; Brier score and log loss of
 *    P(relegated) against the final table, compared with a baseline from the position at matchday 13 (frequency of
 *    relegation for that position in earlier seasons only) and a uniform 3/20.
 * 4. Pre-registered internal criteria (below). Passing them does NOT authorise publishing a probability: that needs
 *    an independent review.
 *
 * Deterministic: no clock, fixed seed. Usage (repo root): node scripts/forecast-validation.mjs [--check]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {walkForward, score, replay, calibration, brier, allMatches} from '../lanova/cases/forecast.js';

const OUT = 'lanova/cases/data/forecast-validation-v1.json', SEED = 20261124, SIMS = 4000, AT = 13;
const TUNE = ['2015-16', '2016-17', '2017-18', '2018-19'], TEST = ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
const GRID = [];
for (const halfLife of [120, 240, 365, 730]) for (const k of [2, 4, 8]) for (const dixonColes of [false, true]) GRID.push({halfLife, k, dixonColes});
export const CRITERIA = Object.freeze({
  logLossBelowBaseRates: 'Hold-out log loss at least 2% below the past-frequency baseline',
  calibrationEce: 'Expected calibration error ≤ 0.05 for home win, draw and away win (hold-out)',
  relegationBrierBelowPosition: 'Relegation Brier score at matchday 13 below the position baseline (2015/16–2025/26)',
});
const r4 = v => Math.round(v * 1e4) / 1e4, r6 = v => Math.round(v * 1e6) / 1e6;
const strip = s => ({n: s.n, model: map(s.model), uniform: map(s.uniform), baseRates: map(s.baseRates), calibration: Object.fromEntries(Object.entries(s.calibration).map(([k, c]) => [k, {ece: r4(c.ece), n: c.n, bins: c.bins.map(b => ({lo: b.lo, hi: r4(b.hi), n: b.n, predicted: r4(b.predicted), observed: r4(b.observed)}))}]))});
const map = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r6(v)]));

export function validate(dataset) {
  // 1. Tuning
  const tuning = GRID.map(g => ({...g, logLoss: r6(score(walkForward(dataset, TUNE, g)).model.logLoss)}));
  const best = tuning.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)), chosen = {halfLife: best.halfLife, k: best.k, dixonColes: best.dixonColes};
  // 2. Hold-out
  const wf = walkForward(dataset, TEST, chosen), hold = score(wf);
  const perSeason = TEST.map(s => { const x = score(wf.filter(f => f.season === s)); return {season: s, n: x.n, model: map(x.model), baseRates: map(x.baseRates)}; });
  // 3. Relegation at matchday 13
  const all = allMatches(dataset), rel = [], seasons = [...TUNE, ...TEST];
  for (const s of seasons) {
    const rp = replay(dataset, s, AT, {...chosen, n: SIMS, seed: SEED});
    // Position at matchday 13 (points, goal difference, goals; same rule as the simulation).
    const table = Object.entries(rp.sim).map(([t]) => t), st = {};
    for (const t of table) st[t] = {pts: 0, gd: 0, gf: 0};
    for (const m of all.filter(m => m.season === s && m.matchday <= AT && m.hg !== null && m.date < rp.cutOff)) { st[m.h].gf += m.hg; st[m.a].gf += m.ag; st[m.h].gd += m.hg - m.ag; st[m.a].gd += m.ag - m.hg; if (m.hg > m.ag) st[m.h].pts += 3; else if (m.hg < m.ag) st[m.a].pts += 3; else { st[m.h].pts++; st[m.a].pts++; } }
    const order = table.sort((p, q) => st[q].pts - st[p].pts || st[q].gd - st[p].gd || st[q].gf - st[p].gf || p.localeCompare(q));
    order.forEach((t, i) => rel.push({season: s, team: rp.names[t], position13: i + 1, points13: st[t].pts, p: r4(rp.sim[t].relegated), relegated: rp.actual[t].relegated, finalPosition: rp.actual[t].position}));
  }
  // Position baseline: share relegated at each matchday-13 position in EARLIER seasons of the dataset only.
  const earlier = [];
  for (const s of ['2012-13', '2013-14', '2014-15']) { const rp = replay(dataset, s, AT, {...chosen, n: 1, seed: SEED}); const st = {}; for (const t of Object.keys(rp.sim)) st[t] = {pts: 0, gd: 0, gf: 0};
    for (const m of all.filter(m => m.season === s && m.matchday <= AT && m.hg !== null && m.date < rp.cutOff)) { st[m.h].gf += m.hg; st[m.a].gf += m.ag; st[m.h].gd += m.hg - m.ag; st[m.a].gd += m.ag - m.hg; if (m.hg > m.ag) st[m.h].pts += 3; else if (m.hg < m.ag) st[m.a].pts += 3; else { st[m.h].pts++; st[m.a].pts++; } }
    Object.keys(st).sort((p, q) => st[q].pts - st[p].pts || st[q].gd - st[p].gd || st[q].gf - st[p].gf || p.localeCompare(q)).forEach((t, i) => earlier.push({season: s, position13: i + 1, relegated: rp.actual[t].relegated})); }
  const posBase = (season, pos) => { const prior = [...earlier, ...rel.filter(r => r.season < season)].filter(r => r.position13 === pos); return prior.length ? (prior.filter(r => r.relegated).length + 0.5) / (prior.length + 1) : 0.15; };
  for (const r of rel) r.positionBaseline = r4(posBase(r.season, r.position13));
  const B = (f, list) => list.reduce((s, r) => s + brier([f(r), 1 - f(r)], r.relegated ? 0 : 1), 0) / list.length / 2;
  const LL = (f, list) => list.reduce((s, r) => s - Math.log(Math.max(1e-6, r.relegated ? f(r) : 1 - f(r))), 0) / list.length;
  const relScore = list => ({n: list.length, model: {brier: r6(B(r => r.p, list)), logLoss: r6(LL(r => r.p, list))}, position: {brier: r6(B(r => r.positionBaseline, list)), logLoss: r6(LL(r => r.positionBaseline, list))}, uniform: {brier: r6(B(() => 0.15, list)), logLoss: r6(LL(() => 0.15, list))}});
  const relAll = relScore(rel), relTest = relScore(rel.filter(r => TEST.includes(r.season))), relCal = calibration(rel.map(r => [r.p, r.relegated ? 1 : 0]), 5);
  // 4. Criteria
  const results = {
    logLossBelowBaseRates: hold.model.logLoss <= 0.98 * hold.baseRates.logLoss,
    calibrationEce: ['home', 'draw', 'away'].every(k => hold.calibration[k].ece <= 0.05),
    relegationBrierBelowPosition: relAll.model.brier < relAll.position.brier,
  };
  return {schema: 'lanova-forecast-validation-v1', source: {commit: dataset.source.commit, licence: dataset.source.licence}, seed: SEED, simulations: SIMS, matchdayForRelegation: AT,
    model: 'Weighted Poisson team ratings (attack, defence, home), time-decayed, shrunk to a prior (league average, or promoted teams\' average learnt from earlier seasons); optional Dixon–Coles low-score correction; fitted strictly before each forecast date.',
    tuning: {seasons: TUNE, grid: tuning, chosen}, holdout: {seasons: TEST, ...strip(hold), perSeason},
    relegation: {seasons, all: relAll, holdout: relTest, calibration: {ece: r4(relCal.ece), bins: relCal.bins.map(b => ({lo: b.lo, hi: r4(b.hi), n: b.n, predicted: r4(b.predicted), observed: r4(b.observed)}))}, teams: rel},
    criteria: Object.fromEntries(Object.entries(CRITERIA).map(([k, text]) => [k, {text, passed: results[k]}])), internalCriteriaPassed: Object.values(results).every(Boolean),
    publication: 'Not authorised: passing the internal criteria is necessary, not sufficient. A survival probability is published only after an independent review of this report and of the current-season data.'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataset = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), t0 = Date.now(), v = validate(dataset), text = JSON.stringify(v) + '\n';
  if (process.argv[2] === '--check') { const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text; console.log(same ? `${OUT} is reproduced exactly` : `${OUT} differs from a fresh run`); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  const h = v.holdout;
  console.log(`chosen ${JSON.stringify(v.tuning.chosen)} · hold-out n=${h.n}: log loss ${h.model.logLoss} (base rates ${h.baseRates.logLoss}, uniform ${h.uniform.logLoss}); Brier ${h.model.brier} (${h.baseRates.brier}); RPS ${h.model.rps} (${h.baseRates.rps}); ECE H/D/A ${h.calibration.home.ece}/${h.calibration.draw.ece}/${h.calibration.away.ece}`);
  console.log(`relegation at MD${AT}, ${v.relegation.all.n} team-seasons: Brier model ${v.relegation.all.model.brier} · position ${v.relegation.all.position.brier} · uniform ${v.relegation.all.uniform.brier}; log loss ${v.relegation.all.model.logLoss} · ${v.relegation.all.position.logLoss} · ${v.relegation.all.uniform.logLoss}`);
  console.log(`criteria: ${JSON.stringify(Object.fromEntries(Object.entries(v.criteria).map(([k, x]) => [k, x.passed])))} · ${Date.now() - t0} ms`);
}
