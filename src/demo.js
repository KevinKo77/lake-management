import {normalizeModel} from './finance.js';
/** Synthetic identities reserved for teaching, never real athletes or offers. */
export const DEMO_PROFILES = Object.freeze([
  {id: 'demo-tennis-a', name: 'FICTIONAL · Tennis A', country: 'Fictional region A', sport: 'Tennis'},
  {id: 'demo-tennis-b', name: 'FICTIONAL · Tennis B', country: 'Fictional region B', sport: 'Tennis'},
]);
export const DEMO_IDS = DEMO_PROFILES.map(p => p.id);
export function demoSession(fixture) {
  if (fixture?.fixtureVersion !== 1 || fixture.fictional !== true || fixture.currency !== 'EUR' || !Array.isArray(fixture.opportunities) || fixture.opportunities.length !== 2 || fixture.opportunities.some(o => o.demo !== true || !DEMO_IDS.includes(o.athleteId))) throw Error('Invalid demo fixture');
  if (!Number.isFinite(fixture.budget) || fixture.budget <= 0 || fixture.budget > 1e10 || new Set(fixture.opportunities.map(o => o.id)).size !== 2) throw Error('Invalid demo budget or identifiers');
  for (const o of fixture.opportunities) {
    normalizeModel(o.model);
    if (typeof o.label !== 'string' || !o.label.trim() || o.label.length > 100 || typeof o.note !== 'string' || o.note.length > 2000 || !o.diligence || ['contract','revenue','counterparty'].some(k => o.diligence[k] !== false)) throw Error('The demo must remain fictional, documented and without verified diligence');
  }
  // Start with B only: the presenter creates A during the live workflow.
  return {version: 2, budget: fixture.budget, opportunities: [structuredClone(fixture.opportunities[1])], positions: []};
}

