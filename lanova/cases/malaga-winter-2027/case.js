/**
 * LANOVA Winter Transfer Intelligence — case study "Málaga CF — Attack or Defence? The January 2027 Survival
 * Decision". Pure functions, no DOM, no network (the dataset is passed in).
 *
 * Three kinds of information are kept apart everywhere (interface and exports):
 *   OBSERVED   — verified public facts, with their sources and dates;
 *   ESTIMATE   — outputs of the explicit goal model in ../football.js (not validated as a forecast);
 *   HYPOTHESIS — values the user sets (intervention size, timing, costs, finances).
 *
 * Every financial figure is computed by the Advantage Lab V1 (../../advantage/lab.js), which runs the validated LANOVA
 * Finance engine. Unknown costs stay unknown: nothing is computed until the user enters them.
 *
 * LANOVA is independent and is not affiliated with, endorsed by or working for Málaga CF.
 */
import {outcome, expectedPoints, leagueRates, strengths, matchMeans, positionPoints, rows} from '../football.js';
import {evaluate, scenarioResults, directCombination, SCHEMA, fmt} from '../../advantage/lab.js';

export const TEAM = 'Málaga CF';
export const SEASON = '2026-27';
export const KINDS = Object.freeze({observed: 'Observed (verified public fact)', estimate: 'Model estimate (not a validated forecast)', hypothesis: 'Your hypothesis'});

/** Verified starting point. Each figure is a public match fact; the chain of sources is given and dated. */
export const SNAPSHOT = Object.freeze({
  team: TEAM, competition: 'LaLiga EA Sports 2026/27 (Primera División)', asOf: '2026-11-22', checkedOn: '2026-11-24',
  state: 'After matchday 13 (Osasuna 1–0 Málaga CF, 22 November 2026)',
  position: 20, played: 13, won: 0, drawn: 5, lost: 8, goalsFor: 9, goalsAgainst: 24, points: 5, matchesInSeason: 38, relegationPlaces: 3,
  derivation: [
    'After matchday 11 (table updated 2 November 2026): 11 played, 0 won, 5 drawn, 6 lost, goal difference −13 (8 scored, 21 conceded), 5 points, 20th.',
    'Matchday 12, 7 November 2026: Málaga CF 1–2 Real Racing Club de Santander (La Rosaleda).',
    'Matchday 13, 22 November 2026: CA Osasuna 1–0 Málaga CF (El Sadar); Málaga CF remain last on 5 points.',
    'Hence 13 played, 0 won, 5 drawn, 8 lost, 9 scored, 24 conceded, 5 points, 20th.',
  ],
  sources: [
    {name: 'Zonadepor — Clasificación de LALIGA 2026/27 (after matchday 11)', url: 'https://zonadepor.net/clasificacion.htm', date: '2026-11-02'},
    {name: 'La Nación — Racing de Santander venció 2-1 a Málaga', url: 'https://www.lanacion.com.ar/deportes/canchallena/racing-de-santander-vencio-2-1-a-malaga-por-la-liga-de-espana-nid07112026/', date: '2026-11-07'},
    {name: 'Futeros — Málaga 1-2 Racing', url: 'https://futeros.com/malaga-1-2-racing-la-rosaleda-se-indigesta-con-la-remontada-del-racing-de-santander/', date: '2026-11-07'},
    {name: 'La Nación — Osasuna venció 1-0 a Málaga', url: 'https://www.lanacion.com.ar/deportes/canchallena/osasuna-vencio-1-0-a-malaga-por-la-liga-de-espana-nid22112026/', date: '2026-11-22'},
    {name: 'El Desmarque — crónica Osasuna–Málaga, jornada 13', url: 'https://www.eldesmarque.com/futbol/liga-1a-division/20261122/cronica-resumen-analisis-osasuna-malaga-jornada-13-laliga-ea-sports_18_020782913.html', date: '2026-11-22'},
    {name: 'Málaga CF — next fixture: matchday 14 v Athletic Club', url: 'https://www.malagacf.com/en/matches/season-2026-2027-laliga-ea-sports-14-malaga-cf-vs-athletic-club-3056', date: '2026-11-24'},
  ],
  rights: 'Only public match facts are used (results, points, goals, position), entered by hand and attributed. No league table, logo, photograph, text or data feed of LaLiga, Málaga CF or the cited media is reproduced.',
  independence: 'LANOVA Sports is independent. It is not affiliated with, endorsed by or working for Málaga CF or LaLiga. This case study uses public facts and states its own assumptions.',
});

// ------------------------------------------------------------------ model context
/**
 * Model context: league scoring rates (2025/26 complete season and the 2026/27 matches in the dataset), each team's
 * strengths from its 2026/27 matches in the dataset, Málaga's from its verified line (more recent), and Málaga's
 * remaining fixtures. `k` = shrinkage (prior matches at the league average).
 */
export function context(dataset, {k = 5} = {}) {
  const cur = rows(dataset.seasons[SEASON].matches), prev = rows(dataset.seasons['2025-26'].matches);
  const played = cur.filter(m => m.hg !== null), rates = leagueRates([...prev, ...played]);
  const S = strengths(cur, rates, {k, override: {[TEAM]: {played: SNAPSHOT.played, gf: SNAPSHOT.goalsFor, ga: SNAPSHOT.goalsAgainst}}});
  const lastDate = played.reduce((d, m) => (m.date > d ? m.date : d), ''), mine = cur.filter(m => m.home === TEAM || m.away === TEAM);
  const remaining = mine.filter(m => m.matchday > SNAPSHOT.played).sort((a, b) => a.date.localeCompare(b.date));
  // Consistency check: the dataset's own Málaga results must be compatible with the verified (more recent) line.
  const dsM = mine.filter(m => m.hg !== null), dsPts = dsM.reduce((s, m) => { const f = m.home === TEAM ? m.hg : m.ag, a = m.home === TEAM ? m.ag : m.hg; return s + (f > a ? 3 : f === a ? 1 : 0); }, 0);
  const dsGF = dsM.reduce((s, m) => s + (m.home === TEAM ? m.hg : m.ag), 0), dsGA = dsM.reduce((s, m) => s + (m.home === TEAM ? m.ag : m.hg), 0);
  const consistent = dsM.length <= SNAPSHOT.played && dsPts <= SNAPSHOT.points && dsGF <= SNAPSHOT.goalsFor && dsGA <= SNAPSHOT.goalsAgainst;
  const safe = positionPoints(dataset, 17), drop = positionPoints(dataset, 18);
  return {rates, strengths: S, k, remaining, datasetThrough: lastDate, datasetMatches: played.length, datasetMalaga: {played: dsM.length, points: dsPts, gf: dsGF, ga: dsGA}, consistent,
    history: {safe, drop}, source: dataset.source};
}

// ------------------------------------------------------------------ interventions
/**
 * A scenario: attack and/or defence improvements, each a % change of Málaga's own rate from the first remaining
 * match on or after its activation date. attackPct: +% to goals scored; defencePct: −% to goals conceded.
 */
export function scenario(ctx, {attackPct = 0, attackFrom = null, defencePct = 0, defenceFrom = null} = {}) {
  if (!(attackPct >= 0 && attackPct <= 300)) throw new RangeError('Attack improvement: 0 to 300%');
  if (!(defencePct >= 0 && defencePct <= 90)) throw new RangeError('Defence improvement: 0 to 90%');
  return scenarioBy(ctx, m => ({attack: attackPct && (!attackFrom || m.date >= attackFrom) ? 1 + attackPct / 100 : 1, defence: defencePct && (!defenceFrom || m.date >= defenceFrom) ? 1 - defencePct / 100 : 1}));
}
/**
 * Same calculation with a multiplier per remaining match: `fn(match, index)` returns {attack, defence}, the factors on
 * Málaga's scoring rate and conceding rate for that match (used by the role-based player profiles).
 */
export function scenarioBy(ctx, fn) {
  const per = ctx.remaining.map((m, i) => {
    const home = m.home === TEAM, opp = home ? m.away : m.home, {attack: a = 1, defence: d = 1} = fn(m, i);
    if (!(a > 0 && d > 0 && Number.isFinite(a) && Number.isFinite(d))) throw new RangeError(`Invalid multipliers for ${m.date}`);
    const mm = matchMeans(m.home, m.away, ctx.strengths, ctx.rates, {[TEAM]: {attack: a, defence: d}});
    const o = outcome(mm.home, mm.away), mine = home ? o : {win: o.loss, draw: o.draw, loss: o.win};
    return {date: m.date, matchday: m.matchday, opponent: opp, venue: home ? 'home' : 'away', goalsFor: home ? mm.home : mm.away, goalsAgainst: home ? mm.away : mm.home,
      win: mine.win, draw: mine.draw, loss: mine.loss, points: expectedPoints(mine), attackOn: a !== 1, defenceOn: d !== 1};
  });
  const sum = k => per.reduce((s, x) => s + x[k], 0);
  return {matches: per, points: sum('points'), goalsFor: sum('goalsFor'), goalsAgainst: sum('goalsAgainst'), wins: sum('win'), draws: sum('draw'), finalPoints: SNAPSHOT.points + sum('points'),
    affected: {attack: per.filter(x => x.attackOn).length, defence: per.filter(x => x.defenceOn).length}};
}
/** Baseline, attack only, defence only and both, with the differences from the baseline. */
export function compare(ctx, h) {
  const base = scenario(ctx), attack = scenario(ctx, {attackPct: h.attackPct, attackFrom: h.attackFrom}), defence = scenario(ctx, {defencePct: h.defencePct, defenceFrom: h.defenceFrom});
  const both = scenario(ctx, h), d = x => ({...x, gain: x.points - base.points});
  const att = d(attack), def = d(defence), comb = d(both), diff = att.gain - def.gain;
  const best = Math.abs(diff) < 0.05 ? 'equivalent' : diff > 0 ? 'attack' : 'defence';
  return {baseline: d(base), attack: att, defence: def, both: comb, best, difference: diff, interaction: comb.gain - att.gain - def.gain};
}
/**
 * What would change the recommendation: the attack improvement (%) giving the same expected points as the chosen
 * defence improvement, and the defence improvement giving the same as the chosen attack improvement (bisection on
 * the model; expected points increase with each improvement). null when not reached within the allowed range.
 */
export function breakEven(ctx, h, tol = 0.01) {
  const target = (field, from, other) => {
    const goal = other.gain, max = field === 'attackPct' ? 300 : 90, g = x => scenario(ctx, {[field]: x, [field === 'attackPct' ? 'attackFrom' : 'defenceFrom']: from}).points - scenario(ctx).points - goal;
    if (goal <= 1e-9) return 0;
    if (g(max) < 0) return null;
    let lo = 0, hi = max; while (hi - lo > tol) { const c = (lo + hi) / 2; if (g(c) < 0) lo = c; else hi = c; }
    return hi;
  };
  const c = compare(ctx, h);
  return {attackEquivalentToDefence: target('attackPct', h.attackFrom, c.defence), defenceEquivalentToAttack: target('defencePct', h.defenceFrom, c.attack)};
}
/** Historical reference: points of the 17th (last safe place) and 18th in each complete season of the dataset. */
export function historyBand(ctx) {
  const pts = ctx.history.safe.map(x => x.points).sort((a, b) => a - b), q = p => pts[Math.min(pts.length - 1, Math.max(0, Math.round(p * (pts.length - 1))))];
  return {seasons: ctx.history.safe.length, min: pts[0], median: q(0.5), max: pts.at(-1), safe: ctx.history.safe, drop: ctx.history.drop};
}

// ------------------------------------------------------------------ explanation
const r1 = v => (Math.round(v * 10) / 10).toFixed(1), pct = v => `${Math.round(v)}%`;
export function explain(ctx, h, c = compare(ctx, h), be = breakEven(ctx, h)) {
  const name = {attack: `the attack improvement (+${pct(h.attackPct)} goals scored)`, defence: `the defence improvement (−${pct(h.defencePct)} goals conceded)`};
  const head = c.best === 'equivalent' ? `Under these assumptions the two interventions are equivalent within the model's precision (${r1(c.attack.gain)} vs ${r1(c.defence.gain)} expected points).`
    : `Under these assumptions, ${name[c.best]} adds more expected points: ${r1(c[c.best].gain)} against ${r1(c[c.best === 'attack' ? 'defence' : 'attack'].gain)} for ${name[c.best === 'attack' ? 'defence' : 'attack']}, over ${ctx.remaining.length} remaining matches.`;
  const m = ctx.strengths[TEAM], perFor = ctx.rates.perTeamMatch * m.attack, perAg = ctx.rates.perTeamMatch * m.defence;
  const drivers = [
    `Málaga's estimated rates: ${perFor.toFixed(2)} goals scored and ${perAg.toFixed(2)} conceded per match (league average ${ctx.rates.perTeamMatch.toFixed(2)}). The same percentage removes more goals where the rate is higher: ${pct(h.defencePct)} fewer conceded is about ${(perAg * h.defencePct / 100).toFixed(2)} goals a match; ${pct(h.attackPct)} more scored is about ${(perFor * h.attackPct / 100).toFixed(2)}.`,
    `Expected goals over the remaining matches: baseline ${r1(c.baseline.goalsFor)} scored and ${r1(c.baseline.goalsAgainst)} conceded; with attack ${r1(c.attack.goalsFor)} scored; with defence ${r1(c.defence.goalsAgainst)} conceded.`,
    `Timing: the attack improvement applies to ${c.attack.affected.attack} matches and the defence improvement to ${c.defence.affected.defence} (from their activation dates).`,
    `Both together add ${r1(c.both.gain)} expected points (${c.interaction >= 0 ? '+' : ''}${r1(c.interaction)} compared with the sum of the two separately).`,
  ];
  const change = [
    be.attackEquivalentToDefence === null ? `No attack improvement up to +300% matches the chosen defence improvement.` : `The attack improvement would have to be +${r1(be.attackEquivalentToDefence)}% to match −${pct(h.defencePct)} goals conceded.`,
    be.defenceEquivalentToAttack === null ? `No defence improvement up to −90% matches the chosen attack improvement.` : `The defence improvement would have to be −${r1(be.defenceEquivalentToAttack)}% to match +${pct(h.attackPct)} goals scored.`,
    'A later activation date, a different size of improvement, or updated opponent strengths (the dataset stops before matchday 8 for other teams) can reverse the ranking.',
  ];
  const band = historyBand(ctx), need = (band.median - SNAPSHOT.points) / ctx.remaining.length;
  const uncertainty = [
    `These are expected values from an explicit Poisson goal model; it is not a validated forecast and gives no probability of survival.`,
    `Málaga's rates come from 13 matches; other teams' from ${ctx.datasetMatches} matches of 2026/27 in the open dataset (to ${ctx.datasetThrough}), shrunk towards the league average (k = ${ctx.k}). Opponent quality is not separated from Málaga's own rates.`,
    `For reference only (observed, ${band.seasons} complete seasons 2012/13–2025/26): the 17th-placed team finished on ${band.min} to ${band.max} points (median ${band.median}). Reaching ${band.median} would need ${need.toFixed(2)} points per remaining match. Past thresholds do not predict this season's.`,
    'A percentage improvement is an assumption about a player or a system change; this case does not estimate what any particular signing would deliver.',
  ];
  const needed = ['Results of matchdays 8–13 for every team (the open dataset will add them; until then opponent strengths are older than Málaga\'s line)',
    'Minutes, availability and role of the current alternative at each position', 'Verified transfer or loan fees, wages and payment terms of real candidates', 'Málaga CF\'s budget, cash position and squad-cost limit (not public in verified form)'];
  return {headline: head, drivers, change, uncertainty, needed};
}

// ------------------------------------------------------------------ financial impact (Advantage Lab V1 / Finance engine)
export const FIN_FIELDS = ['openingCash', 'annualRevenue', 'annualOperatingCosts', 'staffCosts', 'minimumCash', 'decisionBudget'];
export const COST_FIELDS = ['transferFee', 'feeInstalments', 'agentFee', 'signingBonus', 'monthlyWage', 'employerChargeRate', 'contractMonths'];
/** Empty financial inputs: everything unknown until the user enters it. */
export const emptyFinance = () => ({...Object.fromEntries(FIN_FIELDS.map(k => [k, null])), downsideRevenuePct: null, downsideFromMonth: 6, downsideMustHold: false,
  attack: Object.fromEntries(COST_FIELDS.map(k => [k, null])), defence: Object.fromEntries(COST_FIELDS.map(k => [k, null]))});
/** Hypothetical illustration (button in the interface). NOT Málaga CF data and NOT market prices. */
export const HYPOTHETICAL = Object.freeze({openingCash: 12_000_000, annualRevenue: 70_000_000, annualOperatingCosts: 68_000_000, staffCosts: 42_000_000, minimumCash: 4_000_000, decisionBudget: 3_000_000,
  downsideRevenuePct: -45, downsideFromMonth: 6, downsideMustHold: false,
  attack: {transferFee: 800_000, feeInstalments: 1, agentFee: 80_000, signingBonus: 0, monthlyWage: 110_000, employerChargeRate: 0.3, contractMonths: 6},
  defence: {transferFee: 1_800_000, feeInstalments: 2, agentFee: 150_000, signingBonus: 120_000, monthlyWage: 75_000, employerChargeRate: 0.3, contractMonths: 18}});
const known = v => typeof v === 'number' && Number.isFinite(v);
/** Which inputs are still missing (never filled in with a guess). */
export function missingFinance(f) {
  const miss = FIN_FIELDS.filter(k => !known(f[k])).map(k => `organisation: ${k}`);
  if (!known(f.downsideRevenuePct)) miss.push('downside: revenue change if relegated (%)');
  for (const side of ['attack', 'defence']) for (const k of COST_FIELDS) if (!known(f[side][k])) miss.push(`${side} intervention: ${k}`);
  return miss;
}
/** The Advantage Lab V1 model for these hypotheses (only the interventions whose costs are fully entered). */
export function financeModel(f) {
  const opt = (id, name, c) => ({id, name, category: 'Squad', kind: 'signing', startMonth: 0, effectMonths: 0, transferFee: c.transferFee, feeInstalments: c.feeInstalments, agentFee: c.agentFee, signingBonus: c.signingBonus,
    contractMonths: c.contractMonths, monthlyWage: c.monthlyWage, employerChargeRate: c.employerChargeRate, monthlyGain: null, gainMonths: 12, shortTermScore: null, longTermScore: null, risk: null, confidence: 'low', mandatory: false, requires: [], exclusiveGroup: '',
    upfront: 0, upfrontType: 'expense', usefulLifeMonths: null, instalments: 1, instalmentEveryMonths: 1, monthlyCost: 0, costType: 'staff', commitmentMonths: 0});
  const ready = side => COST_FIELDS.every(k => known(f[side][k]));
  return {schema: SCHEMA, fictional: true, asOf: SNAPSHOT.checkedOn, label: 'Hypothetical financial assumptions — not Málaga CF data', sport: 'Football', structure: 'Professional club', startMonth: '2027-01', horizonMonths: 12, currency: 'EUR', objective: 'immediate',
    finance: Object.fromEntries(FIN_FIELDS.map(k => [k, f[k]])),
    scenarios: {downside: {revenuePct: f.downsideRevenuePct, operatingPct: 0, wagePct: 0, fromMonth: f.downsideFromMonth}, upside: {revenuePct: 0, operatingPct: 0, wagePct: 0, fromMonth: 0}},
    constraints: {downsideMustHold: Boolean(f.downsideMustHold)},
    options: [...(ready('attack') ? [opt('attack', 'Attacking reinforcement (hypothetical)', f.attack)] : []), ...(ready('defence') ? [opt('defence', 'Defensive reinforcement (hypothetical)', f.defence)] : [])]};
}
/**
 * Affordability of each intervention and of both, in the base and downside cases, from the Finance engine. Returns
 * {computed: false, missing} until every organisation figure is entered; an intervention without its costs is
 * reported as "costs unknown", never priced.
 */
export function affordability(f, sport) {
  const miss = missingFinance(f), orgMissing = miss.filter(x => x.startsWith('organisation') || x.startsWith('downside'));
  if (orgMissing.length) return {computed: false, missing: miss, reason: 'Enter the organisation figures (or load the hypothetical illustration) to compute affordability. Nothing is assumed.'};
  const m = financeModel(f), r = evaluate(m);
  if (r.problems.length) return {computed: false, missing: miss, problems: r.problems};
  const ids = r.options.map(o => o.id), sets = [['attack', ['attack']], ['defence', ['defence']], ['both', ['attack', 'defence']]];
  const out = {computed: true, model: m, missing: miss, months: r.months, reserve: m.finance.minimumCash, budget: m.finance.decisionBudget, baseline: scenarioResults(r, []), items: {}};
  for (const [k, set] of sets) {
    if (!set.every(id => ids.includes(id))) { out.items[k] = {known: false, reason: `Costs unknown for ${set.filter(id => !ids.includes(id)).join(' and ')}: enter them to test affordability.`}; continue; }
    const x = scenarioResults(r, set), opts = r.options.filter(o => set.includes(o.id)), totalCost = opts.reduce((s, o) => s + o.totals.totalCost, 0), inHorizon = opts.reduce((s, o) => s + o.totals.upfront + o.totals.runningInHorizon, 0);
    const gain = sport ? sport[k].gain : null, direct = directCombination(m, set);
    out.items[k] = {known: true, upfront: x.upfront, withinBudget: x.withinBudget, totalCost, costInYear: inHorizon, base: x.scenarios.base, downside: x.scenarios.downside,
      affordable: x.withinBudget && x.scenarios.base.meetsReserve && (!m.constraints.downsideMustHold || x.scenarios.downside.meetsReserve),
      costPerExpectedPoint: gain && gain > 0.01 ? totalCost / gain : null, reconciled: direct ? Math.max(...['base', 'downside'].flatMap(s => direct[s].map((v, t) => Math.abs(v - x.scenarios[s].cash[t])))) : null};
  }
  return out;
}

// ------------------------------------------------------------------ report (JSON and HTML)
export function report(ctx, h, f, when = new Date().toISOString().slice(0, 10), profiles = []) {
  const c = compare(ctx, h), be = breakEven(ctx, h), ex = explain(ctx, h, c, be), af = affordability(f, c), band = historyBand(ctx);
  const sc = x => ({expectedPointsGained: +x.gain.toFixed(3), expectedFinalPoints: +x.finalPoints.toFixed(2), expectedGoalsFor: +x.goalsFor.toFixed(2), expectedGoalsAgainst: +x.goalsAgainst.toFixed(2)});
  return {schema: 'lanova-case-malaga-winter-2027-v1', generated: when, title: 'Málaga CF — Attack or Defence? The January 2027 Survival Decision', independence: SNAPSHOT.independence,
    observed: {kind: KINDS.observed, snapshot: {asOf: SNAPSHOT.asOf, checkedOn: SNAPSHOT.checkedOn, position: SNAPSHOT.position, played: SNAPSHOT.played, won: SNAPSHOT.won, drawn: SNAPSHOT.drawn, lost: SNAPSHOT.lost,
      goalsFor: SNAPSHOT.goalsFor, goalsAgainst: SNAPSHOT.goalsAgainst, points: SNAPSHOT.points}, derivation: SNAPSHOT.derivation, sources: SNAPSHOT.sources,
      history17th: {seasons: band.seasons, min: band.min, median: band.median, max: band.max, bySeason: band.safe}, dataset: {...ctx.source, files: undefined, matchesUsed: ctx.datasetMatches, through: ctx.datasetThrough}},
    hypotheses: {kind: KINDS.hypothesis, interventions: h, finance: f, profiles: profiles.map(x => x.input)},
    estimates: {kind: KINDS.estimate, model: `Independent Poisson goals; strengths from goals with shrinkage k = ${ctx.k}; league rates home ${ctx.rates.home.toFixed(3)}, away ${ctx.rates.away.toFixed(3)} per match`,
      remainingMatches: ctx.remaining.length, baseline: sc(c.baseline), attack: sc(c.attack), defence: sc(c.defence), both: sc(c.both), best: c.best, breakEven: be,
      affordability: af.computed ? Object.fromEntries(Object.entries(af.items).map(([k, v]) => [k, v.known ? {immediateCost: v.upfront, costIn2027: v.costInYear, totalCommitted: v.totalCost, withinBudget: v.withinBudget,
        lowestCashBase: Math.round(v.base.lowest), lowestCashDownside: Math.round(v.downside.lowest), reserveMetBase: v.base.meetsReserve, reserveMetDownside: v.downside.meetsReserve, costPerExpectedPoint: v.costPerExpectedPoint && Math.round(v.costPerExpectedPoint)} : {costs: 'unknown'}])) : {notComputed: af.reason, missing: af.missing}},
    profiles: {kind: KINDS.estimate, note: 'Role-based profiles: expected points from your hypotheses with the same goal model; not a measured or causal player effect.',
      items: profiles.map(x => (x.result.computed ? {label: x.result.label, labelNote: x.result.labelNote, role: x.result.role, ...Object.fromEntries(['low', 'central', 'high'].map(l => [l, {expectedPointsGained: +x.result[l].gain.toFixed(3), expectedFinalPoints: +x.result[l].finalPoints.toFixed(2)}])),
        equivalentAtFullEffect: {attackPct: +x.result.equivalentAtFullEffect.attackPct.toFixed(2), defencePct: +x.result.equivalentAtFullEffect.defencePct.toFixed(2)}} : {label: x.input.label || null, notComputed: true, missing: x.result.missing, problems: x.result.problems}))},
    explanation: ex, notShown: ['No probability of survival or relegation: the forecasting engine is not yet independently validated (see the Football Forecast Lab).', 'No named player data and no measured player impact: no verified player data is used; profiles are role-based hypotheses and any name is your own unverified label.']};
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function reportHtml(rep) {
  const li = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, e = rep.estimates, o = rep.observed.snapshot, n = v => (v === null || v === undefined ? '—' : Number(v).toFixed(1));
  const rowsHtml = ['baseline', 'attack', 'defence', 'both'].map(k => `<tr><td>${esc({baseline: 'Baseline (no change)', attack: 'Attack improvement', defence: 'Defence improvement', both: 'Both'}[k])}</td><td>${n(e[k].expectedPointsGained)}</td><td>${n(e[k].expectedFinalPoints)}</td><td>${n(e[k].expectedGoalsFor)}</td><td>${n(e[k].expectedGoalsAgainst)}</td></tr>`).join('');
  const aff = e.affordability.notComputed ? `<p>${esc(e.affordability.notComputed)}</p>` : `<table><tr><th>Intervention</th><th>Immediate cost</th><th>Cost in 2027</th><th>Total committed</th><th>Within budget</th><th>Lowest cash, base</th><th>Lowest cash, downside</th><th>Cost per expected point</th></tr>${Object.entries(e.affordability).map(([k, v]) => v.costs ? `<tr><td>${esc(k)}</td><td colspan="7">Costs unknown — not computed</td></tr>` : `<tr><td>${esc(k)}</td><td>${fmt(v.immediateCost)}</td><td>${fmt(v.costIn2027)}</td><td>${fmt(v.totalCommitted)}</td><td>${v.withinBudget ? 'yes' : 'no'}</td><td>${fmt(v.lowestCashBase)}${v.reserveMetBase ? '' : ' (below reserve)'}</td><td>${fmt(v.lowestCashDownside)}${v.reserveMetDownside ? '' : ' (below reserve)'}</td><td>${fmt(v.costPerExpectedPoint)}</td></tr>`).join('')}</table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rep.title)} — LANOVA case report</title>
<style>body{font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#141821;max-width:1000px;margin:24px auto;padding:0 16px}h1{font-size:23px;margin:0 0 6px}h2{font-size:17px;margin:24px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}th,td{border:1px solid #d6d9e0;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f2f5}
.k{display:inline-block;font:600 11px/1 system-ui;padding:3px 7px;border-radius:999px;margin-right:6px}.obs{background:#e2f0e9;color:#0b6b4e}.est{background:#e6ecfb;color:#2346a3}.hyp{background:#fbefdc;color:#9a4a06}.box{border-left:4px solid;padding:8px 12px;margin:10px 0}.box.obs{border-color:#0b6b4e}.box.est{border-color:#2346a3}.box.hyp{border-color:#9a4a06}small{color:#555}@media print{body{margin:0;max-width:none}}</style></head><body>
<p><small>LANOVA Winter Transfer Intelligence · case report · ${esc(rep.generated)}</small></p><h1>${esc(rep.title)}</h1><p><b>${esc(rep.independence)}</b></p>
<p><span class="k obs">Observed</span>verified public facts · <span class="k est">Model estimate</span>not a validated forecast · <span class="k hyp">Your hypothesis</span>values you set</p>
<h2><span class="k obs">Observed</span>Starting point — ${esc(o.asOf)}</h2><div class="box obs"><p>20th of 20 · ${o.played} played · ${o.won} won, ${o.drawn} drawn, ${o.lost} lost · ${o.goalsFor} scored, ${o.goalsAgainst} conceded · <b>${o.points} points</b></p>${li(rep.observed.derivation)}
<p>Sources (checked ${esc(o.checkedOn)}):</p><ul>${rep.observed.sources.map(s => `<li>${esc(s.name)} (${esc(s.date)}) — ${esc(s.url)}</li>`).join('')}</ul>
<p>17th place (last safe place) in ${rep.observed.history17th.seasons} complete seasons: ${rep.observed.history17th.min}–${rep.observed.history17th.max} points (median ${rep.observed.history17th.median}). Open dataset: ${esc(rep.observed.dataset.name)} @ ${esc(String(rep.observed.dataset.commit).slice(0, 10))}, ${esc(rep.observed.dataset.licence)}.</p></div>
<h2><span class="k hyp">Your hypothesis</span>Interventions</h2><div class="box hyp"><p>Attack: +${rep.hypotheses.interventions.attackPct}% goals scored from ${esc(rep.hypotheses.interventions.attackFrom ?? 'the next match')}. Defence: −${rep.hypotheses.interventions.defencePct}% goals conceded from ${esc(rep.hypotheses.interventions.defenceFrom ?? 'the next match')}.</p></div>
<h2><span class="k est">Model estimate</span>Expected outcomes over ${e.remainingMatches} remaining matches</h2><div class="box est"><table><tr><th>Scenario</th><th>Expected points gained vs baseline</th><th>Expected final points</th><th>Expected goals scored</th><th>Expected goals conceded</th></tr>${rowsHtml}</table><p><small>${esc(e.model)}</small></p></div>
${rep.profiles.items.length ? `<h2><span class="k hyp">Your hypothesis</span><span class="k est">Model estimate</span>Role-based player profiles</h2><div class="box hyp"><table><tr><th>Profile</th><th>Role</th><th>Expected points gained: low</th><th>central</th><th>high</th><th>Expected final points (central)</th></tr>${rep.profiles.items.map((x, i) => x.notComputed ? `<tr><td>${esc(x.label ?? `Profile ${i + 1}`)}</td><td colspan="5">Not computed — missing: ${esc(x.missing.join(', '))}${x.problems.length ? `; invalid: ${esc(x.problems.join(', '))}` : ''}</td></tr>` : `<tr><td>${esc(x.label ?? `Profile ${i + 1}`)}</td><td>${esc(x.role)}</td><td>${n(x.low.expectedPointsGained)}</td><td>${n(x.central.expectedPointsGained)}</td><td>${n(x.high.expectedPointsGained)}</td><td>${n(x.central.expectedFinalPoints)}</td></tr>`).join('')}</table><p><small>${esc(rep.profiles.note)} Labels are yours, exploratory and unverified.</small></p></div>` : ''}
<h2>Decision explanation</h2><p><b>${esc(rep.explanation.headline)}</b></p><h3>What drives the difference</h3>${li(rep.explanation.drivers)}<h3>What would change the recommendation</h3>${li(rep.explanation.change)}
<h2><span class="k est">Finance engine</span><span class="k hyp">on your hypotheses</span>Financial impact</h2><div class="box hyp">${aff}<p><small>Computed by the LANOVA Advantage Lab V1 and the LANOVA Finance engine on hypothetical figures; not Málaga CF data, not market prices.</small></p></div>
<h2>Uncertainties</h2>${li(rep.explanation.uncertainty)}<h2>Information needed for a decision</h2>${li(rep.explanation.needed)}<h2>Not shown in this release</h2>${li(rep.notShown)}
<p><small>Decision-support analysis, not financial, investment or sporting advice. No probability is given. © 2026 Lake Management.</small></p></body></html>`;
}
