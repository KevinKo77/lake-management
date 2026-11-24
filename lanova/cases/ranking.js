/**
 * LaLiga (Primera División) league table with the RFEF tie-breaking rules.
 *
 * Source: RFEF Reglamento General, art. 201 (art. 224 of the new edition), as applied by the Normas Reguladoras y
 * Bases de Competición of Primera y Segunda División (2025/26, Circular 34; carried over to 2026/27). See
 * lanova/cases/README.md ("Ranking rules") for the citations and for what could and could not be verified verbatim.
 *
 * Clubs level on points are ordered as follows.
 *   Two clubs:            (a) points, then goal difference, in the matches between them (head-to-head);
 *                         (b) goal difference in the whole competition; (c) goals scored in the whole competition;
 *                         (d) fair-play ranking.
 *   Three or more clubs:  (a) points in a particular table of the matches between them only ("clasificación
 *                         particular"); (b) goal difference in that table; (c) goal difference in the whole
 *                         competition; (d) goals scored in the whole competition; (e) fair-play ranking.
 *   Partial resolution:   when a criterion separates the group only in part, every sub-group still level is resolved
 *                         again from criterion (a), among its own members only (a pair with the two-club rule).
 *   Head-to-head:         used only when every match between the clubs concerned has been played (during a season,
 *                         an incomplete head-to-head is skipped and the overall criteria apply).
 *
 * Fair play (cards) is NOT in the open dataset. A tie that only fair play could break is never broken at random: the
 * clubs are returned as one unresolved block sharing its positions, and the block is reported, so its effect on the
 * outcome (e.g. a relegation place) can be quantified.
 *
 * Pure functions; no DOM, no network. Matches are {h, a, hg, ag} with team ids (hg/ag null when not played).
 */
export const RULES = Object.freeze({
  id: 'rfef-laliga-2026-27',
  criteria: ['points', 'head-to-head points', 'head-to-head goal difference', 'goal difference', 'goals scored', 'fair play (not available)'],
  partialResolution: 'restart from head-to-head among the clubs still level',
  headToHeadOnlyWhenComplete: true,
});

/** Points, goals, results of each team over the matches given (played matches only). */
export function tally(teams, matches) {
  const s = Object.fromEntries(teams.map(t => [t, {team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0}]));
  for (const m of matches) {
    if (m.hg === null || m.hg === undefined) continue;
    const H = s[m.h], A = s[m.a]; if (!H || !A) continue;
    H.played++; A.played++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
    if (m.hg > m.ag) { H.won++; A.lost++; H.points += 3; } else if (m.hg < m.ag) { A.won++; H.lost++; A.points += 3; } else { H.drawn++; A.drawn++; H.points++; A.points++; }
  }
  for (const x of Object.values(s)) x.gd = x.gf - x.ga;
  return s;
}

/**
 * Orders `group` (team ids level on points). Returns a list of blocks in order; each block is {teams, decidedBy}
 * where a block of more than one team is unresolved (fair play would be needed). `among(set)` returns the season's
 * fixtures (played or not) between the clubs of `set`, used for the head-to-head and to know whether it is complete;
 * `overall` is the full-table tally. `opts.restart` ('always', the rule applied, or 'head-to-head-only', a variant
 * kept for sensitivity checks) says whether a sub-group split by an overall criterion restarts from head-to-head.
 */
export function resolveTie(group, among, overall, opts = {}, allowH2H = true) {
  if (group.length === 1) return [{teams: [...group], decidedBy: null}];
  const set = new Set(group), ms = allowH2H ? among(set) : [];
  const complete = ms.length === group.length * (group.length - 1) * (opts.legs ?? 2) / 2 && ms.every(m => m.hg !== null && m.hg !== undefined);
  const h2h = allowH2H && complete ? tally(group, ms) : null;
  const criteria = [
    ...(h2h ? [['head-to-head points', t => h2h[t].points, true], ['head-to-head goal difference', t => h2h[t].gd, true]] : []),
    ['goal difference', t => overall[t].gd, false], ['goals scored', t => overall[t].gf, false],
  ];
  for (const [name, f, isH2H] of criteria) {
    const values = [...new Set(group.map(f))];
    if (values.length < 2) continue;
    values.sort((x, y) => y - x);
    // Split, then resolve every sub-group still level again from the first criterion, among its own members only.
    const restartH2H = isH2H || (opts.restart ?? 'always') === 'always';
    return values.flatMap(v => {
      const sub = group.filter(t => f(t) === v);
      return sub.length === 1 ? [{teams: sub, decidedBy: name}] : resolveTie(sub, among, overall, opts, restartH2H).map(b => ({...b, decidedBy: b.decidedBy ?? name}));
    });
  }
  return [{teams: [...group].sort(), decidedBy: 'unresolved: fair play needed (not in the data)'}];
}

/** Fixtures between the clubs of a set, from a fixture list (cached by pair). */
export function amongFrom(fixtures) {
  const pairs = new Map(), key = (x, y) => (x < y ? `${x}\u0000${y}` : `${y}\u0000${x}`);
  for (const m of fixtures) { const k = key(m.h, m.a); if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(m); }
  return set => { const t = [...set], out = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) out.push(...(pairs.get(key(t[i], t[j])) ?? [])); return out; };
}

/**
 * The table of a season (or of a season so far). `fixtures`: every match of the season, played or not.
 * `opts.adjust`: points added or removed by the competition ({team: -3}); they count for the overall points only.
 * Returns {rows, blocks, unresolved}: rows in order with position (a team in an unresolved block gets the block's
 * first position and `sharedPositions`), and the list of unresolved blocks.
 */
export function standings(teams, fixtures, opts = {}) {
  const overall = opts.overall ?? tally(teams, fixtures), byPoints = new Map(), among = opts.among ?? amongFrom(fixtures);
  if (!opts.overall) for (const [t, d] of Object.entries(opts.adjust ?? {})) if (overall[t]) { overall[t].points += d; overall[t].adjustment = d; }
  for (const t of teams) { const p = overall[t].points; if (!byPoints.has(p)) byPoints.set(p, []); byPoints.get(p).push(t); }
  const blocks = [...byPoints.keys()].sort((a, b) => b - a).flatMap(p => resolveTie(byPoints.get(p).sort(), among, overall, opts));
  const rows = [], unresolved = [];
  let pos = 1;
  for (const b of blocks) {
    const shared = b.teams.length > 1 ? [pos, pos + b.teams.length - 1] : null;
    if (shared) unresolved.push({teams: b.teams, positions: shared});
    for (const t of b.teams) rows.push({...overall[t], position: pos, sharedPositions: shared, decidedBy: b.decidedBy});
    pos += b.teams.length;
  }
  return {rows, blocks, unresolved};
}

/**
 * Share of each final position for each team, from a table: 1 for a resolved position; 1/k for each of the k
 * positions of an unresolved block (stated, not drawn at random). Also returns the relegation share.
 */
export function positionShares(table, relegated = 3) {
  const n = table.rows.length, out = {};
  for (const r of table.rows) {
    const pos = Array(n).fill(0), [a, b] = r.sharedPositions ?? [r.position, r.position];
    for (let k = a; k <= b; k++) pos[k - 1] = 1 / (b - a + 1);
    out[r.team] = {positions: pos, relegated: pos.slice(n - relegated).reduce((x, y) => x + y, 0)};
  }
  return out;
}
/** True when an unresolved block straddles the relegation line (some of its clubs would go down, some not). */
export const straddlesRelegation = (table, relegated = 3) => table.unresolved.some(u => u.positions[0] <= table.rows.length - relegated && u.positions[1] > table.rows.length - relegated);
