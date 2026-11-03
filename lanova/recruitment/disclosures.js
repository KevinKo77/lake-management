/** Basis of preparation — one source for the page, the decision memo and the audit CSV (review point 5). */
export function dataStatus(fictional) {
  return fictional
    ? 'FICTIONAL DEMONSTRATION DATA — the club, players and every figure are invented for illustration.'
    : 'YOUR INPUTS — every figure is an unverified analyst assumption entered in this browser.';
}

export const DISCLOSURES = Object.freeze([
  ['Expected points', 'Expected league points per season are analyst-supplied estimates (e.g. from scouting), not forecasts produced by this tool. No causal sporting effect is modelled.'],
  ['Squad-cost limit', 'The squad-cost limit and committed squad cost are entered by the user. They are NOT an official league (e.g. LaLiga) calculation; squad cost here = wages + bonuses + signing bonuses + straight-line amortisation + obligations on early exit.'],
  ['Annual timing', 'All amounts are annual: payments at the start of a season (t = season − 1), wages, bonuses and revenue at season end (t = season), sales at the end of the exit season. No intra-season treasury, tax, social charges, FX or financing costs.'],
  ['Scenarios', 'Downside and upside apply every adjustment to every signing at once. They are stress cases, not probabilities; no correlation model.'],
  ['Status', 'Beta software under independent review. Not financial, legal or regulatory advice; independent review is required before any real decision.'],
]);
