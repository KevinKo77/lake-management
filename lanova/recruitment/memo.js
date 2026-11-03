/** Script-free, self-contained decision memo. All user content is escaped. */
import {esc, money, pct} from '../src/format.js';
import {DISCLOSURES, dataStatus} from './disclosures.js';

const table = (head, rows) => `<table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;

export function decisionMemo(a, scenario) {
  const names = new Map(scenario.candidates.map(c => [c.id, c.name]));
  const best = a.result.best;
  const ctx = a.context;
  const picked = best ? best.selection.map(id => names.get(id)).join(', ') || 'No signing' : 'No feasible portfolio';
  const objectiveLabel = {npv: 'Financial NPV', blended: `NPV + ${money(ctx.valuePerPoint)} per expected point (discounted)`, points: 'Squad-adjusted expected points', downside: 'Downside NPV'}[ctx.objective];
  const sections = [];
  sections.push(`<h2>Recommendation</h2><p class="big">${esc(picked)}</p><p>${esc(a.summary)}</p>${(a.warnings ?? []).map(w => `<p class="flag"><b>NOT PROVEN OPTIMAL.</b> ${esc(w)}</p>`).join('')}`);
  if (!best && a.mustSignDiagnosis) sections.push(`<h2>Why the must-sign players make every portfolio infeasible</h2><ul>${a.mustSignDiagnosis.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`);
  if (best) {
    sections.push(`<h2>Key figures</h2>${table(['Measure', 'Value'], [
      ['Objective', objectiveLabel],
      ['Objective value', ctx.objective === 'points' ? best.objective.primary.toFixed(1) + ' points' : money(best.objective.primary)],
      ['Base-case NPV of signings', money(best.npv)],
      ['Downside NPV of signings', money(best.npvDownside)],
      ['Upside NPV of signings', money(best.npvUpside)],
      ['Squad-adjusted points over the stay', best.objective.totalPoints.toFixed(1)],
      ['Upfront outlay vs transfer budget', `${money(best.upfront)} / ${money(ctx.transferBudget)}`],
      ['Lowest downside cash vs floor (incl. protected reserve)', `${money(Math.min(...best.cashDownside))} / ${money(best.cashFloor)}`],
      ...(ctx.lifetimeCapital !== null ? [['Gross commitments vs lifetime capital less reserve', `${money(best.grossCommitment)} / ${money(ctx.lifetimeCapital - ctx.protectedReserve)}`]] : []),
      ...(ctx.maxDownsideLoss !== null ? [['Downside NPV vs maximum loss', `${money(best.npvDownside)} / −${money(ctx.maxDownsideLoss)}`]] : []),
      ['Gross commitments (fees, agents, wages, bonuses)', money(best.grossCommitment)],
    ])}`);
    sections.push(`<h2>Why these players</h2>${table(['Player', 'Marginal objective value', 'Removing them breaks'], a.marginals.map(m => [names.get(m.id), ctx.objective === 'points' ? m.marginal.toFixed(1) + ' pts' : money(m.marginal), m.removalBreaks.join('; ') || '—']))}`);
    sections.push(`<h2>Why not the others</h2><ul>${a.exclusions.map(x => `<li><b>${esc(names.get(x.id))}</b>: ${esc(x.text)}</li>`).join('')}</ul>`);
    sections.push(`<h2>What would change the answer</h2>${table(['Change', 'Objective change', 'New selection'], a.shadowPrices.map(s => [s.label, s.delta === null ? 'n/a' : ctx.objective === 'points' ? s.delta.toFixed(1) + ' pts' : money(s.delta), s.selection.map(id => names.get(id)).join(', ') || '—']))}`);
    const gain = v => ctx.objective === 'points' ? v.toFixed(1) + ' points' : money(v);
    const line = (label, pick, v) => `<h3>${esc(label)}</h3><p>Pick: ${esc((pick ?? []).map(id => names.get(id)).join(', ') || 'none')}.</p><p>${v.available === false ? esc(v.reason) : v.baselineFeasible ? `Feasible under the full model; the optimizer ${v.objectiveGain > 1e-6 ? `improves the objective by ${esc(gain(v.objectiveGain))}` : 'reaches the same objective'}.` : `Breaches limits the simpler model does not track: ${esc(v.baselineViolations.map(x => x.label + (x.season !== null ? ' (' + x.season + ')' : '')).join('; '))}.`}</p>`;
    sections.push(`<h2>Against spreadsheet-style baselines</h2><p>Both picks are judged by the full model. This compares models and search methods, not Excel as a tool: Excel Solver could be given the full model too.</p>${line(a.baseline.label, a.baseline.selection, a.versusBaseline)}${line(a.solverBaseline.label, a.solverBaseline.selection, a.versusSolver)}`);
  }
  if (scenario.snapshots?.length) sections.push(`<h2>Saved scenarios compared</h2>${table(['Scenario', 'Recommendation', 'Objective value', 'Base NPV', 'Downside NPV', 'Upside NPV'], (scenario.comparison ?? []).map(c => [c.label, c.feasible ? c.selection.join(', ') || 'No signing' : 'No feasible portfolio', c.objectiveValue === null ? '—' : c.objective === 'points' ? c.objectiveValue.toFixed(1) + ' pts' : money(c.objectiveValue), c.npv === null ? '—' : money(c.npv), c.npvDownside === null ? '—' : money(c.npvDownside), c.npvUpside === null ? '—' : money(c.npvUpside)]))}`);
  sections.push(`<h2>Club assumptions</h2>${table(['Assumption', 'Value'], [
    ['Planning horizon', ctx.horizon + ' seasons'], ['Discount rate', pct(ctx.discountRate)], ['Transfer budget', money(ctx.transferBudget)],
    ['Squad-cost limit by season', ctx.squadCostLimit.map(money).join(' · ')], ['Committed squad cost by season', ctx.committedSquadCost.map(money).join(' · ')],
    ['Opening cash / operating floor / protected reserve', `${money(ctx.openingCash)} / ${money(ctx.minCash)} / ${money(ctx.protectedReserve)}`],
    ['Lifetime capital / maximum downside loss', `${ctx.lifetimeCapital === null ? 'no limit' : money(ctx.lifetimeCapital)} / ${ctx.maxDownsideLoss === null ? 'no limit' : money(ctx.maxDownsideLoss)}`], ['Operating cash flow by season', ctx.operatingCashFlow.map(money).join(' · ')],
    ['Squad / non-EU / max signings', `${ctx.currentSquadSize}→${ctx.maxSquadSize} · ${ctx.currentNonEU}→${ctx.maxNonEU} · ${ctx.maxSignings}`],
    ['Position needs', Object.entries(ctx.positionNeeds).filter(([, n]) => n > 0).map(([p, n]) => `${p} ${n}`).join(', ') || 'none'],
    ['Downside stress', `resale −${pct(ctx.stress.resaleHaircut)}, revenue −${pct(ctx.stress.revenueHaircut)}`],
    ['Upside case (reported only)', `resale +${pct(ctx.stress.upsideResale)}, revenue +${pct(ctx.stress.upsideRevenue)}`],
    ['Same-position factor', String(ctx.samePositionFactor)],
  ])}`);
  sections.push(`<h2>Candidate terms</h2>${table(['Player', 'Pos', 'Deal', 'Fee', 'Agent', 'Years', 'Wage', 'Points/season', 'Exit', 'Exit value', 'Owed on early exit', 'Base NPV', 'Downside NPV'], a.economics.map(e => [e.candidate.name, e.candidate.position, e.candidate.dealType, money(e.candidate.fee), money(e.candidate.agentFee), e.candidate.contractYears, money(e.candidate.wage), e.candidate.points, `after season ${e.exitSeason}`, money(e.candidate.exitValue), money(e.exitObligations.acceleratedSigningBonus + e.exitObligations.releaseCompensation), money(e.npv), money(e.npvDownside)]))}`);
  sections.push(`<h2>Limitations</h2><ul><li>All inputs are analyst assumptions; expected points are not forecasts and no causal sporting effect is claimed.</li><li>Annual timing: payments at season start, wages and revenue at season end. No tax, social-charge detail, FX, financing costs or intra-season treasury.</li><li>The squad-cost limit is modelled as wages + bonuses + signing bonuses + straight-line amortisation against a club-entered limit; it is not an official league calculation.</li><li>Downside applies every haircut to every signing at once (conservative, no correlation model). Options to buy, add-ons tied to events, and relegation/promotion clauses are not modelled.</li><li>Prototype software; independent financial and regulatory review is required before any decision.</li></ul>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LANOVA recruitment decision memo</title><style>body{font:15px/1.5 system-ui,Arial,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#102438}h1{color:#123f50;margin-bottom:0}h2{margin-top:28px;color:#123f50;border-bottom:1px solid #cdd8e0;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:7px;border-bottom:1px solid #dde5eb;text-align:left;vertical-align:top}.big{font-size:20px;font-weight:700}.flag{background:#fff4d6;border:1px solid #e5c56d;padding:8px 12px;border-radius:6px}</style></head><body><h1>LANOVA Sports — Recruitment decision memo</h1><p class="flag">BETA SOFTWARE · under independent review · not approved for decisions</p><p>Generated ${esc(a.generatedAt)} · Engine ${esc(a.engineVersion)}</p><p class="flag">${esc(dataStatus(scenario.fictional))}</p><h2>Basis of preparation</h2><dl>${DISCLOSURES.map(([k, v]) => `<dt><b>${esc(k)}</b></dt><dd>${esc(v)}</dd>`).join('')}</dl>${sections.join('')}</body></html>`;
}
