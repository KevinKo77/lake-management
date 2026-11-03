/**
 * Saved side-by-side scenario comparisons.
 *
 * A snapshot stores INPUTS only (club context, candidates, analyst modes).
 * Results are always recomputed by the engine when compared, so an edited or
 * imported snapshot can never carry a stale or fabricated result.
 */
import {analyse} from './engine/analysis.js';

export const MAX_SNAPSHOTS = 3;

const clone = value => JSON.parse(JSON.stringify(value));

export function makeSnapshot(scenario, label, now = new Date().toISOString()) {
  const name = String(label ?? '').trim().slice(0, 60) || `Scenario saved ${now.slice(0, 16).replace('T', ' ')}`;
  return {label: name, savedAt: now, context: clone(scenario.context), candidates: clone(scenario.candidates), modes: clone(scenario.modes ?? {})};
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/** Human-readable list of input differences from `from` to `to`. */
export function diffInputs(from, to, limit = 12) {
  const changes = [];
  const a = flatten(from.context), b = flatten(to.context);
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (String(a[key] ?? '') !== String(b[key] ?? '')) changes.push(`Club ${key}: ${a[key] ?? '—'} → ${b[key] ?? '—'}`);
  }
  const byId = list => new Map(list.map(c => [c.id, c]));
  const ca = byId(from.candidates), cb = byId(to.candidates);
  for (const [id, c] of cb) if (!ca.has(id)) changes.push(`Added candidate ${c.name}`);
  for (const [id, c] of ca) if (!cb.has(id)) changes.push(`Removed candidate ${c.name}`);
  for (const [id, c] of cb) {
    const old = ca.get(id);
    if (!old) continue;
    const fa = flatten(old), fb = flatten(c);
    for (const key of [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()) {
      if (String(fa[key] ?? '') !== String(fb[key] ?? '')) changes.push(`${c.name} ${key}: ${fa[key] ?? '—'} → ${fb[key] ?? '—'}`);
    }
    const ma = from.modes?.[id] ?? 'optimise', mb = to.modes?.[id] ?? 'optimise';
    if (ma !== mb) changes.push(`${c.name}: ${ma} → ${mb}`);
  }
  return changes.length > limit ? [...changes.slice(0, limit), `… and ${changes.length - limit} more`] : changes;
}

/** Recompute every snapshot and summarise it for a side-by-side table. */
export function compareSnapshots(snapshots, options = {}) {
  return snapshots.map((snap, i) => {
    const forceInclude = snap.candidates.filter(c => snap.modes?.[c.id] === 'must').map(c => c.id);
    const forceExclude = snap.candidates.filter(c => snap.modes?.[c.id] === 'exclude').map(c => c.id);
    let a;
    try {
      a = analyse(snap.candidates, snap.context, {forceInclude, forceExclude, explainExclusions: false, shadowPrices: false, keep: 1, now: options.now});
    } catch (error) {
      return {label: snap.label, savedAt: snap.savedAt, error: error.message, changes: i ? diffInputs(snapshots[0], snap) : []};
    }
    const names = new Map(snap.candidates.map(c => [c.id, c.name]));
    const best = a.result.best;
    const ctx = a.context;
    return {
      label: snap.label, savedAt: snap.savedAt, objective: ctx.objective, feasible: Boolean(best), provenOptimal: a.result.provenOptimal,
      selection: best ? best.selection.map(id => names.get(id)) : [],
      objectiveValue: best?.objective.primary ?? null,
      npv: best?.npv ?? null, npvDownside: best?.npvDownside ?? null, npvUpside: best?.npvUpside ?? null,
      pointsSeason1: best?.pointsBySeason[0] ?? 0,
      lowestDownsideCash: best ? Math.min(...best.cashDownside) : null, cashFloor: best?.cashFloor ?? ctx.minCash + ctx.protectedReserve,
      grossCommitment: best?.grossCommitment ?? null, capitalRoom: ctx.lifetimeCapital === null ? null : ctx.lifetimeCapital - ctx.protectedReserve,
      upfront: best?.upfront ?? null, transferBudget: ctx.transferBudget,
      maxDownsideLoss: ctx.maxDownsideLoss,
      binding: best ? best.usage.filter(u => !u.violated && Math.abs(u.slack) <= 0.02 * Math.max(1, Math.abs(u.limit))).map(u => u.label + (u.season !== null ? ` (${u.id === 'cashFloor' ? 't=' : 's'}${u.season})` : '')) : [],
      changes: i ? diffInputs(snapshots[0], snap) : [],
    };
  });
}

export function validateSnapshots(list, validateScenario) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > MAX_SNAPSHOTS) throw new Error(`At most ${MAX_SNAPSHOTS} saved comparisons`);
  return list.map(s => {
    const checked = validateScenario({schema: 'lanova-recruitment-v2', context: s?.context, candidates: s?.candidates, modes: s?.modes});
    return {label: String(s.label ?? 'Saved scenario').slice(0, 60), savedAt: String(s.savedAt ?? ''), context: checked.context, candidates: checked.candidates, modes: checked.modes};
  });
}
