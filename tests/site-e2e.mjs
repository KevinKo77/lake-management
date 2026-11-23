/**
 * Public site after the strategic repositioning, in Chromium (desktop 1440×900 and iPhone 13), served as static files
 * like GitHub Pages. Checks the commercial path (home → platform → how it works → demonstrations → access & pricing),
 * the navigation and the phone menu, the demonstrations' entry points, images, basic accessibility, horizontal
 * overflow and page errors. External fonts and the app health check are blocked (as an offline visitor would see).
 * Usage (repo root): node tests/site-e2e.mjs [out dir=outputs/site]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';

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
const PAGES = ['/', '/platform.html', '/how-it-works.html', '/demo.html', '/pricing.html', '/founder.html', '/legal.html', '/login.html'];
const checks = [], errors = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function context(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  return ctx;
}
const reveal = page => page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in', 'visible', 'shown', 'is-visible')));
const desk = await context({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});

await t('1 · every public page: one h1, main landmark, skip link, images loaded with alt text, no page error', async () => {
  for (const p of PAGES) {
    const page = await desk.newPage(); page.on('pageerror', e => errors.push(`${p}: ${e.message}`));
    await page.goto(BASE + p, {waitUntil: 'load'});
    assert.equal(await page.locator('h1').count(), 1, `${p}: one h1`);
    assert.equal(await page.locator('main#main').count(), 1, `${p}: main`);
    assert.equal(await page.locator('a.skip[href="#main"]').count(), 1, `${p}: skip link`);
    const imgs = await page.$$eval('main img', is => is.map(i => ({src: i.getAttribute('src'), alt: i.alt, w: i.naturalWidth, lazy: i.loading})));
    for (const i of imgs) { assert.ok(i.alt.length > 10, `${p}: alt ${i.src}`); }
    await page.evaluate(() => Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }); })));
    for (const i of await page.$$eval('main img', is => is.map(x => ({src: x.getAttribute('src'), w: x.naturalWidth})))) assert.ok(i.w > 0, `${p}: image loads ${i.src}`);
    const unnamed = await page.$$eval('a, button', els => els.filter(e => !(e.textContent || e.getAttribute('aria-label') || '').trim()).map(e => e.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, [], `${p}: links and buttons have a name`);
    await page.close();
  }
});

await t('2 · commercial path: home leads to the demonstrations and the demo request; finance first, price not in the first screen', async () => {
  const page = await desk.newPage(); await page.goto(BASE + '/');
  const hero = await page.locator('main section').first().innerText();
  assert.match(hero, /Financial intelligence for sports institutions/); assert.doesNotMatch(hero, /€|recruitment|transfer/i);
  assert.equal(await page.locator('main section').first().locator('a.btn-primary').getAttribute('href'), '/demo.html');
  await reveal(page); await page.screenshot({path: join(out, 'site_home_desktop.png'), fullPage: true});
  await page.click('main section >> nth=0 >> a:has-text("Explore the demonstrations")'); await page.waitForSelector('.path');
  assert.equal(await page.locator('.path').count(), 4); assert.equal(await page.locator('.tabs').count(), 0, 'demonstration opens on the neutral landing');
  await page.goto(BASE + '/demo.html');
  for (const [p, tab] of [['forecast', 'Assumptions'], ['scenarios', 'Scenarios'], ['cash', 'Cash & forecast'], ['report', 'Decisions']]) {
    await page.goto(BASE + '/demo.html'); await page.click(`a[href="/lanova/finance/?path=${p}"]`); await page.waitForSelector('.tabs');
    assert.match(await page.locator('.tabs button[aria-pressed="true"]').innerText(), new RegExp(tab.replace('&', '&')), p);
  }
  await page.goto(BASE + '/demo.html'); await page.click('a:has-text("Explore the squad economics demo")'); await page.waitForURL(/\/lanova\/workspace\/$/);
  assert.match(await page.innerText('body'), /Recruitment Workspace/);
  await page.close();
});

await t('3 · availability and terms: pricing states what Organisation Access includes and that LANOVA Finance is not included', async () => {
  const page = await desk.newPage(); await page.goto(BASE + '/pricing.html'); await reveal(page);
  const text = await page.innerText('main');
  assert.match(text, /€990/); assert.match(text, /Squad Economics — recruitment economics for football/); assert.match(text, /Not included: LANOVA Finance/);
  assert.match(text, /does not give access to it/);
  await page.screenshot({path: join(out, 'site_pricing_desktop.png'), fullPage: true});
  for (const p of ['/platform.html', '/how-it-works.html', '/demo.html']) { await page.goto(BASE + p); await reveal(page); await page.screenshot({path: join(out, `site_${p.slice(1).replace('.html', '')}_desktop.png`), fullPage: true}); }
  await page.close();
});

await t('4 · phone (iPhone 13): no horizontal overflow on any page; the menu opens and reaches every section', async () => {
  const ctx = await context({...devices['iPhone 13'], reducedMotion: 'reduce'}), page = await ctx.newPage();
  for (const p of [...PAGES, '/lanova/finance/', '/lanova/finance/?path=report']) {
    await page.goto(BASE + p, {waitUntil: 'load'}); if (p.includes('finance')) await page.waitForSelector('.path, .tabs');
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(o <= 1, `${p}: ${o}px`);
  }
  await page.goto(BASE + '/'); const btn = page.locator('.menu-btn'); await btn.click();
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  for (const l of ['Platform', 'How It Works', 'Pricing', 'Request a Demo']) assert.ok(await page.locator('#nav a', {hasText: l}).first().isVisible(), l);
  await page.locator('#nav a', {hasText: 'Platform'}).click(); await page.waitForURL(/platform\.html$/);
  for (const p of ['/', '/platform.html', '/demo.html', '/pricing.html']) { await page.goto(BASE + p); await reveal(page); await page.screenshot({path: join(out, `site_${p === '/' ? 'home' : p.slice(1).replace('.html', '')}_phone.png`), fullPage: true}); }
  await ctx.close();
});

await t('5 · keyboard: the skip link is the first focusable element and moves focus to the content', async () => {
  const page = await desk.newPage(); await page.goto(BASE + '/'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#main');
  await page.keyboard.press('Enter'); assert.match(page.url(), /#main$/); await page.close();
});

await t('6 · no page error on any page', async () => { assert.deepEqual(errors, []); });
await browser.close(); server.close();
writeFileSync(join(out, 'site-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
