/**
 * Málaga CF winter case study — interface. Display and input only: every sporting figure comes from case.js (explicit
 * goal model on the verified line and the CC0 dataset), every financial figure from the Advantage Lab V1 and the
 * LANOVA Finance engine. Nothing is sent or stored; the only request is the dataset file of this site.
 */
import {SNAPSHOT, KINDS, TEAM, context, compare, breakEven, explain, historyBand, affordability, emptyFinance, HYPOTHETICAL, FIN_FIELDS, COST_FIELDS, report, reportHtml} from './case.js';
import {fmt} from '../../advantage/lab.js';

const root = document.getElementById('case');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const r1 = v => (Math.round(v * 10) / 10).toFixed(1), sign = v => `${v >= 0 ? '+' : '−'}${r1(Math.abs(v))}`;
const S = {ctx: null, h: null, f: emptyFinance(), timer: 0};
const kind = k => `<span class="kind ${k}">${esc({obs: 'Observed', est: 'Model estimate', hyp: 'Your hypothesis'}[k])}</span>`;
const dateLabel = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
const PRESETS = [['equal', 'Same size: +20% scored / −20% conceded', {attackPct: 20, defencePct: 20}], ['striker', 'Strong attacking signing: +40% / −10%', {attackPct: 40, defencePct: 10}], ['rebuild', 'Defensive rebuild: +10% / −40%', {attackPct: 10, defencePct: 40}]];
const FIN_LABELS = {openingCash: 'Cash available on 1 January 2027 (EUR)', annualRevenue: 'Annual revenue (EUR)', annualOperatingCosts: 'Annual operating costs, staff included (EUR)', staffCosts: 'of which staff costs (EUR)',
  minimumCash: 'Minimum cash reserve (EUR)', decisionBudget: 'Budget available for January signings (EUR)'};
const COST_LABELS = {transferFee: 'Transfer or loan fee (EUR)', feeInstalments: 'Fee paid in (yearly instalments)', agentFee: 'Agent fee (EUR)', signingBonus: 'Signing bonus (EUR)', monthlyWage: 'Gross wage per month (EUR)', employerChargeRate: 'Employer charges (share of wages, 0–1)', contractMonths: 'Contract or loan length (months)'};

// ------------------------------------------------------------------ layout
function page() {
  const ctx = S.ctx, band = historyBand(ctx), opts = ctx.remaining.map(m => `<option value="${m.date}">${esc(dateLabel(m.date))} · matchday ${m.matchday} · ${m.home === TEAM ? 'v' : '@'} ${esc(m.home === TEAM ? m.away : m.home)}</option>`).join('');
  const s = SNAPSHOT;
  root.innerHTML = `
  <section class="case-section" aria-labelledby="h-start"><header class="sec-head"><div>${kind('obs')}<h2 id="h-start">1 · The verified starting point</h2><p class="muted">${esc(s.competition)} · ${esc(s.state)}. Checked on ${esc(dateLabel(s.checkedOn))}.</p></div></header>
    <div class="tiles obs-tiles"><div><span>Position</span><b>${s.position}<small>/20</small></b><em>bottom of the table</em></div><div><span>Points</span><b>${s.points}</b><em>from ${s.played} matches</em></div><div><span>Record</span><b>${s.won}–${s.drawn}–${s.lost}</b><em>won · drawn · lost</em></div><div><span>Goals</span><b>${s.goalsFor}–${s.goalsAgainst}</b><em>${(s.goalsFor / s.played).toFixed(2)} scored · ${(s.goalsAgainst / s.played).toFixed(2)} conceded per match</em></div><div><span>Matches left</span><b>${ctx.remaining.length}</b><em>from ${esc(dateLabel(ctx.remaining[0].date))}</em></div></div>
    <details class="sources"><summary>How these figures were verified (${s.sources.length} dated sources)</summary><ol>${s.derivation.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <ul>${s.sources.map(x => `<li><a href="${esc(x.url)}" rel="noopener noreferrer" target="_blank">${esc(x.name)}</a> · ${esc(dateLabel(x.date))}</li>`).join('')}</ul><p class="small muted">${esc(s.rights)}</p></details>
    <div class="history"><div><h3>${kind('obs')} What has been enough to stay up</h3><p class="small muted">Points of the 17th-placed team (the last place above the relegation zone) in each complete LaLiga season of the open dataset, 2012/13–2025/26. A reference, not this season's threshold.</p>${historyChart(band)}</div>
      <div class="history-read"><p><b>${band.min}–${band.max} points</b> · median <b>${band.median}</b></p><p class="small">From ${s.points} points with ${ctx.remaining.length} matches left, reaching ${band.median} needs <b>${((band.median - s.points) / ctx.remaining.length).toFixed(2)} points per match</b>; so far Málaga have taken ${(s.points / s.played).toFixed(2)}.</p></div></div>
  </section>

  <section class="case-section" aria-labelledby="h-exp"><header class="sec-head"><div>${kind('hyp')} ${kind('est')}<h2 id="h-exp">2 · The attack-versus-defence experiment</h2><p class="muted">Set how much each intervention improves Málaga's own rate, and from which match. The model recalculates the expected points of every remaining match.</p></div></header>
    <div class="presets" role="group" aria-label="Example settings">${PRESETS.map(([k, l]) => `<button type="button" class="btn btn-ghost small" data-preset="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="controls">
      <fieldset class="ctl attack"><legend>Attack: score more</legend>
        <label for="attackPct">Goals scored +<output id="attackOut" for="attackPct"></output>%</label><input id="attackPct" type="range" min="0" max="100" step="1" data-h="attackPct">
        <label>Exact value (%)<input type="number" min="0" max="300" step="1" data-h="attackPct" inputmode="numeric" id="attackNum"></label>
        <label>From<select data-h="attackFrom" id="attackFrom">${opts}</select></label><p class="small muted" id="attackImplied"></p></fieldset>
      <fieldset class="ctl defence"><legend>Defence: concede less</legend>
        <label for="defencePct">Goals conceded −<output id="defenceOut" for="defencePct"></output>%</label><input id="defencePct" type="range" min="0" max="60" step="1" data-h="defencePct">
        <label>Exact value (%)<input type="number" min="0" max="90" step="1" data-h="defencePct" inputmode="numeric" id="defenceNum"></label>
        <label>From<select data-h="defenceFrom" id="defenceFrom">${opts}</select></label><p class="small muted" id="defenceImplied"></p></fieldset>
    </div>
    <div id="verdict" class="verdict" aria-live="polite"></div>
    <div id="outcomes" class="outcomes" aria-live="polite"></div>
    <div id="chart"></div>
    <details class="per-match"><summary>Match by match: expected goals and points</summary><div class="table-wrap" id="matches"></div></details>
  </section>

  <section class="case-section" aria-labelledby="h-why"><header class="sec-head"><div>${kind('est')}<h2 id="h-why">3 · Why — and what would change the answer</h2></div></header><div id="explain" aria-live="polite"></div></section>

  <section class="case-section" aria-labelledby="h-fin"><header class="sec-head"><div>${kind('hyp')} ${kind('est')}<h2 id="h-fin">4 · What it would cost — and can it be afforded?</h2><p class="muted">Málaga CF's finances and the price of real candidates are not public in verified form, so nothing is pre-filled. Enter your own figures, or load a clearly labelled hypothetical illustration. The LANOVA Finance engine (through the Advantage Lab) computes the cash month by month in a base case and a downside (relegation) case.</p></div>
      <div class="btn-row"><button type="button" class="btn small" data-fin="hypothetical">Load the hypothetical illustration</button><button type="button" class="btn btn-ghost small" data-fin="clear">Clear all figures</button></div></header>
    <div class="fin-grid"><fieldset><legend>Organisation (hypothesis)</legend>${FIN_FIELDS.map(k => num(`f.${k}`, FIN_LABELS[k])).join('')}
        ${num('f.downsideRevenuePct', 'Downside: revenue change if relegated (%)')}<label>Downside applies from<select data-f="f.downsideFromMonth">${[[5, 'June 2027'], [6, 'July 2027'], [7, 'August 2027']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-f="f.downsideMustHold"> The reserve must also hold in the downside</label></fieldset>
      ${['attack', 'defence'].map(sd => `<fieldset><legend>${sd === 'attack' ? 'Attacking reinforcement' : 'Defensive reinforcement'} (hypothesis)</legend>${COST_FIELDS.map(k => num(`${sd}.${k}`, COST_LABELS[k])).join('')}</fieldset>`).join('')}</div>
    <div id="afford" aria-live="polite"></div>
  </section>

  <section class="case-section" aria-labelledby="h-export"><header class="sec-head"><div><h2 id="h-export">5 · Export the analysis</h2><p class="muted">The report keeps observed facts, model estimates and your hypotheses in separate, labelled parts.</p></div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-export="html">Download the report (HTML, printable)</button><button type="button" class="btn" data-export="json">JSON</button></div></header></section>

  <section class="case-section method" aria-labelledby="h-method"><header class="sec-head"><div><h2 id="h-method">Method, data and limits</h2></div></header>${methodHtml(ctx)}</section>`;
  const [jan] = ctx.remaining.filter(m => m.date >= '2027-01-02');
  S.h = {attackPct: 20, attackFrom: jan?.date ?? ctx.remaining[0].date, defencePct: 20, defenceFrom: jan?.date ?? ctx.remaining[0].date};
  syncControls(); syncFinance(); update();
}
const num = (path, label) => `<label>${esc(label)}<input type="number" step="any" inputmode="decimal" data-f="${path}"></label>`;
function methodHtml(ctx) {
  const src = ctx.source;
  return `<div class="method-grid"><div><h3>The model ${kind('est')}</h3><ul>
    <li>Each side's goals in a match follow independent Poisson distributions. Mean = league ${'home'}/away scoring rate × the side's attack strength × the opponent's defence weakness.</li>
    <li>League rates: ${ctx.rates.home.toFixed(2)} home and ${ctx.rates.away.toFixed(2)} away goals per match (${ctx.rates.matches} matches: LaLiga 2025/26 and the 2026/27 matches in the dataset).</li>
    <li>Strengths are actual goals per match relative to the league average, shrunk towards average by ${ctx.k} "prior matches". Málaga's use its verified line (13 matches); other teams' the ${ctx.datasetMatches} 2026/27 matches in the dataset (to ${esc(dateLabel(ctx.datasetThrough))}).</li>
    <li>An intervention multiplies Málaga's scoring rate (attack) or conceding rate (defence) from its activation match. Expected points per match = 3 × P(win) + P(draw), summed over the remaining fixtures.</li>
    <li>No expected-goals (xG) data is used: none is available under terms that permit this use.</li></ul></div>
  <div><h3>Data and rights ${kind('obs')}</h3><ul>
    <li>Fixtures and past results: <a href="${esc(src.url)}" rel="noopener noreferrer" target="_blank">${esc(src.name)}</a>, commit <span class="mono">${esc(src.commit.slice(0, 10))}</span> (${esc(src.commitDate.slice(0, 10))}), ${esc(src.licence)}. Rebuilt and checked by <span class="mono">scripts/build-football-dataset.mjs</span> (380 matches, 20 teams, 19 home and 19 away each, per season).</li>
    <li>Málaga's line after matchday 13: public match facts from the dated sources above, entered by hand. The open dataset's own Málaga results (${ctx.datasetMalaga.played} matches, ${ctx.datasetMalaga.points} points, ${ctx.datasetMalaga.gf}–${ctx.datasetMalaga.ga}) are consistent with it: ${ctx.consistent ? 'checked' : 'NOT consistent'}.</li>
    <li>Fixture dates after matchday 14 are those in the open dataset; the league may still move them.</li>
    <li>No league table, logo, photograph, player data or media text is reproduced. No website is scraped.</li></ul></div>
  <div><h3>Not in this release</h3><ul><li><b>No probability</b> of survival or relegation. The forecasting engine (season simulation and back-testing) is a separate release and must be independently validated first.</li><li><b>No named player</b> and no player-specific impact. A percentage is a hypothesis about a player or a change of system, not a measured effect.</li><li>Opponent strengths do not yet include matchdays 8–13 (not in the open dataset at its current commit).</li></ul></div></div>`;
}
function historyChart(band) {
  const W = 560, H = 170, L = 34, B = 26, T = 10, max = 46, min = 26, x = i => L + i * (W - L - 8) / band.safe.length, y = v => T + (max - v) * (H - T - B) / (max - min), bw = (W - L - 8) / band.safe.length - 6;
  return `<svg class="hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points of the 17th-placed team, LaLiga ${band.safe[0].season} to ${band.safe.at(-1).season}: from ${band.min} to ${band.max}, median ${band.median}">
    ${[30, 35, 40, 45].map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${band.safe.map((s, i) => `<rect x="${x(i) + 3}" y="${y(s.points)}" width="${bw}" height="${y(min) - y(s.points)}" rx="2"><title>${s.season}: ${s.points} points (${esc(s.team)})</title></rect><text x="${x(i) + 3 + bw / 2}" y="${H - 8}" text-anchor="middle" class="yr">${s.season.slice(2, 4)}</text>`).join('')}
    <line x1="${L}" x2="${W}" y1="${y(band.median)}" y2="${y(band.median)}" class="med"/></svg>`;
}

// ------------------------------------------------------------------ results
function update() {
  const ctx = S.ctx, h = S.h, c = compare(ctx, h), be = breakEven(ctx, h), band = historyBand(ctx), ex = explain(ctx, h, c, be), m = ctx.strengths[TEAM];
  const perFor = ctx.rates.perTeamMatch * m.attack, perAg = ctx.rates.perTeamMatch * m.defence;
  document.getElementById('attackImplied').textContent = `≈ +${(perFor * h.attackPct / 100).toFixed(2)} goals scored per match (from ${perFor.toFixed(2)}).`;
  document.getElementById('defenceImplied').textContent = `≈ −${(perAg * h.defencePct / 100).toFixed(2)} goals conceded per match (from ${perAg.toFixed(2)}).`;
  const label = {attack: 'The attack improvement', defence: 'The defence improvement', equivalent: 'Neither: the two are equivalent'}[c.best];
  document.getElementById('verdict').innerHTML = `${kind('est')}<p class="v-main" data-best="${c.best}"><b>${esc(label)}</b>${c.best === 'equivalent' ? '' : ' adds more expected points'} under these assumptions: ${sign(c.attack.gain)} (attack) vs ${sign(c.defence.gain)} (defence) over ${ctx.remaining.length} matches.</p>`;
  const card = (k, title, x) => `<div class="out ${k}${c.best === k ? ' best' : ''}" data-scenario="${k}"><span>${esc(title)}</span><b>${r1(x.finalPoints)}</b><em>expected final points</em><p>${k === 'baseline' ? 'no change' : `${sign(x.gain)} vs baseline`}</p><small>${r1(x.goalsFor)} scored · ${r1(x.goalsAgainst)} conceded (remaining)</small></div>`;
  document.getElementById('outcomes').innerHTML = card('baseline', 'Baseline', c.baseline) + card('attack', `Attack +${h.attackPct}%`, c.attack) + card('defence', `Defence −${h.defencePct}%`, c.defence) + card('both', 'Both', c.both);
  document.getElementById('chart').innerHTML = outcomeChart(c, band);
  document.getElementById('matches').innerHTML = `<table><thead><tr><th>Date</th><th>Opponent</th><th class="n">Exp. scored</th><th class="n">Exp. conceded</th><th class="n">Exp. points, baseline</th><th class="n">Attack</th><th class="n">Defence</th></tr></thead><tbody>${c.baseline.matches.map((x, i) => `<tr><td>${esc(dateLabel(x.date))}</td><td>${x.venue === 'home' ? 'v' : '@'} ${esc(x.opponent)}</td><td class="n">${x.goalsFor.toFixed(2)}</td><td class="n">${x.goalsAgainst.toFixed(2)}</td><td class="n">${x.points.toFixed(2)}</td><td class="n">${c.attack.matches[i].points.toFixed(2)}</td><td class="n">${c.defence.matches[i].points.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('explain').innerHTML = `<p class="headline">${esc(ex.headline)}</p><div class="explain-grid"><div><h3>What drives the difference</h3><ul>${ex.drivers.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h3>What would change the recommendation</h3><ul>${ex.change.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div><h3>Uncertainty</h3><ul>${ex.uncertainty.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h3>Information needed before deciding</h3><ul>${ex.needed.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  affordView(c);
}
function outcomeChart(c, band) {
  const W = 720, H = 210, L = 150, R = 20, rows = [['baseline', 'Baseline'], ['attack', 'Attack'], ['defence', 'Defence'], ['both', 'Both']], max = Math.max(50, Math.ceil(Math.max(...rows.map(([k]) => c[k].finalPoints)) / 5) * 5 + 5);
  const x = v => L + v * (W - L - R) / max, bh = 30;
  return `<svg class="outchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Expected final points: baseline ${r1(c.baseline.finalPoints)}, attack ${r1(c.attack.finalPoints)}, defence ${r1(c.defence.finalPoints)}, both ${r1(c.both.finalPoints)}; 17th place in past seasons ${band.min} to ${band.max}">
    <rect class="band" x="${x(band.min)}" y="4" width="${x(band.max) - x(band.min)}" height="${H - 30}"><title>17th place, past seasons: ${band.min}–${band.max} points</title></rect>
    <text class="bandl" x="${x(band.median)}" y="${H - 12}" text-anchor="middle">17th place, 2012/13–2025/26: ${band.min}–${band.max} (median ${band.median})</text>
    ${rows.map(([k, l], i) => `<text x="${L - 10}" y="${14 + i * 44 + bh / 2 + 4}" text-anchor="end" class="rl">${l}</text><rect class="bar ${k}${c.best === k ? ' best' : ''}" x="${L}" y="${14 + i * 44}" width="${x(c[k].finalPoints) - L}" height="${bh}" rx="4"/><text x="${x(c[k].finalPoints) + 6}" y="${14 + i * 44 + bh / 2 + 5}" class="vl">${r1(c[k].finalPoints)}</text>`).join('')}
    <line class="med" x1="${x(band.median)}" x2="${x(band.median)}" y1="4" y2="${H - 26}"/></svg><p class="small muted">${kind('est')} Expected final points = ${SNAPSHOT.points} points already won + expected points of the ${S.ctx.remaining.length} remaining matches. ${kind('obs')} Shaded: points of the 17th-placed team in past seasons. Expected points are averages, not a forecast of where Málaga will finish.</p>`;
}
function affordView(c) {
  const box = document.getElementById('afford'), a = affordability(S.f, c);
  if (!a.computed) { box.innerHTML = `<div class="notice" role="status"><b>Not computed.</b> ${esc(a.reason ?? '')}${a.problems ? ` ${esc(a.problems.join('; '))}` : ''}<br><span class="small muted">Missing: ${esc(a.missing.slice(0, 8).join(', '))}${a.missing.length > 8 ? '…' : ''}</span></div>`; return; }
  const row = (k, l) => { const v = a.items[k]; if (!v.known) return `<tr><td>${esc(l)}</td><td colspan="7" class="muted">${esc(v.reason)}</td></tr>`;
    return `<tr class="${v.affordable ? '' : 'breach'}"><td>${esc(l)}</td><td class="n">${fmt(v.upfront)}</td><td class="n">${fmt(v.costInYear)}</td><td class="n">${fmt(v.totalCost)}</td><td>${v.withinBudget ? 'yes' : '<b>no</b>'}</td><td class="n ${v.base.meetsReserve ? '' : 'neg'}">${fmt(v.base.lowest)}</td><td class="n ${v.downside.meetsReserve ? '' : 'neg'}">${fmt(v.downside.lowest)}</td><td class="n">${v.costPerExpectedPoint === null ? '—' : fmt(v.costPerExpectedPoint)}</td></tr>`; };
  box.innerHTML = `<div class="table-wrap"><table class="afford"><thead><tr><th>Intervention</th><th class="n">Immediate cost</th><th class="n">Cost in 2027</th><th class="n">Total committed</th><th>Within budget</th><th class="n">Lowest cash, base</th><th class="n">Lowest cash, downside</th><th class="n">Cost per expected point</th></tr></thead><tbody>${row('attack', 'Attack')}${row('defence', 'Defence')}${row('both', 'Both')}</tbody></table></div>
    <p class="small muted">${kind('hyp')} ${esc(S.f === null ? '' : a.model.label)}. Reserve ${fmt(a.reserve)}; budget ${fmt(a.budget)}. Without any signing, lowest cash is ${fmt(a.baseline.scenarios.base.lowest)} (base) and ${fmt(a.baseline.scenarios.downside.lowest)} (downside). Immediate cost = fee + agent fee + bonus; wages and employer charges are payroll; the bonus is paid at signing and expensed over the contract (Finance engine). Cost per expected point = total committed ÷ expected points gained (model estimate).</p>`;
}

// ------------------------------------------------------------------ inputs
function syncControls() {
  const h = S.h;
  for (const [id, v] of [['attackPct', h.attackPct], ['attackNum', h.attackPct], ['defencePct', h.defencePct], ['defenceNum', h.defencePct], ['attackFrom', h.attackFrom], ['defenceFrom', h.defenceFrom]]) document.getElementById(id).value = v;
  document.getElementById('attackOut').textContent = h.attackPct; document.getElementById('defenceOut').textContent = h.defencePct;
}
const get = path => path.split('.').reduce((o, k) => o?.[k], {f: S.f, attack: S.f.attack, defence: S.f.defence});
function syncFinance() {
  for (const el of root.querySelectorAll('[data-f]')) { const v = get(el.dataset.f); if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = v ?? ''; }
}
function setF(path, raw, el) {
  const [scope, key] = path.split('.'), target = scope === 'f' ? S.f : S.f[scope];
  target[key] = el.type === 'checkbox' ? el.checked : raw === '' ? null : Number(raw);
  if (target[key] !== null && typeof target[key] === 'number' && !Number.isFinite(target[key])) target[key] = null;
  schedule();
}
const schedule = () => { clearTimeout(S.timer); S.timer = setTimeout(update, 90); };
root.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.h) {
    const k = el.dataset.h; let v = el.tagName === 'SELECT' ? el.value : Number(el.value);
    if (typeof v === 'number') { const max = k === 'attackPct' ? 300 : 90; if (!Number.isFinite(v) || v < 0) v = 0; if (v > max) v = max; }
    S.h[k] = v; syncControls(); schedule();
  } else if (el.dataset.f && el.type !== 'checkbox' && el.tagName !== 'SELECT') setF(el.dataset.f, el.value, el);
});
root.addEventListener('change', e => { const el = e.target; if (el.dataset.f && (el.type === 'checkbox' || el.tagName === 'SELECT')) setF(el.dataset.f, el.value, el); else if (el.dataset.h && el.tagName === 'SELECT') { S.h[el.dataset.h] = el.value; schedule(); } });
root.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.preset) { Object.assign(S.h, PRESETS.find(p => p[0] === b.dataset.preset)[2]); syncControls(); update(); }
  if (b.dataset.fin === 'hypothetical') { S.f = structuredClone({...HYPOTHETICAL}); syncFinance(); update(); }
  if (b.dataset.fin === 'clear') { S.f = emptyFinance(); syncFinance(); update(); }
  if (b.dataset.export) {
    const rep = report(S.ctx, S.h, S.f), name = `lanova-malaga-winter-2027-${b.dataset.export === 'html' ? 'report.html' : 'analysis.json'}`;
    const text = b.dataset.export === 'html' ? reportHtml(rep) : JSON.stringify(rep, null, 2), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: b.dataset.export === 'html' ? 'text/html;charset=utf-8' : 'application/json'})); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
});

// ------------------------------------------------------------------ start
document.getElementById('independence').textContent = SNAPSHOT.independence;
fetch('../data/laliga.json').then(r => { if (!r.ok) throw new Error(`dataset: HTTP ${r.status}`); return r.json(); })
  .then(d => { S.ctx = context(d); page(); void KINDS; })
  .catch(err => { root.innerHTML = `<div class="notice" role="alert"><b>The verified dataset could not be loaded</b> (${esc(err.message)}). Nothing is calculated without it.</div>`; });
