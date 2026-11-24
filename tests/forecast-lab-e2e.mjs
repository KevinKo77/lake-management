/**
 * Football Forecast Lab (/lanova/cases/forecast-lab/) in Chromium: desktop 1440×900, then iPhone 13 with touch.
 * The figures shown are compared with the validation report, and a live replay with the same calculation in Node.
 * Usage (repo root): node tests/forecast-lab-e2e.mjs [out dir=outputs/forecast-lab]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {replay} from '../lanova/cases/forecast.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/forecast-lab'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`, URL0 = `${BASE}/lanova/cases/forecast-lab/`;
const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), V = JSON.parse(readFileSync('lanova/cases/data/forecast-validation.json', 'utf8'));
const checks = [], errors = [], offsite = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function open(opts) {
  const c = await browser.newContext({...opts, reducedMotion: 'reduce'});
  await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  const page = await c.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com|lake-intelligence-production\.up\.railway\.app/.test(u)) offsite.push(u); });
  await page.goto(URL0); await page.waitForSelector('#run'); return {c, page};
}
const f3 = v => Number(v).toFixed(3);
const {page, c: desk} = await open({viewport: {width: 1440, height: 900}});

await t('1 · publication status: criteria as in the report; independent validation pending; current season blocked; no current-season figure', async () => {
  const st = await page.innerText('.status-grid');
  for (const x of Object.values(V.criteria)) assert.ok(st.includes(x.text), x.text);
  assert.equal(await page.locator('.crit.ok').count(), Object.values(V.criteria).filter(x => x.passed).length);
  assert.match(st, /Independent validation: pending/); assert.match(st, /Current season: blocked/);
  assert.match(await page.innerText('.case-hero'), /No probability for the current season is published/);
  assert.equal(await page.locator('#rs option', {hasText: '2026-27'}).count(), 0, 'current season not selectable');
  await page.screenshot({path: join(out, 'lab_top_desktop.png')});
});

await t('2 · match forecasts: hold-out scores and per-season figures equal the validation report', async () => {
  const text = await page.locator('.case-section').nth(1).innerText(), h = V.holdout;
  for (const k of ['logLoss', 'brier', 'rps']) for (const v of [h.model[k], h.baseRates[k], h.uniform[k]]) assert.ok(text.includes(f3(v)), `${k} ${f3(v)}`);
  for (const s of h.perSeason) assert.ok(text.includes(s.season) && text.includes(f3(s.model.logLoss)), s.season);
  assert.equal(await page.locator('.rels:not(.one) figure').count(), 3);
  assert.equal(await page.locator('.rels').first().locator('circle').count(), ['home', 'draw', 'away'].reduce((n, k) => n + h.calibration[k].bins.length, 0));
  await page.locator('.rels').first().scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_calibration_desktop.png')});
});

await t('3 · relegation: scores against both baselines equal the report; the small mid-range bins are flagged', async () => {
  const text = await page.locator('.case-section').nth(2).innerText(), r = V.relegation;
  for (const v of [r.all.model.brier, r.all.position.brier, r.all.uniform.brier, r.all.model.logLoss, r.holdout.model.brier, r.holdout.position.brier]) assert.ok(text.includes(f3(v)), f3(v));
  assert.match(text, /Read with care/); assert.match(text, /not yet used to publish a probability/);
});

await t('4 · live replay in the browser equals the same replay in Node (2018-19 after matchday 13, 4,000 simulations); actual outcome attached', async () => {
  await page.selectOption('#rs', '2018-19'); await page.selectOption('#rm', '13'); await page.selectOption('#rn', '4000');
  await page.click('#run'); await page.waitForSelector('#replay[data-season="2018-19"] table');
  const want = replay(D, '2018-19', 13, {...V.tuning.chosen, n: 4000, seed: V.seed});
  const rows = await page.locator('#replay tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  assert.equal(rows.length, 20);
  for (const [name, pts, exp, rel] of rows) {
    const id = Object.keys(want.names).find(k => want.names[k] === name), x = want.sim[id];
    assert.equal(Number(pts), x.currentPoints, name); assert.equal(exp, x.expectedPoints.toFixed(1), name); assert.equal(rel, `${Math.round(x.relegated * 100)}%`, name);
  }
  assert.equal(await page.locator('#replay tr.breach').count(), 3, 'three actually relegated teams highlighted');
  const w = await page.locator('#replay .bar').first().evaluate(b => [b.dataset.w, getComputedStyle(b).getPropertyValue('--w').trim()]); assert.equal(w[1], `${w[0]}%`, 'bar width applied');
  assert.match(await page.innerText('#replay'), new RegExp(`Cut-off: results before ${want.cutOff}`));
  await page.locator('#h-replay').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_replay_desktop.png'), fullPage: false});
});

await t('5 · calls to action and links: Málaga case, software page and every internal link answer 200; review is a pre-filled e-mail', async () => {
  const internal = await page.locator('a[href]').evaluateAll(as => as.map(a => a.href).filter(h => h.startsWith(location.origin)));
  for (const u of [...new Set(internal.map(h => h.split('#')[0]))]) assert.equal((await page.request.get(u)).status(), 200, u);
  const mail = new URL((await page.getAttribute('[data-cta="review"]', 'href')).replace(/&amp;/g, '&')); assert.equal(mail.pathname, 'kevin@lake-am.com');
  assert.ok(internal.some(h => h.endsWith('/lanova/cases/malaga-winter-2027/')));
});

await t('6 · phone (iPhone 13, touch): no horizontal overflow, replay runs by tap', async () => {
  const {page: ph, c} = await open({...devices['iPhone 13']});
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1, `${await over()}px`); await ph.screenshot({path: join(out, 'lab_top_phone.png')});
  await ph.selectOption('#rn', '1000'); await ph.locator('#run').tap(); await ph.waitForSelector('#replay table');
  assert.ok(await over() <= 1, `${await over()}px after replay`);
  await ph.locator('#replay').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'lab_replay_phone.png')});
  await ph.locator('.rels').first().scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'lab_calibration_phone.png')});
  await c.close();
});

await t('7 · no page error and no request to any other site (fonts and the site\'s own health check excepted)', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await desk.close(); await browser.close(); server.close();
writeFileSync(join(out, 'forecast-lab-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
