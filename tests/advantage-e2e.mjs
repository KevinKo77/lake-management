/**
 * LANOVA Advantage Lab (/lanova/advantage/) in Chromium, desktop 1440×900 and iPhone 13, served as static files.
 * Start modes, validation, the Resource Advantage Map, the simulator's recalculation, strategies, exports, keyboard,
 * phone layout, page errors and third-party requests.
 * Usage (repo root): node tests/advantage-e2e.mjs [out dir=outputs/advantage]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {evaluate, fmt, financialNotice, FINANCIAL_INCOMPLETE} from '../lanova/advantage/lab.js';
import {EXAMPLES} from '../lanova/advantage/examples.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/advantage'); mkdirSync(out, {recursive: true});
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
async function open(opts) {
  const ctx = await browser.newContext({...opts, acceptDownloads: true, reducedMotion: 'reduce'}), page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) offsite.push(r.url()); });
  await page.goto(`${BASE}/lanova/advantage/`); await page.waitForSelector('[data-example]'); return {ctx, page};
}
const fill = async (page, bind, v) => { const i = page.locator(`[data-bind="${bind}"]`); await i.fill(String(v)); await i.dispatchEvent('input'); await page.waitForTimeout(220); };
const rowOf = async (page, name) => (await page.locator('#map tbody tr').filter({has: page.locator('td:first-child', {hasText: name})}).first().innerText()).split('\t').map(s => s.trim());
const {page} = await open({viewport: {width: 1440, height: 900}});

await t('1 · start screen: title, promise, two modes; no organisation imposed', async () => {
  assert.equal(await page.locator('h1').innerText(), 'LANOVA Advantage Lab');
  assert.match(await page.innerText('main'), /Discover what your resources could achieve\./);
  assert.equal(await page.locator('[data-start="blank"]').count(), 1); assert.equal(await page.locator('[data-example]').count(), 3);
  assert.equal(await page.locator('svg.map').count(), 0, 'nothing loaded by default');
  await page.screenshot({path: join(out, 'advantage_start_desktop.png'), fullPage: true});
});

await t('2 · start from scratch: neutral workspace, nothing computed until valid; adding an option computes the map', async () => {
  await page.click('[data-start="blank"]'); await page.waitForSelector('#map');
  assert.match(await page.innerText('#map [role=alert]'), /Cash available today/);
  for (const [k, v] of [['finance.openingCash', 200000], ['finance.annualRevenue', 300000], ['finance.annualOperatingCosts', 290000], ['finance.minimumCash', 50000], ['finance.decisionBudget', 40000]]) await fill(page, k, v);
  assert.equal(await page.locator('#map [role=alert]').count(), 0); assert.match(await page.innerText('#map'), /Add options/);
  await page.click('[data-add]'); await fill(page, 'options.0.name', 'Assistant coach'); await fill(page, 'options.0.monthlyCost', 1500);
  await page.selectOption('[data-bind="options.0.shortTermScore"]', '6'); await page.selectOption('[data-bind="options.0.longTermScore"]', '5'); await page.selectOption('[data-bind="options.0.risk"]', 'low'); await page.waitForTimeout(220);
  assert.equal(await page.locator('svg.map .pt').count(), 1); assert.match((await rowOf(page, 'Assistant coach'))[1], /Efficient/);
  assert.match(await page.innerText('#map'), /not estimable/, 'a new option\'s financial gain starts as not estimable');
  await page.click('[data-home]'); await page.waitForSelector('[data-example]');
});

await t('3 · illustrative example: the map and table equal a direct run of the engine; infeasible and dominated options shown', async () => {
  await page.click('[data-example="pro"]'); await page.waitForSelector('svg.map');
  const want = evaluate(EXAMPLES.pro.make());
  for (const o of want.options) { const r = await rowOf(page, o.name); assert.equal(r[3], fmt(o.totals.totalCost), o.name); assert.equal(r[5], fmt(o.minCashBase), o.name); }
  assert.equal(await page.locator('svg.map .pt.infeasible').count(), want.options.filter(o => o.status === 'infeasible').length);
  assert.equal(await page.locator('svg.map .pt.dominated').count(), want.options.filter(o => o.status === 'dominated').length);
  assert.match(await page.innerText('main'), /Illustrative example — anonymous; all figures invented/);
  const strat = await page.innerText('#results');
  for (const s of Object.values(want.strategies)) assert.ok(strat.includes(s.best.options.length ? s.best.options[0] : 'Do nothing'), 'strategy pick shown');
  await page.screenshot({path: join(out, 'advantage_example_desktop.png'), fullPage: true});
  await page.locator('svg.map').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'advantage_map_desktop.png')});
});

await t('4 · simulator recalculates: raising the reserve makes options infeasible; the objective changes the vertical axis', async () => {
  const before = await page.locator('svg.map .pt.infeasible').count();
  await fill(page, 'finance.minimumCash', 2900000);
  const m = EXAMPLES.pro.make(); m.finance.minimumCash = 2_900_000; const want = evaluate(m);
  assert.equal(await page.locator('svg.map .pt.infeasible').count(), want.options.filter(o => o.status === 'infeasible').length); assert.ok(want.options.filter(o => !o.feasible).length > before);
  await fill(page, 'finance.minimumCash', 1500000);
  await page.selectOption('[data-bind="objective"]', 'development'); await page.waitForTimeout(150);
  assert.match(await page.locator('svg.map').innerHTML(), /Your estimate \(0–10\)/);
  await fill(page, 'options.0.upfront', -5); assert.match(await page.innerText('#map [role=alert]'), /immediate cost/); await fill(page, 'options.0.upfront', 2400000);
  assert.equal(await page.locator('#map [role=alert]').count(), 0);
});

await t('5 · decision brief: HTML, JSON and CSV exports carry the same figures', async () => {
  const get = async kind => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${kind}"]`)]); const f = join(out, d.suggestedFilename()); await d.saveAs(f); return readFileSync(f, 'utf8'); };
  const html = await get('html'), json = JSON.parse(await get('json')), csv = await get('csv');
  const m = EXAMPLES.pro.make(); m.objective = 'development'; const want = evaluate(m);
  assert.equal(json.brief.options.length, want.options.length);
  want.options.forEach((o, i) => { assert.equal(json.brief.options[i].totalCost, o.totals.totalCost); assert.ok(csv.includes(`"${o.name}","${o.status}"`), o.name); assert.ok(html.includes(o.name)); });
  assert.match(html, /Hard constraints/); assert.match(html, /Data missing for a definitive decision/); assert.match(html, /every figure is invented/);
  // P0: a gain that is not estimable is flagged identically in the five places: interface, brief, HTML, JSON, CSV.
  const names = want.financial.optionsWithUnknownGain, n = financialNotice(want); assert.ok(names.length && n.incomplete);
  for (const id of ['#map-fin-notice', '#brief-fin-notice']) { const ui = await page.innerText(id); assert.equal(ui, n.full, id); assert.equal(ui.split(FINANCIAL_INCOMPLETE).length, 2, `${id}: stated once`); }
  for (const k of want.financial.strategiesAffected) { const card = await page.innerText(`[data-financial-incomplete="${k}"]`); for (const x of names) assert.ok(card.includes(x), `${k}: ${x}`); }
  assert.equal(await page.locator('.sres.financial-incomplete').count(), want.financial.strategiesAffected.length);
  assert.equal(json.brief.financialComparison.status, 'incomplete'); assert.deepEqual(json.brief.financialComparison.optionsWithUnknownGain, names); assert.equal(json.brief.financialComparison.warning, n.full);
  assert.ok(html.includes('id="financial-notice"') && html.includes(FINANCIAL_INCOMPLETE));
  assert.ok(csv.split('\r\n')[1].startsWith('"WARNING — Financial comparison incomplete'));
  for (const x of names) { assert.ok(html.includes(x) && csv.includes(x)); assert.match(await rowOf(page, x).then(r => r[4]), /gain not estimable: costs only/); }
  await page.locator('#map-fin-notice').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'advantage_financial_incomplete_desktop.png')});
});

await t('5b · a documented gain range replaces "not estimable": validated, cash at its low end, the warning clears', async () => {
  const i = (await evaluate(EXAMPLES.pro.make())).options.findIndex(o => o.totals.financialStatus === 'unknown');
  await page.selectOption(`[data-gain-kind="${i}"]`, 'range'); await page.waitForTimeout(250);
  assert.match(await page.innerText('#map [role=alert]'), /lowest documented gain per month/, 'an empty range is not computed');
  await fill(page, `options.${i}.gainRange.low`, 10000); await fill(page, `options.${i}.gainRange.high`, 40000);
  assert.match(await page.innerText('#map [role=alert]'), /a range is not a guess/, 'a source is required');
  await fill(page, `options.${i}.gainRange.basis`, 'Illustrative: two written quotes');
  assert.equal(await page.locator('#map [role=alert]').count(), 0); assert.equal(await page.locator('.sres.financial-incomplete').count(), 0);
  assert.doesNotMatch(await page.innerText('#map-fin-notice'), /Financial comparison incomplete/); assert.match(await page.innerText('#map-fin-notice'), /cash uses the low end/);
  const m = EXAMPLES.pro.make(); m.objective = 'development'; m.options[i].gainRange = {low: 10000, high: 40000, basis: 'Illustrative: two written quotes'}; const want = evaluate(m);
  assert.equal((await rowOf(page, want.options[i].name))[5], fmt(want.options[i].minCashBase));
  assert.match((await rowOf(page, want.options[i].name))[4], /documented range/);
  await page.selectOption(`[data-gain-kind="${i}"]`, 'unknown'); await page.waitForTimeout(250);
  assert.ok(await page.locator('.sres.financial-incomplete').count() > 0, 'back to not estimable: flagged again');
});

await t('6 · keyboard: start buttons and map points are reachable and named', async () => {
  await page.goto(`${BASE}/lanova/advantage/`); await page.waitForSelector('[data-example]');
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');
  await page.locator('[data-example="semipro"]').focus(); await page.keyboard.press('Enter'); await page.waitForSelector('svg.map');
  const pt = page.locator('svg.map .pt').first(); await pt.focus(); assert.match(await pt.getAttribute('aria-label'), /^Option \d+, .+ Total cost .+ EUR/);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('pt')), true);
});

await t('7 · phone (iPhone 13): no horizontal overflow; map readable; table scrolls in its own frame', async () => {
  const {page: ph, ctx} = await open({...devices['iPhone 13']});
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1); await ph.screenshot({path: join(out, 'advantage_start_phone.png'), fullPage: true});
  await ph.click('[data-example="amateur"]'); await ph.waitForSelector('svg.map'); assert.ok(await over() <= 1, `${await over()}px`);
  assert.equal(await ph.locator('svg.map').getAttribute('viewBox'), '0 0 560 620', 'narrow layout of the map');
  await ph.locator('svg.map').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'advantage_map_phone.png')});
  await ph.locator('#h-strat').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'advantage_strategies_phone.png')});
  await ctx.close();
});

await t('8 · no page error and no request to any other site', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await browser.close(); server.close();
writeFileSync(join(out, 'advantage-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
