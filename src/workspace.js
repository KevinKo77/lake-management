import {analyze} from './finance.js';
import {esc, money} from './format.js';

export const decisionSteps = [
  ['dashboard', '01', 'Overview'], ['opportunities', '02', 'Cases'],
  ['model', '03', 'Assumptions'], ['compare', '04', 'Decision'],
  ['portfolio', '05', 'Allocation'], ['sources', '06', 'Traceability'],
];
export function workspaceSteps(view) {
  return `<nav class="decision-steps" aria-label="Decision journey">${decisionSteps.map(([key, n, label]) => `<button data-view="${key}" ${view === key ? 'aria-current="page" class="active"' : ''}><small>${n}</small>${label}</button>`).join('')}</nav>`;
}
// These are transparent review prompts, never a recommendation or approval.
export function decisionQueue(opportunities) {
  return opportunities.map(o => {
    const a = analyze(o.model);
    const checks = ['contract', 'revenue', 'counterparty'].filter(k => o.diligence?.[k]).length;
    const missing = [];
    if (!o.note?.trim()) missing.push('Document the provenance of assumptions');
    if (checks < 3) missing.push(`Complete diligence (${checks}/3)`);
    if (a.expectedNpv < 0) missing.push('Review negative weighted NPV');
    if (a.cases[0].moic < 1) missing.push('Review downside scenario losses');
    return {id: o.id, label: o.label, demo: o.demo === true, checks, npv: a.expectedNpv, prompts: missing};
  });
}
export function decisionDesk(opportunities) {
  const rows = decisionQueue(opportunities);
  return `<section class="decision-desk" aria-labelledby="decision-heading"><div class="flex split"><div><p class="eyebrow">LAKE INTELLIGENCE / DECISION DESK</p><h2 id="decision-heading">What needs your attention</h2></div><button data-view="compare">Open comparison →</button></div>
    ${rows.length ? `<div class="review-list">${rows.slice(-5).reverse().map(r => `<article><div><button class="link-button" data-edit="${esc(r.id)}">${esc(r.label)}</button><small>${r.demo ? 'FICTIONAL · ' : ''}Weighted NPV ${money(r.npv)} · Declared diligence ${r.checks}/3</small></div><ul>${r.prompts.length ? r.prompts.map(p => `<li>${esc(p)}</li>`).join('') : '<li>Compare terms and review risks before any simulated allocation</li>'}</ul><button data-edit="${esc(r.id)}">Review case ↗</button></article>`).join('')}</div>` : `<div class="desk-empty"><span>01 → 06</span><div><h3>Start with a case, then follow the decision journey.</h3><p>Create assumptions, test scenarios, compare cases and export your analysis.</p></div><button class="primary" data-action="new">Create your first case</button></div>`}
    <p class="meta-line">Deterministic review prompts, with no automatic approval. Checked items are analyst declarations.</p></section>`;
}
