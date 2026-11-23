/**
 * Phone validation (iPhone 13 emulation: 390×844 viewport, touch, mobile user agent) of the public site and the
 * Advantage Lab, driven by taps. Mobile navigation, the home Resource Advantage Map, rugby, basketball and
 * multi-sport paths, recalculation, financial warnings, horizontal overflow, links, exports and page errors.
 * Every figure checked is compared with a direct run of the engine.
 * Usage (repo root): node tests/mobile-e2e.mjs [out dir=outputs/mobile]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {evaluate, fmt, financialNotice, FINANCIAL_INCOMPLETE} from '../lanova/advantage/lab.js';
import {EXAMPLES} from '../lanova/advantage/examples.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/mobile'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml'};
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
const phone = devices['iPhone 13'];
const ctx = await browser.newContext({...phone, acceptDownloads: true, reducedMotion: 'reduce'});
await ctx.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort()); // external fonts and the app health check: not needed offline
ctx.on('request', r => requests.push(r.url()));
const page = await ctx.newPage(); page.setDefaultTimeout(10000);
page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`${page.url()}: ${m.text()}`); });
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const noOverflow = async where => { const o = await overflow(); assert.ok(o <= 1, `${where}: ${o}px of horizontal overflow`); };
const shot = (name, full = false) => page.screenshot({path: join(out, `mobile_${name}.png`), fullPage: full});
const type = async (bind, v) => { const i = page.locator(`[data-bind="${bind}"]`); await i.tap(); await i.fill(String(v)); await i.dispatchEvent('input'); await page.waitForTimeout(220); };
const semi = () => ({...EXAMPLES.semipro.make(), objective: 'development'});

await t('1 · device: iPhone 13 emulation with touch and a phone-sized viewport', async () => {
  await page.goto(BASE + '/');
  const d = await page.evaluate(() => ({w: innerWidth, h: innerHeight, touch: navigator.maxTouchPoints > 0 && 'ontouchstart' in window, coarse: matchMedia('(pointer: coarse)').matches, ua: navigator.userAgent}));
  assert.equal(d.w, 390); assert.ok(d.h > 600 && d.h < 900, `${d.h}`); assert.ok(d.touch, 'touch events'); assert.ok(d.coarse, 'coarse pointer'); assert.match(d.ua, /iPhone/);
});

await t('2 · mobile navigation: the menu opens by tap and every item leads to its page; no overflow on any page', async () => {
  const items = [['Platform', /platform\.html$/], ['Advantage Lab', /lanova\/advantage\/$/], ['Financial Intelligence', /financial-intelligence\.html$/], ['How It Works', /how-it-works\.html$/], ['Pricing', /pricing\.html$/], ['Request a Demo', /demo\.html$/], ['Login', /login\.html$/]];
  for (const [label, url] of items) {
    await page.goto(BASE + '/'); const btn = page.locator('.menu-btn');
    assert.ok(await btn.isVisible(), 'menu button shown on a phone'); assert.equal(await page.locator('#nav').isVisible() && await page.locator('#nav a').first().isVisible(), false, 'menu closed at first');
    await btn.tap(); assert.equal(await btn.getAttribute('aria-expanded'), 'true');
    if (label === 'Platform') await shot('menu_open');
    await page.locator('#nav a', {hasText: new RegExp(`^${label}$`)}).tap(); await page.waitForURL(url);
  }
  for (const p of PAGES) { await page.goto(BASE + p, {waitUntil: 'load'}); await page.waitForTimeout(120); await noOverflow(p); }
  for (const p of ['/platform.html', '/demo.html', '/pricing.html']) { await page.goto(BASE + p); await shot(p.slice(1, -5), true); }
});

await t('3 · home Resource Advantage Map by touch: three sports, budget slider, warnings, open the full analysis', async () => {
  await page.goto(BASE + '/'); await page.waitForSelector('#home-map svg.map'); await page.locator('#home-map').scrollIntoViewIfNeeded();
  const want = evaluate(semi());
  assert.equal(await page.locator('#home-map svg.map').getAttribute('viewBox'), '0 0 560 620', 'narrow map layout');
  assert.equal(await page.locator('#home-map .pt').count(), want.options.length);
  assert.ok((await page.innerText('#hm-fin')).startsWith(`${FINANCIAL_INCOMPLETE}: the gain of ${want.strategies.development.financial.optionsWithUnknownGain.map(x => x.name).join(', ')}`), 'basketball: warning');
  await page.locator('#home-map').screenshot({path: join(out, 'mobile_home_map_basketball.png')});
  // Drag the slider thumb to the left with a real touch sequence (touchstart, touchmove, touchend): the budget falls
  // and the readout follows the engine. (A tap on the track does not move a range input on a phone.)
  await page.locator('#hm-budget').scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  const box = await page.locator('#hm-budget').boundingBox(), y = box.y + box.height / 2;
  const cdp = await ctx.newCDPSession(page), touch = (type, x) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
  const x0 = box.x + box.width / 2; await touch('touchStart', x0);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 - (box.width * 0.4) * i / 8); await page.waitForTimeout(30); }
  await touch('touchEnd'); await page.waitForTimeout(250);
  const budget = Number(await page.locator('#hm-budget').inputValue()); assert.ok(budget < 300_000, `budget after tap: ${budget}`);
  const m = semi(); m.finance.decisionBudget = budget; const w2 = evaluate(m);
  assert.equal(await page.innerText('#hm-feasible'), `${w2.options.filter(o => o.feasible).length} of ${w2.options.length}`);
  assert.equal(await page.locator('#home-map .pt.infeasible').count(), w2.options.filter(o => o.status === 'infeasible').length);
  assert.equal(await page.innerText('#hm-out'), `€${fmt(budget)}`);
  await page.locator('#home-map').screenshot({path: join(out, 'mobile_home_map_budget.png')});
  await page.locator('#home-map button[data-ex="amateur"]').tap(); await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('#home-map button[data-ex="amateur"]', 'aria-pressed'), 'true');
  assert.equal(await page.innerText('#hm-fin'), '', 'rugby: complete data, no warning');
  assert.equal(await page.locator('#home-map .pt').count(), EXAMPLES.amateur.make().options.length);
  await page.locator('#home-map').screenshot({path: join(out, 'mobile_home_map_rugby.png')});
  await page.locator('#home-map button[data-ex="pro"]').tap(); await page.waitForTimeout(150);
  assert.match(await page.innerText('#hm-fin'), /^Financial comparison incomplete: the gain of Data and decision-support department/);
  await noOverflow('home map');
  await page.locator('#hm-open').tap(); await page.waitForURL(/lanova\/advantage\/\?example=pro$/); await page.waitForSelector('svg.map');
  assert.match(await page.innerText('main'), /Illustrative professional ice hockey organisation/);
});

await t('4 · rugby path (Advantage Lab, tap to load): engine figures, no financial warning, no overflow', async () => {
  await page.goto(BASE + '/lanova/advantage/'); await page.locator('[data-example="amateur"]').tap(); await page.waitForSelector('svg.map');
  const want = evaluate(EXAMPLES.amateur.make());
  assert.equal(await page.locator('svg.map .pt').count(), want.options.length);
  assert.equal(await page.locator('#map-fin-notice').count(), 0); assert.equal(await page.locator('.sres.financial-incomplete').count(), 0);
  const strat = await page.innerText('#results'); for (const s of Object.values(want.strategies)) assert.ok(strat.includes(s.best.options[0] ?? 'Do nothing'));
  await noOverflow('rugby'); await page.locator('svg.map').scrollIntoViewIfNeeded(); await shot('lab_rugby_map');
});

await t('5 · basketball path: "Financial comparison incomplete" on the map notice, every strategy card and the brief, with the same options', async () => {
  await page.goto(BASE + '/lanova/advantage/'); await page.locator('[data-example="semipro"]').tap(); await page.waitForSelector('svg.map');
  const want = evaluate(EXAMPLES.semipro.make()), n = financialNotice(want);
  for (const id of ['#map-fin-notice', '#brief-fin-notice']) assert.equal(await page.innerText(id), `${FINANCIAL_INCOMPLETE}. ${n.text}`, id);
  assert.equal(await page.locator('.sres.financial-incomplete').count(), want.financial.strategiesAffected.length);
  for (const k of want.financial.strategiesAffected) for (const x of want.financial.optionsWithUnknownGain) assert.ok((await page.innerText(`[data-financial-incomplete="${k}"]`)).includes(x));
  await noOverflow('basketball');
  await page.locator('#map-fin-notice').scrollIntoViewIfNeeded(); await shot('lab_basketball_notice');
  await page.locator('.sres').first().scrollIntoViewIfNeeded(); await shot('lab_basketball_strategies');
});

await t('6 · exports on the phone (tap): HTML, JSON and CSV carry the same warning and options as the screen', async () => {
  const want = evaluate(EXAMPLES.semipro.make()), n = financialNotice(want);
  const get = async kind => { const b = page.locator(`[data-export="${kind}"]`); await b.scrollIntoViewIfNeeded(); const [d] = await Promise.all([page.waitForEvent('download'), b.tap()]); const f = join(out, `mobile_${d.suggestedFilename()}`); await d.saveAs(f); return readFileSync(f, 'utf8'); };
  const html = await get('html'), json = JSON.parse(await get('json')), csv = await get('csv');
  assert.equal(json.brief.financialComparison.warning, n.text); assert.deepEqual(json.brief.financialComparison.optionsWithUnknownGain, want.financial.optionsWithUnknownGain);
  assert.ok(html.includes('id="financial-notice"')); assert.ok(csv.split('\r\n')[1].startsWith('"WARNING — Financial comparison incomplete'));
  want.options.forEach((o, i) => { assert.equal(json.brief.options[i].totalCost, o.totals.totalCost); assert.ok(csv.includes(`"${o.name}","${o.status}"`)); assert.ok(html.includes(o.name)); });
  await page.locator('#h-brief').scrollIntoViewIfNeeded(); await shot('lab_brief');
});

await t('7 · multi-sport path from a neutral start: entered by touch, recalculated, unknown gain flagged, documented range clears it', async () => {
  await page.goto(BASE + '/lanova/advantage/?start=blank'); await page.waitForSelector('#map');
  assert.match(await page.innerText('#map [role=alert]'), /Cash available today/, 'nothing computed before the inputs');
  await type('label', 'My multi-sport organisation'); await type('sport', 'Multi-sport');
  await page.selectOption('[data-bind="structure"]', 'Multi-sport organisation');
  for (const [k, v] of [['finance.openingCash', 400000], ['finance.annualRevenue', 1200000], ['finance.annualOperatingCosts', 1150000], ['finance.minimumCash', 150000], ['finance.decisionBudget', 120000]]) await type(k, v);
  for (const [i, name, upfront, monthly, s, l] of [[0, 'Shared strength and conditioning staff', 20000, 4000, 6, 6], [1, 'Indoor hall booking system', 45000, 600, 3, 7]]) {
    await page.locator('[data-add]').tap(); await page.waitForTimeout(150);
    await type(`options.${i}.name`, name); await type(`options.${i}.upfront`, upfront); await type(`options.${i}.monthlyCost`, monthly);
    await page.selectOption(`[data-bind="options.${i}.shortTermScore"]`, String(s)); await page.selectOption(`[data-bind="options.${i}.longTermScore"]`, String(l)); await page.selectOption(`[data-bind="options.${i}.risk"]`, 'low'); await page.waitForTimeout(220);
  }
  // The first option has no financial gain (a known zero); the second's gain is not estimable (the default for a new option).
  await page.selectOption('[data-gain-kind="0"]', 'known'); await page.waitForTimeout(250);
  assert.equal(await page.locator('#map [role=alert]').count(), 0);
  assert.equal(await page.locator('svg.map .pt').count(), 2);
  assert.equal(await page.locator('.sres.financial-incomplete').count(), 3);
  assert.match(await page.innerText('#map-fin-notice'), /^Financial comparison incomplete\. .*the financial gain of Indoor hall booking system is not estimable/);
  await noOverflow('multi-sport'); await page.locator('#map-fin-notice').scrollIntoViewIfNeeded(); await shot('lab_multisport_incomplete');
  // Recalculation: raising the reserve makes options infeasible, as the engine says.
  await type('finance.minimumCash', 395000);
  assert.ok(await page.locator('svg.map .pt.infeasible').count() >= 1, 'a higher reserve rules options out');
  await type('finance.minimumCash', 150000); assert.equal(await page.locator('svg.map .pt.infeasible').count(), 0);
  // A documented range replaces "not estimable": the warning becomes the range notice.
  await page.selectOption('[data-gain-kind="1"]', 'range'); await page.waitForTimeout(250);
  await type('options.1.gainRange.low', 500); await type('options.1.gainRange.high', 2500); await type('options.1.gainRange.basis', 'Booking requests from two partner clubs');
  assert.equal(await page.locator('.sres.financial-incomplete').count(), 0); assert.match(await page.innerText('#map-fin-notice'), /cash uses the low end/);
  await noOverflow('multi-sport range'); await page.locator('#h-strat').scrollIntoViewIfNeeded(); await shot('lab_multisport_range');
});

await t('8 · ice hockey path: simulator recalculation by touch equals the engine (reserve and budget)', async () => {
  await page.goto(BASE + '/lanova/advantage/?example=pro'); await page.waitForSelector('svg.map');
  await type('finance.minimumCash', 2900000);
  const m = EXAMPLES.pro.make(); m.finance.minimumCash = 2_900_000; const want = evaluate(m);
  assert.equal(await page.locator('svg.map .pt.infeasible').count(), want.options.filter(o => o.status === 'infeasible').length);
  await type('finance.decisionBudget', 500000); m.finance.decisionBudget = 500_000; const w2 = evaluate(m);
  assert.equal(await page.locator('svg.map .pt.infeasible').count(), w2.options.filter(o => o.status === 'infeasible').length);
  await noOverflow('ice hockey');
});

await t('9 · demonstrations and links: every demo entry opens by tap; every internal link of the public pages answers', async () => {
  await page.goto(BASE + '/demo.html');
  const demos = await page.locator('a[data-demo]').evaluateAll(as => as.map(a => a.getAttribute('href')));
  assert.ok(demos.length >= 8);
  for (const href of demos) {
    await page.goto(BASE + '/demo.html'); const a = page.locator(`a[data-demo][href="${href}"]`).first(); await a.scrollIntoViewIfNeeded(); await a.tap();
    await page.waitForLoadState('load'); await page.waitForTimeout(300);
    assert.ok(page.url().includes(href.split('?')[0]), `${href} → ${page.url()}`); await noOverflow(href);
    if (href.includes('start=blank')) assert.equal(await page.locator('svg.map').count(), 0, 'neutral start computes nothing by itself');
  }
  const seen = new Set();
  for (const p of PAGES) {
    await page.goto(BASE + p);
    for (const href of await page.locator('a[href]').evaluateAll(as => as.map(a => a.href))) {
      const u = new URL(href); if (u.origin !== BASE || seen.has(u.pathname)) continue; seen.add(u.pathname);
      const r = await page.request.get(BASE + u.pathname); assert.equal(r.status(), 200, `${p}: ${u.pathname}`);
    }
  }
  assert.ok(seen.size >= 10, `${seen.size} internal links checked`);
});

await t('10 · no JavaScript error; no request to any other site', async () => {
  assert.deepEqual(errors, []);
  const other = [...new Set(requests.map(u => new URL(u).host))].filter(h => h && !h.startsWith('127.0.0.1') && !['fonts.googleapis.com', 'fonts.gstatic.com', 'lake-intelligence-production.up.railway.app'].includes(h));
  assert.deepEqual(other, []);
});

await browser.close(); server.close();
writeFileSync(join(out, 'mobile-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), device: 'iPhone 13 (Playwright emulation: 390×664 CSS px viewport, touch, mobile UA)', checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
