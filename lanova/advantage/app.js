/**
 * LANOVA Advantage Lab — interface. Input and display only: every figure comes from lab.js, which runs the LANOVA
 * Finance engine for cash. Nothing is sent or stored.
 */
import {evaluate, brief, briefCsv, briefHtml, fmt, OBJECTIVES, STRATEGIES, CRITERIA, MAX_OPTIONS, HORIZONS, normaliseWeights} from './lab.js';
import {EXAMPLES, blank, newOption} from './examples.js';

const main = document.getElementById('main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const S = {model: null, example: null, result: null, weights: Object.fromEntries(Object.entries(STRATEGIES).map(([k, v]) => [k, {...v.weights}])), strategy: 'immediate', added: 0, timer: 0};
const STATUS = {frontier: 'Efficient (not dominated)', dominated: 'Dominated', infeasible: 'Not feasible', 'not-comparable': 'Not comparable (estimate missing)'};
const READING = {indicative: 'Indicative', 'close-call': 'Close call: examine the alternative', 'insufficient-data': 'Insufficient data: no recommendation', 'no-feasible': 'No feasible combination'};

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
      <label>Financial gain per month (EUR)<input type="number" inputmode="decimal" step="any" data-bind="options.${i}.monthlyGain" value="${o.monthlyGain ?? ''}" ${o.monthlyGain === null ? 'disabled' : ''}><span class="check-inline"><input type="checkbox" data-gain-na="${i}" ${o.monthlyGain === null ? 'checked' : ''}> not estimable</span></label>
      ${field(`options.${i}.gainMonths`, 'Gain lasts (months)', o.gainMonths, {step: 1, min: 1})}
      ${select(`options.${i}.shortTermScore`, 'Your estimate: immediate contribution (0–10)', o.shortTermScore, scoreOpts)}${select(`options.${i}.longTermScore`, 'Your estimate: long-term contribution (0–10)', o.longTermScore, scoreOpts)}
      ${select(`options.${i}.risk`, 'Your view of its risk', o.risk, [['', 'No estimate'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}${select(`options.${i}.confidence`, 'Confidence in your estimates', o.confidence, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
    </div></article>`).join('');
  main.innerHTML = `<div class="labbar"><button type="button" class="btn small ghost" data-home="1">← Start again</button><span class="muted small">${m.fictional ? 'Illustrative example — anonymous; all figures invented' : 'Your own workspace'} · EUR</span></div>
    <h1 class="plan-title">${esc(m.label || 'My organisation')}</h1>
    <section class="card" aria-labelledby="h-map"><header><div><h2 id="h-map">1 · Resource Advantage Map</h2><p class="muted small">Each option on its total cost and its contribution to the objective. Size = how far it lowers your lowest month-end cash; outline = your risk view; small label = months until it has an effect.</p></div>
      ${select('objective', 'Objective (vertical axis)', m.objective, Object.entries(OBJECTIVES).map(([k, v]) => [k, v.label]))}</header>
      <div id="map" aria-live="polite"></div></section>
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
/** Round axis ticks (1, 2 or 5 × a power of ten) covering [lo, hi]. */
function nice(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(k => k * p).find(k => k >= raw);
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v)); return out;
}
function chart(r, m) {
  const pts = r.options.map((o, i) => ({o, i, x: o.totals.totalCost, y: o.contribution}));
  const est = OBJECTIVES[m.objective].estimate, placed = pts.filter(p => p.y !== null), unplaced = pts.filter(p => p.y === null);
  const narrow = (main.clientWidth || innerWidth) < 700, W = narrow ? 560 : 1000, H = narrow ? 620 : 480, L = narrow ? 112 : 96, R = 28, T = 24, B = unplaced.length ? (narrow ? 130 : 96) : 64;
  const xmax = Math.max(1, ...pts.map(p => p.x)) * 1.08;
  const ys = placed.map(p => p.y), ylo = est ? 0 : Math.min(0, ...ys) - (Math.max(0, ...ys) - Math.min(0, ...ys)) * 0.1, yhi0 = est ? 10 : Math.max(0, ...ys), yhi = yhi0 > ylo ? yhi0 + (est ? 0 : (yhi0 - ylo) * 0.08) : ylo + 1;
  const plotB = H - B, x = v => L + (v / xmax) * (W - L - R), y = v => T + (yhi - v) / (yhi - ylo) * (plotB - T);
  const imp = Math.max(1, ...pts.map(p => Math.abs(Math.min(0, p.o.cashImpactLowest)))), rad = p => 9 + 13 * Math.abs(Math.min(0, p.o.cashImpactLowest)) / imp;
  const ticksY = est ? [0, 2, 4, 6, 8, 10] : nice(ylo, yhi, narrow ? 4 : 5).filter(v => v >= ylo && v <= yhi);
  const ticksX = nice(0, xmax, narrow ? 3 : 5).filter(v => v <= xmax);
  const ax = v => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return a >= 1e6 ? `${sg}${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${sg}${+(a / 1e3).toFixed(0)}k` : `${sg}${a}`; };
  const dash = {low: '', medium: '6 4', high: ''}, sw = {low: 1.5, medium: 2, high: 4};
  const point = (p, cx, cy) => { const o = p.o, r0 = rad(p);
    const label = `Option ${p.i + 1}, ${o.name}: ${STATUS[o.status]}. Total cost ${fmt(o.totals.totalCost)} EUR. ${OBJECTIVES[m.objective].label}: ${o.contribution === null ? 'no estimate' : est ? `${o.contribution} out of 10 (your estimate)` : `${fmt(o.contribution)} EUR`}. Lowest cash with it ${fmt(o.minCashBase)} EUR. Risk: ${o.risk ?? 'no estimate'}. Effect after ${o.horizonMonths} months.`;
    return `<g class="pt ${o.status}" tabindex="0" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
      <circle cx="${cx}" cy="${cy}" r="${r0}" stroke-width="${o.risk ? sw[o.risk] : 1}" ${o.risk && dash[o.risk] ? `stroke-dasharray="${dash[o.risk]}"` : ''}/>
      ${o.status === 'infeasible' ? `<path class="x" d="M${cx - r0 * .55} ${cy - r0 * .55}L${cx + r0 * .55} ${cy + r0 * .55}M${cx + r0 * .55} ${cy - r0 * .55}L${cx - r0 * .55} ${cy + r0 * .55}"/>` : `<text class="n" x="${cx}" y="${cy + 4}" text-anchor="middle">${p.i + 1}</text>`}
      <text class="h" x="${cx + r0 + 4}" y="${cy - r0 + 2}">${o.horizonMonths}m</text></g>`; };
  const svg = `<svg class="chart map" viewBox="0 0 ${W} ${H}" aria-label="Resource Advantage Map: ${pts.length} options; the same figures are in the table below">
    ${ticksY.map(v => `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${est ? v : ax(v)}</text>`).join('')}
    ${ticksX.map(v => `<text x="${x(v)}" y="${plotB + 18}" text-anchor="middle">${ax(v)}</text>`).join('')}
    ${!est && ylo < 0 ? `<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
    <text x="${(L + W - R) / 2}" y="${plotB + 38}" text-anchor="middle" class="axt">Total cost, all commitments (EUR) →</text>
    <text transform="translate(16 ${(T + plotB) / 2}) rotate(-90)" text-anchor="middle" class="axt">${esc(est ? 'Your estimate (0–10) →' : 'Net financial effect (EUR) →')}</text>
    ${unplaced.length ? `<text x="${L}" y="${H - (narrow ? 62 : 22)}" class="axt">No estimate for this objective:</text>${unplaced.map((p, k) => point(p, (narrow ? L + 20 : L + 250) + k * 60, H - (narrow ? 24 : 26))).join('')}` : ''}
    ${placed.sort((a, b) => rad(b) - rad(a)).map(p => point(p, x(p.x), y(p.y))).join('')}
  </svg>`;
  const legend = `<p class="legend"><span><i class="lg frontier"></i>Efficient: no feasible option is better on cost, objective, risk and cash at once</span><span><i class="lg dominated"></i>Dominated</span><span><i class="lg infeasible"></i>Not feasible</span><span><i class="lg not-comparable"></i>Not comparable</span><span>Outline: thin = low risk · dashed = medium · thick = high (your view)</span><span>Larger = lowers your lowest cash more</span></p>`;
  const rows = r.options.map((o, i) => `<tr class="${o.status}"><td><span class="badge">${i + 1}</span> ${esc(o.name)}</td><td>${esc(STATUS[o.status])}</td><td class="n">${fmt(o.totals.upfront)}</td><td class="n">${fmt(o.totals.totalCost)}</td><td class="n">${o.totals.netFinancialInHorizon === null ? 'not estimable' : fmt(o.totals.netFinancialInHorizon)}</td><td class="n">${fmt(o.minCashBase)}</td><td class="n">${fmt(o.minCashDownside)}</td><td>${o.input.shortTermScore ?? '—'} / ${o.input.longTermScore ?? '—'}</td><td>${esc(o.risk ?? '—')}</td><td class="n">${o.horizonMonths}</td><td class="small">${esc([...o.reasons, ...o.dominatedBy.map(n => `Dominated by: ${n}.`), ...o.warnings].join(' '))}</td></tr>`).join('');
  return svg + legend + `<div class="table-wrap"><table><thead><tr><th>Option</th><th>Status</th><th class="n">Immediate cost</th><th class="n">Total cost</th><th class="n">Net financial, horizon</th><th class="n">Lowest cash with it</th><th class="n">Lowest cash, downside</th><th>Your estimates now / long term</th><th>Risk (your view)</th><th class="n">Months to effect</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Without any option: lowest month-end cash ${fmt(r.baseMinCash)} (downside ${fmt(r.baseMinCashDownside)}). Dominance compares feasible options on total cost, the objective, risk and lowest cash, only when both have estimates. Cash: LANOVA Finance engine.</p>`;
}

function results(r, m) {
  return `<div class="strat-results">${Object.entries(r.strategies).map(([k, s]) => { const b = s.best;
    return `<article class="sres ${s.status}"><h3>${esc(STRATEGIES[k].label)}</h3><p class="reading">${esc(READING[s.status])}</p>
      <p class="pick">${s.status === 'no-feasible' ? 'None: even without any option, month-end cash falls below the reserve. Review the reserve or the plan first.' : b.options.length ? esc(b.options.join(' + ')) : 'Do nothing (keep the resources)'}</p>
      <dl><div><dt>Immediate cost</dt><dd>${fmt(b.upfront)}</dd></div><div><dt>Total cost</dt><dd>${fmt(b.totalCost)}</dd></div><div><dt>Lowest cash</dt><dd>${fmt(b.minCashBase)}</dd></div><div><dt>Lowest cash, downside</dt><dd class="${b.minCashDownside < m.finance.minimumCash ? 'neg' : ''}">${fmt(b.minCashDownside)}</dd></div></dl>
      ${s.runnerUp ? `<p class="small muted">Alternative to examine: ${esc(s.runnerUp.options.join(' + ') || 'do nothing')}</p>` : ''}
      ${s.missingUsed.length ? `<p class="small neg">Missing estimates used by this strategy: ${esc(s.missingUsed.join('; '))}</p>` : ''}
      ${b.highRisk.length ? `<p class="small">High risk in your view: ${esc(b.highRisk.join(', '))}</p>` : ''}
      ${b.minCashDownside < m.finance.minimumCash ? '<p class="small neg">In the downside case, cash falls below the reserve.</p>' : ''}
      <p class="small muted">${s.candidates} feasible combination(s) compared.</p></article>`; }).join('')}</div>
    <p class="muted small">A strategy shows the combination with the best preference score among those that meet every hard constraint. It is a reading of your weights and estimates, not a forecast of results.</p>`;
}

function briefView(r, m) {
  const b = brief(m, r), li = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const bad = b.options.filter(o => o.status === 'infeasible' || o.status === 'dominated');
  return `<div class="brief-grid"><div><h3>Objective</h3><p>${esc(b.objective)} · ${esc(b.horizon)}</p><h3>Hard constraints</h3>${li(b.hardConstraints)}<h3>Scenarios studied</h3>${li(b.scenariosStudied)}</div>
    <div><h3>Dominated or not feasible</h3>${bad.length ? li(bad.map(o => `${o.name}: ${o.status === 'infeasible' ? o.infeasibleBecause.join(' ') : `dominated by ${o.dominatedBy.join(', ')}`}`)) : '<p class="muted">None.</p>'}
      <h3>Data missing for a definitive decision</h3>${li(b.missingForADecision)}</div>
    <div><h3>Assumptions</h3>${li(b.assumptions)}<h3>Limits</h3>${li(b.limits)}</div></div>`;
}

// ------------------------------------------------------------------ compute and events
function compute() {
  const r = evaluate(S.model, {weights: S.weights}); S.result = r;
  const map = document.getElementById('map'), res = document.getElementById('results'), br = document.getElementById('brief');
  if (r.problems.length) {
    const msg = `<div class="notice bad" role="alert"><b>Complete or correct these inputs — nothing is calculated until they are valid:</b><ul>${r.problems.slice(0, 12).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
    map.innerHTML = msg; res.innerHTML = ''; br.innerHTML = '<p class="muted">The brief appears once the inputs are valid.</p>'; return;
  }
  map.innerHTML = r.options.length ? chart(r, S.model) : '<p class="muted">Add options below to see them on the map.</p>';
  res.innerHTML = results(r, S.model); br.innerHTML = briefView(r, S.model);
}
const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(compute, 120); };
addEventListener('resize', () => { if (S.model && document.getElementById('map')) schedule(); });
function setPath(path, raw, el) {
  const keys = path.split('.'), last = keys.pop(); let o = S.model; for (const k of keys) o = o[k];
  const textKeys = ['label', 'sport', 'structure', 'name', 'category', 'upfrontType', 'objective', 'risk', 'confidence'];
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
  else if (el.dataset.gainNa !== undefined) { const o = S.model.options[Number(el.dataset.gainNa)]; o.monthlyGain = el.checked ? null : 0; workspace(); }
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
start();
