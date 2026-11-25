/**
 * LANOVA Player Intelligence → Decision Intelligence integration contract (V1).
 *
 * Player profile → shortlist → financial assumptions → recruitment scenario → decision report.
 * Player Intelligence hands over IDENTITY and HISTORICAL FACTS as context only. Fees, wages, revenues, resale values and
 * the sporting priority are assumptions the user types; nothing here infers a valuation or a sporting impact.
 * No import of the Finance, Advantage or Recruitment engines: the contract stays independently testable.
 */
export const CONTEXT_SCHEMA = 'lanova-player-context-v1';
export const ASSUMPTIONS = Object.freeze([
  {id: 'fee', label: 'Transfer fee (EUR)', max: 1e8},
  {id: 'wage', label: 'Annual wage (EUR)', max: 1e8},
  {id: 'revenue', label: 'Annual revenue attributed to the signing (EUR)', max: 1e8},
  {id: 'resale', label: 'Resale value at the end of the horizon (EUR)', max: 1e8},
  {id: 'score', label: 'Sporting priority you assign (0–100)', max: 100},
]);
// Fields that would amount to an inferred valuation, rating or prediction: forbidden anywhere outside userAssumptions.
const FORBIDDEN = /^(marketValue|valuation|rating|overall|overallScore|predicted\w*|probability|impact|expected\w*|xg|xa|salary|wage|fee|injuryRisk)$/i;

export function buildPlayerContext(record, {dataset}) {
  if (!record?.key) throw new Error('a player record is required');
  return {schema: CONTEXT_SCHEMA, synthetic: Boolean(dataset?.synthetic),
    identity: {key: record.key, playerId: record.playerId, name: record.displayName ?? record.nameAsWritten, nameAsWritten: record.nameAsWritten,
      status: record.identity.status, confidence: record.identity.confidence, evidence: record.identity.evidence},
    historical: {season: record.season, club: record.club.nameAsWritten, clubId: record.club.id, sourcePosition: record.sourcePosition, effectivePosition: record.effectivePosition,
      observed: {...record.observed}, derived: {minutesEstimate: {...record.derived.minutesEstimate}}, unavailable: [...(dataset?.unavailable ?? [])],
      note: 'Historical observations; not a description of current or future performance.'},
    provenance: dataset?.source ?? null,
    userAssumptions: Object.fromEntries(ASSUMPTIONS.map(a => [a.id, {value: null, suppliedBy: null}])),
    status: 'assumptions-required'};
}

/** Checks the structure and that no inferred valuation, rating or prediction slipped in outside userAssumptions. */
export function validateContext(ctx) {
  const errors = [];
  if (ctx?.schema !== CONTEXT_SCHEMA) errors.push('wrong schema');
  const walk = (o, path) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { const p = `${path}.${k}`; if (path.startsWith('$.userAssumptions')) continue; if (FORBIDDEN.test(k) && k !== 'unavailable') errors.push(`forbidden field ${p}: valuations, ratings and predictions are never inferred`); walk(v, p); } };
  walk(ctx, '$');
  for (const a of ASSUMPTIONS) { const u = ctx?.userAssumptions?.[a.id]; if (!u || !('value' in u)) errors.push(`userAssumptions.${a.id} missing`); else if (u.value !== null && (u.suppliedBy !== 'user' || !Number.isFinite(u.value) || u.value < 0 || u.value > a.max)) errors.push(`userAssumptions.${a.id}: a number from 0 to ${a.max} supplied by the user`); }
  if (ctx?.identity?.status !== 'RESOLVED' && ctx?.status === 'ready') errors.push('an unresolved identity cannot be passed on as a ready candidate');
  return errors;
}

/** Record a value the user typed. */
export function withAssumption(ctx, id, value) {
  if (!ASSUMPTIONS.some(a => a.id === id)) throw new Error(`unknown assumption ${id}`);
  const next = structuredClone(ctx); next.userAssumptions[id] = {value, suppliedBy: 'user'};
  const missing = ASSUMPTIONS.filter(a => next.userAssumptions[a.id].value === null).map(a => a.id);
  next.status = missing.length ? 'assumptions-required' : (next.identity.status === 'RESOLVED' ? 'ready' : 'identity-unresolved');
  return next;
}

/**
 * The shortlist candidate the existing Recruitment engine accepts (lanova/optimizer/model.js → validateCandidates),
 * built ONLY from user assumptions plus identity and position. Returns {ready: false, missing} otherwise.
 */
export function toRecruitmentCandidate(ctx) {
  const errors = validateContext(ctx); if (errors.length) return {ready: false, errors};
  const missing = ASSUMPTIONS.filter(a => ctx.userAssumptions[a.id].value === null).map(a => a.id);
  if (ctx.identity.status !== 'RESOLVED') return {ready: false, missing, errors: ['identity unresolved: resolve it with evidence before building a scenario']};
  if (!['GK', 'DF', 'MF', 'FW'].includes(ctx.historical.effectivePosition)) return {ready: false, missing, errors: ['no documented position']};
  if (missing.length) return {ready: false, missing, errors: []};
  return {ready: true, candidate: {id: ctx.identity.playerId.replace(/[^-a-zA-Z0-9_]/g, '-').slice(0, 50), name: ctx.identity.name.slice(0, 80), position: ctx.historical.effectivePosition, enabled: true,
    ...Object.fromEntries(ASSUMPTIONS.map(a => [a.id, ctx.userAssumptions[a.id].value]))}, provenance: {context: CONTEXT_SCHEMA, historical: `${ctx.historical.club} ${ctx.historical.season}`, assumptions: 'user-supplied'}};
}
