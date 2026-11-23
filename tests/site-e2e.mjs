/**
 * LANOVA Sports V3 public site in Chromium (desktop 1440×900 and iPhone 13), served as static files. The integrated
 * experience: navigation between every page, the live Resource Advantage Map on the home page (same engine as the
 * Advantage Lab), every demonstration entry point on the demo page, availability and prices, keyboard, phone menu,
 * console errors and network requests. External fonts and the app health check are blocked (offline visitor).
 * Usage (repo root): node tests/site-e2e.mjs [out dir=outputs/site]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {evaluate} from '../lanova/advantage/lab.js';
import {EXAMPLES} from '../lanova/advantage/examples.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/site'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const PAGES = ['/', '/platform.html', '/financial-intelligence.html', '/how-it-works.html', '/demo.html', '/pricing.html', '/founder.html', '/legal.html', '/login.html'];
const checks = [], errors = [], requests = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function context(opts) {
  const ctx = await browser.newContext({...opts, reducedMotion: 'reduce'});
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  ctx.on('request', r => requests.push(r.url()));
  return ctx;
}
const watch = (page, label) => { page.on('pageerror', e => errors.push(`${label}: ${e.message}`)); page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`${label}: ${m.text()}`); }); };
const desk = await context({viewport: {width: 1440, height: 900}});

await t('1 · every page: one h1, main landmark, skip link, the V3 navigation, images with alt text that load', async () => {
  for (const p of PAGES) {
    const page = await desk.newPage(); watch(page, p); await page.goto(BASE + p, {waitUntil: 'load'});
    assert.equal(await page.locator('h1').count(), 1, `${p}: one h1`); assert.equal(await page.locator('main#main').count(), 1, `${p}: main`);
    assert.equal(await page.locator('a.skip[href="#main"]').count(), 1, `${p}: skip link`);
    assert.deepEqual(await page.locator('#nav a').allInnerTexts(), ['Platform', 'Advantage Lab', 'Financial Intelligence', 'How It Works', 'Pricing', 'Request a Demo', 'Login'], `${p}: navigation`);
    await page.evaluate(() => Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }); })));
    for (const i of await page.$$eval('main img', is => is.map(x => ({src: x.getAttribute('src'), w: x.naturalWidth, alt: x.alt})))) { assert.ok(i.w > 0, `${p}: image loads ${i.src}`); assert.ok(i.alt.length > 10, `${p}: alt ${i.src}`); }
    const unnamed = await page.$$eval('a, button', els => els.filter(e => !(e.textContent || e.getAttribute('aria-label') || '').trim()).map(e => e.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, [], `${p}: links and buttons have a name`);
    await page.close();
  }
});

await t('2 · navigation: every menu item leads to a working page or tool, and back home', async () => {
  const page = await desk.newPage(); watch(page, 'nav');
  for (const [label, url, sel] of [['Platform', /platform\.html$/, 'h1'], ['Advantage Lab', /lanova\/advantage\/$/, '[data-start="blank"]'], ['Financial Intelligence', /financial-intelligence\.html$/, 'h1'], ['How It Works', /how-it-works\.html$/, 'h1'], ['Pricing', /pricing\.html$/, 'h1'], ['Request a Demo', /demo\.html$/, '#demonstrations']]) {
    await page.goto(BASE + '/'); await page.locator('#nav a', {hasText: label}).first().click(); await page.waitForURL(url); await page.waitForSelector(sel);
  }
  await page.locator('.brand').first().click(); await page.waitForURL(/index\.html$/); assert.match(await page.innerText('h1'), /Compete smarter/);
  await page.close();
});

await t('3 · home: the first screen says what LANOVA is, for every sport, with a live map equal to the engine', async () => {
  const page = await desk.newPage(); watch(page, 'home'); await page.goto(BASE + '/'); await page.waitForSelector('#home-map svg.map');
  const hero = await page.locator('.hero-grid > div').first().innerText(); // the text column (the map shows budgets, not prices)
  assert.match(hero, /SPORTS DECISION INTELLIGENCE/i); assert.match(hero, /Compete smarter\. Not just bigger\./); assert.doesNotMatch(hero, /€|recruitment|scouting/i);
  const want = evaluate({...EXAMPLES.semipro.make(), objective: 'development'});
  assert.equal(await page.innerText('#hm-feasible'), `${want.options.filter(o => o.feasible).length} of ${want.options.length}`);
  assert.equal(await page.locator('#home-map .pt').count(), want.options.length);
  await page.screenshot({path: join(out, 'v3_home_first_screen_desktop.png')});
  // Change the budget: fewer options become feasible, exactly as the engine says.
  await page.locator('#hm-budget').fill('20000'); await page.waitForTimeout(150);
  const m = {...EXAMPLES.semipro.make(), objective: 'development'}; m.finance.decisionBudget = 20000; const w2 = evaluate(m);
  assert.equal(await page.innerText('#hm-feasible'), `${w2.options.filter(o => o.feasible).length} of ${w2.options.length}`);
  assert.equal(await page.locator('#home-map .pt.infeasible').count(), w2.options.filter(o => o.status === 'infeasible').length);
  // Another sport.
  await page.click('#home-map button[data-ex="pro"]'); await page.waitForTimeout(100);
  assert.equal(await page.locator('#home-map .pt').count(), EXAMPLES.pro.make().options.length);
  await page.click('#hm-open'); await page.waitForURL(/lanova\/advantage\/\?example=pro$/); await page.waitForSelector('svg.map');
  assert.match(await page.innerText('main'), /Illustrative professional ice hockey organisation/);
  const sports = await page.goto(BASE + '/').then(() => page.locator('ul.sports li b').allInnerTexts());
  assert.equal(sports.length, 10); assert.ok(sports.includes('Football') && sports.includes('Multi-sport organisations'));
  await page.screenshot({path: join(out, 'v3_home_full_desktop.png'), fullPage: true});
  await page.close();
});

await t('4 · demo page: every entry point opens a working tool; neutral starts open nothing by themselves', async () => {
  const page = await desk.newPage(); watch(page, 'demo');
  const cases = [['advantage-blank', /advantage\/\?start=blank$/, async () => { await page.waitForSelector('#map [role=alert]'); assert.match(await page.innerText('main'), /Your own workspace/); }],
    ['advantage', /advantage\/$/, async () => { await page.waitForSelector('[data-example]'); assert.equal(await page.locator('svg.map').count(), 0, 'no example loaded by itself'); }],
    ['finance', /finance\/$/, async () => { await page.waitForSelector('.path'); assert.equal(await page.locator('.tabs').count(), 0); }],
    ['finance-forecast', /path=forecast$/, () => page.waitForSelector('.tabs')], ['finance-scenarios', /path=scenarios$/, () => page.waitForSelector('.tabs')],
    ['finance-cash', /path=cash$/, () => page.waitForSelector('.kpis')], ['finance-report', /path=report$/, () => page.waitForSelector('.tabs')],
    ['advantage-brief', /example=amateur&section=brief$/, async () => { await page.waitForSelector('#brief h3'); assert.match(await page.innerText('#brief'), /Hard constraints/); }]];
  for (const [id, url, check] of cases) { await page.goto(BASE + '/demo.html'); await page.click(`a[data-demo="${id}"]`); await page.waitForURL(url); await check(); }
  await page.goto(BASE + '/demo.html'); await page.click('a:has-text("Explore the squad economics demo")'); await page.waitForURL(/lanova\/workspace\/$/);
  await page.close();
});

await t('5 · availability and prices: exact, and the same everywhere', async () => {
  const page = await desk.newPage(); watch(page, 'pricing');
  await page.goto(BASE + '/pricing.html'); const p = await page.innerText('main');
  assert.match(p, /€990/); assert.match(p, /per month per organisation, excl\. VAT/); assert.match(p, /Not included: LANOVA Finance/); assert.match(p, /free public prototype/i);
  await page.goto(BASE + '/'); const avail = await page.innerText('table.avail');
  assert.match(avail, /Squad Economics[\s\S]*Available[\s\S]*€990 per month per organisation, excluding VAT/i); assert.match(avail, /LANOVA Finance[\s\S]*Pilot[\s\S]*Not included in Organisation Access/i); assert.match(avail, /Advantage Lab[\s\S]*Prototype/i);
  for (const f of ['/platform.html', '/financial-intelligence.html', '/how-it-works.html', '/demo.html', '/pricing.html']) { await page.goto(BASE + f); await page.screenshot({path: join(out, `v3${f.replace('.html', '').replace('/', '_')}_desktop.png`), fullPage: true}); }
  await page.close();
});

await t('6 · keyboard: skip link first; map points and example tabs are reachable and named', async () => {
  const page = await desk.newPage(); await page.goto(BASE + '/'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');
  await page.keyboard.press('Enter'); assert.match(page.url(), /#main$/);
  await page.locator('#home-map button[data-ex="amateur"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  assert.equal(await page.getAttribute('#home-map button[data-ex="amateur"]', 'aria-pressed'), 'true');
  const pt = page.locator('#home-map .pt').first(); await pt.focus(); assert.match(await pt.getAttribute('aria-label'), /^Option \d+, .+Total cost/);
  await page.close();
});

await t('7 · phone (iPhone 13): no horizontal overflow on any page or tool; the menu opens and navigates', async () => {
  const ctx = await context({...devices['iPhone 13']}), page = await ctx.newPage(); watch(page, 'phone');
  for (const p of [...PAGES, '/lanova/advantage/', '/lanova/advantage/?example=semipro', '/lanova/finance/', '/lanova/finance/?path=report']) {
    await page.goto(BASE + p, {waitUntil: 'load'}); await page.waitForTimeout(150);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(o <= 1, `${p}: ${o}px`);
  }
  await page.goto(BASE + '/'); await page.waitForSelector('#home-map svg.map');
  await page.screenshot({path: join(out, 'v3_home_first_screen_phone.png')}); await page.screenshot({path: join(out, 'v3_home_full_phone.png'), fullPage: true});
  const btn = page.locator('.menu-btn'); await btn.click(); assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  await page.locator('#nav a', {hasText: 'Advantage Lab'}).click(); await page.waitForURL(/lanova\/advantage\/$/);
  for (const p of ['/platform.html', '/demo.html', '/pricing.html']) { await page.goto(BASE + p); await page.screenshot({path: join(out, `v3${p.replace('.html', '').replace('/', '_')}_phone.png`), fullPage: true}); }
  await ctx.close();
});

await t('8 · no page error; only this site and the font host are requested; no data leaves the page', async () => {
  assert.deepEqual(errors, []);
  const other = [...new Set(requests.map(u => new URL(u).host))].filter(h => !h.startsWith('127.0.0.1') && !['fonts.googleapis.com', 'fonts.gstatic.com', 'lake-intelligence-production.up.railway.app'].includes(h) && h !== '');
  assert.deepEqual(other, []);
  assert.ok(requests.every(u => !/railway\.app/.test(u) || /\/healthz$/.test(u)), 'the app server is only asked for its public health status');
});
await browser.close(); server.close();
writeFileSync(join(out, 'site-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
