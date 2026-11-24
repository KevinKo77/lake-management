/**
 * Release 3 — role-based player profiles (Málaga CF case). Turns a user's hypotheses about a signing into a per-match
 * change of Málaga's scoring and conceding rates, then into expected points with the same goal model as the
 * experiment (case.js → scenarioBy).
 *
 * What a profile is: a role, the change in Málaga's goals scored and conceded WHILE THE PLAYER IS ON THE PITCH compared
 * with the player he would replace (low, central and high values), his expected share of minutes, his availability,
 * the match from which he plays and how many matches he needs to reach his full effect.
 *
 * What it is not: a measurement. LANOVA holds no verified player data at €0 (see the rights register), so every value is
 * the user's hypothesis. A label (for example a name) can be attached for the user's own use; it is never looked up,
 * never verified and never changes a number. A simulation does not prove a player's causal effect.
 *
 * Effect at the k-th match from the start date (k = 0, 1, …):
 *   ramp(k)          = 1 if no adaptation period, else min(1, (k + 1) / (R + 1))     (R = matches to full effect)
 *   attack factor    = 1 + attackPct/100 × minutes × availability × ramp(k)
 *   defence factor   = 1 − defencePct/100 × minutes × availability × ramp(k)
 * The minutes and availability shares scale the on-pitch effect to an expected effect per match (a linear
 * approximation, not a simulation of line-ups).
 */
import {scenario, scenarioBy} from './case.js';

export const ROLES = Object.freeze({
  goalkeeper: {label: 'Goalkeeper', channel: 'defence'},
  'centre-back': {label: 'Centre-back', channel: 'defence'},
  'full-back': {label: 'Full-back or wing-back', channel: 'both'},
  'defensive-midfielder': {label: 'Defensive midfielder', channel: 'defence'},
  'central-midfielder': {label: 'Central midfielder', channel: 'both'},
  'attacking-midfielder': {label: 'Attacking midfielder', channel: 'attack'},
  winger: {label: 'Winger', channel: 'attack'},
  striker: {label: 'Striker', channel: 'attack'},
});
export const LIMITS = Object.freeze({attack: [-50, 300], defence: [-50, 90], minutesPct: [0, 100], availabilityPct: [0, 100], rampMatches: [0, 15]});
export const LEVELS = ['low', 'central', 'high'];
export const LABEL_NOTE = 'Your label, exploratory only. LANOVA holds no verified data on any named player; the figures depend only on the hypotheses entered.';
const range = () => ({low: null, central: null, high: null});
/**
 * An empty profile. For a role, the channel it does not mainly act on starts at 0 (an explicit, visible hypothesis
 * of no effect, which the user can change); every other value starts empty.
 */
export function emptyProfile(role = null) {
  const ch = ROLES[role]?.channel, zero = () => ({low: 0, central: 0, high: 0});
  return {label: '', role, from: null, minutesPct: null, availabilityPct: null, rampMatches: null,
    attack: ch === 'defence' ? zero() : range(), defence: ch === 'attack' ? zero() : range()};
}
/** Illustrative hypotheses (not data about any player) used by the "load an illustration" button and the tests. */
export const ILLUSTRATION = Object.freeze([
  {label: 'Profile A (illustration)', role: 'striker', minutesPct: 70, availabilityPct: 85, rampMatches: 4, attack: {low: 10, central: 25, high: 40}, defence: {low: 0, central: 0, high: 0}},
  {label: 'Profile B (illustration)', role: 'centre-back', minutesPct: 85, availabilityPct: 90, rampMatches: 2, attack: {low: 0, central: 0, high: 0}, defence: {low: 10, central: 20, high: 30}},
]);

const num = v => typeof v === 'number' && Number.isFinite(v);
/** Missing and invalid values of a profile, in words. A profile is computed only when both lists are empty. */
export function checkProfile(ctx, p) {
  const missing = [], problems = [];
  if (!p || typeof p !== 'object') return {missing: ['profile'], problems: []};
  if (!ROLES[p.role]) missing.push('role');
  if (!p.from) missing.push('first match'); else if (!ctx.remaining.some(m => m.date === p.from)) problems.push('first match: not a remaining Málaga fixture');
  for (const [k, l] of [['minutesPct', 'share of minutes'], ['availabilityPct', 'availability'], ['rampMatches', 'matches to full effect']]) {
    if (!num(p[k])) { missing.push(l); continue; }
    const [lo, hi] = LIMITS[k]; if (p[k] < lo || p[k] > hi) problems.push(`${l}: ${lo} to ${hi}`);
    if (k === 'rampMatches' && !Number.isInteger(p[k])) problems.push(`${l}: a whole number`);
  }
  for (const [k, l] of [['attack', 'goals scored'], ['defence', 'goals conceded']]) {
    const r = p[k] ?? {}, [lo, hi] = LIMITS[k];
    for (const lv of LEVELS) { if (!num(r[lv])) missing.push(`${l} (${lv})`); else if (r[lv] < lo || r[lv] > hi) problems.push(`${l} (${lv}): ${lo} to ${hi}%`); }
    if (LEVELS.every(lv => num(r[lv])) && !(r.low <= r.central && r.central <= r.high)) problems.push(`${l}: low ≤ central ≤ high`);
  }
  return {missing, problems};
}
const ramp = (k, R) => (R ? Math.min(1, (k + 1) / (R + 1)) : 1);
/** Per-match factors of a profile at one level (low, central or high). */
export function factors(ctx, p, level) {
  const start = ctx.remaining.findIndex(m => m.date === p.from), share = p.minutesPct / 100 * p.availabilityPct / 100;
  return ctx.remaining.map((m, i) => (i < start ? {attack: 1, defence: 1} : {attack: 1 + p.attack[level] / 100 * share * ramp(i - start, p.rampMatches), defence: 1 - p.defence[level] / 100 * share * ramp(i - start, p.rampMatches)}));
}
/** Expected points of a profile at its three levels, against the same baseline as the experiment. */
export function profileImpact(ctx, p) {
  const {missing, problems} = checkProfile(ctx, p);
  if (missing.length || problems.length) return {computed: false, missing, problems};
  const base = scenario(ctx), share = p.minutesPct / 100 * p.availabilityPct / 100, out = {};
  for (const lv of LEVELS) {
    const f = factors(ctx, p, lv), s = scenarioBy(ctx, (m, i) => f[i]);
    out[lv] = {gain: s.points - base.points, finalPoints: s.finalPoints, goalsFor: s.goalsFor - base.goalsFor, goalsAgainst: s.goalsAgainst - base.goalsAgainst};
  }
  const start = ctx.remaining.findIndex(m => m.date === p.from);
  return {computed: true, role: p.role, channel: ROLES[p.role].channel, label: p.label || null, labelNote: p.label ? LABEL_NOTE : null, ...out,
    matches: ctx.remaining.length - start, fullEffectFrom: ctx.remaining[Math.min(ctx.remaining.length - 1, start + (p.rampMatches || 0))].date,
    // At full effect, the profile equals this experiment setting (central values).
    equivalentAtFullEffect: {attackPct: p.attack.central * share, defencePct: p.defence.central * share}};
}
/**
 * Compares computed profiles by central gain, and says whether the ranges let them be told apart: if the best
 * profile's low value is below another's high value, the ranking depends on where the truth lies within the ranges.
 */
export function compareProfiles(results) {
  const ok = results.map((r, i) => ({...r, index: i})).filter(r => r.computed);
  if (ok.length < 2) return {comparable: false, reason: ok.length ? 'Only one profile is complete.' : 'No profile is complete.'};
  const sorted = [...ok].sort((a, b) => b.central.gain - a.central.gain), best = sorted[0], next = sorted[1];
  const separated = best.low.gain > next.high.gain;
  return {comparable: true, order: sorted.map(r => r.index), best: best.index, margin: best.central.gain - next.central.gain, separated,
    verdict: separated ? 'clear under your ranges: the best profile\'s low value beats the next profile\'s high value' : 'not separated: the ranges overlap, so the ranking depends on where the truth lies within them'};
}
