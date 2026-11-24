// LANOVA Winter Transfer Intelligence — Release 1, Málaga CF case study. Dataset integrity and rights, the goal
// model against closed-form values, the verified starting point, the attack-versus-defence experiment (ranking
// reversals, monotonicity, timing, break-even), missing and invalid inputs, financial reconciliation with the
// Finance engine (through the Advantage Lab), export consistency, and the page's links and promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join, normalize} from 'node:path';
import {poisson, outcome, expectedPoints, leagueRates, strengths, pointsTable, positionPoints, rows} from '../lanova/cases/football.js';
import {SNAPSHOT, TEAM, context, scenario, compare, breakEven, explain, historyBand, affordability, emptyFinance, HYPOTHETICAL, financeModel, report, reportHtml} from '../lanova/cases/malaga-winter-2027/case.js';
import {evaluate, scenarioResults, directCombination} from '../lanova/advantage/lab.js';
import {checkFormat} from '../scripts/build-football-dataset.mjs';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), ctx = context(D);
const close = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const JAN = ctx.remaining.find(m => m.date >= '2027-01-02').date;
const H = (a, d, o = {}) => ({attackPct: a, attackFrom: JAN, defencePct: d, defenceFrom: JAN, ...o});

test('dataset: CC0 source pinned by commit and file hashes; every complete season has the LaLiga format; spot checks against the source text', () => {
  assert.equal(D.schema, 'lanova-football-dataset-v1'); assert.match(D.source.licence, /^CC0 1\.0/); assert.match(D.source.commit, /^[0-9a-f]{40}$/);
  assert.equal(Object.keys(D.seasons).length, 15); assert.ok(Object.values(D.source.files).every(h => /^[0-9a-f]{64}$/.test(h)));
  for (const [k, s] of Object.entries(D.seasons)) {
    const m = rows(s.matches); assert.deepEqual(checkFormat(m), [], `${k} format`);
    assert.equal(s.played, m.filter(x => x.hg !== null).length);
    if (k !== '2026-27') assert.equal(s.played, 380, `${k} complete`);
  }
  const has = (season, ...row) => D.seasons[season].matches.some(x => JSON.stringify(x) === JSON.stringify(row));
  assert.ok(has('2012-13', '2012-08-18', 1, 'RC Celta', 'Málaga CF', 0, 1)); assert.ok(has('2025-26', '2025-08-15', 1, 'Girona FC', 'Rayo Vallecano', 1, 3));
  assert.ok(has('2026-27', '2026-08-19', 1, 'Club Atlético de Madrid', 'Málaga CF', 2, 0));
});

test('goal model: Poisson probabilities and match outcomes equal closed-form values', () => {
  const p = poisson(1.3); close(p[0], Math.exp(-1.3), 'P(0)'); close(p[2], Math.exp(-1.3) * 1.3 ** 2 / 2, 'P(2)');
  // P(draw) for two means of 1 = e^-2 × I0(2) = 0.30850832…; P(win) = P(loss) by symmetry.
  const o = outcome(1, 1); close(o.draw, 0.3085083225, 'P(draw | 1, 1)', 1e-9); close(o.win, o.loss, 'symmetry'); close(o.win + o.draw + o.loss + o.tail, 1, 'total', 1e-12);
  close(outcome(0, 0).draw, 1, 'no goals: certain draw'); close(expectedPoints({win: 0.5, draw: 0.2, loss: 0.3}), 1.7, 'expected points');
  // P(draw) for means a, b = e^-(a+b) Σ (ab)^k / (k!)²; checked at 1.6 and 0.9 by direct series.
  let s = 0, f = 1; for (let k = 0; k < 40; k++) { if (k) f *= k; s += (1.6 * 0.9) ** k / (f * f); }
  close(outcome(1.6, 0.9).draw, Math.exp(-2.5) * s, 'P(draw | 1.6, 0.9)', 1e-9);
  assert.throws(() => poisson(-1)); assert.throws(() => poisson(NaN));
});

test('strengths: ratios to the league average with k prior matches (hand calculation)', () => {
  const ms = [{home: 'A', away: 'B', hg: 3, ag: 0}, {home: 'B', away: 'A', hg: 1, ag: 1}], r = leagueRates(ms);
  close(r.home, 2, 'home rate'); close(r.away, 0.5, 'away rate'); close(r.perTeamMatch, 1.25, 'per team-match');
  const S = strengths(ms, r, {k: 2});
  close(S.A.attack, (4 + 2 * 1.25) / (4 * 1.25), 'A attack'); close(S.A.defence, (1 + 2 * 1.25) / (4 * 1.25), 'A defence'); close(S.B.attack, (1 + 2.5) / 5, 'B attack');
  const S0 = strengths(ms, r, {k: 0, override: {A: {played: 10, gf: 5, ga: 20}}}); close(S0.A.attack, 0.4, 'override'); close(S0.A.defence, 1.6, 'override');
});

test('verified starting point: internally consistent, consistent with the open dataset, and the remaining fixtures are Málaga\'s 25', () => {
  const s = SNAPSHOT;
  assert.equal(s.played, s.won + s.drawn + s.lost); assert.equal(s.points, 3 * s.won + s.drawn); assert.deepEqual([s.position, s.points, s.played, s.goalsFor, s.goalsAgainst], [20, 5, 13, 9, 24]);
  assert.equal(s.asOf, '2026-11-22'); assert.ok(s.sources.length >= 5 && s.sources.every(x => /^https:\/\//.test(x.url) && /^2026-11-\d\d$/.test(x.date)));
  assert.match(s.independence, /not affiliated with/);
  assert.equal(ctx.consistent, true); assert.deepEqual(ctx.datasetMalaga, {played: 7, points: 3, gf: 3, ga: 12});
  assert.equal(ctx.remaining.length, 38 - 13); assert.ok(ctx.remaining.every(m => (m.home === TEAM || m.away === TEAM) && m.matchday >= 14 && m.hg === null));
  assert.equal(ctx.remaining[0].date, '2026-11-29'); assert.equal(ctx.strengths[TEAM].played, 13);
});

test('historical reference: 17th-place points recomputed independently from the match results', () => {
  const b = historyBand(ctx); assert.equal(b.seasons, 14);
  for (const x of b.safe) {
    const pts = {}; for (const [, , h, a, hg, ag] of D.seasons[x.season].matches) { pts[h] ??= 0; pts[a] ??= 0; if (hg > ag) pts[h] += 3; else if (hg < ag) pts[a] += 3; else { pts[h]++; pts[a]++; } }
    assert.equal(Object.values(pts).sort((p, q) => q - p)[16], x.points, x.season);
  }
  assert.deepEqual([b.min, b.median, b.max], [35, 39, 43]); assert.equal(pointsTable(rows(D.seasons['2025-26'].matches)).length, 20); assert.equal(positionPoints(D, 18).length, 14);
});

test('the experiment: either intervention can win, depending on the inputs (ranking reversal)', () => {
  assert.equal(compare(ctx, H(20, 20)).best, 'defence', 'equal percentages: conceding less wins (Málaga concede more than they score)');
  assert.equal(compare(ctx, H(40, 10)).best, 'attack', 'a large attacking improvement wins');
  assert.equal(compare(ctx, H(10, 40)).best, 'defence');
  // Timing reverses it too: the same sizes, but the defence improvement only from April.
  const april = ctx.remaining.find(m => m.date >= '2027-04-01').date;
  assert.equal(compare(ctx, H(25, 20, {defenceFrom: april})).best, 'attack');
  const zero = compare(ctx, H(0, 0)); close(zero.attack.gain, 0, 'no change'); close(zero.defence.gain, 0, 'no change'); assert.equal(zero.best, 'equivalent');
});

test('the experiment: expected points rise with each improvement and fall with a later start; both together ≈ sum of the two', () => {
  let prev = -1; for (const a of [0, 5, 10, 20, 40, 80]) { const g = scenario(ctx, {attackPct: a, attackFrom: JAN}).points; assert.ok(g > prev - 1e-12, `attack ${a}`); prev = g; }
  prev = -1; for (const d of [0, 5, 10, 20, 40, 80]) { const g = scenario(ctx, {defencePct: d, defenceFrom: JAN}).points; assert.ok(g > prev - 1e-12, `defence ${d}`); prev = g; }
  const early = scenario(ctx, {attackPct: 30, attackFrom: ctx.remaining[0].date}).points, late = scenario(ctx, {attackPct: 30, attackFrom: ctx.remaining.at(-5).date}).points;
  assert.ok(early > late); assert.equal(scenario(ctx, {attackPct: 30, attackFrom: ctx.remaining.at(-5).date}).affected.attack, 5);
  const c = compare(ctx, H(20, 20)); close(c.both.gain, c.attack.gain + c.defence.gain + c.interaction, 'interaction is the remainder', 1e-12);
  // Baseline expected final points = 5 + Σ (3 P(win) + P(draw)) over the remaining matches.
  close(c.baseline.finalPoints, 5 + c.baseline.matches.reduce((s, m) => s + 3 * m.win + m.draw, 0), 'baseline', 1e-9);
});

test('what would change the recommendation: at the break-even sizes the two interventions give the same expected points', () => {
  const h = H(20, 20), be = breakEven(ctx, h), c = compare(ctx, h);
  close(scenario(ctx, {attackPct: be.attackEquivalentToDefence, attackFrom: JAN}).points - c.baseline.points, c.defence.gain, 'attack equivalent', 0.005);
  close(scenario(ctx, {defencePct: be.defenceEquivalentToAttack, defenceFrom: JAN}).points - c.baseline.points, c.attack.gain, 'defence equivalent', 0.005);
  assert.ok(be.attackEquivalentToDefence > 20 && be.defenceEquivalentToAttack < 20);
  assert.equal(breakEven(ctx, H(300, 5)).defenceEquivalentToAttack, null, 'not reached within −90%: stated as such');
  const ex = explain(ctx, h); assert.match(ex.headline, /defence improvement .* adds more expected points/); assert.ok(ex.change.some(x => /\+27\.\d% to match −20%/.test(x)));
  assert.ok(ex.uncertainty.some(x => /no probability of survival/.test(x)));
});

test('invalid and missing inputs: refused or left uncomputed, never guessed', () => {
  assert.throws(() => scenario(ctx, {attackPct: -1})); assert.throws(() => scenario(ctx, {attackPct: 301})); assert.throws(() => scenario(ctx, {defencePct: 95}));
  const a = affordability(emptyFinance()); assert.equal(a.computed, false); assert.ok(a.missing.length >= 20); assert.equal(a.items, undefined);
  const partial = structuredClone(HYPOTHETICAL); partial.defence.monthlyWage = null;
  const p = affordability(partial, compare(ctx, H(20, 20)));
  assert.equal(p.computed, true); assert.equal(p.items.defence.known, false); assert.match(p.items.defence.reason, /Costs unknown for defence/); assert.equal(p.items.both.known, false); assert.equal(p.items.attack.known, true);
  assert.equal(financeModel(partial).options.length, 1, 'an intervention without its costs is not priced');
  const bad = structuredClone(HYPOTHETICAL); bad.minimumCash = -5; assert.equal(affordability(bad).computed, false);
});

test('financial impact: the Advantage Lab V1 and the Finance engine, reconciled to the cent; cost per expected point', () => {
  const f = structuredClone(HYPOTHETICAL), c = compare(ctx, H(20, 20)), a = affordability(f, c), m = financeModel(f), r = evaluate(m);
  assert.deepEqual(r.problems, []); assert.equal(m.label, 'Hypothetical financial assumptions — not Málaga CF data');
  for (const [k, ids] of [['attack', ['attack']], ['defence', ['defence']], ['both', ['attack', 'defence']]]) {
    const x = scenarioResults(r, ids), d = directCombination(m, ids), it = a.items[k];
    close(it.base.lowest, x.scenarios.base.lowest, `${k} base`, 0.005); close(it.downside.lowest, Math.min(...d.downside), `${k} downside = direct engine run`, 0.005);
    assert.ok(it.reconciled < 0.01, `${k} reconciled`); close(it.costPerExpectedPoint, it.totalCost / c[k].gain, `${k} cost per point`, 1e-6);
  }
  // Immediate cost of a signing = fee + agent fee + bonus.
  assert.equal(a.items.attack.upfront, 800_000 + 80_000 + 0); assert.equal(a.items.defence.upfront, 1_800_000 + 150_000 + 120_000);
});

test('exports: JSON and HTML carry the same figures, keep observed / estimate / hypothesis apart, and show no probability or named player', () => {
  const h = H(20, 20), f = structuredClone(HYPOTHETICAL), rep = report(ctx, h, f, '2026-11-24'), c = compare(ctx, h), html = reportHtml(rep);
  assert.equal(rep.observed.snapshot.points, 5); assert.equal(rep.hypotheses.interventions.attackPct, 20); assert.equal(rep.estimates.best, c.best);
  close(rep.estimates.attack.expectedPointsGained, +c.attack.gain.toFixed(3), 'JSON attack gain', 0);
  for (const k of ['baseline', 'attack', 'defence', 'both']) assert.ok(html.includes(rep.estimates[k].expectedFinalPoints.toFixed(1)), k);
  assert.ok(html.includes('class="box obs"') && html.includes('class="box est"') && html.includes('class="box hyp"'));
  for (const s of rep.observed.sources) assert.ok(html.includes(s.url.replace(/&/g, '&amp;')));
  assert.doesNotMatch(html + JSON.stringify(rep), /\d+(\.\d+)?\s?% (?:chance|probability|likely)|probability of (?:survival|staying up) (?:is|of) \d/i);
  assert.ok(rep.notShown.some(x => /No probability/.test(x)) && rep.notShown.some(x => /No named player/.test(x)));
  assert.equal(report(ctx, h, emptyFinance()).estimates.affordability.notComputed.startsWith('Enter the organisation figures'), true);
});

test('the page: verified links, both calls to action, independence statement, own scripts only, no tracker or form', () => {
  const dir = 'lanova/cases/malaga-winter-2027/', html = readFileSync(dir + 'index.html', 'utf8'), app = readFileSync(dir + 'app.js', 'utf8');
  for (const [, href] of html.matchAll(/href="((?!https?:|mailto:|#|data:)[^"]+)"/g)) { const p = normalize(join(dir, href.split(/[?#]/)[0])); const t = p.endsWith('/') || !p.includes('.') ? join(p, 'index.html') : p; assert.ok(existsSync(t), `${href} → ${t}`); }
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/platform\.html" data-cta="software">Explore LANOVA Sports Software<\/a>/);
  const review = html.match(/data-cta="review" href="([^"]+)"/)[1].replace(/&amp;/g, '&'), u = new URL(review);
  assert.equal(u.protocol, 'mailto:'); assert.equal(u.pathname, 'kevin@lake-am.com'); assert.equal(u.searchParams.get('subject'), 'LANOVA — Winter Transfer Strategy Review');
  assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/); assert.doesNotMatch(html, /<form\b|calendly|google-analytics|gtag|hotjar/i);
  for (const [, src] of html.matchAll(/<script[^>]* src="([^"]+)"/g)) assert.ok(!/^https?:/.test(src), src);
  assert.match(html, /<meta name="robots" content="noindex">/, 'not indexed before the founder\'s GO');
  assert.doesNotMatch(app, /localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest/); assert.equal([...app.matchAll(/fetch\(/g)].length, 1); assert.match(app, /fetch\('\.\.\/data\/laliga\.json'\)/);
});
