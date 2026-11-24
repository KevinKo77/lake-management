/**
 * LANOVA case studies — football goal model (pure functions, no DOM, no network).
 *
 * An explicit, documented model of match goals: each side's goals in a match follow independent Poisson
 * distributions whose means are the league's home or away scoring rate × the side's attack strength × the opponent's
 * defence weakness. Strengths are ratios to the league average, estimated from actual goals (no expected-goals
 * data is used: none is available under a licence that permits this use) and shrunk towards the league average by a
 * stated number of "prior matches", so that a few matches do not produce extreme estimates.
 *
 * Release 1 uses this model only for EXPECTED values (expected points, expected goals). It shows no probability of a
 * league outcome: that requires the validated forecasting engine of a later release.
 */
export const MAX_GOALS = 15;

/** Poisson probabilities P(X = 0..n) for mean λ. */
export function poisson(lambda, n = MAX_GOALS) {
  if (!(lambda >= 0) || !Number.isFinite(lambda)) throw new RangeError('Poisson mean must be a finite number ≥ 0');
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= n; k++) p.push(p[k - 1] * lambda / k);
  return p;
}
/**
 * Home win, draw and away win probabilities for one match under independent Poisson goals (exact sum over scores up
 * to MAX_GOALS each; the omitted tail is below 1e-9 for the means used here and is reported as `tail`).
 */
export function outcome(lh, la) {
  const ph = poisson(lh), pa = poisson(la);
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= MAX_GOALS; i++) for (let j = 0; j <= MAX_GOALS; j++) { const q = ph[i] * pa[j]; if (i > j) win += q; else if (i === j) draw += q; else loss += q; }
  return {win, draw, loss, tail: Math.max(0, 1 - win - draw - loss)};
}
/** Expected league points of a side with win/draw/loss probabilities (3 for a win, 1 for a draw). */
export const expectedPoints = o => 3 * o.win + o.draw;

/** League scoring rates from played matches: home goals per match, away goals per match, and per team-match. */
export function leagueRates(matches) {
  const played = matches.filter(m => m.hg !== null && m.hg !== undefined);
  if (!played.length) throw new Error('No played match to estimate league rates');
  const home = played.reduce((s, m) => s + m.hg, 0) / played.length, away = played.reduce((s, m) => s + m.ag, 0) / played.length;
  return {home, away, perTeamMatch: (home + away) / 2, matches: played.length};
}
/**
 * Attack and defence strengths per team, as ratios to the league average goals per team-match:
 *   attack  = (goals scored   + k × μ) / ((matches + k) × μ)
 *   defence = (goals conceded + k × μ) / ((matches + k) × μ)
 * where μ is the league average per team-match and k the number of "prior matches" at the league average
 * (shrinkage). attack > 1 scores more than average; defence > 1 concedes more than average.
 * `override` replaces a team's own totals (e.g. a verified line that is more recent than the dataset).
 */
export function strengths(matches, rates, {k = 5, override = {}} = {}) {
  const t = new Map(), add = (team, gf, ga) => { const s = t.get(team) ?? {played: 0, gf: 0, ga: 0}; s.played++; s.gf += gf; s.ga += ga; t.set(team, s); };
  for (const m of matches) { if (!m.home || !m.away) continue; t.has(m.home) || t.set(m.home, {played: 0, gf: 0, ga: 0}); t.has(m.away) || t.set(m.away, {played: 0, gf: 0, ga: 0}); if (m.hg === null || m.hg === undefined) continue; add(m.home, m.hg, m.ag); add(m.away, m.ag, m.hg); }
  for (const [team, s] of Object.entries(override)) t.set(team, {...s});
  const mu = rates.perTeamMatch, out = {};
  for (const [team, s] of t) out[team] = {...s, attack: (s.gf + k * mu) / ((s.played + k) * mu), defence: (s.ga + k * mu) / ((s.played + k) * mu)};
  return out;
}
/** Expected goals of each side in a match: league home/away rate × attack × opponent's defence. */
export function matchMeans(home, away, S, rates, adjust = {}) {
  const h = S[home], a = S[away];
  if (!h || !a) throw new Error(`Unknown team: ${!h ? home : away}`);
  const aH = h.attack * (adjust[home]?.attack ?? 1), dH = h.defence * (adjust[home]?.defence ?? 1), aA = a.attack * (adjust[away]?.attack ?? 1), dA = a.defence * (adjust[away]?.defence ?? 1);
  return {home: rates.home * aH * dA, away: rates.away * aA * dH};
}

/** Final points table of a complete season (points only; ties are not broken, they do not change the points). */
export function pointsTable(matches) {
  const pts = new Map();
  for (const m of matches) {
    if (m.hg === null || m.hg === undefined) continue;
    for (const t of [m.home, m.away]) pts.has(t) || pts.set(t, 0);
    if (m.hg > m.ag) pts.set(m.home, pts.get(m.home) + 3); else if (m.hg < m.ag) pts.set(m.away, pts.get(m.away) + 3); else { pts.set(m.home, pts.get(m.home) + 1); pts.set(m.away, pts.get(m.away) + 1); }
  }
  return [...pts.entries()].map(([team, points]) => ({team, points})).sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
}
/** Points of the team in a given final position (1-based) of each complete season. */
export function positionPoints(dataset, position) {
  const out = [];
  for (const [season, s] of Object.entries(dataset.seasons)) {
    const matches = rows(s.matches);
    if (matches.some(m => m.hg === null)) continue;
    const table = pointsTable(matches); out.push({season, points: table[position - 1].points, team: table[position - 1].team});
  }
  return out;
}
/** Dataset rows [date, matchday, home, away, hg, ag] as objects. */
export const rows = list => list.map(([date, matchday, home, away, hg, ag]) => ({date, matchday, home, away, hg, ag}));
