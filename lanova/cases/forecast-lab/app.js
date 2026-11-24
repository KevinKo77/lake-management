/**
 * Football Forecast Lab — interface (validation v2). Shows the validation report produced by
 * scripts/forecast-validation-v2.mjs (reproduced by the tests) and runs historical replays live with
 * lanova/cases/forecast.js, ranked with the RFEF tie-breakers (lanova/cases/ranking.js). No current-season
 * probability is computed or shown on this page.
 */
import {replay, allMatches} from '../forecast.js';

const root = document.getElementById('lab'), DATA_AS_OF = '2026-11-24';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const kind = k => `<span class="kind ${k}">${esc({obs: 'Observed', est: 'Model estimate'}[k])}</span>`;
const f3 = v => (v === null || v === undefined ? '—' : Number(v).toFixed(3)), f4 = v => (v === null || v === undefined ? '—' : Number(v).toFixed(4)), pc = v => `${Math.round(v * 100)}%`;
const pc2 = v => `${(v * 100).toFixed(v * 100 < 0.1 ? 3 : 2)}%`, ci = a => `[${f3(a[0])} to ${f3(a[1])}]`, better = (a, b) => ((b - a) / b * 100).toFixed(1), hl = h => (h === 'none' ? 'no decay' : `${h} days`);
const dateLabel = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
let D = null, V = null;

/** Reliability diagram from calibration bands (circle size = count; vertical bar = Wilson 95% interval). */
function reliability(bands, title) {
  const W = 300, P = 34, S = W - P - 10, x = v => P + v * S, y = v => 10 + (1 - v) * S, used = bands.filter(b => b.n), maxN = Math.max(...used.map(b => b.n));
  return `<figure class="rel"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(title)}: predicted against observed frequency, with 95% intervals">
    <rect x="${P}" y="10" width="${S}" height="${S}" class="frame"/>${[0, 0.25, 0.5, 0.75, 1].map(v => `<text x="${P - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text><text x="${x(v)}" y="${W - 8}" text-anchor="middle">${v}</text>`).join('')}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" class="diag"/>
    ${used.map(b => `<line class="ci" x1="${x(b.predicted)}" x2="${x(b.predicted)}" y1="${y(b.wilson95[0])}" y2="${y(b.wilson95[1])}"/><circle${b.n < 20 ? ' class="few"' : ''} cx="${x(b.predicted)}" cy="${y(b.observed)}" r="${3 + 7 * Math.sqrt(b.n / maxN)}"><title>${b.n} forecasts between ${b.lo} and ${b.hi}: predicted ${f3(b.predicted)}, observed ${f3(b.observed)} (95% interval ${f3(b.wilson95[0])}–${f3(b.wilson95[1])})</title></circle>`).join('')}</svg>
    <figcaption>${esc(title)}</figcaption></figure>`;
}
const bandTable = bands => `<div class="table-wrap"><table class="bands"><thead><tr><th>Predicted band</th><th class="n">Forecasts</th><th class="n">Events</th><th class="n">Mean predicted</th><th class="n">Observed</th><th class="n">95% interval of observed</th><th>Prediction inside?</th></tr></thead><tbody>
  ${bands.filter(b => b.n).map(b => `<tr><td>${b.lo.toFixed(2)}–${b.hi.toFixed(2)}</td><td class="n">${b.n}</td><td class="n">${b.events}</td><td class="n">${f3(b.predicted)}</td><td class="n">${f3(b.observed)}</td><td class="n">${f3(b.wilson95[0])}–${f3(b.wilson95[1])}</td><td>${b.predictedInsideInterval ? 'yes' : '<b>no</b>'}${b.n < 20 ? ' · few cases' : ''}</td></tr>`).join('')}</tbody></table></div>`;

function missingCurrent() {
  const s = D.seasons['2026-27']; if (!s) return [];
  return s.matches.filter(r => r[4] === null && r[0] < DATA_AS_OF).map(([date, matchday, home, away]) => ({date, matchday, home, away}));
}

function page() {
  const h = V.holdout, r = V.relegation, c = V.tuning.chosen, b = V.before, rk = V.rankingSummary, seasons = r.seasons, miss = missingCurrent();
  const holdGain = r.holdout.ci95.brierGainVsPosition, holdSig = holdGain[0] > 0, allGain = r.all.ci95.brierGainVsPosition;
  const byMd = Object.entries(miss.reduce((o, m) => ({...o, [m.matchday]: (o[m.matchday] ?? 0) + 1}), {}));
  root.innerHTML = `
  <section class="case-section" aria-labelledby="h-status"><header class="sec-head"><div><h2 id="h-status">Validation status</h2><p class="muted">Report version ${V.version} (${esc(V.schema)}), which replaces version 1 after the correction of the league ranking rules.</p></div></header>
    <div class="status-grid">
      ${Object.values(V.criteria).map(x => `<div class="crit ${x.passed ? 'ok' : 'no'}"><b>${x.passed ? 'Internal criterion passed' : 'Internal criterion not passed'}</b><span>${esc(x.text)}</span></div>`).join('')}
      <div class="crit ${holdSig ? 'ok' : 'no'}" data-holdout-significant="${holdSig}"><b>${holdSig ? 'Relegation advantage confirmed on unseen seasons' : 'Relegation advantage not established on unseen seasons'}</b><span>Brier gain over the position baseline on ${r.holdout.n} unseen team-seasons: ${f3(r.holdout.position.brier - r.holdout.model.brier)}, 95% interval ${ci(holdGain)}${holdSig ? '' : ' — it includes zero'}.</span></div>
      <div class="crit hold"><b>Independent validation: pending</b><span>${esc(V.publication)}</span></div>
      <div class="crit hold"><b>Current season: blocked</b><span>${miss.length} results of 2026/27 played before ${esc(dateLabel(DATA_AS_OF))} are missing from the open dataset (listed below). No 2026/27 probability is computed.</span></div>
    </div></section>

  <section class="case-section" aria-labelledby="h-rules"><header class="sec-head"><div>${kind('obs')}<h2 id="h-rules">Correction: the Spanish league ranking rules</h2><p class="muted">Version 1 ordered clubs level on points by overall goal difference. LaLiga orders them first by their results against each other (RFEF rules). Every table is now ranked that way: the simulated final tables, the historical final tables, the relegation labels used for testing and the table at the forecast date.</p></div></header>
    <ol class="rules">${['Points.', 'Clubs level on points: points in the matches between them (a separate table of those matches when three or more clubs are level), then goal difference in those matches. Used only once all those matches have been played.', 'If some clubs are still level, the same rules are applied again among those clubs only (two clubs: their two matches).', 'Then goal difference in the whole competition, then goals scored.', 'Then the fair-play ranking. Card data are not in the open dataset: such a tie is left unresolved (the clubs share the positions); it is never decided at random.'].map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="tiles rk"><div><span>Seasons rebuilt</span><b>${rk.seasons}</b><em>2012/13 to 2025/26</em></div><div><span>Relegated clubs as official</span><b>${rk.relegationMatchesOfficial}/${rk.seasons}</b><em>previous rule: ${rk.previousRuleMatchesOfficial}/${rk.seasons}</em></div><div><span>Verified positions matching</span><b>${rk.positionsMatching}/${rk.positionsChecked}</b><em>positions and points</em></div><div><span>Ties needing fair play</span><b>${rk.unresolvedBlocks}</b><em>in the 14 final tables; ${pc2(r.unresolvedTieShare.max)} of simulations at most</em></div></div>
    <p><b>The 2025/26 case.</b> CA Osasuna, Levante UD and RCD Mallorca finished on 42 points. On their results against each other Mallorca were last and went down; the previous rule relegated Levante instead. ${r.labelsCorrected.length} relegation label${r.labelsCorrected.length === 1 ? ' was' : 's were'} corrected in the test data: ${esc(r.labelsCorrected.map(x => `${x.team} ${x.season} (${x.after ? 'relegated' : 'stayed up'})`).join('; '))}. In 2014/15 the rules also matter (Eibar 18th on the head-to-head of three clubs on 35 points), and Elche's later administrative relegation is not a sporting outcome: the test uses the sporting table.</p>
    <p class="small muted">Rules as published by the RFEF (Reglamento General art. 201 / 224; Normas Reguladoras Primera y Segunda División 2025/26). The official tables were checked on the relegated clubs of all 14 seasons and on ${rk.positionsChecked} positions with points; see the source register.</p></section>

  <section class="case-section" aria-labelledby="h-match"><header class="sec-head"><div>${kind('est')}<h2 id="h-match">Part 1 — Match-result predictions</h2><p class="muted">Probabilities of a home win, a draw and an away win for each match. Every match of ${h.seasons[0]} to ${h.seasons.at(-1)} (${h.n} matches) was forecast one matchday at a time with earlier results only. Settings chosen beforehand on ${V.tuning.seasons[0]} to ${V.tuning.seasons.at(-1)} among ${V.tuning.grid.length} combinations: memory half-life ${hl(c.halfLife)}, ${c.k} prior matches, ${c.window}-day window${c.dixonColes ? ', low-score correction' : ''}.</p></div></header>
    <div class="table-wrap"><table><thead><tr><th>Score (lower is better)</th><th class="n">LANOVA engine</th><th class="n">95% interval</th><th class="n">Past frequencies</th><th class="n">Uniform ⅓</th><th class="n">Improvement on past frequencies</th></tr></thead><tbody>
      <tr><td>Log loss</td><td class="n"><b>${f3(h.model.logLoss)}</b></td><td class="n">${ci(h.ci95.logLoss)}</td><td class="n">${f3(h.baseRates.logLoss)}</td><td class="n">${f3(h.uniform.logLoss)}</td><td class="n">${better(h.model.logLoss, h.baseRates.logLoss)}%</td></tr>
      <tr><td>Brier score</td><td class="n"><b>${f3(h.model.brier)}</b></td><td class="n">${ci(h.ci95.brier)}</td><td class="n">${f3(h.baseRates.brier)}</td><td class="n">${f3(h.uniform.brier)}</td><td class="n">${better(h.model.brier, h.baseRates.brier)}%</td></tr>
      <tr><td>Ranked probability score</td><td class="n"><b>${f3(h.model.rps)}</b></td><td class="n">—</td><td class="n">${f3(h.baseRates.rps)}</td><td class="n">${f3(h.uniform.rps)}</td><td class="n">${better(h.model.rps, h.baseRates.rps)}%</td></tr></tbody></table></div>
    <p class="small">Log-loss gain over past frequencies: 95% interval ${ci(h.ci95.logLossGainVsBaseRates)} resampling matches, ${ci(h.ci95.logLossGainVsBaseRatesBySeason)} resampling whole seasons. Better in every unseen season (table below). Version 1 (previous settings): log loss ${f3(b.holdout.logLoss)}.</p>
    <div class="table-wrap"><table class="seasons"><thead><tr><th>Season</th>${h.perSeason.map(s => `<th class="n">${s.season}</th>`).join('')}</tr></thead><tbody><tr><td>Log loss, engine</td>${h.perSeason.map(s => `<td class="n">${f3(s.model.logLoss)}</td>`).join('')}</tr><tr><td>Log loss, past frequencies</td>${h.perSeason.map(s => `<td class="n">${f3(s.baseRates.logLoss)}</td>`).join('')}</tr></tbody></table></div>
    <h3>Calibration: when the engine says 40%, does it happen about 40% of the time?</h3>
    <div class="rels">${reliability(h.bands.home, `Home win (error ${f3(h.ece.home)})`)}${reliability(h.bands.draw, `Draw (error ${f3(h.ece.draw)})`)}${reliability(h.bands.away, `Away win (error ${f3(h.ece.away)})`)}</div>
    <p class="small muted">Circles: forecasts grouped by predicted probability (size = number of matches); vertical bars: 95% interval of the observed frequency; hollow: fewer than 20 forecasts. ${['home', 'draw', 'away'].map(k => `${k}: ${h.bands[k].filter(x => x.n && !x.predictedInsideInterval).length} band(s) outside the interval`).join('; ')}.</p></section>

  <section class="case-section" aria-labelledby="h-rel"><header class="sec-head"><div>${kind('est')}<h2 id="h-rel">Part 2 — Relegation probabilities after matchday 13</h2><p class="muted">A different question from Part 1: the share of ${V.simulations.toLocaleString('en-GB')} simulated end-of-season tables (seed ${V.seed}) in which a club finishes 18th to 20th, from the table after matchday 13, using only results available then. ${seasons[0]} to ${seasons.at(-1)}: ${r.all.n} team-seasons (${r.holdout.n} from seasons never used for any choice). Compared with the share relegated from the same position in earlier seasons, and with a flat 15%.</p></div></header>
    <div class="table-wrap"><table class="before-after"><thead><tr><th>Brier score (lower is better)</th><th class="n">Version 1 (before)</th><th class="n">Version 2 (corrected)</th><th class="n">95% interval (v2)</th><th class="n">Position baseline (v2)</th><th class="n">Flat 15%</th></tr></thead><tbody>
      <tr data-row="all"><td>All ${r.all.n} team-seasons</td><td class="n">${f3(b.relegationAll.model.brier)}</td><td class="n"><b>${f3(r.all.model.brier)}</b></td><td class="n">${ci(r.all.ci95.modelBrier)}</td><td class="n">${f3(r.all.position.brier)}</td><td class="n">${f3(r.all.uniform.brier)}</td></tr>
      <tr data-row="holdout"><td>Unseen seasons only (${r.holdout.n})</td><td class="n">${f3(b.relegationHoldout.model.brier)}</td><td class="n"><b>${f3(r.holdout.model.brier)}</b></td><td class="n">${ci(r.holdout.ci95.modelBrier)}</td><td class="n">${f3(r.holdout.position.brier)}</td><td class="n">${f3(r.holdout.uniform.brier)}</td></tr>
      <tr><td>Log loss, all</td><td class="n">${f3(b.relegationAll.model.logLoss)}</td><td class="n"><b>${f3(r.all.model.logLoss)}</b></td><td class="n">—</td><td class="n">${f3(r.all.position.logLoss)}</td><td class="n">${f3(r.all.uniform.logLoss)}</td></tr></tbody></table></div>
    <div class="notice ${holdSig ? '' : 'warn'}"><p><b>What the corrected figures support.</b> Over all ${r.all.n} team-seasons the engine beats the position baseline (Brier gain ${f3(r.all.position.brier - r.all.model.brier)}, 95% interval ${ci(allGain)}; ${ci(r.all.ci95.brierGainVsPositionBySeason)} resampling whole seasons). On the ${r.holdout.n} unseen team-seasons alone, the gain is ${f3(r.holdout.position.brier - r.holdout.model.brier)} with interval ${ci(holdGain)}: ${holdSig ? 'positive' : '<b>it includes zero, so the advantage there is not established</b>'}. Version 1 reported a larger advantage (Brier ${f3(b.relegationAll.model.brier)} vs ${f3(b.relegationAll.position.brier)}); that claim is withdrawn.</p></div>
    <h3>Calibration by probability band (all ${r.all.n} team-seasons)</h3>
    <div class="rels one">${reliability(r.bands, `Relegation probability (error ${f3(r.ece)})`)}<div>${bandTable(r.bands)}<p class="small muted">Every band's prediction lies inside the 95% interval of what happened, but the intervals are wide: between 20% and 60% the engine under-predicts (0.2–0.4) then over-predicts (0.4–0.6) on ${r.bands.filter(x => x.lo >= 0.2 && x.hi <= 0.6).reduce((s, x) => s + x.n, 0)} team-seasons. These are the cases that matter for a relegation decision, and they are too few to judge the engine precisely.</p></div></div>
    <h3>Sensitivity: memory and training window</h3>
    <div class="table-wrap"><table class="sens"><thead><tr><th>Half-life</th><th class="n">Window (days)</th><th class="n">Brier, all</th><th class="n">Brier, unseen</th><th class="n">Log loss, all</th></tr></thead><tbody>${r.sensitivity.map(x => `<tr${x.halfLife === c.halfLife && x.window === c.window ? ' class="chosen"' : ''}><td>${esc(hl(x.halfLife))}${x.halfLife === c.halfLife && x.window === c.window ? ' (chosen on match forecasts)' : ''}</td><td class="n">${x.window}</td><td class="n">${f4(x.brierAll)}</td><td class="n">${f4(x.brierHoldout)}</td><td class="n">${f4(x.logLossAll)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Tested beyond the previous 730-day limit (1,095 and 1,460 days, and no decay). Results change little: Brier ${f4(Math.min(...r.sensitivity.map(x => x.brierAll)))} to ${f4(Math.max(...r.sensitivity.map(x => x.brierAll)))}. Monte Carlo noise: re-running with another seed moves the Brier score to ${f4(r.monteCarlo.brierAll)} and any single probability by at most ${f3(r.monteCarlo.maxAbsProbabilityChange)}. This table is reported, not used to choose the settings.</p></section>

  <section class="case-section" aria-labelledby="h-unc"><header class="sec-head"><div><h2 id="h-unc">How uncertain is a probability?</h2></div></header>
    <ul class="unc">
      <li><b>Outcome uncertainty</b> — the probability itself: a 30% relegation risk means about three in ten such clubs go down, not that this one will.</li>
      <li><b>Model uncertainty</b> — the engine's ratings move only with results; injuries, transfers, coaches and fixture congestion are not in it. The calibration table shows how far the probabilities have been from reality, band by band.</li>
      <li><b>Sampling uncertainty</b> — the scores above rest on ${r.all.n} team-seasons and ${h.n} matches. The 95% intervals (bootstrap, ${V.bootstrapResamples.toLocaleString('en-GB')} resamples) show how much they could differ on other seasons.</li>
      <li><b>Simulation noise</b> — ${V.simulations.toLocaleString('en-GB')} simulations per replay: about ±${pc(Math.sqrt(0.25 / V.simulations) * 1.96).replace('%', '')} percentage points at most on a single probability.</li>
      <li><b>Rules and data</b> — fair play (cards) is not in the data; it would have been needed at the relegation line in ${pc2(r.unresolvedTieShare.mean)} of simulations on average (${pc2(r.unresolvedTieShare.max)} in the worst season), so its effect on any relegation probability is below 0.03 percentage points.</li></ul></section>

  <section class="case-section" aria-labelledby="h-replay"><header class="sec-head"><div>${kind('est')} ${kind('obs')}<h2 id="h-replay">Replay a past season yourself</h2><p class="muted">Choose a season and a matchday. Your browser fits the ratings on the results available at that point, simulates the rest of the season with the RFEF ranking rules, then shows what actually happened.</p></div></header>
    <div class="replay-ctl"><label>Season<select id="rs">${seasons.slice().reverse().map(s => `<option>${s}</option>`).join('')}</select></label>
      <label>After matchday<select id="rm">${[8, 10, 13, 16, 19, 22, 25, 28].map(m => `<option ${m === 13 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Simulations<select id="rn"><option>1000</option><option selected>4000</option><option>10000</option></select></label>
      <button type="button" class="btn btn-primary" id="run">Run the replay</button></div>
    <div id="replay" aria-live="polite"><p class="muted small">Not run yet.</p></div></section>

  <section class="case-section" aria-labelledby="h-gap"><header class="sec-head"><div>${kind('obs')}<h2 id="h-gap">Why there is no 2026/27 probability</h2><p class="muted">Three conditions must all hold: complete current-season data, a validated model, and independent approval. None is met yet.</p></div></header>
    <p><b>${miss.length} results missing</b> from the open dataset (openfootball, commit <span class="mono">${esc(D.source.commit.slice(0, 10))}</span>) for matches played before ${esc(dateLabel(DATA_AS_OF))}: ${esc(byMd.map(([m, n]) => `matchday ${m}: ${n}`).join(', '))}.</p>
    <details class="missing"><summary>The ${miss.length} missing matches</summary><div class="table-wrap"><table><thead><tr><th>Date</th><th class="n">Matchday</th><th>Home</th><th>Away</th></tr></thead><tbody>${miss.map(m => `<tr><td>${esc(m.date)}</td><td class="n">${m.matchday}</td><td>${esc(m.home)}</td><td>${esc(m.away)}</td></tr>`).join('')}</tbody></table></div></details>
    <p><b>Data rights needed:</b> the results must come from a source whose terms allow this reuse — a newer commit of the CC0 openfootball data, or a licensed results feed. Results reported in the press are facts, but copying a league table or a feed from a website against its terms is not allowed. LANOVA does not scrape.</p></section>

  <section class="case-section method"><header class="sec-head"><div><h2>Method, reproduction and limits</h2></div></header>
    <div class="method-grid"><div><h3>Model</h3><ul><li>${esc(V.model)}</li><li>${esc(V.rankingRules)}</li><li>Strict chronology: settings chosen on 2015/16–2018/19; tested on later seasons; each forecast uses results dated before its cut-off; a match postponed beyond a cut-off counts as unplayed.</li></ul></div>
    <div><h3>Reproduce</h3><ol>${V.reproduce.map(x => `<li><span class="mono">${esc(x)}</span></li>`).join('')}</ol><p class="small muted">Deterministic: fixed seeds, no clock. The report file is checked byte for byte by the tests.</p></div>
    <div><h3>Limits</h3><ul><li>Relegation advantage on unseen seasons not established (interval includes zero).</li><li>Mid-range relegation probabilities rest on few cases.</li><li>No injuries, transfers, coaches, expected goals or odds; results only.</li><li>Fair play not modelled (negligible in practice, quantified above).</li><li>Official tables verified on relegated clubs and ${rk.positionsChecked} positions, not every row.</li><li>Not a betting tool.</li></ul></div></div></section>`;
  document.getElementById('run').addEventListener('click', run);
}
function run() {
  const box = document.getElementById('replay'), season = document.getElementById('rs').value, md = Number(document.getElementById('rm').value), n = Number(document.getElementById('rn').value);
  box.innerHTML = '<p class="muted" role="status">Fitting the ratings and simulating…</p>';
  setTimeout(() => {
    const ch = {...V.tuning.chosen, halfLife: V.tuning.chosen.halfLife === 'none' ? Infinity : V.tuning.chosen.halfLife};
    const t0 = performance.now(), rp = replay(D, season, md, {...ch, n, seed: V.seed}), ms = Math.round(performance.now() - t0);
    const rowsSorted = Object.entries(rp.sim).sort((a, b) => b[1].relegated - a[1].relegated || a[1].currentPoints - b[1].currentPoints);
    box.innerHTML = `<p class="small">Cut-off: results before <b>${esc(rp.cutOff)}</b> (latest result used: ${esc(rp.latestResultUsed)}; ${rp.ratingsFrom} matches). ${n.toLocaleString('en-GB')} simulations, seed ${V.seed}, ${ms} ms in your browser.${rp.unresolvedRelegationTies ? ` Ties needing fair play at the relegation line: ${(rp.unresolvedRelegationTies * 100).toFixed(2)}% of simulations (shared, not drawn).` : ''}</p>
      <div class="table-wrap"><table class="replay"><thead><tr><th>Team</th><th class="n">Points after matchday ${md}</th><th class="n">Expected final points</th><th class="n">Simulated relegation share</th><th class="n">Actual final position</th></tr></thead><tbody>
      ${rowsSorted.map(([t, x]) => { const a = rp.actual?.[t]; return `<tr class="${a?.relegated ? 'breach' : ''}"><td>${esc(rp.names[t])}</td><td class="n">${x.currentPoints}</td><td class="n">${x.expectedPoints.toFixed(1)}</td><td class="n"><span class="bar" data-w="${Math.round(x.relegated * 100)}"></span>${pc(x.relegated)}</td><td class="n">${a ? `${a.position}${a.relegated ? ' · relegated' : ''}${a.decidedBy && /head-to-head/.test(a.decidedBy) ? ' · on head-to-head' : ''}` : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="small muted">${kind('est')} simulated from the results available at the cut-off, ranked with the RFEF rules. ${kind('obs')} actual final positions from the official rules (attached after the simulation). Highlighted: clubs actually relegated.</p>`;
    // Bar widths via the CSSOM: the page's CSP forbids inline style attributes.
    box.querySelectorAll('.bar[data-w]').forEach(b => b.style.setProperty('--w', `${b.dataset.w}%`));
    box.dataset.season = season; box.dataset.matchday = String(md);
  }, 30);
}
Promise.all([fetch('../data/forecast-validation-v2.json').then(r => r.json()), fetch('../data/laliga.json').then(r => r.json())])
  .then(([v, d]) => { V = v; D = d; page(); void allMatches; })
  .catch(e => { root.innerHTML = `<div class="notice" role="alert">The validation report could not be loaded (${esc(e.message)}).</div>`; });
