// LANOVA Survival Decision Lab (/lanova/decision-lab/): the financial figures come from the single published LANOVA
// Finance engine (no second engine), the sporting snapshot is dated and sourced, no survival probability is published,
// points gains are presented as hypotheses, the financial data are fictional and the page sends nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {SNAPSHOT, STRATEGIES, defaults, buildPlan, evaluate, check, instalments, comparison, summaryCsv, summaryHtml, SEASON_END} from '../lanova/decision-lab/lab.js';
import {forecast, validatePlan} from '../lanova/finance/engine/model.js';

const dir = 'lanova/decision-lab/', read = f => readFileSync(dir + f, 'utf8');

test('one engine: the lab imports only the published Finance engine and has no engine copy of its own', () => {
  assert.deepEqual(readdirSync(dir).sort(), ['index.html', 'lab.css', 'lab.js', 'ui.js']);
  const imports = f => [...read(f).matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
  assert.deepEqual(imports('lab.js'), ['../finance/engine/model.js']); assert.deepEqual(imports('ui.js'), ['./lab.js']);
  assert.doesNotMatch(read('ui.js'), /closingCash\s*[-+]|monthlyWage\s*\*|employerChargeRate\s*\*/, 'no financial formula in the interface');
});

test('the default plan is valid for the engine, fictional, and every cash figure equals a direct engine run', () => {
  const inp = defaults(), plan = buildPlan(inp), r = evaluate(inp);
  assert.deepEqual(validatePlan(plan), []); assert.equal(plan.fictional, true); assert.match(plan.source, /fictional/i);
  assert.ok(plan.lines.every(l => /Fictional/.test(l.source)));
  const run = (sc, d) => forecast(plan, {scenario: sc, decisions: d});
  const ref = run('base', []);
  for (const st of STRATEGIES) {
    const s = r.strategies.find(x => x.id === st.id), d = st.decisions, stay = run('base', d), down = run('downside', d);
    assert.equal(s.cash.stayClosing, stay.totals.closingCash); assert.equal(s.cash.downClosing, down.totals.closingCash);
    assert.equal(s.cash.cost24, ref.totals.closingCash - stay.totals.closingCash); assert.equal(s.cash.seasonCash, stay.months[SEASON_END].closingCash);
    assert.equal(s.cash.stayMinimum, stay.totals.minimumCash); assert.equal(s.cash.downMinimum, down.totals.minimumCash);
  }
  assert.equal(r.strategies[0].cash.cost24, 0);
  // The signing bonus is paid in January 2027 in both conditions (engine finance-1.1 workaround, see lab.js).
  for (const s of r.strategies) assert.equal(s.series.down[0], s.series.stay[0], s.id);
});

test('reference values of the default case (non-regression)', () => {
  const s = Object.fromEntries(evaluate(defaults()).strategies.map(x => [x.id, x]));
  assert.deepEqual([s.A.points.total, s.B.points.total, s.C.points.total], [33, 38, 36]);
  assert.deepEqual(s.B.points.gaps.map(g => g.gap), [4, 1, -5]); assert.deepEqual([s.A, s.B, s.C].map(x => x.points.target.gap), [-7, -2, -4]);
  // B: loan fee 1.2M + agent 0.1M + 6 months × 120k × 1.3 = 2,236,000 — all within the season.
  assert.equal(s.B.cash.seasonCost, 2_236_000); assert.equal(s.B.cash.cost24, 2_236_000);
  // C: 3 × 800k (months 0, 6, 12) + agent 200k + bonus 150k + 18 months × 70k × 1.3 = 4,388,000; by June: 800k + 350k + 6 × 91k.
  assert.equal(s.C.cash.cost24, 4_388_000); assert.equal(s.C.cash.seasonCost, 1_696_000);
  assert.equal(s.B.cash.costPerExtraPoint, 2_236_000 / 5);
  assert.ok(s.C.constraints.some(c => /below the minimum cash policy if the club is relegated/.test(c.text)));
});

test('fee schedules add up exactly; the relegation condition starts in July 2027 and changes only that condition', () => {
  for (const [fee, n] of [[2_400_000, 3], [1_000_000.01, 3], [999_999, 2]]) assert.equal(Math.round(instalments(fee, n).reduce((a, p) => a + p.amount, 0) * 100), Math.round(fee * 100));
  const inp = defaults(), a = evaluate(inp); inp.finance.relegatedMediaPct = 30; const b = evaluate(inp);
  for (const i of [0, 1, 2]) { assert.equal(a.strategies[i].cash.stayClosing, b.strategies[i].cash.stayClosing); assert.ok(b.strategies[i].cash.downClosing < a.strategies[i].cash.downClosing); assert.equal(a.strategies[i].series.down[SEASON_END], a.strategies[i].series.stay[SEASON_END]); }
});

test('invalid inputs are refused with a reason, never calculated', () => {
  const bad = f => { const i = defaults(); f(i); const r = evaluate(i); assert.ok(r.problems.length > 0); assert.equal(r.strategies, undefined); return r.problems.join(' | '); };
  assert.match(bad(i => { i.A.gain = 3 * 26 + 1; }), /points gained/);
  assert.match(bad(i => { i.sport.points = 40; }), /Current points/);
  assert.match(bad(i => { i.B.gain = 2.5; }), /whole number/);
  assert.match(bad(i => { i.finance.openingCash = NaN; }), /Finance engine: openingCash/);
  assert.match(bad(i => { i.C.contractMonths = 30; }), /contract months/);
  assert.deepEqual(check(defaults()), []);
});

test('sporting snapshot: dated, sourced, consistent, with the discrepancy disclosed', () => {
  assert.equal(SNAPSHOT.referenceDate, '2026-11-22'); assert.ok(SNAPSHOT.sources.length >= 3 && SNAPSHOT.sources.every(s => /^https:\/\//.test(s.url)));
  assert.equal(SNAPSHOT.won * 3 + SNAPSHOT.drawn, SNAPSHOT.points); assert.equal(SNAPSHOT.won + SNAPSHOT.drawn + SNAPSHOT.lost, SNAPSHOT.played);
  assert.equal(SNAPSHOT.played, 13); assert.equal(SNAPSHOT.totalMatches - SNAPSHOT.played, 25); assert.equal(SNAPSHOT.points, 5);
  assert.match(SNAPSHOT.state, /Osasuna 1–0 Málaga CF/); assert.match(SNAPSHOT.discrepancy, /12 matches/); assert.match(SNAPSHOT.rights, /No league table, fixture list, logo/);
});

test('the page: independent, fictional finance, no probability, hypotheses, strict CSP, own scripts only, nothing sent, CTA', () => {
  const html = read('index.html'), js = read('ui.js') + read('lab.js');
  assert.match(html, /<h1|Málaga CF — The Cost of Survival/); assert.match(js, /<h1>Málaga CF — The Cost of Survival<\/h1>/);
  assert.match(html, /not affiliated with, endorsed by or sponsored by Málaga CF or LaLiga/); assert.match(html, /All financial data are fictional/);
  assert.match(js, /No probability is shown/); assert.match(js, /not the measured or expected effect of any player or transfer/);
  assert.doesNotMatch(html + js, /\d\s?%\s*(chance|probability|likelihood)|(probability|chance|likelihood|odds) (of|to) (survive|survival|stay|relegation)[^.]*\d/i);
  assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'self'/);
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.equal(m[1], 'ui.js');
  for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) assert.match(m[1], /^(\.\.\/finance\/demo\.css|lab\.css)$/);
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|sendBeacon|<img|<script/);
  assert.doesNotMatch(html + js, / style="/, 'no inline style (CSP)');
  // Third-party URLs only as cited sources (links opened by the reader), never loaded.
  for (const m of (html + js).matchAll(/https:\/\/([a-z0-9.-]+)/gi)) assert.ok(['www.lakecapitalmanagement.com', ...SNAPSHOT.sources.map(s => new URL(s.url).host)].includes(m[1]), m[1]);
  assert.ok(html.includes('href="/demo.html"') && html.includes('mailto:kevin@lake-am.com')); assert.doesNotMatch(html + js, /stripe|checkout|signup/i);
});

test('required pace for a user-chosen, hypothetical objective', () => {
  const r = evaluate(defaults()); assert.deepEqual({...r.pace, paths: undefined}, {target: 40, needed: 35, perMatch: 1.4, reachable: true, paths: undefined});
  for (const p of r.pace.paths) { assert.equal(3 * p.wins + p.draws, 35); assert.equal(p.wins + p.draws + p.losses, 25); }
  const i = defaults(); i.sport.target = 3; assert.equal(evaluate(i).pace.needed, 0);
  i.sport.target = 80; i.sport.points = 4; const far = evaluate(i).pace; assert.equal(far.reachable, false); assert.equal(far.paths.length, 0, '76 > 75 points available');
  i.sport.points = 5; assert.deepEqual(evaluate(i).pace.paths, [{wins: 25, draws: 0, losses: 0}]);
  i.sport.target = 2.5; assert.match(check(i).join(' '), /objective: whole number/);
});

test('presentation exports: notices, figures identical to the comparison, no external resource', () => {
  const inp = defaults(), r = evaluate(inp), csv = summaryCsv(r, inp), html = summaryHtml(r, inp, '2026-11-22');
  for (const t of [csv, html]) { assert.match(t, /not affiliated with Málaga CF or LaLiga/); assert.match(t, /fictional/i); assert.match(t, /No survival probability/); assert.match(t, /not the real survival threshold/); }
  const lines = csv.trim().split('\r\n'); assert.equal(lines.length, 6); assert.match(lines[2], /^"Strategy",/);
  comparison(r).forEach((c, k) => assert.ok(lines[3 + k].startsWith(`"${c.strategy}",${c.gain},`) && lines[3 + k].includes(`,${c.cost24},`), c.strategy));
  assert.doesNotMatch(html, /<script|<link|<img|src=|href=|url\(/i, 'no external resource, sources cited as text'); assert.match(html, /35 points needed, 1\.40 per match/);
});
