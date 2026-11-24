/**
 * LANOVA Advantage Lab — project files (save and reuse an analysis). Browser-only: the file is created and read on
 * the user's device; nothing is sent or stored elsewhere.
 *
 * A project file is JSON: {format, version, schema, savedAt, origin, dataNotice, model}. Import is strict: size limit,
 * JSON only, known keys only at every level (anything else is rejected, never ignored), no prototype keys, a known
 * format version, and the model must pass the same validation as the interface. A v0 model is migrated (and the user
 * is told); a newer or unknown version is rejected, with the reason.
 */
import {SCHEMA, SCHEMA_V0, migrate, check} from './lab.js';

export const PROJECT_FORMAT = 'lanova-advantage-project';
export const PROJECT_VERSION = 1;
export const MAX_BYTES = 256 * 1024;
const FILE_KEYS = ['format', 'version', 'schema', 'savedAt', 'origin', 'dataNotice', 'model'];
const MODEL_KEYS = ['schema', 'fictional', 'asOf', 'label', 'sport', 'structure', 'startMonth', 'horizonMonths', 'currency', 'objective', 'finance', 'scenarios', 'constraints', 'options'];
const FINANCE_KEYS = ['openingCash', 'annualRevenue', 'annualOperatingCosts', 'staffCosts', 'minimumCash', 'decisionBudget'];
const SCENARIO_KEYS = ['revenuePct', 'operatingPct', 'wagePct', 'fromMonth'];
const OPTION_KEYS = ['id', 'name', 'category', 'kind', 'upfront', 'upfrontType', 'usefulLifeMonths', 'instalments', 'instalmentEveryMonths', 'startMonth', 'monthlyCost', 'costType', 'commitmentMonths',
  'effectMonths', 'monthlyGain', 'gainRange', 'gainMonths', 'shortTermScore', 'longTermScore', 'risk', 'confidence', 'mandatory', 'requires', 'exclusiveGroup',
  'transferFee', 'feeInstalments', 'agentFee', 'signingBonus', 'contractMonths', 'monthlyWage', 'employerChargeRate'];
const RANGE_KEYS = ['low', 'high', 'basis'];
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export const ORIGINS = Object.freeze({example: 'Illustrative example — every figure is invented', user: 'Entered by the user — not verified by LANOVA', imported: 'Imported project file'});

const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
/** Deep copy of the parts of a model a project file may contain (no derived or display fields). */
function clean(m) {
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
  return {...pick(m, MODEL_KEYS.filter(k => !['finance', 'scenarios', 'constraints', 'options'].includes(k))), finance: pick(m.finance, FINANCE_KEYS),
    scenarios: {downside: pick(m.scenarios.downside, SCENARIO_KEYS), upside: pick(m.scenarios.upside, SCENARIO_KEYS)}, constraints: {downsideMustHold: m.constraints.downsideMustHold},
    options: m.options.map(o => ({...pick(o, OPTION_KEYS.filter(k => k !== 'gainRange' && k !== 'requires')), requires: [...o.requires], ...(o.gainRange ? {gainRange: pick(o.gainRange, RANGE_KEYS)} : {})}))};
}
/** The project file text for a model (v0 is saved as v1). `origin`: 'example', 'user' or 'imported'. */
export function exportProject(m0, {origin = 'user', now = new Date()} = {}) {
  const m = migrate(m0);
  const problems = check(m); if (problems.length) throw new Error(`The analysis cannot be saved until its inputs are valid: ${problems.slice(0, 3).join('; ')}`);
  return JSON.stringify({format: PROJECT_FORMAT, version: PROJECT_VERSION, schema: SCHEMA, savedAt: now.toISOString(), origin: ORIGINS[origin] ? origin : 'user',
    dataNotice: m.fictional ? ORIGINS.example : ORIGINS.user, model: clean(m)}, null, 2);
}
/**
 * Reads a project file. Returns {ok: true, model, notes} or {ok: false, errors}. Never throws on bad input, never
 * keeps an unknown key, and never accepts a model that the interface could not compute.
 */
export function importProject(text) {
  const errors = [], notes = [];
  if (typeof text !== 'string') return {ok: false, errors: ['The file could not be read as text.']};
  if (new TextEncoder().encode(text).length > MAX_BYTES) return {ok: false, errors: [`The file is larger than ${MAX_BYTES / 1024} KB; an Advantage Lab project is much smaller.`]};
  let file;
  try { file = JSON.parse(text); } catch { return {ok: false, errors: ['The file is not valid JSON.']}; }
  const keysOnly = (o, allowed, path) => {
    if (!plain(o)) { errors.push(`${path}: an object is required.`); return false; }
    for (const k of Object.keys(o)) { if (FORBIDDEN.has(k)) errors.push(`${path}.${k}: this key is not allowed.`); else if (!allowed.includes(k)) errors.push(`${path}.${k}: unknown field (not part of an Advantage Lab project).`); }
    return true;
  };
  if (!keysOnly(file, FILE_KEYS, 'file')) return {ok: false, errors};
  if (file.format !== PROJECT_FORMAT) errors.push(`file.format: "${PROJECT_FORMAT}" expected; this is not an Advantage Lab project file.`);
  if (file.version !== PROJECT_VERSION) errors.push(Number.isInteger(file.version) && file.version > PROJECT_VERSION ? `file.version ${file.version}: made by a newer version of the Advantage Lab; it is not read, to avoid misreading it.` : `file.version: ${PROJECT_VERSION} expected.`);
  if (errors.length) return {ok: false, errors};
  let m = file.model;
  if (!plain(m)) return {ok: false, errors: ['model: an object is required.']};
  if (m.schema === SCHEMA_V0) {
    // v0: only its own keys are accepted, then it is migrated (identical results; stated to the user).
    keysOnly(m, [...MODEL_KEYS.filter(k => !['scenarios', 'constraints'].includes(k))], 'model');
    if (plain(m.finance)) keysOnly(m.finance, [...FINANCE_KEYS.filter(k => k !== 'staffCosts'), 'downsideRevenuePct'], 'model.finance');
    if (errors.length) return {ok: false, errors};
    m = migrate(m); notes.push('This project was saved in the previous format (v0) and has been converted: same figures, same results; the upside scenario equals the base case, staff costs are not split.');
  } else if (m.schema !== SCHEMA) return {ok: false, errors: [`model.schema: "${SCHEMA}" expected (or "${SCHEMA_V0}", converted); "${String(m.schema).slice(0, 40)}" is not supported.`]};
  keysOnly(m, MODEL_KEYS, 'model');
  if (plain(m.finance)) keysOnly(m.finance, FINANCE_KEYS, 'model.finance');
  if (keysOnly(m.scenarios, ['downside', 'upside'], 'model.scenarios')) for (const k of ['downside', 'upside']) if (m.scenarios[k] !== undefined) keysOnly(m.scenarios[k], SCENARIO_KEYS, `model.scenarios.${k}`);
  if (plain(m.constraints)) keysOnly(m.constraints, ['downsideMustHold'], 'model.constraints');
  if (Array.isArray(m.options)) m.options.forEach((o, i) => { if (keysOnly(o, OPTION_KEYS, `model.options[${i}]`) && o.gainRange != null) keysOnly(o.gainRange, RANGE_KEYS, `model.options[${i}].gainRange`); });
  if (m.currency !== 'EUR') errors.push('model.currency: EUR is the only currency of the Advantage Lab.');
  if (typeof m.fictional !== 'boolean') errors.push('model.fictional: true (illustrative, invented figures) or false (your data) is required.');
  if (errors.length) return {ok: false, errors};
  const problems = check(m);
  if (problems.length) return {ok: false, errors: problems.map(p => `Invalid input: ${p}`)};
  const model = clean(m);
  notes.push(model.fictional ? `${ORIGINS.imported}: illustrative data (every figure invented).` : `${ORIGINS.imported}: data entered by its author, not verified by LANOVA.`);
  return {ok: true, model, notes, savedAt: typeof file.savedAt === 'string' ? file.savedAt.slice(0, 40) : null};
}
