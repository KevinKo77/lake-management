/**
 * Current-season data readiness (LaLiga 2026/27). Lists every result that should exist by the as-of date and is not
 * in the open dataset, the source each one requires, and a completeness gate. Also validates a candidate snapshot from
 * another provider BEFORE it may be used: provider, licence, timestamp, checksum, match identity, actual playing date,
 * verification against authoritative results, and full coverage of the missing matches. Nothing is ever filled in by
 * guess, and an incomplete snapshot is never mixed with the open dataset.
 *
 * Pure functions; no network.
 */
export const SEASON = '2026-27';
export const SNAPSHOT_FIELDS = ['provider', 'licence', 'licenceUrl', 'permittedUse', 'retrievedAt', 'sha256', 'matches', 'verification'];

/** Stable identity of a fixture: season, matchday, home, away (the scheduled date may move). */
export const fixtureId = (season, matchday, home, away) => `${season}/md${String(matchday).padStart(2, '0')}/${home} v ${away}`;

/** Results that should exist by `asOf` (scheduled before it) and are missing from the dataset. */
export function missingResults(dataset, asOf, season = SEASON) {
  const s = dataset.seasons[season]; if (!s) return [];
  return s.matches.filter(r => r[4] === null && r[0] < asOf).map(([date, matchday, home, away]) => ({id: fixtureId(season, matchday, home, away), season, matchday, scheduledDate: date, home, away, result: null}));
}

/**
 * Validates a candidate snapshot. A snapshot is usable only if every metadata field is present, the licence permits
 * this use, every match carries its identity, actual playing date and score, every result is verified against an
 * authoritative source, and it covers every missing result (no partial mixing).
 */
export function checkSnapshot(snapshot, missing) {
  const problems = [];
  if (!snapshot || typeof snapshot !== 'object') return {usable: false, problems: ['no snapshot']};
  for (const k of SNAPSHOT_FIELDS) if (snapshot[k] === undefined || snapshot[k] === null || snapshot[k] === '') problems.push(`missing field: ${k}`);
  if (snapshot.permittedUse && snapshot.permittedUse.commercial !== true) problems.push('licence does not permit commercial reuse');
  if (snapshot.sha256 && !/^[0-9a-f]{64}$/.test(snapshot.sha256)) problems.push('sha256 is not a SHA-256 hex digest');
  if (snapshot.retrievedAt && Number.isNaN(Date.parse(snapshot.retrievedAt))) problems.push('retrievedAt is not a timestamp');
  const ms = Array.isArray(snapshot.matches) ? snapshot.matches : [];
  const byId = new Map(ms.map(m => [m.id, m]));
  for (const m of ms) {
    if (!m.id || !m.playedOn || !Number.isInteger(m.hg) || !Number.isInteger(m.ag) || m.hg < 0 || m.ag < 0) problems.push(`incomplete match record: ${m.id ?? '(no id)'}`);
    if (!m.verifiedAgainst) problems.push(`not verified against an authoritative result: ${m.id}`);
  }
  const uncovered = missing.filter(x => !byId.has(x.id));
  if (uncovered.length) problems.push(`does not cover ${uncovered.length} of ${missing.length} missing results (partial snapshots are not mixed with the open dataset)`);
  return {usable: problems.length === 0, problems, covered: missing.length - uncovered.length};
}

/** The readiness report: missing results, the source each requires, the candidate sources, and the gate. */
export function readiness(dataset, {asOf, sources, snapshot = null}) {
  const s = dataset.seasons[SEASON], missing = missingResults(dataset, asOf), snap = checkSnapshot(snapshot, missing);
  const played = s ? s.matches.filter(r => r[4] !== null).length : 0, due = played + missing.length;
  const byMatchday = Object.fromEntries([...new Set(missing.map(m => m.matchday))].sort((a, b) => a - b).map(md => [md, missing.filter(m => m.matchday === md).length]));
  const usable = sources.filter(x => x.verdict === 'usable');
  return {schema: 'lanova-current-season-readiness-v1', season: SEASON, asOf, dataset: {provider: 'openfootball/espana', commit: dataset.source.commit, licence: dataset.source.licence},
    resultsDue: due, resultsAvailable: played, resultsMissing: missing.length, missingByMatchday: byMatchday,
    requiredSource: 'Each missing result needs a source whose licence permits commercial reuse (CC0, CC BY, ODbL or a paid licence), with the actual playing date and score, verified against the official LaLiga result.',
    missing: missing.map(m => ({...m, requiredSource: 'licensed or open-licence result, verified against the official LaLiga result'})),
    sources, snapshot: snapshot ? {checked: true, ...snap} : {checked: false, usable: false, problems: ['no candidate snapshot meets the requirements']},
    gate: {complete: missing.length === 0 || snap.usable, rule: 'Every result scheduled before the as-of date must be present from a permitted, verified source; otherwise no current-season probability is computed.'},
    verdict: missing.length === 0 || snap.usable ? 'READY' : 'BLOCKED DATA', usableSources: usable.map(x => x.name)};
}
