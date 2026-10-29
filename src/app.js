import {MODEL_VERSION, defaults, normalizeModel, analyze, risk, sensitivity, breakEvenRevenue, portfolio, portfolioStresses, compareOpportunities, xnpv, xirr} from './finance.js';
import {emptyState, loadState, saveState, parseState} from './state.js';
import {validateSnapshot, auditSnapshot, verifyDigest} from './data.js';
import {esc, money, pct, multiple, csv, parseDatedFlows} from './format.js';
import {metric, badge, empty, table, exposures, cashChart, comparisonChart, scenarioChart} from './components.js';
import {DEMO_PROFILES, demoSession} from './demo.js';
import {investmentReport} from './report.js';
import {managementPage} from './management.js';
import {workspaceSteps, decisionDesk} from './workspace.js';

const $ = id => document.getElementById(id);
const storage = {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value)};
const names = {home: 'Lake Management', dashboard: 'Investor overview', opportunities: 'Opportunities & cases', model: 'Financial modeling', compare: 'Investment comparison', portfolio: 'Portfolio & risk', sources: 'Data & traceability'};
const scenarioNames = ['Downside', 'Base', 'Upside'];
let state = emptyState(), data, integrity, manifest, view = '', dirty = false, recovery = false, editorUnsaved = false, sessionUnsaved = false;
let comparison = new Set(), compareSort = 'npv', compareUseCommonRate = false, compareRate = 0.15;
let demoMode = false, demoLoading = false, demoFixture = null, beforeDemo = null;
let editor = newEditor();
const ids = () => data.athletes.map(a => a.id);
const allProfiles = () => [...data.athletes, ...DEMO_PROFILES];
const profile = id => allProfiles().find(a => a.id === id);
const profileName = id => profile(id)?.name ?? 'Unassigned case';
const diligenceCount = o => Object.values(o.diligence ?? {}).filter(Boolean).length;
const uid = () => crypto.randomUUID();

function newEditor(athleteId = 'unassigned') {
  return {id: null, athleteId, label: 'New case — Tennis', note: '', diligence: {contract: false, revenue: false, counterparty: false}, ...(demoMode ? {demo: true} : {}), model: normalizeModel(defaults)};
}
function message(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('negative', error);
}
function persist() {
  if (demoMode) { sessionUnsaved = false; $('storage-status').textContent = 'FICTIONAL DEMO · MEMORY ONLY'; message('Fictional demo updated in memory. Your working portfolio is preserved.'); return; }
  sessionUnsaved = true;
  if (recovery) {
    $('storage-status').textContent = 'UNSAVED SESSION';
    message('Changes are in memory only: the existing backup is unreadable or storage is blocked. Export JSON; use the save options to allow replacement.', true);
    return;
  }
  try {
    state = saveState(storage, state, ids());
    sessionUnsaved = false;
    $('storage-status').textContent = 'Local backup saved';
    message('Saved in this browser.');
  } catch (error) {
    $('storage-status').textContent = 'SAVE FAILED';
    message('Unable to save: ' + error.message + '. Export JSON to keep this session.', true);
  }
}
function download(name, value, type = 'application/json') {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([text], {type}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function switchView(next, force = false) {
  if (!names[next] || !data || (next === view && !force)) return;
  if (dirty && !force && next !== view && !confirm('Changes that have not been recalculated will be discarded. Continue?')) return;
  if (next !== view) dirty = false;
  view = next;
  document.body.classList.toggle('management-view', view === 'home');
  $('subtitle').textContent = view === 'home' ? 'Sports investing, guided by method.' : 'Lake Intelligence · Investment Decision Workspace';
  $('title').textContent = names[view];
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  render();
}
function render() {
  demoBanner();
  $('journey').innerHTML = view === 'home' ? '' : workspaceSteps(view);
  if (view === 'home') { $('content').innerHTML = managementPage(); return; }
  ({dashboard, opportunities, model: modelView, compare: comparisonView, portfolio: portfolioView, sources}[view])();
}
function openEditor(opportunity, athleteId = 'unassigned') {
  if ((dirty || editorUnsaved) && !confirm('Discard unsaved case changes?')) return;
  editor = opportunity ? structuredClone(opportunity) : newEditor(athleteId);
  dirty = false; editorUnsaved = false;
  switchView('model', true);
}
function allocate(opportunity) {
  if (state.positions.length >= 1000) throw Error('Maximum of 1,000 allocations reached.');
  const p = portfolio(state.positions, state.budget, allProfiles()), model = normalizeModel(opportunity.model);
  const outlay = model.capital + model.upfrontFee;
  if (outlay > p.cash + 1e-8) throw Error('Insufficient reserve: capital and upfront fees exceed the available budget.');
  state.positions.push({id: uid(), opportunityId: opportunity.id, athleteId: opportunity.athleteId, label: opportunity.label, note: opportunity.note, createdAt: new Date().toISOString(), model: structuredClone(model), ...(opportunity.demo ? {demo: true} : {})});
  persist(); switchView('portfolio', true);
}
function dashboard() {
  const p = portfolio(state.positions, state.budget, allProfiles());
  const ready = state.opportunities.filter(o => diligenceCount(o) === 3).length;
  $('content').innerHTML = `<div class="hero"><div><p class="overline">INVESTMENT DECISION WORKSPACE</p><h2>One case. Clear assumptions. A documented decision.</h2><p>Lake Intelligence supports Lake Management analysis, from scenarios to simulated capital allocation.</p></div><div class="toolbar"><button class="primary" data-action="${demoMode ? 'demo-create' : 'start-demo'}">${demoMode ? 'Create fictional case A' : 'Launch investor demo'}</button></div></div>${decisionDesk(state.opportunities)}<div class="stats">
    ${metric('Total budget', money(state.budget), 'Budget entered by the analyst')}
    ${metric('Committed capital + fees', money(p.invested), `${state.positions.length} simulated allocations`)}
    ${metric('Available reserve', money(p.cash), 'No actual commitment', 'positive')}
    ${metric('Total weighted NPV', money(p.expectedNpv), 'Sum at each case’s own discount rate', p.expectedNpv < 0 ? 'negative' : 'positive')}
  </div>
  <div class="grid"><div class="panel"><div class="flex split"><h2>Investment pipeline</h2>${badge(`${state.opportunities.length} saved cases`, 'neutral')}</div>
    <p class="muted">Each case retains its own economic terms. The sporting profile provides context; it does not determine returns.</p>
    <div class="toolbar"><button class="primary" data-action="new">+ Model an opportunity</button><button data-view="opportunities">Open cases</button></div>
    ${state.opportunities.length ? table(['Case', 'Declared diligence', 'Initial capital'], state.opportunities.slice(-4).reverse().map(o => `<tr><td class="wrap"><button class="link-button" data-edit="${esc(o.id)}">${esc(o.label)}</button><br><small>${esc(profileName(o.athleteId))}${o.demo ? ' · FICTIONAL' : ''}</small></td><td>${diligenceCount(o)}/3 checks</td><td>${money(o.model.capital + o.model.upfrontFee)}</td></tr>`)) : empty('No saved financial cases', 'Create independent assumptions, compare their value, then simulate an allocation.')}
    <p class="meta-line">${ready}/${state.opportunities.length} cases with all three checks declared by the analyst. These declarations are not Lake verification.</p>
  </div><div class="panel"><h2>Concentration risk</h2>
    ${exposures(p.byAthlete, profileName)}
    <p class="muted">HHI ${p.hhi.toFixed(3)} · ${p.effectiveNames.toFixed(2)} effective names · largest exposure ${pct(p.concentration)}.</p>
    ${p.concentration > 0.5 ? '<div class="notice">More than half of committed capital depends on a single athlete or unassigned group.</div>' : ''}
    <button data-view="portfolio">View portfolio stresses →</button>
  </div></div>
  <div class="panel"><h2>Distributions under a common shock</h2>${cashChart(p.annual)}
    <div class="stats">${scenarioNames.map((name, i) => metric(name, money(p.buckets[i]), 'Cumulative undiscounted cash flows, excluding reserve')).join('')}${metric('Total loss of largest exposure', money(p.largestNameCapital), 'Initial capital + fees at risk; isolated stress')}</div>
    <p class="meta-line">The same scenario label applies to all cases. No correlation model or portfolio loss probability is estimated.</p>
  </div>`;
}
function opportunityRows(items) {
  return items.map(o => {
    const a = analyze(o.model);
    return `<tr><td><input type="checkbox" data-select="${esc(o.id)}" aria-label="Compare ${esc(o.label)}" ${comparison.has(o.id) ? 'checked' : ''}></td>
      <td class="wrap"><button class="link-button" data-edit="${esc(o.id)}">${esc(o.label)}</button><br><small>${esc(profileName(o.athleteId))}${o.demo ? ' · FICTIONAL' : ''}</small></td>
      <td>${money(a.outlay)}</td><td>${o.model.years + o.model.paymentDelay} years</td><td class="${a.expectedNpv < 0 ? 'negative' : 'positive'}">${money(a.expectedNpv)}</td>
      <td>${multiple(a.expectedMoic)}</td><td>${diligenceCount(o)}/3</td><td><div class="flex"><button class="small" data-edit="${esc(o.id)}">Edit</button><button class="small" data-clone="${esc(o.id)}">Duplicate</button><button class="small" data-allocate="${esc(o.id)}">Allocate</button><button class="small danger" data-delete="${esc(o.id)}">Delete</button></div></td></tr>`;
  });
}
function opportunities() {
  const directory = demoMode ? DEMO_PROFILES : data.athletes;
  $('content').innerHTML = `<div class="toolbar"><input id="search" type="search" placeholder="Search cases, athletes or countries…" aria-label="Search cases, athletes or countries"><select id="country" aria-label="Biographical country"><option value="">All biographical countries</option>${directory.map(a => `<option>${esc(a.country)}</option>`).join('')}</select><button class="primary" data-action="new">+ New case</button><button data-view="compare">Compare selection</button></div>
    <div class="panel"><div class="flex split"><h2>Saved investment cases</h2><small id="selection-count"></small></div><div id="opportunity-results"></div></div>
    <div class="panel"><h2>${demoMode ? 'Fictional demo profiles' : 'Tennis universe · real contextual data'}</h2><p class="muted">${demoMode ? 'Synthetic identities with no rankings, actual revenue or contracts. They are not linked to any real athlete.' : 'The rankings below are historical and outdated. No commercial status or contract is verified. The country shown represents citizenship, not verified economic exposure.'}</p><div id="profile-results"></div></div>`;
  function filter() {
    const q = $('search').value.toLowerCase(), country = $('country').value;
    const matches = (text, id) => text.toLowerCase().includes(q) && (!country || profile(id)?.country === country);
    const items = state.opportunities.filter(o => matches(`${o.label} ${profileName(o.athleteId)} ${profile(o.athleteId)?.country ?? ''}`, o.athleteId));
    $('selection-count').textContent = comparison.size + ' cases selected (maximum 8)';
    $('opportunity-results').innerHTML = items.length ? table(['Compare', 'Case / file', 'Outlay', 'Final payment', 'Weighted NPV', 'Weighted MOIC', 'Diligence', 'Actions'], opportunityRows(items)) : empty('No matching cases', 'Create an independent case or open a profile below.');
    const profiles = directory.filter(a => matches(a.name + ' ' + a.country, a.id));
    $('profile-results').innerHTML = profiles.length ? table(['Athlete', 'Country', 'Birth date', 'Dated ranking', 'Source', 'Analysis'], profiles.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.country)}</td><td>${a.birthDate ?? '—'}</td><td>${a.historicalSinglesRanking ? `${a.historicalSinglesRanking.rank} · ${a.historicalSinglesRanking.asOf} (outdated)` : 'Unavailable'}</td><td>${a.revisionUrl ? `<a href="${a.revisionUrl}" target="_blank" rel="noreferrer">Revision ${a.sourceRevision}</a>` : 'FICTIONAL · no external source'}</td><td><button data-profile="${a.id}">New case</button></td></tr>`)) : empty('No matching profiles', 'Change your search or filter.');
  }
  $('search').oninput = filter; $('country').onchange = filter; filter();
}

const modelFields = [
  ['capital', 'Initial contractual capital (€)', 1, 1e9], ['upfrontFee', 'Upfront fees (€)', 0, 1e9],
  ['revenue', 'Year-one eligible revenue (€)', 0, 1e9], ['growth', 'Annual growth (%)', -99, 200],
  ['share', 'Assumed revenue share (%)', 0, 100], ['cap', 'Gross cap / capital (×)', 0, 100],
  ['cost', 'Annual distribution fees (€)', 0, 1e9], ['collectionRate', 'Entitlement collection rate (%)', 0, 100],
  ['years', 'Revenue horizon (years)', 1, 20], ['paymentDelay', 'Payment delay (years)', 0, 5],
  ['discount', 'Required return / discount rate (%)', 0, 200],
];
const percentageFields = ['growth', 'share', 'discount', 'collectionRate'];
function modelView() {
  const m = editor.model;
  $('content').innerHTML = `<div class="toolbar"><button data-action="new">+ New case</button><span class="meta-line">${editor.id ? 'Editing a saved case' : 'Unsaved case'} · EUR · ${editor.demo ? 'FICTIONAL DEMONSTRATION' : 'Analyst assumptions'}</span></div>
  <div class="grid"><div class="panel"><form id="model-form">
    <fieldset><legend>01 / Case & assumptions</legend><div class="form-grid">
      <label>Case label<input name="label" required maxlength="100" value="${esc(editor.label)}"></label>
      <label>Context profile<select name="athleteId"><option value="unassigned">Unassigned case — Tennis</option>${(demoMode ? DEMO_PROFILES : editor.demo ? allProfiles() : data.athletes).map(a => `<option value="${a.id}" ${a.id === editor.athleteId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="full">Assumption provenance / notes (no confidential data)<textarea name="note" maxlength="2000" placeholder="Revenue and terms provenance, items to confirm…">${esc(editor.note)}</textarea></label>
    </div></fieldset>
    <fieldset><legend>02 / Hypothetical contract economics</legend><div class="form-grid">${modelFields.map(([key, label, min, max]) => `<label>${label}<input type="number" name="${key}" min="${min}" max="${max}" step="${['years', 'paymentDelay'].includes(key) ? 1 : 'any'}" required value="${Number((m[key] * (percentageFields.includes(key) ? 100 : 1)).toPrecision(12))}"></label>`).join('')}</div></fieldset>
    <fieldset><legend>03 / Explicit scenarios</legend><p class="meta-line">Factor applied to annual revenue. Analyst-entered probabilities are not calibrated. Delay postpones payments without adding revenue years.</p>
      ${scenarioNames.map((s, i) => `<div class="scenario-inputs"><span>${s}</span><label>Revenue factor (×)<input name="m${i}" type="number" min="0" max="10" step="any" required value="${m.multipliers[i]}"></label><label>Probability (%)<input name="p${i}" type="number" min="0" max="100" step="any" required value="${Number((m.probabilities[i] * 100).toPrecision(12))}"></label></div>`).join('')}
    </fieldset><fieldset><legend>04 / Analyst-declared diligence</legend>
      ${[['contract', 'Contract terms and rights reviewed'], ['revenue', 'Revenue evidence reviewed'], ['counterparty', 'Counterparty and structure reviewed']].map(([id, text]) => `<label class="check"><input name="diligence-${id}" type="checkbox" ${editor.diligence[id] ? 'checked' : ''}>${text}</label>`).join('')}
      <p class="meta-line">These checkboxes record your declaration. Lake does not verify supporting documents; the checks do not change the economic score.</p>
    </fieldset><button class="primary" type="submit">Recalculate analysis</button><p id="dirty-note" class="meta-line"></p>
  </form></div><div class="panel sticky-analysis"><h2>Investment analysis</h2><div id="analysis-results"></div>
    <div class="toolbar"><button class="primary" id="save-opportunity">${editor.id ? 'Save changes' : 'Save case'}</button><button id="export-analysis">Export analysis JSON</button></div>
    <p class="meta-line">Present value is conditional on entered cash flows and the current investment amount. The cap depends on capital: this value is neither a maximum subscription price nor an athlete valuation.</p>
  </div></div><div class="panel" id="cashflow-results"></div><div class="panel" id="sensitivity-results"></div><div class="panel" id="dated-tool"></div>`;
  updateAnalysis(); datedTool();
  $('model-form').oninput = () => {
    dirty = true; editorUnsaved = true;
    $('save-opportunity').disabled = true; $('export-analysis').disabled = true;
    $('analysis-results').setAttribute('aria-label', 'Previous analysis — assumptions changed');
    $('dirty-note').textContent = 'Assumptions changed. Displayed results reflect the last calculation; recalculate before saving or exporting.';
  };
  $('model-form').onsubmit = event => {
    event.preventDefault();
    try {
      const d = new FormData(event.target), model = {};
      for (const [key] of modelFields) model[key] = Number(d.get(key)) / (percentageFields.includes(key) ? 100 : 1);
      model.probabilities = [0, 1, 2].map(i => Number(d.get('p' + i)) / 100);
      model.multipliers = [0, 1, 2].map(i => Number(d.get('m' + i)));
      normalizeModel(model);
      editor = {...editor, label: d.get('label').trim(), note: d.get('note').trim(), athleteId: d.get('athleteId'), model: normalizeModel(model), diligence: Object.fromEntries(['contract', 'revenue', 'counterparty'].map(k => [k, d.has('diligence-' + k)]))};
      if (!editor.label) throw Error('Label required');
      dirty = false; updateAnalysis(); $('dirty-note').textContent = 'Results are up to date. Save to keep this case.';
      message('Analysis recalculated. Probabilities remain assumptions.');
    } catch (error) { message(error.message, true); }
  };
  $('save-opportunity').onclick = saveOpportunity;
  $('export-analysis').onclick = () => {
    if (dirty) return;
    download('lake-analysis.json', analysisExport());
  };
}
function saveOpportunity() {
  if (dirty) return;
  const existing = state.opportunities.findIndex(o => o.id === editor.id);
  const record = {...structuredClone(editor), id: editor.id ?? uid(), createdAt: editor.createdAt ?? new Date().toISOString()};
  if (existing < 0 && state.opportunities.length >= 1000) return message('Maximum of 1,000 cases reached; export and delete cases before continuing.', true);
  if (existing >= 0) state.opportunities[existing] = record; else state.opportunities.push(record);
  editor = structuredClone(record); editorUnsaved = false; comparison.add(record.id);
  if (comparison.size > 8) comparison.delete(comparison.values().next().value);
  persist();
  $('save-opportunity').textContent = 'Save changes';
  $('dirty-note').textContent = 'Case saved in this session. Existing allocations retain their original assumptions.';
}
function analysisExport() {
  return {schemaVersion: 2, modelVersion: MODEL_VERSION, generatedAt: new Date().toISOString(), currency: 'EUR', hypothetical: true,
    dossier: {fictional: editor.demo === true || demoMode, label: editor.label, athleteId: editor.athleteId, note: editor.note, diligence: editor.diligence},
    source: {retrievedAt: data.retrievedAt, snapshotSha256: manifest.sha256, integrityVerified: integrity.verified, profileType: editor.athleteId.startsWith('demo-') ? 'synthetic fictional identity; no external source' : 'public identity context or unassigned', profile: profile(editor.athleteId) ?? null},
    assumptions: editor.model, analysis: analyze(editor.model), risk: risk(editor.model), sensitivity: sensitivity(editor.model),
    breakEvenRevenue: breakEvenRevenue(editor.model), exclusions: ['no athlete valuation', 'no verified financial performance', 'no predictive model', 'no taxes or FX', 'no terminal value']};
}
function updateAnalysis() {
  const a = analyze(editor.model), r = risk(editor.model), target = breakEvenRevenue(editor.model);
  $('analysis-results').removeAttribute('aria-label');
  $('analysis-results').innerHTML = `<div class="stats">${metric('Weighted NPV', money(a.expectedNpv), 'At the entered probabilities', a.expectedNpv < 0 ? 'negative' : 'positive')}${metric('Present value of cash flows', money(a.presentValue), 'At the current investment amount and cap')}${metric('Profitability index', multiple(a.profitabilityIndex), 'PV of cash flows / capital and fees')}${metric('Weighted MOIC', multiple(a.expectedMoic), 'Net distributions / outlay')}</div>
    ${scenarioChart(a.cases)}
    ${table(['Scenario', 'Net MOIC', 'Annual IRR', 'NPV', 'Payback'], a.cases.map((c, i) => `<tr><td>${scenarioNames[i]}</td><td>${multiple(c.moic)}</td><td>${pct(c.irr)}</td><td class="${c.npv < 0 ? 'negative' : 'positive'}">${money(c.npv)}</td><td>${c.payback === null ? 'Not reached' : 'Year ' + c.payback}</td></tr>`), 'No added principal repayment or terminal value. IRR is undefined without positive cash flows.')}
    <h3>Economic score : ${r.score.toFixed(1)} / 100</h3><small>Higher means riskier under the entered scenarios. This is not a credit or sporting risk rating.</small>
    <div class="risk-list">${r.components.map(c => `<small>${esc(c.name)} · ${pct(c.weight)} of score · ${c.value.toFixed(1)}/100</small><div class="bar"><span style="width:${c.value}%"></span></div>`).join('')}</div>
    <div class="flex split"><small>Weight of capital-loss scenarios</small><strong>${pct(a.lossProbability)}</strong></div>
    <div class="flex split"><small>Weighted capital loss in these scenarios</small><strong>${money(a.expectedLoss)}</strong></div>
    <div class="flex split"><small>Initial revenue for weighted NPV break-even</small><strong>${target === null ? 'Not reached within the model range' : money(target)}</strong></div>
    <p class="meta-line">Revenue threshold searched between €0 and €1bn, holding all other terms fixed. No threshold is asserted outside this range.</p>
    <div class="notice">Financial data not verified by Lake. Declared diligence: ${diligenceCount(editor)}/3. The score does not cover rights, default, injury or market liquidity.</div>`;
  $('cashflow-results').innerHTML = `<h2>Detailed distributions · base scenario</h2><p class="meta-line">At inception: ${money(-a.outlay)}, including ${money(editor.model.upfrontFee)} in fees. Gross entitlements consume the cap before collection and fees. No additional capital calls.</p>${table(['Revenue year', 'Payment year', 'Eligible revenue', 'Gross entitlements', 'Collection', 'Annual fees', 'Net distribution'], a.cases[1].rows.map(row => `<tr><td>${row.year}</td><td>${row.paymentYear}</td><td>${money(row.revenue)}</td><td>${money(row.entitlement)}</td><td>${money(row.collected)}</td><td>${money(row.fee)}</td><td>${money(row.distribution)}</td></tr>`))}`;
  const s = sensitivity(editor.model);
  const heatMax = Math.max(1, ...s.values.flat().map(Math.abs));
  $('sensitivity-results').innerHTML = `<h2>Weighted NPV sensitivity</h2><p class="muted">Each cell recalculates all cash flows, caps and scenarios. Rows: initial revenue variation. Columns: required return. All other terms held constant.</p><div class="heatmap">${table(['Initial revenue / rate', ...s.discountRates.map(pct)], s.revenueFactors.map((factor, i) => `<tr><th scope="row">${multiple(factor)}</th>${s.values[i].map(value => `<td style="--heat-color:${value >= 0 ? '#7dcdb0' : '#d29e8d'};--heat-level:${10 + 45 * Math.abs(value) / heatMax}%" class="${value >= 0 ? 'positive' : 'negative'}">${money(value)}</td>`).join('')}</tr>`), 'Model validation caps revenue at €1bn. Rates are bounded between 0 and 200%.')}</div>`;
  $('save-opportunity').disabled = false; $('export-analysis').disabled = false;
}
function datedTool() {
  $('dated-tool').innerHTML = `<details><summary>Independent dated cash-flow NPV / IRR (ACT/365)</summary><p class="muted">For an explicit schedule, independent of cases and portfolio. Dated IRR supports an initial outlay followed by non-negative distributions; non-conventional cash flows are rejected.</p><form id="dated-form" class="form-grid"><label>One date and cash flow per line (date ; EUR)<textarea id="dated-input" rows="5" required placeholder="2026-01-01 ; -100000&#10;2027-01-01 ; 60000&#10;2028-01-01 ; 60000"></textarea></label><div><label>Annual discount rate (%)<input id="dated-rate" type="number" min="0" max="200" step="any" value="15" required></label><button type="submit" style="margin-top:12px">Calculate dated cash flows</button><div id="dated-results" role="status"></div></div></form></details>`;
  $('dated-form').onsubmit = event => {
    event.preventDefault();
    try {
      const {flows, dates} = parseDatedFlows($('dated-input').value), rate = Number($('dated-rate').value) / 100;
      const value = xnpv(flows, dates, rate), result = xirr(flows, dates);
      $('dated-results').innerHTML = `<p>Dated NPV: <strong>${money(value)}</strong><br>Dated IRR: <strong>${pct(result)}</strong><br><small>Fixed ACT/365. No data saved.</small></p>`;
    } catch (error) { $('dated-results').textContent = error.message; }
  };
}

function selectedCases() { return state.opportunities.filter(o => comparison.has(o.id)); }
function comparisonView() {
  const items = selectedCases(), rows = compareOpportunities(items, compareSort, compareUseCommonRate ? {discountRate: compareRate} : {});
  $('content').innerHTML = `<div class="toolbar"><button data-view="opportunities">Select cases</button><label>Sort by<select id="compare-sort"><option value="npv">Weighted NPV, descending</option><option value="efficiency">Profitability index, descending</option><option value="downside">Downside multiple, descending</option><option value="risk">Economic score, ascending</option><option value="capital">Outlay, ascending</option></select></label><button id="export-comparison" ${!rows.length ? 'disabled' : ''}>Export comparison CSV</button></div>
    <div class="panel"><form id="common-rate-form" class="inline-form"><label class="check"><input id="common-rate-enabled" type="checkbox" ${compareUseCommonRate ? 'checked' : ''}>Compare at a common discount rate</label><label>Common rate (%)<input id="common-rate" type="number" min="0" max="200" step="any" required value="${compareRate * 100}"></label><button type="submit">Apply to comparison</button></form><p class="meta-line">${compareUseCommonRate ? 'NPVs and indices recalculated at the common rate. Saved models are unchanged.' : 'Each case uses its own required return. Enable a common rate to standardize discounting.'}</p></div>
    ${rows.length ? `<div class="panel"><h2>Weighted NPV · same-scale comparison</h2>${comparisonChart(rows)}<p class="meta-line">Central zero axis; negative values retained. ${compareUseCommonRate ? 'Common discount rate: ' + pct(compareRate) : 'Case-specific discount rates'}. Amounts are not observed returns.</p></div>` : ''}
    <div class="panel"><div class="flex split"><h2>${rows.length} independent cases selected</h2>${badge('NO OBSERVED RETURNS', 'warn')}</div>
      <p class="comparison-note">Horizons, rates, probabilities and terms may differ. A high NPV may simply reflect a larger investment amount. No ranking constitutes an automatic recommendation.</p>
      ${rows.length ? table(['Case', 'Outlay', 'Horizon + delay', 'Case / comparison rate', 'Weighted NPV', 'Profitability index', 'Weighted MOIC', 'Downside multiple', 'Base IRR', 'Economic score', 'Diligence', 'Actions'], rows.map(r => `<tr><td class="wrap"><button class="link-button" data-edit="${esc(r.id)}">${esc(r.label)}</button><br><small>${esc(profileName(r.athleteId))}</small></td><td>${money(r.analysis.outlay)}</td><td>${r.model.years} + ${r.model.paymentDelay} years</td><td>${pct(r.originalDiscount)} / ${pct(r.model.discount)}</td><td class="${r.analysis.expectedNpv < 0 ? 'negative' : 'positive'}">${money(r.analysis.expectedNpv)}</td><td>${multiple(r.analysis.profitabilityIndex)}</td><td>${multiple(r.analysis.expectedMoic)}</td><td>${multiple(r.analysis.cases[0].moic)}</td><td>${pct(r.analysis.cases[1].irr)}</td><td>${r.risk.score.toFixed(1)} /100</td><td>${diligenceCount(items.find(o => o.id === r.id))}/3</td><td><button class="small" data-unselect="${esc(r.id)}">Remove</button></td></tr>`)) : empty('Select saved cases', 'Save at least two cases, then select them in Opportunities & cases.')}
    </div>
    ${rows.length ? `<div class="grid equal">${rows.map(r => `<div class="panel"><h2>${esc(r.label)}</h2><p class="meta-line">${esc(profileName(r.athleteId))} · Factors ${r.model.multipliers.map(multiple).join(' / ')} · Probabilities ${r.model.probabilities.map(pct).join(' / ')}</p>${table(['Scenario', 'PV of cash flows', 'NPV', 'Multiple', 'IRR'], r.analysis.cases.map((c, i) => `<tr><td>${scenarioNames[i]}</td><td>${money(c.presentValue)}</td><td>${money(c.npv)}</td><td>${multiple(c.moic)}</td><td>${pct(c.irr)}</td></tr>`))}<p class="meta-line">${esc(items.find(o => o.id === r.id).note || 'Assumption provenance not supplied.')}</p><button data-allocate="${esc(r.id)}">Simulate allocation</button></div>`).join('')}</div>` : ''}`;
  $('common-rate-form').onsubmit = event => {
    event.preventDefault(); const rate = Number($('common-rate').value) / 100;
    if (!Number.isFinite(rate) || rate < 0 || rate > 2) return message('Invalid common rate.', true);
    compareRate = rate; compareUseCommonRate = $('common-rate-enabled').checked; comparisonView();
  };
  $('compare-sort').value = compareSort;
  $('compare-sort').onchange = event => { compareSort = event.target.value; comparisonView(); };
  $('export-comparison').onclick = () => {
    download('lake-comparison.csv', csv([
      ['case', 'profile', 'currency', 'assumptions', 'fictional', 'outlay', 'revenue_years', 'payment_delay', 'case_rate', 'comparison_rate', 'weighted_npv', 'profitability_index', 'weighted_multiple', 'downside_multiple', 'base_irr', 'economic_score'],
      ...rows.map(r => [r.label, profileName(r.athleteId), 'EUR', 'HYPOTHETICAL', items.find(o => o.id === r.id).demo === true, r.analysis.outlay, r.model.years, r.model.paymentDelay, r.originalDiscount, r.model.discount, r.analysis.expectedNpv, r.analysis.profitabilityIndex, r.analysis.expectedMoic, r.analysis.cases[0].moic, r.analysis.cases[1].irr ?? '', r.risk.score]),
    ]), 'text/csv;charset=utf-8');
  };
}

function portfolioView() {
  const p = portfolio(state.positions, state.budget, allProfiles());
  $('content').innerHTML = `<div class="toolbar"><form id="budget-form" class="inline-form"><label>Allocation budget (EUR)<input id="budget" type="number" min="1" max="10000000000" step="any" required value="${state.budget}"></label><button>Update</button></form><button id="export-report" class="primary">Export HTML report</button><button id="export-portfolio">Export portfolio JSON</button><label>Import JSON<input id="import-portfolio" type="file" accept="application/json,.json"></label></div>
    ${recovery ? '<div class="notice error">Existing backup not loaded: this session remains in memory. <button id="allow-save">Allow a new local backup</button></div>' : ''}
    <div class="stats">${metric('Committed capital + fees', money(p.invested))}${metric('Reserve', money(p.cash))}${metric('Total weighted NPV', money(p.expectedNpv), 'Case-specific discount rates')}${metric('Multiple on committed capital', p.invested ? multiple(p.expectedValue / p.invested) : '—', 'Weighted cash flows / capital and fees')}</div>
    <div class="panel"><div class="flex split"><h2>Simulated allocations · independent snapshots</h2>${badge(state.positions.length + ' positions', 'neutral')}</div>
      ${state.positions.length ? table(['Allocation / case', 'Capital + fees', 'Final payment', 'Weighted NPV', 'Committed weight', 'Action'], state.positions.map(position => {
        const m = position.model, a = analyze(m);
        return `<tr><td class="wrap">${esc(position.label)}<br><small>${esc(profileName(position.athleteId))}</small></td><td>${money(a.outlay)}</td><td>Year ${m.years + m.paymentDelay}</td><td>${money(a.expectedNpv)}</td><td>${pct(a.outlay / p.invested)}</td><td><button class="small" data-position="${esc(position.id)}">Open a copy</button> <button class="small danger" data-remove="${esc(position.id)}">Remove</button></td></tr>`;
      }), 'Editing a saved case never changes an allocation retroactively. Years align to a common simulation origin, not an actual transaction calendar.') : empty('Empty portfolio', 'Save a financial case, then use Allocate. The budget check includes upfront fees.')}
    </div>
    <div class="grid equal"><div class="panel"><h2>Concentration by athlete</h2>${exposures(p.byAthlete, profileName)}<div class="stats">${metric('HHI', p.hhi.toFixed(3), 'Sum of squared weights, from 0 to 1')}${metric('Effective names', p.effectiveNames.toFixed(2), 'Inverse of HHI')}${metric('Top-three weight', pct(p.topThree))}${metric('Largest isolated loss', money(p.largestNameCapital), 'Total-loss stress at initial cost')}</div><p class="meta-line">Unassigned cases are conservatively grouped together. No sporting diversification score: the scope is tennis only.</p></div><div class="panel"><h2>Contract maturities</h2>${exposures(p.byMaturity)}<h3>Biographical countries — context only</h3>${exposures(p.byCountry)}<p class="meta-line">Profile citizenship, not revenue location or verified contract jurisdiction. No conclusion about geographic economic exposure.</p></div></div>
    <div class="panel"><h2>Collection & payment stresses</h2>${table(['Independent stress', 'Total weighted NPV', 'Weighted distributions', 'Downside distributions'], portfolioStresses(state.positions, state.budget).map(s => `<tr><td class="wrap">${esc(s.label)}</td><td>${money(s.expectedNpv)}</td><td>${money(s.expectedDistributions)}</td><td>${money(s.downsideDistributions)}</td></tr>`), 'Deterministic shocks applied to entered terms, without estimated probabilities. Delays already at five years cannot increase within this range.')}</div>
    <div class="panel"><h2>Common stress & annual schedule</h2>${cashChart(p.annual)}
      ${p.annual.length ? table(['Payment year', ...scenarioNames, 'Weighted by case'], p.annual.map((row, i) => `<tr><td>${row.year}</td>${row.cases.map(c => `<td>${money(c)}</td>`).join('')}<td>${money(p.weightedFlows[i + 1] ?? 0)}</td></tr>`), 'Nominal amounts; reserve excluded. Probabilities may differ between cases: the weighted column does not describe a joint portfolio distribution.') : ''}
      <p class="meta-line">Cumulative cash flows: ${p.buckets.map((v, i) => `${scenarioNames[i]} ${money(v)}`).join(' · ')}. No VaR, volatility or correlation calculation without suitable data.</p>
    </div>`;
  $('budget-form').onsubmit = event => {
    event.preventDefault(); const budget = Number($('budget').value);
    if (!Number.isFinite(budget) || budget <= 0 || budget > 1e10 || budget + 1e-8 < p.invested) return message('Budget is invalid or below committed capital and fees.', true);
    state.budget = budget; persist(); render();
  };
  $('export-report').onclick = () => download(demoMode || [...state.opportunities, ...state.positions].some(o => o.demo) ? 'lake-investment-report-demo.html' : 'lake-investment-report.html', investmentReport(state, {profiles: data.athletes, sourceHash: manifest.sha256, demoSession: demoMode}), 'text/html;charset=utf-8');
  $('export-portfolio').onclick = () => download('lake-portfolio-v2.json', state);
  $('import-portfolio').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 2e6) throw Error('File too large (maximum 2 MB).');
      const next = parseState(await file.text(), ids());
      if (demoMode && [...next.opportunities, ...next.positions].some(o => o.demo !== true || (o.athleteId !== 'unassigned' && !DEMO_PROFILES.some(p => p.id === o.athleteId)))) throw Error('The demo session accepts only marked fictional cases with no links to real athletes. Exit the demo to import a working portfolio.');
      if (!confirm('Replace the cases and portfolio in this session with the validated file? Export first if needed.')) return;
      state = next; comparison.clear(); editor = newEditor(); dirty = false; editorUnsaved = false; persist(); render();
    } catch (error) { message('Import rejected: ' + error.message, true); }
  };
  if ($('allow-save')) $('allow-save').onclick = () => {
    if (!confirm('Replace the existing v2 backup with this session? The v1 backup is retained.')) return;
    recovery = false; persist(); render();
  };
}

function sources() {
  const audit = auditSnapshot(data);
  $('content').innerHTML = `<div class="stats">${metric('Tennis profiles', String(data.athletes.length), 'Public identities, not offers')}${metric('Integrity check', integrity.verified ? 'SHA-256 OK' : 'Not verified', integrity.verified ? 'Matches the local manifest' : integrity.reason)}${metric('Current performance', 'Unavailable', 'No live ranking or results feed')}${metric('Financial data', 'Unverified', 'Analyst assumptions only')}</div>
    <div class="panel"><h2>Source register & quality</h2><p class="muted">Collected ${data.retrievedAt}, reviewed ${data.reviewedAt}. Structured Wikidata data, CC0. Fixed revisions identify the values used. Reference counts do not prove accuracy.</p>
      ${table(['Profile / revision', 'Ranking age', 'Fields without source references', 'Current data', 'Financials'], audit.map(a => `<tr><td class="wrap"><a href="${a.revisionUrl}" target="_blank" rel="noreferrer">${esc(a.name)}<br>Revision ${a.revision}</a></td><td>${a.historicalRankAgeDays === null ? 'Missing' : `${a.historicalRankAgeDays} days — outdated`}</td><td class="wrap">${esc(a.unreferencedFields.join(', ') || 'None in audited fields')}</td><td>Missing</td><td>Unverified</td></tr>`), 'No historical ranking contributes to financial calculations or scores. Collection dates do not make historical observations current.')}
      <p class="meta-line">Exact file digest: <code>${manifest.sha256}</code>. This check detects changes inconsistent with the manifest; it is neither an external signature nor data certification.</p>
      <div class="toolbar"><a href="data/tennis.json">Snapshot JSON</a><a href="data/manifest.json">Manifest</a><a href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">Licensing policy</a><button id="export-audit">Export audit JSON</button></div>
    </div><div class="grid equal"><div class="panel"><h2>Financial rules 2.0</h2><p class="muted">Initial outlay = capital + upfront fees. Annual revenue = initial revenue × scenario factor × (1 + growth)^(year − 1). Gross entitlements are capped cumulatively, then collection rates apply and fees are limited to collected entitlements.</p><p class="muted">Upfront fees are included in NPV, IRR and multiples. Delay shifts distributions without extending revenue generation. Present value is conditional on the entered contract, not an athlete valuation.</p><p class="muted">Periodic IRR: year-end. Dated IRR: fixed ACT/365. Non-conventional cash flows are rejected to avoid ambiguous roots. No exit price or principal repayment is added.</p></div><div class="panel"><h2>Decision limitations</h2><p class="muted">No verified contracts, historical revenue, health data or recent performance. Analyst-selected probabilities; scenarios and scores are not calibrated. Taxes, foreign exchange, terminal value and structuring are not modeled.</p><p class="muted">Portfolio at simulated initial cost, not net asset value. HHI uses committed outlays. No execution, fundraising or investment offering.</p><p class="muted">Self-declared diligence only. Actual decisions require verified terms, data usage rights and appropriate legal and regulatory review.</p></div></div>
    <div class="panel"><h2>Storage & export</h2><p class="muted">Cases and allocations are stored locally in this browser. No server storage, authentication, collaboration or encryption. Legacy v1 portfolios are migrated without deleting the original. Exported JSON files are unencrypted.</p><p class="muted">If a backup is invalid, the empty session does not automatically overwrite it. Export your files and use only non-confidential data.</p></div>`;
  $('export-audit').onclick = () => download('lake-data-audit.json', {generatedAt: new Date().toISOString(), manifest, integrity, profiles: audit});
}

function demoBanner() {
  const root = $('demo-controls');
  if (!root) return;
  if (!demoMode) {
    root.innerHTML = [...state.opportunities, ...state.positions].some(o => o.demo) ? '<div class="notice">This session contains explicitly FICTIONAL cases. They remain marked in exported reports.</div>' : '';
    return;
  }
  root.innerHTML = `<div class="demo-banner"><strong>FICTIONAL DEMONSTRATION · NO REAL INVESTMENT</strong><p>Invented teaching assumptions and synthetic identities. In-memory session with no changes to your saved portfolio. Export before leaving if needed.</p><div class="demo-steps"><button data-action="demo-create" class="${view === 'model' ? 'active' : ''}">1 · Create case A</button><button data-view="compare" class="${view === 'compare' ? 'active' : ''}">2 · Compare A / B</button><button data-view="portfolio" class="${view === 'portfolio' ? 'active' : ''}">3 · Risk & report</button><button data-action="exit-demo" class="exit-demo">Exit demo</button></div></div>`;
}
async function startDemo() {
  if (demoMode || demoLoading) return;
  if ((dirty || editorUnsaved) && !confirm('Discard unsaved case changes and open the fictional demo?')) return;
  demoLoading = true;
  try {
  const response = await fetch('data/investor-demo.json');
  if (!response.ok) throw Error('Demo fixture unavailable');
  const fixture = await response.json();
  const next = parseState(JSON.stringify(demoSession(fixture)), ids());
  beforeDemo = {state: structuredClone(state), editor: structuredClone(editor), recovery, sessionUnsaved, editorUnsaved: editorUnsaved && !dirty, comparison: [...comparison], compareRate, compareUseCommonRate, compareSort, view};
  demoFixture = fixture; demoMode = true; compareRate = 0.15; compareUseCommonRate = false; compareSort = 'npv'; state = next; recovery = false; dirty = false; editorUnsaved = false; sessionUnsaved = false;
  comparison = new Set(next.opportunities.map(o => o.id)); editor = newEditor();
  $('storage-status').textContent = 'FICTIONAL DEMO · MEMORY ONLY';
  message('Demo opened. Fictional case B is ready; create A to start comparing.');
  switchView('dashboard', true);
  } finally { demoLoading = false; }
}
function exitDemo() {
  if (!demoMode || !beforeDemo) return;
  if (!confirm('Exit the fictional session? Unexported changes will be discarded. Your working portfolio will be restored.')) return;
  state = beforeDemo.state; editor = beforeDemo.editor; recovery = beforeDemo.recovery; sessionUnsaved = beforeDemo.sessionUnsaved;
  comparison = new Set(beforeDemo.comparison); compareRate = beforeDemo.compareRate; compareUseCommonRate = beforeDemo.compareUseCommonRate; compareSort = beforeDemo.compareSort; const previousView = beforeDemo.view, previousEditorUnsaved = beforeDemo.editorUnsaved;
  demoMode = false; demoFixture = null; beforeDemo = null; dirty = false; editorUnsaved = previousEditorUnsaved;
  $('storage-status').textContent = sessionUnsaved ? 'UNSAVED SESSION' : 'Working portfolio restored';
  message('Demo ended. Your working portfolio is restored without automatically saving.');
  switchView(previousView || 'dashboard', true);
}

// Delegated handlers keep all user-provided strings escaped at HTML boundaries.
document.addEventListener('click', event => {
  if (!data) return;
  try {
    const target = event.target.closest('button, a[data-view]'); if (!target) return;
    if (target.dataset.view) { event.preventDefault(); switchView(target.dataset.view); }
    if (target.dataset.action === 'start-demo') { startDemo().catch(error => message(error.message, true)); return; }
    if (target.dataset.action === 'exit-demo') { exitDemo(); return; }
    if (target.dataset.action === 'demo-create') { const saved = state.opportunities.find(o => o.demo && o.athleteId === 'demo-tennis-a'); openEditor(saved ?? {...structuredClone(demoFixture.opportunities[0]), id: null}); return; }
    if (target.dataset.action === 'new') openEditor(null);
    const byId = id => state.opportunities.find(o => o.id === id);
    if (target.dataset.edit) openEditor(byId(target.dataset.edit));
    if (target.dataset.profile) openEditor(null, target.dataset.profile);
    if (target.dataset.clone) {
      const original = byId(target.dataset.clone);
      openEditor({...structuredClone(original), id: null, createdAt: null, label: (original.label + ' — copy').slice(0, 100)});
    }
    if (target.dataset.allocate) allocate(byId(target.dataset.allocate));
    if (target.dataset.unselect) { comparison.delete(target.dataset.unselect); comparisonView(); }
    if (target.dataset.delete && confirm('Delete this case? Existing simulated allocations will be retained.')) {
      state.opportunities = state.opportunities.filter(o => o.id !== target.dataset.delete);
      comparison.delete(target.dataset.delete); persist(); render();
    }
    if (target.dataset.remove && confirm('Remove this simulated allocation from the portfolio?')) {
      state.positions = state.positions.filter(p => p.id !== target.dataset.remove); persist(); render();
    }
    if (target.dataset.position) {
      const p = state.positions.find(p => p.id === target.dataset.position);
      openEditor({...structuredClone(p), id: null, label: (p.label + ' — allocation copy').slice(0, 100), diligence: {contract: false, revenue: false, counterparty: false}});
    }
  } catch (error) { message(error.message, true); }
});
document.addEventListener('change', event => {
  const id = event.target.dataset.select; if (!id) return;
  if (event.target.checked && comparison.size >= 8) { event.target.checked = false; return message('Compare up to 8 cases at a time.', true); }
  event.target.checked ? comparison.add(id) : comparison.delete(id);
  if ($('selection-count')) $('selection-count').textContent = comparison.size + ' cases selected (maximum 8)';
});
window.addEventListener('beforeunload', event => { if (dirty || editorUnsaved || sessionUnsaved) { event.preventDefault(); event.returnValue = ''; } });
async function init() {
  try {
    const responses = await Promise.all([fetch('data/tennis.json'), fetch('data/manifest.json')]);
    if (responses.some(r => !r.ok)) throw Error('Source data unavailable');
    const text = await responses[0].text(); manifest = await responses[1].json();
    if (manifest.file !== 'tennis.json' || manifest.schemaVersion !== 2 || manifest.license !== 'CC0-1.0') throw Error('Invalid data manifest');
    integrity = await verifyDigest(text, manifest.sha256);
    data = validateSnapshot(JSON.parse(text));
    if (manifest.reviewedAt !== data.reviewedAt) throw Error('Inconsistent manifest date');
    const loaded = loadState(storage, ids()); state = loaded.state; recovery = loaded.recovery ?? false;
    $('snapshot-date').textContent = 'Snapshot reviewed on ' + data.reviewedAt;
    if (loaded.warning) message(loaded.warning, true);
    if (!integrity.verified) message(integrity.reason, true);
    switchView('home');
    if (new URLSearchParams(window.location?.search ?? '').get('demo') === '1') await startDemo().catch(error => message('Demo unavailable: ' + error.message, true));
  } catch (error) {
    data = null;
    $('content').textContent = 'Workspace not loaded: ' + error.message + '. Start the site over HTTP with npm start; check the files and manifest.';
    message('No calculations run on invalid data.', true);
  }
}
init();

