/**
 * LANOVA Sports — Recruitment Workspace.
 * App shell (sidebar + views): clubs → decision dashboard → shortlist → scenario inputs → compare A/B → report.
 * Fictional cases or an imported shortlist are analysed, after confirmation, by the unchanged LANOVA engine (worker).
 * Every figure shown comes from the engine result or from the (fictional or imported) inputs. Nothing is uploaded or stored.
 */
import {SCENARIOS} from '../v3/demo/scenarios.js';
import {story as buildStory, eur} from '../v3/demo/explain.js';
import {parseCsv, parseXlsx, suggestMapping, checkRows, toCandidates, FIELDS, MAX_BYTES, TEMPLATE_CSV} from './import.js';
import {reportHtml} from './report.js';
import {csvRow} from './csv.js';
import {canonicalCandidate} from '../recruitment/scenario.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const POS = {GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker'};
const POS_ORDER = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
const DEAL = {permanent: 'Transfer', loan: 'Loan', free: 'Free agent'};
const COUNT_IDS = ['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'];
const ENGINE_DEFAULTS = {discountRate: 0.1, resaleHaircut: 0.5, revenueHaircut: 0.3, upsideResale: 0.2, upsideRevenue: 0.2, samePositionFactor: 0.5};
const S = {meta: null, original: null, modes: {}, candidates: [], form: null, needs: {}, result: null, fresh: false, A: null, seq: 0, worker: null, pendingRun: null, imp: null, caseId: null, ver: 0, resultVer: -1};
/** A result is current only if it was computed from the exact input version now on screen. */
const isCurrent = () => Boolean(S.result && S.fresh && S.resultVer === S.ver);
const needsText = n => Object.entries(n ?? {}).map(([p, k]) => `${k} ${POS[p].toLowerCase()}`).join(', ');
const pctOf = (a, b) => b > 0 ? Math.max(0, Math.min(100, 100 * a / b)) : (a > 0 ? 100 : 0);

// ======================================================================= navigation
const VIEWS = ['home', 'import', 'dashboard', 'shortlist', 'inputs', 'compare'];
const VIEW_LABEL = {home: 'Clubs', import: 'Import', dashboard: 'Decision dashboard', shortlist: 'Shortlist', inputs: 'Scenario inputs', compare: 'Compare A / B'};
function show(view) {
  if (['dashboard', 'shortlist', 'inputs', 'compare'].includes(view) && !S.meta) view = 'home';
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
  const caseView = S.meta && !['home', 'import'].includes(view);
  document.querySelectorAll('.side-item[data-nav]').forEach(b => b.dataset.nav === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  document.querySelectorAll('[data-side-case]').forEach(b => caseView && b.dataset.sideCase === S.caseId ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
  const imp = document.querySelector('.side-item[data-go="import"]');
  if (view === 'import') imp.setAttribute('aria-current', 'page'); else imp.removeAttribute('aria-current');
  $('crumb-club').textContent = S.meta && view !== 'home' && view !== 'import' ? S.meta.club : 'Recruitment Workspace';
  $('crumb-view').textContent = VIEW_LABEL[view];
  $('analyse').hidden = !S.meta || view === 'home' || view === 'import';
  window.scrollTo({top: 0});
}
function navState() {
  document.querySelectorAll('.side-item[data-nav]').forEach(b => { b.disabled = !S.meta; });
  $('nav-count').textContent = S.meta ? String(S.candidates.length) : '';
}
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]'); if (n && !n.disabled) { show(n.dataset.nav); return; }
  const g = e.target.closest('[data-go]'); if (g) { if (g.dataset.go === 'import') openImport(); else { stopWorker(); show(g.dataset.go); } }
});
function stopWorker() { S.worker?.terminate(); S.worker = null; S.seq++; }
const RUN = {idle: 'Not analysed', busy: 'Analysing…', fresh: 'Result up to date', infeasible: 'No safe option', stale: 'Inputs changed — run again', failed: 'Analysis failed'};
function runState(state) { const c = $('run-state'); c.dataset.state = state; c.textContent = RUN[state]; c.hidden = !S.meta; }

// ======================================================================= home + sidebar clubs
$('case-rows').innerHTML = SCENARIOS.map(s => {
  const c = s.scenario.context;
  return `<tr><td data-l="Club" class="name-cell"><span class="name">${esc(s.club)}</span> <span class="tag fict">Fictional</span><span class="sub">${esc(s.tier)}</span></td>
    <td data-l="Situation" class="span">${esc(s.headline)}</td>
    <td data-l="Budget at signing" class="num">${eur(c.transferBudget)}</td>
    <td data-l="Must sign">${esc(needsText(c.positionNeeds) || 'No specific position')}</td>
    <td data-l="Shortlist" class="num">${s.scenario.candidates.length} players</td>
    <td class="span num"><button type="button" class="btn btn-secondary" data-case="${esc(s.id)}">Open</button></td></tr>`;
}).join('');
$('case-rows').closest('table').classList.add('stack');
$('side-cases').innerHTML = SCENARIOS.map(s => `<button type="button" class="side-item case-item" data-side-case="${esc(s.id)}"><span class="dot" aria-hidden="true"></span><span>${esc(s.club)}<span class="sub">${esc(s.tier)}</span></span></button>`).join('');
document.querySelectorAll('button[data-case], button[data-side-case]').forEach(b => b.addEventListener('click', () => {
  const id = b.dataset.case ?? b.dataset.sideCase, s = SCENARIOS.find(x => x.id === id);
  S.caseId = id;
  openCase({club: s.club, tier: s.tier, decision: s.decision, imported: false}, structuredClone(s.scenario));
}));

// ======================================================================= workspace
function openCase(meta, scenario) {
  stopWorker();
  scenario = {...scenario, candidates: scenario.candidates.map(canonicalCandidate)}; // engine's own normalisation: what you see is what is calculated
  if (meta.imported) S.caseId = null;
  Object.assign(S, {meta, original: structuredClone(scenario), candidates: scenario.candidates, modes: {...(scenario.modes ?? {})}, result: null, fresh: false, A: null, pendingRun: null, resultVer: -1});
  S.ver++;
  S.form = formFrom(scenario.context, meta.imported);
  S.needs = {...(scenario.context.positionNeeds ?? {})};
  S.extra = {upsideResale: scenario.context.stress?.upsideResale ?? ENGINE_DEFAULTS.upsideResale, upsideRevenue: scenario.context.stress?.upsideRevenue ?? ENGINE_DEFAULTS.upsideRevenue};
  $('w-tier').innerHTML = `${esc(meta.tier)}${meta.imported ? '' : ' <span class="tag fict">Fictional</span>'}`;
  $('w-club').textContent = meta.club;
  $('w-decision').textContent = meta.decision;
  $('sl-title').textContent = `${meta.club} — ${scenario.candidates.length} players`;
  document.body.dataset.club = meta.imported ? 'imported' : S.caseId;
  renderFacts(); renderShortlist(); renderForm();
  for (const id of ['results', 'busy', 'stale', 'error', 'review']) $(id).hidden = true;
  $('results-empty').hidden = false; $('form-status').textContent = ''; $('form-status').className = 'status';
  document.body.dataset.stale = '0'; document.body.dataset.hasResult = '0';
  setExports(false); navState(); runState('idle');
  renderCompare();
  show('dashboard');
}
function renderFacts() {
  const c = S.original.context, f = S.meta.imported;
  const items = f ? [['Shortlist', `${S.candidates.length} players (imported)`], ['Club limits', 'Enter them in Scenario inputs']]
    : [['Budget at signing', eur(c.transferBudget)], ['Cash today', eur(c.openingCash)], ['Squad-cost limit, season 1', eur(c.squadCostLimit[0])], ['Already committed, season 1', eur(c.committedSquadCost[0])], ['Must sign', needsText(c.positionNeeds) || 'No specific position'], ['Shortlist', `${S.candidates.length} players · ${c.horizon} seasons`]];
  $('w-facts').innerHTML = items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

// ---------------- shortlist
function renderShortlist() {
  const rec = isCurrent() ? new Set(S.result.analysis.result.best?.selection ?? []) : new Set();
  $('shortlist').innerHTML = `<table class="data stack"><thead><tr><th>Player</th><th>Position</th><th class="num">Fee</th><th class="num">Wage / season</th><th class="num">Seasons</th><th class="num">Expected points*</th><th>Choice</th></tr></thead><tbody>${S.candidates.map(p => {
    const m = S.modes[p.id] ?? 'optimise', wage = p.wage * (p.dealType === 'loan' ? p.wageShare : 1);
    return `<tr class="${m === 'must' ? 'row-must' : m === 'exclude' ? 'row-exclude' : ''}" data-row="${esc(p.id)}">
      <td class="name-cell"><span class="name">${esc(p.name)}</span>${rec.has(p.id) ? ' <span class="tag ok">Recommended</span>' : ''}${m === 'must' ? ' <span class="tag must">Must sign</span>' : ''}<span class="sub">${DEAL[p.dealType]}${p.exitValue ? ` · resale ${eur(p.exitValue)} after season ${p.exitSeason}${p.exitValueDownside !== null && p.exitValueDownside !== undefined ? ` (bad case ${eur(p.exitValueDownside)})` : ''}` : ''}${p.nonEU ? ' · non-EU' : ''}</span></td>
      <td data-l="Position">${esc(POS[p.position])}</td>
      <td data-l="Fee" class="num">${eur(p.fee)}</td>
      <td data-l="Wage / season" class="num">${eur(wage)}${p.dealType === 'loan' && p.wageShare !== 1 ? `<span class="sub">${Math.round(p.wageShare * 100)}% of ${eur(p.wage)}</span>` : ''}</td>
      <td data-l="Seasons" class="num">${p.contractYears}</td>
      <td data-l="Expected points*" class="num">${p.points}</td>
      <td class="span"><div class="seg" role="group" aria-label="Choice for ${esc(p.name)}">${[['optimise', 'Consider'], ['must', 'Must sign'], ['exclude', 'Leave out']].map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div></td></tr>`;
  }).join('')}</tbody></table><p class="foot-note">* ${S.meta.imported ? 'Your own estimate of the league points the player adds per season.' : 'Illustrative estimate written for this fictional case, not real data. LANOVA does not predict sporting performance.'}</p>`;
  $('shortlist').querySelectorAll('[data-row]').forEach(row => row.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const id = row.dataset.row; if (b.dataset.mode === 'optimise') delete S.modes[id]; else S.modes[id] = b.dataset.mode;
    changed(); renderShortlist();
  })));
}

// ---------------- club limits form (plain fields; no JSON)
const BASIC = [
  {key: 'horizon', label: 'Planning period (seasons)', kind: 'int', min: 1, max: 6, hint: '1 to 6 seasons'},
  {key: 'transferBudget', label: 'Budget to spend at signing', kind: 'eur', hint: 'Fees, agent fees and first signing-bonus part paid now'},
  {key: 'squadCostLimit', label: 'Squad-cost limit per season', kind: 'series', hint: 'Wages, bonuses and fees spread over contracts'},
  {key: 'committedSquadCost', label: 'Squad cost already committed', kind: 'series', hint: 'Your existing contracts, per season'},
  {key: 'openingCash', label: 'Cash available today', kind: 'eur', negative: true},
  {key: 'protectedReserve', label: 'Cash that must always remain', kind: 'eur', hint: 'Checked in a bad season, every season'},
  {key: 'maxSignings', label: 'Maximum new signings', kind: 'int', min: 0, max: 60},
  {key: 'currentSquadSize', label: 'Players registered now', kind: 'int', min: 0, max: 60},
  {key: 'maxSquadSize', label: 'Maximum registered players', kind: 'int', min: 0, max: 60},
  {key: 'currentNonEU', label: 'Non-EU places used now', kind: 'int', min: 0, max: 60},
  {key: 'maxNonEU', label: 'Maximum non-EU places', kind: 'int', min: 0, max: 60},
];
const ADVANCED = [
  {key: 'operatingCashFlow', label: 'Club cash flow per season, excluding these signings', kind: 'series', negative: true, hint: 'Negative if the club loses cash; 0 if unknown is not assumed — enter it'},
  {key: 'minCash', label: 'Absolute cash floor', kind: 'eur', negative: true, hint: 'Usually 0'},
  {key: 'lifetimeCapital', label: 'Cap on total contract commitments', kind: 'eur', optional: true, hint: 'Leave empty for no cap'},
  {key: 'maxDownsideLoss', label: 'Largest acceptable bad-case loss (present value)', kind: 'eur', optional: true, hint: 'Leave empty for no limit'},
  {key: 'discountRate', label: 'Discount rate', kind: 'pct', min: 0, max: 100, def: true},
  {key: 'resaleHaircut', label: 'Bad case: resale values lower by', kind: 'pct', min: 0, max: 100, def: true, stress: true},
  {key: 'revenueHaircut', label: 'Bad case: player revenue lower by', kind: 'pct', min: 0, max: 100, def: true, stress: true},
  {key: 'samePositionFactor', label: 'A second signing in the same position counts', kind: 'pct', min: 0, max: 100, def: true},
];
const toStr = v => v === null || v === undefined ? '' : String(v);
const amt = v => String(v ?? '').trim() !== '' && Number.isFinite(Number(v)) ? eur(Number(v)) : '';
function formFrom(ctx, blank) {
  const f = {}, H = blank ? null : ctx.horizon;
  for (const d of [...BASIC, ...ADVANCED]) {
    const raw = d.stress ? ctx.stress?.[d.key] : ctx[d.key];
    if (blank && !d.def && d.key !== 'minCash') { f[d.key] = d.kind === 'series' ? {same: true, values: ['']} : ''; continue; }
    if (d.kind === 'series') { const arr = raw ?? []; f[d.key] = {same: arr.every(x => x === arr[0]), values: arr.map(toStr)}; }
    else if (d.kind === 'pct') f[d.key] = toStr(Math.round((raw ?? ENGINE_DEFAULTS[d.key]) * 1e6) / 1e4);
    else f[d.key] = toStr(raw ?? (d.key === 'minCash' ? 0 : ''));
  }
  f.objective = blank ? '' : ctx.objective; f.valuePerPoint = blank ? '' : toStr(ctx.valuePerPoint);
  f._H = H;
  return f;
}
function fieldHtml(d) {
  const v = S.form[d.key];
  if (d.kind === 'series') {
    const H = Number(S.form.horizon) >= 1 && Number(S.form.horizon) <= 6 ? Number(S.form.horizon) : 1;
    const vals = Array.from({length: H}, (_, i) => v.values[i] ?? '');
    return `<div class="field" data-field="${d.key}"><span>${esc(d.label)}</span>
      <label class="check small"><input type="checkbox" data-same="${d.key}" ${v.same ? 'checked' : ''}> Same every season</label>
      ${v.same ? `<input type="number" inputmode="decimal" data-series="${d.key}" data-i="0" value="${esc(vals[0])}" aria-label="${esc(d.label)}, every season">`
        : `<div class="per-season">${vals.map((x, i) => `<input type="number" inputmode="decimal" data-series="${d.key}" data-i="${i}" value="${esc(x)}" aria-label="${esc(d.label)}, season ${i + 1}" placeholder="Season ${i + 1}">`).join('')}</div>`}
      <span class="amt" data-amt="${d.key}">${v.same ? amt(vals[0]) : vals.map(amt).join(' / ')}</span><span class="hint">${esc(d.hint ?? '')}</span></div>`;
  }
  return `<label class="field" data-field="${d.key}"><span>${esc(d.label)}${d.kind === 'pct' ? ' (%)' : d.kind === 'eur' ? ' (€)' : ''}</span>
    <input type="number" inputmode="${d.kind === 'int' ? 'numeric' : 'decimal'}" data-key="${d.key}" value="${esc(v)}" ${d.kind === 'int' ? 'step="1"' : ''}>${d.kind === 'eur' ? `<span class="amt" data-amt="${d.key}">${amt(v)}</span>` : ''}
    <span class="hint">${esc(d.def ? `LANOVA standard: ${Math.round(ENGINE_DEFAULTS[d.key] * 1000) / 10}% — change if your club uses another value` : d.hint ?? '')}</span></label>`;
}
function renderForm() {
  $('limits').innerHTML = BASIC.map(fieldHtml).join('');
  $('limits-advanced').innerHTML = ADVANCED.map(fieldHtml).join('');
  $('needs').innerHTML = POS_ORDER.map(p => `<div class="need ${S.needs[p] ? 'on' : ''}" data-need-box="${p}"><span>${esc(POS[p])}</span><span class="ctrl"><button type="button" data-need="${p}" data-d="-1" aria-label="One fewer ${esc(POS[p])}">−</button><span class="n" id="need-${p}">${S.needs[p] ?? 0}</span><button type="button" data-need="${p}" data-d="1" aria-label="One more ${esc(POS[p])}">+</button></span></div>`).join('');
  $('goal').innerHTML = `<label class="field" data-field="objective"><span>Choose the goal</span><select data-key="objective">
      <option value="" ${!S.form.objective ? 'selected' : ''} disabled>Choose…</option>
      <option value="blended" ${S.form.objective === 'blended' ? 'selected' : ''}>Balance sporting value and money</option>
      <option value="npv" ${S.form.objective === 'npv' ? 'selected' : ''}>Money only (best financial value)</option>
      <option value="points" ${S.form.objective === 'points' ? 'selected' : ''}>Most expected points within the limits</option></select><span class="hint"></span></label>
    <label class="field" data-field="valuePerPoint" ${S.form.objective === 'blended' ? '' : 'hidden'}><span>What one league point is worth to the club (€)</span><input type="number" inputmode="decimal" data-key="valuePerPoint" value="${esc(S.form.valuePerPoint)}"><span class="hint">Used to weigh sporting value against money</span></label>`;
  bindForm();
}
function bindForm() {
  document.querySelectorAll('#view-inputs [data-key]').forEach(el => el.addEventListener('input', () => {
    S.form[el.dataset.key] = el.value;
    const a = document.querySelector(`[data-amt="${el.dataset.key}"]`); if (a) a.textContent = amt(el.value);
    if (el.dataset.key === 'objective') { renderForm(); }
    if (el.dataset.key === 'horizon') { resizeSeries(); renderForm(); document.querySelector('[data-key="horizon"]')?.focus(); }
    changed();
  }));
  document.querySelectorAll('#view-inputs [data-series]').forEach(el => el.addEventListener('input', () => { S.form[el.dataset.series].values[Number(el.dataset.i)] = el.value; const a = document.querySelector(`[data-amt="${el.dataset.series}"]`); if (a) a.textContent = S.form[el.dataset.series].values.map(amt).join(' / '); changed(); }));
  document.querySelectorAll('#view-inputs [data-same]').forEach(el => el.addEventListener('change', () => {
    const s = S.form[el.dataset.same]; s.same = el.checked;
    if (s.same) s.values = [s.values[0] ?? '']; else { const H = Number(S.form.horizon) || 1; s.values = Array.from({length: H}, (_, i) => s.values[i] ?? s.values[0] ?? ''); }
    renderForm(); changed();
  }));
  document.querySelectorAll('[data-need]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.need, n = Math.max(0, Math.min(10, (S.needs[p] ?? 0) + Number(b.dataset.d)));
    if (n) S.needs[p] = n; else delete S.needs[p];
    $(`need-${p}`).textContent = String(n); document.querySelector(`[data-need-box="${p}"]`).classList.toggle('on', n > 0); changed();
  }));
}
function resizeSeries() {
  const H = Number(S.form.horizon);
  if (!Number.isInteger(H) || H < 1 || H > 6) return;
  for (const d of [...BASIC, ...ADVANCED]) if (d.kind === 'series' && !S.form[d.key].same) S.form[d.key].values = Array.from({length: H}, (_, i) => S.form[d.key].values[i] ?? '');
}
/** Form → engine context, or the list of field errors. Nothing is filled in silently. */
function readForm() {
  const errors = {}, f = S.form, ctx = {};
  const num = (d, s) => { const t = String(s ?? '').trim(); if (t === '') return d.optional ? null : (errors[d.key] = 'Required', undefined); const n = Number(t); if (!Number.isFinite(n)) return (errors[d.key] = 'Enter a number', undefined); return n; };
  const H = Number(f.horizon);
  if (!Number.isInteger(H) || H < 1 || H > 6) errors.horizon = 'Enter a whole number from 1 to 6';
  for (const d of [...BASIC, ...ADVANCED]) {
    if (d.key === 'horizon') { ctx.horizon = H; continue; }
    if (d.kind === 'series') {
      const vals = f[d.key].same ? Array(Number.isInteger(H) && H > 0 ? H : 1).fill(f[d.key].values[0]) : f[d.key].values;
      const out = vals.map(v => num(d, v));
      if (out.some(x => x === undefined)) { errors[d.key] ??= f[d.key].same ? 'Required' : 'Enter a value for every season'; continue; }
      if (!d.negative && out.some(x => x < 0)) { errors[d.key] = 'Cannot be negative'; continue; }
      ctx[d.key] = out; continue;
    }
    const v = num(d, f[d.key]); if (v === undefined) continue;
    if (v !== null && d.kind === 'int' && (!Number.isInteger(v) || v < d.min || v > d.max)) { errors[d.key] = `Whole number ${d.min}–${d.max}`; continue; }
    if (v !== null && d.kind === 'pct' && (v < d.min || v > d.max)) { errors[d.key] = `Between ${d.min} and ${d.max}`; continue; }
    if (v !== null && d.kind === 'eur' && !d.negative && v < 0) { errors[d.key] = 'Cannot be negative'; continue; }
    ctx[d.key] = d.kind === 'pct' ? v / 100 : v;
  }
  if (!f.objective) errors.objective = 'Choose a goal';
  ctx.objective = f.objective;
  if (f.objective === 'blended') { const v = Number(String(f.valuePerPoint).trim()); if (String(f.valuePerPoint).trim() === '' || !Number.isFinite(v) || v < 0) errors.valuePerPoint = 'Enter a value of 0 or more'; else ctx.valuePerPoint = v; }
  else ctx.valuePerPoint = 0;
  if (ctx.currentSquadSize > ctx.maxSquadSize) errors.currentSquadSize = 'More than the maximum';
  if (ctx.currentNonEU > ctx.maxNonEU) errors.currentNonEU = 'More than the maximum';
  ctx.stress = {resaleHaircut: ctx.resaleHaircut, revenueHaircut: ctx.revenueHaircut, upsideResale: S.extra.upsideResale, upsideRevenue: S.extra.upsideRevenue};
  delete ctx.resaleHaircut; delete ctx.revenueHaircut;
  ctx.positionNeeds = {...S.needs}; ctx.minPortfolioNpv = null;
  const tooMany = Object.entries(S.needs).filter(([p, n]) => n > S.candidates.filter(c => c.position === p && S.modes[c.id] !== 'exclude').length);
  if (tooMany.length) errors.needs = `Not enough players on the shortlist for: ${tooMany.map(([p]) => POS[p].toLowerCase()).join(', ')}`;
  return {ctx, errors};
}
function showErrors(errors) {
  document.querySelectorAll('#view-inputs .field').forEach(el => {
    const k = el.dataset.field, e = errors[k];
    el.classList.toggle('invalid', Boolean(e));
    const h = el.querySelector('.hint'); if (!h) return;
    if (e) { h.dataset.orig ??= h.textContent; h.textContent = e; } else if (h.dataset.orig !== undefined) { h.textContent = h.dataset.orig; delete h.dataset.orig; }
  });
}

// ---------------- changes and staleness
function changed() {
  S.ver++;
  $('review').hidden = true; S.pendingRun = null;
  const running = Boolean(S.worker);
  if (running) { stopWorker(); $('busy').hidden = true; } // the running analysis used the previous inputs: it can never become current
  S.fresh = false; setExports(false); $('report').innerHTML = '';
  if (S.result) { document.body.dataset.stale = '1'; $('stale').hidden = false; runState('stale'); }
  else if ($('error').hidden) { $('results-empty').hidden = false; runState('idle'); }
  $('form-status').textContent = running ? 'The running analysis was cancelled because the inputs changed. Run the analysis again.' : ''; $('form-status').className = 'status';
}
function setExports(on) { const ok = on && isCurrent(); $('export-report').disabled = !ok; $('export-csv').disabled = !ok; }

// ---------------- analyse: review → confirm → worker
function requestAnalysis() {
  if (!S.meta) return;
  const {ctx, errors} = readForm();
  showErrors(errors);
  if (Object.keys(errors).length) {
    show('inputs');
    const first = document.querySelector('#view-inputs .field.invalid');
    if (first?.closest('details')) first.closest('details').open = true;
    $('form-status').className = 'status';
    $('form-status').textContent = errors.needs ?? `Complete the ${Object.keys(errors).length} highlighted field${Object.keys(errors).length > 1 ? 's' : ''} first.`;
    first?.scrollIntoView({block: 'center'});
    return;
  }
  const scenario = {schema: 'lanova-recruitment-v2', fictional: !S.meta.imported, label: S.meta.club, context: ctx, candidates: S.candidates, modes: {...S.modes}};
  S.pendingRun = {scenario, ver: S.ver};
  const must = S.candidates.filter(c => S.modes[c.id] === 'must').map(c => c.name), out = S.candidates.filter(c => S.modes[c.id] === 'exclude').map(c => c.name);
  const changes = S.A ? diffInputs(S.A.inputs, {context: ctx, modes: scenario.modes}) : [];
  $('review-list').innerHTML = [
    `${S.candidates.length} players on the shortlist${must.length ? `; must sign: ${must.join(', ')}` : ''}${out.length ? `; left out: ${out.join(', ')}` : ''}.`,
    `Budget at signing ${eur(ctx.transferBudget)}; squad-cost limit ${ctx.squadCostLimit.map(eur).join(' / ')}; already committed ${ctx.committedSquadCost.map(eur).join(' / ')}.`,
    `Cash today ${eur(ctx.openingCash)}; must always remain ${eur(ctx.minCash + ctx.protectedReserve)}; club cash flow ${ctx.operatingCashFlow.map(eur).join(' / ')}.`,
    `At most ${ctx.maxSignings} signings; squad ${ctx.currentSquadSize}/${ctx.maxSquadSize}; non-EU ${ctx.currentNonEU}/${ctx.maxNonEU}; must sign ${needsText(ctx.positionNeeds) || 'no specific position'}.`,
    `Goal: ${ctx.objective === 'blended' ? `balance sporting value and money (${eur(ctx.valuePerPoint)} per league point)` : ctx.objective === 'npv' ? 'money only' : 'most expected points'}.`,
    ...(changes.length ? [`Changed since scenario A: ${changes.join('; ')}.`] : []),
  ].map(x => `<li>${esc(x)}</li>`).join('');
  $('review-ok').checked = false; $('review-run').disabled = true; $('review').hidden = false;
  $('review-ok').focus();
}
$('analyse').addEventListener('click', requestAnalysis);
$('analyse-bottom').addEventListener('click', requestAnalysis);
$('review-ok').addEventListener('change', () => { $('review-run').disabled = !$('review-ok').checked; });
$('review-cancel').addEventListener('click', () => { $('review').hidden = true; S.pendingRun = null; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('review').hidden) { $('review').hidden = true; S.pendingRun = null; } });
$('review-run').addEventListener('click', () => { if (!S.pendingRun || !$('review-ok').checked || S.pendingRun.ver !== S.ver) return; const {scenario, ver} = S.pendingRun; S.pendingRun = null; $('review').hidden = true; compute(scenario, ver); });

function compute(scenario, ver) {
  stopWorker();
  const id = ++S.seq;
  const live = () => id === S.seq && ver === S.ver; // same run and same confirmed inputs
  $('report').innerHTML = '';
  S.fresh = false; setExports(false); runState('busy');
  $('busy').hidden = false; $('error').hidden = true; $('results-empty').hidden = true;
  if (S.result) { document.body.dataset.stale = '1'; $('stale').hidden = false; }
  show('dashboard');
  const w = new Worker('../v3/demo/worker.js', {type: 'module'}); S.worker = w;
  const timer = setTimeout(() => { if (live()) failed('The analysis took longer than 15 seconds and was stopped. Try a shorter shortlist.'); }, 15000);
  w.onmessage = ({data}) => {
    if (!live() || data.id !== id) return; // late, cancelled or out-of-order response
    clearTimeout(timer); w.terminate(); S.worker = null;
    if (data.error) return failed(`LANOVA could not analyse these inputs: ${data.error}`);
    const st = buildStory(S.meta, data.scenario, data.analysis, {robustness: data.robustness, fixes: data.fixes});
    S.result = {scenario: data.scenario, analysis: data.analysis, story: st}; S.resultVer = ver;
    const inputs = {context: data.scenario.context, modes: data.scenario.modes};
    if (!S.A) S.A = {inputs, result: S.result};
    S.fresh = true;
    $('busy').hidden = true; $('stale').hidden = true; document.body.dataset.stale = '0';
    renderResult(); renderCompare(); renderShortlist(); setExports(true);
  };
  w.onerror = e => { e.preventDefault?.(); if (!live()) return; clearTimeout(timer); failed('The analysis failed unexpectedly.'); };
  w.postMessage({id, scenario, now: new Date().toISOString()});
}
function failed(message) {
  S.worker?.terminate(); S.worker = null;
  S.result = null; S.fresh = false; S.resultVer = -1; setExports(false); $('report').innerHTML = '';
  for (const x of ['busy', 'results', 'stale']) $(x).hidden = true;
  document.body.dataset.stale = '0'; document.body.dataset.hasResult = '0'; runState('failed');
  $('error').hidden = false; $('error').textContent = `${message} No recommendation is shown.`;
  renderCompare(); renderShortlist();
}

// ---------------- decision dashboard
/** Engine usage rows → one list used by the KPI strip and the constraints table. */
function constraintRows(ev, ctx) {
  const u = ev.usage, binding = new Set((S.result?.analysis.binding ?? []).map(x => `${x.id}:${x.season}`));
  const rows = [], get = (id, season = null) => u.find(x => x.id === id && x.season === season);
  const add = (x, label, money, flip = false) => {
    const used = flip ? -x.used : x.used, limit = flip ? -x.limit : x.limit, sense = flip ? '<=' : x.sense;
    const head = sense === '<=' ? limit - used : used - limit;
    const status = head < -0.01 ? 'broken' : binding.has(`${x.id}:${x.season}`) ? 'tight' : 'ok';
    rows.push({id: x.id, season: x.season, label, used, limit, sense, head, money, status});
  };
  const tb = get('transferBudget'); if (tb) add(tb, 'Budget at signing', true);
  for (const x of u.filter(x => x.id === 'squadCost')) add(x, `Squad cost, season ${x.season}`, true);
  const cash = u.filter(x => x.id === 'cashFloor');
  if (cash.length) { const low = cash.reduce((m, x) => x.used < m.used ? x : m, cash[0]); add(low, `Lowest cash, bad case (${low.season === 0 ? 'at signing' : `end of season ${low.season}`})`, true); }
  for (const [id, label] of [['maxSignings', 'New signings'], ['squadSize', 'Registered squad'], ['nonEU', 'Non-EU places']]) { const x = get(id); if (x) add(x, label, false); }
  for (const x of u.filter(x => x.id === 'positionNeed')) add(x, x.label.replace(/^Minimum (\w+) signings$/, (m, p) => `Required ${POS[p]?.toLowerCase() ?? p} signings`), false);
  const lc = get('lifetimeCapital'); if (lc) add(lc, 'Total commitments vs cap', true);
  const ml = get('maxLoss'); if (ml) add(ml, 'Bad-case loss (present value)', true, true);
  return rows;
}
const STATUS = {ok: '<span class="tag ok">OK</span>', tight: '<span class="tag tight">Binding</span>', broken: '<span class="tag broken">Broken</span>'};
const fmt = (r, v) => r.money ? eur(v) : String(v);
function renderResult() {
  const {story: s, analysis: a, scenario} = S.result, b = a.result.best, ctx = a.context, ev = b ?? a.noSigningEvaluation;
  $('results').hidden = false; document.body.dataset.hasResult = '1';
  runState(s.feasible ? 'fresh' : 'infeasible');
  const rows = ev ? constraintRows(ev, ctx) : [];
  const find = id => rows.find(r => r.id === id);
  // KPI strip — every number is an engine output for the recommended combination (or for signing nobody).
  const k = [];
  const kpi = (label, value, sub, row) => k.push(`<div class="kpi"><div class="k"><span>${esc(label)}</span>${row ? STATUS[row.status] : ''}</div><div class="v">${esc(value)}</div><div class="s">${esc(sub)}</div>${row && row.sense === '<=' ? `<div class="bar ${row.status}"><span data-w="${pctOf(row.used, row.limit).toFixed(1)}"></span></div>` : ''}</div>`);
  const tb = find('transferBudget'), sq = rows.find(r => r.id === 'squadCost' && r.season === 1), cash = find('cashFloor'), sg = find('maxSignings');
  if (tb) kpi('Budget at signing', eur(tb.used), `of ${eur(tb.limit)} · ${eur(tb.head)} left`, tb);
  if (sq) kpi('Squad cost, season 1', eur(sq.used), `of ${eur(sq.limit)} limit`, sq);
  kpi('Total contract commitments', s.feasible ? eur(s.spend.totalCommitment) : '—', s.feasible ? `${s.players.length} signing${s.players.length === 1 ? '' : 's'}, all seasons` : 'No safe combination', null);
  if (cash) kpi('Lowest cash, bad case', eur(cash.used), `vs ${eur(cash.limit)} to keep`, cash);
  if (sg) kpi('New signings', `${sg.used} of ${sg.limit}`, needsText(ctx.positionNeeds) ? `Must sign ${needsText(ctx.positionNeeds)}` : 'No required position', sg);
  $('kpis').innerHTML = k.join('');
  $('r-kpi-note').textContent = s.feasible ? '' : 'No safe combination exists under these limits. The figures below show what happens if the club signs nobody.';
  $('r-headline').textContent = s.headline;
  if (s.feasible) {
    $('r-proof').textContent = `${s.proven ? 'Checked against all' : 'Best found among'} ${s.searchSpace.toLocaleString('en-GB')} combinations`;
    $('r-players').innerHTML = s.players.length ? `<div class="table-wrap"><table class="data stack"><thead><tr><th>Player</th><th class="num">Paid at signing</th><th class="num">Wages, season 1</th><th class="num">Total commitment</th><th class="num">Exp. points / season</th></tr></thead><tbody>${s.players.map(p => `<tr><td class="name-cell"><span class="name">${esc(p.name)}</span><span class="sub">${esc(POS[p.position])} · ${esc(p.deal)} · ${p.years} season${p.years > 1 ? 's' : ''}</span></td><td data-l="Paid at signing" class="num">${eur(p.atSigning)}</td><td data-l="Wages, season 1" class="num">${eur(p.wagesPerSeason)}</td><td data-l="Total commitment" class="num">${eur(p.totalCommitment)}</td><td data-l="Exp. points / season" class="num">${p.points}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No signing.</p>';
    const sp = s.spend;
    $('r-alloc').innerHTML = `<div class="alloc">${s.players.map(p => `<div class="alloc-row"><div class="top"><span>${esc(p.name)}</span><b>${eur(p.atSigning)}</b></div><div class="bar"><span data-w="${pctOf(p.atSigning, sp.budget).toFixed(1)}"></span></div></div>`).join('')}
      <div class="alloc-row free"><div class="top"><span class="muted">Not spent</span><b>${eur(Math.max(0, sp.budget - sp.atSigning))}</b></div><div class="bar"><span data-w="${pctOf(Math.max(0, sp.budget - sp.atSigning), sp.budget).toFixed(1)}"></span></div></div></div>`;
    $('r-spend').innerHTML = `<dl class="spend-list"><dt>Paid at signing</dt><dd>${eur(sp.atSigning)} of ${eur(sp.budget)}</dd>${sp.addedSquadCost.map((x, i) => `<dt>Added squad cost, season ${i + 1}</dt><dd>${eur(x)}</dd>`).join('')}<dt>Total contract commitments</dt><dd>${eur(sp.totalCommitment)}</dd></dl><p class="muted small">Squad cost = wages, bonuses and fees spread over each contract.</p>`;
  } else {
    $('r-proof').textContent = s.proven ? `All ${s.searchSpace.toLocaleString('en-GB')} combinations checked` : '';
    $('r-players').innerHTML = `<h3>What would make a safe choice possible</h3><div class="table-wrap"><table class="data stack"><thead><tr><th>One change, re-calculated</th><th>Outcome</th></tr></thead><tbody>${s.fixes.map(f => `<tr><td class="name-cell">${esc(f.label)}</td><td data-l="Outcome">${f.works ? `<span class="tag ok">Possible</span> ${esc(f.names.join(' + ') || 'no signing')}` : '<span class="tag broken">Not enough alone</span>'}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Each line is a separate calculation with one change. Options to discuss, not recommendations.</p>`;
    $('r-alloc').innerHTML = '';
    $('r-spend').innerHTML = `<p class="muted">Nothing: no combination can be signed safely within these limits. Budget available: ${eur(ctx.transferBudget)}.</p>`;
  }
  $('r-limits').innerHTML = (b ? '' : '<p class="status">Even signing nobody breaks the limits marked “Broken”, or every way to fill the required positions breaks one. Figures below are for signing nobody.</p>')
    + `<div class="table-wrap"><table class="data stack"><thead><tr><th>Constraint</th><th class="num">${b ? 'Recommended' : 'No signing'}</th><th class="num">Limit</th><th class="num">Headroom</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td class="name-cell">${esc(r.label)}</td><td data-l="${b ? 'Recommended' : 'No signing'}" class="num">${fmt(r, r.used)}</td><td data-l="Limit" class="num">${r.sense === '<=' ? '≤' : '≥'} ${fmt(r, r.limit)}</td><td data-l="Headroom" class="num">${fmt(r, Math.round(r.head * 100) / 100)}</td><td data-l="Status">${STATUS[r.status]}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Bad case = every season goes badly: resale −${Math.round(ctx.stress.resaleHaircut * 100)}%, player revenue −${Math.round(ctx.stress.revenueHaircut * 100)}%. “Binding” = the limit decides the choice.</p>`;
  document.querySelectorAll('#results [data-w]').forEach(el => { el.style.width = `${el.dataset.w}%`; });
  $('r-why').innerHTML = s.why.map(x => `<li>${esc(x)}</li>`).join('');
  $('r-risks').innerHTML = s.risks.map(x => `<li>${esc(x)}</li>`).join('');
  $('r-alts').innerHTML = s.feasible ? (s.alternatives.length ? s.alternatives.map(o => `<li><span><b>${esc(o.names.join(' + ') || 'No signing')}</b><span class="sub muted">${eur(o.atSigning)} at signing</span></span><span class="gap">−${eur(o.gap)}</span></li>`).join('') : '<li><span>None: no other combination stays within every limit.</span><span></span></li>') : '<li><span>No feasible combination.</span><span></span></li>';
  $('r-excluded').innerHTML = !s.feasible ? '<li>No player can be recommended under these limits; see what would make a safe choice possible.</li>' : (s.notChosen ?? []).map(n => `<li><b>${esc(n.name)}</b>${esc(n.reason)}</li>`).join('') || '<li>Every player on the shortlist is in the recommendation.</li>';
  $('r-advanced').innerHTML = advancedHtml(a, scenario);
}
function advancedHtml(a, scenario) {
  const b = a.result.best, ctx = a.context;
  if (!b) return `<p>${esc(a.summary)}</p>`;
  return `<dl class="kv"><dt>Overall score used to rank combinations</dt><dd>${eur(b.objective.primary)}</dd>
    <dt>${ctx.objective === 'blended' ? `= net present value + ${eur(ctx.valuePerPoint)} × discounted squad-adjusted points` : ctx.objective === 'npv' ? '= net present value of the signings' : '= squad-adjusted expected points'}</dt><dd></dd>
    <dt>Net present value, all seasons: base / bad case / good case</dt><dd>${eur(b.npv)} / ${eur(b.npvDownside)} / ${eur(b.npvUpside)}</dd>
    <dt>Squad-adjusted points per season</dt><dd>${b.pointsBySeason.map(p => p.toFixed(2)).join(' / ') || '—'}</dd>
    <dt>Club cash at each season end, bad case (t = 0…${ctx.horizon})</dt><dd>${b.cashDownside.map(eur).join(' / ')}</dd>
    <dt>Discount rate · same-position factor</dt><dd>${Math.round(ctx.discountRate * 1000) / 10}% · ${Math.round(ctx.samePositionFactor * 100)}%</dd></dl>
    <div class="table-wrap"><table class="data"><thead><tr><th>Limit</th><th class="num">Used</th><th></th><th class="num">Limit</th></tr></thead><tbody>${b.usage.map(u => `<tr><td>${esc(u.label)}${u.season !== null ? ` (${u.id === 'cashFloor' ? 't=' : 's'}${u.season})` : ''}</td><td class="num">${COUNT_IDS.includes(u.id) ? u.used : eur(u.used)}</td><td>${u.sense === '<=' ? '≤' : '≥'}</td><td class="num">${COUNT_IDS.includes(u.id) ? u.limit : eur(u.limit)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Engine ${esc(a.engineVersion)}. Search ${a.result.provenOptimal ? 'complete (proven best)' : 'stopped at its limit'} · ${a.result.nodes.toLocaleString('en-GB')} steps.</p>`;
}

const LABEL = {transferBudget: 'Budget at signing', squadCostLimit: 'Squad-cost limit', committedSquadCost: 'Already committed', openingCash: 'Cash today', protectedReserve: 'Cash to keep', maxSignings: 'Max signings', currentSquadSize: 'Squad now', maxSquadSize: 'Squad max', currentNonEU: 'Non-EU now', maxNonEU: 'Non-EU max', operatingCashFlow: 'Club cash flow', minCash: 'Cash floor', lifetimeCapital: 'Commitment cap', maxDownsideLoss: 'Max bad-case loss', discountRate: 'Discount rate', samePositionFactor: 'Same-position factor', valuePerPoint: 'Value per point', objective: 'Goal', horizon: 'Planning period'};
const fmtV = (k, v) => v === null || v === undefined ? 'none' : Array.isArray(v) ? v.map(x => fmtV(k, x)).join(' / ') : ['discountRate', 'samePositionFactor'].includes(k) ? `${Math.round(v * 1000) / 10}%` : typeof v === 'number' && !['maxSignings', 'currentSquadSize', 'maxSquadSize', 'currentNonEU', 'maxNonEU', 'horizon'].includes(k) ? eur(v) : String(v);
function diffInputs(A, B) {
  const out = [], name = new Map(S.candidates.map(c => [c.id, c.name]));
  for (const k of Object.keys(LABEL)) if (JSON.stringify(A.context[k]) !== JSON.stringify(B.context[k])) out.push(`${LABEL[k]} ${fmtV(k, A.context[k])} → ${fmtV(k, B.context[k])}`);
  if (JSON.stringify(A.context.stress) !== JSON.stringify(B.context.stress)) out.push('Bad-case settings changed');
  if (JSON.stringify(A.context.positionNeeds) !== JSON.stringify(B.context.positionNeeds)) out.push(`Required positions ${Object.entries(A.context.positionNeeds).map(([p, n]) => `${n} ${p}`).join(', ') || 'none'} → ${Object.entries(B.context.positionNeeds).map(([p, n]) => `${n} ${p}`).join(', ') || 'none'}`);
  const ids = new Set([...Object.keys(A.modes), ...Object.keys(B.modes)]);
  for (const id of ids) if ((A.modes[id] ?? 'optimise') !== (B.modes[id] ?? 'optimise')) out.push(`${name.get(id)}: ${({must: 'must sign', exclude: 'left out', optimise: 'considered'})[A.modes[id] ?? 'optimise']} → ${({must: 'must sign', exclude: 'left out', optimise: 'considered'})[B.modes[id] ?? 'optimise']}`);
  return out;
}
function metrics(r) {
  const s = r.story, b = r.analysis.result.best;
  if (!b) return {sel: 'No safe combination', pay: '—', total: '—', sq: '—', cash: '—', score: '—'};
  const low = Math.min(...b.cashDownside);
  return {sel: s.players.map(p => p.name).join(', ') || 'No signing', pay: eur(s.spend.atSigning), total: eur(s.spend.totalCommitment), sq: eur(s.spend.addedSquadCost[0]), cash: eur(low), score: eur(b.objective.primary)};
}
function comparison() {
  if (!S.A || !isCurrent() || S.result === S.A.result) return null;
  const a = metrics(S.A.result), b = metrics(S.result);
  const rows = [['Recommended signings', a.sel, b.sel], ['Pay at signing', a.pay, b.pay], ['Total contract commitments', a.total, b.total], ['Added squad cost, season 1', a.sq, b.sq], ['Lowest cash in a bad case', a.cash, b.cash], ['Overall score (advanced)', a.score, b.score]];
  return {rows: rows.map(([label, x, y]) => ({label, a: x, b: y})), changes: diffInputs(S.A.inputs, {context: S.result.scenario.context, modes: S.result.scenario.modes})};
}
function renderCompare() {
  const box = $('compare');
  if (!S.A) { box.innerHTML = '<p class="muted">No scenario saved yet. The first analysis of this club becomes scenario A. Then change a limit or a player choice, run the analysis again, and the new result (scenario B) is compared with A here.</p>'; return; }
  const c = comparison();
  if (!c) { box.innerHTML = `<div class="panel-head"><h2>Scenario A saved</h2></div><p>${esc(metrics(S.A.result).sel)}</p><p class="muted small">Change a limit or a player choice and run the analysis again to compare. <button type="button" class="link" data-nav="inputs">Open scenario inputs</button></p>`; return; }
  box.innerHTML = `<div class="table-wrap"><table class="data compare-table stack"><thead><tr><th></th><th>Scenario A</th><th>Scenario B (current)</th></tr></thead><tbody>${c.rows.map(r => `<tr><td class="name-cell"><span class="name">${esc(r.label)}</span></td><td data-l="Scenario A">${esc(r.a)}</td><td data-l="Scenario B" class="${r.a !== r.b ? 'changed' : ''}">${esc(r.b)}</td></tr>`).join('')}</tbody></table></div>
    <p class="changes"><b>What changed from A to B:</b> ${esc(c.changes.join('; ') || 'nothing (same inputs)')}.</p>
    <div class="panel-foot"><span class="muted small">Highlighted values differ from scenario A.</span><span class="next-actions"><button type="button" class="btn btn-secondary" id="make-a">Make B the new scenario A</button><button type="button" class="btn btn-ghost" id="restore-a">Go back to scenario A’s inputs</button></span></div>`;
  $('make-a').addEventListener('click', () => { S.A = {inputs: {context: S.result.scenario.context, modes: S.result.scenario.modes}, result: S.result}; renderCompare(); });
  $('restore-a').addEventListener('click', () => {
    const A = S.A; S.modes = {...A.inputs.modes}; S.form = formFrom(A.inputs.context, false); S.needs = {...A.inputs.context.positionNeeds};
    stopWorker(); S.ver++; S.result = A.result; S.fresh = true; S.resultVer = S.ver; $('busy').hidden = true; renderShortlist(); renderForm(); renderResult(); renderCompare();
    $('stale').hidden = true; $('error').hidden = true; document.body.dataset.stale = '0'; setExports(true);
  });
}

// ---------------- exports
const today = () => new Date().toISOString().slice(0, 10);
function buildReport() { return reportHtml({meta: S.meta, scenario: S.result.scenario, analysis: S.result.analysis, story: S.result.story, compare: comparison(), when: today()}); }
window.addEventListener('beforeprint', () => { $('report').innerHTML = isCurrent() ? buildReport() : '<p>No current LANOVA result to print. Analyse again first.</p>'; });
$('export-report').addEventListener('click', () => { if (!isCurrent()) return; $('report').innerHTML = buildReport(); window.print(); });
$('export-csv').addEventListener('click', () => {
  if (!isCurrent()) return;
  const {analysis} = S.result, best = new Set(analysis.result.best?.selection ?? []);
  const lines = [['Player', 'Recommended', 't (0 = signing)', 'Fee', 'Agent fee', 'Signing bonus', 'Wages', 'Bonuses', 'Exit obligations', 'Player revenue', 'Net sale proceeds', 'Net cash (base)', 'Net cash (bad case)', 'Squad cost (season t)'].join(',')];
  for (const e of analysis.economics) for (let t = 0; t <= e.T; t++) {
    const o = e.components.outflows, i = e.components.inflows;
    lines.push(csvRow([e.candidate.name, best.has(e.id) ? 'yes' : 'no', t, o.fee[t], o.agent[t], o.signing[t], o.wages[t], o.bonus[t], o.exit[t], i.revenue[t], i.sale[t], e.cash.base[t], e.cash.downside[t], t >= 1 ? (e.squadCost[t - 1] ?? 0) : null]));
  }
  download(`lanova-schedules-${today()}.csv`, '﻿' + lines.join('\n') + '\n', 'text/csv');
});
function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], {type})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

// ======================================================================= import
function openImport() {
  stopWorker();
  S.imp = null;
  $('import-file').value = ''; $('import-file-status').textContent = ''; $('import-file-status').className = 'status';
  for (const s of [2, 3]) $(`import-step-${s}`).hidden = true;
  steps(1); show('import');
}
function steps(n) { document.querySelectorAll('[data-istep]').forEach(li => li.classList.toggle('on', Number(li.dataset.istep) <= n)); }
$('template-link').addEventListener('click', e => { e.preventDefault(); download('lanova-shortlist-template.csv', TEMPLATE_CSV, 'text/csv'); });
$('import-format').addEventListener('change', () => { if (S.imp) { $('import-step-3').hidden = true; steps(2); } });
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const st = $('import-file-status'); st.className = 'status'; st.textContent = 'Reading the file…';
  for (const s of [2, 3]) $(`import-step-${s}`).hidden = true;
  try {
    if (file.size > MAX_BYTES) throw Error('The file is larger than 1 MB.');
    let parsed;
    if (/\.csv$/i.test(file.name)) parsed = parseCsv(await file.text());
    else if (/\.xlsx$/i.test(file.name)) parsed = await parseXlsx(await file.arrayBuffer(), '../v3/zip-worker.js');
    else throw Error('Choose a .csv or .xlsx file.');
    S.imp = {parsed, mapping: suggestMapping(parsed.headers), check: null};
    $('import-format').disabled = parsed.kind === 'xlsx';
    st.className = 'status ok';
    st.textContent = `Read ${parsed.rows.length} player${parsed.rows.length > 1 ? 's' : ''} and ${parsed.headers.length} columns from “${file.name}”.${parsed.kind === 'xlsx' ? ' Excel stores numbers with a decimal point, so the number-format choice does not apply.' : ''}`;
    renderMapping(); $('import-step-2').hidden = false; steps(2);
    $('import-step-2').scrollIntoView({block: 'start'});
  } catch (err) { S.imp = null; st.textContent = `This file cannot be imported: ${err.message}`; }
});
function renderMapping() {
  const {parsed, mapping} = S.imp;
  $('mapping').innerHTML = FIELDS.map(f => {
    const m = mapping[f.key];
    const sel = m === null ? '' : 'column' in m ? `col:${m.column}` : `const:${m.constant}`;
    return `<label class="field" data-map="${f.key}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span><select data-mapkey="${f.key}">
      <option value="" ${sel === '' ? 'selected' : ''}>${f.required ? 'Choose…' : 'Not in my file'}</option>
      <optgroup label="Column in your file">${parsed.headers.map((h, i) => `<option value="col:${i}" ${sel === `col:${i}` ? 'selected' : ''}>${esc(h)}</option>`).join('')}</optgroup>
      ${f.constants ? `<optgroup label="Same for every player">${f.constants.map(c => `<option value="const:${esc(c)}" ${sel === `const:${c}` ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>` : ''}
      </select><span class="hint">${m && 'column' in m ? 'Suggested from your column name' : ''}</span></label>`;
  }).join('');
  $('mapping').querySelectorAll('[data-mapkey]').forEach(el => el.addEventListener('change', () => {
    const v = el.value; S.imp.mapping[el.dataset.mapkey] = !v ? null : v.startsWith('col:') ? {column: Number(v.slice(4))} : {constant: v.slice(6)};
    el.closest('.field').querySelector('.hint').textContent = ''; $('import-step-3').hidden = true; steps(2); $('mapping-status').textContent = '';
  }));
  const rows = parsed.rows.slice(0, 5);
  $('raw-preview').innerHTML = `<thead><tr>${parsed.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${parsed.headers.map((_, i) => `<td>${esc(r[i]?.v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
$('import-check').addEventListener('click', () => {
  const res = checkRows(S.imp.parsed, S.imp.mapping, $('import-format').value);
  document.querySelectorAll('[data-map]').forEach(el => el.classList.toggle('invalid', FIELDS.find(f => f.key === el.dataset.map).required && !S.imp.mapping[el.dataset.map]));
  if (res.fatal) { $('mapping-status').textContent = res.fatal; $('import-step-3').hidden = true; return; }
  $('mapping-status').textContent = '';
  S.imp.check = res;
  const bad = res.rows.filter(r => r.errors.length);
  $('check-summary').innerHTML = bad.length ? `<span class="status">${bad.length} of ${res.rows.length} rows need attention.</span> Fix them in your file (or change the column matches) and import again. Nothing is guessed.` : `<span class="status ok">All ${res.rows.length} players are ready.</span> Check the converted values: wages are per season in euros, as your club pays them.`
    + (res.unused?.length ? ` <span class="status">${res.unused.length} column${res.unused.length > 1 ? 's' : ''} in your file ${res.unused.length > 1 ? 'are' : 'is'} not used: ${res.unused.map(h => `“${esc(h)}”`).join(', ')}.</span>` : '');
  $('check-table').innerHTML = `<thead><tr><th>Row</th><th>Player</th><th>Position</th><th>Deal</th><th class="num">Fee (€)</th><th class="num">Wage / season (€)</th><th class="num">Seasons</th><th class="num">Points / season</th><th class="num">Resale (base / bad case)</th><th>Status</th></tr></thead><tbody>${res.rows.map(r => {
    const c = r.candidate;
    return `<tr class="${r.errors.length ? 'bad' : ''}"><td>${r.index}</td><td>${esc(r.name)}</td><td>${c ? esc(POS[c.position] ?? c.position) : '—'}</td><td>${c ? DEAL[c.dealType] ?? esc(c.dealType) : '—'}</td><td class="num">${c ? eur(c.fee) : '—'}</td><td class="num">${c ? eur(c.wage * (c.dealType === 'loan' ? (c.wageShare ?? 1) : 1)) : '—'}</td><td class="num">${c ? c.contractYears : '—'}</td><td class="num">${c ? Math.round(c.points * 100) / 100 : '—'}</td><td class="num">${c && c.exitValue ? `${eur(c.exitValue)} / ${c.exitValueDownside !== undefined ? eur(c.exitValueDownside) : 'standard'}` : '—'}</td><td class="${r.errors.length ? 'err' : ''}">${r.errors.length ? esc(r.errors.join(' ')) : 'OK'}</td></tr>`;
  }).join('')}</tbody>`;
  const conv = [...new Set(res.rows.flatMap(r => r.changes).filter(x => /=|divided/.test(x)))].slice(0, 8);
  $('check-notes').innerHTML = [...res.notes, ...conv.map(x => `Conversion: ${x}`)].map(x => `<li>${esc(x)}</li>`).join('');
  $('import-use').disabled = !res.ok;
  $('import-step-3').hidden = false; steps(3);
  $('import-step-3').scrollIntoView({block: 'start'});
});
$('import-use').addEventListener('click', () => {
  if (!S.imp?.check?.ok) return;
  const candidates = toCandidates(S.imp.check);
  const H = Math.max(...candidates.map(c => c.contractYears));
  openCase({club: 'Your club', tier: 'Your imported shortlist', decision: `Which of your ${candidates.length} shortlisted players should the club sign within its budget, wage and cash limits?`, imported: true},
    {schema: 'lanova-recruitment-v2', candidates, modes: {}, context: {horizon: H, positionNeeds: {}, stress: {}}});
  show('inputs');
  $('form-status').textContent = 'Shortlist imported. Enter your club’s limits, then press “Run analysis”.';
  $('form-status').className = 'status ok';
});
navState(); runState('idle');
document.body.dataset.ready = '1';
