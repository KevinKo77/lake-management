/**
 * LANOVA Survival Decision Lab — case "Málaga CF — The Cost of Survival".
 *
 * Pure functions, no DOM: they build a FICTIONAL financial plan and run it through the LANOVA Finance engine that is
 * already published at /lanova/finance/engine/ (copied byte for byte from KevinKo77/lake-intelligence, SHA-256
 * manifest). Every financial figure comes from that engine's forecast(); this file contains no financial formula of
 * its own. The only arithmetic here is on league points (current points + the user's hypothetical gain).
 *
 * No probability is computed or shown. A points gain is a hypothesis typed by the user, never the measured or
 * expected effect of a player or a transfer.
 */
import {forecast, validatePlan, monthLabel, REVENUE, EXPENSE, MONTH_END_NOTICE} from '../finance/engine/model.js';

/** Sporting facts used as the reference, with their sources and limits. Only Málaga CF's own line is used. */
export const SNAPSHOT = Object.freeze({
  referenceDate: '2026-11-22',
  competition: 'LaLiga EA Sports 2026/27 (Primera División)',
  state: 'Results up to and including matchday 13 (Osasuna 1–0 Málaga CF, 22 November 2026)',
  team: 'Málaga CF', position: 20, played: 13, won: 0, drawn: 5, lost: 8, goalsFor: 9, goalsAgainst: 24, points: 5, totalMatches: 38,
  sources: [
    {name: 'Sofascore — Osasuna 1-0 Málaga CF match report', url: 'https://www.sofascore.com/news/osasuna-1-0-malaga-cf-rosier-shines-budimir-scores'},
    {name: 'Scoremondo — Osasuna 1-0 Málaga, 22 Nov 2026', url: 'https://scoremondo.com/en/match/osasuna-malaga-cf-31440002'},
    {name: 'Fichajes.com — Málaga CF, Primera División 2026/27', url: 'https://www.fichajes.com/equipo/malaga-cf/clasificacion'},
    {name: 'Futbolme — Málaga CF results and standing', url: 'https://futbolme.com/resultados-directo/equipo/malaga-cf/406/clasificacion/'},
  ],
  discrepancy: 'Some standings pages (Fox Sports, Goal, SoccerNews) still showed 12 matches played (0W 5D 7L, 9–23) when checked on the reference date, before the matchday-13 result was added. The 1–0 defeat at Osasuna is confirmed by two match reports. Points and matches played remain editable.',
  rights: 'Only public match facts about Málaga CF are shown (points, record, goals, position), re-typed by hand and attributed. No league table, fixture list, logo, photo or LaLiga content is reproduced, and no data feed or scraping is used.',
});

export const STRATEGIES = Object.freeze([
  {id: 'A', label: 'A · Status quo', decisions: [], text: 'No signing in the January window. The squad and the payroll stay as they are.'},
  {id: 'B', label: 'B · Offensive reinforcement', decisions: ['offensive', 'offensive-bonus'], text: 'Loan of an attacking player until the end of the season (hypothetical profile).'},
  {id: 'C', label: 'C · Defensive reinforcement', decisions: ['defensive', 'defensive-bonus'], text: 'Permanent signing of a defender, fee paid in instalments (hypothetical profile).'},
]);

/** Default inputs. Every financial figure is fictional; every points figure is an illustrative hypothesis to edit. */
export function defaults() {
  return {
    sport: {points: SNAPSHOT.points, played: SNAPSHOT.played, target: 40, thresholds: [34, 37, 43]},
    finance: {openingCash: 9_000_000, minimumCash: 3_000_000, recruitmentBudget: 4_000_000, relegatedMediaPct: 50, relegatedOtherPct: 75, relegatedPayrollPct: 55},
    A: {gain: 28},
    B: {gain: 33, transferFee: 1_200_000, instalments: 1, agentFee: 100_000, monthlyWage: 120_000, employerChargeRate: 0.3, contractMonths: 6, signingBonus: 0},
    C: {gain: 31, transferFee: 2_400_000, instalments: 3, agentFee: 200_000, monthlyWage: 70_000, employerChargeRate: 0.3, contractMonths: 18, signingBonus: 150_000},
  };
}

export const START_MONTH = '2027-01', HORIZON = 24, SEASON_END = 5; // month index of June 2027 (end of the 2026/27 season)
const AS_OF = SNAPSHOT.referenceDate, FICTIONAL = 'Fictional figure for the demonstration — not Málaga CF data';
const flat = v => Array(HORIZON).fill(v);
const line = (id, label, category, values) => ({id, label, category, values, cashLagMonths: 0, kind: 'assumption', source: FICTIONAL, asOf: AS_OF});
const scenario = (id, label, rev, cost, extra = {}) => ({id, label,
  revenueFactors: Object.fromEntries(REVENUE.map(c => [c, rev[c] ?? 1])), costFactors: Object.fromEntries(EXPENSE.map(c => [c, cost[c] ?? 1])),
  capexFactor: 1, extraCollectionLagMonths: 0, newLoanRateDelta: 0, fromMonth: 0, notes: '', ...extra});

/** Equal instalments every 6 months from the signing month, adding up exactly (in cents) to the fee. */
export function instalments(fee, n) {
  const cents = Math.round(fee * 100), part = Math.floor(cents / n);
  return Array.from({length: n}, (_, i) => ({month: i * 6, amount: (i === n - 1 ? cents - part * (n - 1) : part) / 100}));
}

const playerDecision = (id, label, s) => ({id, label, type: 'player', selected: false, startMonth: 0, kind: 'assumption', source: 'Hypothetical deal terms entered in the Decision Lab', asOf: AS_OF, notes: '',
  transferFee: s.transferFee, feePayments: s.transferFee > 0 ? instalments(s.transferFee, s.instalments) : [], agentFee: s.agentFee, contractMonths: s.contractMonths,
  monthlyWage: s.monthlyWage, employerChargeRate: s.employerChargeRate, signingBonus: 0});
/**
 * The signing bonus is entered as a one-month payroll change (cash and expense in January 2027) rather than through the
 * player decision's signingBonus field: in engine finance-1.1 that field's cash payment is scaled by the scenario's
 * payroll factor even before the scenario's fromMonth, which would wrongly shrink a January bonus in the
 * "relegated from July 2027" condition. Cash is identical; the expense is not spread over the contract.
 */
const bonusDecision = (id, label, s) => ({id, label, type: 'payroll_change', selected: false, startMonth: 0, kind: 'assumption', source: 'Hypothetical deal terms entered in the Decision Lab', asOf: AS_OF, notes: '',
  monthlyAmount: s.signingBonus, employerChargeRate: 0, endMonth: 0});

/** The fictional 24-month plan (January 2027 → December 2028) in the engine's lanova-finance-v1 format. */
export function buildPlan(inp) {
  const f = inp.finance, off = [5, 6, 17, 18]; // no home match in June and July
  const rel = {media: f.relegatedMediaPct / 100}, other = f.relegatedOtherPct / 100;
  for (const c of ['ticketing', 'sponsorship', 'commercial', 'other_revenue']) rel[c] = other;
  return {
    schema: 'lanova-finance-v1', name: 'Illustrative top-flight club — fictional budget 2027–2028', currency: 'EUR', fictional: true,
    startMonth: START_MONTH, horizonMonths: HORIZON, openingCash: f.openingCash, minimumCash: f.minimumCash, policy: {payrollRatioLimit: 0.7, minimumDscr: 1.2},
    source: 'LANOVA Survival Decision Lab. Every financial figure is fictional; none comes from Málaga CF.', asOf: AS_OF,
    lines: [
      line('media', 'League media rights', 'media', flat(3_500_000)),
      line('ticketing', 'Season tickets and matchday', 'ticketing', flat(700_000).map((v, t) => (off.includes(t) ? 0 : v))),
      line('sponsorship', 'Sponsorship', 'sponsorship', flat(450_000)),
      line('commercial', 'Commercial and retail', 'commercial', flat(300_000)),
      line('payroll', 'Squad and staff payroll', 'payroll', flat(3_000_000)),
      line('charges', 'Employer charges', 'payroll_taxes', flat(750_000)),
      line('operating', 'Operating costs', 'operating', flat(1_000_000)),
    ],
    capex: [], loans: [],
    scenarios: [
      scenario('base', 'Stays in LaLiga (conditional)', {}, {}),
      scenario('downside', 'Relegated from July 2027 (conditional)', rel, {payroll: f.relegatedPayrollPct / 100, payroll_taxes: f.relegatedPayrollPct / 100}, {fromMonth: SEASON_END + 1,
        notes: `From July 2027: media ${f.relegatedMediaPct}%, other revenue ${f.relegatedOtherPct}%, payroll ${f.relegatedPayrollPct}% of the LaLiga level (relegation clauses), all fictional.`}),
      scenario('upside', 'Not used in this case (same as base)', {}, {}),
    ],
    decisions: [playerDecision('offensive', 'Offensive reinforcement', inp.B), bonusDecision('offensive-bonus', 'Offensive reinforcement — signing bonus', inp.B),
      playerDecision('defensive', 'Defensive reinforcement', inp.C), bonusDecision('defensive-bonus', 'Defensive reinforcement — signing bonus', inp.C)],
    imports: [],
  };
}

/** Problems with the inputs (sporting and financial); the engine's own validation is added. Empty = computable. */
export function check(inp) {
  const p = [], s = inp.sport, num = (v, name, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) p.push(`${name}: a number between ${lo.toLocaleString('en-GB')} and ${hi.toLocaleString('en-GB')} is required`); };
  num(s.played, 'Matches played', 0, 37); if (!Number.isInteger(s.played)) p.push('Matches played: whole number required');
  num(s.points, 'Current points', 0, 3 * (s.played || 0)); if (!Number.isInteger(s.points)) p.push('Current points: whole number required');
  const remaining = SNAPSHOT.totalMatches - s.played;
  num(s.target, 'Season-end objective', 0, 3 * SNAPSHOT.totalMatches); if (!Number.isInteger(s.target)) p.push('Season-end objective: whole number required');
  s.thresholds.forEach((v, i) => num(v, `Threshold ${i + 1}`, 0, 3 * SNAPSHOT.totalMatches));
  for (const st of STRATEGIES) { const g = inp[st.id].gain; num(g, `${st.label}: points gained`, 0, 3 * Math.max(0, remaining)); if (!Number.isInteger(g)) p.push(`${st.label}: points gained must be a whole number`); }
  const f = inp.finance; num(f.recruitmentBudget, 'Recruitment budget', 0, 1e9);
  for (const k of ['relegatedMediaPct', 'relegatedOtherPct', 'relegatedPayrollPct']) num(f[k], k, 0, 200);
  for (const id of ['B', 'C']) { const d = inp[id]; if (![1, 2, 3].includes(d.instalments)) p.push(`${id}: 1, 2 or 3 instalments`); num(d.contractMonths, `${id}: contract months`, 1, HORIZON); }
  if (p.length) return p;
  return validatePlan(buildPlan(inp)).map(x => `Finance engine: ${x}`);
}

const ind = (f, id) => f.indicators.find(i => i.id === id)?.value ?? null;

/** Full evaluation: points per strategy against every threshold, and the engine's forecast for each strategy × condition. */
export function evaluate(inp) {
  const problems = check(inp);
  if (problems.length) return {problems};
  const plan = buildPlan(inp), s = inp.sport, remaining = SNAPSHOT.totalMatches - s.played;
  const runs = {};
  for (const st of STRATEGIES) for (const sc of ['base', 'downside']) runs[`${st.id}:${sc}`] = forecast(plan, {scenario: sc, decisions: st.decisions});
  const ref = runs['A:base'];
  const strategies = STRATEGIES.map(st => {
    const stay = runs[`${st.id}:base`], down = runs[`${st.id}:downside`], total = s.points + inp[st.id].gain;
    const seasonCash = stay.months[SEASON_END].closingCash, seasonCost = ref.months[SEASON_END].closingCash - seasonCash;
    const cost24 = ref.totals.closingCash - stay.totals.closingCash, extraPoints = inp[st.id].gain - inp.A.gain;
    const below = r => r.months.filter(m => m.closingCash < plan.minimumCash - 0.005).map(m => m.month);
    const constraints = [];
    if (seasonCost > inp.finance.recruitmentBudget + 0.005) constraints.push({level: 'high', text: `Cash spent by June 2027 (EUR ${fmt(seasonCost)}) exceeds the fictional recruitment budget (EUR ${fmt(inp.finance.recruitmentBudget)}).`});
    for (const [r, name] of [[stay, 'if the club stays up'], [down, 'if the club is relegated']]) {
      const b = below(r); if (b.length) constraints.push({level: 'high', text: `Month-end cash below the minimum cash policy ${name}: ${b.length} month(s), first in ${b[0]} (lowest EUR ${fmt(r.totals.minimumCash)}).`});
    }
    const after = stay.commitments.transferPaymentsAfterHorizon; if (after > 0.005) constraints.push({level: 'medium', text: `EUR ${fmt(after)} of transfer instalments fall due after December 2028.`});
    const d = st.decisions.length && inp[st.id];
    if (d && d.contractMonths > SEASON_END + 1) constraints.push({level: 'medium', text: `The contract runs ${d.contractMonths} months: wages continue after June 2027, in LaLiga or after relegation (scaled by the relegation payroll assumption).`});
    return {id: st.id, label: st.label, points: {gain: inp[st.id].gain, total, perMatch: remaining ? inp[st.id].gain / remaining : null,
      target: {gap: total - s.target, met: total >= s.target},
      gaps: s.thresholds.map(th => ({threshold: th, gap: total - th, needed: Math.max(0, th - s.points), neededPerMatch: remaining ? Math.max(0, th - s.points) / remaining : null}))},
      cash: {seasonCost, cost24, seasonCash, stayClosing: stay.totals.closingCash, downClosing: down.totals.closingCash, stayMinimum: stay.totals.minimumCash, downMinimum: down.totals.minimumCash,
        ebitdaStay: ind(stay, 'ebitda'), payrollRatioStay: ind(stay, 'payrollRatio'), afterHorizon: after,
        costPerExtraPoint: st.id !== 'A' && extraPoints > 0 ? cost24 / extraPoints : null},
      series: {stay: stay.months.map(m => m.closingCash), down: down.months.map(m => m.closingCash)}, constraints};
  });
  const needed = Math.max(0, s.target - s.points);
  const pace = {target: s.target, needed, perMatch: remaining ? needed / remaining : null, reachable: needed <= 3 * remaining,
    // Exact win/draw combinations worth the points needed within the matches left (arithmetic only, not a prediction):
    // the one with the fewest wins and the one with the most wins.
    paths: (() => { const c = []; for (let w = 0; w <= Math.floor(needed / 3); w++) { const d = needed - 3 * w; if (w + d <= remaining) c.push({wins: w, draws: d, losses: remaining - w - d}); } return c.length ? [c[0], c[c.length - 1]].filter((x, i, a) => i === 0 || x !== a[0]) : []; })()};
  return {problems: [], plan, remaining, pace, strategies, months: ref.months.map(m => m.month), minimumCash: plan.minimumCash, engine: ref.engine, notice: MONTH_END_NOTICE, seasonEnd: monthLabel(START_MONTH, SEASON_END)};
}

/** Comparison rows shared by the screen, the CSV and the presentation summary. */
export function comparison(r) {
  return r.strategies.map(s => ({strategy: s.label, gain: s.points.gain, total: s.points.total, pace: s.points.perMatch, targetGap: s.points.target.gap,
    cost24: s.cash.cost24, seasonCost: s.cash.seasonCost, seasonCash: s.cash.seasonCash, stayClosing: s.cash.stayClosing, downClosing: s.cash.downClosing,
    lowest: Math.min(s.cash.stayMinimum, s.cash.downMinimum), constraints: s.constraints.map(c => c.text)}));
}

const csvCell = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : `"${String(v ?? '').replace(/"/g, '""')}"`);
/** CSV export of the comparison (UTF-8, comma-separated), with the notices on the first lines. */
export function summaryCsv(r, inp) {
  const head = ['Strategy', 'Hypothetical points gained', 'Points per match (hypothesis)', 'Total points (conditional)', `Gap to objective ${inp.sport.target}`,
    'Cash cost over 24 months (EUR)', `Cash spent by ${r.seasonEnd} (EUR)`, `Cash at ${r.seasonEnd} (EUR)`, 'Cash Dec 2028 if stays up (EUR)', 'Cash Dec 2028 if relegated (EUR)', 'Lowest month-end cash (EUR)', 'Constraints'];
  const rows = comparison(r).map(c => [c.strategy, c.gain, c.pace ?? '', c.total, c.targetGap, c.cost24, c.seasonCost, c.seasonCash, c.stayClosing, c.downClosing, c.lowest, c.constraints.join(' | ')]);
  return [[`LANOVA Decision Lab — Málaga CF: The Cost of Survival. Independent study, not affiliated with Málaga CF or LaLiga. Financial data fictional. Points gains are hypotheses, not effects of any player or transfer. No survival probability.`],
    [`Reference: ${SNAPSHOT.state}. ${inp.sport.points} points after ${inp.sport.played} matches; ${r.remaining} left. Objective ${inp.sport.target} points (hypothetical, not the real survival threshold): ${r.pace.needed} points needed, ${r.pace.perMatch === null ? '—' : r.pace.perMatch.toFixed(2)} per match.`],
    head, ...rows].map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** Self-contained one-page HTML summary for a sales presentation (no external resource, printable). */
export function summaryHtml(r, inp, generatedAt = new Date().toISOString().slice(0, 10)) {
  const rows = comparison(r), sgn = v => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
  const deals = ['B', 'C'].map(id => { const d = inp[id]; return `<li><b>${h(STRATEGIES.find(x => x.id === id).label)}</b>: fee EUR ${fmt(d.transferFee)} in ${d.instalments} payment(s), agent EUR ${fmt(d.agentFee)}, signing bonus EUR ${fmt(d.signingBonus)}, wage EUR ${fmt(d.monthlyWage)}/month + ${Math.round(d.employerChargeRate * 100)}% charges, ${d.contractMonths} months.</li>`; }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Málaga CF — The Cost of Survival · LANOVA summary</title>
<style>body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;max-width:1000px;margin:24px auto;padding:0 16px}h1{margin:0 0 4px}.note{border:1px solid #c90;background:#fff8e6;padding:8px 10px;border-radius:6px}table{border-collapse:collapse;width:100%;margin:12px 0;font-variant-numeric:tabular-nums}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right;vertical-align:top}th:first-child,td:first-child,td.l{text-align:left}th{background:#f2f2f2}small,.muted{color:#555}</style></head><body>
<p class="muted">LANOVA Decision Lab · Case 1 · generated ${h(generatedAt)}</p><h1>Málaga CF — The Cost of Survival</h1>
<p class="note"><b>Independent study — not affiliated with Málaga CF or LaLiga.</b> All financial data are fictional. Points gains are hypotheses entered by the user, not the measured or expected effect of any player or transfer. No survival probability is given.</p>
<h2>Situation and objective</h2><p>${h(SNAPSHOT.state)}: <b>${inp.sport.points} points after ${inp.sport.played} matches</b>, ${r.remaining} left. Hypothetical season-end objective <b>${inp.sport.target} points</b> (not the real survival threshold): <b>${r.pace.needed} points needed, ${r.pace.perMatch === null ? '—' : r.pace.perMatch.toFixed(2)} per match</b>${r.pace.reachable ? '' : ' — not reachable even with every remaining match won'}.</p>
<h2>Comparison (conditional on your assumptions)</h2><table><thead><tr><th>Strategy</th><th>Points (hypothesis)</th><th>vs objective</th><th>Cash cost 24 m</th><th>Cash ${h(r.seasonEnd)}</th><th>Cash Dec 2028 — stays up</th><th>Cash Dec 2028 — relegated</th><th>Lowest cash</th></tr></thead><tbody>
${rows.map(c => `<tr><td>${h(c.strategy)}</td><td>${c.total}</td><td>${sgn(c.targetGap)}</td><td>${fmt(c.cost24)}</td><td>${fmt(c.seasonCash)}</td><td>${fmt(c.stayClosing)}</td><td>${fmt(c.downClosing)}</td><td>${fmt(c.lowest)}</td></tr>`).join('')}</tbody></table>
<h2>Constraints</h2><ul>${rows.map(c => `<li><b>${h(c.strategy)}</b>: ${c.constraints.length ? c.constraints.map(h).join(' ') : 'none under these assumptions.'}</li>`).join('')}</ul>
<h2>Assumptions</h2><ul>${deals}<li>Fictional budget: opening cash EUR ${fmt(inp.finance.openingCash)}, minimum cash policy EUR ${fmt(inp.finance.minimumCash)}, recruitment budget EUR ${fmt(inp.finance.recruitmentBudget)}. If relegated from July 2027: media ${inp.finance.relegatedMediaPct}%, other revenue ${inp.finance.relegatedOtherPct}%, payroll ${inp.finance.relegatedPayrollPct}%.</li><li>Cash figures: LANOVA Finance engine ${h(r.engine)}, month-end balances, 24 months from ${START_MONTH}; no tax, sell-on, bonuses or prize money.</li></ul>
<h2>Sources</h2><p><small>${SNAPSHOT.sources.map(x => `${h(x.name)} (${h(x.url)})`).join('; ')}. ${h(SNAPSHOT.rights)}</small></p>
<p><b>Run this on your own club:</b> www.lakecapitalmanagement.com/demo.html · kevin@lake-am.com</p></body></html>
`;
}

export const fmt = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`);
