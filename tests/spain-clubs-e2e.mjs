/**
 * Spanish clubs & squads explorer (/lanova/cases/spain-clubs/) in Chromium: desktop 1440×900, then iPhone 13 (touch).
 * Every row shown is compared with the versioned data files. Usage (repo root): node tests/spain-clubs-e2e.mjs [out dir]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/spain-clubs'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`, URL0 = `${BASE}/lanova/cases/spain-clubs/`;
const J = f => JSON.parse(readFileSync(`lanova/cases/spain-data/${f}`, 'utf8')), S = J('squads-2026-27.cc-by-sa.json'), C = J('clubs-2026-27.cc-by-sa.json'), COV = J('coverage-2026-27.json');
const checks = [], errors = [], offsite = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
async function open(opts, path = URL0) {
  const c = await browser.newContext({...opts, reducedMotion: 'reduce'});
  await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  const page = await c.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com|lake-intelligence-production\.up\.railway\.app/.test(u)) offsite.push(u); });
  await page.goto(path); await page.waitForSelector('table.squad tbody tr'); return {c, page};
}
const {page, c: desk} = await open({viewport: {width: 1440, height: 900}});
const rowsOf = () => page.locator('table.squad tbody tr').evaluateAll(trs => trs.map(tr => ({id: tr.dataset.player, q: tr.dataset.quality, cells: [...tr.cells].map(td => td.innerText.trim()), href: tr.querySelector('td:last-child a')?.href})));

await t('1 · opens on Málaga CF: dated listings are explicit, Wikidata check coverage is partial, no official-registration claim', async () => {
  assert.match(await page.innerText('#h-pick'), /Choose a club/); assert.match(await page.innerText('#explorer'), /Data as of 24 Nov 2026/);
  const want = S.players.filter(p => p.club === 'es-malaga-cf'), rows = await rowsOf();
  assert.equal(rows.length, want.length);
  for (const r of rows) { const p = want.find(x => x.id === r.id); assert.ok(p, r.id); assert.equal(r.href, p.source.url); assert.equal(r.q, p.quality); assert.equal(r.cells[0], String(p.shirtNumber ?? '—')); assert.ok(r.cells[1].startsWith(p.name)); }
  assert.match(await page.innerText('#club-panel'), /Q8857/); assert.match(await page.innerText('#explorer'), /333 \/ 1,028/); assert.match(await page.innerText('#club-panel'), /official registration not established/); assert.equal(await page.locator('img').count(), 0, 'no logo or photograph');
  const expected = {GK:2,DF:10,MF:9,FW:7}; for (const [k,n] of Object.entries(expected)) assert.equal(COV.clubs.find(c=>c.club==='es-malaga-cf').positionCounts.effective[k], n);
  await page.screenshot({path: join(out, 'spain_malaga_desktop.png')});
});

await t('2 · provenance: a player expands to show his id, Wikidata check, birth source and the reason for his status', async () => {
  await page.locator('table.squad tbody tr').first().locator('summary').click();
  const prov = await page.locator('table.squad tbody tr').first().locator('.prov').innerText();
  assert.match(prov, /Dated Wikipedia listing: listed in the squad section of a revision dated 2026-11-07/); assert.match(prov, /LANOVA player id Q38827144/); assert.match(prov, /Wikidata membership of this club: /); assert.match(prov, /Born: 1994-04-21/); assert.match(prov, /not proof of official registration/);
});

await t('3 · filters: position (goalkeepers) and status narrow the list to what the data say', async () => {
  await page.selectOption('#pos', 'GK'); const gk = await rowsOf(); assert.equal(gk.length, S.players.filter(p => p.club === 'es-malaga-cf' && p.position === 'GK').length); assert.ok(gk.every(r => r.cells[2] === 'Goalkeeper'));
  await page.selectOption('#pos', 'all'); await page.selectOption('#qual', 'UNVERIFIED'); assert.match(await page.innerText('table.squad'), /No player matches these filters/);
  await page.selectOption('#qual', 'all');
  await page.selectOption('#pos', 'FW'); const forwards = await rowsOf(); assert.equal(forwards.length, 7); assert.ok(forwards.some(r=>r.id==='Q104708933')); assert.ok(forwards.some(r=>r.id==='Q59914882'));
  await page.selectOption('#qual', 'CORROBORATED'); assert.equal((await rowsOf()).length, 4); assert.ok((await page.innerText('table.squad')).includes('Position corroborated'));
  await page.selectOption('#qual', 'all'); await page.locator('tr[data-player="Q104708933"] summary').click(); const correction=await page.locator('tr[data-player="Q104708933"] .prov').innerText(); assert.match(correction,/source snapshot says Midfielder/); assert.match(correction,/Displayed position: Forward/); assert.match(correction,/Official club source/);
});

await t('4 · results: Málaga 13 played, 0-5-8, 9–24, 5 points; checks shown; gate stays closed', async () => {
  const txt = await page.innerText('#results-panel');
  assert.match(txt, /13 played: 0 won, 5 drawn, 8 lost, goals 9–24, 5 points/); assert.match(txt, /129 of 130 fixtures due.*completed/); assert.match(txt, /gate stays closed/);
  assert.match(txt, /agrees with LANOVA verified Málaga line/); assert.match(txt, /agrees with openfootball/);
  await page.locator('#results-panel').scrollIntoViewIfNeeded(); await page.screenshot({path: join(out, 'spain_results_desktop.png')});
  await page.selectOption('#club','es-rayo-vallecano'); const rayo=await page.innerText('#results-panel'); assert.match(rayo,/Suspended at 24′, interim score 0–0; resumption scheduled 9 Dec 2026/); assert.match(rayo,/official LaLiga resumption listing: 2026-12-09/); assert.doesNotMatch(rayo,/24 played:/);
});

await t('5 · Segunda División: 22 clubs; a club with contradictory records is flagged incomplete and shows unverified players; no results claimed', async () => {
  await page.click('[data-division="segunda"]'); await page.waitForTimeout(150);
  assert.equal(await page.locator('#club option').count(), 22);
  await page.selectOption('#club', 'es-real-oviedo'); await page.waitForTimeout(150);
  assert.equal(await page.getAttribute('#squad-panel [data-incomplete]', 'data-incomplete'), 'true');
  const un = (await rowsOf()).filter(r => r.q === 'UNVERIFIED'); assert.ok(un.length >= 1); assert.ok(un.every(r => /Unverified/.test(r.cells[5])));
  assert.equal(await page.getAttribute('#results-panel [data-results]', 'data-results'), 'none'); assert.match(await page.innerText('#results-panel'), /No usable 2026\/27 Segunda results/);
  assert.match(page.url(), /division=segunda&club=es-real-oviedo/);
  await page.screenshot({path: join(out, 'spain_segunda_desktop.png')});
});

await t('6 · coverage: 42 clubs listed with counts equal to the data; inferred squad (Real Sociedad B) visible; link selects the club', async () => {
  await page.click('.cov-table summary'); const rows = await page.locator('.cov-table tr[data-cov]').count(); assert.equal(rows, 42);
  const rsb = await page.locator('.cov-table tr[data-cov="es-real-sociedad-b"]').innerText(); assert.match(rsb, /before the summer window closed/);
  for (const x of COV.clubs.slice(0, 5)) { const cells = await page.locator(`.cov-table tr[data-cov="${x.club}"] td`).allInnerTexts(); assert.equal(Number(cells[1]), x.players); assert.equal(Number(cells[2]), x.verified); }
  const head = await page.locator('.cov-table thead').innerText(); assert.match(head, /Dated listings/); assert.doesNotMatch(head, /^\s*Verified\s*$/m);
  await page.click('.cov-table [data-goto="es-real-sociedad-b"]'); await page.waitForTimeout(150);
  assert.match(await page.innerText('#club-panel'), /Real Sociedad B/); assert.ok((await rowsOf()).every(r => r.q === 'INFERRED'));
});

await t('7 · deep link, sources and licences, Málaga case and CTAs', async () => {
  await page.goto(`${URL0}?club=es-sd-eibar`); await page.waitForSelector('table.squad tbody tr');
  assert.match(await page.innerText('#club-panel'), /SD Eibar/); assert.equal(await page.getAttribute('[data-division="segunda"]', 'aria-checked'), 'true');
  const src = await page.innerText('#sources'); assert.match(src, /CC BY-SA 4\.0/); assert.match(src, /CC0/); assert.match(src,/LANOVA modified\/adapted these source data/); assert.match(src, /OpenLigaDB \(ODbL 1\.0\): no LaLiga or Segunda 2026\/27/);
  for (const href of ['../spain-data/squads-2026-27.cc-by-sa.json', '../spain-data/wikidata-2026-27.cc0.json', '../malaga-winter-2027/', '../../../platform.html']) assert.equal((await page.request.get(new URL(href, page.url()).href)).status(), 200, href);
  assert.match(await page.getAttribute('[data-cta="review"]', 'href'), /^mailto:kevin@lake-am\.com/);
  await page.goto(`${URL0}?club=es-malaga-cf`); await page.waitForSelector('table.squad tbody tr');
  await Promise.all([page.waitForNavigation(), page.click('#club-panel a[href="../malaga-winter-2027/"]')]); await page.waitForSelector('#outcomes .out'); assert.match(page.url(), /malaga-winter-2027/);
});

await t('8 · phone (iPhone 13, touch): no horizontal overflow; division and club chosen by tap; squad readable', async () => {
  const {page: ph, c} = await open({...devices['iPhone 13']});
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1, `${await over()}px`); await ph.locator('#squad-panel').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'spain_squad_phone.png')});
  await ph.locator('[data-division="segunda"]').tap(); await ph.selectOption('#club', 'es-cd-tenerife'); await ph.waitForTimeout(200);
  assert.match(await ph.innerText('#club-panel'), /CD Tenerife/); assert.ok(await over() <= 1);
  await ph.locator('#club-panel').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'spain_club_phone.png')});
  await c.close();
});

await t('10 · residual fixes: hero counter from data; corrected positions show the source value; suspended fixture has no "date?" tag', async () => {
  await page.goto(`${URL0}?club=es-malaga-cf`); await page.waitForSelector('table.squad tbody tr');
  assert.equal(await page.innerText('#wd-count'), `${COV.wikidata.checked.toLocaleString('en-GB')} of ${COV.wikidata.playersWithQid.toLocaleString('en-GB')} players with a Wikidata identifier were checked`);
  const rows = await rowsOf(), fw = rows.filter(r => r.cells[2].startsWith('Forward'));
  assert.equal(fw.length, 7); assert.equal(rows.filter(r => /source: Midfielder/.test(r.cells[2])).length, 4);
  for (const n of ['Haitam', 'Joaquín Muñoz', 'Juan Cruz', 'Julen Lobete']) assert.ok(rows.some(r => r.cells[1].startsWith(n) && r.cells[2].startsWith('Forward')), n);
  await page.goto(`${URL0}?club=es-athletic-bilbao`); await page.waitForSelector('#results-panel table');
  const ra = page.locator('#results-panel tr[data-status="suspended"]'); assert.equal(await ra.count(), 1);
  const cells = await ra.locator('td').allInnerTexts(); assert.doesNotMatch(cells[1], /date\?/); assert.match(cells[1], /10 Oct 2026 scheduled/); assert.match(cells[3], /suspended/); assert.match(cells[4], /9 Dec 2026|2026-12-09/);
  assert.match(await page.innerText('#club-panel'), /Bilbao/);
});

await t('11 · behavioural: the Wikidata counter follows the served coverage data (two substituted count pairs, en-GB formatting; mock isolated)', async () => {
  const fmtGB = n => n.toLocaleString('en-GB'), counter = async (pairs) => {
    // A separate browser context: the interception cannot leak into the other checks.
    const c = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
    if (pairs) await c.route('**/spain-data/coverage-2026-27.json', async route => {
      const original = await route.fetch(), data = await original.json();   // the real file, served by the test server
      data.wikidata.checked = pairs[0]; data.wikidata.playersWithQid = pairs[1];   // modified in memory only
      await route.fulfill({response: original, json: data});
    });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${URL0}?club=es-malaga-cf`); await p.waitForSelector('table.squad tbody tr');
    const out = {hero: await p.innerText('#wd-count'), tile: await p.locator('#coverage-panel').innerText()};
    await c.close(); return out;
  };
  const real = COV.wikidata, before = await counter(null);
  assert.equal(before.hero, `${fmtGB(real.checked)} of ${fmtGB(real.playersWithQid)} players with a Wikidata identifier were checked`);
  assert.equal(before.hero, '333 of 1,028 players with a Wikidata identifier were checked');
  for (const [checked, withQid, text] of [[12345, 67890, '12,345 of 67,890'], [7, 1234567, '7 of 1,234,567']]) {
    const got = await counter([checked, withQid]);
    assert.equal(got.hero, `${text} players with a Wikidata identifier were checked`, `served ${checked}/${withQid}`);
    assert.doesNotMatch(got.hero, /\b333\b|1,028/, 'the original counts must not appear when other values are served');
    assert.match(got.tile, new RegExp(`${text.replace(' of ', ' / ')}`), 'the coverage tile reads the same served values');
  }
  const after = await counter(null);   // no mock: the real data again
  assert.equal(after.hero, before.hero, 'the mock did not persist');
  assert.equal(JSON.parse(readFileSync('lanova/cases/spain-data/coverage-2026-27.json', 'utf8')).wikidata.checked, real.checked, 'dataset on disk unchanged');
});

await t('9 · no page error and no request to any other site', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await desk.close(); await browser.close(); server.close();
writeFileSync(join(out, 'spain-clubs-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
