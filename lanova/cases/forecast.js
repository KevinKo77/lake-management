/**
 * LANOVA Football Forecast Lab — team ratings, match probabilities, seeded season simulation and walk-forward
 * evaluation (pure functions, no DOM, no network; the dataset is passed in).
 *
 * Model
 *   λ_home = c · H · att_home · def_away        λ_away = c · att_away · def_home
 * fitted by weighted Poisson maximum likelihood (iterative scaling) on matches played strictly BEFORE the forecast
 * date. Weights halve every `halfLife` days. Each team's strengths are pulled towards a prior centre by `k`
 * pseudo-matches: the league average, or for a team new to the league the average first-season strength of
 * previously promoted teams, learnt only from seasons completed before the forecast date. An optional Dixon–Coles
 * correction (ρ) adjusts the four low scores; ρ is fitted on the same past matches.
 *
 * Nothing here looks at a match on or after the forecast date (tested). Simulations use a seeded generator, so the
 * same inputs always give the same output (tested).
 */
import {poisson, rows} from './football.js';
import {standings, tally, amongFrom, straddlesRelegation} from './ranking.js';

// ------------------------------------------------------------------ identity
const STRIP = new Set(['fc', 'cf', 'c', 'f', 'cd', 'rc', 'rcd', 'ud', 'sd', 'ca', 'club', 'de', 'del', 'balompie', 'futbol']);
const ALIAS = {'rayo vallecano madrid': 'rayo vallecano', 'espanyol barcelona': 'espanyol', 'celta vigo': 'celta', 'deportivo alaves': 'alaves', 'real racing santander': 'racing santander'};
/** A stable identifier for a club across seasons whose files spell its name differently. */
export function canonical(name) {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, ' ').split(/\s+/).filter(w => w && !STRIP.has(w)).join(' ');
  return ALIAS[s] ?? s;
}
/** Every match of the dataset, in date order, with canonical team ids and its season. */
export function allMatches(dataset) {
  const out = [];
  for (const [season, s] of Object.entries(dataset.seasons)) for (const m of rows(s.matches)) out.push({...m, season, h: canonical(m.home), a: canonical(m.away)});
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.season.localeCompare(y.season) || x.h.localeCompare(y.h));
}
const DAY = 86_400_000, days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const nextDay = d => new Date(Date.parse(d) + DAY).toISOString().slice(0, 10);

// ------------------------------------------------------------------ ratings
export const DEFAULTS = Object.freeze({halfLife: 240, k: 4, window: 1095, dixonColes: true, iterations: 300, tolerance: 1e-7});
/**
 * Average strengths of teams in their first season in the league (absent the previous season), measured at the end
 * of each COMPLETE season that ended before `asOf`. Returns {attack, defence, seasons} or null if none.
 */
export function newTeamPrior(all, asOf, cache = new Map()) {
  const seasons = [...new Set(all.map(m => m.season))].sort(), res = [];
  for (let i = 1; i < seasons.length; i++) {
    const s = seasons[i], ms = all.filter(m => m.season === s);
    if (ms.some(m => m.hg === null) || ms.at(-1).date >= asOf) continue;
    let r = cache.get(s);
    if (!r) { r = fit(ms, nextDay(ms.at(-1).date), {halfLife: Infinity, k: 0, window: 400, dixonColes: false, prior: () => [1, 1]}); cache.set(s, r); }
    const prev = new Set(all.filter(m => m.season === seasons[i - 1]).flatMap(m => [m.h, m.a]));
    for (const t of Object.keys(r.attack)) if (!prev.has(t)) res.push([r.attack[t], r.defence[t]]);
  }
  if (!res.length) return null;
  const g = i => Math.exp(res.reduce((s, x) => s + Math.log(x[i]), 0) / res.length);
  return {attack: g(0), defence: g(1), teams: res.length};
}
/**
 * Fits the model on matches strictly before `asOf` (and within `window` days). `teams` (optional) lists every team
 * that needs a rating (e.g. the current season's), so a team without recent matches gets its prior.
 */
export function fit(all, asOf, opts = {}) {
  const o = {...DEFAULTS, ...opts}, past = all.filter(m => m.hg !== null && m.date < asOf && days(m.date, asOf) <= o.window);
  const w = past.map(m => (o.halfLife === Infinity ? 1 : 0.5 ** (days(m.date, asOf) / o.halfLife)));
  const teams = [...new Set([...past.flatMap(m => [m.h, m.a]), ...(o.teams ?? [])])];
  const init = o.init ?? null, att = Object.fromEntries(teams.map(t => [t, init?.attack[t] ?? 1])), def = Object.fromEntries(teams.map(t => [t, init?.defence[t] ?? 1]));
  const W = w.reduce((s, x) => s + x, 0) || 1, g0 = past.reduce((s, m, i) => s + w[i] * (m.hg + m.ag), 0) / (2 * W) || 1.3;
  let c = init?.c ?? (past.reduce((s, m, i) => s + w[i] * m.ag, 0) / W || 1.1), H = init?.home ?? ((past.reduce((s, m, i) => s + w[i] * m.hg, 0) / W || 1.5) / c);
  // Index form of the matches, for speed.
  const ix = Object.fromEntries(teams.map((t, i) => [t, i])), hI = past.map(m => ix[m.h]), aI = past.map(m => ix[m.a]), A = teams.map(t => att[t]), Df = teams.map(t => def[t]);
  const cen = teams.map(t => centre0(t)); function centre0(t) { return (o.prior ?? (() => [1, 1]))(t); }
  let iterations = 0;
  const n = teams.length, G = new Float64Array(n), C = new Float64Array(n);
  past.forEach((m, i) => { G[hI[i]] += w[i] * m.hg; G[aI[i]] += w[i] * m.ag; C[hI[i]] += w[i] * m.ag; C[aI[i]] += w[i] * m.hg; });
  for (let it = 0; it < o.iterations; it++) {
    iterations = it + 1;
    const E = new Float64Array(n), F = new Float64Array(n);
    for (let i = 0; i < past.length; i++) { const x = w[i], h = hI[i], a = aI[i]; E[h] += x * c * H * Df[a]; E[a] += x * c * Df[h]; F[h] += x * c * A[a]; F[a] += x * c * H * A[h]; }
    let change = 0;
    for (let t = 0; t < n; t++) {
      const na = (G[t] + o.k * g0 * cen[t][0]) / (E[t] + o.k * g0), nd = (C[t] + o.k * g0 * cen[t][1]) / (F[t] + o.k * g0);
      change = Math.max(change, Math.abs(na - A[t]) / A[t], Math.abs(nd - Df[t]) / Df[t]); A[t] = na; Df[t] = nd;
    }
    let num = 0, den = 0, hn = 0, hd = 0;
    for (let i = 0; i < past.length; i++) { const m = past[i], h = hI[i], a = aI[i]; num += w[i] * (m.hg + m.ag); den += w[i] * (H * A[h] * Df[a] + A[a] * Df[h]); hn += w[i] * m.hg; hd += w[i] * c * A[h] * Df[a]; }
    const nc = den > 0 ? num / den : c, nH = hd > 0 ? hn / hd : H; change = Math.max(change, Math.abs(nc - c) / c, Math.abs(nH - H) / H); c = nc; H = nH;
    if (change < o.tolerance) break;
  }
  teams.forEach((t, i) => { att[t] = A[i]; def[t] = Df[i]; });
  let rho = 0;
  if (o.dixonColes && past.length > 200) {
    let best = -Infinity;
    for (let r = -0.2; r <= 0.1001; r += 0.01) {
      let ll = 0; past.forEach((m, i) => { const lh = c * H * att[m.h] * def[m.a], la = c * att[m.a] * def[m.h]; ll += w[i] * Math.log(Math.max(1e-12, tau(m.hg, m.ag, lh, la, r))); });
      if (ll > best) { best = ll; rho = Math.round(r * 100) / 100; }
    }
  }
  return {asOf, c, home: H, attack: att, defence: def, rho, matches: past.length, latest: past.at(-1)?.date ?? null, iterations, options: {...o, prior: undefined, teams: undefined, init: undefined}};
}
function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho; if (x === 0 && y === 1) return 1 + lh * rho; if (x === 1 && y === 0) return 1 + la * rho; if (x === 1 && y === 1) return 1 - rho; return 1;
}
/** Expected goals of a match under a fitted rating set. */
export const means = (r, h, a) => ({home: r.c * r.home * r.attack[h] * r.defence[a], away: r.c * r.attack[a] * r.defence[h]});
/** Full score matrix (0..n goals each) with the Dixon–Coles adjustment, renormalised to sum to 1. */
export function scoreMatrix(lh, la, rho = 0, n = 10) {
  const ph = poisson(lh, n), pa = poisson(la, n), M = ph.map((p, i) => pa.map((q, j) => p * q * tau(i, j, lh, la, rho)));
  const s = M.flat().reduce((x, y) => x + y, 0); return M.map(r => r.map(v => v / s));
}
/** Home win, draw, away win probabilities. */
export function probabilities(r, h, a) {
  const {home, away} = means(r, h, a), M = scoreMatrix(home, away, r.rho);
  let pH = 0, pD = 0, pA = 0; M.forEach((row, i) => row.forEach((v, j) => { if (i > j) pH += v; else if (i === j) pD += v; else pA += v; }));
  return {home: pH, draw: pD, away: pA, lambdaHome: home, lambdaAway: away};
}

// ------------------------------------------------------------------ scoring rules
const outcomeOf = m => (m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2);
export function brier(p, o) { return p.reduce((s, x, k) => s + (x - (k === o ? 1 : 0)) ** 2, 0); }
export function logLoss(p, o) { return -Math.log(Math.max(1e-15, p[o])); }
export function rps(p, o) { const y = [0, 0, 0]; y[o] = 1; return ((p[0] - y[0]) ** 2 + (p[0] + p[1] - y[0] - y[1]) ** 2) / 2; }
/** Reliability table: predicted probability bins vs observed frequency, and the expected calibration error. */
export function calibration(pairs, bins = 10) {
  const b = Array.from({length: bins}, (_, i) => ({lo: i / bins, hi: (i + 1) / bins, n: 0, p: 0, y: 0}));
  for (const [p, y] of pairs) { const k = Math.min(bins - 1, Math.floor(p * bins)); b[k].n++; b[k].p += p; b[k].y += y; }
  const used = b.filter(x => x.n).map(x => ({lo: x.lo, hi: x.hi, n: x.n, predicted: x.p / x.n, observed: x.y / x.n}));
  const N = pairs.length || 1; return {bins: used, ece: used.reduce((s, x) => s + x.n / N * Math.abs(x.predicted - x.observed), 0), n: pairs.length};
}

// ------------------------------------------------------------------ walk-forward match evaluation
/**
 * For every match of the test seasons, the forecast made with data strictly before that match's date (one fit per
 * date). Baselines: uniform (⅓ each) and the home/draw/away frequencies of all matches before the season.
 */
export function walkForward(dataset, seasons, opts = {}) {
  const all = allMatches(dataset), cache = new Map(), out = [];
  for (const season of seasons) {
    const ms = all.filter(m => m.season === season && m.hg !== null), start = ms[0].date, before = all.filter(m => m.hg !== null && m.date < start);
    const freq = [0, 1, 2].map(k => before.filter(m => outcomeOf(m) === k).length / before.length);
    const teams = [...new Set(all.filter(m => m.season === season).flatMap(m => [m.h, m.a]))];
    // New-team prior and "new team" set: fixed at the season's start, from completed seasons only.
    const pr = newTeamPrior(all, start, cache), prev = new Set(all.filter(m => m.hg !== null && m.date < start && days(m.date, start) <= 400).flatMap(m => [m.h, m.a]));
    const prior = t => (!prev.has(t) && pr ? [pr.attack, pr.defence] : [1, 1]);
    let init = null;
    for (const md of [...new Set(ms.map(m => m.matchday))].sort((x, y) => x - y)) {
      const group = ms.filter(m => m.matchday === md), cut = group.reduce((d, m) => (m.date < d ? m.date : d), '9999');
      // Ratings from matches strictly before the first match of the matchday: no match of the matchday or later is seen.
      const ratings = fit(all, cut, {...opts, teams, prior, init}); init = ratings;
      for (const m of group) {
        const p = probabilities(ratings, m.h, m.a), P = [p.home, p.draw, p.away];
        out.push({season, date: m.date, matchday: m.matchday, home: m.home, away: m.away, outcome: outcomeOf(m), p: P, base: freq, cutOff: cut, latestUsed: ratings.latest});
      }
    }
  }
  return out;
}
/** Summary scores of a set of forecasts, for the model and the two baselines. */
export function score(list) {
  const avg = f => list.reduce((s, x) => s + f(x), 0) / list.length, U = [1 / 3, 1 / 3, 1 / 3];
  return {n: list.length,
    model: {brier: avg(x => brier(x.p, x.outcome)), logLoss: avg(x => logLoss(x.p, x.outcome)), rps: avg(x => rps(x.p, x.outcome))},
    uniform: {brier: avg(x => brier(U, x.outcome)), logLoss: avg(x => logLoss(U, x.outcome)), rps: avg(x => rps(U, x.outcome))},
    baseRates: {brier: avg(x => brier(x.base, x.outcome)), logLoss: avg(x => logLoss(x.base, x.outcome)), rps: avg(x => rps(x.base, x.outcome))},
    calibration: {home: calibration(list.map(x => [x.p[0], x.outcome === 0 ? 1 : 0])), draw: calibration(list.map(x => [x.p[1], x.outcome === 1 ? 1 : 0])), away: calibration(list.map(x => [x.p[2], x.outcome === 2 ? 1 : 0]))}};
}

// ------------------------------------------------------------------ season simulation
/** Small, fast, seeded pseudo-random generator (mulberry32). Same seed → same sequence. */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sampleScore(M, u) { let s = 0; for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) { s += M[i][j]; if (u < s) return [i, j]; } return [M.length - 1, M.length - 1]; }
/**
 * Simulates the rest of a season from a state (matches with goals) and its remaining fixtures, `n` times with a
 * seed. Each simulated final table is ranked with the RFEF rules (ranking.js): points, then head-to-head (points and
 * goal difference among the clubs level, re-applied to sub-groups), then overall goal difference and goals scored.
 * A tie that only fair play could break (not in the data) is not broken at random: its clubs share the block's
 * positions equally, and the share of simulations in which such a block straddles the relegation line is reported.
 * Returns, per team, the share of simulations in each final position, the relegation share (last `relegated`
 * places), the average points, and `unresolvedRelegationTies` (share of simulations with a straddling block).
 * `adjust`: points added or removed by the competition ({team: -3}).
 */
export function simulateSeason({played, remaining, ratings, n = 5000, seed = 20261124, relegated = 3, adjust = {}}) {
  const fixtures = [...played, ...remaining], teams = [...new Set(fixtures.flatMap(m => [m.h, m.a]))], N = teams.length;
  const base = tally(teams, played);
  for (const [t, d] of Object.entries(adjust)) if (base[t]) base[t].points += d;
  const mats = remaining.map(m => { const mm = means(ratings, m.h, m.a); return scoreMatrix(mm.home, mm.away, ratings.rho); });
  // Fixtures between each pair, as references into the current simulation's scores (for head-to-head).
  const cur = fixtures.map(m => ({h: m.h, a: m.a, hg: m.hg, ag: m.ag})), remIdx = remaining.map((_, i) => played.length + i), among = amongFrom(cur);
  const R = rng(seed), pos = Object.fromEntries(teams.map(t => [t, new Float64Array(N)])), pts = Object.fromEntries(teams.map(t => [t, 0]));
  let straddle = 0;
  for (let s = 0; s < n; s++) {
    const tb = Object.fromEntries(teams.map(t => [t, {...base[t]}]));
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i], [x, y] = sampleScore(mats[i], R()), H = tb[m.h], A = tb[m.a], c = cur[remIdx[i]]; c.hg = x; c.ag = y;
      H.gf += x; A.gf += y; H.ga += y; A.ga += x; H.gd += x - y; A.gd += y - x; if (x > y) H.points += 3; else if (x < y) A.points += 3; else { H.points++; A.points++; }
    }
    const table = standings(teams, cur, {overall: tb, among});
    for (const r of table.rows) {
      const [p0, p1] = r.sharedPositions ?? [r.position, r.position], w = 1 / (p1 - p0 + 1);
      for (let k = p0; k <= p1; k++) pos[r.team][k - 1] += w;
      pts[r.team] += r.points;
    }
    if (straddlesRelegation(table, relegated)) straddle++;
  }
  const out = Object.fromEntries(teams.map(t => [t, {positions: [...pos[t]].map(c => c / n), relegated: [...pos[t]].slice(N - relegated).reduce((a, b) => a + b, 0) / n, expectedPoints: pts[t] / n, currentPoints: base[t].points}]));
  Object.defineProperty(out, 'unresolvedRelegationTies', {value: straddle / n, enumerable: false});
  return out;
}
/**
 * Historical replay at a matchday: ratings from matches before the first remaining fixture, simulation of the rest,
 * and the actual final outcome (the replay never reads results after the cut-off; the outcome is attached afterwards).
 */
export function replay(dataset, season, afterMatchday, {n = 5000, seed = 20261124, adjust = null, ...opts} = {}) {
  const all = allMatches(dataset), ms = all.filter(m => m.season === season);
  // Cut-off: the first match of a later matchday. A match of an earlier matchday postponed beyond it is treated as
  // not yet played, so neither the table nor the ratings know a result from after the cut-off.
  const cut = ms.filter(m => m.matchday > afterMatchday).reduce((d, m) => (m.date < d ? m.date : d), '9999');
  const played = ms.filter(m => m.matchday <= afterMatchday && m.hg !== null && m.date < cut), remaining = ms.filter(m => !played.includes(m));
  const teams = [...new Set(ms.flatMap(m => [m.h, m.a]))];
  const pr = newTeamPrior(all, cut), prev = new Set(all.filter(m => m.hg !== null && m.date < cut && days(m.date, cut) <= 400 && m.season !== season).flatMap(m => [m.h, m.a]));
  const visible = all.filter(m => m.date < cut && (m.season !== season || played.includes(m)));
  const ratings = fit(visible, cut, {...opts, teams, prior: t => (!prev.has(t) && pr ? [pr.attack, pr.defence] : [1, 1])});
  // Point adjustments decided by the competition (e.g. a deduction) are known only at the end: they apply to the final
  // table, not to the simulation from the cut-off.
  const sim = simulateSeason({played, remaining: remaining.map(m => ({...m, hg: null, ag: null})), ratings, n, seed});
  // Table at the cut-off (RFEF rules; an incomplete head-to-head is skipped, as during a season).
  const now = standings(teams, ms.map(m => (played.includes(m) ? m : {...m, hg: null, ag: null})));
  let actual = null;
  if (ms.every(m => m.hg !== null)) {
    const fin = standings(teams, ms, {adjust: adjust ?? {}}), N = teams.length;
    actual = Object.fromEntries(fin.rows.map(r => [r.team, {position: r.position, sharedPositions: r.sharedPositions, relegated: r.sharedPositions ? null : r.position > N - 3, points: r.points, decidedBy: r.decidedBy}]));
  }
  return {season, afterMatchday, cutOff: cut, ratingsFrom: ratings.matches, latestResultUsed: ratings.latest, sim, unresolvedRelegationTies: sim.unresolvedRelegationTies, actual,
    table: now.rows.map(r => ({team: r.team, position: r.position, points: r.points, gd: r.gd, gf: r.gf, sharedPositions: r.sharedPositions})), names: Object.fromEntries(ms.flatMap(m => [[m.h, m.home], [m.a, m.away]]))};
}
