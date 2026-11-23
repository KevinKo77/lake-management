/**
 * LANOVA Advantage Lab — interface. Input and display only: every figure comes from lab.js, which runs the LANOVA
 * Finance engine for cash. Nothing is sent or stored.
 */
import {evaluate, brief, briefCsv, briefHtml, fmt, OBJECTIVES, STRATEGIES, CRITERIA, MAX_OPTIONS, HORIZONS, normaliseWeights, READINGS, financialNotice, netFinancialText, gainStatus, PRUDENT_CASH} from './lab.js';
import {EXAMPLES, blank, newOption} from './examples.js';
import {mapSvg, STATUS} from './map.js';

const main = document.getElementById('main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const S = {model: null, example: null, result: null, weights: Object.fromEntries(Object.entries(STRATEGIES).map(([k, v]) => [k, {...v.weights}])), strategy: 'immediate', added: 0, timer: 0};
const READING = READINGS; // one wording for the interface and the exports

// ------------------------------------------------------------------ start screen
function start() {
  main.innerHTML = `<section class="hero-lab"><p class="eyebrow">Competitive Resource Intelligence · prototype</p><h1>LANOVA Advantage Lab</h1>
    <p class="promise">Discover what your resources could achieve.</p>
    <p class="lede">Compare the ways your organisation could use its money: what each option really costs, what it does to your cash month by month, which options your constraints rule out, and which are beaten by an alternative on every comparable dimension. Then read a decision brief that states its assumptions and limits.</p></section>
    <div class="starts">
      <section class="card start"><h2>Start from scratch</h2><p class="muted">A neutral workspace: your sport, your structure, your budget and your options. Nothing is pre-filled.</p><button type="button" class="btn primary" data-start="blank">Start from scratch</button></section>
      <section class="card start"><h2>Load an illustrative example</h2><p class="muted">Anonymous organisations in three sports; every figure is invented and every result is calculated when you open it.</p>
        <div class="examples">${Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" class="club" data-example="${k}"><b>${esc(e.title)}</b><span>${esc(e.text)}</span></button>`).join('')}</div></section>
    </div>`;
}

// ------------------------------------------------------------------ workspace
const field = (bind, label, value, {type = 'number', step = 'any', hint = '', min, attrs = ''} = {}) =>
  `<label>${esc(label)}<input type="${type}" ${type === 'number' ? `inputmode="decimal" step="${step}"${min !== undefined ? ` min="${min}"` : ''}` : ''} data-bind="${bind}" value="${esc(value ?? '')}" ${attrs}>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
const select = (bind, label, value, options) => `<label>${esc(label)}<select data-bind="${bind}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const scoreOpts = [['', 'No estimate'], ...Array.from({length: 11}, (_, i) => [i, String(i)])];

function workspace() {
  const m = S.model, f = m.finance;
  const opts = m.options.map((o, i) => `<article class="option" aria-label="Option ${i + 1}"><header><b><span class="badge">${i + 1}</span> ${esc(o.name)}</b><button type="button" class="btn small ghost" data-remove="${i}">Remove</button></header>
    <div class="grid tight">
      ${field(`options.${i}.name`, 'Name', o.name, {type: 'text'})}${field(`options.${i}.category`, 'Category', o.category, {type: 'text'})}
      ${field(`options.${i}.upfront`, 'Immediate cost (EUR)', o.upfront, {min: 0})}${select(`options.${i}.upfrontType`, 'Immediate cost is', o.upfrontType, [['expense', 'an expense'], ['capital', 'a capital investment']])}
      ${o.upfrontType === 'capital' ? field(`options.${i}.usefulLifeMonths`, 'Useful life (months)', o.usefulLifeMonths, {step: 1, min: 1}) : ''}
      ${field(`options.${i}.monthlyCost`, 'Running cost per month (EUR)', o.monthlyCost, {min: 0})}${field(`options.${i}.commitmentMonths`, 'Committed for (months)', o.commitmentMonths, {step: 1, min: 0, hint: 'Future commitments: running cost × months'})}
      ${select(`options.${i}.startMonth`, 'Starts in', o.startMonth, Array.from({length: m.horizonMonths}, (_, t) => [t, `month ${t + 1}`]))}${field(`options.${i}.effectMonths`, 'Months until it has an effect', o.effectMonths, {step: 1, min: 0})}
      <label>Financial gain per month is<select data-gain-kind="${i}">${[['known', 'a single figure'], ['range', 'a documented range'], ['unknown', 'not estimable']].map(([v, l]) => `<option value="${v}" ${gainStatus(o) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${gainStatus(o) === 'unknown' ? '<small class="hint">Left out of the cash (prudent). Never counted as zero: rankings it could change are marked "Financial comparison incomplete".</small>' : ''}</label>
      ${gainStatus(o) === 'known' ? field(`options.${i}.monthlyGain`, 'Financial gain per month (EUR)', o.monthlyGain) : ''}
      ${gainStatus(o) === 'range' ? `${field(`options.${i}.gainRange.low`, 'Lowest documented gain per month (EUR)', o.gainRange.low, {hint: 'Used for the cash (prudent)'})}${field(`options.${i}.gainRange.high`, 'Highest documented gain per month (EUR)', o.gainRange.high)}${field(`options.${i}.gainRange.basis`, 'Source of the range', o.gainRange.basis, {type: 'text', hint: 'A quote, an offer, a past season: a range is not a guess'})}` : ''}
      ${field(`options.${i}.gainMonths`, 'Gain lasts (months)', o.gainMonths, {step: 1, min: 1})}
      ${select(`options.${i}.shortTermScore`, 'Your estimate: immediate contribution (0–10)', o.shortTermScore, scoreOpts)}${select(`options.${i}.longTermScore`, 'Your estimate: long-term contribution (0–10)', o.longTermScore, scoreOpts)}
      ${select(`options.${i}.risk`, 'Your view of its risk', o.risk, [['', 'No estimate'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}${select(`options.${i}.confidence`, 'Confidence in your estimates', o.confidence, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
    </div></article>`).join('');
  main.innerHTML = `<div class="labbar"><button type="button" class="btn small ghost" data-home="1">← Start again</button><span class="muted small">${m.fictional ? 'Illustrative example — anonymous; all figures invented' : 'Your own workspace'} · EUR</span></div>
    <h1 class="plan-title">${esc(m.label || 'My organisation')}</h1>
    <details class="card howto"><summary>How to read these results</summary><dl>
      <div><dt>Calculated</dt><dd>Costs, commitments, month-end cash (LANOVA Finance engine) and feasibility against your budget and minimum cash reserve.</dd></div>
      <div><dt>Your estimates (0–10)</dt><dd>Contributions to immediate performance and long-term development. They are your judgement, not predictions of sporting results. A blank estimate stays unknown: it is never counted as zero, and a ranking that depends on it is marked uncertain.</dd></div>
      <div><dt>Risk (your view)</dt><dd>Used only to compare options with each other (dominance): an option is never dominated by one you consider riskier. It does not change any cash figure.</dd></div>
      <div><dt>Confidence</dt><dd>Recorded in the decision brief for the reader. It does not change any calculation.</dd></div>
      <div><dt>Financial gains</dt><dd>A single figure, a documented range (with its source) or "not estimable". ${esc(PRUDENT_CASH)} When a gain that is not estimable could change a ranking, the strategy reads "Financial comparison incomplete" and the option is named.</dd></div>
      <div><dt>Scenarios</dt><dd>Base case as entered; downside case with lower revenue in every month, option gains included. The downside feeds the "financial security" criterion and the warnings.</dd></div>
      <div><dt>Strategy weights</dt><dd>Preferences applied after the hard constraints, to every feasible combination including "do nothing". They express priorities; they do not forecast results.</dd></div>
    </dl></details>
    <section class="card" aria-labelledby="h-map"><header><div><h2 id="h-map">1 · Resource Advantage Map</h2><p class="muted small">Each option on its total cost and its contribution to the objective. Size = how far it lowers your lowest month-end cash; outline = your risk view; small label = months until it has an effect.</p></div>
      ${select('objective', 'Objective (vertical axis)', m.objective, Object.entries(OBJECTIVES).map(([k, v]) => [k, v.label]))}</header>
      <div id="fin-notice" aria-live="polite"></div><div id="summary" class="summary" aria-live="polite"></div><div id="map" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="h-org"><header><h2 id="h-org">2 · Decision Simulator — organisation and hard constraints</h2></header>
      <div class="grid">
        ${field('label', 'Organisation (name or description)', m.label, {type: 'text'})}${field('sport', 'Sport', m.sport, {type: 'text', attrs: 'list="sports"'})}
        ${select('structure', 'Type of structure', m.structure, [['', 'Choose…'], ...['Amateur club (volunteer-run)', 'Semi-professional club', 'Professional club', 'Federation or league', 'Academy or training centre', 'Multi-sport organisation'].map(x => [x, x])].concat(m.structure && !['Amateur club (volunteer-run)', 'Semi-professional club', 'Professional club', 'Federation or league', 'Academy or training centre', 'Multi-sport organisation'].includes(m.structure) ? [[m.structure, m.structure]] : []))}
        ${select('horizonMonths', 'Decision horizon', m.horizonMonths, HORIZONS.map(h => [h, `${h} months`]))}
        ${field('finance.openingCash', 'Cash available today (EUR)', f.openingCash)}${field('finance.annualRevenue', 'Annual revenue (EUR)', f.annualRevenue, {min: 0})}
        ${field('finance.annualOperatingCosts', 'Annual operating costs, staff included (EUR)', f.annualOperatingCosts, {min: 0})}
        ${field('finance.decisionBudget', 'Hard constraint · budget available for these decisions (EUR)', f.decisionBudget, {min: 0})}
        ${field('finance.minimumCash', 'Hard constraint · minimum cash reserve (EUR)', f.minimumCash, {min: 0})}
        ${field('finance.downsideRevenuePct', 'Downside case · revenue reduction (%)', f.downsideRevenuePct, {min: 0, step: 1})}
      </div><datalist id="sports">${['Football', 'Rugby union', 'Basketball', 'Ice hockey', 'Handball', 'Volleyball', 'Cycling', 'Athletics', 'Tennis', 'Motorsport'].map(s => `<option value="${s}">`).join('')}</datalist></section>
    <section class="card" aria-labelledby="h-opts"><header><div><h2 id="h-opts">Options under consideration (${m.options.length}/${MAX_OPTIONS})</h2><p class="muted small">Costs and commitments are facts or quotes; contributions and risk are your estimates and are shown as such.</p></div>
      <button type="button" class="btn" data-add="1" ${m.options.length >= MAX_OPTIONS ? 'disabled' : ''}>+ Add an option</button></header>
      ${opts || '<p class="muted">No option yet. Add the first one: a staff role, a facility, a programme, a signing…</p>'}</section>
    <section class="card" aria-labelledby="h-strat"><header><div><h2 id="h-strat">Strategies — preferences, applied after the hard constraints</h2><p class="muted small">Weights of each criterion (they are normalised to 100%).</p></div></header>
      <div class="strats">${Object.entries(STRATEGIES).map(([k, s]) => `<fieldset class="strat"><legend>${esc(s.label)}</legend>${Object.entries(CRITERIA).map(([c, l]) => `<label>${esc(l)}<input type="number" min="0" step="0.05" data-weight="${k}.${c}" value="${S.weights[k][c]}"></label>`).join('')}</fieldset>`).join('')}</div>
      <div id="results" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="h-brief"><header><div><h2 id="h-brief">3 · Decision Brief</h2><p class="muted small">Objective, scenarios, full costs, constraints, pros and cons, risks, assumptions, dominated and infeasible options, alternatives and missing data.</p></div>
      <div class="next"><button type="button" class="btn primary" data-export="html">Download brief (HTML, printable)</button><button type="button" class="btn" data-export="json">JSON</button><button type="button" class="btn" data-export="csv">CSV</button></div></header>
      <div id="brief"></div></section>`;
  compute();
}

// ------------------------------------------------------------------ chart (display only)
function chart(r, m) {
  // Numbers on the chart, full names in the list beside it (below it on a phone): no truncated label.
  const list = `<ol class="map-list" aria-label="Options on the map">${r.options.map((o, i) => `<li class="${o.status}"><span class="badge">${i + 1}</span><span><b>${esc(o.name)}</b><small>${esc(STATUS[o.status])} · total cost ${fmt(o.totals.totalCost)}</small></span></li>`).join('')}</ol>`;
  const svg = `<div class="map-grid">${mapSvg(r, m, {narrow: (main.clientWidth || innerWidth) < 700, names: false})}${list}</div>`;
  const legend = `<p class="legend"><span><i class="lg frontier"></i>Efficient: no feasible option is better on cost, objective, risk and cash at once</span><span><i class="lg dominated"></i>Dominated</span><span><i class="lg infeasible"></i>Not feasible</span><span><i class="lg not-comparable"></i>Not comparable</span><span>Outline: thin = low risk · dashed = medium · thick = high (your view)</span><span>Larger = lowers your lowest cash more</span></p>`;
  const rows = r.options.map((o, i) => `<tr class="${o.status}"><td><span class="badge">${i + 1}</span> ${esc(o.name)}</td><td>${esc(STATUS[o.status])}</td><td class="n">${fmt(o.totals.upfront)}</td><td class="n">${fmt(o.totals.totalCost)}</td><td class="n">${esc(netFinancialText(o))}</td><td class="n">${fmt(o.minCashBase)}</td><td class="n">${fmt(o.minCashDownside)}</td><td>${o.input.shortTermScore ?? '—'} / ${o.input.longTermScore ?? '—'}</td><td>${esc(o.risk ?? '—')}</td><td class="n">${o.horizonMonths}</td><td class="small">${esc([...o.reasons, ...o.dominatedBy.map(n => `Dominated by: ${n}.`), ...o.warnings].join(' '))}</td></tr>`).join('');
  return svg + legend + `<div class="table-wrap"><table><thead><tr><th>Option</th><th>Status</th><th class="n">Immediate cost</th><th class="n">Total cost</th><th class="n">Net financial, horizon</th><th class="n">Lowest cash with it (prudent)</th><th class="n">Lowest cash, downside</th><th>Your estimates now / long term</th><th>Risk (your view)</th><th class="n">Months to effect</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Without any option: lowest month-end cash ${fmt(r.baseMinCash)} (downside ${fmt(r.baseMinCashDownside)}). Dominance compares feasible options on total cost, the objective, risk and lowest cash, only when both have estimates. Cash: LANOVA Finance engine.</p>`;
}

function results(r, m) {
  return `<div class="strat-results">${Object.entries(r.strategies).map(([k, s]) => { const b = s.best;
    return `<article class="sres ${s.status}"><h3>${esc(STRATEGIES[k].label)}</h3><p class="reading">${esc(READING[s.status])}</p>
      <p class="pick">${s.status === 'no-feasible' ? 'None: even without any option, month-end cash falls below the reserve. Review the reserve or the plan first.' : b.options.length ? esc(b.options.join(' + ')) : 'Do nothing (keep the resources)'}</p>
      <dl><div><dt>Immediate cost</dt><dd>${fmt(b.upfront)}</dd></div><div><dt>Total cost</dt><dd>${fmt(b.totalCost)}</dd></div><div><dt>Lowest cash</dt><dd>${fmt(b.minCashBase)}</dd></div><div><dt>Lowest cash, downside</dt><dd class="${b.minCashDownside < m.finance.minimumCash ? 'neg' : ''}">${fmt(b.minCashDownside)}</dd></div></dl>
      ${s.runnerUp ? `<p class="small muted">Alternative to examine: ${esc(s.runnerUp.options.join(' + ') || 'do nothing')}</p>` : ''}
      ${s.assumptionsNeeded.length ? `<p class="small neg">The ranking could change once these estimates are known: ${esc(s.assumptionsNeeded.join('; '))}.${s.contenders.length ? ` Could rank higher: ${esc(s.contenders.map(c => c.options.join(' + ') || 'do nothing').join(' · '))}.` : ''}</p>` : ''}
      ${s.financial.incomplete ? `<p class="small neg" data-financial-incomplete="${k}"><b>Why:</b> ${esc(s.financial.reasons.join(' '))} Gain not estimable: ${esc(s.financial.optionsWithUnknownGain.map(x => `${x.name} (${x.role})`).join('; '))}.</p>`
        : s.unboundedGains.length ? `<p class="small muted">Gain not estimable, left out of the cash; this ranking does not depend on it: ${esc(s.unboundedGains.join(', '))}.</p>` : ''}
      ${b.highRisk.length ? `<p class="small">High risk in your view: ${esc(b.highRisk.join(', '))}</p>` : ''}
      ${b.minCashDownside < m.finance.minimumCash ? '<p class="small neg">In the downside case, cash falls below the reserve.</p>' : ''}
      <p class="small muted">${s.candidates} feasible combination(s) compared.</p></article>`; }).join('')}</div>
    <p class="muted small">A strategy shows the combination with the best preference score among those that meet every hard constraint. It is a reading of your weights and estimates, not a forecast of results.</p>`;
}

function briefView(r, m) {
  const b = brief(m, r), li = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const bad = b.options.filter(o => o.status === 'infeasible' || o.status === 'dominated');
  return `${noticeHtml(r, 'brief-fin-notice')}<div class="brief-grid"><div><h3>Objective</h3><p>${esc(b.objective)} · ${esc(b.horizon)}</p><h3>Hard constraints</h3>${li(b.hardConstraints)}<h3>Scenarios studied</h3>${li(b.scenariosStudied)}</div>
    <div><h3>Dominated or not feasible</h3>${bad.length ? li(bad.map(o => `${o.name}: ${o.status === 'infeasible' ? o.infeasibleBecause.join(' ') : `dominated by ${o.dominatedBy.join(', ')}`}`)) : '<p class="muted">None.</p>'}
      <h3>Data missing for a definitive decision</h3>${li(b.missingForADecision)}</div>
    <div><h3>Assumptions</h3>${li(b.assumptions)}<h3>Limits</h3>${li(b.limits)}</div></div>`;
}

/** The financial-completeness notice (same text as the exports: financialNotice in lab.js). */
function noticeHtml(r, id) {
  const n = financialNotice(r);
  return n ? `<div class="notice ${n.incomplete ? 'bad fin-incomplete' : ''}" id="${id}" role="${n.incomplete ? 'alert' : 'note'}"><b>${esc(n.title)}.</b> <span class="fin-text">${esc(n.text)}</span></div>` : '';
}

// ------------------------------------------------------------------ compute and events
function compute() {
  const r = evaluate(S.model, {weights: S.weights}); S.result = r;
  const map = document.getElementById('map'), res = document.getElementById('results'), br = document.getElementById('brief');
  if (r.problems.length) {
    const msg = `<div class="notice bad" role="alert"><b>Complete or correct these inputs — nothing is calculated until they are valid:</b><ul>${r.problems.slice(0, 12).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
    map.innerHTML = msg; res.innerHTML = ''; document.getElementById('summary').innerHTML = ''; document.getElementById('fin-notice').innerHTML = ''; br.innerHTML = '<p class="muted">The brief appears once the inputs are valid.</p>'; return;
  }
  map.innerHTML = r.options.length ? chart(r, S.model) : '<p class="muted">Add options below to see them on the map.</p>';
  const c = st => r.options.filter(o => o.status === st).length;
  document.getElementById('summary').innerHTML = r.options.length ? `<div><span>Options</span><b>${r.options.length}</b></div><div><span>Efficient</span><b>${c('frontier')}</b></div><div><span>Dominated</span><b>${c('dominated')}</b></div><div><span>Not feasible</span><b>${c('infeasible')}</b></div><div><span>Not comparable</span><b>${c('not-comparable')}</b></div><div><span>Lowest cash without any option</span><b>${fmt(r.baseMinCash)}</b></div>` : '';
  document.getElementById('fin-notice').innerHTML = noticeHtml(r, 'map-fin-notice');
  res.innerHTML = results(r, S.model); br.innerHTML = briefView(r, S.model);
}
const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(compute, 120); };
addEventListener('resize', () => { if (S.model && document.getElementById('map')) schedule(); });
function setPath(path, raw, el) {
  const keys = path.split('.'), last = keys.pop(); let o = S.model; for (const k of keys) o = o[k];
  const textKeys = ['label', 'sport', 'structure', 'name', 'category', 'upfrontType', 'objective', 'risk', 'confidence', 'basis'];
  let v;
  if (textKeys.includes(last)) v = last === 'risk' ? (raw === '' ? null : raw) : raw;
  else if (['shortTermScore', 'longTermScore'].includes(last)) v = raw === '' ? null : Number(raw);
  else v = raw.trim() === '' ? NaN : Number(raw);
  o[last] = v;
  if (el.tagName === 'SELECT' && ['upfrontType', 'horizonMonths'].includes(last)) { if (last === 'upfrontType' && v === 'capital' && !o.usefulLifeMonths) o.usefulLifeMonths = 60; workspace(); return; }
  if (last === 'name') { const b = el.closest('.option')?.querySelector('header b'); if (b) b.lastChild.textContent = ` ${raw}`; }
  if (last === 'objective') return compute();
  schedule();
}
function download(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); }
const slug = () => (S.model.label || 'organisation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

main.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind && el.tagName !== 'SELECT') setPath(el.dataset.bind, el.value, el);
  else if (el.dataset.weight) { const [k, c] = el.dataset.weight.split('.'); S.weights[k][c] = Number(el.value) || 0; schedule(); }
});
main.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind && el.tagName === 'SELECT') setPath(el.dataset.bind, el.value, el);
  else if (el.dataset.gainKind !== undefined) {
    // Switching never invents a figure: a single figure starts at 0 (no gain) for you to edit; a range starts empty.
    const o = S.model.options[Number(el.dataset.gainKind)], v = el.value;
    if (v === 'known') { o.monthlyGain = 0; delete o.gainRange; } else { o.monthlyGain = null; if (v === 'range') o.gainRange = {low: null, high: null, basis: ''}; else delete o.gainRange; }
    workspace();
  }
});
main.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) { S.model = blank(); S.example = null; workspace(); main.focus(); return; }
  if (b.dataset.example) { S.model = EXAMPLES[b.dataset.example].make(); S.example = b.dataset.example; workspace(); main.focus(); return; }
  if (b.dataset.home) { S.model = null; start(); window.scrollTo(0, 0); return; }
  if (b.dataset.add) { S.model.options.push(newOption(++S.added + S.model.options.length)); workspace(); document.querySelectorAll('.option').item(S.model.options.length - 1)?.querySelector('input')?.focus(); return; }
  if (b.dataset.remove) { S.model.options.splice(Number(b.dataset.remove), 1); workspace(); return; }
  if (b.dataset.export && S.result && !S.result.problems.length) {
    const r = S.result, m = S.model, fx = b.dataset.export;
    if (fx === 'html') download(`lanova-advantage-brief-${slug()}.html`, 'text/html;charset=utf-8', briefHtml(m, r));
    if (fx === 'json') download(`lanova-advantage-brief-${slug()}.json`, 'application/json', JSON.stringify({inputs: m, brief: brief(m, r)}, null, 2));
    if (fx === 'csv') download(`lanova-advantage-options-${slug()}.csv`, 'text/csv;charset=utf-8', '﻿' + briefCsv(m, r));
  }
});
void normaliseWeights;
// Entry points from the demo page: ?start=blank, ?example=<amateur|semipro|pro>, optional &section=brief|map|strategies.
{
  const q = new URLSearchParams(location.search), ex = q.get('example'), sec = {brief: 'h-brief', map: 'h-map', strategies: 'h-strat'}[q.get('section')];
  if (q.get('start') === 'blank') { S.model = blank(); workspace(); }
  else if (ex && EXAMPLES[ex]) { S.model = EXAMPLES[ex].make(); S.example = ex; workspace(); }
  else start();
  if (S.model && sec) requestAnimationFrame(() => document.getElementById(sec)?.scrollIntoView({block: 'start'}));
}
