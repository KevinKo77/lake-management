/**
 * Canonical scenario (audit defect 2). Import, export, local storage and every optimisation run use
 * this form, so the values shown in the page are exactly the values the engine uses:
 *  - every candidate and the club context pass through the engine's own normalisation (defaults filled,
 *    fields that do not apply to a deal type set to the value the engine uses, unknown fields dropped);
 *  - percentages are stored at the precision the page displays (1e-8 as a fraction);
 *  - duplicate candidate ids are rejected (also inside saved comparisons).
 * Canonicalisation is idempotent: canonical(canonical(x)) deep-equals canonical(x).
 */
import {normalizeCandidate, normalizeContext} from './engine/contract.js';

export const SCHEMA = 'lanova-recruitment-v2';
export const MAX_CANDIDATES = 40;
export const MAX_SNAPSHOTS = 3;
export const MAX_IMPORT_BYTES = 1_000_000;
const MODES = ['optimise', 'must', 'exclude'];

export const PCT_CANDIDATE_FIELDS = ['wageGrowth', 'wageShare', 'sellOnPct', 'saleCostPct', 'releaseCompensationPct'];
export const PCT_CONTEXT_PATHS = ['discountRate', 'samePositionFactor', 'stress.resaleHaircut', 'stress.revenueHaircut', 'stress.upsideResale', 'stress.upsideRevenue'];

/** Percentage text exactly as shown in an input: fraction × 100, at most 6 decimals. */
export const displayPct = v => String(Math.round(v * 1e8) / 1e6);
export const parsePct = text => Number(text) / 100;
const canonPct = v => parsePct(displayPct(v));

/**
 * Which candidate fields the engine ignores (and forces) for each deal type. The page disables these
 * inputs and shows the forced value.
 */
export const NOT_APPLICABLE = Object.freeze({
  permanent: ['wageShare'],
  free: ['fee', 'instalments', 'wageShare', 'sellOnPct'],
  loan: ['instalments', 'exitSeason', 'exitValue', 'exitValueDownside', 'exitValueUpside', 'sellOnPct', 'saleCostPct', 'signingBonusOnExit', 'releaseCompensationPct'],
});

export function canonicalCandidate(raw) {
  const c = normalizeCandidate(raw);
  for (const f of PCT_CANDIDATE_FIELDS) c[f] = canonPct(c[f]);
  c.instalments = c.dealType === 'permanent' ? c.instalments.map(canonPct) : [1];
  if (c.dealType !== 'permanent') c.sellOnPct = 0;
  if (c.dealType === 'free') c.fee = 0;
  return normalizeCandidate(c); // re-validate (e.g. instalments still total 100%)
}

const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

export function canonicalContext(raw) {
  const ctx = normalizeContext(raw);
  for (const p of PCT_CONTEXT_PATHS) setPath(ctx, p, canonPct(getPath(ctx, p)));
  ctx.positionNeeds = Object.fromEntries(Object.entries(ctx.positionNeeds).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
  return normalizeContext(ctx);
}

function canonicalInputs(s, where) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.candidates) || !s.context) throw new Error(`${where}: not a LANOVA recruitment scenario`);
  if (s.candidates.length > MAX_CANDIDATES) throw new Error(`${where}: at most ${MAX_CANDIDATES} candidates`);
  const candidates = s.candidates.map(canonicalCandidate);
  const seen = new Set();
  for (const c of candidates) { if (seen.has(c.id)) throw new Error(`${where}: duplicate candidate id "${c.id}"`); seen.add(c.id); }
  const modes = {};
  for (const c of candidates) modes[c.id] = MODES.includes(s.modes?.[c.id]) ? s.modes[c.id] : 'optimise';
  return {context: canonicalContext(s.context), candidates, modes};
}

export function canonicalScenario(raw) {
  if (!raw || raw.schema !== SCHEMA) throw new Error('Not a LANOVA recruitment scenario file');
  const inputs = canonicalInputs(raw, 'Scenario');
  const snapshots = raw.snapshots ?? [];
  if (!Array.isArray(snapshots) || snapshots.length > MAX_SNAPSHOTS) throw new Error(`At most ${MAX_SNAPSHOTS} saved comparisons`);
  return {
    schema: SCHEMA, fictional: Boolean(raw.fictional), label: String(raw.label ?? '').slice(0, 120),
    ...inputs,
    snapshots: snapshots.map((snap, i) => ({label: String(snap?.label ?? 'Saved scenario').slice(0, 60), savedAt: String(snap?.savedAt ?? ''), ...canonicalInputs(snap, `Saved comparison ${i + 1}`)})),
  };
}

/** Stable identity of the inputs a decision depends on (null when invalid). */
export function inputsKey(scenario) {
  try { return JSON.stringify(canonicalInputs(scenario, 'Scenario')); } catch { return null; }
}

export function uniqueId(existing, prefix = 'c') {
  const taken = new Set(existing);
  let n = existing.length + 1, id;
  do { id = `${prefix}-${(n++).toString(36)}`; } while (taken.has(id));
  return id;
}

