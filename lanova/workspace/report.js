/** Printable decision report (print → “Save as PDF”). Built only from the current, fresh engine result. */
import {eur} from '../v3/demo/explain.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const POS = {GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker'};
const DEAL = {permanent: 'Transfer', loan: 'Loan', free: 'Free agent'};
const pct = x => `${Math.round(x * 1000) / 10}%`;
const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const sec = (t, b) => `<section><h2>${esc(t)}</h2>${b}</section>`;

export function reportHtml({meta, scenario, analysis, story, compare, when}) {
  const c = analysis.context, b = analysis.result.best;
  const shortlist = scenario.candidates.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(POS[p.position])}</td><td>${DEAL[p.dealType]}</td><td>${eur(p.fee)}</td><td>${eur(p.wage * (p.dealType === 'loan' ? p.wageShare : 1))}</td><td>${p.contractYears}</td><td>${p.points}</td><td>${p.exitValue ? `${eur(p.exitValue)} (s${p.exitSeason})` : '—'}</td><td>${({must: 'Must sign', exclude: 'Left out'})[scenario.modes?.[p.id]] ?? 'Considered'}</td></tr>`).join('');
  const limits = b ? b.usage.map(u => `<tr><td>${esc(u.label)}${u.season !== null ? ` (${u.id === 'cashFloor' ? 't=' : 'season '}${u.season})` : ''}</td><td class="num">${['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'].includes(u.id) ? u.used : eur(u.used)}</td><td class="num">${u.sense === '<=' ? '≤' : '≥'} ${['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'].includes(u.id) ? u.limit : eur(u.limit)}</td></tr>`).join('') : '';
  const low = b ? b.usage.filter(u => u.id === 'cashFloor').reduce((m, u) => (m === null || u.used < m.used ? u : m), null) : null;
  const kpis = story.feasible ? `<div class="kpi-row"><div><span>Paid at signing</span><b>${eur(story.spend.atSigning)}</b><span>of ${eur(story.spend.budget)} available</span></div><div><span>Added squad cost, season 1</span><b>${eur(story.spend.addedSquadCost[0] ?? 0)}</b><span>squad total ${eur(story.spend.squadCostTotal[0] ?? 0)} of ${eur(story.spend.squadCostLimit[0] ?? 0)}</span></div><div><span>Total contract commitments</span><b>${eur(story.spend.totalCommitment)}</b><span>${story.players.length} signing${story.players.length === 1 ? '' : 's'}</span></div><div><span>Lowest cash, bad case</span><b>${low ? eur(low.used) : '—'}</b><span>${low ? `vs ${eur(low.limit)} to keep` : ''}</span></div></div>` : '';
  return `<div class="rep-top"><div><div class="rep-brand">LANOVA SPORTS</div><div class="rep-meta">Recruitment Workspace</div></div><div class="rep-meta">${esc(when)}<br>Engine ${esc(analysis.engineVersion)}</div></div>
  <p class="stamp">${meta.imported ? 'YOUR IMPORTED SHORTLIST — FIGURES AS ENTERED BY YOU' : 'FICTIONAL DEMONSTRATION — NOT REAL CLUB OR PLAYER DATA'}</p>
  <h1>Recruitment decision report — ${esc(meta.club)}</h1>
  <p class="rep-sub">${esc(meta.tier)} · ${esc(story.headline)}</p>
  ${kpis}
  ${sec('Decision evaluated', `<p>${esc(meta.decision)}</p>`)}
  ${sec('Recommendation', `<p><strong>${esc(story.headline)}</strong></p>` + (story.feasible ? `<table><thead><tr><th>Player</th><th>Position</th><th>Deal</th><th>Seasons</th><th class="num">Pay at signing</th><th class="num">Wages, season 1</th><th class="num">Total commitment</th><th class="num">Expected points / season</th></tr></thead><tbody>${story.players.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(POS[p.position])}</td><td>${esc(p.deal)}</td><td>${p.years}</td><td class="num">${eur(p.atSigning)}</td><td class="num">${eur(p.wagesPerSeason)}</td><td class="num">${eur(p.totalCommitment)}</td><td class="num">${p.points}</td></tr>`).join('')}</tbody></table><p>${story.proven ? 'Checked against all' : 'Best found among'} ${story.searchSpace.toLocaleString('en-GB')} possible combinations of the shortlist.</p>`
    : ul(story.fixes.map(f => `${f.label}: ${f.works ? 'a safe choice becomes possible → ' + (f.names.join(' + ') || 'no signing') : 'not enough on its own'}`))))}
  ${story.feasible ? sec('Costs', `<table><tbody><tr><td>Paid at signing</td><td>${eur(story.spend.atSigning)} of ${eur(story.spend.budget)} available</td></tr>${story.spend.addedSquadCost.map((x, i) => `<tr><td>Added squad cost, season ${i + 1} (wages, bonuses, fees spread over the contract)</td><td>${eur(x)} — squad total ${eur(story.spend.squadCostTotal[i])} of ${eur(story.spend.squadCostLimit[i])}</td></tr>`).join('')}<tr><td>Total contract commitments</td><td>${eur(story.spend.totalCommitment)}</td></tr><tr><td>Net present value of the signings (money only, all seasons, discounted)</td><td>${eur(story.spend.netValue)}</td></tr></tbody></table>`) : ''}
  ${b ? sec('Club limits', `<table><thead><tr><th>Limit</th><th class="num">Used</th><th class="num">Limit</th></tr></thead><tbody>${limits}</tbody></table>`) : ''}
  ${sec('Why this choice', ul(story.why))}
  ${sec('What could go wrong', ul(story.risks))}
  ${story.feasible ? sec('Alternatives and players left out', ul(story.alternatives.length ? story.alternatives.map(a => `${a.names.join(' + ') || 'No signing'}: ${eur(a.gap)} less overall; ${eur(a.atSigning)} at signing`) : ['No other combination stays within every limit.']) + ul(story.notChosen.map(n => `${n.name}: ${n.reason}`))) : ''}
  ${compare ? sec('Scenario comparison', `<table><thead><tr><th></th><th>Scenario A</th><th>Scenario B (this report)</th></tr></thead><tbody>${compare.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('')}</tbody></table>${compare.changes.length ? `<p>Changes from A to B:</p>${ul(compare.changes)}` : ''}`) : ''}
  ${sec('Inputs used', `<table><thead><tr><th>Player</th><th>Position</th><th>Deal</th><th>Fee</th><th>Wage / season (club share)</th><th>Seasons</th><th>Expected points / season</th><th>Resale</th><th>Choice</th></tr></thead><tbody>${shortlist}</tbody></table>
    ${ul([`Planning period ${c.horizon} seasons; budget at signing ${eur(c.transferBudget)}; cash today ${eur(c.openingCash)}; club cash flow without signings ${c.operatingCashFlow.map(eur).join(' / ')}.`,
      `Squad-cost limit ${c.squadCostLimit.map(eur).join(' / ')}; already committed ${c.committedSquadCost.map(eur).join(' / ')}; cash that must always remain ${eur(c.minCash + c.protectedReserve)}.`,
      `Squad places ${c.currentSquadSize}/${c.maxSquadSize}; non-EU ${c.currentNonEU}/${c.maxNonEU}; at most ${c.maxSignings} signings; required positions: ${Object.entries(c.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(', ') || 'none'}.`,
      `Goal: ${c.objective === 'blended' ? `money plus ${eur(c.valuePerPoint)} per expected league point` : c.objective === 'npv' ? 'money only' : 'most expected league points'}; discount rate ${pct(c.discountRate)}; bad case: resale −${pct(c.stress.resaleHaircut)}, player revenue −${pct(c.stress.revenueHaircut)}; a second player in the same position counts ${pct(c.samePositionFactor)}.`])}`)}
  ${sec('Assumptions and limitations', ul([
    meta.imported ? 'All player figures and estimates are those you imported; LANOVA did not check them against any external source.' : 'All clubs, players and figures are fictional; expected points are illustrative estimates, not real performance data.',
    'Expected points are estimates entered by the user. LANOVA does not predict sporting performance, value players or advise on prices.',
    'Blank contract terms follow the engine conventions: no extra cost, flat wage, fee paid at signing, loan wage paid in full, stay until contract end, unless stated.',
    'Cash is modelled once per season. No tax, employer charges, currency risk, sales of current players or league financial rules are modelled.',
    'Decision support only — not financial, legal or investment advice.']))}
  <p class="rep-foot">LANOVA Sports · Lake Management · lakecapitalmanagement.com/lanova/workspace/ · Generated in the browser from the inputs listed above; nothing was uploaded. Recommendations are financial-constraint analyses, not sporting predictions.</p>`;
}
