/**
 * LANOVA Survival Decision Lab (/lanova/decision-lab/) in Chromium, desktop 1440×950 and iPhone 13, served as static
 * files like GitHub Pages. Checks that the figures shown are the engine's, that inputs drive the outputs, that invalid
 * input is explained, that the report prints, that the contact path works, and that nothing leaves the page.
 * Usage (repo root): node tests/decision-lab-e2e.mjs [out dir=outputs/decision-lab]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {evaluate, defaults, fmt, comparison} from '../lanova/decision-lab/lab.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/decision-lab'); mkdirSync(out, {recursive: true});
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
const browser = await chromium.launch();
async function open(opts) {
  const ctx = await browser.newContext({...opts, acceptDownloads: true}), page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (page.url().includes('/lanova/decision-lab/') && !r.url().startsWith(BASE) && !r.url().startsWith('data:')) offsite.push(r.url()); });
  await page.goto(`${BASE}/lanova/decision-lab/`); await page.waitForSelector('#h-cash'); return {ctx, page};
}
const fill = async (page, k, v) => { const i = page.locator(`[data-k="${k}"]`); await i.fill(String(v)); await i.press('Tab'); };
const row = async (page, section, label) => (await page.locator(`section:has(#${section}) tbody tr`, {hasText: label}).innerText()).split('\t').map(s => s.trim());
const {page} = await open({viewport: {width: 1440, height: 950}});

await t('1 · title, independence and fictional-finance notices, sources and reference date are shown', async () => {
  assert.equal(await page.locator('h1').innerText(), 'Málaga CF — The Cost of Survival');
  const body = await page.innerText('body');
  assert.match(body, /not affiliated with, endorsed by or sponsored by Málaga CF/); assert.match(body, /All financial data are fictional/);
  assert.match(body, /2026-11-22/); assert.match(body, /Known discrepancy/); assert.match(body, /Data rights:/);
  assert.match(body, /5 points from 13 matches/); assert.equal(await page.innerText('#left'), '25'); assert.match(body, /0W 5D 8L/);
  assert.match(await page.innerText('#pace'), /35\s+to reach your objective of 40 \(hypothetical\)/); assert.match(await page.innerText('#pace'), /1\.40 pts \/ match/); assert.ok(await page.locator('#sources a[href^="https://"]').count() >= 4);
  assert.doesNotMatch(body, /\d+(\.\d+)?\s?% (chance|probability|likelihood)|(chance|probability|likelihood) of (survival|staying up|relegation)\s*[:=]?\s*\d/i, 'no survival probability');
  await page.screenshot({path: join(out, 'lab_1_desktop_top.png')});
});

await t('2 · default figures equal a direct run of lab.js (engine) for every strategy', async () => {
  const want = evaluate(defaults());
  for (const s of want.strategies) {
    const pts = await row(page, 'h-pts', s.label); assert.equal(pts[3], String(s.points.total), `${s.id} points`); assert.equal(pts[4].replace('−', '-'), String(s.points.target.gap));
    const sum = await row(page, 'h-sum', s.label), c = comparison(want).find(x => x.strategy === s.label);
    assert.deepEqual(sum.slice(1, 7), [String(c.total), c.targetGap > 0 ? `+${c.targetGap}` : c.targetGap < 0 ? `−${-c.targetGap}` : '0', fmt(c.cost24), fmt(c.seasonCash), fmt(c.stayClosing), fmt(c.downClosing)], `${s.id} summary`);
    const cash = await row(page, 'h-cash', s.label);
    assert.deepEqual(cash.slice(1), [s.cash.seasonCost, s.cash.cost24, s.cash.seasonCash, s.cash.stayClosing, s.cash.downClosing, s.cash.stayMinimum, s.cash.downMinimum].map(fmt), s.id);
  }
  await page.screenshot({path: join(out, 'lab_2_desktop_full.png'), fullPage: true});
});

await t('3 · editing a strategy updates only that strategy; values equal the engine run on the same inputs', async () => {
  const before = await row(page, 'h-cash', 'A · Status quo');
  await fill(page, 'B.transferFee', 3000000); await page.selectOption('[data-k="B.instalments"]', '2'); await fill(page, 'B.monthlyWage', 150000); await fill(page, 'B.gain', 35);
  const inp = defaults(); Object.assign(inp.B, {transferFee: 3_000_000, instalments: 2, monthlyWage: 150_000, gain: 35});
  const s = evaluate(inp).strategies.find(x => x.id === 'B');
  assert.equal((await row(page, 'h-cash', 'B · Offensive'))[2], fmt(s.cash.cost24)); assert.equal((await row(page, 'h-pts', 'B · Offensive'))[3], String(s.points.total));
  assert.deepEqual(await row(page, 'h-cash', 'A · Status quo'), before, 'status quo unchanged');
  assert.match(await page.innerText('section:has(#h-trade)'), /per extra hypothetical point versus A/);
});

await t('4 · objective, current points and thresholds drive the pace and the gaps; relegated view switches the chart', async () => {
  await fill(page, 'sport.target', 42); await fill(page, 'sport.points', 6);
  const pace = await page.innerText('#pace'); assert.match(pace, /36\s+to reach your objective of 42/); assert.match(pace, /1\.44 pts \/ match/); assert.match(pace, /arithmetic only, not a prediction/);
  assert.equal((await row(page, 'h-sum', 'A · Status quo'))[2], '−8');
  await page.click('details.more summary'); await fill(page, 'sport.thresholds.0', 36);
  assert.match(await page.innerText('section:has(#h-pts) thead'), /Gap to 36/);
  assert.equal((await row(page, 'h-pts', 'A · Status quo'))[3], '34'); assert.equal((await row(page, 'h-pts', 'A · Status quo'))[5], '−2');
  await fill(page, 'sport.target', 120); assert.match(await page.innerText('[role=alert]'), /Season-end objective/); await fill(page, 'sport.target', 42);
  await page.click('button[data-view="down"]'); assert.equal(await page.getAttribute('button[data-view="down"]', 'aria-pressed'), 'true');
  assert.match(await page.locator('section:has(#h-cash) svg').getAttribute('aria-label'), /relegated/);
  await page.screenshot({path: join(out, 'lab_3_desktop_results_relegated.png'), fullPage: true});
});

await t('5 · invalid input is explained, never calculated; reset restores the defaults', async () => {
  await fill(page, 'finance.openingCash', ''); assert.match(await page.innerText('[role=alert]'), /openingCash/);
  await fill(page, 'A.gain', 200); assert.match(await page.innerText('[role=alert]'), /points gained/);
  assert.equal(await page.locator('section:has(#h-cash)').count(), 0);
  await page.locator('[data-k="finance.openingCash"]').fill('9000000'); await page.locator('[data-k="A.gain"]').fill('28'); await page.locator('[data-k="A.gain"]').press('Tab');
  await page.click('button[data-reset]'); assert.equal(await page.locator('[role=alert]').count(), 0); assert.equal(await page.inputValue('[data-k="B.transferFee"]'), '1200000');
});

await t('6a · presentation exports: HTML summary and CSV downloaded, with notices and the figures shown on screen', async () => {
  const want = comparison(evaluate(defaults()));
  const get = async kind => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(`button[data-export="${kind}"]`)]); const f = join(out, d.suggestedFilename()); await d.saveAs(f); return readFileSync(f, 'utf8'); };
  const html = await get('html'), csv = await get('csv');
  for (const txt of [html, csv]) { assert.match(txt, /not affiliated with Málaga CF/); assert.match(txt, /fictional/i); assert.match(txt, /No survival probability/); assert.match(txt, /not the real survival threshold/); }
  assert.match(html, /<h1>Málaga CF — The Cost of Survival<\/h1>/); assert.doesNotMatch(html, /<script|<link|src="http/);
  for (const c of want) { assert.ok(html.includes(fmt(c.cost24)) && html.includes(fmt(c.downClosing)), c.strategy); assert.ok(csv.includes(`"${c.strategy}",${c.gain},`), c.strategy); }
  assert.match(html, /35 points needed, 1\.40 per match/);
});

await t('6 · printable report: print media hides inputs and navigation, keeps results, notices and sources; PDF generated', async () => {
  await page.emulateMedia({media: 'print'});
  assert.equal(await page.locator('.top').isVisible(), false); assert.equal(await page.locator('.inputs').first().isVisible(), false);
  assert.ok(await page.locator('#h-trade').isVisible() && await page.locator('#sources').isVisible() && await page.locator('.banner').isVisible());
  await page.pdf({path: join(out, 'decision-lab-report.pdf'), format: 'A4', printBackground: true}); assert.equal(readFileSync(join(out, 'decision-lab-report.pdf')).subarray(0, 5).toString(), '%PDF-');
  await page.emulateMedia({media: 'screen'});
});

await t('7 · contact path: the private demo request leads to /demo.html', async () => {
  const link = page.locator('header a[data-cta="decision-lab-request"]'); assert.equal(await link.getAttribute('href'), '/demo.html');
  await link.click(); await page.waitForURL(/\/demo\.html$/); assert.match(await page.locator('a.btn-primary').first().getAttribute('href'), /^mailto:kevin@lake-am\.com/);
});

await t('8 · phone (iPhone 13): no horizontal overflow, inputs usable, results shown', async () => {
  const {page: ph, ctx} = await open({...devices['iPhone 13']});
  const overflow = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await overflow() <= 1, `${await overflow()}px`);
  assert.match(await ph.innerText('#pace'), /1\.40 pts \/ match/);
  await fill(ph, 'sport.target', 38); assert.match(await ph.innerText('#pace'), /33\s+to reach your objective of 38/);
  await fill(ph, 'C.gain', 34); assert.equal((await row(ph, 'h-pts', 'C · Defensive'))[3], '39'); assert.equal((await row(ph, 'h-sum', 'C · Defensive'))[2], '+1');
  const [d] = await Promise.all([ph.waitForEvent('download'), ph.click('button[data-export="html"]')]); assert.match(d.suggestedFilename(), /summary\.html$/);
  await ph.click('button[data-view="down"]'); assert.ok(await overflow() <= 1, `${await overflow()}px after toggle`);
  await ph.screenshot({path: join(out, 'lab_phone_top.png')}); await ph.screenshot({path: join(out, 'lab_phone_full.png'), fullPage: true});
  await ph.locator('#h-cash').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'lab_phone_cash.png')});
  await ctx.close();
});
await t('9 · no page error, and no request to any other site from the lab', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await browser.close(); server.close();
writeFileSync(join(out, 'decision-lab-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
