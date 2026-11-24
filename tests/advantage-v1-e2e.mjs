/**
 * LANOVA Advantage Lab V1 in Chromium (desktop 1440×900, then iPhone 13 with touch): the six-step workflow, the
 * scenario and constraint editors, the sensitivity analysis (compared with the same calculation in Node), exports,
 * project files (save, reopen, reject), performance with the maximum number of options, phone layout and page errors.
 * Usage (repo root): node tests/advantage-v1-e2e.mjs [out dir=outputs/advantage-v1]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {evaluate, scenarioResults, fmt, MAX_OPTIONS, SCHEMA} from '../lanova/advantage/lab.js';
import {analyse} from '../lanova/advantage/sensitivity.js';
import {exportProject} from '../lanova/advantage/project.js';
import {WORKED, EXAMPLES} from '../lanova/advantage/examples.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/advantage-v1'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const checks = [], errors = [], offsite = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function open(opts, path = '/lanova/advantage/?example=worked') {
  const ctx = await browser.newContext({...opts, acceptDownloads: true, reducedMotion: 'reduce'}), page = await ctx.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) offsite.push(r.url()); });
  await page.goto(BASE + path); return {ctx, page};
}
const fill = async (page, bind, v) => { const i = page.locator(`[data-bind="${bind}"]`); await i.fill(String(v)); await i.dispatchEvent('input'); await page.waitForTimeout(220); };
const rowCells = async (page, scope, text) => (await page.locator(`${scope} tbody tr`).filter({hasText: text}).first().innerText()).split('\t').map(s => s.trim());
const save = async (page, selector, name) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)]); const f = join(out, name ?? d.suggestedFilename()); await d.saveAs(f); return readFileSync(f, 'utf8'); };
const {page, ctx} = await open({viewport: {width: 1440, height: 900}});
await page.waitForSelector('svg.map');

await t('1 · six-step workflow: every step link leads to its section; the origin of the data is stated', async () => {
  const links = await page.locator('nav.steps a').evaluateAll(as => as.map(a => [a.getAttribute('href'), a.textContent.trim()]));
  assert.deepEqual(links.map(x => x[0]), ['#h-org', '#h-opts', '#h-scen', '#h-map', '#h-sens', '#h-brief']);
  for (const [href] of links) { await page.click(`nav.steps a[href="${href}"]`); assert.equal(await page.locator(href).count(), 1); }
  assert.match(await page.innerText('#origin'), /Illustrative example — anonymous; all figures invented/);
  assert.match(await page.innerText('h1'), /Illustrative semi-professional football club/);
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({path: join(out, 'v1_workspace_top_desktop.png')});
});

await t('2 · scenario results equal the engine (Node) for the recommendation; changing a scenario recalculates them', async () => {
  const m = WORKED.make(), r = evaluate(m), want = scenarioResults(r, r.strategies.immediate.best.ids);
  for (const [k, label] of [['base', 'Base case'], ['downside', 'Downside'], ['upside', 'Upside']]) {
    const c = await rowCells(page, '#scen-results', label); assert.equal(c[2], fmt(want.scenarios[k].lowest), `${k} lowest`); assert.equal(c[5], fmt(want.scenarios[k].end), `${k} end`);
  }
  await page.locator('#scen-results').screenshot({path: join(out, 'v1_scenarios_desktop.png')});
  await fill(page, 'scenarios.downside.revenuePct', -15);
  const m2 = WORKED.make(); m2.scenarios.downside.revenuePct = -15; const r2 = evaluate(m2), w2 = scenarioResults(r2, r2.strategies.immediate.best.ids);
  assert.equal((await rowCells(page, '#scen-results', 'Downside'))[2], fmt(w2.scenarios.downside.lowest));
  await fill(page, 'scenarios.downside.revenuePct', -6);
});

await t('3 · constraints in the interface: mandatory, requires, exclusive groups, downside reserve; a cycle is refused', async () => {
  const analyst = (await page.locator('.option').evaluateAll(els => els.map(e => e.querySelector('header b').textContent))).findIndex(x => /Performance analyst/.test(x));
  await page.check(`[data-mandatory="${analyst}"]`); await page.waitForTimeout(250);
  for (const k of ['immediate', 'development', 'security']) assert.match(await page.innerText(`.sres[data-strategy="${k}"] .pick`), /Performance analyst/);
  await page.uncheck(`[data-mandatory="${analyst}"]`); await page.waitForTimeout(250);
  // A cycle: the pitch requires the academy, which requires the pitch.
  const pitch = 4; await page.check(`[data-requires="${pitch}"][value="academy"]`); await page.waitForTimeout(250);
  assert.match(await page.innerText('#map [role=alert]'), /Circular dependency/);
  await page.uncheck(`[data-requires="${pitch}"][value="academy"]`); await page.waitForTimeout(250); assert.equal(await page.locator('#map [role=alert]').count(), 0);
  await page.check('[data-downside-must-hold]'); await page.waitForTimeout(300);
  const m = WORKED.make(); m.constraints.downsideMustHold = true; const r = evaluate(m);
  assert.match(await page.innerText('.sres[data-strategy="immediate"]'), new RegExp(`${r.strategies.immediate.candidates} feasible combination`));
  await page.uncheck('[data-downside-must-hold]'); await page.waitForTimeout(300);
  assert.match(await page.innerText('#h-scen + p, section[aria-labelledby="h-scen"]'), /At most one of \(group "goalkeeper"\)/);
});

await t('4 · sensitivity: the values shown equal the same analysis in Node; thresholds come with tolerances; included in the exported brief', async () => {
  await page.click('[data-sens]'); await page.waitForSelector('#sens table');
  const a = analyse(WORKED.make(), 'immediate');
  const rev = await rowCells(page, '#sens table:nth-of-type(1)', 'Base case'); assert.equal(rev[2], fmt(a.requiredRevenue[1].value));
  const th = await page.innerText('#sens'); for (const x of a.thresholds.items.filter(i => i.value !== undefined && i.value !== null)) assert.ok(th.includes(`${x.value > 0 ? '+' : ''}${x.value.toFixed(2)}%`), x.label);
  for (const x of a.preference.items.filter(i => i.value !== undefined)) assert.ok(th.includes(fmt(x.value)), x.option);
  assert.match(th, /±/); assert.match(th, /Finance engine/);
  await page.locator('#sens').screenshot({path: join(out, 'v1_sensitivity_desktop.png')});
  const html = await save(page, '[data-export="html"]'), json = JSON.parse(await save(page, '[data-export="json"]')), csv = await save(page, '[data-export="csv"]');
  assert.match(html, /Sensitivity and break-even — Maximise estimated immediate benefits/); assert.match(html, /Why not the alternatives/);
  assert.equal(json.brief.schema, 'lanova-advantage-brief-v1'); assert.equal(json.brief.sensitivity.recommendation.join('+'), a.recommendation.join('+'));
  assert.ok(csv.split('\r\n')[2].startsWith('"Option","Status"'), 'CSV structure unchanged');
  // Any change makes the analysis stale: it is dropped, not shown for other inputs.
  await fill(page, 'finance.minimumCash', 650000); assert.match(await page.innerText('#sens'), /Inputs changed: run the analysis again/);
  await fill(page, 'finance.minimumCash', 600000);
});

await t('5 · project file: save, reopen (same results), and a tampered file is refused with the reason', async () => {
  const text = await save(page, '[data-save]', 'project.json');
  const file = JSON.parse(text); assert.equal(file.format, 'lanova-advantage-project'); assert.equal(file.schema, SCHEMA); assert.equal(file.dataNotice, 'Illustrative example — every figure is invented');
  await page.click('[data-home]'); await page.waitForSelector('[data-start]');
  await page.setInputFiles('[data-import]', join(out, 'project.json')); await page.waitForSelector('svg.map');
  assert.match(await page.innerText('#import-notice'), /Imported project file: illustrative data/); assert.match(await page.innerText('#origin'), /Imported project file/);
  const r = evaluate(WORKED.make()); assert.match(await page.innerText('.sres[data-strategy="immediate"] .pick'), new RegExp(r.strategies.immediate.best.options[0].replace(/[()]/g, '.')));
  file.model.options[0].script = '<img onerror=alert(1)>'; writeFileSync(join(out, 'tampered.json'), JSON.stringify(file));
  await page.click('[data-home]'); await page.setInputFiles('[data-import]', join(out, 'tampered.json')); await page.waitForSelector('#import-errors');
  assert.match(await page.innerText('#import-errors'), /options\[0\]\.script: unknown field/); assert.equal(await page.locator('img').count(), 0);
});

await t(`6 · performance: a project with ${MAX_OPTIONS} options (1,024 combinations) computes and analyses within bounds in the browser`, async () => {
  const opts = Array.from({length: MAX_OPTIONS}, (_, i) => ({id: `o${i}`, name: `Option ${i + 1}`, category: '', kind: 'project', upfront: 2_000 * (i + 1), upfrontType: i % 2 ? 'capital' : 'expense', usefulLifeMonths: 60, instalments: 1 + (i % 2), instalmentEveryMonths: 3,
    startMonth: i % 3, monthlyCost: 300 + 50 * i, costType: i % 2 ? 'staff' : 'operating', commitmentMonths: 12, effectMonths: 1, monthlyGain: i % 3 === 0 ? 500 : i % 3 === 1 ? null : 0, gainMonths: 12, shortTermScore: (i * 3) % 11, longTermScore: (i * 7) % 11,
    risk: ['low', 'medium', 'high'][i % 3], confidence: 'medium', mandatory: false, requires: i === 5 ? ['o1'] : [], exclusiveGroup: i === 2 || i === 8 ? 'pick-one' : ''}));
  const m = {...WORKED.make(), label: 'Ten options (test)', options: opts, finance: {openingCash: 300_000, annualRevenue: 1_200_000, annualOperatingCosts: 1_150_000, staffCosts: 600_000, minimumCash: 150_000, decisionBudget: 60_000}};
  writeFileSync(join(out, 'ten.json'), exportProject(m));
  if (await page.locator('[data-home]').count()) await page.click('[data-home]');
  let t0 = Date.now(); await page.setInputFiles('[data-import]', join(out, 'ten.json')); await page.waitForSelector('svg.map'); const tLoad = Date.now() - t0;
  assert.equal(await page.locator('svg.map .pt').count(), MAX_OPTIONS);
  t0 = Date.now(); await page.click('[data-sens]'); await page.waitForSelector('#sens table', {timeout: 60000}); const tSens = Date.now() - t0;
  console.log(`   ${MAX_OPTIONS} options in the browser: computed in ${tLoad} ms, sensitivity analysis in ${tSens} ms`);
  writeFileSync(join(out, 'performance.json'), JSON.stringify({options: MAX_OPTIONS, combinations: 1024, computeMs: tLoad, sensitivityMs: tSens}, null, 2));
  assert.ok(tLoad < 5_000, `${tLoad} ms`); assert.ok(tSens < 30_000, `${tSens} ms`);
  assert.equal(await page.locator('[data-add]').isDisabled(), true, `the option limit stays ${MAX_OPTIONS}`);
});

await t('7 · the pro example: a threshold that cannot be identified is stated as such', async () => {
  await page.goto(BASE + '/lanova/advantage/?example=pro'); await page.waitForSelector('svg.map');
  await page.selectOption('[data-ui="strategy"]', 'development'); await page.click('[data-sens]'); await page.waitForSelector('#sens table');
  assert.match(await page.innerText('#sens'), /Not determinable from the available assumptions: the immediate cost .* exceeds the budget/);
});

await t('8 · phone (iPhone 13, touch): workflow, editors and sensitivity usable by tap; no horizontal overflow', async () => {
  const {page: ph, ctx: c2} = await open({...devices['iPhone 13']});
  await ph.waitForSelector('svg.map');
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1, `${await over()}px`);
  await ph.locator('nav.steps a[href="#h-scen"]').tap(); await ph.waitForTimeout(200); await ph.screenshot({path: join(out, 'v1_scenarios_phone.png')});
  const i = ph.locator('[data-bind="scenarios.downside.revenuePct"]'); await i.tap(); await i.fill('-10'); await i.dispatchEvent('input'); await ph.waitForTimeout(300);
  assert.ok(await over() <= 1);
  await ph.locator('[data-sens]').tap(); await ph.waitForSelector('#sens table');
  assert.ok(await over() <= 1, 'sensitivity tables scroll inside their frame');
  await ph.locator('#sens').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'v1_sensitivity_phone.png')});
  await ph.locator('#scen-results').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'v1_cash_phone.png')});
  for (const ex of Object.keys(EXAMPLES)) { await ph.goto(`${BASE}/lanova/advantage/?example=${ex}`); await ph.waitForSelector('svg.map'); assert.ok(await over() <= 1, ex); }
  await c2.close();
});

await t('9 · no page error and no request to any other site', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await ctx.close(); await browser.close(); server.close();
writeFileSync(join(out, 'advantage-v1-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
