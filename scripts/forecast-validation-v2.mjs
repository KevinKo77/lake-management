/**
 * Validation v2 of the LANOVA Football Forecast Lab, after the correction of the league ranking rules (RFEF
 * tie-breakers: head-to-head first, see lanova/cases/ranking.js). Produces lanova/cases/data/forecast-validation-v2.json.
 *
 * 1. Ranking check: every complete season's final table rebuilt from the open results with the RFEF rules, compared
 *    with the verified official outcomes (lanova/cases/data/official-outcomes.json) and with the previous rule.
 * 2. Tuning (2015/16–2018/19 only): half-life {120, 240, 365, 730, 1095, 1460, 2190 days, no decay} × prior strength
 *    {2, 4, 8} × Dixon–Coles {off, on} × training window {1095, 1825 days}; chosen by mean log loss of match outcomes.
 * 3. Hold-out match forecasts (2019/20–2025/26): Brier, log loss, RPS vs past frequencies and uniform; bootstrap 95%
 *    intervals (matches, and whole seasons); calibration by band with Wilson 95% intervals.
 * 4. Relegation after matchday 13 (2015/16–2025/26), labels from the RFEF final tables: Brier and log loss vs the
 *    position baseline (earlier seasons only) and a flat 15%; bootstrap intervals by team-season and by season;
 *    calibration by band with counts and Wilson intervals; the labels corrected since v1; before/after v1.
 * 5. Sensitivity (reported, not used for any choice): relegation scores across half-lives (beyond 730 days, no decay)
 *    and training windows; the ranking variant that restarts head-to-head only after head-to-head splits.
 * 6. Pre-registered criteria (unchanged from v1) re-evaluated. Passing them does not authorise publication.
 *
 * Strict chronology: every forecast uses results dated strictly before its cut-off; a match postponed beyond a
 * cut-off is unplayed at that cut-off. Deterministic: fixed seeds, no clock.
 * Usage (repo root): node scripts/forecast-validation-v2.mjs [--check]     (about 4–6 minutes)
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {walkForward, score, replay, calibration, brier, allMatches, rng, canonical} from '../lanova/cases/forecast.js';
import {standings} from '../lanova/cases/ranking.js';

const OUT = 'lanova/cases/data/forecast-validation-v2.json', V1 = 'lanova/cases/data/forecast-validation-v1.json', OFFICIAL = 'lanova/cases/data/official-outcomes.json';
const SEED = 20261124, SIMS = 4000, AT = 13, BOOT = 2000;
export const TUNE = ['2015-16', '2016-17', '2017-18', '2018-19'], TEST = ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
export const HALF_LIVES = [120, 240, 365, 730, 1095, 1460, 2190, Infinity], WINDOWS = [1095, 1825];
export const BANDS = [0, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0000001];
export const CRITERIA = Object.freeze({
  logLossBelowBaseRates: 'Hold-out log loss at least 2% below the past-frequency baseline',
  calibrationEce: 'Expected calibration error ≤ 0.05 for home win, draw and away win (hold-out)',
  relegationBrierBelowPosition: 'Relegation Brier score at matchday 13 below the position baseline (2015/16–2025/26)',
});
const r4 = v => (v === null || v === undefined || !Number.isFinite(v) ? v : Math.round(v * 1e4) / 1e4), r6 = v => Math.round(v * 1e6) / 1e6;
const hl = h => (h === Infinity ? 'none' : h), mean = a => a.reduce((s, x) => s + x, 0) / a.length;
/** Wilson 95% interval for k successes in n. */
export function wilson(k, n, z = 1.959964) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
/** Percentile bootstrap 95% interval of `stat` over resamples of `items` (seeded). */
export function bootstrap(items, stat, {b = BOOT, seed = SEED} = {}) {
  const R = rng(seed), n = items.length, v = [];
  for (let i = 0; i < b; i++) { const s = new Array(n); for (let j = 0; j < n; j++) s[j] = items[Math.floor(R() * n)]; v.push(stat(s)); }
  v.sort((x, y) => x - y); return [v[Math.floor(0.025 * b)], v[Math.ceil(0.975 * b) - 1]];
}
/** Calibration by fixed bands, with counts and Wilson intervals. pairs: [p, y]. */
export function bands(pairs, edges = BANDS) {
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1], inBand = pairs.filter(([p]) => p >= lo && p < hi), k = inBand.filter(([, y]) => y).length, n = inBand.length;
    const [wl, wh] = wilson(k, n), pred = n ? mean(inBand.map(([p]) => p)) : null;
    return {lo, hi: Math.min(1, hi), n, events: k, predicted: r4(pred), observed: n ? r4(k / n) : null, wilson95: [r4(wl), r4(wh)], predictedInsideInterval: n ? pred >= wl && pred <= wh : null};
  });
}
const relBrier = (f, list) => mean(list.map(r => { const p = f(r); return (p - (r.relegated ? 1 : 0)) ** 2; }));
const relLL = (f, list) => mean(list.map(r => -Math.log(Math.max(1e-6, r.relegated ? f(r) : 1 - f(r)))));

function adjustmentsFor(official, season) {
  return Object.fromEntries(Object.entries(official.adjustments?.[season] ?? {}).map(([name, x]) => [canonical(name), x.points]));
}
/** Ranking check: RFEF tables vs official outcomes, vs the previous rule, and vs the restart variant. */
export function rankingCheck(dataset, official) {
  const all = allMatches(dataset), out = [];
  for (const s of Object.keys(dataset.seasons)) {
    const ms = all.filter(m => m.season === s); if (ms.some(m => m.hg === null)) continue;
    const teams = [...new Set(ms.flatMap(m => [m.h, m.a]))], name = Object.fromEntries(ms.flatMap(m => [[m.h, m.home], [m.a, m.away]]));
    const adj = adjustmentsFor(official, s), t = standings(teams, ms, {adjust: adj}), variant = standings(teams, ms, {adjust: adj, restart: 'head-to-head-only'});
    const old = [...t.rows].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
    const off = official.seasons[s], rel = t.rows.slice(17).map(r => canonical(name[r.team])), relOld = old.slice(17).map(r => canonical(name[r.team]));
    const offRel = off ? off.relegated.map(canonical) : null;
    const pos = (off?.positions ?? []).map(([p, team, points]) => { const r = t.rows.find(x => x.team === canonical(team)); return {position: p, team, points, computedPosition: r?.position ?? null, computedPoints: r?.points ?? null, match: !!r && r.position === p && r.points === points}; });
    out.push({season: s, relegatedComputed: t.rows.slice(17).map(r => name[r.team]), relegatedOfficial: off?.relegated ?? null,
      relegationMatchesOfficial: offRel ? offRel.every(x => rel.includes(x)) && rel.length === 3 : null, previousRuleMatchesOfficial: offRel ? offRel.every(x => relOld.includes(x)) : null,
      positionsChecked: pos.length, positionsMatching: pos.filter(x => x.match).length, positionMismatches: pos.filter(x => !x.match),
      tiesOnPoints: t.rows.filter(r => r.decidedBy).length, decidedByHeadToHead: t.rows.filter(r => /head-to-head/.test(r.decidedBy ?? '')).length,
      orderChangesVsPreviousRule: t.rows.filter((r, i) => old[i].team !== r.team).length, unresolvedBlocks: t.unresolved.length,
      variantDiffers: variant.rows.some((r, i) => r.team !== t.rows[i].team), adjustments: off && official.adjustments?.[s] ? official.adjustments[s] : null});
  }
  return out;
}

export function validate(dataset, official, v1) {
  // 1. Ranking
  const ranking = rankingCheck(dataset, official);
  // 2. Tuning
  const grid = [];
  for (const halfLife of HALF_LIVES) for (const k of [2, 4, 8]) for (const dixonColes of [false, true]) for (const window of WINDOWS) {
    if (halfLife !== Infinity && halfLife > window) continue; // a half-life longer than the window adds nothing
    grid.push({halfLife, k, dixonColes, window, logLoss: r6(score(walkForward(dataset, TUNE, {halfLife, k, dixonColes, window})).model.logLoss)});
  }
  const best = grid.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)), chosen = {halfLife: best.halfLife, k: best.k, dixonColes: best.dixonColes, window: best.window};
  const edge = chosen.halfLife === Infinity || chosen.halfLife === HALF_LIVES.at(-2);
  // 3. Hold-out matches
  const wf = walkForward(dataset, TEST, chosen), hold = score(wf);
  const llOf = l => mean(l.map(x => -Math.log(Math.max(1e-15, x.p[x.outcome])))), llBase = l => mean(l.map(x => -Math.log(Math.max(1e-15, x.base[x.outcome]))));
  const brOf = l => mean(l.map(x => brier(x.p, x.outcome))), brBase = l => mean(l.map(x => brier(x.base, x.outcome)));
  const bySeason = TEST.map(s => wf.filter(f => f.season === s));
  const matchCI = {logLoss: bootstrap(wf, llOf), brier: bootstrap(wf, brOf), logLossGainVsBaseRates: bootstrap(wf, l => llBase(l) - llOf(l)),
    logLossGainVsBaseRatesBySeason: bootstrap(bySeason, l => { const f = l.flat(); return llBase(f) - llOf(f); }, {b: BOOT, seed: SEED + 1})};
  const perSeason = TEST.map((s, i) => { const x = score(bySeason[i]); return {season: s, n: x.n, model: {logLoss: r6(x.model.logLoss), brier: r6(x.model.brier)}, baseRates: {logLoss: r6(x.baseRates.logLoss), brier: r6(x.baseRates.brier)}}; });
  const matchBands = Object.fromEntries(['home', 'draw', 'away'].map((k, o) => [k, bands(wf.map(x => [x.p[o], x.outcome === o]))]));
  // 4. Relegation at matchday 13
  const all = allMatches(dataset), seasons = [...TUNE, ...TEST];
  const relRun = (opts, seed = SEED) => seasons.flatMap(s => {
    const rp = replay(dataset, s, AT, {...opts, n: SIMS, seed, adjust: adjustmentsFor(official, s)});
    return rp.table.map(r => ({season: s, team: rp.names[r.team], id: r.team, position13: r.position, points13: r.points, p: rp.sim[r.team].relegated,
      relegated: rp.actual[r.team].relegated, finalPosition: rp.actual[r.team].position, unresolvedTies: rp.unresolvedRelegationTies}));
  });
  const rel = relRun(chosen);
  const earlier = ['2012-13', '2013-14', '2014-15'].flatMap(s => { const rp = replay(dataset, s, AT, {...chosen, n: 1, seed: SEED, adjust: adjustmentsFor(official, s)}); return rp.table.map(r => ({season: s, position13: r.position, relegated: rp.actual[r.team].relegated})); });
  const posBase = (season, pos) => { const prior = [...earlier, ...rel.filter(r => r.season < season)].filter(r => r.position13 === pos); return prior.length ? (prior.filter(r => r.relegated).length + 0.5) / (prior.length + 1) : 0.15; };
  for (const r of rel) r.positionBaseline = posBase(r.season, r.position13);
  const relScore = list => ({n: list.length, model: {brier: r6(relBrier(r => r.p, list)), logLoss: r6(relLL(r => r.p, list))}, position: {brier: r6(relBrier(r => r.positionBaseline, list)), logLoss: r6(relLL(r => r.positionBaseline, list))},
    uniform: {brier: r6(relBrier(() => 0.15, list)), logLoss: r6(relLL(() => 0.15, list))},
    ci95: {modelBrier: bootstrap(list, l => relBrier(r => r.p, l)).map(r6), brierGainVsPosition: bootstrap(list, l => relBrier(r => r.positionBaseline, l) - relBrier(r => r.p, l)).map(r6),
      brierGainVsPositionBySeason: bootstrap([...new Set(list.map(r => r.season))].map(s => list.filter(r => r.season === s)), l => { const f = l.flat(); return relBrier(r => r.positionBaseline, f) - relBrier(r => r.p, f); }, {seed: SEED + 2}).map(r6)}});
  const relAll = relScore(rel), relHold = relScore(rel.filter(r => TEST.includes(r.season)));
  // Labels corrected since v1 (v1 used overall goal difference for ties).
  const v1Teams = v1?.relegation?.teams ?? [], corrected = rel.filter(r => { const o = v1Teams.find(x => x.season === r.season && canonical(x.team) === r.id); return o && o.relegated !== r.relegated; })
    .map(r => ({season: r.season, team: r.team, before: !r.relegated, after: r.relegated, finalPosition: r.finalPosition}));
  // 5. Sensitivity of the relegation scores (not used for the choice)
  const sensitivity = [];
  for (const halfLife of HALF_LIVES) for (const window of WINDOWS) {
    if (halfLife !== Infinity && halfLife > window) continue;
    const x = (halfLife === chosen.halfLife && window === chosen.window) ? rel : relRun({...chosen, halfLife, window});
    sensitivity.push({halfLife: hl(halfLife), window, brierAll: r6(relBrier(r => r.p, x)), brierHoldout: r6(relBrier(r => r.p, x.filter(r => TEST.includes(r.season)))), logLossAll: r6(relLL(r => r.p, x))});
  }
  const mcVar = relRun(chosen, SEED + 7), mc = {seed: SEED + 7, brierAll: r6(relBrier(r => r.p, mcVar)), maxAbsProbabilityChange: r6(Math.max(...rel.map((r, i) => Math.abs(r.p - mcVar[i].p))))};
  // 6. Criteria
  const results = {logLossBelowBaseRates: hold.model.logLoss <= 0.98 * hold.baseRates.logLoss, calibrationEce: ['home', 'draw', 'away'].every(k => hold.calibration[k].ece <= 0.05), relegationBrierBelowPosition: relAll.model.brier < relAll.position.brier};
  const v1s = v1 ? {tuningChosen: v1.tuning.chosen, holdout: {logLoss: v1.holdout.model.logLoss, brier: v1.holdout.model.brier, rps: v1.holdout.model.rps}, relegationAll: v1.relegation.all, relegationHoldout: v1.relegation.holdout, relegationEce: v1.relegation.calibration.ece} : null;
  return {schema: 'lanova-forecast-validation-v2', version: 2, supersedes: 'lanova-forecast-validation-v1 (commit 2a05287)', source: {commit: dataset.source.commit, licence: dataset.source.licence},
    seed: SEED, simulations: SIMS, bootstrapResamples: BOOT, matchdayForRelegation: AT,
    rankingRules: 'RFEF (LaLiga): points; head-to-head points and goal difference among clubs level (re-applied to sub-groups); overall goal difference; goals scored; fair play (not in the data, never broken at random). Head-to-head only when complete. Competition point adjustments applied to final tables.',
    model: 'Weighted Poisson team ratings (attack, defence, home), time-decayed, shrunk to a prior (league average, or promoted teams\' average learnt from earlier seasons); optional Dixon–Coles; fitted strictly before each forecast date.',
    ranking, rankingSummary: {seasons: ranking.length, relegationMatchesOfficial: ranking.filter(r => r.relegationMatchesOfficial).length, previousRuleMatchesOfficial: ranking.filter(r => r.previousRuleMatchesOfficial).length,
      positionsChecked: ranking.reduce((s, r) => s + r.positionsChecked, 0), positionsMatching: ranking.reduce((s, r) => s + r.positionsMatching, 0), unresolvedBlocks: ranking.reduce((s, r) => s + r.unresolvedBlocks, 0), variantDiffers: ranking.filter(r => r.variantDiffers).map(r => r.season)},
    tuning: {seasons: TUNE, grid: grid.map(g => ({...g, halfLife: hl(g.halfLife)})), chosen: {...chosen, halfLife: hl(chosen.halfLife)}, chosenAtGridEdge: edge},
    holdout: {seasons: TEST, n: hold.n, model: {brier: r6(hold.model.brier), logLoss: r6(hold.model.logLoss), rps: r6(hold.model.rps)}, baseRates: {brier: r6(hold.baseRates.brier), logLoss: r6(hold.baseRates.logLoss), rps: r6(hold.baseRates.rps)},
      uniform: {brier: r6(hold.uniform.brier), logLoss: r6(hold.uniform.logLoss), rps: r6(hold.uniform.rps)}, ci95: Object.fromEntries(Object.entries(matchCI).map(([k, v]) => [k, v.map(r6)])),
      ece: {home: r4(hold.calibration.home.ece), draw: r4(hold.calibration.draw.ece), away: r4(hold.calibration.away.ece)}, bands: matchBands, perSeason},
    relegation: {seasons, all: relAll, holdout: relHold, bands: bands(rel.map(r => [r.p, r.relegated])), ece: r4(calibration(rel.map(r => [r.p, r.relegated ? 1 : 0]), 5).ece),
      unresolvedTieShare: {mean: r6(mean(rel.map(r => r.unresolvedTies)) ), max: r6(Math.max(...rel.map(r => r.unresolvedTies)))}, labelsCorrected: corrected, monteCarlo: mc, sensitivity,
      teams: rel.map(r => ({season: r.season, team: r.team, position13: r.position13, points13: r.points13, p: r4(r.p), positionBaseline: r4(r.positionBaseline), relegated: r.relegated, finalPosition: r.finalPosition}))},
    before: v1s, criteria: Object.fromEntries(Object.entries(CRITERIA).map(([k, text]) => [k, {text, passed: results[k]}])), internalCriteriaPassed: Object.values(results).every(Boolean),
    reproduce: ['git clone https://github.com/openfootball/espana && git -C espana checkout 80035a93dd', 'node scripts/build-football-dataset.mjs espana --check', 'node scripts/forecast-validation-v2.mjs --check', 'node --test tests/ranking.test.mjs tests/forecast.test.mjs'],
    publication: 'Not authorised: passing the internal criteria is necessary, not sufficient. A survival probability is published only after an independent review of this report, complete current-season data and the founder\'s approval.'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataset = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), official = JSON.parse(readFileSync(OFFICIAL, 'utf8')), v1 = existsSync(V1) ? JSON.parse(readFileSync(V1, 'utf8')) : null;
  const t0 = Date.now(), v = validate(dataset, official, v1), text = JSON.stringify(v) + '\n';
  if (process.argv[2] === '--check') { const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text; console.log(same ? `${OUT} is reproduced exactly` : `${OUT} differs from a fresh run`); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  const h = v.holdout, r = v.relegation;
  console.log(`ranking: relegation matches official ${v.rankingSummary.relegationMatchesOfficial}/${v.rankingSummary.seasons} (previous rule ${v.rankingSummary.previousRuleMatchesOfficial}); positions ${v.rankingSummary.positionsMatching}/${v.rankingSummary.positionsChecked}; unresolved ${v.rankingSummary.unresolvedBlocks}; variant differs ${v.rankingSummary.variantDiffers}`);
  console.log(`chosen ${JSON.stringify(v.tuning.chosen)} edge=${v.tuning.chosenAtGridEdge} · hold-out n=${h.n} log loss ${h.model.logLoss} [${h.ci95.logLoss}] vs base ${h.baseRates.logLoss}; gain CI ${h.ci95.logLossGainVsBaseRates} (by season ${h.ci95.logLossGainVsBaseRatesBySeason}); ECE ${JSON.stringify(h.ece)}`);
  console.log(`relegation all: Brier ${r.all.model.brier} ${JSON.stringify(r.all.ci95)} vs position ${r.all.position.brier} flat ${r.all.uniform.brier}; hold-out ${r.holdout.model.brier} vs ${r.holdout.position.brier}; ECE ${r.ece}; corrected labels ${JSON.stringify(r.labelsCorrected)}; unresolved ${JSON.stringify(r.unresolvedTieShare)}`);
  console.log(`criteria ${JSON.stringify(Object.fromEntries(Object.entries(v.criteria).map(([k, x]) => [k, x.passed])))} · ${Math.round((Date.now() - t0) / 1000)} s`);
}
