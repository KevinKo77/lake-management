/**
 * LANOVA Player Intelligence — historical player facts from parsed matches.
 *
 * Three categories, kept apart in every record:
 *   OBSERVED     counted directly from the source (appearances, starts, substitutions, goals, cards);
 *   DERIVED      calculated from observed data with a documented formula (estimated minutes);
 *   UNAVAILABLE  not in the source, so never shown as a number (assists, xG, shots, ratings, values…).
 * Missing data are null, never 0. Nothing here describes a later season.
 */
import {resolveClub, resolvePlayer, foldAccents, STATUS} from './identity.js';

export const SCHEMA = 'lanova-player-facts-v1';
export const UNAVAILABLE = Object.freeze(['assists', 'expected goals (xG)', 'expected assists (xA)', 'shots', 'passes', 'tackles', 'interceptions',
  'market value', 'salary', 'injury risk', 'performance rating', 'future performance probability']);
export const MINUTES_METHOD = Object.freeze({
  formula: 'starter: from 0 to the minute he was replaced, else 90; substitute: from the minute he came on to the minute he was replaced, else 90; a dismissal (red card or second yellow) ends the count at its minute',
  limitations: ['Added time is ignored: a minute written 90+4 counts as 90, so every estimate is a lower bound of the time on the pitch in matches with added time.',
    'A player who came on in added time (90+x) gets 0 estimated minutes.',
    'Extra time does not exist in league matches; injuries or interruptions are not visible in the source.',
    'These are estimates from the line-up text, not official playing time.'],
});

/** Minutes one participation counts for, with the reason. Inputs are parsed minutes ({base, added}) or null. */
export function estimateMinutes({on = null, off = null, dismissed = null}) {
  const start = on ? on.base : 0;
  let end = 90, endBy = 'full time (90)';
  if (off && off.base < end) { end = off.base; endBy = `replaced at ${off.raw}`; }
  if (dismissed && dismissed.base < end) { end = dismissed.base; endBy = `dismissed at ${dismissed.raw}`; }
  return {minutes: Math.max(0, end - start), endBy, stoppageIgnored: Boolean((on && on.added) || (off && off.added) || (dismissed && dismissed.added)), dismissed: Boolean(dismissed)};
}


/**
 * Build the facts dataset from a parsed file and an identity registry.
 * meta: {source: {...pinned manifest...}, synthetic: boolean}. Deterministic: same inputs → identical output.
 */
export function buildFacts(parsed, registry, meta) {
  const season = parsed.season, rows = new Map(), inconsistencies = [], clubRes = new Map();
  const club = name => { if (!clubRes.has(name)) clubRes.set(name, resolveClub(name, registry)); return clubRes.get(name); };
  const keyOf = (name, side, m) => {
    const teamName = side === 'home' ? m.home : m.away, c = club(teamName), id = resolvePlayer({name, club: c.clubId, season}, registry);
    const key = id.status === STATUS.RESOLVED ? `${id.playerId}@${c.clubId}` : `unresolved:${c.clubId ?? teamName}:${foldAccents(name)}`;
    if (!rows.has(key)) {
      const p = id.status === STATUS.RESOLVED ? registry.players.find(x => x.id === id.playerId) : null;
      rows.set(key, {key, playerId: id.playerId, nameAsWritten: name, displayName: p?.displayName ?? null, club: {id: c.clubId, nameAsWritten: teamName, resolution: c.status},
        season, sourcePosition: p?.sourcePosition ?? null, effectivePosition: p?.effectivePosition ?? null,
        identity: {status: id.status, confidence: id.confidence, reason: id.reason, evidence: id.evidence, candidates: id.candidates, nameOnlyMatches: id.nameOnlyMatches ?? []},
        observed: {appearances: 0, starts: 0, substituteAppearances: 0, substitutedOff: 0, goals: 0, penaltyGoals: 0, ownGoals: 0, yellowCards: 0, secondYellowCards: 0, redCards: 0, cardsWithoutAppearance: 0},
        derived: {minutesEstimate: {value: 0, label: 'estimated', matchesWithDismissal: 0, matchesWithAddedTimeIgnored: 0, method: 'see MINUTES_METHOD'}},
        spellings: [], matches: [], inconsistencies: []});
    }
    const r = rows.get(key);
    if (!r.spellings.includes(name)) r.spellings.push(name);
    if (id.status === STATUS.RESOLVED && id.confidence === 'medium') r.identity.confidence = 'medium';   // the weakest evidence across spellings
    return r;
  };
  for (const m of parsed.matches) {
    const lineupNames = {home: new Set(), away: new Set()};
    const dismissal = {home: new Map(), away: new Map()};
    for (const c of m.cards) if (c.kind !== 'yellow') { const d = dismissal[c.side], k = foldAccents(c.name), prev = d.get(k); if (!prev || c.minute.base < prev.base) d.set(k, c.minute); }
    for (const side of ['home', 'away']) {
      const seen = new Set();
      for (const slot of m.lineups[side] ?? []) slot.forEach((x, k) => {
        if (x.error) return;
        lineupNames[side].add(foldAccents(x.name));
        const dupKey = foldAccents(x.name);
        if (seen.has(dupKey)) { const r = keyOf(x.name, side, m), msg = `${m.id}: ${x.name} is listed twice in the ${side} line-up; counted once`; r.inconsistencies.push(msg); inconsistencies.push(msg); return; }
        seen.add(dupKey);
        const off = slot[k + 1] && !slot[k + 1].error ? slot[k + 1].on : null, r = keyOf(x.name, side, m), est = estimateMinutes({on: x.on, off, dismissed: dismissal[side].get(foldAccents(x.name)) ?? null});
        r.observed.appearances++; if (k === 0) r.observed.starts++; else r.observed.substituteAppearances++; if (off) r.observed.substitutedOff++;
        r.derived.minutesEstimate.value += est.minutes; if (est.dismissed) r.derived.minutesEstimate.matchesWithDismissal++; if (est.stoppageIgnored) r.derived.minutesEstimate.matchesWithAddedTimeIgnored++;
        r.matches.push({match: m.id, date: m.date, role: k === 0 ? 'start' : 'substitute', on: x.on?.raw ?? null, off: off?.raw ?? null, minutesEstimate: est.minutes, endBy: est.endBy});
      });
    }
    for (const g of m.goals) {   // an own goal is listed for the team it counts for: the scorer played for the other side
      const side = g.kind === 'own_goal' ? (g.listedFor === 'home' ? 'away' : 'home') : g.listedFor, r = keyOf(g.name, side, m);
      if (g.kind === 'own_goal') r.observed.ownGoals++; else { r.observed.goals++; if (g.kind === 'penalty') r.observed.penaltyGoals++; }
      if (!lineupNames[side].has(foldAccents(g.name))) { const msg = `${m.id}: ${g.name} is listed as scorer (${g.minute.raw}') but not in the ${side} line-up`; r.inconsistencies.push(msg); inconsistencies.push(msg); }
    }
    for (const c of m.cards) {
      const r = keyOf(c.name, c.side, m);
      if (c.kind === 'yellow') r.observed.yellowCards++; else if (c.kind === 'second_yellow') r.observed.secondYellowCards++; else r.observed.redCards++;
      if (!lineupNames[c.side].has(foldAccents(c.name))) r.observed.cardsWithoutAppearance++;
    }
  }
  const players = [...rows.values()].map(r => ({...r, spellings: [...r.spellings].sort(), matches: r.matches.sort((a, b) => (a.date + a.match).localeCompare(b.date + b.match))}))
    .sort((a, b) => a.key.localeCompare(b.key));
  // Duplicate / conflicting records: one registry player resolved under two spellings at the same club is merged by key;
  // the same name resolved to two different players would be a conflict (cannot happen by construction, checked anyway).
  const byName = new Map();
  for (const p of players) { const k = `${p.club.id}|${foldAccents(p.nameAsWritten)}`; byName.set(k, [...(byName.get(k) ?? []), p.key]); }
  const conflicts = [...byName.entries()].filter(([, ks]) => ks.length > 1).map(([k, ks]) => ({name: k, keys: ks}));
  const count = s => players.filter(p => p.identity.status === s).length;
  return {schema: SCHEMA, synthetic: Boolean(meta?.synthetic), season, competition: parsed.competition, source: meta?.source ?? null,
    categories: {observed: 'counted directly from the source', derived: 'calculated from observed data (see minutesMethod)', unavailable: 'not in the source; never shown as a number'},
    minutesMethod: MINUTES_METHOD, unavailable: UNAVAILABLE,
    validation: {matches: parsed.matches.length, parseProblems: parsed.problems, inconsistencies, conflicts,
      totals: {appearances: players.reduce((s, p) => s + p.observed.appearances, 0), goals: players.reduce((s, p) => s + p.observed.goals, 0), ownGoals: players.reduce((s, p) => s + p.observed.ownGoals, 0),
        yellowCards: players.reduce((s, p) => s + p.observed.yellowCards, 0), secondYellowCards: players.reduce((s, p) => s + p.observed.secondYellowCards, 0), redCards: players.reduce((s, p) => s + p.observed.redCards, 0)}},
    identityAudit: {records: players.length, resolved: count(STATUS.RESOLVED), ambiguous: count(STATUS.AMBIGUOUS), unresolved: count(STATUS.UNRESOLVED), conflict: count(STATUS.CONFLICT),
      clubs: [...clubRes.entries()].map(([name, c]) => ({nameAsWritten: name, status: c.status, clubId: c.clubId})).sort((a, b) => a.nameAsWritten.localeCompare(b.nameAsWritten)),
      unresolvedCases: players.filter(p => p.identity.status !== STATUS.RESOLVED).map(p => ({key: p.key, nameAsWritten: p.nameAsWritten, club: p.club.nameAsWritten, status: p.identity.status, reason: p.identity.reason}))},
    players};
}
