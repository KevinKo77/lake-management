import {POSITIONS, DEAL_TYPES, normalizeCandidate} from './engine/contract.js';
import {money, pct, esc, csv} from '../src/format.js';
import {decisionMemo} from './memo.js';
import {DISCLOSURES, dataStatus} from './disclosures.js';
import {makeSnapshot, compareSnapshots} from './compare.js';
import {SCHEMA, MAX_CANDIDATES, MAX_SNAPSHOTS, MAX_IMPORT_BYTES, NOT_APPLICABLE, canonicalScenario, canonicalCandidate, canonicalContext, inputsKey, uniqueId, displayPct, parsePct} from './scenario.js';
import {createDecisionState} from './decision-state.js';

const STORAGE_KEY = 'lanova-recruitment-v2';
// Optional ?searchBudget=N (1–2,000,000 nodes) for demonstrating and testing truncated searches.
const SEARCH_BUDGET = (() => { const n = Number(new URLSearchParams(location.search).get('searchBudget')); return Number.isInteger(n) && n >= 1 && n <= 2e6 ? n : undefined; })();
const $ = id => document.getElementById(id);

let scenario = null;   // {schema, fictional, label, context, candidates, modes}
let analysis = null;   // last ACCEPTED analysis, for display only; exports go through decision.exportable()
const decision = createDecisionState();
let timer = null, worker = null;

// ------------------------------------------------------------------ field definitions

const CLUB_FIELDS = [
  ['objective', 'Objective', 'select', [['blended', 'NPV + value of points'], ['npv', 'Financial NPV only'], ['points', 'Maximise expected points'], ['downside', 'Maximise downside NPV']]],
  ['valuePerPoint', 'Value per expected league point (€)', 'money'],
  ['horizon', 'Planning horizon (seasons)', 'select', [1, 2, 3, 4, 5, 6].map(n => [n, String(n)])],
  ['discountRate', 'Discount rate (%)', 'pct'],
  ['transferBudget', 'Transfer budget this window (€)', 'money'],
  ['openingCash', 'Opening cash (€)', 'money'],
  ['minCash', 'Operating cash floor, downside (€)', 'money'],
  ['protectedReserve', 'Protected cash reserve (€, ring-fenced)', 'money'],
  ['lifetimeCapital', 'Lifetime capital for commitments (€, optional)', 'moneyOpt'],
  ['maxDownsideLoss', 'Maximum downside NPV loss (€, optional)', 'moneyOpt'],
  ['minPortfolioNpv', 'Minimum portfolio NPV (€, optional)', 'moneyOpt'],
  ['currentSquadSize', 'Current registered squad', 'int'],
  ['maxSquadSize', 'Maximum registered squad', 'int'],
  ['currentNonEU', 'Current non-EU players', 'int'],
  ['maxNonEU', 'Non-EU slots', 'int'],
  ['maxSignings', 'Maximum signings', 'int'],
  ['samePositionFactor', 'Second signing at a position counts (%)', 'pct'],
  ['stress.resaleHaircut', 'Downside resale haircut (%)', 'pct'],
  ['stress.revenueHaircut', 'Downside revenue haircut (%)', 'pct'],
  ['stress.upsideResale', 'Upside resale uplift (%)', 'pct'],
  ['stress.upsideRevenue', 'Upside revenue uplift (%)', 'pct'],
];
const SEASON_FIELDS = [
  ['squadCostLimit', 'Squad-cost limit — entered by you, not an official league calculation'],
  ['committedSquadCost', 'Committed squad cost (existing players)'],
  ['operatingCashFlow', 'Club operating cash flow (excl. signings)'],
];
const CANDIDATE_FIELDS = [
  ['name', 'Name', 'text'], ['position', 'Pos', 'select', POSITIONS], ['dealType', 'Deal', 'select', DEAL_TYPES], ['nonEU', 'Non-EU', 'checkbox'],
  ['fee', 'Fee / loan fee €', 'money'], ['instalments', 'Instalments %', 'instalments'], ['agentFee', 'Agent fee €', 'money'], ['signingBonus', 'Signing bonus €', 'money'],
  ['contractYears', 'Years', 'int'], ['wage', 'Wage / season €', 'money'], ['wageGrowth', 'Wage growth %', 'pct'], ['wageShare', 'Loan wage share %', 'pct'],
  ['bonusExpected', 'Expected bonus €', 'money'], ['revenue', 'Revenue / season €', 'money'], ['points', 'Points / season (analyst estimate)', 'num'],
  ['exitSeason', 'Exit season', 'int'], ['exitValue', 'Exit value €', 'money'], ['exitValueDownside', 'Downside exit €', 'moneyOpt'], ['exitValueUpside', 'Upside exit €', 'moneyOpt'],
  ['sellOnPct', 'Sell-on % (of profit)', 'pct'], ['saleCostPct', 'Sale cost %', 'pct'],
  ['signingBonusOnExit', 'Unpaid signing bonus if leaving early', 'select', ['payable', 'lapses']], ['releaseCompensationPct', 'Release payout % of remaining wages', 'pct'], ['group', 'Option group', 'text'],
];

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, value) => { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; };

function display(kind, value) {
  if (value === null || value === undefined) return '';
  if (kind === 'pct') return displayPct(value);
  if (kind === 'instalments') return value.map(displayPct).join('/');
  return String(value);
}
function parse(kind, raw) {
  const text = String(raw).trim();
  if (kind === 'text') return text;
  if (kind === 'moneyOpt') return text === '' ? null : Number(text);
  if (kind === 'instalments') return text === '' ? [1] : text.split('/').map(x => parsePct(x));
  if (text === '') return NaN;
  if (kind === 'pct') return parsePct(text);
  return Number(text);
}
const inputAttrs = kind => kind === 'money' || kind === 'moneyOpt' ? 'type="number" step="10000" inputmode="decimal"' : kind === 'pct' ? 'type="number" step="0.5"' : kind === 'int' ? 'type="number" step="1"' : kind === 'num' ? 'type="number" step="0.1"' : 'type="text"';

// ------------------------------------------------------------------ status & storage

function status(text, error = false) { const el = $('status'); el.textContent = text; el.classList.toggle('error', error); }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario)); } catch { status('Could not save to this browser — export the scenario (JSON) to keep your changes.', true); }
}
function load() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? canonicalScenario(JSON.parse(raw)) : null; } catch { return null; }
}
async function demoScenario() {
  const response = await fetch('data/demo-club.json');
  if (!response.ok) throw new Error('Demo data unavailable');
  const d = await response.json();
  return canonicalScenario({schema: SCHEMA, fictional: true, label: d.label, context: d.context, candidates: d.candidates, modes: {}});
}

// ------------------------------------------------------------------ input forms

function renderDisclosures() {
  $('data-status').textContent = dataStatus(scenario.fictional);
  $('disclosure-list').innerHTML = DISCLOSURES.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

function renderClub() {
  renderDisclosures();
  const ctx = scenario.context;
  const field = ([key, label, kind, options]) => kind === 'select'
    ? `<label>${esc(label)}<select data-club="${key}" data-kind="${kind}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(getPath(ctx, key)) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
    : `<label>${esc(label)}<input data-club="${key}" data-kind="${kind}" ${inputAttrs(kind)} value="${esc(display(kind, getPath(ctx, key)))}"></label>`;
  const needs = `<fieldset><legend>Minimum signings by position</legend>${POSITIONS.map(p => `<label>${p}<input data-need="${p}" type="number" min="0" max="10" step="1" value="${ctx.positionNeeds?.[p] ?? 0}"></label>`).join('')}</fieldset>`;
  $('club').innerHTML = CLUB_FIELDS.map(field).join('') + needs;
  renderSeasons();
}
function renderSeasons() {
  const ctx = scenario.context, H = ctx.horizon;
  $('seasons').innerHTML = `<tr><th>Per season (€)</th>${Array.from({length: H}, (_, s) => `<th class="num">Season ${s + 1}</th>`).join('')}</tr>` +
    SEASON_FIELDS.map(([key, label]) => `<tr><td>${esc(label)}</td>${Array.from({length: H}, (_, s) => `<td><input data-season="${key}" data-index="${s}" type="number" step="50000" value="${esc(ctx[key]?.[s] ?? 0)}"></td>`).join('')}</tr>`).join('');
}
function resizeSeasons(H) {
  for (const [key] of SEASON_FIELDS) {
    const v = scenario.context[key];
    const arr = Array.isArray(v) ? v : Array(H).fill(v ?? 0);
    scenario.context[key] = Array.from({length: H}, (_, s) => arr[s] ?? arr[arr.length - 1] ?? 0);
  }
}
function renderCandidates() {
  const head = `<tr><th>Plan</th>${CANDIDATE_FIELDS.map(([, label]) => `<th>${esc(label)}</th>`).join('')}<th>Check</th><th></th></tr>`;
  const rows = scenario.candidates.map((c, i) => {
    const mode = scenario.modes[c.id] ?? 'optimise';
    const cells = CANDIDATE_FIELDS.map(([key, label, kind, options]) => {
      const aria = `aria-label="${esc(label)} — ${esc(c.name)}"`;
      if (kind === 'select') return `<td><select data-row="${i}" data-key="${key}" data-kind="${kind}" ${aria}>${options.map(o => `<option ${c[key] === o || (key === 'dealType' && !c[key] && o === 'permanent') ? 'selected' : ''}>${o}</option>`).join('')}</select></td>`;
      if (kind === 'checkbox') return `<td><input type="checkbox" data-row="${i}" data-key="${key}" data-kind="${kind}" ${aria} ${c[key] ? 'checked' : ''}></td>`;
      const fallback = {instalments: [1], exitSeason: c.contractYears, wageShare: 1, releaseCompensationPct: 1}[key];
      return `<td><input class="${key === 'name' ? 'name' : ''}" data-row="${i}" data-key="${key}" data-kind="${kind}" ${inputAttrs(kind)} ${aria} value="${esc(display(kind, c[key] ?? fallback ?? (kind === 'text' || kind === 'moneyOpt' ? '' : 0)))}"></td>`;
    }).join('');
    return `<tr data-id="${esc(c.id)}"><td><select data-mode="${esc(c.id)}" aria-label="Plan for ${esc(c.name)}"><option value="optimise" ${mode === 'optimise' ? 'selected' : ''}>Optimise</option><option value="must" ${mode === 'must' ? 'selected' : ''}>Must sign</option><option value="exclude" ${mode === 'exclude' ? 'selected' : ''}>Exclude</option></select></td>${cells}<td class="check small" data-check="${i}"></td><td><button type="button" class="mini secondary" data-dup="${i}">Duplicate</button> <button type="button" class="mini ghost" data-del="${i}">Remove</button></td></tr>`;
  }).join('');
  $('candidates').innerHTML = head + rows;
  renderEconSelect();
}

function validateRows() {
  let ok = true;
  scenario.candidates.forEach((c, i) => {
    const cell = document.querySelector(`[data-check="${i}"]`);
    try { normalizeCandidate(c); if (cell) { cell.textContent = '✓'; cell.className = 'check small pos'; } }
    catch (error) { ok = false; if (cell) { cell.textContent = error.message.replace(/^[^:]+: /, ''); cell.className = 'check small neg'; } }
  });
  return ok;
}

// ------------------------------------------------------------------ analysis

/** Any edit: the current decision and any pending worker result become invalid immediately. */
function invalidate() {
  decision.invalidate();
  setDecisionState('stale');
}
function schedule() {
  invalidate();
  clearTimeout(timer);
  timer = setTimeout(run, 200);
}
/** fresh: accepted result matches the inputs; stale: recalculating; invalid: inputs cannot be optimised. */
function setDecisionState(state, message = '') {
  document.body.dataset.decision = state;
  for (const id of ['export-memo', 'export-csv']) $(id).disabled = state !== 'fresh';
  $('stale-banner').hidden = state === 'fresh';
  $('stale-banner').textContent = state === 'invalid'
    ? `Inputs are invalid — the results below are OUT OF DATE and decision exports are disabled. ${message}`
    : 'Inputs changed — recalculating. The results below are out of date until the new run completes; decision exports are disabled.';
}
/** Replace raw edited values with the canonical ones the engine uses, without disturbing the field being typed in. */
function syncDisplayedValues() {
  scenario.candidates.forEach((c, i) => {
    const off = NOT_APPLICABLE[c.dealType] ?? [];
    for (const el of document.querySelectorAll(`[data-row="${i}"][data-key]`)) {
      const key = el.dataset.key, kind = el.dataset.kind;
      el.disabled = off.includes(key);
      if (el === document.activeElement) continue;
      if (kind === 'checkbox') el.checked = Boolean(c[key]);
      else el.value = kind === 'select' ? c[key] : display(kind, c[key]);
    }
  });
  for (const el of document.querySelectorAll('[data-club]')) {
    if (el === document.activeElement) continue;
    const v = el.dataset.club.split('.').reduce((o, k) => o?.[k], scenario.context);
    el.value = el.dataset.kind === 'select' ? String(v) : display(el.dataset.kind, v);
  }
}
function run() {
  save();
  let context;
  try { context = canonicalContext(scenario.context); } catch (error) { decision.invalidate(); setDecisionState('invalid', error.message); status(error.message, true); return; }
  if (!validateRows()) { decision.invalidate(); setDecisionState('invalid', 'Fix the highlighted candidate inputs.'); status('Fix the highlighted candidate inputs to re-run the optimisation.', true); return; }
  if (!scenario.candidates.length) { decision.invalidate(); setDecisionState('invalid', 'Add at least one candidate.'); status('Add at least one candidate.', true); return; }
  try {
    const canonical = canonicalScenario({...scenario, schema: SCHEMA});
    scenario.context = canonical.context; scenario.candidates = canonical.candidates; scenario.modes = canonical.modes;
  } catch (error) { decision.invalidate(); setDecisionState('invalid', error.message); status(error.message, true); return; }
  context = scenario.context;
  syncDisplayedValues();
  save();
  const forceInclude = scenario.candidates.filter(c => scenario.modes[c.id] === 'must').map(c => c.id);
  const forceExclude = scenario.candidates.filter(c => scenario.modes[c.id] === 'exclude').map(c => c.id);
  const message = {seq: decision.submit(inputsKey(scenario)), candidates: scenario.candidates, context, forceInclude, forceExclude, nodeLimit: SEARCH_BUDGET};
  status('Optimising…');
  if (worker) worker.postMessage(message);
  else import('./engine/analysis.js').then(m => receive({seq: message.seq, analysis: m.analyse(message.candidates, context, {forceInclude, forceExclude, money, nodeLimit: SEARCH_BUDGET})})).catch(error => receive({seq: message.seq, error: error.message}));
}
function receive({seq: got, analysis: a, error}) {
  const outcome = decision.receive(got, a, error);
  if (outcome === 'stale') return; // superseded by a later edit or run: never displayed, never exportable
  if (outcome === 'error') { setDecisionState('invalid', error); status(error, true); return; }
  analysis = a;
  setDecisionState('fresh');
  const r = a.result;
  $('status').dataset.run = String(got); // completed-run counter, used by browser tests
  status(`Evaluated ${r.searchSpace.toLocaleString('en-GB')} possible portfolios (${r.nodes.toLocaleString('en-GB')} explored after pruning) in ${r.milliseconds} ms.`);
  renderResults();
  renderComparisons();
}

// ------------------------------------------------------------------ results

const MONEY_IDS = ['transferBudget', 'squadCost', 'cashFloor', 'minNpv', 'lifetimeCapital', 'maxLoss'];
const nameOf = id => scenario.candidates.find(c => c.id === id)?.name ?? id;
const objText = v => analysis.context.objective === 'points' ? `${v.toFixed(1)} pts` : money(v);
const signed = v => `<span class="${v < -1e-6 ? 'neg' : v > 1e-6 ? 'pos' : ''}">${objText(v)}</span>`;
const kpi = (value, label) => `<div class="kpi"><b>${value}</b><span>${esc(label)}</span></div>`;

function renderResults() {
  const a = analysis, best = a.result.best, ctx = a.context;
  $('summary').textContent = a.summary;
  $('warnings').innerHTML = (a.warnings ?? []).map(w => `<div class="verdict bad"><b>Not proven optimal.</b> ${esc(w)}</div>`).join('');
  $('proof').textContent = !best ? 'No feasible portfolio' : a.result.provenOptimal ? 'Proven optimal' : 'Search budget reached';
  $('proof').className = 'badge ' + (best && a.result.provenOptimal ? 'good' : 'warn');
  if (!best) {
    for (const id of ['chips', 'kpis', 'marginals', 'binding', 'shadow', 'exclusions', 'alternatives', 'baseline', 'headroom']) $(id).innerHTML = '';
    if (a.mustSignDiagnosis) {
      // Must-sign players are the cause: explain them, never the empty portfolio.
      $('kpis').innerHTML = `<div class="verdict bad"><b>Why the must-sign ${a.mustSignDiagnosis.mustSign.length > 1 ? 'players make' : 'player makes'} every portfolio infeasible${a.mustSignDiagnosis.proven ? ' (proven by a complete search)' : ' (search budget reached — not proven)'}:</b><ul>${a.mustSignDiagnosis.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>Set ${a.mustSignDiagnosis.mustSign.length > 1 ? 'them' : 'the player'} back to Optimise to see the best feasible portfolio.</div>`;
    } else {
      const v = a.noSigningEvaluation?.violations ?? [];
      $('kpis').innerHTML = `<div class="verdict bad">Even signing nobody breaches: ${esc(v.map(x => x.label + (x.season !== null ? ' (' + x.season + ')' : '')).join('; ') || 'a position need')}.</div>`;
    }
    renderEcon();
    return;
  }
  $('chips').innerHTML = best.selection.length ? best.selection.map(id => `<span class="chip">${esc(nameOf(id))}</span>`).join('') : '<span class="chip">No signing</span>';
  const minCash = Math.min(...best.cashDownside);
  $('kpis').innerHTML = [
    kpi(objText(best.objective.primary), {npv: 'Objective: base NPV', blended: 'Objective: NPV + value of points', points: 'Objective: squad-adjusted points', downside: 'Objective: downside NPV'}[ctx.objective]),
    kpi(money(best.npv), 'Base-case NPV of signings'),
    kpi(money(best.npvDownside), 'Downside NPV of signings'),
    kpi(money(best.npvUpside), 'Upside NPV of signings'),
    kpi((best.pointsBySeason[0] ?? 0).toFixed(1), 'Expected points added, season 1 (analyst estimates)'),
    kpi(money(minCash), `Lowest downside cash (floor ${money(best.cashFloor)}${ctx.protectedReserve ? ' incl. reserve' : ''})`),
  ].join('');

  $('marginals').innerHTML = `<tr><th>Player</th><th class="num">Marginal value</th><th class="num">NPV</th><th class="num">Points/season</th><th>If removed</th></tr>` +
    a.marginals.map(m => { const e = a.economics.find(x => x.id === m.id); return `<tr><td>${esc(nameOf(m.id))}</td><td class="num">${signed(m.marginal)}</td><td class="num">${money(e.npv)}</td><td class="num">${e.candidate.points}</td><td class="small">${esc(m.removalBreaks.join('; ') || '—')}</td></tr>`; }).join('');
  $('binding').innerHTML = a.binding.length ? a.binding.map(u => `<li>${esc(u.label)}${u.season !== null ? ` — ${u.id === 'cashFloor' ? 't=' : 'season '}${u.season}` : ''}: ${['transferBudget', 'squadCost', 'cashFloor', 'minNpv'].includes(u.id) ? `${money(u.used)} of ${money(u.limit)}` : `${u.used} of ${u.limit}`}</li>`).join('') : '<li class="muted">No limit is within 2% of its edge.</li>';
  $('shadow').innerHTML = `<tr><th>If the club had…</th><th class="num">Objective change</th><th>Optimal selection</th></tr>` +
    a.shadowPrices.map(s => `<tr><td>${esc(s.label)}</td><td class="num">${s.delta === null ? `<span class="muted">${esc(s.unavailable ? 'not computable' : 'n/a')}</span>` : signed(s.delta)}</td><td class="small">${esc(s.selection.map(nameOf).join(', ') || '—')}</td></tr>`).join('');
  $('exclusions').innerHTML = a.exclusions.map(x => `<li><b>${esc(nameOf(x.id))}.</b> ${esc(x.text)}</li>`).join('') || '<li class="muted">Every candidate is in the recommendation.</li>';

  $('alternatives').innerHTML = `<tr><th>#</th><th>Portfolio</th><th class="num">Objective</th><th class="num">vs best</th><th class="num">Downside NPV</th></tr>` +
    a.result.alternatives.map((alt, i) => `<tr class="${i === 0 ? 'picked' : ''}"><td>${i + 1}</td><td class="small">${esc(alt.selection.map(nameOf).join(' + ') || 'No signing')}</td><td class="num">${objText(alt.objective.primary)}</td><td class="num">${i ? signed(alt.objective.primary - best.objective.primary) : '—'}</td><td class="num">${money(alt.npvDownside)}</td></tr>`).join('');

  const verdict = (pick, v) => `<p>Pick: <b>${esc(pick.map(nameOf).join(', ') || 'no signing')}</b></p>` + (v.baselineFeasible
    ? `<div class="verdict ok">Feasible under the full model. The optimizer ${v.objectiveGain > 1e-6 ? `improves the objective by <b>${objText(v.objectiveGain)}</b>` : 'reaches the <b>same objective</b>'} (NPV ${money(v.npvGain)}, points over the stay ${v.pointsGain >= 0 ? '+' : ''}${v.pointsGain.toFixed(1)}).</div>`
    : `<div class="verdict bad">Looks affordable in the simpler model but breaches: <ul>${v.baselineViolations.map(x => `<li>${esc(x.label)}${x.season !== null ? ` (${x.id === 'cashFloor' ? 't=' : 'season '}${x.season})` : ''}: ${MONEY_IDS.includes(x.id) ? `${money(x.used)} vs ${money(x.limit)}` : `${x.used} vs ${x.limit}`}</li>`).join('')}</ul></div>`);
  $('baseline').innerHTML = verdict(a.baseline.selection, a.versusBaseline);
  $('baseline-rules').innerHTML = a.baseline.rules.map(r => `<li>${esc(r)}</li>`).join('');
  $('solver-baseline').innerHTML = a.versusSolver.available ? verdict(a.solverBaseline.selection, a.versusSolver) : `<p class="muted">${esc(a.versusSolver.reason)}.</p>`;
  $('solver-rules').innerHTML = (a.solverBaseline.rules ?? []).map(r => `<li>${esc(r)}</li>`).join('');

  const H = ctx.horizon;
  const cols = Array.from({length: H + 1}, (_, t) => t);
  $('headroom').innerHTML = `<tr><th></th>${cols.map(t => `<th class="num">${t === 0 ? 'Signing (t=0)' : `End season ${t}`}</th>`).join('')}</tr>` +
    `<tr><td>Upfront outlay / transfer budget</td><td class="num">${money(best.upfront)} / ${money(ctx.transferBudget)}</td>${cols.slice(1).map(() => '<td></td>').join('')}</tr>` +
    `<tr><td>Squad cost / limit</td><td></td>${cols.slice(1).map(t => `<td class="num">${money(best.squadCost[t - 1])} / ${money(ctx.squadCostLimit[t - 1])}</td>`).join('')}</tr>` +
    `<tr><td>Squad-cost headroom</td><td></td>${cols.slice(1).map(t => { const h = ctx.squadCostLimit[t - 1] - best.squadCost[t - 1]; return `<td class="num ${h < 0.05 * ctx.squadCostLimit[t - 1] ? 'warnc' : ''}">${money(h)}</td>`; }).join('')}</tr>` +
    `<tr><td>Cash, base case</td>${cols.map(t => `<td class="num">${money(best.cashBase[t])}</td>`).join('')}</tr>` +
    `<tr><td>Cash, upside</td>${cols.map(t => `<td class="num">${money(best.cashUpside[t])}</td>`).join('')}</tr>` +
    `<tr><td>Cash, downside (floor ${money(best.cashFloor)}${ctx.protectedReserve ? `, of which ${money(ctx.protectedReserve)} protected reserve` : ''})</td>${cols.map(t => `<td class="num ${best.cashDownside[t] - best.cashFloor < 0.1 * Math.max(1, Math.abs(best.cashFloor)) ? 'warnc' : ''}">${money(best.cashDownside[t])}</td>`).join('')}</tr>` +
    (ctx.lifetimeCapital !== null ? `<tr><td>Gross commitments / lifetime capital less reserve</td><td class="num" colspan="${H + 1}">${money(best.grossCommitment)} / ${money(ctx.lifetimeCapital - ctx.protectedReserve)}</td></tr>` : '') +
    (ctx.maxDownsideLoss !== null ? `<tr><td>Downside NPV / maximum loss</td><td class="num" colspan="${H + 1}">${money(best.npvDownside)} / −${money(ctx.maxDownsideLoss)}</td></tr>` : '') +
    (best.beyondHorizonSquadCost > 0 ? `<tr><td colspan="${H + 2}" class="small warnc">Commitments continue beyond the planning horizon: ${money(best.beyondHorizonSquadCost)} of squad cost after season ${H} is not checked against a limit.</td></tr>` : '');
  renderEcon();
}

function renderComparisons() {
  const saved = scenario.snapshots ?? [];
  $('snapshot-save').disabled = saved.length >= MAX_SNAPSHOTS;
  if (!saved.length) { $('compare').innerHTML = '<tr><td class="muted">No saved scenarios yet. Save the current inputs, change assumptions, and compare.</td></tr>'; return; }
  const columns = compareSnapshots([makeSnapshot(scenario, 'Current inputs'), ...saved]);
  const head = `<tr><th></th>${columns.map((c, i) => `<th>${esc(c.label)}${i ? `<br><span class="small muted">${esc(c.savedAt.slice(0, 16).replace('T', ' '))}</span><br><button type="button" class="mini secondary" data-restore="${i - 1}">Restore</button> <button type="button" class="mini ghost" data-forget="${i - 1}">Remove</button>` : ''}</th>`).join('')}</tr>`;
  const val = (c, f) => c.error ? `<span class="neg">${esc(c.error)}</span>` : f(c);
  const m = v => (v === null ? '—' : money(v));
  const rows = [
    ['Recommendation', c => c.feasible ? esc(c.selection.join(', ') || 'No signing') : '<span class="neg">No feasible portfolio</span>'],
    ['Objective', c => esc({npv: 'Base NPV', blended: 'NPV + value of points', points: 'Points', downside: 'Downside NPV'}[c.objective])],
    ['Objective value', c => c.objectiveValue === null ? '—' : c.objective === 'points' ? c.objectiveValue.toFixed(1) + ' pts' : money(c.objectiveValue)],
    ['Base NPV', c => m(c.npv)], ['Downside NPV', c => m(c.npvDownside)], ['Upside NPV', c => m(c.npvUpside)],
    ['Expected points, season 1', c => c.pointsSeason1.toFixed(1)],
    ['Lowest downside cash / floor', c => `${m(c.lowestDownsideCash)} / ${money(c.cashFloor)}`],
    ['Upfront / transfer budget', c => `${m(c.upfront)} / ${money(c.transferBudget)}`],
    ['Gross commitments / capital room', c => `${m(c.grossCommitment)} / ${c.capitalRoom === null ? 'no limit' : money(c.capitalRoom)}`],
    ['Maximum downside loss', c => c.maxDownsideLoss === null ? 'no limit' : money(c.maxDownsideLoss)],
    ['Limits at their edge', c => esc(c.binding.join('; ') || '—')],
    ['Inputs changed vs current', c => c.changes.length ? `<ul class="plain small">${c.changes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '—'],
  ];
  $('compare').innerHTML = head + rows.map(([label, f]) => `<tr><td>${esc(label)}</td>${columns.map(c => `<td class="small">${val(c, f)}</td>`).join('')}</tr>`).join('');
}

function renderEconSelect() {
  const current = $('econ-select').value;
  $('econ-select').innerHTML = scenario.candidates.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  if (scenario.candidates.some(c => c.id === current)) $('econ-select').value = current;
}
function renderEcon() {
  const e = analysis?.economics.find(x => x.id === $('econ-select').value);
  if (!e) { $('econ').innerHTML = '<tr><td class="muted">Select a valid candidate.</td></tr>'; return; }
  const T = e.T, o = e.components.outflows, inn = e.components.inflows;
  const row = (label, values, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td>${values.map(v => `<td class="num ${v < -0.5 ? 'neg' : ''}">${v === null ? '' : Math.abs(v) < 0.5 ? '<span class="muted">·</span>' : money(v)}</td>`).join('')}</tr>`;
  const t = Array.from({length: T + 1}, (_, i) => i);
  const acc = arr => [null, ...arr];
  $('econ').innerHTML = `<tr><th>Cash (− paid, + received)</th>${t.map(i => `<th class="num">t=${i}</th>`).join('')}</tr>` +
    row('Transfer / loan fee', t.map(i => -o.fee[i])) + row('Agent fee', t.map(i => -o.agent[i])) + row('Signing bonus', t.map(i => -o.signing[i])) +
    row('Wages', t.map(i => -o.wages[i])) + row('Expected bonuses', t.map(i => -o.bonus[i])) + row('Attributable revenue', t.map(i => inn.revenue[i])) +
    row('Sale proceeds (net of sell-on and costs)', t.map(i => inn.sale[i])) + row('Obligations on early exit (unpaid bonus, release payout)', t.map(i => -o.exit[i])) + row('Net cash, base', e.cash.base) + row('Net cash, downside', e.cash.downside) +
    `<tr><th>Accounting (by season)</th>${t.map(i => `<th class="num">${i ? `Season ${i}` : ''}</th>`).join('')}</tr>` +
    row('Amortisation of fee + agent', acc(e.amortisation)) + row('Squad cost (wages, bonuses, amortisation)', acc(e.squadCost)) + row('P&L impact, base', acc(e.pnl)) +
    `<tr><td colspan="${T + 2}" class="small muted">NPV base ${money(e.npv)} · downside ${money(e.npvDownside)} · capitalised ${money(e.capitalised)} · net book value at exit ${money(e.netBookValueAtExit)} · profit on disposal ${money(e.sale.profitOnDisposal)}${e.sale.writeOff ? ` · write-off ${money(e.sale.writeOff)}` : ''}</td></tr>`;
}

// ------------------------------------------------------------------ exports

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function auditCsv(a) {
  const rows = [[dataStatus(scenario.fictional)], ...DISCLOSURES.map(([k, v]) => [k, v]), ['Beta', 'LANOVA Recruitment Optimizer V2 (beta)'], ['Engine', a.engineVersion, 'Generated', a.generatedAt], [],
    ['Candidate', 't', 'Fee', 'Agent', 'Signing bonus', 'Wages', 'Bonuses', 'Revenue', 'Sale net', 'Exit obligations', 'Net cash base', 'Net cash downside', 'Net cash upside', 'Season', 'Amortisation', 'Squad cost', 'P&L base']];
  for (const e of a.economics) {
    const o = e.components.outflows, inn = e.components.inflows;
    for (let t = 0; t <= e.T; t++) rows.push([e.candidate.name, t, -o.fee[t], -o.agent[t], -o.signing[t], -o.wages[t], -o.bonus[t], inn.revenue[t], inn.sale[t], -o.exit[t], e.cash.base[t], e.cash.downside[t], e.cash.upside[t], t || '', t ? e.amortisation[t - 1] : '', t ? e.squadCost[t - 1] : '', t ? e.pnl[t - 1] : '']);
  }
  const best = a.result.best;
  if (best) {
    rows.push([], ['Recommended portfolio', ...best.selection.map(nameOf)], ['Constraint', 'Season/t', 'Used', 'Limit', 'Slack']);
    for (const u of best.usage) rows.push([u.label, u.season ?? '', u.used, u.limit, u.slack]);
  }
  return csv(rows);
}

// ------------------------------------------------------------------ events

/** Equality that treats NaN as equal to NaN (an empty numeric field), for change detection. */
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) && (typeof a !== 'number' || typeof b !== 'number' || Object.is(a, b) || a === b);

function onClubInput(event) {
  const el = event.target;
  if (el.dataset.club) {
    const kind = el.dataset.kind;
    const value = kind === 'select' ? (el.dataset.club === 'horizon' ? Number(el.value) : el.value) : parse(kind, el.value);
    if (same(el.dataset.club.split('.').reduce((o, k) => o?.[k], scenario.context), value)) return; // e.g. 'change' on blur
    setPath(scenario.context, el.dataset.club, value);
    if (el.dataset.club === 'horizon') { resizeSeasons(value); renderSeasons(); }
  } else if (el.dataset.need) {
    if (same(scenario.context.positionNeeds?.[el.dataset.need] ?? 0, Number(el.value))) return;
    scenario.context.positionNeeds = {...scenario.context.positionNeeds, [el.dataset.need]: Number(el.value)};
  } else if (el.dataset.season) {
    if (same(scenario.context[el.dataset.season][Number(el.dataset.index)], Number(el.value))) return;
    scenario.context[el.dataset.season][Number(el.dataset.index)] = Number(el.value);
  } else return;
  schedule();
}
function onCandidateInput(event) {
  const el = event.target;
  if (el.dataset.mode) { if (scenario.modes[el.dataset.mode] === el.value) return; scenario.modes[el.dataset.mode] = el.value; schedule(); return; }
  if (el.dataset.row === undefined) return;
  const c = scenario.candidates[Number(el.dataset.row)];
  const kind = el.dataset.kind;
  const value = kind === 'checkbox' ? el.checked : kind === 'select' ? el.value : parse(kind, el.value);
  if (same(c[el.dataset.key], value)) return; // a 'change' event after 'input' (e.g. on blur) is not a new edit
  c[el.dataset.key] = value;
  if (el.dataset.key === 'name') renderEconSelect();
  schedule();
}
function onCandidateClick(event) {
  const dup = event.target.dataset.dup, del = event.target.dataset.del;
  if (dup !== undefined) {
    if (scenario.candidates.length >= MAX_CANDIDATES) return status(`At most ${MAX_CANDIDATES} candidates.`, true);
    const copy = structuredClone(scenario.candidates[Number(dup)]);
    copy.id = uniqueId(scenario.candidates.map(c => c.id)); copy.name = `${copy.name} (copy)`.slice(0, 90);
    scenario.candidates.splice(Number(dup) + 1, 0, copy); scenario.modes[copy.id] = 'optimise';
  } else if (del !== undefined) {
    const [gone] = scenario.candidates.splice(Number(del), 1); delete scenario.modes[gone.id];
  } else return;
  renderCandidates(); schedule();
}

async function init() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});
    worker.onmessage = event => receive(event.data);
    worker.onerror = () => { worker = null; status('Background worker unavailable; optimising on the main thread.'); run(); };
  } catch { worker = null; }
  try { scenario = load() ?? await demoScenario(); } catch (error) { status(error.message, true); return; }
  renderClub(); renderCandidates();
  $('club').addEventListener('input', onClubInput);
  $('club').addEventListener('change', onClubInput);
  $('seasons').addEventListener('input', onClubInput);
  $('candidates').addEventListener('input', onCandidateInput);
  $('candidates').addEventListener('change', onCandidateInput);
  $('candidates').addEventListener('click', onCandidateClick);
  $('econ-select').addEventListener('change', renderEcon);
  $('snapshot-form').addEventListener('submit', event => {
    event.preventDefault();
    scenario.snapshots ??= [];
    if (scenario.snapshots.length >= MAX_SNAPSHOTS) return status(`At most ${MAX_SNAPSHOTS} saved scenarios — remove one first.`, true);
    try { canonicalScenario({...scenario, schema: SCHEMA}); } catch (error) { return status(`Cannot save invalid inputs: ${error.message}`, true); }
    scenario.snapshots.push(makeSnapshot(scenario, $('snapshot-label').value));
    $('snapshot-label').value = '';
    save(); renderComparisons(); status('Scenario saved for comparison.');
  });
  $('compare').addEventListener('click', event => {
    const restore = event.target.dataset.restore, forget = event.target.dataset.forget;
    if (forget !== undefined) { scenario.snapshots.splice(Number(forget), 1); save(); renderComparisons(); return; }
    if (restore !== undefined) {
      const snap = scenario.snapshots[Number(restore)];
      if (!confirm(`Replace the current inputs with "${snap.label}"? Saved comparisons are kept.`)) return;
      const c = canonicalScenario({schema: SCHEMA, context: snap.context, candidates: snap.candidates, modes: snap.modes});
      scenario.context = c.context; scenario.candidates = c.candidates; scenario.modes = c.modes;
      renderClub(); renderCandidates(); schedule();
    }
  });
  $('add').onclick = () => {
    if (scenario.candidates.length >= MAX_CANDIDATES) return status(`At most ${MAX_CANDIDATES} candidates.`, true);
    const id = uniqueId(scenario.candidates.map(c => c.id));
    scenario.candidates.push({id, name: 'New candidate', position: 'CM', dealType: 'permanent', fee: 500000, instalments: [1], agentFee: 50000, contractYears: 3, wage: 300000, points: 1});
    scenario.modes[id] = 'optimise'; renderCandidates(); schedule();
  };
  $('reset').onclick = async () => { if (!confirm('Replace the current scenario with the fictional demo?')) return; scenario = await demoScenario(); renderClub(); renderCandidates(); schedule(); };
  $('export-json').onclick = () => {
    try { download('lanova-recruitment-scenario.json', JSON.stringify(canonicalScenario({...scenario, schema: SCHEMA}), null, 2), 'application/json'); }
    catch (error) { status(`Scenario not exported: ${error.message}. Fix the inputs first.`, true); }
  };
  // Decision exports: only an accepted analysis that matches the CURRENT inputs.
  const fresh = () => decision.exportable(inputsKey(scenario));
  $('export-csv').onclick = () => { const a = fresh(); if (!a) return status('Export blocked: the results are out of date or the inputs are invalid.', true); download('lanova-recruitment-audit.csv', auditCsv(a), 'text/csv'); };
  $('export-memo').onclick = () => { const a = fresh(); if (!a) return status('Export blocked: the results are out of date or the inputs are invalid.', true); download('lanova-recruitment-memo.html', decisionMemo(a, {...scenario, comparison: scenario.snapshots?.length ? compareSnapshots([makeSnapshot(scenario, 'Current inputs'), ...scenario.snapshots]) : []}), 'text/html'); };
  $('import-json').onchange = async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File larger than 1 MB');
      const next = canonicalScenario(JSON.parse(await file.text()));
      if (!confirm(`Replace the current scenario with "${next.label || file.name}" (${next.candidates.length} candidates)?`)) return;
      scenario = next; renderClub(); renderCandidates(); schedule(); status('Scenario imported.');
    } catch (error) { status(`Import rejected: ${error.message}. The current scenario is unchanged.`, true); }
  };
  run();
}
init();
