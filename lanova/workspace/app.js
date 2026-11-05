/**
 * LANOVA Sports — Recruitment Workspace.
 * One page: fictional cases or an imported shortlist → shortlist choices → club limits → confirmed analysis by the
 * unchanged LANOVA engine (worker) → recommendation, limits, alternatives, exclusions → scenario comparison → report.
 * Everything runs in the browser; nothing is uploaded or stored.
 */
import {SCENARIOS} from '../v3/demo/scenarios.js';
import {story as buildStory, eur} from '../v3/demo/explain.js';
import {parseCsv, parseXlsx, suggestMapping, checkRows, toCandidates, FIELDS, MAX_BYTES, TEMPLATE_CSV} from './import.js';
import {reportHtml} from './report.js';
import {canonicalCandidate} from '../recruitment/scenario.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const POS = {GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker'};
const POS_ORDER = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
const DEAL = {permanent: 'Transfer', loan: 'Loan', free: 'Free agent'};
const COUNT_IDS = ['squadSize', 'nonEU', 'maxSignings', 'positionNeed', 'exclusiveGroup'];
const ENGINE_DEFAULTS = {discountRate: 0.1, resaleHaircut: 0.5, revenueHaircut: 0.3, upsideResale: 0.2, upsideRevenue: 0.2, samePositionFactor: 0.5};
const S = {meta: null, original: null, modes: {}, candidates: [], form: null, needs: {}, result: null, fresh: false, A: null, seq: 0, worker: null, pendingRun: null, imp: null};

// ======================================================================= navigation
function show(view) {
  for (const v of ['home', 'import', 'work']) $(`view-${v}`).hidden = v !== view;
  document.body.dataset.view = view; window.scrollTo({top: 0});
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'import') openImport(); else { stopWorker(); show(b.dataset.go); } }));
function stopWorker() { S.worker?.terminate(); S.worker = null; S.seq++; }

// ======================================================================= home
$('case-cards').innerHTML = SCENARIOS.map(s => {
  const c = s.scenario.context, needs = Object.entries(c.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(' + ');
  return `<button type="button" class="case" data-case="${esc(s.id)}"><span class="tag">${esc(s.tier)}</span><span class="name">${esc(s.club)}</span><span>${esc(s.headline)}</span><span class="muted small">${eur(c.transferBudget)} to spend at signing · must sign ${esc(needs)} · ${s.scenario.candidates.length} players on the shortlist</span><span class="go">Open this club →</span></button>`;
}).join('');
document.querySelectorAll('[data-case]').forEach(b => b.addEventListener('click', () => {
  const s = SCENARIOS.find(x => x.id === b.dataset.case);
  openCase({club: s.club, tier: s.tier, decision: s.decision, imported: false}, structuredClone(s.scenario));
}));

// ======================================================================= workspace
function openCase(meta, scenario) {
  stopWorker();
  scenario = {...scenario, candidates: scenario.candidates.map(canonicalCandidate)}; // engine's own normalisation: what you see is what is calculated
  Object.assign(S, {meta, original: structuredClone(scenario), candidates: scenario.candidates, modes: {...(scenario.modes ?? {})}, result: null, fresh: false, A: null, pendingRun: null});
  S.form = formFrom(scenario.context, meta.imported);
  S.needs = {...(scenario.context.positionNeeds ?? {})};
  S.extra = {upsideResale: scenario.context.stress?.upsideResale ?? ENGINE_DEFAULTS.upsideResale, upsideRevenue: scenario.context.stress?.upsideRevenue ?? ENGINE_DEFAULTS.upsideRevenue};
  $('w-tier').innerHTML = `${esc(meta.tier)} ${meta.imported ? '' : '<span class="badge">Fictional</span>'}`;
  $('w-club').textContent = meta.club;
  $('w-decision').textContent = meta.decision;
  renderFacts(); renderShortlist(); renderForm();
  for (const id of ['results', 'busy', 'stale', 'error', 'review']) $(id).hidden = true;
  $('results-empty').hidden = false; $('form-status').textContent = '';
  document.body.dataset.stale = '0';
  renderCompare();
  show('work');
}
function renderFacts() {
  const c = S.original.context, f = S.meta.imported;
  $('w-facts').innerHTML = f ? `<li>Shortlist: <b>${S.candidates.length} players</b> (imported)</li><li>Enter your club’s limits below to analyse</li>`
    : [['To spend at signing', eur(c.transferBudget)], ['Cash today', eur(c.openingCash)], ['Squad-cost limit', `${eur(c.squadCostLimit[0])} a season`], ['Must sign', Object.entries(c.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(', ')], ['Shortlist', `${S.candidates.length} players`]].map(([k, v]) => `<li>${esc(k)}: <b>${esc(v)}</b></li>`).join('');
}

// ---------------- shortlist
function renderShortlist() {
  const head = `<div class="player-row head"><div>Player</div><div>Position</div><div class="num">Fee</div><div class="num">Wage / season</div><div class="num">Seasons</div><div class="num">Expected points*</div><div>Choice</div></div>`;
  $('shortlist').innerHTML = head + S.candidates.map(p => {
    const m = S.modes[p.id] ?? 'optimise', wage = p.wage * (p.dealType === 'loan' ? p.wageShare : 1);
    return `<div class="player-row ${m === 'must' ? 'must' : m === 'exclude' ? 'exclude' : ''}" data-row="${esc(p.id)}">
      <div class="nm-cell"><div class="nm">${esc(p.name)}</div><div class="sub">${DEAL[p.dealType]}${p.exitValue ? ` · resale ${eur(p.exitValue)} after season ${p.exitSeason}` : ''}${p.nonEU ? ' · non-EU' : ''}</div></div>
      <div><span class="lbl">Position</span>${esc(POS[p.position])}</div>
      <div class="num"><span class="lbl">Fee</span>${eur(p.fee)}</div>
      <div class="num"><span class="lbl">Wage / season</span>${eur(wage)}${p.dealType === 'loan' && p.wageShare !== 1 ? `<div class="sub">${Math.round(p.wageShare * 100)}% of ${eur(p.wage)}</div>` : ''}</div>
      <div class="num"><span class="lbl">Seasons</span>${p.contractYears}</div>
      <div class="num"><span class="lbl">Expected points*</span>${p.points}</div>
      <div class="mode-cell"><div class="seg" role="group" aria-label="Choice for ${esc(p.name)}">${[['optimise', 'Consider'], ['must', 'Must sign'], ['exclude', 'Leave out']].map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div></div></div>`;
  }).join('') + `<p class="muted small">* ${S.meta.imported ? 'Your own estimate of the league points the player adds per season.' : 'Illustrative estimate written for this fictional case, not real data.'}</p>`;
  $('shortlist').querySelectorAll('[data-row]').forEach(row => row.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const id = row.dataset.row; if (b.dataset.mode === 'optimise') delete S.modes[id]; else S.modes[id] = b.dataset.mode;
    renderShortlist(); changed();
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
  $('needs').innerHTML = POS_ORDER.map(p => `<div class="need"><span>${esc(POS[p])}</span><button type="button" data-need="${p}" data-d="-1" aria-label="One fewer ${esc(POS[p])}">−</button><span class="n" id="need-${p}">${S.needs[p] ?? 0}</span><button type="button" data-need="${p}" data-d="1" aria-label="One more ${esc(POS[p])}">+</button></div>`).join('');
  $('goal').innerHTML = `<label class="field" data-field="objective"><span>Choose the goal</span><select data-key="objective">
      <option value="" ${!S.form.objective ? 'selected' : ''} disabled>Choose…</option>
      <option value="blended" ${S.form.objective === 'blended' ? 'selected' : ''}>Balance sporting value and money</option>
      <option value="npv" ${S.form.objective === 'npv' ? 'selected' : ''}>Money only (best financial value)</option>
      <option value="points" ${S.form.objective === 'points' ? 'selected' : ''}>Most expected points within the limits</option></select><span class="hint"></span></label>
    <label class="field" data-field="valuePerPoint" ${S.form.objective === 'blended' ? '' : 'hidden'}><span>What one league point is worth to the club (€)</span><input type="number" inputmode="decimal" data-key="valuePerPoint" value="${esc(S.form.valuePerPoint)}"><span class="hint">Used to weigh sporting value against money</span></label>`;
  bindForm();
}
function bindForm() {
  document.querySelectorAll('#sec-limits [data-key]').forEach(el => el.addEventListener('input', () => {
    S.form[el.dataset.key] = el.value;
    const a = document.querySelector(`[data-amt="${el.dataset.key}"]`); if (a) a.textContent = amt(el.value);
    if (el.dataset.key === 'objective') { renderForm(); }
    if (el.dataset.key === 'horizon') { resizeSeries(); renderForm(); document.querySelector('[data-key="horizon"]')?.focus(); }
    changed();
  }));
  document.querySelectorAll('#sec-limits [data-series]').forEach(el => el.addEventListener('input', () => { S.form[el.dataset.series].values[Number(el.dataset.i)] = el.value; const a = document.querySelector(`[data-amt="${el.dataset.series}"]`); if (a) a.textContent = S.form[el.dataset.series].values.map(amt).join(' / '); changed(); }));
  document.querySelectorAll('#sec-limits [data-same]').forEach(el => el.addEventListener('change', () => {
    const s = S.form[el.dataset.same]; s.same = el.checked;
    if (s.same) s.values = [s.values[0] ?? '']; else { const H = Number(S.form.horizon) || 1; s.values = Array.from({length: H}, (_, i) => s.values[i] ?? s.values[0] ?? ''); }
    renderForm(); changed();
  }));
  document.querySelectorAll('[data-need]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.need, n = Math.max(0, Math.min(10, (S.needs[p] ?? 0) + Number(b.dataset.d)));
    if (n) S.needs[p] = n; else delete S.needs[p];
    $(`need-${p}`).textContent = String(n); changed();
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
  document.querySelectorAll('#sec-limits .field').forEach(el => {
    const k = el.dataset.field, e = errors[k];
    el.classList.toggle('invalid', Boolean(e));
    const h = el.querySelector('.hint'); if (!h) return;
    if (e) { h.dataset.orig ??= h.textContent; h.textContent = e; } else if (h.dataset.orig !== undefined) { h.textContent = h.dataset.orig; delete h.dataset.orig; }
  });
}

// ---------------- changes and staleness
function changed() {
  $('review').hidden = true; S.pendingRun = null;
  if (S.result) { S.fresh = false; document.body.dataset.stale = '1'; $('stale').hidden = false; setExports(false); }
  $('form-status').textContent = '';
}
function setExports(on) { $('export-report').disabled = !on; $('export-csv').disabled = !on; }

// ---------------- analyse: review → confirm → worker
$('analyse').addEventListener('click', () => {
  const {ctx, errors} = readForm();
  showErrors(errors);
  if (Object.keys(errors).length) {
    const first = document.querySelector('#sec-limits .field.invalid');
    if (first?.closest('details')) first.closest('details').open = true;
    $('form-status').textContent = errors.needs ?? `Complete the ${Object.keys(errors).length} highlighted field${Object.keys(errors).length > 1 ? 's' : ''} first.`;
    first?.scrollIntoView({block: 'center'});
    return;
  }
  const scenario = {schema: 'lanova-recruitment-v2', fictional: !S.meta.imported, label: S.meta.club, context: ctx, candidates: S.candidates, modes: {...S.modes}};
  S.pendingRun = scenario;
  const must = S.candidates.filter(c => S.modes[c.id] === 'must').map(c => c.name), out = S.candidates.filter(c => S.modes[c.id] === 'exclude').map(c => c.name);
  const changes = S.A ? diffInputs(S.A.inputs, {context: ctx, modes: scenario.modes}) : [];
  $('review-list').innerHTML = [
    `${S.candidates.length} players on the shortlist${must.length ? `; must sign: ${must.join(', ')}` : ''}${out.length ? `; left out: ${out.join(', ')}` : ''}.`,
    `Budget at signing ${eur(ctx.transferBudget)}; squad-cost limit ${ctx.squadCostLimit.map(eur).join(' / ')}; already committed ${ctx.committedSquadCost.map(eur).join(' / ')}.`,
    `Cash today ${eur(ctx.openingCash)}; must always remain ${eur(ctx.minCash + ctx.protectedReserve)}; club cash flow ${ctx.operatingCashFlow.map(eur).join(' / ')}.`,
    `At most ${ctx.maxSignings} signings; squad ${ctx.currentSquadSize}/${ctx.maxSquadSize}; non-EU ${ctx.currentNonEU}/${ctx.maxNonEU}; must sign ${Object.entries(ctx.positionNeeds).map(([p, n]) => `${n} ${POS[p].toLowerCase()}`).join(', ') || 'no specific position'}.`,
    `Goal: ${ctx.objective === 'blended' ? `balance sporting value and money (${eur(ctx.valuePerPoint)} per league point)` : ctx.objective === 'npv' ? 'money only' : 'most expected points'}.`,
    ...(changes.length ? [`Changed since scenario A: ${changes.join('; ')}.`] : []),
  ].map(x => `<li>${esc(x)}</li>`).join('');
  $('review-ok').checked = false; $('review-run').disabled = true; $('review').hidden = false;
  $('review').scrollIntoView({block: 'center'});
});
$('review-ok').addEventListener('change', () => { $('review-run').disabled = !$('review-ok').checked; });
$('review-cancel').addEventListener('click', () => { $('review').hidden = true; S.pendingRun = null; });
$('review-run').addEventListener('click', () => { if (!S.pendingRun || !$('review-ok').checked) return; const sc = S.pendingRun; S.pendingRun = null; $('review').hidden = true; compute(sc); });

function compute(scenario) {
  stopWorker();
  const id = ++S.seq;
  $('report').innerHTML = '';
  S.fresh = false; setExports(false);
  $('busy').hidden = false; $('error').hidden = true; $('results-empty').hidden = true;
  if (S.result) { document.body.dataset.stale = '1'; $('stale').hidden = false; }
  $('busy').scrollIntoView({block: 'center'});
  const w = new Worker('../v3/demo/worker.js', {type: 'module'}); S.worker = w;
  const timer = setTimeout(() => { if (id === S.seq) failed('The analysis took longer than 15 seconds and was stopped. Try a shorter shortlist.'); }, 15000);
  w.onmessage = ({data}) => {
    if (id !== S.seq) return;
    clearTimeout(timer); w.terminate(); S.worker = null;
    if (data.error) return failed(`LANOVA could not analyse these inputs: ${data.error}`);
    const st = buildStory(S.meta, data.scenario, data.analysis, {robustness: data.robustness, fixes: data.fixes});
    S.result = {scenario: data.scenario, analysis: data.analysis, story: st};
    const inputs = {context: data.scenario.context, modes: data.scenario.modes};
    if (!S.A) S.A = {inputs, result: S.result};
    S.fresh = true;
    $('busy').hidden = true; $('stale').hidden = true; document.body.dataset.stale = '0';
    renderResult(); renderCompare(); setExports(true);
    $('sec-results').scrollIntoView({block: 'start'});
  };
  w.onerror = e => { e.preventDefault?.(); if (id !== S.seq) return; clearTimeout(timer); failed('The analysis failed unexpectedly. No result is shown.'); };
  w.postMessage({id, scenario, now: new Date().toISOString()});
}
function failed(message) {
  S.worker?.terminate(); S.worker = null;
  S.result = null; S.fresh = false; setExports(false); $('report').innerHTML = '';
  for (const x of ['busy', 'results', 'stale']) $(x).hidden = true;
  document.body.dataset.stale = '0';
  $('error').hidden = false; $('error').textContent = `${message} No recommendation is shown.`;
  renderCompare();
}

// ---------------- results
function renderResult() {
  const {story: s, analysis: a, scenario} = S.result, b = a.result.best, ctx = a.context;
  $('results').hidden = false;
  $('r-headline').textContent = s.headline;
  if (s.feasible) {
    $('r-players').innerHTML = s.players.map(p => `<div class="pcard"><div class="nm">${esc(p.name)}</div><div class="sub">${esc(POS[p.position])} · ${esc(p.deal)} · ${p.years} season${p.years > 1 ? 's' : ''}</div>
      <dl class="kv"><dt>Pay at signing</dt><dd>${eur(p.atSigning)}</dd><dt>Wages, first season</dt><dd>${eur(p.wagesPerSeason)}</dd><dt>Total commitment</dt><dd>${eur(p.totalCommitment)}</dd><dt>Expected points / season</dt><dd>${p.points}</dd></dl></div>`).join('') || '<p>No signing.</p>';
    $('r-proof').textContent = `${s.proven ? 'Checked against all' : 'Best found among'} ${s.searchSpace.toLocaleString('en-GB')} possible combinations of the shortlist, with every limit applied together.`;
    const sp = s.spend, pctBudget = sp.budget ? Math.min(100, 100 * sp.atSigning / sp.budget) : 0;
    $('r-spend').innerHTML = `<p class="bignum">${eur(sp.atSigning)}</p><p class="muted small">paid at signing, out of ${eur(sp.budget)} available</p><div class="meter"><span id="m-budget"></span></div>
      <dl class="kv spaced">${sp.addedSquadCost.map((x, i) => `<dt>Added squad cost, season ${i + 1}</dt><dd>${eur(x)}</dd>`).join('')}<dt>Total contract commitments</dt><dd>${eur(sp.totalCommitment)}</dd></dl>
      <p class="muted small">Squad cost = wages, bonuses and fees spread over each contract.</p>`;
    $('m-budget').style.width = `${pctBudget.toFixed(0)}%`;
  } else {
    $('r-players').innerHTML = `<div class="pcard"><div class="nm">What would make a safe choice possible</div><ul class="bullets small">${s.fixes.map(f => `<li>${esc(f.label)}: ${f.works ? `yes → ${esc(f.names.join(' + ') || 'no signing')}` : 'not enough on its own'}</li>`).join('')}</ul><p class="muted small">Each line is a separate re-calculation with one change. Possibilities to discuss, not recommendations.</p></div>`;
    $('r-proof').textContent = s.proven ? `All ${s.searchSpace.toLocaleString('en-GB')} combinations were checked.` : '';
    $('r-spend').innerHTML = '<p>Nothing: no combination can be signed safely within these limits.</p>';
  }
  $('r-limits').innerHTML = limitsHtml(b ?? a.noSigningEvaluation, ctx, !b);
  document.querySelectorAll('[data-meter]').forEach(el => { el.style.width = `${el.dataset.meter}%`; });
  $('r-why').innerHTML = s.why.map(x => `<li>${esc(x)}</li>`).join('');
  $('r-risks').innerHTML = s.risks.map(x => `<li>${esc(x)}</li>`).join('');
  $('r-alts').innerHTML = s.feasible ? (s.alternatives.length ? s.alternatives.map(o => `<li><b>${esc(o.names.join(' + ') || 'No signing')}</b> — ${eur(o.gap)} less overall; ${eur(o.atSigning)} at signing.</li>`).join('') : '<li>None: no other combination stays within every limit.</li>') : '<li>No feasible combination.</li>';
  $('r-excluded').innerHTML = (s.notChosen ?? []).map(n => `<li><b>${esc(n.name)}</b>${esc(n.reason)}</li>`).join('') || '<li>Every player on the shortlist is in the recommendation.</li>';
  $('r-advanced').innerHTML = advancedHtml(a, scenario);
}
function limitsHtml(ev, ctx, infeasible) {
  if (!ev) return '';
  const u = ev.usage, row = (label, used, limit, sense, money, warn) => {
    const ratio = sense === '<=' ? (limit > 0 ? used / limit : used > 0 ? 2 : 0) : (used !== 0 ? limit / used : 0);
    const pct = Math.max(0, Math.min(100, 100 * (sense === '<=' ? ratio : (used >= limit ? Math.max(0, 1 - (used - limit) / Math.max(1, Math.abs(used))) : 1))));
    const over = sense === '<=' ? used > limit + 0.01 : used < limit - 0.01, tight = !over && warn;
    return `<div class="limit"><div class="top"><span>${esc(label)}${over ? '<span class="tag">broken</span>' : tight ? '<span class="tag">tight</span>' : ''}</span><b>${money ? eur(used) : used} ${sense === '<=' ? 'of' : 'vs minimum'} ${money ? eur(limit) : limit}</b></div><div class="meter ${over ? 'over' : tight ? 'tight' : ''}"><span data-meter="${pct.toFixed(0)}"></span></div></div>`;
  };
  const binding = new Set((S.result?.analysis.binding ?? []).map(x => `${x.id}:${x.season}`));
  const get = (id, season = null) => u.find(x => x.id === id && x.season === season);
  const parts = [];
  const tb = get('transferBudget'); parts.push(row('Budget at signing', tb.used, tb.limit, '<=', true, binding.has('transferBudget:null')));
  for (const x of u.filter(x => x.id === 'squadCost')) parts.push(row(`Squad cost, season ${x.season}`, x.used, x.limit, '<=', true, binding.has(`squadCost:${x.season}`)));
  const cash = u.filter(x => x.id === 'cashFloor'), low = cash.reduce((m, x) => x.used < m.used ? x : m, cash[0]);
  parts.push(`<div class="limit"><div class="top"><span>Lowest cash in a bad case${low.used < low.limit - 0.01 ? '<span class="tag">broken</span>' : ''}</span><b>${eur(low.used)} vs ${eur(low.limit)} to keep</b></div><p class="muted small tight">${low.season === 0 ? 'At signing' : `End of season ${low.season}`}; bad case = resale −${Math.round(ctx.stress.resaleHaircut * 100)}%, player revenue −${Math.round(ctx.stress.revenueHaircut * 100)}%.</p></div>`);
  const cnt = (id, label) => { const x = get(id); if (x) parts.push(row(label, x.used, x.limit, '<=', false, binding.has(`${id}:null`))); };
  cnt('maxSignings', 'Signings'); cnt('squadSize', 'Registered squad'); cnt('nonEU', 'Non-EU places');
  for (const x of u.filter(x => x.id === 'positionNeed')) parts.push(row(x.label.replace(/^Minimum (\w+) signings$/, (m, p) => `Required ${POS[p]?.toLowerCase() ?? p}`), x.used, x.limit, '>=', false, false));
  for (const id of ['lifetimeCapital', 'maxLoss']) { const x = get(id); if (x) parts.push(row(id === 'lifetimeCapital' ? 'Total commitments vs cap' : 'Bad-case loss (present value)', id === 'maxLoss' ? -x.used : x.used, id === 'maxLoss' ? -x.limit : x.limit, '<=', true, binding.has(`${id}:null`))); }
  return (infeasible ? '<p class="status">Even signing nobody breaks the limits marked “broken”, or every way to fill the required positions breaks one.</p>' : '') + parts.join('');
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
    <div class="scroll"><table><thead><tr><th>Limit</th><th class="num">Used</th><th></th><th class="num">Limit</th></tr></thead><tbody>${b.usage.map(u => `<tr><td>${esc(u.label)}${u.season !== null ? ` (${u.id === 'cashFloor' ? 't=' : 's'}${u.season})` : ''}</td><td class="num">${COUNT_IDS.includes(u.id) ? u.used : eur(u.used)}</td><td>${u.sense === '<=' ? '≤' : '≥'}</td><td class="num">${COUNT_IDS.includes(u.id) ? u.limit : eur(u.limit)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Engine ${esc(a.engineVersion)}. Search ${a.result.provenOptimal ? 'complete (proven best)' : 'stopped at its limit'} · ${a.result.nodes.toLocaleString('en-GB')} steps.</p>`;
}

// ---------------- scenario comparison
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
  if (!S.A || !S.result || !S.fresh || S.result === S.A.result) return null;
  const a = metrics(S.A.result), b = metrics(S.result);
  const rows = [['Recommended signings', a.sel, b.sel], ['Pay at signing', a.pay, b.pay], ['Total contract commitments', a.total, b.total], ['Added squad cost, season 1', a.sq, b.sq], ['Lowest cash in a bad case', a.cash, b.cash], ['Overall score (advanced)', a.score, b.score]];
  return {rows: rows.map(([label, x, y]) => ({label, a: x, b: y})), changes: diffInputs(S.A.inputs, {context: S.result.scenario.context, modes: S.result.scenario.modes})};
}
function renderCompare() {
  const box = $('compare');
  if (!S.A) { box.innerHTML = '<p class="muted">The first analysis becomes scenario A. Change a limit or a player choice, analyse again, and the new result (scenario B) is compared with A here.</p>'; return; }
  const c = comparison();
  if (!c) { box.innerHTML = `<p><b>Scenario A</b> is saved: ${esc(metrics(S.A.result).sel)}.</p><p class="muted">Change a limit or a player choice and analyse again to compare.</p>`; return; }
  box.innerHTML = `<div class="compare-grid"><div class="h"></div><div class="h">Scenario A</div><div class="h">Scenario B (current)</div>${c.rows.map(r => `<div class="k">${esc(r.label)}</div><div>${esc(r.a)}</div><div class="${r.a !== r.b ? 'changed' : ''}">${esc(r.b)}</div>`).join('')}</div>
    <p class="small"><b>What changed from A to B:</b> ${esc(c.changes.join('; ') || 'nothing (same inputs)')}.</p>
    <div class="row"><button type="button" class="ghost" id="make-a">Make B the new scenario A</button><button type="button" class="ghost" id="restore-a">Go back to scenario A’s inputs</button></div>`;
  $('make-a').addEventListener('click', () => { S.A = {inputs: {context: S.result.scenario.context, modes: S.result.scenario.modes}, result: S.result}; renderCompare(); });
  $('restore-a').addEventListener('click', () => {
    const A = S.A; S.modes = {...A.inputs.modes}; S.form = formFrom(A.inputs.context, false); S.needs = {...A.inputs.context.positionNeeds};
    S.result = A.result; S.fresh = true; renderShortlist(); renderForm(); renderResult(); renderCompare();
    $('stale').hidden = true; document.body.dataset.stale = '0'; setExports(true);
  });
}

// ---------------- exports
const today = () => new Date().toISOString().slice(0, 10);
function buildReport() { return reportHtml({meta: S.meta, scenario: S.result.scenario, analysis: S.result.analysis, story: S.result.story, compare: comparison(), when: today()}); }
window.addEventListener('beforeprint', () => { $('report').innerHTML = S.result && S.fresh ? buildReport() : '<p>No current LANOVA result to print. Analyse again first.</p>'; });
$('export-report').addEventListener('click', () => { if (!S.result || !S.fresh) return; $('report').innerHTML = buildReport(); window.print(); });
$('export-csv').addEventListener('click', () => {
  if (!S.result || !S.fresh) return;
  const {analysis} = S.result, best = new Set(analysis.result.best?.selection ?? []);
  const lines = [['Player', 'Recommended', 't (0 = signing)', 'Fee', 'Agent fee', 'Signing bonus', 'Wages', 'Bonuses', 'Exit obligations', 'Player revenue', 'Net sale proceeds', 'Net cash (base)', 'Net cash (bad case)', 'Squad cost (season t)'].join(',')];
  for (const e of analysis.economics) for (let t = 0; t <= e.T; t++) {
    const o = e.components.outflows, i = e.components.inflows;
    lines.push([`"${e.candidate.name.replace(/"/g, '""')}"`, best.has(e.id) ? 'yes' : 'no', t, o.fee[t], o.agent[t], o.signing[t], o.wages[t], o.bonus[t], o.exit[t], i.revenue[t], i.sale[t], e.cash.base[t], e.cash.downside[t], t >= 1 ? (e.squadCost[t - 1] ?? 0) : ''].map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v).join(','));
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
  $('check-summary').innerHTML = bad.length ? `<span class="status">${bad.length} of ${res.rows.length} rows need attention.</span> Fix them in your file (or change the column matches) and import again. Nothing is guessed.` : `<span class="status ok">All ${res.rows.length} players are ready.</span> Check the converted values: wages are per season in euros, as your club pays them.`;
  $('check-table').innerHTML = `<thead><tr><th>Row</th><th>Player</th><th>Position</th><th>Deal</th><th class="num">Fee (€)</th><th class="num">Wage / season (€)</th><th class="num">Seasons</th><th class="num">Points / season</th><th>Status</th></tr></thead><tbody>${res.rows.map(r => {
    const c = r.candidate;
    return `<tr class="${r.errors.length ? 'bad' : ''}"><td>${r.index}</td><td>${esc(r.name)}</td><td>${c ? esc(POS[c.position] ?? c.position) : '—'}</td><td>${c ? DEAL[c.dealType] ?? esc(c.dealType) : '—'}</td><td class="num">${c ? eur(c.fee) : '—'}</td><td class="num">${c ? eur(c.wage * (c.dealType === 'loan' ? (c.wageShare ?? 1) : 1)) : '—'}</td><td class="num">${c ? c.contractYears : '—'}</td><td class="num">${c ? Math.round(c.points * 100) / 100 : '—'}</td><td class="${r.errors.length ? 'err' : ''}">${r.errors.length ? esc(r.errors.join(' ')) : 'OK'}</td></tr>`;
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
  $('form-status').textContent = 'Enter your club’s limits, then press “Analyse this shortlist”.';
  $('form-status').className = 'status ok';
  $('sec-limits').scrollIntoView({block: 'start'});
});
document.body.dataset.ready = '1';
