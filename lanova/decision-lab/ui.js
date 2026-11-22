/**
 * LANOVA Survival Decision Lab — page interface. Display and input only: every financial figure comes from lab.js,
 * which runs the published LANOVA Finance engine (../finance/engine/). Nothing is sent or stored.
 */
import {SNAPSHOT, STRATEGIES, defaults, evaluate, fmt, START_MONTH, HORIZON} from './lab.js';

const main = document.getElementById('main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const signed = v => (Math.abs(v) < 0.5 ? '0' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
const cls = v => (v < -0.005 ? 'neg' : v > 0.005 ? 'pos' : '');
const S = {inp: defaults(), view: 'stay'};

const get = path => path.split('.').reduce((o, k) => o[k], S.inp);
function set(path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], S.inp)[last] = v; }
const field = (path, label, {scale = 1, step = 'any', hint = '', min = 0} = {}) => {
  const v = get(path);
  return `<label>${esc(label)}<input type="number" inputmode="decimal" min="${min}" step="${step}" data-k="${path}" data-scale="${scale}" value="${esc(Number.isFinite(v) ? +(v * scale).toFixed(4) : '')}">${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
};
const table = (head, rows, numeric = i => i > 0) => `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${numeric(i) ? 'n' : ''}" scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td class="${numeric(i) ? 'n' : ''}">${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;

function shell() {
  const s = SNAPSHOT;
  main.innerHTML = `
  <section class="hero">
    <p class="eyebrow">LANOVA Survival Decision Lab · Case 1</p>
    <h1>Málaga CF — The Cost of Survival</h1>
    <p class="lede">Bottom of LaLiga with ${s.points} points from ${s.played} matches. Should the club stand still, buy goals or buy solidity in January? Set your own assumptions and see, side by side, how many points each strategy would need to deliver and what it would cost in cash — if the club stays up, and if it does not.</p>
  </section>

  <section class="card" aria-labelledby="h-season">
    <header><div><h2 id="h-season">1 · Where the season stands</h2><p class="muted small">Reference: ${esc(s.state)}. <a href="#sources">Sources and limits</a></p></div></header>
    <div class="facts">
      <div class="kpi"><span>Position</span><b>${s.position}th / 20</b><small>${esc(s.competition)}</small></div>
      <div class="kpi"><span>Record</span><b>${s.won}W ${s.drawn}D ${s.lost}L</b><small>Goals ${s.goalsFor}–${s.goalsAgainst}</small></div>
      <div class="kpi"><span>Points</span><b>${s.points}</b><small>after ${s.played} of ${s.totalMatches} matches</small></div>
      <div class="kpi"><span>Matches left</span><b id="left">${s.totalMatches - s.played}</b><small>up to ${3 * (s.totalMatches - s.played)} points available</small></div>
    </div>
    <div class="grid inputs">
      ${field('sport.points', 'Current points (editable)', {step: 1})}
      ${field('sport.played', 'Matches played (editable)', {step: 1})}
      ${S.inp.sport.thresholds.map((_, i) => field(`sport.thresholds.${i}`, `Hypothetical survival threshold ${i + 1} (points)`, {step: 1})).join('')}
    </div>
    <p class="muted small">Survival thresholds are hypotheses to test, not a prediction of the final table: the points needed to stay up depend on every other club.</p>
  </section>

  <section class="card" aria-labelledby="h-strat">
    <header><div><h2 id="h-strat">2 · Three strategies</h2><p class="muted small">Points gained are <b>your hypotheses</b> for the ${s.totalMatches - s.played} remaining matches. They are not the measured or expected effect of any player or transfer. Deal terms are hypothetical.</p></div></header>
    <div class="strategies">
      ${STRATEGIES.map(st => `<article class="strategy s-${st.id}" aria-label="${esc(st.label)}">
        <h3>${esc(st.label)}</h3><p class="muted small">${esc(st.text)}</p>
        <div class="grid tight">
          ${field(`${st.id}.gain`, 'Hypothetical points gained (rest of season)', {step: 1})}
          ${st.decisions.length ? `
          ${field(`${st.id}.transferFee`, 'Transfer or loan fee (EUR)', {step: 50000})}
          <label>Fee payment schedule<select data-k="${st.id}.instalments">${[1, 2, 3].map(n => `<option value="${n}" ${S.inp[st.id].instalments === n ? 'selected' : ''}>${n === 1 ? 'Single payment, Jan 2027' : `${n} equal instalments, every 6 months`}</option>`).join('')}</select></label>
          ${field(`${st.id}.agentFee`, 'Agent and intermediary fees (EUR)', {step: 10000})}
          ${field(`${st.id}.signingBonus`, 'Signing bonus (EUR)', {step: 10000})}
          ${field(`${st.id}.monthlyWage`, 'Extra gross wage per month (EUR)', {step: 5000})}
          ${field(`${st.id}.employerChargeRate`, 'Employer charges (% of wage)', {scale: 100, step: 1})}
          ${field(`${st.id}.contractMonths`, 'Contract length (months, max 24)', {step: 1, min: 1})}` : '<p class="muted small">No fee, no extra wage. The reference against which B and C are costed.</p>'}
        </div></article>`).join('')}
    </div>
  </section>

  <section class="card" aria-labelledby="h-fin">
    <header><div><h2 id="h-fin">3 · Financial frame <span class="tag warn">fictional</span></h2><p class="muted small">An illustrative top-flight budget, January 2027 → December 2028. <b>None of these figures is Málaga CF data.</b> Replace them with your own in a private demo.</p></div></header>
    <div class="grid">
      ${field('finance.openingCash', 'Cash available on 1 January 2027 (EUR, fictional)', {step: 100000})}
      ${field('finance.minimumCash', 'Minimum cash policy (EUR, fictional)', {step: 100000})}
      ${field('finance.recruitmentBudget', 'January recruitment budget (EUR, fictional)', {step: 100000, hint: 'Compared with cash spent by June 2027.'})}
      ${field('finance.relegatedMediaPct', 'If relegated: media revenue from July 2027 (% of LaLiga level)', {step: 1})}
      ${field('finance.relegatedOtherPct', 'If relegated: other revenue (% of LaLiga level)', {step: 1})}
      ${field('finance.relegatedPayrollPct', 'If relegated: payroll after relegation clauses (%)', {step: 1})}
    </div>
  </section>

  <div id="results" aria-live="polite"></div>

  <section class="card" id="sources" aria-labelledby="h-src">
    <header><h2 id="h-src">Sources, assumptions and limits</h2></header>
    <h3>Sporting data</h3>
    <ul class="small">
      <li><b>Reference date:</b> ${esc(s.referenceDate)} — ${esc(s.state)}. Only Málaga CF's own record is used (position, record, goals, points); no full league table is reproduced.</li>
      <li><b>Sources consulted</b> (consistent with each other at the reference date): ${s.sources.map(x => `<a href="${esc(x.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(x.name)}</a>`).join(' · ')}. Results are public facts; these sites are cited, not copied, and no data feed is used.</li>
      <li><b>Known discrepancy:</b> ${esc(s.discrepancy)}</li>
      <li>Not checked against the official LaLiga data feed. Verify on laliga.com before relying on it; points and matches played can be edited above.</li>
    </ul>
    <h3>What the lab does — and does not — say</h3>
    <ul class="small">
      <li><b>No probability is shown.</b> LANOVA does not publish a survival probability for this case: no model has been calibrated and validated on it. Every outcome is conditional: “if the club stays up”, “if it is relegated”.</li>
      <li><b>Points gained are hypotheses.</b> The difference between strategies is the difference between the numbers you typed. It is not evidence that a player or a transfer produces those points. “Cost per extra point” is a ratio of your inputs, not a measured return.</li>
      <li><b>Finance is fictional.</b> Cash, budget, payroll, revenue and deal terms are invented for the demonstration and do not describe Málaga CF's accounts.</li>
      <li><b>Calculation:</b> every cash figure comes from the LANOVA Finance engine (${esc(evaluate(S.inp).engine ?? 'finance-1.1')}), the same one as the <a href="/lanova/finance/">Finance demonstration</a>, run in your browser. Signings are modelled as player decisions: fee and agent fees capitalised and paid on the chosen schedule, wages and employer charges monthly, signing bonus paid at signing. Month-end balances; no tax, no sell-on, no performance bonuses, no prize money.</li>
      <li>Horizon ${HORIZON} months from ${START_MONTH}. After relegation, the scenario factors you set apply from July 2027 to revenue and to the whole payroll, including new contracts.</li>
    </ul>
  </section>

  <section class="card cta-card" aria-labelledby="h-cta">
    <h2 id="h-cta">Run this on your own club</h2>
    <p class="muted">In a private LANOVA demo we load your real budget, contracts and payment schedules on an approved machine, and compare your actual January options — cash, commitments and covenants, month by month.</p>
    <div class="next"><a class="btn primary" href="/demo.html" data-cta="decision-lab-request">Request a private demo</a><a class="btn" href="mailto:kevin@lake-am.com?subject=LANOVA%20Decision%20Lab%20%E2%80%94%20private%20demo">kevin@lake-am.com</a></div>
  </section>`;
}

// ------------------------------------------------------------------ charts (display only)
function pointsChart(r) {
  const ths = S.inp.sport.thresholds, hi = Math.max(...ths, ...r.strategies.map(s => s.points.total), 10) * 1.08, W = 1000, rowH = 46, L = 230, top = 26, H = top + rowH * 3 + 30;
  const x = v => L + (v / hi) * (W - L - 20);
  return `<svg class="chart pts" viewBox="0 0 ${W} ${H}" role="img" aria-label="Total points per strategy compared with the hypothetical survival thresholds; values are in the table below">
    ${ths.map((t, i) => `<line class="thr" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 24}"/><text class="thr-l" x="${x(t)}" y="${i % 2 ? H - 8 : 14}" text-anchor="middle">${t} pts</text>`).join('')}
    ${r.strategies.map((s, i) => { const y = top + i * rowH; return `<text x="8" y="${y + 24}">${esc(s.label)}</text>
      <rect class="bar-now" x="${L}" y="${y + 6}" width="${x(S.inp.sport.points) - L}" height="26"/>
      <rect class="bar b-${s.id}" x="${x(S.inp.sport.points)}" y="${y + 6}" width="${Math.max(0, x(s.points.total) - x(S.inp.sport.points))}" height="26"/>
      <text class="val" x="${x(s.points.total) + 6}" y="${y + 24}">${s.points.total}</text>`; }).join('')}
  </svg><p class="legend"><span><i class="sw-now"></i>Points today</span><span><i class="sw-gain"></i>Hypothetical gain</span><span><i class="sw-thr"></i>Hypothetical thresholds</span></p>`;
}
function cashChart(r, view) {
  const series = r.strategies.map(s => s.series[view]), all = series.flat(), lo = Math.min(0, r.minimumCash, ...all), hi = Math.max(r.minimumCash, ...all) * 1.05;
  const W = 1000, H = 280, L = 96, B = 28, n = r.months.length, x = t => L + (t / (n - 1)) * (W - L - 12), y = v => 10 + (hi - v) / (hi - lo || 1) * (H - B - 10);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Month-end cash by strategy ${view === 'stay' ? 'if the club stays up' : 'if the club is relegated'}; values are in the table">
    ${[hi, (hi + lo) / 2, lo].map(v => `<line class="axis" x1="${L}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}"/><text x="4" y="${y(v) + 4}">${esc(fmt(v))}</text>`).join('')}
    ${lo < 0 ? `<line class="zero" x1="${L}" x2="${W - 12}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
    <line class="policy" x1="${L}" x2="${W - 12}" y1="${y(r.minimumCash)}" y2="${y(r.minimumCash)}"/>
    <line class="season" x1="${x(5.5)}" x2="${x(5.5)}" y1="10" y2="${H - B}"/><text x="${x(5.5) + 4}" y="22">end of 2026/27 season</text>
    ${[0, 6, 12, 18, 23].map(t => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${esc(r.months[t])}</text>`).join('')}
    ${series.map((v, i) => `<polyline class="l-${r.strategies[i].id}" points="${v.map((c, t) => `${x(t).toFixed(1)},${y(c).toFixed(1)}`).join(' ')}"/>`).join('')}
  </svg><p class="legend">${r.strategies.map(s => `<span><i class="sw-${s.id}"></i>${esc(s.label)}</span>`).join('')}<span><i class="sw-policy"></i>Minimum cash policy</span></p>`;
}

function results() {
  const box = document.getElementById('results'), r = evaluate(S.inp);
  document.getElementById('left').textContent = Number.isInteger(S.inp.sport.played) ? String(SNAPSHOT.totalMatches - S.inp.sport.played) : '—';
  if (r.problems.length) { box.innerHTML = `<div class="notice bad" role="alert"><b>Check these inputs — nothing is calculated until they are valid:</b><ul>${r.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`; return; }
  const st = r.strategies, ths = S.inp.sport.thresholds;
  box.innerHTML = `
  <section class="card" aria-labelledby="h-pts">
    <header><div><h2 id="h-pts">4 · Points: what each strategy would need to deliver</h2><p class="muted small">Total = current points + your hypothetical gain. Positive gap = above the threshold.</p></div></header>
    ${pointsChart(r)}
    ${table(['Strategy', 'Hypothetical gain', 'Points per match left', 'Total points', ...ths.map(t => `Gap to ${t}`)],
      st.map(s => [esc(s.label), String(s.points.gain), s.points.perMatch === null ? '—' : s.points.perMatch.toFixed(2), `<b>${s.points.total}</b>`, ...s.points.gaps.map(g => `<span class="${cls(g.gap)}">${g.gap > 0 ? '+' : g.gap < 0 ? '−' : ''}${Math.abs(g.gap)}</span>`)]))}
    <p class="muted small">To reach ${ths.map(t => `${t} points the club needs ${Math.max(0, t - S.inp.sport.points)} more (${r.remaining ? (Math.max(0, t - S.inp.sport.points) / r.remaining).toFixed(2) : '—'} per match)`).join('; ')}.</p>
  </section>

  <section class="card" aria-labelledby="h-cash">
    <header><div><h2 id="h-cash">5 · Cash: what each strategy costs <span class="tag warn">fictional finance</span></h2><p class="muted small">LANOVA Finance engine, EUR, month-end balances. Cost = cash difference with the status quo.</p></div>
      <div class="seg" role="group" aria-label="Condition shown in the chart">
        <button class="btn small" data-view="stay" aria-pressed="${S.view === 'stay'}">If the club stays up</button>
        <button class="btn small" data-view="down" aria-pressed="${S.view === 'down'}">If relegated</button></div></header>
    <div class="kpis">${st.map(s => `<div class="kpi ${s.constraints.some(c => c.level === 'high') ? 'bad' : ''}"><span>${esc(s.label)}</span><b>${s.id === 'A' ? '0' : fmt(s.cash.cost24)}</b><small>${s.id === 'A' ? 'reference: no extra cash spent' : `cash cost over ${HORIZON} months · ${fmt(s.cash.seasonCost)} by ${esc(r.seasonEnd)}`}</small></div>`).join('')}</div>
    ${cashChart(r, S.view)}
    ${table(['Strategy', `Cash spent by ${r.seasonEnd}`, 'Cash cost over 24 months', `Cash at ${r.seasonEnd}`, 'Cash Dec 2028 — stays up', 'Cash Dec 2028 — relegated', 'Lowest cash — stays up', 'Lowest cash — relegated'],
      st.map(s => [esc(s.label), fmt(s.cash.seasonCost), fmt(s.cash.cost24), fmt(s.cash.seasonCash), fmt(s.cash.stayClosing), `<span class="${cls(s.cash.downClosing)}">${fmt(s.cash.downClosing)}</span>`,
        `<span class="${s.cash.stayMinimum < r.minimumCash ? 'neg' : ''}">${fmt(s.cash.stayMinimum)}</span>`, `<span class="${s.cash.downMinimum < r.minimumCash ? 'neg' : ''}">${fmt(s.cash.downMinimum)}</span>`]))}
    <p class="muted small">${esc(r.notice)}</p>
  </section>

  <section class="card" aria-labelledby="h-trade">
    <header><h2 id="h-trade">6 · Constraints and trade-offs</h2></header>
    <div class="tradeoffs">${st.map(s => `<article><h3>${esc(s.label)}</h3>
      <p class="small">${s.points.total} points (hypothesis) · cash cost ${fmt(s.cash.cost24)} · ${s.cash.costPerExtraPoint === null ? (s.id === 'A' ? 'reference strategy' : 'no extra hypothetical point versus A') : `<b>${fmt(s.cash.costPerExtraPoint)}</b> per extra hypothetical point versus A (ratio of your inputs, not a measured return)`}</p>
      ${s.constraints.length ? s.constraints.map(c => `<div class="risk ${c.level}">${esc(c.text)}</div>`).join('') : '<div class="risk info">No constraint breached under these assumptions.</div>'}
    </article>`).join('')}</div>
    <p class="muted small">Read across: a strategy that clears more thresholds only on paper may still breach the cash policy if the club is relegated anyway. The lab shows both conditions so the trade-off is explicit; it does not say which condition will happen.</p>
    <div class="next noprint"><button class="btn primary" type="button" data-print>Print or save the report (PDF)</button><a class="btn" href="/demo.html" data-cta="decision-lab-request">Request a private demo</a><button class="btn ghost" type="button" data-reset>Reset the assumptions</button></div>
  </section>`;
}

// ------------------------------------------------------------------ events
main.addEventListener('input', e => {
  const k = e.target.dataset?.k; if (!k) return;
  const raw = e.target.value.trim(), scale = Number(e.target.dataset.scale ?? 1);
  set(k, e.target.tagName === 'SELECT' ? Number(raw) : raw === '' ? NaN : Number(raw) / scale);
  results();
});
main.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) { S.view = b.dataset.view; results(); }
  else if (b.hasAttribute('data-print')) window.print();
  else if (b.hasAttribute('data-reset')) { S.inp = defaults(); shell(); results(); }
});
shell(); results();
