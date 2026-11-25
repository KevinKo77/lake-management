/**
 * LANOVA Player Intelligence — identity engine.
 *
 * A name in a match record designates a player only with EVIDENCE: the player must have a documented affiliation to
 * that club in that season (for example a dated squad listing) AND a documented alias equal to the name as written.
 * A name alone never identifies anyone. Outcomes:
 *   RESOLVED   exactly one candidate with both kinds of evidence (confidence "high" when the alias matches up to
 *              letter case, "medium" when it matches only after removing accents);
 *   AMBIGUOUS  several candidates — none is chosen;
 *   UNRESOLVED no candidate (the name may exist at other clubs or seasons: reported, never used);
 *   CONFLICT   an identifier supplied with the record contradicts the evidence.
 * Unresolved and ambiguous records stay that way; nothing upgrades them later.
 */
export const STATUS = Object.freeze({RESOLVED: 'RESOLVED', AMBIGUOUS: 'AMBIGUOUS', UNRESOLVED: 'UNRESOLVED', CONFLICT: 'CONFLICT'});

/** Letter-case folding only (accents kept). */
export const foldCase = s => String(s ?? '').normalize('NFC').toLocaleLowerCase('en').replace(/[\s.]+/g, ' ').trim();
/** Accent and case folding — used to FIND candidates, never as evidence on its own. */
export const foldAccents = s => foldCase(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')).replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ß/g, 'ss').replace(/đ/g, 'd');

/**
 * Validate a registry: {schema, clubs: [{id, names: [{name, source}]}], players: [{id, displayName, externalIds?,
 * aliases: [{name, source}], affiliations: [{club, season, source}], sourcePosition?, effectivePosition?}]}.
 * Throws on structural errors; returns the list of warnings (duplicate ids, aliases without a source…).
 */
export function checkRegistry(reg) {
  const errs = [], warn = [];
  if (!reg || !Array.isArray(reg.players) || !Array.isArray(reg.clubs)) throw new Error('registry: players and clubs arrays are required');
  const ids = new Set(), clubIds = new Set(reg.clubs.map(c => c.id));
  if (clubIds.size !== reg.clubs.length) errs.push('duplicate club id');
  for (const p of reg.players) {
    if (!p.id) errs.push(`player without id: ${p.displayName}`);
    if (ids.has(p.id)) errs.push(`duplicate player id ${p.id}`); ids.add(p.id);
    if (!p.aliases?.length) warn.push(`${p.id}: no alias — can never be resolved`);
    for (const a of p.aliases ?? []) if (!a.source) errs.push(`${p.id}: alias "${a.name}" has no source`);
    for (const a of p.affiliations ?? []) { if (!a.source) errs.push(`${p.id}: affiliation ${a.club} ${a.season} has no source`); if (!clubIds.has(a.club)) errs.push(`${p.id}: affiliation to unknown club ${a.club}`); }
  }
  if (errs.length) throw new Error('registry: ' + errs.join('; '));
  return warn;
}

/** Club name as written → club id. Exactly one club must carry that name (case-insensitive); otherwise unresolved. */
export function resolveClub(name, reg) {
  const hits = reg.clubs.filter(c => c.names.some(n => foldCase(n.name) === foldCase(name)));
  if (hits.length === 1) return {status: STATUS.RESOLVED, clubId: hits[0].id, evidence: hits[0].names.find(n => foldCase(n.name) === foldCase(name)).source};
  return {status: hits.length ? STATUS.AMBIGUOUS : STATUS.UNRESOLVED, clubId: null, candidates: hits.map(c => c.id), reason: hits.length ? 'several clubs carry this name' : 'no club carries this name'};
}

/**
 * Resolve one record {name, club (club id or null), season, externalId?} against the registry.
 * Returns {status, playerId, confidence, evidence: [...], candidates: [...], reason}.
 */
export function resolvePlayer(rec, reg) {
  const out = (status, extra) => ({status, playerId: null, confidence: null, evidence: [], candidates: [], ...extra});
  if (!rec?.name) return out(STATUS.UNRESOLVED, {reason: 'no name in the record'});
  if (!rec.club) return out(STATUS.UNRESOLVED, {reason: 'club not resolved: affiliation evidence cannot be checked'});
  if (!rec.season) return out(STATUS.UNRESOLVED, {reason: 'no season in the record'});
  const affiliated = p => (p.affiliations ?? []).find(a => a.club === rec.club && a.season === rec.season);
  const aliasExact = p => (p.aliases ?? []).find(a => foldCase(a.name) === foldCase(rec.name));
  const aliasFolded = p => (p.aliases ?? []).find(a => foldAccents(a.name) === foldAccents(rec.name));
  const sameName = reg.players.filter(p => aliasFolded(p));
  const cands = sameName.filter(p => affiliated(p));
  const elsewhere = sameName.filter(p => !affiliated(p)).map(p => p.id);
  if (rec.externalId) {   // an identifier supplied with the record must agree with the evidence, or it is a conflict
    const p = reg.players.find(x => x.id === rec.externalId || Object.values(x.externalIds ?? {}).includes(rec.externalId));
    if (!p) return out(STATUS.UNRESOLVED, {reason: `identifier ${rec.externalId} unknown to the registry`});
    if (!affiliated(p) || !aliasFolded(p)) return out(STATUS.CONFLICT, {candidates: [p.id], reason: `identifier ${rec.externalId} given, but ${!affiliated(p) ? 'no evidence that this player was at this club in this season' : 'the name does not match any documented alias'}`});
  }
  if (cands.length === 0) return out(STATUS.UNRESOLVED, {reason: elsewhere.length ? `name matches ${elsewhere.length} player(s) with no documented affiliation to this club in this season — not used` : 'no documented player with this name', nameOnlyMatches: elsewhere});
  if (cands.length > 1) return out(STATUS.AMBIGUOUS, {candidates: cands.map(p => p.id).sort(), reason: `${cands.length} documented players with this name at this club in this season`});
  const p = cands[0], exact = aliasExact(p), alias = exact ?? aliasFolded(p), aff = affiliated(p);
  return {status: STATUS.RESOLVED, playerId: p.id, confidence: exact ? 'high' : 'medium', candidates: [p.id],
    evidence: [{kind: 'alias', value: alias.name, source: alias.source, match: exact ? 'same spelling (letter case ignored)' : 'same spelling once accents are removed'}, {kind: 'affiliation', club: aff.club, season: aff.season, source: aff.source}],
    reason: exact ? 'one documented player with this name at this club in this season' : 'one documented player at this club in this season, name equal once accents are removed', nameOnlyMatches: elsewhere};
}
