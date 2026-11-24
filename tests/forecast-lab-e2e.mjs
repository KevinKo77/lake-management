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
const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), V = JSON.parse(readFileSync('lanova/cases/data/forecast-validation-v2.json', 'utf8')), V1 = JSON.parse(readFileSync('lanova/cases/data/forecast-validation-v1.json', 'utf8'));
const CH = {...V.tuning.chosen, halfLife: V.tuning.chosen.halfLife === 'none' ? Infinity : V.tuning.chosen.halfLife};
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

await t('1 · validation status (v2): criteria as in the report; relegation advantage on unseen seasons flagged as not established; pending; current season blocked', async () => {
  const st = await page.innerText('.status-grid');
  for (const x of Object.values(V.criteria)) assert.ok(st.includes(x.text), x.text);
  const sig = V.relegation.holdout.ci95.brierGainVsPosition[0] > 0;
  assert.equal(await page.getAttribute('[data-holdout-significant]', 'data-holdout-significant'), String(sig));
  assert.match(st, sig ? /advantage confirmed/ : /advantage not established on unseen seasons[\s\S]*includes zero/);
  assert.match(st, /Independent validation: pending/); assert.match(st, /Current season: blocked/); assert.match(st, /61 results of 2026\/27/);
  assert.match(await page.innerText('.case-hero'), /No probability for the current season is published/);
  assert.equal(await page.locator('#rs option', {hasText: '2026-27'}).count(), 0, 'current season not selectable');
  await page.screenshot({path: join(out, 'lab_top_desktop.png')});
});

await t('2 · ranking correction: RFEF rules stated; 14/14 relegations as official (previous rule 12/14); 35/35 verified positions; the 2025/26 case and corrected labels', async () => {
  const text = await page.locator('#h-rules').evaluate(h => h.closest('section').innerText), rk = V.rankingSummary;
  assert.match(text, new RegExp(`${rk.relegationMatchesOfficial}/${rk.seasons}`)); assert.match(text, new RegExp(`previous rule: ${rk.previousRuleMatchesOfficial}/${rk.seasons}`)); assert.match(text, new RegExp(`${rk.positionsMatching}/${rk.positionsChecked}`));
  assert.match(text, /Osasuna, Levante UD and RCD Mallorca finished on 42 points/); assert.match(text, /RCD Mallorca 2025-26 \(relegated\); Levante UD 2025-26 \(stayed up\)/);
  assert.match(text, /never decided at random/);
  await page.locator('#h-rules').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_rules_desktop.png')});
});

await t('3 · Part 1 (match results) and Part 2 (relegation) shown separately; every figure equals the report, with intervals and the v1 figures', async () => {
  const p1 = await page.locator('#h-match').evaluate(h => h.closest('section').innerText), h = V.holdout;
  for (const v of [h.model.logLoss, h.baseRates.logLoss, h.uniform.logLoss, h.model.brier, h.ci95.logLoss[0], h.ci95.logLoss[1], h.ci95.logLossGainVsBaseRates[0], V1.holdout.model.logLoss]) assert.ok(p1.includes(Number(v).toFixed(3)), `part 1 ${v}`);
  for (const s of h.perSeason) assert.ok(p1.includes(s.season) && p1.includes(s.model.logLoss.toFixed(3)), s.season);
  const p2 = await page.locator('#h-rel').evaluate(x => x.closest('section').innerText), r = V.relegation;
  for (const v of [V1.relegation.all.model.brier, r.all.model.brier, r.all.position.brier, r.all.uniform.brier, V1.relegation.holdout.model.brier, r.holdout.model.brier, r.holdout.position.brier, ...r.all.ci95.modelBrier, ...r.holdout.ci95.brierGainVsPosition]) assert.ok(p2.includes(Number(v).toFixed(3)), `part 2 ${v}`);
  assert.match(p2, /that claim is withdrawn/);
  assert.equal(await page.locator('#h-rel').evaluate(x => x.closest('section').querySelectorAll('table.bands tbody tr').length), r.bands.filter(b => b.n).length);
  assert.equal(await page.locator('#h-rel').evaluate(x => x.closest('section').querySelectorAll('table.sens tbody tr').length), r.sensitivity.length);
  assert.ok(p2.includes('1460') && p2.includes('no decay'), 'sensitivity beyond 730 days');
  assert.equal(await page.locator('.rels:not(.one) figure').count(), 3);
  await page.locator('#h-rel').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_relegation_desktop.png')});
  await page.locator('table.bands').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_calibration_desktop.png')});
});

await t('4 · live replay (2025-26 after matchday 13) equals Node; actual relegations from the RFEF table (Mallorca on head-to-head, Levante safe)', async () => {
  await page.selectOption('#rs', '2025-26'); await page.selectOption('#rm', '13'); await page.selectOption('#rn', '4000');
  await page.click('#run'); await page.waitForSelector('#replay[data-season="2025-26"] table');
  const want = replay(D, '2025-26', 13, {...CH, n: 4000, seed: V.seed});
  const rows = await page.locator('#replay tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  assert.equal(rows.length, 20);
  for (const [name, pts, exp, rel] of rows) {
    const id = Object.keys(want.names).find(k => want.names[k] === name), x = want.sim[id];
    assert.equal(Number(pts), x.currentPoints, name); assert.equal(exp, x.expectedPoints.toFixed(1), name); assert.equal(rel, `${Math.round(x.relegated * 100)}%`, name);
  }
  assert.equal(await page.locator('#replay tr.breach').count(), 3);
  const mall = rows.find(r => r[0] === 'RCD Mallorca'), lev = rows.find(r => r[0] === 'Levante UD');
  assert.match(mall[4], /^18 · relegated · on head-to-head$/); assert.match(lev[4], /^16/); assert.doesNotMatch(lev[4], /relegated/);
  const w = await page.locator('#replay .bar').first().evaluate(b => [b.dataset.w, getComputedStyle(b).getPropertyValue('--w').trim()]); assert.equal(w[1], `${w[0]}%`);
  await page.locator('#h-replay').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'lab_replay_desktop.png')});
});

await t('4b · the exact missing 2026/27 observations are listed (61, by matchday) with the data-rights requirement', async () => {
  const sec = page.locator('#h-gap').locator('xpath=ancestor::section[1]'); const text = await sec.innerText();
  assert.match(text, /61 results missing/); assert.match(text, /matchday 8: 10, matchday 9: 10, matchday 10: 10, matchday 11: 10, matchday 12: 10, matchday 13: 10/); assert.match(text, /matchday 6: 1/);
  await sec.locator('summary').click(); assert.equal(await sec.locator('details tbody tr').count(), 61);
  assert.match(text, /terms allow this reuse/);
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
