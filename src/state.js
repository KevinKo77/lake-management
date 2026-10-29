import {normalizeModel, portfolio} from './finance.js';
import {DEMO_IDS} from './demo.js';
export const STORAGE_KEY = 'lake-investor-v2';
export const LEGACY_KEY = 'lake-investor-v1';
export const emptyState = () => ({version: 2, budget: 1000000, opportunities: [], positions: []});
const reject = message => { throw new Error(message); };
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function string(value, max, field, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) reject(`Field ${field} invalid`);
  return value;
}
function identifier(value) {
  string(value, 100, 'id');
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) reject('Invalid identifier');
  return value;
}
function record(value, ids, kind) {
  if (!object(value)) reject('Invalid case');
  const id = identifier(value.id);
  if (value.demo !== undefined && typeof value.demo !== 'boolean') reject('Invalid fictional marker');
  if (value.athleteId !== 'unassigned' && !ids.includes(value.athleteId) && !(value.demo === true && DEMO_IDS.includes(value.athleteId))) reject('Unknown athlete');
  const label = string(value.label ?? (kind === 'position' ? 'Imported allocation' : ''), 100, 'label');
  const note = string(value.note ?? '', 2000, 'note', true);
  const createdAt = value.createdAt ?? null;
  if (createdAt !== null && (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) || createdAt.length > 40)) reject('Invalid creation date');
  const result = {id, athleteId: value.athleteId, label, note, createdAt, model: normalizeModel(value.model)};
  if (value.demo === true) result.demo = true;
  if (kind === 'opportunity') {
    const d = value.diligence ?? {};
    if (!object(d)) reject('Invalid diligence');
    for (const field of ['contract', 'revenue', 'counterparty']) if (d[field] !== undefined && typeof d[field] !== 'boolean') reject('Invalid diligence status');
    result.diligence = {contract: d.contract ?? false, revenue: d.revenue ?? false, counterparty: d.counterparty ?? false};
  }
  if (kind === 'position' && value.opportunityId !== undefined) result.opportunityId = identifier(value.opportunityId);
  return result;
}
export function validateState(input, ids) {
  if (!object(input) || input.version !== 2 || !Number.isFinite(input.budget) || input.budget <= 0 || input.budget > 1e10) reject('Invalid portfolio');
  const result = {version: 2, budget: input.budget};
  for (const [key, kind] of [['opportunities', 'opportunity'], ['positions', 'position']]) {
    const list = input[key];
    if (!Array.isArray(list) || list.length > 1000) reject('Invalid case list (maximum 1000)');
    result[key] = list.map(v => record(v, ids, kind));
    if (new Set(result[key].map(v => v.id)).size !== list.length) reject('Duplicate identifiers');
  }
  if (portfolio(result.positions, result.budget).cash < -1e-8) reject('Imported budget exceeded');
  return result;
}
export function parseState(raw, ids) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 2e6) reject('File too large (maximum 2 MB)');
  const input = JSON.parse(raw);
  if (object(input) && input.version === 1) {
    if (!Array.isArray(input.positions)) reject('Invalid legacy portfolio');
    return validateState({version: 2, budget: input.budget, opportunities: [], positions: input.positions.map(p => ({...p, label: 'Migrated v1 allocation'}))}, ids);
  }
  return validateState(input, ids);
}
export function loadState(storage, ids) {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null) return {state: parseState(current, ids), warning: '', migrated: false};
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy !== null) return {state: parseState(legacy, ids), warning: 'v1 portfolio migrated in memory. Save or export; the v1 original is retained.', migrated: true};
    return {state: emptyState(), warning: '', migrated: false};
  } catch (error) {
    // Do not overwrite unreadable storage on startup.
    return {state: emptyState(), warning: `Backup not loaded: ${error.message}. The original is retained.`, migrated: false, recovery: true};
  }
}
export function saveState(storage, state, ids) {
  const safe = validateState(state, ids);
  const serialized = JSON.stringify(safe);
  if (new TextEncoder().encode(serialized).length > 2e6) reject('Backup too large (maximum 2 MB)');
  storage.setItem(STORAGE_KEY, serialized);
  return safe;
}

