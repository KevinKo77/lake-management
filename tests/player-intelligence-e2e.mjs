/**
 * Player Intelligence V1 (/lanova/cases/player-intelligence/) in Chromium: desktop 1440×900, then iPhone 13 (touch).
 * Every figure shown is compared with demo-data/demo-facts.json (fictional data). Usage: node tests/player-intelligence-e2e.mjs [out dir]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/player-intelligence'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`, URL0 = `${BASE}/lanova/cases/player-intelligence/`;
const D = JSON.parse(readFileSync('lanova/cases/player-intelligence/demo-data/demo-facts.json', 'utf8')), row = k => D.players.find(p => p.key === k);
const checks = [], errors = [], offsite = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function open(opts, path = URL0) {
  const c = await browser.newContext({...opts, reducedMotion: 'reduce', acceptDownloads: true});
  await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  const page = await c.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:') && !/fonts\.(googleapis|gstatic)\.com|lake-intelligence-production\.up\.railway\.app/.test(u)) offsite.push(u); });
  await page.goto(path); await page.waitForSelector('.pi-results tbody tr[data-key]'); return {c, page};
}
const {page, c: desk} = await open({viewport: {width: 1440, height: 900}});
const keys = () => page.locator('.pi-results tbody tr[data-key]').evaluateAll(trs => trs.map(tr => tr.dataset.key));

await t('1 · demonstration banner, noindex, fictional data only; all 51 records listed', async () => {
  assert.match(await page.innerText('[data-demo-banner]'), /Demonstration data — fictional players and clubs/);
  assert.equal(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex, nofollow');
  assert.equal((await keys()).length, D.players.length); assert.match(await page.innerText('#pi'), /FICTIONAL/);
  await page.screenshot({path: join(out, 'pi_search_desktop.png')});
});

await t('2 · search by name, club, position (effectivePosition) and identity status', async () => {
  await page.fill('#q', 'escovar'); assert.deepEqual(await keys(), ['SYN-A10@demo-altamar']);
  await page.fill('#q', 'SYN-T01'); assert.deepEqual((await keys()).sort(), ['SYN-T01@demo-altamar', 'SYN-T01@demo-dunas']);
  await page.fill('#q', '');
  await page.selectOption('#club', 'demo-dunas'); assert.ok((await keys()).every(k => k.includes('demo-dunas')));
  await page.selectOption('#club', 'all'); await page.selectOption('#pos', 'FW');
  const fw = await keys(); assert.equal(fw.length, D.players.filter(p => p.effectivePosition === 'FW').length); assert.ok(fw.includes('SYN-A09@demo-altamar'));
  assert.match(await page.locator('tr[data-key="SYN-A09@demo-altamar"]').innerText(), /Forward\s*\(source: Midfielder\)/);
  await page.selectOption('#pos', 'all'); await page.selectOption('#status', 'UNRESOLVED');
  assert.deepEqual((await keys()).sort(), ['unresolved:demo-brisa-norte:kilian drumvel', 'unresolved:demo-dunas:luis prandel']);
  await page.selectOption('#status', 'AMBIGUOUS'); assert.deepEqual(await keys(), ['unresolved:demo-brisa-norte:marco belvane']);
  await page.selectOption('#status', 'all');
});

await t('3 · profile: observed and derived figures equal the dataset; unavailable list; evidence panel', async () => {
  await page.click('[data-open="SYN-A10@demo-altamar"]'); const r = row('SYN-A10@demo-altamar');
  assert.equal(await page.innerText('[data-f="appearances"]'), String(r.observed.appearances)); assert.equal(await page.innerText('[data-f="goals"]'), String(r.observed.goals));
  assert.equal(await page.innerText('[data-f="minutes"]'), String(r.derived.minutesEstimate.value));
  const prof = await page.innerText('#profile-panel'); assert.match(prof, /estimate, lower bound: added time ignored/); assert.match(prof, /do not describe current or future performance/);
  for (const u of D.unavailable) assert.ok((await page.innerText('[data-unavailable]')).includes(u), u);
  const ev = await page.innerText('[data-evidence]'); assert.match(ev, /RESOLVED \(high confidence\)/); assert.match(ev, /synthetic demo squad listing/); assert.match(ev, /SHA-256/);
  await page.locator('#profile-panel').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'pi_profile_desktop.png')});
});

await t('4 · unresolved and ambiguous identities are shown as such, with their reasons; never as a known player', async () => {
  await page.click('[data-open="unresolved:demo-dunas:luis prandel"]');
  const ev = await page.innerText('[data-evidence]'); assert.match(ev, /UNRESOLVED — name matches 2 player\(s\) with no documented affiliation/); assert.match(ev, /not used as evidence\): SYN-A05, SYN-C05/);
  assert.match(await page.innerText('#h-profile'), /Luis Prandel/); assert.match(await page.innerText('#profile-panel'), /unresolved/);
  await page.click('[data-open="unresolved:demo-brisa-norte:marco belvane"]'); assert.match(await page.innerText('[data-evidence]'), /Candidates not chosen: SYN-B07, SYN-B08/);
  await page.click('[data-open="unresolved:demo-brisa-norte:kilian drumvel"]'); assert.match(await page.innerText('[data-inconsistent]'), /listed as scorer .* but not in the home line-up/);
});

await t('5 · comparison: values equal the dataset, no overall score, per-90 withheld below 900 minutes, warnings', async () => {
  for (const k of ['SYN-A10@demo-altamar', 'SYN-T01@demo-dunas', 'unresolved:demo-dunas:luis prandel']) await page.check(`[data-select="${k}"]`);
  const tbl = page.locator('[data-compare]');
  const vals = id => page.locator(`[data-measure="${id}"] td.v`).allInnerTexts();
  assert.deepEqual(await vals('goals'), ['3', '1', '0']); assert.deepEqual(await vals('minutesEstimate'), [String(row('SYN-A10@demo-altamar').derived.minutesEstimate.value), '90', '80']);
  assert.deepEqual(await vals('goalsPer90'), ['not available', 'not available', 'not available']); assert.match(await tbl.innerText(), /below 900 estimated minutes/);
  const all = await page.innerText('#compare-panel'); assert.match(all, /No overall score, ranking or recommendation/); assert.doesNotMatch(all, /overall score:\s*\d/i);
  const w = await page.innerText('[data-warnings]'); assert.match(w, /identity unresolved/); assert.match(w, /Different clubs/);
  assert.match(page.url(), /compare=/);
  await page.locator('#compare-panel').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'pi_compare_desktop.png')});
});

await t('6 · exports: the HTML report carries provenance and disclaimers; the decision context leaves fees, wages and priority to the user', async () => {
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="report"]')]);
  const html = readFileSync(await d1.path(), 'utf8');
  assert.match(html, /DEMONSTRATION DATA — FICTIONAL/); assert.match(html, new RegExp(D.source.sha256)); assert.match(html, /not sporting, financial or investment advice/); assert.match(html, /Added time is ignored/);
  writeFileSync(join(out, 'pi_comparison_report.html'), html);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="context"]')]);
  const ctx = JSON.parse(readFileSync(await d2.path(), 'utf8'));
  assert.equal(ctx.contexts.length, 3); assert.ok(ctx.contexts.every(c => Object.values(c.userAssumptions).every(a => a.value === null)));
  assert.equal(ctx.contexts[2].identity.status, 'UNRESOLVED'); assert.ok(ctx.contexts.every(c => !('marketValue' in c.historical) && !('rating' in c.historical.observed)));
});

await t('7 · sources panel: rights decision BLOCKED, aggregate audit of the real file, minutes method', async () => {
  const s = await page.innerText('#sources'); assert.match(s, /Real LaLiga 2025\/26: withheld/); assert.match(s, /BLOCKED/); assert.match(s, /11,953 appearances/);
  assert.match(s, /Added time is ignored/); assert.match(s, /does not rate players, value them, predict their performance or recommend a signing/);
  assert.equal(await page.locator('a[href*="player-intelligence"]').count(), 0, 'no navigation link to the module from itself');
});

await t('8 · phone (iPhone 13, touch): no horizontal overflow; search, profile and comparison usable by tap', async () => {
  const {page: ph, c} = await open({...devices['iPhone 13']}, `${URL0}?compare=SYN-A10@demo-altamar,SYN-B10@demo-brisa-norte`);
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1, `${await over()}px`); await ph.screenshot({path: join(out, 'pi_search_phone.png')});
  await ph.locator('[data-open="SYN-A09@demo-altamar"]').tap(); assert.match(await ph.innerText('#h-profile'), /Hugo Tarvessa/);
  await ph.locator('#profile-panel').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'pi_profile_phone.png')});
  assert.deepEqual(await ph.locator('[data-measure="appearances"] td.v').allInnerTexts(), ['3', '3']); assert.ok(await over() <= 1);
  await ph.locator('#compare-panel').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'pi_compare_phone.png')});
  await c.close();
});

await t('10 · fail closed in the browser: only the approved fixture bytes are shown; a tampered dataset labelled "synthetic" is refused', async () => {
  const policy = JSON.parse(readFileSync('lanova/player-intelligence/publication-policy.json', 'utf8'));
  assert.equal(await page.getAttribute('[data-approved]', 'data-approved'), policy.approvals[0].outputSha256);
  const c = await browser.newContext({viewport: {width: 1440, height: 900}});
  await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  await c.route('**/demo-data/demo-facts.json', async route => { const res = await route.fetch(), d = await res.json(); d.synthetic = true; d.players[0].observed.goals = 99; await route.fulfill({response: res, json: d}); });
  const p = await c.newPage(); await p.goto(URL0); await p.waitForSelector('[data-refused]');
  assert.match(await p.innerText('[data-refused]'), /not an approved fictional fixture/); assert.equal(await p.locator('.pi-results').count(), 0);
  await c.close();
});

await t('9 · no page error and no request to any other site', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await desk.close(); await browser.close(); server.close();
writeFileSync(join(out, 'player-intelligence-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
