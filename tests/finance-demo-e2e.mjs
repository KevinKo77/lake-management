/**
 * LANOVA Finance public demonstration in Chromium (desktop 1440×950 and iPhone 13), served as static files like
 * GitHub Pages. Checks that every number shown comes from the engine, that the prospect can change assumptions,
 * compare scenarios, simulate a signing and an investment, read risks, export a report and reach the demo request.
 * Usage (repo root): node tests/finance-demo-e2e.mjs [out dir=outputs/finance-demo]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {analyse, forecast} from '../lanova/finance/engine/model.js';
import {CASES} from '../lanova/finance/engine/cases.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/finance-demo'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json'};
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
const fmt = v => `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`;
const browser = await chromium.launch();
async function open(opts) {
  const ctx = await browser.newContext({...opts, acceptDownloads: true}), page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); // Only requests made while the demonstration is open (the existing /demo.html page loads the site's web fonts).
  page.on('request', r => { if (page.url().includes('/lanova/finance/') && !r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) offsite.push(r.url()); });
  await page.goto(`${BASE}/lanova/finance/`); await page.waitForSelector('.club'); return {ctx, page};
}
const tab = (page, name) => page.locator('.tabs button', {hasText: name}).click();
const {page} = await open({viewport: {width: 1440, height: 950}});

await t('1 · choose a club: the forecast shown is the engine\'s, for each of the four fictional clubs', async () => {
  for (const id of ['basketball', 'groupNorth', 'groupSouth', 'football']) {
    await page.click(`.club[data-club="${id}"]`); await page.waitForSelector('.kpis');
    const want = analyse(CASES[id]()).base, text = await page.innerText('.kpis');
    for (const k of ['closingCash', 'minimumCash', 'revenue']) assert.ok(text.includes(fmt(want.indicators.find(i => i.id === k).value)), `${id} ${k}`);
  }
  assert.match(await page.innerText('main'), /Financial commitments — Months 1–12/); assert.match(await page.innerText('main'), /0\.96×/);
  assert.match(await page.innerText('body'), /Demonstration with fictional clubs/);
  await page.screenshot({path: join(out, 'demo_1_forecast_desktop.png'), fullPage: true});
});

await t('2 · change assumptions: the downside changes, the base does not; figures equal a direct engine run', async () => {
  await tab(page, 'Scenarios'); const row = async () => (await page.locator('tbody tr', {hasText: 'Lowest month-end cash'}).innerText()).split('\t');
  const before = await row();
  await tab(page, 'Assumptions');
  const media = page.locator('input[data-bind="scenarios.1.revenueFactors.media"]'); await media.fill('-20'); await media.press('Tab');
  const open = page.locator('input[data-bind="openingCash"]'); await open.fill('6000000'); await open.press('Tab');
  await tab(page, 'Scenarios'); const after = await row();
  const p = CASES.football(); p.openingCash = 6_000_000; p.scenarios[1].revenueFactors.media = 0.8;
  const want = analyse(p).scenarios;
  assert.equal(after[2].trim(), fmt(want[1].kpis.minimumCash)); assert.equal(after[1].trim(), fmt(want[0].kpis.minimumCash));
  assert.notEqual(after[2], before[2]);
  await page.screenshot({path: join(out, 'demo_2_scenarios_desktop.png'), fullPage: true});
});

await t('3 · simulate a signing: add one, change its fee and instalments; consequences recalculated in every scenario', async () => {
  await tab(page, 'Decisions'); await page.click('button[data-add="player"]'); await page.waitForSelector('text=New signing 1');
  const i = await page.locator('.decision').count() - 1;
  const fee = page.locator(`input[data-dec="${i}"][data-key="transferFee"]`); await fee.fill('2500000'); await fee.press('Tab');
  await page.selectOption(`select[data-dec="${i}"][data-key="_instalments"]`, '3');
  assert.equal(await page.locator('[role=alert]').count(), 0, 'inputs remain valid (instalments add up)');
  const text = await page.innerText('main'); assert.match(text, /New signing 1/); assert.match(text, /Selected decisions together/);
  await page.selectOption('select[data-ui="impactScenario"]', 'downside'); await page.waitForSelector('text=Consequences');
  await page.screenshot({path: join(out, 'demo_3_decisions_desktop.png'), fullPage: true});
});

await t('4 · simulate an investment (South): asset, other decisions and combined returns shown separately', async () => {
  await page.click('.club[data-club="groupSouth"]'); await tab(page, 'Decisions'); await page.waitForSelector('text=Investment return');
  const text = await page.innerText('main');
  assert.match(text, /Asset: selected investments alone\t180,000\t7\.2%/); assert.match(text, /Other selected decisions and interactions\t\+360,000\t\+14\.4 pts/); assert.match(text, /Combined scenario\t540,000\t21\.6%/);
  assert.match(text, /not an IRR or an NPV/);
  await page.click('button[data-add="investment"]'); await page.waitForSelector('text=/New investment \\d/'); assert.equal(await page.locator('[role=alert]').count(), 0);
});

await t('5 · risks and report: PDF, CSV and HTML exports generated in the browser, marked fictional', async () => {
  await page.click('.club[data-club="football"]'); await tab(page, 'Risks & report'); await page.waitForSelector('text=Main risks');
  assert.match(await page.innerText('main'), /HIGH · Operating cash flow of the first 12 months/);
  for (const f of ['pdf', 'csv', 'html']) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(`button[data-export="${f}"]`)]); const p = join(out, d.suggestedFilename()); await d.saveAs(p);
    const b = readFileSync(p); if (f === 'pdf') assert.equal(b.subarray(0, 8).toString(), '%PDF-1.4'); else assert.match(b.toString(), /fictional/i);
  }
  await page.screenshot({path: join(out, 'demo_4_report_desktop.png'), fullPage: true});
});

await t('6 · invalid input is explained, never calculated: empty opening cash', async () => {
  await tab(page, 'Assumptions'); const open = page.locator('input[data-bind="openingCash"]'); await open.fill(''); await open.press('Tab');
  assert.match(await page.innerText('[role=alert]'), /openingCash/); await page.click('.club[data-club="football"]'); assert.equal(await page.locator('[role=alert]').count(), 0);
});

await t('7 · contact path: the demo request leads to /demo.html (and its pre-filled e-mail)', async () => {
  const link = page.locator('a[data-cta="finance-demo-request"]').first(); assert.equal(await link.getAttribute('href'), '/demo.html');
  await link.click(); await page.waitForURL(/\/demo\.html$/); assert.match(await page.locator('a.btn-primary').first().getAttribute('href'), /^mailto:kevin@lake-am\.com\?subject=/);
});

await t('8 · phone (iPhone 13): every step usable without horizontal page overflow', async () => {
  const {page: ph, ctx} = await open({...devices['iPhone 13']});
  await ph.click('.club[data-club="football"]'); await ph.waitForSelector('.kpis');
  for (const s of ['Cash forecast', 'Assumptions', 'Scenarios', 'Decisions', 'Risks & report']) {
    await ph.locator('.tabs button', {hasText: s}).click();
    const overflow = await ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${s}: ${overflow}px`);
    if (s === 'Cash forecast' || s === 'Decisions') await ph.screenshot({path: join(out, `demo_phone_${s.split(' ')[0].toLowerCase()}.png`), fullPage: true});
  }
  await ctx.close();
});
await t('9 · no page error, and no request to any other site from the demonstration', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await browser.close(); server.close();
writeFileSync(join(out, 'finance-demo-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
void forecast;
