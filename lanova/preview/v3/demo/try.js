/** "Try LANOVA" — instant demonstration on fictional cases. Runs entirely in the browser; nothing is sent or stored. */
import {SCENARIOS, applyWhatIf, describeChange} from './scenarios.js';
import {story, diff, eur} from './explain.js';
import {PILOT, pilotTarget} from './config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const DEAL = {permanent: 'Transfer', loan: 'Loan', free: 'Free agent'};
const POS = {GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker'};
const state = {meta: null, base: null, current: null, whatIf: null, pending: null, seq: 0, worker: null, result: null, baseStory: null, story: null, fresh: false};

// ---------------- home
$('cases').innerHTML = SCENARIOS.map(s => {
  const c = s.scenario.context;
  const needs = Object.entries(c.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(' + ');
  return `<button type="button" class="case-card" data-case="${esc(s.id)}"><span class="tag">${esc(s.tier)}</span><span class="club">${esc(s.club)}</span><span>${esc(s.headline)}</span>
    <span class="muted small">${eur(c.transferBudget)} to spend at signing · needs ${esc(needs)} · ${s.scenario.candidates.length} shortlisted players</span><span class="open">Open this case →</span></button>`;
}).join('');
document.querySelectorAll('[data-case]').forEach(b => b.addEventListener('click', () => openCase(b.dataset.case)));
$('back').addEventListener('click', () => { stopWorker(); state.seq++; show('home'); });

function show(view) { document.body.dataset.view = view; $('home').hidden = view !== 'home'; $('case').hidden = view !== 'case'; window.scrollTo({top: 0}); }
function stopWorker() { state.worker?.terminate(); state.worker = null; }

// ---------------- case
function openCase(id) {
  const meta = SCENARIOS.find(s => s.id === id);
  stopWorker(); state.seq++;
  Object.assign(state, {meta, base: structuredClone(meta.scenario), current: structuredClone(meta.scenario), whatIf: null, pending: null, result: null, baseStory: null, story: null, fresh: false});
  $('case-tier').textContent = meta.tier;
  $('case-club').textContent = meta.club;
  $('case-decision').textContent = meta.decision;
  const c = meta.scenario.context;
  $('case-facts').innerHTML = [
    ['To spend at signing', eur(c.transferBudget)], ['Cash today', eur(c.openingCash)], ['Wage + amortisation limit', `${eur(c.squadCostLimit[0])} a season`],
    ['Must sign', Object.entries(c.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(', ') || 'nothing specific'], ['Shortlist', `${meta.scenario.candidates.length} players`],
  ].map(([k, v]) => `<li>${esc(k)}: <b>${esc(v)}</b></li>`).join('');
  renderInputs(meta.scenario);
  $('confirm').checked = false; $('run').disabled = true; $('run-status').textContent = '';
  $('result').hidden = true; $('whatif-confirm').hidden = true; $('whatif-result').hidden = true; $('whatif-reset').hidden = true;
  $('whatifs').innerHTML = meta.whatIfs.map(w => `<button type="button" data-whatif="${esc(w.id)}" aria-pressed="false">${esc(w.label)}</button>`).join('');
  document.querySelectorAll('[data-whatif]').forEach(b => b.addEventListener('click', () => proposeWhatIf(b.dataset.whatif)));
  setStale(false);
  show('case');
}

function renderInputs(s) {
  const rows = s.candidates.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(POS[c.position])}</td><td>${esc(DEAL[c.dealType])}</td><td class="num">${eur(c.fee ?? 0)}</td><td class="num">${eur(c.wage)}${c.dealType === 'loan' && (c.wageShare ?? 1) !== 1 ? ` (club pays ${Math.round(c.wageShare * 100)}%)` : ''}</td><td class="num">${c.contractYears}</td><td class="num">${c.points}</td><td class="num">${c.exitValue ? `${eur(c.exitValue)} after season ${c.exitSeason ?? c.contractYears}` : '—'}</td></tr>`).join('');
  $('inputs-table').innerHTML = `<thead><tr><th>Player (fictional)</th><th>Position</th><th>Deal</th><th class="num">Fee</th><th class="num">Wage / season</th><th class="num">Seasons</th><th class="num">Expected points / season*</th><th class="num">Expected resale</th></tr></thead><tbody>${rows}</tbody>`;
  const c = s.context;
  const L = [['Planning period', `${c.horizon} seasons`], ['Budget at signing', eur(c.transferBudget)], ['Cash today', eur(c.openingCash)], ['Club cash flow without signings', c.operatingCashFlow.map(eur).join(' / ')],
    ['Squad-cost limit per season', c.squadCostLimit.map(eur).join(' / ')], ['Already committed per season', c.committedSquadCost.map(eur).join(' / ')], ['Cash that must always remain', eur(c.minCash + c.protectedReserve)],
    ['Total-commitment cap', c.lifetimeCapital === null ? 'none' : eur(c.lifetimeCapital)], ['Largest acceptable loss in a bad season', c.maxDownsideLoss === null ? 'none' : eur(c.maxDownsideLoss)],
    ['Squad places', `${c.currentSquadSize} of ${c.maxSquadSize} used`], ['Non-EU places', `${c.currentNonEU} of ${c.maxNonEU} used`], ['Maximum signings', String(c.maxSignings)],
    ['Value of one league point', eur(c.valuePerPoint)], ['A bad season means', `resale −${Math.round(c.stress.resaleHaircut * 100)}%, player revenue −${Math.round(c.stress.revenueHaircut * 100)}%`]];
  $('inputs-limits').innerHTML = L.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + '<div><dt>* Expected points</dt><dd>Illustrative estimates for this fictional case</dd></div>';
}

$('confirm').addEventListener('change', () => { $('run').disabled = !$('confirm').checked; });
$('run').addEventListener('click', () => { if (!$('confirm').checked) return; state.whatIf = null; compute(state.base, 'base'); });

// ---------------- engine runs (worker, newest request wins)
function setStale(on) {
  state.fresh = !on && Boolean(state.story);
  document.body.dataset.stale = on ? '1' : '0';
  $('stale').hidden = !on;
  $('print').disabled = on || !state.story;
  document.querySelectorAll('[data-whatif], #whatif-reset').forEach(b => { b.disabled = on; });
}
function compute(scenario, purpose) {
  stopWorker();
  const id = ++state.seq;
  setStale(true);
  if (purpose === 'base') { $('run').disabled = true; $('run-status').textContent = 'Comparing every combination…'; }
  const w = new Worker('demo/worker.js', {type: 'module'});
  state.worker = w;
  const timer = setTimeout(() => { if (id === state.seq) { stopWorker(); $('run-status').textContent = 'The calculation took too long and was stopped.'; setStale(false); } }, 15000);
  w.onmessage = ({data}) => {
    if (id !== state.seq) return; // an older request: ignore
    clearTimeout(timer); stopWorker();
    if (data.error) { $('run-status').textContent = `The engine rejected the inputs: ${data.error}`; setStale(false); $('run').disabled = !$('confirm').checked; return; }
    state.current = data.scenario; state.result = data;
    state.story = story(state.meta, data.scenario, data.analysis, {robustness: data.robustness, fixes: data.fixes});
    if (purpose === 'base') state.baseStory = state.story;
    $('run-status').textContent = ''; $('run').disabled = !$('confirm').checked;
    render(purpose);
    setStale(false);
  };
  w.onerror = () => { if (id !== state.seq) return; clearTimeout(timer); stopWorker(); $('run-status').textContent = 'The calculation failed; no recommendation is shown.'; setStale(false); };
  w.postMessage({id, scenario, now: new Date().toISOString()});
}

// ---------------- render
function render(purpose) {
  const s = state.story, a = state.result.analysis;
  $('result').hidden = false;
  document.body.dataset.result = s.feasible ? 'feasible' : 'infeasible';
  $('rec-headline').textContent = s.headline;
  if (s.feasible) {
    $('rec-players').innerHTML = s.players.map(p => `<div class="player"><div class="name">${esc(p.name)}</div><div class="meta">${esc(POS[p.position])} · ${esc(p.deal)} · ${p.years} season${p.years > 1 ? 's' : ''}</div>
      <dl><dt>Pay at signing</dt><dd>${eur(p.atSigning)}</dd><dt>Wages, first season</dt><dd>${eur(p.wagesPerSeason)}</dd><dt>Total commitment</dt><dd>${eur(p.totalCommitment)}</dd><dt>Expected points / season*</dt><dd>${p.points}</dd></dl></div>`).join('') || '<p>No signing.</p>';
    $('rec-proof').textContent = `${s.proven ? 'Checked against all' : 'Best found among'} ${s.searchSpace.toLocaleString('en-GB')} possible combinations of the shortlist. * Illustrative estimates for this fictional case.`;
    const sp = s.spend;
    $('spend').innerHTML = `<p class="big">${eur(sp.atSigning)}</p><p class="muted small">paid at signing, out of ${eur(sp.budget)} available. Squad cost = wages, bonuses and fees spread over the contract.</p>
      <div class="bar-meter" aria-hidden="true"><span id="meter"></span></div>
      <dl class="kv">${sp.addedSquadCost.map((x, i) => `<dt>Added squad cost, season ${i + 1}</dt><dd>${eur(x)}</dd>`).join('')}<dt>Total contract commitments</dt><dd>${eur(sp.totalCommitment)}</dd></dl>`;
    $('meter').style.width = `${Math.min(100, sp.budget ? 100 * sp.atSigning / sp.budget : 0).toFixed(0)}%`; // CSSOM, allowed by the CSP
  } else {
    $('rec-players').innerHTML = `<div class="player"><div class="name">What would make a safe choice possible</div><ul class="bullets">${s.fixes.map(f => `<li>${esc(f.label)}: ${f.works ? `yes → ${esc(f.names.join(' + ') || 'no signing')}` : 'not enough on its own'}</li>`).join('')}</ul><p class="muted small">Each line is a separate engine re-run with one change. These are possibilities to discuss, not recommendations.</p></div>`;
    $('rec-proof').textContent = s.proven ? `All ${s.searchSpace.toLocaleString('en-GB')} combinations were checked.` : '';
    $('spend').innerHTML = '<p>Nothing: no combination can be signed safely under these limits.</p>';
  }
  $('why').innerHTML = s.why.map(w => `<li>${esc(w)}</li>`).join('');
  $('risks').innerHTML = s.risks.map(r => `<li>${esc(r)}</li>`).join('');
  $('alternatives').innerHTML = s.feasible ? (s.alternatives.length ? s.alternatives.map(o => `<li>${esc(o.names.join(' + ') || 'No signing')} — ${eur(o.gap)} less overall, ${eur(o.atSigning)} at signing.</li>`).join('') : '<li>None: this is the only combination on the shortlist that stays within every limit.</li>') : '<li>None feasible.</li>';
  $('not-chosen').innerHTML = (s.notChosen ?? []).map(n => `<li><strong>${esc(n.name)}</strong>: ${esc(n.reason)}</li>`).join('');
  renderDetail(a);
  // what-if feedback
  document.querySelectorAll('[data-whatif]').forEach(b => b.setAttribute('aria-pressed', String(state.whatIf?.id === b.dataset.whatif)));
  if (purpose === 'whatif') {
    const d = diff(state.baseStory, s);
    const box = $('whatif-result');
    box.hidden = false;
    box.className = 'whatif-result ' + (!d.feasibleAfter ? 'bad' : (d.added.length || d.removed.length) ? 'changed' : '');
    box.innerHTML = `<p><strong>${esc(state.whatIf.label)}</strong></p>` + (!d.feasibleAfter ? '<p>No safe combination remains. See “What would make a safe choice possible” above.</p>'
      : !d.feasibleBefore ? `<p>A safe choice becomes possible: ${esc(s.players.map(p => p.name).join(' + '))}.</p>`
      : (d.added.length || d.removed.length) ? `<p>The recommendation changes.${d.removed.length ? ` Out: ${esc(d.removed.join(', '))}.` : ''}${d.added.length ? ` In: ${esc(d.added.join(', '))}.` : ''} Pay at signing: ${eur(d.atSigning[0])} → ${eur(d.atSigning[1])}.</p>`
      : `<p>The recommendation stays the same. Pay at signing: ${eur(d.atSigning[1])}.</p>`);
    $('whatif-reset').hidden = false;
  } else { $('whatif-result').hidden = true; $('whatif-reset').hidden = true; }
}

function renderDetail(a) {
  const b = a.result.best, ctx = a.context;
  if (!b) { $('detail-body').innerHTML = `<p>${esc(a.summary)}</p>` + (a.noSigningEvaluation ? `<p class="small">Violated even by signing nobody: ${esc(a.noSigningEvaluation.violations.map(v => v.label).join('; '))}</p>` : ''); return; }
  const usage = b.usage.map(u => `<tr><td>${esc(u.label)}${u.season !== null ? ` (${u.id === 'cashFloor' ? 't=' : 's'}${u.season})` : ''}</td><td class="num">${['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'].includes(u.id) ? u.used : eur(u.used)}</td><td>${u.sense === '<=' ? '≤' : '≥'}</td><td class="num">${['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'].includes(u.id) ? u.limit : eur(u.limit)}</td></tr>`).join('');
  $('detail-body').innerHTML = `<dl class="kv"><dt>Objective (NPV + ${eur(ctx.valuePerPoint)} × discounted squad-adjusted points)</dt><dd>${eur(b.objective.primary)}</dd>
    <dt>Net present value of the signings: base / bad season / good season</dt><dd>${eur(b.npv)} / ${eur(b.npvDownside)} / ${eur(b.npvUpside)}</dd>
    <dt>Discount rate</dt><dd>${Math.round(ctx.discountRate * 1000) / 10}%</dd><dt>Squad-adjusted points per season</dt><dd>${b.pointsBySeason.map(p => p.toFixed(2)).join(' / ')}</dd>
    <dt>Bad-season cash path (t = 0…${ctx.horizon})</dt><dd>${b.cashDownside.map(eur).join(' / ')}</dd></dl>
    <h3 class="spaced">Every club limit</h3><div class="scroll"><table><thead><tr><th>Limit</th><th class="num">Used</th><th></th><th class="num">Limit</th></tr></thead><tbody>${usage}</tbody></table></div>
    <p class="small muted">Engine ${esc(a.engineVersion)}. Amortisation, instalments, wage growth, resale, sell-on and exit obligations are modelled per player; see the recruitment engine documentation.</p>`;
}

// ---------------- what-if (explicit confirmation of each change)
function proposeWhatIf(id) {
  if (!state.story) return;
  const w = state.meta.whatIfs.find(x => x.id === id);
  state.pending = w;
  $('whatif-changes').innerHTML = describeChange(state.base, w).map(c => `<li>${esc(c.label)}: ${esc(c.from)} → <strong>${esc(c.to)}</strong></li>`).join('');
  $('whatif-confirm').hidden = false;
}
$('whatif-apply').addEventListener('click', () => { const w = state.pending; if (!w) return; state.pending = null; $('whatif-confirm').hidden = true; state.whatIf = w; compute(applyWhatIf(state.base, w), 'whatif'); });
$('whatif-cancel').addEventListener('click', () => { state.pending = null; $('whatif-confirm').hidden = true; });
$('whatif-reset').addEventListener('click', () => { state.whatIf = null; compute(state.base, 'base'); });

// ---------------- printable report
$('print').addEventListener('click', () => {
  if (!state.story || !state.fresh) return;
  $('report').innerHTML = reportHtml();
  window.print();
});
function reportHtml() {
  const s = state.story, sc = state.current, ctx = state.result.analysis.context, when = new Date().toISOString().slice(0, 10);
  const inputs = sc.candidates.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.position)}</td><td>${esc(DEAL[c.dealType])}</td><td>${eur(c.fee)}</td><td>${eur(c.wage)}${c.dealType === 'loan' ? ` × ${Math.round(c.wageShare * 100)}%` : ''}</td><td>${c.contractYears}</td><td>${c.points}</td><td>${c.exitValue ? eur(c.exitValue) : '—'}</td></tr>`).join('');
  const sec = (t, body) => `<section><h2>${esc(t)}</h2>${body}</section>`;
  const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `<p class="stamp">FICTIONAL DEMONSTRATION — NOT REAL CLUB OR PLAYER DATA</p>
  <h1>Recruitment decision report — ${esc(s.club)}</h1><p>${esc(s.tier)} · generated ${when} · LANOVA Sports prototype, engine ${esc(state.result.analysis.engineVersion)}</p>
  ${sec('Decision evaluated', `<p>${esc(s.decision)}</p>${state.whatIf ? `<p><strong>Scenario adjustment applied:</strong> ${esc(state.whatIf.label)}.</p>` : ''}`)}
  ${sec('Recommendation', `<p><strong>${esc(s.headline)}</strong></p>` + (s.feasible ? `<table><thead><tr><th>Player</th><th>Position</th><th>Deal</th><th>Seasons</th><th>Pay at signing</th><th>Wages season 1</th><th>Total commitment</th><th>Expected points/season</th></tr></thead><tbody>${s.players.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.position)}</td><td>${esc(p.deal)}</td><td>${p.years}</td><td>${eur(p.atSigning)}</td><td>${eur(p.wagesPerSeason)}</td><td>${eur(p.totalCommitment)}</td><td>${p.points}</td></tr>`).join('')}</tbody></table><p>${s.proven ? 'Checked against all' : 'Best found among'} ${s.searchSpace.toLocaleString('en-GB')} possible combinations.</p>` : ul(s.fixes.map(f => `${f.label}: ${f.works ? 'feasible → ' + (f.names.join(' + ') || 'no signing') : 'not enough on its own'}`))))}
  ${s.feasible ? sec('Costs', `<table><tbody><tr><td>Paid at signing</td><td>${eur(s.spend.atSigning)} of ${eur(s.spend.budget)} available</td></tr>${s.spend.addedSquadCost.map((x, i) => `<tr><td>Added wages + amortisation, season ${i + 1}</td><td>${eur(x)} (squad total ${eur(s.spend.squadCostTotal[i])} of ${eur(s.spend.squadCostLimit[i])} limit)</td></tr>`).join('')}<tr><td>Total contract commitments</td><td>${eur(s.spend.totalCommitment)}</td></tr><tr><td>Net present value of the signings (money only)</td><td>${eur(s.spend.netValue)}</td></tr><tr><td>Overall result incl. ${eur(ctx.valuePerPoint)} per expected point</td><td>${eur(s.spend.objective)}</td></tr></tbody></table>`) : ''}
  ${sec('Why', ul(s.why))}
  ${sec('Risks', ul(s.risks) + (s.robustness?.length ? `<table><thead><tr><th>Stress test (engine re-run)</th><th>Recommendation</th></tr></thead><tbody>${s.robustness.map(r => `<tr><td>${esc(r.label)}</td><td>${r.changes ? 'changes' : 'unchanged'}</td></tr>`).join('')}</tbody></table>` : ''))}
  ${s.feasible ? sec('Alternatives', ul(s.alternatives.length ? s.alternatives.map(o => `${o.names.join(' + ') || 'No signing'}: ${eur(o.gap)} less overall; ${eur(o.atSigning)} at signing`) : ['None: no other combination stays within every limit.']) + ul((s.notChosen ?? []).map(n => `${n.name}: ${n.reason}`))) : ''}
  ${sec('Inputs used (fictional)', `<table><thead><tr><th>Player</th><th>Pos</th><th>Deal</th><th>Fee</th><th>Wage/season</th><th>Seasons</th><th>Points/season</th><th>Resale</th></tr></thead><tbody>${inputs}</tbody></table>
    ${ul([`Planning period ${ctx.horizon} seasons; budget at signing ${eur(ctx.transferBudget)}; cash today ${eur(ctx.openingCash)}; club cash flow ${ctx.operatingCashFlow.map(eur).join(' / ')}.`,
      `Squad-cost limit ${ctx.squadCostLimit.map(eur).join(' / ')}; already committed ${ctx.committedSquadCost.map(eur).join(' / ')}; cash that must remain ${eur(ctx.minCash + ctx.protectedReserve)}.`,
      `Total-commitment cap ${ctx.lifetimeCapital === null ? 'none' : eur(ctx.lifetimeCapital)}; largest acceptable bad-season loss ${ctx.maxDownsideLoss === null ? 'none' : eur(ctx.maxDownsideLoss)}; required positions ${Object.entries(ctx.positionNeeds).map(([p, n]) => n + ' ' + p).join(', ') || 'none'}.`,
      `Value of a league point ${eur(ctx.valuePerPoint)}; discount rate ${Math.round(ctx.discountRate * 1000) / 10}%; a second player in the same position counts ${Math.round(ctx.samePositionFactor * 100)}%; bad season: resale −${Math.round(ctx.stress.resaleHaircut * 100)}%, player revenue −${Math.round(ctx.stress.revenueHaircut * 100)}%.`])}`)}
  ${sec('Assumptions and limitations', ul(['All clubs, players and figures are fictional; expected points are illustrative estimates, not predictions or real performance data.',
    'Blank contract terms follow the engine conventions: no wage growth or player revenue unless stated, fee paid at signing unless instalments are given, loan wage paid in full unless a share is given, stay until contract end unless an exit is given. These are conventions, not guarantees of prudence.',
    'Cash is modelled once per season (start and end), not month by month. No tax, employer charges, currency risk or league-specific financial regulations are modelled.',
    'The result is the best combination for the stated goal and limits; it is only as reliable as those inputs. It is decision support, not financial or legal advice.']))}`;
}

// ---------------- request a pilot
const pilot = pilotTarget(PILOT);
document.querySelectorAll('[data-pilot]').forEach(b => b.addEventListener('click', () => {
  $('pilot').hidden = false;
  if (pilot.ok) {
    $('pilot-text').textContent = pilot.kind === 'email' ? 'This opens your own email program with a short message to LANOVA. No scenario data is attached or sent by this page.' : 'This opens the LANOVA pilot page.';
    Object.assign($('pilot-link'), {href: pilot.href, hidden: false, rel: 'noopener', target: pilot.kind === 'link' ? '_blank' : ''});
  } else {
    $('pilot-text').textContent = `Pilot requests are not connected yet in this demo build (${pilot.reason}) No message has been sent. Please contact the person who shared this demo with you.`;
    $('pilot-link').hidden = true;
  }
}));
$('pilot-close').addEventListener('click', () => { $('pilot').hidden = true; });
document.body.dataset.ready = '1';
