/**
 * LANOVA Player Intelligence — descriptive comparison of player-season-club records.
 * No overall score, no ranking and no recommendation: each measure is shown on its own, with its category, and
 * per-90 rates only when every compared record has enough estimated minutes to make them defensible.
 */
export const PER90_MIN_MINUTES = 900;   // ten full matches of estimated time; below this a per-90 rate is too unstable to show

export const MEASURES = Object.freeze([
  {id: 'appearances', label: 'Appearances', category: 'OBSERVED', from: r => r.observed.appearances},
  {id: 'starts', label: 'Starts', category: 'OBSERVED', from: r => r.observed.starts},
  {id: 'substituteAppearances', label: 'Came on as substitute', category: 'OBSERVED', from: r => r.observed.substituteAppearances},
  {id: 'substitutedOff', label: 'Substituted off', category: 'OBSERVED', from: r => r.observed.substitutedOff},
  {id: 'goals', label: 'Goals (own goals excluded)', category: 'OBSERVED', from: r => r.observed.goals},
  {id: 'penaltyGoals', label: 'of which penalties', category: 'OBSERVED', from: r => r.observed.penaltyGoals},
  {id: 'ownGoals', label: 'Own goals', category: 'OBSERVED', from: r => r.observed.ownGoals},
  {id: 'yellowCards', label: 'Yellow cards', category: 'OBSERVED', from: r => r.observed.yellowCards},
  {id: 'secondYellowCards', label: 'Second yellow (dismissal)', category: 'OBSERVED', from: r => r.observed.secondYellowCards},
  {id: 'redCards', label: 'Straight red cards', category: 'OBSERVED', from: r => r.observed.redCards},
  {id: 'minutesEstimate', label: 'Estimated minutes (lower bound, added time ignored)', category: 'DERIVED', from: r => r.derived.minutesEstimate.value},
]);
const PER90 = [
  {id: 'goalsPer90', label: 'Goals per 90 estimated minutes', of: r => r.observed.goals},
  {id: 'cardsPer90', label: 'Cards per 90 estimated minutes (yellow + second yellow + red)', of: r => r.observed.yellowCards + r.observed.secondYellowCards + r.observed.redCards},
];

export const per90 = (count, minutes) => (Number.isFinite(count) && minutes > 0 ? Math.round((count * 90 / minutes) * 100) / 100 : null);

/** Records whose effectivePosition equals pos; records without a position are listed separately, never guessed. */
export function filterByPosition(records, pos) {
  if (!pos || pos === 'all') return {kept: records, excluded: []};
  return {kept: records.filter(r => r.effectivePosition === pos), excluded: records.filter(r => r.effectivePosition !== pos).map(r => ({key: r.key, reason: r.effectivePosition ? `position ${r.effectivePosition}` : 'no documented position'}))};
}

export function compare(records, {minMinutes = PER90_MIN_MINUTES, unavailable = []} = {}) {
  if (!Array.isArray(records) || records.length < 2) throw new Error('select at least two records to compare');
  if (new Set(records.map(r => r.key)).size !== records.length) throw new Error('the same record is selected twice');
  const label = r => r.displayName ?? `${r.nameAsWritten} (identity unresolved)`;
  const players = records.map(r => ({key: r.key, label: label(r), club: r.club.nameAsWritten, season: r.season, sourcePosition: r.sourcePosition, effectivePosition: r.effectivePosition, identity: r.identity.status}));
  const measures = MEASURES.map(m => ({id: m.id, label: m.label, category: m.category, values: records.map(r => { const v = m.from(r); return {key: r.key, value: Number.isFinite(v) ? v : null}; })}));
  const short = records.filter(r => !(r.derived.minutesEstimate.value >= minMinutes));
  for (const p of PER90) {
    const comparable = short.length === 0;
    measures.push({id: p.id, label: p.label, category: 'DERIVED', comparable,
      note: comparable ? `count × 90 ÷ estimated minutes; estimated minutes ignore added time, so the rate is an upper bound` : `not shown: ${short.map(label).join(', ')} below ${minMinutes} estimated minutes`,
      values: records.map(r => ({key: r.key, value: comparable ? per90(p.of(r), r.derived.minutesEstimate.value) : null}))});
  }
  const warnings = [];
  if (new Set(records.map(r => r.season)).size > 1) warnings.push('Different seasons: counts are not directly comparable.');
  if (new Set(records.map(r => r.club.id ?? r.club.nameAsWritten)).size > 1) warnings.push('Different clubs: team strength, tactics and playing time differ; nothing here adjusts for them.');
  for (const r of records) if (r.identity.status !== 'RESOLVED') warnings.push(`${label(r)}: identity ${r.identity.status.toLowerCase()} — these facts belong to the name as written at ${r.club.nameAsWritten}, not to a known player.`);
  for (const r of records) if (r.derived.minutesEstimate.matchesWithDismissal) warnings.push(`${label(r)}: ${r.derived.minutesEstimate.matchesWithDismissal} match(es) ended early by a dismissal.`);
  warnings.push('Historical observations only: they do not describe current or future performance. Position and nationality say nothing about ability.');
  return {schema: 'lanova-player-comparison-v1', players, measures, unavailable: [...unavailable], warnings, overallScore: null,
    note: 'No overall score, ranking or recommendation is computed: no such score has been validated.'};
}
