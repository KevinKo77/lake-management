/**
 * Football Forecast Lab — interface. Shows the validation report (produced by scripts/forecast-validation.mjs and
 * checked by the tests) and runs historical replays live with lanova/cases/forecast.js. No current-season probability
 * is computed or shown on this page.
 */
import {replay} from '../forecast.js';

const root = document.getElementById('lab');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const kind = k => `<span class="kind ${k}">${esc({obs: 'Observed', est: 'Model estimate'}[k])}</span>`;
const f3 = v => Number(v).toFixed(3), pc = v => `${Math.round(v * 100)}%`, better = (a, b) => ((b - a) / b * 100).toFixed(1);
let D = null, V = null;

function reliability(bins, title) {
  const W = 300, P = 34, S = W - P - 10, x = v => P + v * S, y = v => 10 + (1 - v) * S, maxN = Math.max(...bins.map(b => b.n));
  return `<figure class="rel"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(title)}: predicted against observed frequency">
    <rect x="${P}" y="10" width="${S}" height="${S}" class="frame"/>${[0, 0.25, 0.5, 0.75, 1].map(v => `<text x="${P - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text><text x="${x(v)}" y="${W - 8}" text-anchor="middle">${v}</text>`).join('')}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" class="diag"/>
    ${bins.map(b => `<circle${b.n < 20 ? ' class="few"' : ''} cx="${x(b.predicted)}" cy="${y(b.observed)}" r="${3 + 7 * Math.sqrt(b.n / maxN)}"><title>${b.n} forecasts between ${b.lo} and ${b.hi}: predicted ${f3(b.predicted)}, observed ${f3(b.observed)}</title></circle>`).join('')}</svg>
    <figcaption>${esc(title)}</figcaption></figure>`;
}
function page() {
  const h = V.holdout, r = V.relegation, c = V.tuning.chosen, seasons = r.seasons;
  root.innerHTML = `
  <section class="case-section"><header class="sec-head"><div><h2>Publication status</h2></div></header>
    <div class="status-grid">
      ${Object.values(V.criteria).map(x => `<div class="crit ${x.passed ? 'ok' : 'no'}"><b>${x.passed ? 'Passed' : 'Not passed'}</b><span>${esc(x.text)}</span></div>`).join('')}
      <div class="crit hold"><b>Independent validation: pending</b><span>${esc(V.publication)}</span></div>
      <div class="crit hold"><b>Current season: blocked</b><span>The open dataset has 2026/27 results only to matchday 7 (20 September 2026). A season simulation needs every team's results to date; until then no 2026/27 probability is computed here.</span></div>
    </div></section>

  <section class="case-section"><header class="sec-head"><div>${kind('est')}<h2>Match forecasts on unseen seasons</h2><p class="muted">Every match of ${h.seasons[0]} to ${h.seasons.at(-1)} (${h.n} matches) forecast one matchday at a time with only earlier results, then compared with what happened. Settings chosen beforehand on ${V.tuning.seasons[0]} to ${V.tuning.seasons.at(-1)}: half-life ${c.halfLife} days, ${c.k} prior matches${c.dixonColes ? ', low-score correction' : ''}.</p></div></header>
    <div class="table-wrap"><table><thead><tr><th>Score (lower is better)</th><th class="n">LANOVA engine</th><th class="n">Past frequencies</th><th class="n">Uniform ⅓</th><th class="n">Improvement on past frequencies</th></tr></thead><tbody>
      ${[['Log loss', 'logLoss'], ['Brier score', 'brier'], ['Ranked probability score', 'rps']].map(([l, k]) => `<tr><td>${l}</td><td class="n"><b>${f3(h.model[k])}</b></td><td class="n">${f3(h.baseRates[k])}</td><td class="n">${f3(h.uniform[k])}</td><td class="n">${better(h.model[k], h.baseRates[k])}%</td></tr>`).join('')}
    </tbody></table></div>
    <div class="table-wrap"><table class="seasons"><thead><tr><th>Season</th>${h.perSeason.map(s => `<th class="n">${s.season}</th>`).join('')}</tr></thead><tbody><tr><td>Log loss, engine</td>${h.perSeason.map(s => `<td class="n">${f3(s.model.logLoss)}</td>`).join('')}</tr><tr><td>Log loss, past frequencies</td>${h.perSeason.map(s => `<td class="n">${f3(s.baseRates.logLoss)}</td>`).join('')}</tr></tbody></table></div>
    <h3>Calibration: when the engine says 40%, does it happen about 40% of the time?</h3>
    <div class="rels">${reliability(h.calibration.home.bins, `Home win (error ${f3(h.calibration.home.ece)})`)}${reliability(h.calibration.draw.bins, `Draw (error ${f3(h.calibration.draw.ece)})`)}${reliability(h.calibration.away.bins, `Away win (error ${f3(h.calibration.away.ece)})`)}</div>
    <p class="small muted">Each circle groups forecasts by predicted probability (size = number of matches); on the diagonal, predictions match observed frequencies. Hollow circles: fewer than 20 forecasts, too few to judge. Error = expected calibration error.</p></section>

  <section class="case-section"><header class="sec-head"><div>${kind('est')}<h2>Relegation risk after matchday 13</h2><p class="muted">For ${seasons[0]} to ${seasons.at(-1)} (${r.all.n} team-seasons): the engine simulated the rest of each season ${V.simulations.toLocaleString('en-GB')} times from the table after matchday 13 (seed ${V.seed}), using only results available then. Compared with the share of teams relegated from the same position in earlier seasons, and with a flat 3 in 20.</p></div></header>
    <div class="table-wrap"><table><thead><tr><th>Score (lower is better)</th><th class="n">LANOVA engine</th><th class="n">Position at matchday 13</th><th class="n">Flat 15%</th></tr></thead><tbody>
      <tr><td>Brier score, all ${r.all.n}</td><td class="n"><b>${f3(r.all.model.brier)}</b></td><td class="n">${f3(r.all.position.brier)}</td><td class="n">${f3(r.all.uniform.brier)}</td></tr>
      <tr><td>Log loss, all ${r.all.n}</td><td class="n"><b>${f3(r.all.model.logLoss)}</b></td><td class="n">${f3(r.all.position.logLoss)}</td><td class="n">${f3(r.all.uniform.logLoss)}</td></tr>
      <tr><td>Brier score, unseen seasons only (${r.holdout.n})</td><td class="n"><b>${f3(r.holdout.model.brier)}</b></td><td class="n">${f3(r.holdout.position.brier)}</td><td class="n">${f3(r.holdout.uniform.brier)}</td></tr></tbody></table></div>
    <div class="rels one">${reliability(r.calibration.bins, `Relegation probability (error ${f3(r.calibration.ece)})`)}<div class="small"><p><b>Read with care.</b> Most teams sit below 20%, where the engine is well calibrated. Few forecasts fall between 20% and 80% (${r.calibration.bins.filter(b => b.lo >= 0.2 && b.hi <= 0.8).reduce((s, b) => s + b.n, 0)} team-seasons), and there the observed frequencies differ from the forecasts: those bins are too small to judge, and this is one reason the engine is not yet used to publish a probability.</p></div></div></section>

  <section class="case-section" aria-labelledby="h-replay"><header class="sec-head"><div>${kind('est')} ${kind('obs')}<h2 id="h-replay">Replay a past season yourself</h2><p class="muted">Choose a season and a matchday. Your browser fits the ratings on the results available at that point, simulates the rest of the season, then shows what actually happened.</p></div></header>
    <div class="replay-ctl"><label>Season<select id="rs">${seasons.slice().reverse().map(s => `<option>${s}</option>`).join('')}</select></label>
      <label>After matchday<select id="rm">${[8, 10, 13, 16, 19, 22, 25, 28].map(m => `<option ${m === 13 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Simulations<select id="rn"><option>1000</option><option selected>4000</option><option>10000</option></select></label>
      <button type="button" class="btn btn-primary" id="run">Run the replay</button></div>
    <div id="replay" aria-live="polite"><p class="muted small">Not run yet.</p></div></section>

  <section class="case-section method"><header class="sec-head"><div><h2>Method, data and limits</h2></div></header>
    <div class="method-grid"><div><h3>Model</h3><ul><li>${esc(V.model)}</li><li>A match's probabilities come from the two teams' expected goals; a season is simulated by drawing every remaining score.</li><li>Ranking in the simulation: points, goal difference, goals scored. LaLiga's first tie-breaker (head-to-head) is not modelled.</li></ul></div>
    <div><h3>Data</h3><ul><li>openfootball/espana, commit <span class="mono">${esc(V.source.commit.slice(0, 10))}</span>, ${esc(V.source.licence)}.</li><li>Results only: no expected goals, no player data, no betting odds.</li><li>The report is produced by <span class="mono">scripts/forecast-validation.mjs</span> and reproduced exactly by the tests (fixed seed, no clock).</li></ul></div>
    <div><h3>Limits</h3><ul><li>The chosen half-life is at the edge of the tested range: longer memories were not tested.</li><li>Injuries, transfers, managers and fixture congestion are not modelled; strengths move only with results.</li><li>Calibration of mid-range relegation risks rests on few cases.</li><li>Not a betting tool. No odds are compared or offered.</li></ul></div></div></section>`;
  document.getElementById('run').addEventListener('click', run);
}
function run() {
  const box = document.getElementById('replay'), season = document.getElementById('rs').value, md = Number(document.getElementById('rm').value), n = Number(document.getElementById('rn').value);
  box.innerHTML = '<p class="muted" role="status">Fitting the ratings and simulating…</p>';
  setTimeout(() => {
    const t0 = performance.now(), rp = replay(D, season, md, {...V.tuning.chosen, n, seed: V.seed}), ms = Math.round(performance.now() - t0);
    const rowsSorted = Object.entries(rp.sim).sort((a, b) => b[1].relegated - a[1].relegated || a[1].currentPoints - b[1].currentPoints);
    box.innerHTML = `<p class="small">Cut-off: results before <b>${esc(rp.cutOff)}</b> (latest result used: ${esc(rp.latestResultUsed)}; ${rp.ratingsFrom} matches). ${n.toLocaleString('en-GB')} simulations, seed ${V.seed}, ${ms} ms in your browser.</p>
      <div class="table-wrap"><table class="replay"><thead><tr><th>Team</th><th class="n">Points after matchday ${md}</th><th class="n">Expected final points</th><th class="n">Simulated relegation share</th><th class="n">Actual final position</th></tr></thead><tbody>
      ${rowsSorted.map(([t, x]) => { const a = rp.actual?.[t]; return `<tr class="${a?.relegated ? 'breach' : ''}"><td>${esc(rp.names[t])}</td><td class="n">${x.currentPoints}</td><td class="n">${x.expectedPoints.toFixed(1)}</td><td class="n"><span class="bar" data-w="${Math.round(x.relegated * 100)}"></span>${pc(x.relegated)}</td><td class="n">${a ? `${a.position}${a.relegated ? ' · relegated' : ''}` : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="small muted">${kind('est')} simulated from the results available at the cut-off. ${kind('obs')} actual final positions (attached after the simulation). Highlighted: teams actually relegated.</p>`;
    // Bar widths via the CSSOM: the page's CSP forbids inline style attributes.
    box.querySelectorAll('.bar[data-w]').forEach(b => b.style.setProperty('--w', `${b.dataset.w}%`));
    box.dataset.season = season; box.dataset.matchday = String(md);
  }, 30);
}
Promise.all([fetch('../data/forecast-validation.json').then(r => r.json()), fetch('../data/laliga.json').then(r => r.json())])
  .then(([v, d]) => { V = v; D = d; page(); })
  .catch(e => { root.innerHTML = `<div class="notice" role="alert">The validation report could not be loaded (${esc(e.message)}).</div>`; });
