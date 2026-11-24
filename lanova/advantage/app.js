/**
 * LANOVA Advantage Lab — interface. Input and display only: every figure comes from lab.js (and sensitivity.js),
 * which run the LANOVA Finance engine for cash. Nothing is sent or stored: project files are created and read on the
 * user's device.
 *
 * Workflow: 1 financial situation · 2 options · 3 scenarios and constraints · 4 compare · 5 sensitivity · 6 report.
 */
import {evaluate, brief, briefCsv, briefHtml, fmt, OBJECTIVES, STRATEGIES, CRITERIA, MAX_OPTIONS, MAX_INSTALMENTS, HORIZONS, READINGS, financialNotice, netFinancialText, gainStatus, PRUDENT_CASH, LEVERS, SCENARIOS, scenarioResults, structureText} from './lab.js';
import {EXAMPLES, WORKED, blank, newOption} from './examples.js';
import {mapSvg, STATUS} from './map.js';
import {analyse, NOT_DETERMINABLE} from './sensitivity.js';
import {exportProject, importProject, ORIGINS, MAX_BYTES} from './project.js';

const main = document.getElementById('main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const S = {model: null, example: null, origin: 'user', modified: false, result: null, sens: null, notes: [], weights: Object.fromEntries(Object.entries(STRATEGIES).map(([k, v]) => [k, {...v.weights}])), strategy: 'immediate', added: 0, timer: 0};
const READING = READINGS; // one wording for the interface and the exports
const STEPS = [['h-org', 'Financial situation'], ['h-opts', 'Options'], ['h-scen', 'Scenarios & constraints'], ['h-map', 'Compare'], ['h-sens', 'Sensitivity'], ['h-brief', 'Report']];

// ------------------------------------------------------------------ start screen
function start(errors = []) {
  main.innerHTML = `<section class="hero-lab"><p class="eyebrow">Financial Decision Intelligence · prototype</p><h1>LANOVA Advantage Lab</h1>
    <p class="promise">Discover what your resources could achieve.</p>
    <p class="lede">Which investments can you afford, which combination creates the most value under your assumptions, and what would have to change for that answer to become wrong? Enter your financial situation and your options; compare scenarios, constraints and break-even points; export a decision report that states its assumptions and limits.</p></section>
    ${errors.length ? `<div class="notice bad" role="alert" id="import-errors"><b>The project file was not opened:</b><ul>${errors.slice(0, 10).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="starts">
      <section class="card start"><h2>Start from scratch</h2><p class="muted">A neutral workspace: your sport, your structure, your budget and your options. Nothing is pre-filled.</p><button type="button" class="btn primary" data-start="blank">Start from scratch</button>
        <p class="muted small">Or open a project you saved earlier (a file on your device; nothing is uploaded):</p><label class="btn">Open a saved project<input type="file" accept=".json,application/json" data-import="1" hidden></label></section>
      <section class="card start"><h2>Load an illustrative example</h2><p class="muted">Anonymous organisations in three sports; every figure is invented and every result is calculated when you open it.</p>
        <div class="examples">${Object.entries(EXAMPLES).map(([k, e]) => `<button type="button" class="club" data-example="${k}"><b>${esc(e.title)}</b><span>${esc(e.text)}</span></button>`).join('')}</div>
        <button type="button" class="club worked" data-worked="1"><b>${esc(WORKED.title)}</b><span>${esc(WORKED.sport)} · ${esc(WORKED.text)}</span></button></section>
    </div>`;
}

// ------------------------------------------------------------------ workspace
const field = (bind, label, value, {type = 'number', step = 'any', hint = '', min, attrs = ''} = {}) =>
  `<label>${esc(label)}<input type="${type}" ${type === 'number' ? `inputmode="decimal" step="${step}"${min !== undefined ? ` min="${min}"` : ''}` : ''} data-bind="${bind}" value="${esc(value ?? '')}" ${attrs}>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
const select = (bind, label, value, options) => `<label>${esc(label)}<select data-bind="${bind}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const check = (attr, label, checked, hint = '') => `<label class="check-inline"><input type="checkbox" ${attr} ${checked ? 'checked' : ''}> ${esc(label)}${hint ? ` <small class="hint">${esc(hint)}</small>` : ''}</label>`;
const scoreOpts = [['', 'No estimate'], ...Array.from({length: 11}, (_, i) => [i, String(i)])];
const monthOpts = m => Array.from({length: m.horizonMonths}, (_, t) => [t, `month ${t + 1}`]);
const originText = () => {
  const m = S.model;
  if (S.origin === 'imported') return `${ORIGINS.imported} — ${m.fictional ? 'illustrative, every figure invented' : 'data entered by its author, not verified by LANOVA'}`;
  if (m.fictional) return `Illustrative example — anonymous; all figures invented${S.modified ? ' · changed by you (still illustrative)' : ''}`;
  return 'Your own workspace — your figures, not verified by LANOVA';
};

function optionForm(m, o, i) {
  const others = m.options.filter(x => x.id !== o.id), signing = o.kind === 'signing';
  const kindFields = signing
    ? `${field(`options.${i}.transferFee`, 'Transfer fee (EUR)', o.transferFee, {min: 0})}${select(`options.${i}.feeInstalments`, 'Transfer fee paid in', o.feeInstalments, [1, 2, 3, 4, 5, 6].map(n => [n, `${n} yearly instalment${n > 1 ? 's' : ''}`]))}
       ${field(`options.${i}.agentFee`, 'Agent fee (EUR, at signing)', o.agentFee, {min: 0})}${field(`options.${i}.signingBonus`, 'Signing bonus (EUR, paid at signing)', o.signingBonus, {min: 0, hint: 'Paid in cash at signing, expensed over the contract'})}
       ${field(`options.${i}.contractMonths`, 'Contract (months)', o.contractMonths, {step: 1, min: 1})}${field(`options.${i}.monthlyWage`, 'Gross wage per month (EUR)', o.monthlyWage, {min: 0})}
       ${field(`options.${i}.employerChargeRate`, 'Employer charges (share of wages, 0–1)', o.employerChargeRate, {min: 0, step: 0.01})}`
    : `${field(`options.${i}.upfront`, 'Immediate cost (EUR)', o.upfront, {min: 0})}${select(`options.${i}.upfrontType`, 'Immediate cost is', o.upfrontType, [['expense', 'an expense'], ['capital', 'a capital investment']])}
       ${o.upfrontType === 'capital' ? field(`options.${i}.usefulLifeMonths`, 'Useful life (months)', o.usefulLifeMonths, {step: 1, min: 1}) : ''}
       ${select(`options.${i}.instalments`, 'Immediate cost paid in', o.instalments, Array.from({length: MAX_INSTALMENTS}, (_, k) => [k + 1, `${k + 1} instalment${k ? 's' : ''}`]))}
       ${o.instalments > 1 ? select(`options.${i}.instalmentEveryMonths`, 'Every', o.instalmentEveryMonths, [1, 2, 3, 4, 6, 12].map(n => [n, `${n} month${n > 1 ? 's' : ''}`])) : ''}
       ${field(`options.${i}.monthlyCost`, 'Running cost per month (EUR)', o.monthlyCost, {min: 0})}${select(`options.${i}.costType`, 'Running cost is', o.costType, [['operating', 'an operating cost'], ['staff', 'staff (wages): wage scenarios apply']])}
       ${field(`options.${i}.commitmentMonths`, 'Committed for (months)', o.commitmentMonths, {step: 1, min: 0, hint: 'Future commitments: running cost × months'})}`;
  return `<article class="option" aria-label="Option ${i + 1}"><header><b><span class="badge">${i + 1}</span> ${esc(o.name)}</b><button type="button" class="btn small ghost" data-remove="${i}">Remove</button></header>
    <div class="grid tight">
      ${field(`options.${i}.name`, 'Name', o.name, {type: 'text'})}${field(`options.${i}.category`, 'Category', o.category, {type: 'text'})}
      ${select(`options.${i}.kind`, 'Type of decision', o.kind, [['project', 'Project (staff, facility, programme…)'], ['signing', 'Signing (player contract)']])}
      ${select(`options.${i}.startMonth`, 'Starts in', o.startMonth, monthOpts(m))}${field(`options.${i}.effectMonths`, 'Months until it has an effect', o.effectMonths, {step: 1, min: 0})}
      ${kindFields}
      <label>Financial gain per month is<select data-gain-kind="${i}">${[['known', 'a single figure'], ['range', 'a documented range'], ['unknown', 'not estimable']].map(([v, l]) => `<option value="${v}" ${gainStatus(o) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${gainStatus(o) === 'unknown' ? '<small class="hint">Left out of the cash (prudent). Never counted as zero: rankings it could change are marked "Financial comparison incomplete".</small>' : ''}</label>
      ${gainStatus(o) === 'known' ? field(`options.${i}.monthlyGain`, 'Financial gain per month (EUR)', o.monthlyGain) : ''}
      ${gainStatus(o) === 'range' ? `${field(`options.${i}.gainRange.low`, 'Lowest documented gain per month (EUR)', o.gainRange.low, {hint: 'Used for the cash (prudent)'})}${field(`options.${i}.gainRange.high`, 'Highest documented gain per month (EUR)', o.gainRange.high)}${field(`options.${i}.gainRange.basis`, 'Source of the range', o.gainRange.basis, {type: 'text', hint: 'A quote, an offer, a past season: a range is not a guess'})}` : ''}
      ${field(`options.${i}.gainMonths`, 'Gain lasts (months)', o.gainMonths, {step: 1, min: 1})}
      ${select(`options.${i}.shortTermScore`, 'Your estimate: immediate contribution (0–10)', o.shortTermScore, scoreOpts)}${select(`options.${i}.longTermScore`, 'Your estimate: long-term contribution (0–10)', o.longTermScore, scoreOpts)}
      ${select(`options.${i}.risk`, 'Your view of its risk', o.risk, [['', 'No estimate'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}${select(`options.${i}.confidence`, 'Confidence in your estimates', o.confidence, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
    </div>
    <div class="constraints-row">${check(`data-mandatory="${i}"`, 'Mandatory (must be in every combination)', o.mandatory)}
      ${field(`options.${i}.exclusiveGroup`, 'Mutually exclusive group (optional)', o.exclusiveGroup, {type: 'text', hint: 'Options with the same group name are alternatives: at most one is chosen'})}
      ${others.length ? `<fieldset class="requires"><legend>Requires (only with)</legend>${others.map(x => check(`data-requires="${i}" value="${esc(x.id)}"`, x.name, o.requires.includes(x.id))).join('')}</fieldset>` : ''}</div></article>`;
}

function workspace() {
  const m = S.model, f = m.finance, sc = m.scenarios, opts = m.options.map((o, i) => optionForm(m, o, i)).join('');
  const structures = ['Amateur club (volunteer-run)', 'Semi-professional club', 'Professional club', 'Federation or league', 'Academy or training centre', 'Multi-sport organisation'];
  main.innerHTML = `<div class="labbar"><button type="button" class="btn small ghost" data-home="1">← Start again</button><span class="muted small" id="origin">${esc(originText())} · EUR</span>
      <span class="spacer"></span><button type="button" class="btn small" data-save="1">Save project (JSON)</button><label class="btn small ghost">Open a project<input type="file" accept=".json,application/json" data-import="1" hidden></label></div>
    <h1 class="plan-title">${esc(m.label || 'My organisation')}</h1>
    ${S.notes.length ? `<div class="notice" id="import-notice" role="status">${S.notes.map(esc).join(' ')}</div>` : ''}
    <nav class="steps" aria-label="Workflow">${STEPS.map(([id, l], i) => `<a href="#${id}"><span>${i + 1}</span>${esc(l)}</a>`).join('')}</nav>
    <details class="card howto"><summary>How to read these results</summary><dl>
      <div><dt>Calculated</dt><dd>Costs, commitments, month-end cash (LANOVA Finance engine) and feasibility against your budget and minimum cash reserve, in three scenarios.</dd></div>
      <div><dt>Your estimates (0–10)</dt><dd>Contributions to immediate performance and long-term development. They are your judgement, not predictions of sporting results. A blank estimate stays unknown: it is never counted as zero, and a ranking that depends on it is marked uncertain.</dd></div>
      <div><dt>Risk (your view)</dt><dd>Used only to compare options with each other (dominance): an option is never dominated by one you consider riskier. It does not change any cash figure.</dd></div>
      <div><dt>Confidence</dt><dd>Recorded in the decision brief for the reader. It does not change any calculation.</dd></div>
      <div><dt>Financial gains</dt><dd>A single figure, a documented range (with its source) or "not estimable". ${esc(PRUDENT_CASH)} When a gain that is not estimable could change a ranking, the strategy reads "Financial comparison incomplete" and the option is named.</dd></div>
      <div><dt>Scenarios</dt><dd>Base case as entered; a downside and an upside case that change revenue, operating costs and wages by a percentage from the month you choose (amounts paid before that month are not changed). The downside feeds the "financial security" criterion and the warnings, and can be made a hard constraint.</dd></div>
      <div><dt>Strategy weights</dt><dd>Preferences applied after the hard and structural constraints, to every feasible combination including "do nothing". They express priorities; they do not forecast results.</dd></div>
      <div><dt>Sensitivity</dt><dd>Break-even points found by recalculating with the Finance engine; each states its tolerance. "${esc(NOT_DETERMINABLE)}" means no reliable threshold exists in the tested range.</dd></div>
    </dl></details>
    <section class="card" aria-labelledby="h-org"><header><h2 id="h-org">1 · Your financial situation and hard constraints</h2></header>
      <div class="grid">
        ${field('label', 'Organisation (name or description)', m.label, {type: 'text'})}${field('sport', 'Sport', m.sport, {type: 'text', attrs: 'list="sports"'})}
        ${select('structure', 'Type of structure', m.structure, [['', 'Choose…'], ...structures.map(x => [x, x])].concat(m.structure && !structures.includes(m.structure) ? [[m.structure, m.structure]] : []))}
        ${select('horizonMonths', 'Decision horizon', m.horizonMonths, HORIZONS.map(h => [h, `${h} months`]))}
        ${field('finance.openingCash', 'Cash available today (EUR)', f.openingCash)}${field('finance.annualRevenue', 'Annual revenue (EUR)', f.annualRevenue, {min: 0})}
        ${field('finance.annualOperatingCosts', 'Annual operating costs, staff included (EUR)', f.annualOperatingCosts, {min: 0})}
        ${field('finance.staffCosts', 'of which staff costs (EUR, optional)', f.staffCosts, {min: 0, hint: 'Needed for wage scenarios; leave empty if not split (never counted as zero)'})}
        ${field('finance.decisionBudget', 'Hard constraint · budget available for these decisions (EUR)', f.decisionBudget, {min: 0})}
        ${field('finance.minimumCash', 'Hard constraint · minimum cash reserve (EUR)', f.minimumCash, {min: 0})}
      </div><datalist id="sports">${['Football', 'Rugby union', 'Basketball', 'Ice hockey', 'Handball', 'Volleyball', 'Cycling', 'Athletics', 'Tennis', 'Motorsport'].map(s => `<option value="${s}">`).join('')}</datalist></section>
    <section class="card" aria-labelledby="h-opts"><header><div><h2 id="h-opts">2 · Options under consideration (${m.options.length}/${MAX_OPTIONS})</h2><p class="muted small">Costs and commitments are facts or quotes; contributions and risk are your estimates and are shown as such.</p></div>
      <button type="button" class="btn" data-add="1" ${m.options.length >= MAX_OPTIONS ? 'disabled' : ''}>+ Add an option</button></header>
      ${opts || '<p class="muted">No option yet. Add the first one: a staff role, a facility, a programme, a signing…</p>'}</section>
    <section class="card" aria-labelledby="h-scen"><header><div><h2 id="h-scen">3 · Scenarios and constraints</h2><p class="muted small">Each scenario changes the budget by a percentage from its activation month; option gains and costs follow the same changes. The base case is your budget as entered.</p></div></header>
      <div class="scen-grid">${['downside', 'upside'].map(s => `<fieldset class="scen"><legend>${esc(SCENARIOS[s])}</legend>
        ${Object.entries(LEVERS).map(([k, d]) => field(`scenarios.${s}.${k}`, d.label, sc[s][k], {step: 0.5})).join('')}
        ${select(`scenarios.${s}.fromMonth`, 'Applies from', sc[s].fromMonth, monthOpts(m))}</fieldset>`).join('')}</div>
      ${check('data-downside-must-hold="1"', 'Hard constraint: the reserve must also hold in the downside scenario', m.constraints.downsideMustHold, 'Only combinations that keep the reserve in the downside are then considered')}
      ${structureText(m).length ? `<p class="small"><b>Constraints between options:</b> ${esc(structureText(m).join(' · '))}.</p>` : '<p class="muted small">No constraint between options. Set them on each option: mandatory, mutually exclusive group, requires.</p>'}</section>
    <section class="card" aria-labelledby="h-map"><header><div><h2 id="h-map">4 · Compare — Resource Advantage Map</h2><p class="muted small">Each option on its total cost and its contribution to the objective. Size = how far it lowers your lowest month-end cash; outline = your risk view; small label = months until it has an effect.</p></div>
      ${select('objective', 'Objective (vertical axis)', m.objective, Object.entries(OBJECTIVES).map(([k, v]) => [k, v.label]))}</header>
      <div id="fin-notice" aria-live="polite"></div><div id="summary" class="summary" aria-live="polite"></div><div id="map" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="h-strat"><header><div><h2 id="h-strat">Compare — feasible combinations under each strategy</h2><p class="muted small">Preferences, applied after the hard and structural constraints. Weights of each criterion (they are normalised to 100%).</p></div></header>
      <div class="strats">${Object.entries(STRATEGIES).map(([k, s]) => `<fieldset class="strat"><legend>${esc(s.label)}</legend>${Object.entries(CRITERIA).map(([c, l]) => `<label>${esc(l)}<input type="number" min="0" step="0.05" data-weight="${k}.${c}" value="${S.weights[k][c]}"></label>`).join('')}</fieldset>`).join('')}</div>
      <div id="results" aria-live="polite"></div>
      <div id="scen-results" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="h-sens"><header><div><h2 id="h-sens">5 · Sensitivity and break-even</h2><p class="muted small">For one strategy's recommendation: the additional revenue needed, the maximum affordable cost, the breaking points of the assumptions, the gain at which another option enters, and the assumptions that move the result most. Each figure is recalculated with the Finance engine.</p></div>
      <div class="next"><label>Strategy<select data-ui="strategy">${Object.entries(STRATEGIES).map(([k, s]) => `<option value="${k}" ${k === S.strategy ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label><button type="button" class="btn primary" data-sens="1">Run the sensitivity analysis</button></div></header>
      <div id="sens" aria-live="polite"><p class="muted small">Not run yet. It takes from a fraction of a second to a few seconds, in your browser.</p></div></section>
    <section class="card" aria-labelledby="h-brief"><header><div><h2 id="h-brief">6 · Decision Brief</h2><p class="muted small">Organisation and objective, scenarios and assumptions, options, the recommended combination and its alternatives, costs and cash commitments, constraints, sensitivity thresholds, uncertainties and missing data.</p></div>
      <div class="next"><button type="button" class="btn primary" data-export="html">Download brief (HTML, printable)</button><button type="button" class="btn" data-export="json">JSON</button><button type="button" class="btn" data-export="csv">CSV</button><button type="button" class="btn ghost" data-print="1">Print or save as PDF</button></div></header>
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
    <p class="muted small">Without any option: lowest month-end cash ${fmt(r.baseMinCash)} (downside ${fmt(r.baseMinCashDownside)}, upside ${fmt(r.baseMinCashUpside)}). "Not feasible" here means on its own; the combination search tests every combination. Dominance compares feasible options on total cost, the objective, risk and lowest cash, only when both have estimates. Cash: LANOVA Finance engine.</p>`;
}

function results(r, m) {
  return `<div class="strat-results">${Object.entries(r.strategies).map(([k, s]) => { const b = s.best;
    return `<article class="sres ${s.status}" data-strategy="${k}"><h3>${esc(STRATEGIES[k].label)}</h3><p class="reading">${esc(READING[s.status])}</p>
      <p class="pick">${s.status === 'no-feasible' ? esc(s.noFeasibleReason ?? 'None meets the constraints.') : b.options.length ? esc(b.options.join(' + ')) : 'Do nothing (keep the resources)'}</p>
      <dl><div><dt>Immediate cost</dt><dd>${fmt(b.upfront)}</dd></div><div><dt>Total cost</dt><dd>${fmt(b.totalCost)}</dd></div><div><dt>Lowest cash</dt><dd>${fmt(b.minCashBase)}</dd></div><div><dt>Lowest cash, downside</dt><dd class="${b.minCashDownside < m.finance.minimumCash ? 'neg' : ''}">${fmt(b.minCashDownside)}</dd></div></dl>
      ${s.runnerUp ? `<p class="small muted">Alternative to examine: ${esc(s.runnerUp.options.join(' + ') || 'do nothing')}${s.why?.length ? ` — ranks lower on ${esc(s.why.map(x => x.label.replace(/ \((your estimate|calculated)\)/, '')).join(', '))}` : ''}</p>` : ''}
      ${s.rejectedBest?.length ? `<p class="small">Ruled out although preferred: ${esc(s.rejectedBest.map(x => `${x.options.join(' + ')} (${x.because})`).join('; '))}.</p>` : ''}
      ${s.bestRobust ? `<p class="small neg">Does not keep the reserve in the downside. Best that does: ${esc(s.bestRobust.options.join(' + ') || 'do nothing')}.</p>` : ''}
      ${s.assumptionsNeeded.length ? `<p class="small neg">The ranking could change once these estimates are known: ${esc(s.assumptionsNeeded.join('; '))}.${s.contenders.length ? ` Could rank higher: ${esc(s.contenders.map(c => c.options.join(' + ') || 'do nothing').join(' · '))}.` : ''}</p>` : ''}
      ${s.financial.incomplete ? `<p class="small neg" data-financial-incomplete="${k}"><b>Why:</b> ${esc(s.financial.reasons.join(' '))} Gain not estimable: ${esc(s.financial.optionsWithUnknownGain.map(x => `${x.name} (${x.role})`).join('; '))}.</p>`
        : s.unboundedGains.length ? `<p class="small muted">Gain not estimable, left out of the cash; this ranking does not depend on it: ${esc(s.unboundedGains.join(', '))}.</p>` : ''}
      ${b.highRisk.length ? `<p class="small">High risk in your view: ${esc(b.highRisk.join(', '))}</p>` : ''}
      ${b.minCashDownside < m.finance.minimumCash && !s.bestRobust ? '<p class="small neg">In the downside case, cash falls below the reserve.</p>' : ''}
      <p class="small muted">${s.candidates} feasible combination(s) compared${s.rejectedCounts ? ` · excluded: ${s.rejectedCounts.structure} by constraints between options, ${s.rejectedCounts.budget} by the budget, ${s.rejectedCounts.reserve} by the reserve${m.constraints.downsideMustHold ? `, ${s.rejectedCounts.downside} by the downside reserve` : ''}` : ''}.</p></article>`; }).join('')}</div>
    <p class="muted small">A strategy shows the combination with the best preference score among those that meet every hard and structural constraint. It is a reading of your weights and estimates, not a forecast of results.</p>`;
}

/** Month-end cash of a combination in the three scenarios, with the reserve (display only). */
function cashChart(x, reserve, months) {
  const W = 760, H = 240, L = 70, R = 14, T = 14, B = 36, all = [...Object.values(x.scenarios).flatMap(s => s.cash), reserve], lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const px = t => L + t * (W - L - R) / Math.max(1, months.length - 1), py = v => T + (hi - v) * (H - T - B) / span;
  const path = c => c.map((v, t) => `${t ? 'L' : 'M'}${px(t).toFixed(1)} ${py(v).toFixed(1)}`).join('');
  const k = v => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`);
  return `<svg class="cash-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Month-end cash of the recommendation by scenario, with the minimum reserve">
    ${[hi, (hi + lo) / 2, lo].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}"/><text x="${L - 6}" y="${py(v) + 4}" text-anchor="end">${k(v)}</text>`).join('')}
    <line class="reserve" x1="${L}" x2="${W - R}" y1="${py(reserve)}" y2="${py(reserve)}"/><text class="rl" x="${W - R}" y="${py(reserve) - 5}" text-anchor="end">reserve ${k(reserve)}</text>
    ${['upside', 'base', 'downside'].map(s => `<path class="l-${s}" d="${path(x.scenarios[s].cash)}"/>`).join('')}
    ${[0, Math.floor((months.length - 1) / 2), months.length - 1].map(t => `<text x="${px(t)}" y="${H - 12}" text-anchor="middle">${esc(months[t])}</text>`).join('')}</svg>
    <p class="legend"><span><i class="ln base"></i>Base</span><span><i class="ln downside"></i>Downside</span><span><i class="ln upside"></i>Upside</span><span><i class="ln reserve"></i>Minimum reserve</span></p>`;
}
function scenarioView(r, m) {
  const k = S.strategy, s = r.strategies[k];
  if (!s || s.status === 'no-feasible') return '';
  const x = scenarioResults(r, s.best.ids);
  return `<h3 id="scen-title">Cash of the recommendation by scenario — ${esc(STRATEGIES[k].label)}</h3><p class="small">${esc(s.best.options.join(' + ') || 'Do nothing')} · immediate cost ${fmt(x.upfront)} of a budget of ${fmt(m.finance.decisionBudget)} (${x.withinBudget ? `${fmt(x.budgetHeadroom)} left` : 'over budget'})</p>
    <div class="table-wrap"><table class="scen-results"><thead><tr><th>Scenario</th><th>Assumptions</th><th class="n">Lowest month-end cash</th><th>Month</th><th class="n">Headroom over the reserve</th><th class="n">Cash at the end</th><th>Reserve met</th></tr></thead><tbody>
    ${Object.entries(x.scenarios).map(([sc, v]) => `<tr class="${v.meetsReserve ? '' : 'breach'}"><td>${esc(v.label)}</td><td class="small">${esc(v.text.replace(/^[^:]+: /, ''))}</td><td class="n">${fmt(v.lowest)}</td><td>${esc(v.lowestMonth)}</td><td class="n ${v.headroom < 0 ? 'neg' : ''}">${fmt(v.headroom)}</td><td class="n">${fmt(v.end)}</td><td>${v.meetsReserve ? 'yes' : `<b class="neg">no</b>, from ${esc(v.firstBelow)}`}</td></tr>`).join('')}
    </tbody></table></div>${cashChart(x, m.finance.minimumCash, r.months)}
    <p class="muted small">Choose the strategy shown here in step 5. Combination cash = baseline + each option's change, each from a Finance engine run; checked against a single engine run of the whole combination in the tests.</p>`;
}

function briefView(r, m) {
  const b = brief(m, r, {sensitivity: S.sens?.analysis ?? null}), li = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const bad = b.options.filter(o => o.status === 'infeasible' || o.status === 'dominated');
  return `${noticeHtml(r, 'brief-fin-notice')}<div class="brief-grid"><div><h3>Objective</h3><p>${esc(b.objective)} · ${esc(b.horizon)}</p><p class="small muted">${esc(b.dataOrigin)}</p><h3>Hard constraints</h3>${li(b.hardConstraints)}${b.structuralConstraints.length ? `<h3>Constraints between options</h3>${li(b.structuralConstraints)}` : ''}<h3>Scenarios studied</h3>${li(b.scenariosStudied)}</div>
    <div><h3>Dominated or not feasible on their own</h3>${bad.length ? li(bad.map(o => `${o.name}: ${o.status === 'infeasible' ? o.infeasibleBecause.join(' ') : `dominated by ${o.dominatedBy.join(', ')}`}`)) : '<p class="muted">None.</p>'}
      <h3>Sensitivity</h3><p class="small">${b.sensitivity ? `Included: ${esc(b.sensitivity.strategy)}.` : 'Not run yet (step 5): run it to include the break-even points in the exported brief.'}</p>
      <h3>Data missing for a definitive decision</h3>${li(b.missingForADecision)}</div>
    <div><h3>Assumptions</h3>${li(b.assumptions)}<h3>Limits</h3>${li(b.limits)}</div></div>`;
}

/** The financial-completeness notice (same text as the exports: financialNotice in lab.js). */
function noticeHtml(r, id) {
  const n = financialNotice(r);
  return n ? `<div class="notice ${n.incomplete ? 'bad fin-incomplete' : ''}" id="${id}" role="${n.incomplete ? 'alert' : 'note'}"><b>${esc(n.title)}.</b> <span class="fin-text">${esc(n.text)}</span></div>` : '';
}

// ------------------------------------------------------------------ sensitivity (display only)
function sensView(a) {
  if (a.problems?.length) return `<div class="notice bad" role="alert">${esc(a.problems.join('; '))}</div>`;
  if (!a.requiredRevenue) return `<div class="notice">${esc(a.note ?? 'No recommendation to analyse.')}</div>`;
  const st = x => (x.determinable === false ? `<span class="nd">${esc(x.reason)}</span>` : esc(x.explanation));
  const table = (head, rows) => `<div class="table-wrap"><table class="sens-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  return `<p class="small"><b>Recommendation tested:</b> ${esc(a.recommendation.join(' + ') || 'Do nothing')} (${esc(a.label)}). Calculated in ${(a.elapsedMs / 1000).toFixed(1)} s.</p>
    <h3>Additional revenue needed to keep the reserve</h3>${table(['Scenario', 'Combination', 'Per month', 'Reading'], a.requiredRevenue.map(x => `<tr><td>${esc(SCENARIOS[x.scenario])}</td><td>${esc((x.forRejected ?? a.recommendation).join(' + ') || 'Do nothing')}${x.because ? `<br><small>ruled out: ${esc(x.because)}</small>` : ''}</td><td class="n">${x.value === null ? '—' : fmt(x.value)}</td><td>${st(x)}</td></tr>`))}
    <h3>Maximum affordable cost</h3>${table(['Option', 'Of', 'Current', 'Maximum', 'Binds first', 'Reading'], a.maxAffordableCost.map(x => `<tr><td>${esc(x.option)}</td><td>${esc(x.field)}</td><td class="n">${fmt(x.current)}</td><td class="n">${x.value === null ? '—' : fmt(x.value)}</td><td>${esc(x.binding ?? '—')}</td><td>${st(x)}</td></tr>`))}
    <h3>Breaking points of the recommendation</h3>${table(['Assumption', 'Threshold', 'Reading'], a.thresholds.items.map(x => `<tr><td>${esc(x.label)}</td><td class="n">${x.value === undefined || x.value === null ? '—' : `${x.value > 0 ? '+' : ''}${x.value.toFixed(2)}%`}</td><td>${st(x)}</td></tr>`))}
    <h3>Gain at which another option enters the recommendation</h3>${a.preference.items.length ? table(['Option', 'Gain today', 'Needed per month', 'Reading'], a.preference.items.map(x => `<tr><td>${esc(x.option)}</td><td>${x.gainStatus === 'unknown' ? 'not estimable' : x.gainStatus === 'range' ? `range from ${fmt(x.currentGain)}` : fmt(x.currentGain)}</td><td class="n">${x.value === undefined ? '—' : fmt(x.value)}</td><td>${st(x)}</td></tr>`)) : '<p class="muted small">Every option is already in the recommendation.</p>'}
    <h3>Assumptions that move the result most</h3>${table(['Assumption', 'Change', 'Lowest cash, base', 'Lowest cash, downside', 'Recommendation changes'], a.influence.items.slice(0, 8).flatMap(x => x.effects.map((e, i) => `<tr>${i ? '' : `<td rowspan="2">${esc(x.label)}</td>`}<td>${e.change > 0 ? '+' : ''}${e.change}%</td><td class="n ${e.base < 0 ? 'neg' : ''}">${e.base > 0 ? '+' : ''}${fmt(e.base)}</td><td class="n ${e.downside < 0 ? 'neg' : ''}">${e.downside > 0 ? '+' : ''}${fmt(e.downside)}</td><td>${e.recommendationChanges ? '<b>yes</b>' : 'no'}</td></tr>`)))}
    ${a.influence.excluded.length ? `<p class="muted small">Not tested: ${esc(a.influence.excluded.join('; '))}.</p>` : ''}
    <p class="muted small">Method: each figure is found by recalculating the plan with the Finance engine (bisection on a range where the response is checked to be monotonic), with the tolerance stated. Budget assumptions change your budget itself, so they carry into every scenario. No probability is computed.</p>`;
}
function runSensitivity() {
  const box = document.getElementById('sens');
  if (!S.result || S.result.problems.length) { box.innerHTML = '<div class="notice bad" role="alert">Complete the inputs first: nothing is calculated until they are valid.</div>'; return; }
  box.innerHTML = '<p class="muted" role="status">Calculating with the Finance engine…</p>';
  setTimeout(() => {
    try { const a = analyse(S.model, S.strategy, {weights: S.weights}); S.sens = {analysis: a.requiredRevenue ? a : null, strategy: S.strategy}; box.innerHTML = sensView(a); }
    catch (e) { box.innerHTML = `<div class="notice bad" role="alert">The analysis could not be completed: ${esc(e.message)}</div>`; S.sens = null; }
    document.getElementById('brief').innerHTML = briefView(S.result, S.model);
  }, 30);
}

// ------------------------------------------------------------------ compute and events
function compute() {
  const r = evaluate(S.model, {weights: S.weights}); S.result = r;
  const map = document.getElementById('map'), res = document.getElementById('results'), br = document.getElementById('brief'), sv = document.getElementById('scen-results');
  if (r.problems.length) {
    const msg = `<div class="notice bad" role="alert"><b>Complete or correct these inputs — nothing is calculated until they are valid:</b><ul>${r.problems.slice(0, 12).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
    map.innerHTML = msg; res.innerHTML = ''; sv.innerHTML = ''; document.getElementById('summary').innerHTML = ''; document.getElementById('fin-notice').innerHTML = ''; br.innerHTML = '<p class="muted">The brief appears once the inputs are valid.</p>'; return;
  }
  map.innerHTML = r.options.length ? chart(r, S.model) : '<p class="muted">Add options below to see them on the map.</p>';
  const c = st => r.options.filter(o => o.status === st).length;
  document.getElementById('summary').innerHTML = r.options.length ? `<div><span>Options</span><b>${r.options.length}</b></div><div><span>Efficient</span><b>${c('frontier')}</b></div><div><span>Dominated</span><b>${c('dominated')}</b></div><div><span>Not feasible</span><b>${c('infeasible')}</b></div><div><span>Not comparable</span><b>${c('not-comparable')}</b></div><div><span>Lowest cash without any option</span><b>${fmt(r.baseMinCash)}</b></div>` : '';
  document.getElementById('fin-notice').innerHTML = noticeHtml(r, 'map-fin-notice');
  res.innerHTML = results(r, S.model); sv.innerHTML = scenarioView(r, S.model); br.innerHTML = briefView(r, S.model);
}
const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(compute, 120); };
// Any change of input makes an earlier sensitivity analysis stale: it is dropped (never shown for other inputs).
function changed() {
  S.modified = true; if (S.sens) { S.sens = null; const b = document.getElementById('sens'); if (b) b.innerHTML = '<p class="muted small">Inputs changed: run the analysis again.</p>'; }
  const o = document.getElementById('origin'); if (o) o.textContent = `${originText()} · EUR`;
}
addEventListener('resize', () => { if (S.model && document.getElementById('map')) schedule(); });
function setPath(path, raw, el) {
  const keys = path.split('.'), last = keys.pop(); let o = S.model; for (const k of keys) o = o[k];
  const textKeys = ['label', 'sport', 'structure', 'name', 'category', 'upfrontType', 'objective', 'risk', 'confidence', 'basis', 'kind', 'costType', 'exclusiveGroup'];
  let v;
  if (textKeys.includes(last)) v = last === 'risk' ? (raw === '' ? null : raw) : raw;
  else if (['shortTermScore', 'longTermScore'].includes(last) || (last === 'staffCosts' && raw.trim() === '')) v = raw === '' ? null : Number(raw);
  else v = raw.trim() === '' ? NaN : Number(raw);
  o[last] = v; changed();
  if (last === 'kind') {
    // Switching type keeps the shared fields; a signing starts with no fee, no wage and no bonus for you to enter.
    if (v === 'signing') Object.assign(o, {transferFee: o.transferFee ?? 0, feeInstalments: o.feeInstalments ?? 1, agentFee: o.agentFee ?? 0, signingBonus: o.signingBonus ?? 0, contractMonths: o.contractMonths ?? 24, monthlyWage: o.monthlyWage ?? 0, employerChargeRate: o.employerChargeRate ?? 0.3});
    else Object.assign(o, {upfront: o.upfront ?? 0, upfrontType: o.upfrontType ?? 'expense', monthlyCost: o.monthlyCost ?? 0, commitmentMonths: o.commitmentMonths ?? 12, costType: o.costType ?? 'operating', instalments: o.instalments ?? 1, instalmentEveryMonths: o.instalmentEveryMonths ?? 1});
    workspace(); return;
  }
  if (el.tagName === 'SELECT' && ['upfrontType', 'horizonMonths', 'instalments'].includes(last)) { if (last === 'upfrontType' && v === 'capital' && !o.usefulLifeMonths) o.usefulLifeMonths = 60; workspace(); return; }
  if (last === 'name') { const b = el.closest('.option')?.querySelector('header b'); if (b) b.lastChild.textContent = ` ${raw}`; }
  if (last === 'objective') return compute();
  schedule();
}
function download(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); }
const slug = () => (S.model.label || 'organisation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
function open(model, origin, example = null, notes = []) { S.model = model; S.origin = origin; S.example = example; S.modified = false; S.sens = null; S.notes = notes; workspace(); main.focus(); }
async function importFile(input) {
  const file = input.files?.[0]; if (!file) return;
  if (file.size > MAX_BYTES) { start([`The file is larger than ${MAX_BYTES / 1024} KB; an Advantage Lab project is much smaller.`]); return; }
  const r = importProject(await file.text());
  if (r.ok) open(r.model, 'imported', null, r.notes); else start(r.errors);
}

main.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind && el.tagName !== 'SELECT') setPath(el.dataset.bind, el.value, el);
  else if (el.dataset.weight) { const [k, c] = el.dataset.weight.split('.'); S.weights[k][c] = Number(el.value) || 0; changed(); schedule(); }
});
main.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.import) { importFile(el); return; }
  if (el.dataset.bind && el.tagName === 'SELECT') setPath(el.dataset.bind, el.value, el);
  else if (el.dataset.ui === 'strategy') { S.strategy = el.value; S.sens = null; document.getElementById('sens').innerHTML = '<p class="muted small">Strategy changed: run the analysis for it.</p>'; document.getElementById('scen-results').innerHTML = S.result && !S.result.problems.length ? scenarioView(S.result, S.model) : ''; }
  else if (el.dataset.mandatory !== undefined) { S.model.options[Number(el.dataset.mandatory)].mandatory = el.checked; changed(); workspace(); }
  else if (el.dataset.requires !== undefined) {
    const o = S.model.options[Number(el.dataset.requires)]; o.requires = el.checked ? [...new Set([...o.requires, el.value])] : o.requires.filter(x => x !== el.value); changed(); workspace();
  } else if (el.dataset.downsideMustHold !== undefined) { S.model.constraints.downsideMustHold = el.checked; changed(); workspace(); }
  else if (el.dataset.gainKind !== undefined) {
    // Switching never invents a figure: a single figure starts at 0 (no gain) for you to edit; a range starts empty.
    const o = S.model.options[Number(el.dataset.gainKind)], v = el.value;
    if (v === 'known') { o.monthlyGain = 0; delete o.gainRange; } else { o.monthlyGain = null; if (v === 'range') o.gainRange = {low: null, high: null, basis: ''}; else delete o.gainRange; }
    changed(); workspace();
  }
});
main.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) { open(blank(), 'user'); return; }
  if (b.dataset.example) { open(EXAMPLES[b.dataset.example].make(), 'example', b.dataset.example); return; }
  if (b.dataset.worked) { open(WORKED.make(), 'example', 'worked'); return; }
  if (b.dataset.home) { S.model = null; S.notes = []; start(); window.scrollTo(0, 0); return; }
  if (b.dataset.add) { S.model.options.push(newOption(++S.added + S.model.options.length)); changed(); workspace(); document.querySelectorAll('.option').item(S.model.options.length - 1)?.querySelector('input')?.focus(); return; }
  if (b.dataset.remove) {
    const id = S.model.options[Number(b.dataset.remove)].id; S.model.options.splice(Number(b.dataset.remove), 1);
    for (const o of S.model.options) o.requires = o.requires.filter(x => x !== id); // a removed option cannot be required any more
    changed(); workspace(); return;
  }
  if (b.dataset.sens) { runSensitivity(); return; }
  if (b.dataset.print) { const w = window.open('', '_blank'); if (w && S.result && !S.result.problems.length) { w.document.write(briefHtml(S.model, S.result, undefined, {sensitivity: S.sens?.analysis ?? null})); w.document.close(); w.focus(); w.print(); } return; }
  if (b.dataset.save) {
    try { download(`lanova-advantage-project-${slug()}.json`, 'application/json', exportProject(S.model, {origin: S.origin === 'imported' ? 'imported' : S.model.fictional ? 'example' : 'user'})); }
    catch (err) { document.getElementById('map').insertAdjacentHTML('afterbegin', `<div class="notice bad" role="alert">${esc(err.message)}</div>`); }
    return;
  }
  if (b.dataset.export && S.result && !S.result.problems.length) {
    const r = S.result, m = S.model, fx = b.dataset.export, sensitivity = S.sens?.analysis ?? null;
    if (fx === 'html') download(`lanova-advantage-brief-${slug()}.html`, 'text/html;charset=utf-8', briefHtml(m, r, undefined, {sensitivity}));
    if (fx === 'json') download(`lanova-advantage-brief-${slug()}.json`, 'application/json', JSON.stringify({inputs: m, brief: brief(m, r, {sensitivity})}, null, 2));
    if (fx === 'csv') download(`lanova-advantage-options-${slug()}.csv`, 'text/csv;charset=utf-8', '﻿' + briefCsv(m, r));
  }
});
// Entry points from the demo page: ?start=blank, ?example=<amateur|semipro|pro|worked>, optional &section=brief|map|strategies|sensitivity.
{
  const q = new URLSearchParams(location.search), ex = q.get('example'), sec = {brief: 'h-brief', map: 'h-map', strategies: 'h-strat', sensitivity: 'h-sens', scenarios: 'h-scen'}[q.get('section')];
  if (q.get('start') === 'blank') open(blank(), 'user');
  else if (ex && EXAMPLES[ex]) open(EXAMPLES[ex].make(), 'example', ex);
  else if (ex === 'worked') open(WORKED.make(), 'example', 'worked');
  else start();
  if (S.model && sec) requestAnimationFrame(() => document.getElementById(sec)?.scrollIntoView({block: 'start'}));
}
