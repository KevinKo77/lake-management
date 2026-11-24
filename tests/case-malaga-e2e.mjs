/**
 * Málaga CF winter case study (/lanova/cases/malaga-winter-2027/) in Chromium: desktop 1440×900, then iPhone 13 with
 * touch. Every figure shown is compared with the same calculation run in Node.
 * Usage (repo root): node tests/case-malaga-e2e.mjs [out dir=outputs/case-malaga]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {context, compare, affordability, HYPOTHETICAL, report, SNAPSHOT} from '../lanova/cases/malaga-winter-2027/case.js';
import {fmt} from '../lanova/advantage/lab.js';
import {ILLUSTRATION, profileImpact, compareProfiles} from '../lanova/cases/malaga-winter-2027/player.js';

const {chromium, devices} = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'outputs/case-malaga'); mkdirSync(out, {recursive: true});
const ROOT = resolve('.'), TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  try { if (!f.startsWith(ROOT) || !statSync(f).isFile()) throw 0; res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`, URL0 = `${BASE}/lanova/cases/malaga-winter-2027/`;
const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), ctx = context(D), JAN = ctx.remaining.find(m => m.date >= '2027-01-02').date;
const checks = [], errors = [], offsite = [];
const t = async (name, fn) => { try { await fn(); checks.push({name, status: 'PASS'}); console.log('PASS', name); } catch (e) { checks.push({name, status: 'FAIL', error: String(e.message).split('\n').slice(0, 5).join(' | ')}); console.log('FAIL', name, '\n  ', String(e.message).split('\n').slice(0, 5).join('\n   ')); } };
const browser = await chromium.launch();
async function open(opts) {
  const c = await browser.newContext({...opts, acceptDownloads: true, reducedMotion: 'reduce'});
  await c.route(/fonts\.(googleapis|gstatic)\.com|railway\.app/, r => r.abort());
  const page = await c.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com|lake-intelligence-production\.up\.railway\.app/.test(u)) offsite.push(u); });
  await page.goto(URL0); await page.waitForSelector('#outcomes .out'); return {c, page};
}
const r1 = v => (Math.round(v * 10) / 10).toFixed(1);
const cards = async page => Object.fromEntries(await page.locator('#outcomes .out').evaluateAll(els => els.map(e => [e.dataset.scenario, e.querySelector('b').textContent])));
const {page, c: desk} = await open({viewport: {width: 1440, height: 900}});

await t('1 · verified starting point: figures, dated sources, independence statement, observed label', async () => {
  const tiles = await page.innerText('.obs-tiles');
  for (const x of ['20', '/20', '5', '0–5–8', '9–24', '25']) assert.ok(tiles.includes(x), x);
  assert.match(await page.innerText('#independence'), /independent\. It is not affiliated with, endorsed by or working for Málaga CF or LaLiga/);
  await page.click('.sources summary'); const links = await page.locator('.sources a').evaluateAll(as => as.map(a => a.href));
  assert.deepEqual(links, SNAPSHOT.sources.map(s => s.url)); assert.match(await page.innerText('.sources'), /22 Nov 2026/);
  assert.match(await page.innerText('.history-read'), /35–43 points · median 39/);
  await page.screenshot({path: join(out, 'case_top_desktop.png')});
});

await t('2 · the experiment: the outcomes shown equal the model run in Node (default: +20% / −20% from January)', async () => {
  const want = compare(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}), got = await cards(page);
  for (const k of ['baseline', 'attack', 'defence', 'both']) assert.equal(got[k], r1(want[k].finalPoints), k);
  assert.equal(await page.getAttribute('.v-main', 'data-best'), 'defence');
  await page.locator('#h-exp').evaluate(e => e.closest('section').scrollIntoView()); await page.screenshot({path: join(out, 'case_experiment_desktop.png')});
});

await t('3 · ranking reversal by inputs: the attacking preset makes attack best, the defensive preset defence; numbers follow the model', async () => {
  for (const [preset, a, d, best] of [['striker', 40, 10, 'attack'], ['rebuild', 10, 40, 'defence']]) {
    await page.click(`[data-preset="${preset}"]`); await page.waitForTimeout(150);
    assert.equal(await page.getAttribute('.v-main', 'data-best'), best, preset);
    const want = compare(ctx, {attackPct: a, attackFrom: JAN, defencePct: d, defenceFrom: JAN}), got = await cards(page);
    assert.equal(got.attack, r1(want.attack.finalPoints)); assert.equal(got.defence, r1(want.defence.finalPoints));
  }
});

await t('4 · timing and exact values: a later defence start reverses the ranking; typed values are clamped to the allowed range', async () => {
  await page.click('[data-preset="equal"]'); await page.waitForTimeout(120);
  const april = ctx.remaining.find(m => m.date >= '2027-04-01').date;
  await page.fill('#attackNum', '25'); await page.locator('#attackNum').dispatchEvent('input'); await page.selectOption('#defenceFrom', april); await page.waitForTimeout(200);
  assert.equal(await page.getAttribute('.v-main', 'data-best'), 'attack');
  const want = compare(ctx, {attackPct: 25, attackFrom: JAN, defencePct: 20, defenceFrom: april}); assert.equal((await cards(page)).defence, r1(want.defence.finalPoints));
  await page.fill('#defenceNum', '500'); await page.locator('#defenceNum').dispatchEvent('input'); await page.waitForTimeout(150);
  assert.equal(await page.inputValue('#defenceNum'), '90', 'clamped to 90%');
  await page.selectOption('#defenceFrom', JAN); await page.click('[data-preset="equal"]'); await page.waitForTimeout(120);
});

await t('5 · keyboard: the slider is reachable and the arrow keys change the analysis', async () => {
  await page.focus('#attackPct'); const before = (await cards(page)).attack;
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  assert.equal(await page.inputValue('#attackPct'), '30'); assert.notEqual((await cards(page)).attack, before);
  await page.click('[data-preset="equal"]'); await page.waitForTimeout(120);
});

await t('6 · finance: nothing computed until figures exist; the hypothetical illustration equals the Advantage Lab in Node and is labelled', async () => {
  assert.match(await page.innerText('#afford'), /Not computed\. Enter the organisation figures/);
  await page.click('[data-fin="hypothetical"]'); await page.waitForTimeout(250);
  const want = affordability(structuredClone(HYPOTHETICAL), compare(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN})), text = await page.innerText('#afford');
  for (const k of ['attack', 'defence', 'both']) for (const v of [want.items[k].budgetCommitment, want.items[k].base.lowest, want.items[k].downside.lowest, want.items[k].costPerExpectedPoint]) assert.ok(text.includes(fmt(v)), `${k} ${fmt(v)}`);
  // Independent review fixture, read from the cells of the dashboard (hand-computed values, not the code under test).
  const cellOf = async (measure, item) => (await page.locator(`#afford tr[data-measure="${measure}"] td[data-item="${item}"]`).innerText()).split('\n')[0].trim();
  const fixture = {cashAtSigning: {attack: '880,000', defence: '1,170,000', both: '2,050,000'}, cashPaid2027: {attack: '1,738,000', defence: '2,340,000', both: '4,078,000'},
    futurePayments: {attack: '0', defence: '1,485,000', both: '1,485,000'}, totalCommitment: {attack: '1,738,000', defence: '3,825,000', both: '5,563,000'}, budgetCommitment: {attack: '880,000', defence: '2,070,000', both: '2,950,000'}};
  for (const [m, byItem] of Object.entries(fixture)) for (const [k, v] of Object.entries(byItem)) assert.equal(await cellOf(m, k), v, `${m} ${k}`);
  assert.match(await page.locator('#afford tr[data-measure="futurePayments"] td[data-item="defence"]').innerText(), /fee instalment 900,000 due 2028-01/);
  assert.doesNotMatch(text, /3,240,000|Cost in 2027|Immediate cost/);
  await page.click('.schedule summary'); const sched = await page.locator('.schedule tbody tr').allInnerTexts();
  assert.match(sched[0], /2027-01\s+1,023,000\s+1,267,500\s+2,290,500/); assert.match(sched.at(-1), /After 2027 \(not yet paid\)\s+0\s+1,485,000\s+1,485,000/);
  assert.match(text, /Hypothetical financial assumptions — not Málaga CF data/);
  // A missing cost stays missing: clearing one wage makes that intervention "costs unknown".
  const wage = page.locator('[data-f="defence.monthlyWage"]'); await wage.fill(''); await wage.dispatchEvent('input'); await page.waitForTimeout(200);
  assert.match(await page.innerText('#afford'), /Costs unknown for defence/);
  await wage.fill('75000'); await wage.dispatchEvent('input'); await page.waitForTimeout(200);
  await page.locator('#h-fin').evaluate(e => e.closest('section').scrollIntoView()); await page.screenshot({path: join(out, 'case_finance_desktop.png')});
});

await t('7 · exports: the HTML and JSON reports equal the analysis on screen and keep the three kinds of information apart', async () => {
  const get = async kind => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${kind}"]`)]); const f = join(out, d.suggestedFilename()); await d.saveAs(f); return readFileSync(f, 'utf8'); };
  const json = JSON.parse(await get('json')), html = await get('html'), want = report(ctx, {attackPct: 20, attackFrom: JAN, defencePct: 20, defenceFrom: JAN}, structuredClone(HYPOTHETICAL));
  assert.deepEqual(json.estimates.attack, want.estimates.attack); assert.deepEqual(json.estimates.affordability, want.estimates.affordability); assert.deepEqual(json.observed.snapshot, want.observed.snapshot);
  assert.ok(html.includes('class="box obs"') && html.includes('class="box est"') && html.includes('class="box hyp"')); assert.match(html, /not affiliated with/);
});

await t('7b · report integrity from the interface: changed magnitudes and dates, a missing cost; JSON and HTML equal the screen (identity, dates, points, finance, missing labels)', async () => {
  const set = async (sel, v) => { const el = page.locator(sel); if (await el.evaluate(e => e.tagName) === 'SELECT') await el.selectOption(v); else { await el.fill(String(v)); await el.dispatchEvent('input'); } await page.waitForTimeout(150); };
  const d = ctx.remaining.map(m => m.date);
  await set('#attackNum', 37); await set('#attackFrom', d[10]); await set('#defenceNum', 12); await set('#defenceFrom', d[3]);
  await page.click('[data-fin="hypothetical"]'); await page.waitForTimeout(200);
  const wage = page.locator('[data-f="defence.monthlyWage"]'); await wage.fill(''); await wage.dispatchEvent('input'); await page.waitForTimeout(250);
  const cards = await page.locator('#outcomes .out').evaluateAll(es => Object.fromEntries(es.map(e => [e.dataset.scenario, e.querySelector('b').textContent])));
  const get = async kind => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${kind}"]`)]); const f = join(out, `integrity.${kind}`); await dl.saveAs(f); return readFileSync(f, 'utf8'); };
  const json = JSON.parse(await get('json')), html = await get('html'), e = json.estimates;
  assert.deepEqual(json.hypotheses.interventions, {attackPct: 37, attackFrom: d[10], defencePct: 12, defenceFrom: d[3]});
  for (const k of ['baseline', 'attack', 'defence', 'both']) { assert.equal(e[k].shown.expectedFinalPoints, cards[k], `${k}: export equals the card on screen`); assert.ok(html.includes(`<td>${cards[k]}</td>`), `${k} in HTML`); }
  assert.deepEqual(e.attack.intervention, {attackPct: 37, attackFrom: d[10], defencePct: 0, defenceFrom: null}); assert.equal(e.attack.matchesAffected.attack, d.length - 10);
  assert.equal(e.defence.matchesAffected.defence, d.length - 3); assert.ok(html.includes(`goals scored +37% from ${d[10]} (${d.length - 10} matches)`));
  assert.equal(json.hypotheses.finance.defence.monthlyWage, null); assert.deepEqual(e.affordability.missingFinancialInputs, ['defence intervention: monthlyWage']);
  assert.equal(e.affordability.defence.costs, 'unknown'); assert.match(html, /Costs unknown — not computed\. Costs unknown for defence/);
  const re = report(ctx, json.hypotheses.interventions, json.hypotheses.finance).estimates.affordability;
  assert.equal(e.affordability.attack.cashPaid2027, 1_738_000); assert.equal(e.affordability.attack.cashPaid2027, re.attack.cashPaid2027); assert.equal(e.affordability.attack.budgetCommitment, 880_000);
  await wage.fill('75000'); await wage.dispatchEvent('input'); await page.click('[data-preset="equal"]'); await set('#attackFrom', JAN); await set('#defenceFrom', JAN);
});

await t('8 · calls to action: software page opens; the review request is a working pre-filled e-mail; no dead control', async () => {
  const href = await page.getAttribute('[data-cta="software"]', 'href'); const r = await page.request.get(new URL(href, URL0).href); assert.equal(r.status(), 200);
  const mail = new URL((await page.getAttribute('[data-cta="review"]', 'href')).replace(/&amp;/g, '&')); assert.equal(mail.pathname, 'kevin@lake-am.com'); assert.match(mail.searchParams.get('body'), /Winter Transfer Strategy Review/);
  for (const b of await page.locator('#case button').all()) assert.equal(await b.isDisabled(), false);
  const internal = await page.locator('a[href]').evaluateAll(as => as.map(a => a.href).filter(h => h.startsWith(location.origin)));
  for (const u of [...new Set(internal.map(h => h.split('#')[0]))]) assert.equal((await page.request.get(u)).status(), 200, u);
});

await t('9a · player profiles: nothing pre-filled; the illustration figures equal Node; a label never changes a figure; overlap reported', async () => {
  assert.match(await page.innerText('#profiles'), /Not computed[\s\S]*Not computed/);
  assert.equal(await page.inputValue('[data-p="0.minutesPct"]'), '');
  await page.click('[data-prof="illustration"]'); await page.waitForTimeout(200);
  const want = ILLUSTRATION.map(x => profileImpact(ctx, {...x, from: JAN}));
  const cells = async () => page.locator('#profiles tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  const sg = v => `${v >= 0 ? '+' : '−'}${r1(Math.abs(v))}`, rows = await cells();
  want.forEach((w, i) => { assert.equal(rows[i][2], sg(w.low.gain)); assert.equal(rows[i][3], sg(w.central.gain)); assert.equal(rows[i][4], sg(w.high.gain)); assert.equal(rows[i][5], r1(w.central.finalPoints)); });
  assert.equal(await page.getAttribute('.prof-verdict', 'data-separated'), String(compareProfiles(want).separated));
  const lab = page.locator('[data-p="0.label"]'); await lab.fill('Any Name'); await page.waitForTimeout(200);
  const after = await cells(); assert.deepEqual(after.map(r => r.slice(2)), rows.map(r => r.slice(2))); assert.match(after[0][0], /your label · unverified/);
  // A range in the wrong order is refused, not computed.
  const hi = page.locator('[data-p="0.attack.high"]'); await hi.fill('5'); await page.waitForTimeout(200); assert.match(await page.innerText('[data-prof-row="0"]'), /low ≤ central ≤ high/);
  await hi.fill('40'); await page.waitForTimeout(200);
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="json"]')]); const f = join(out, 'profiles.json'); await d.saveAs(f);
  const j = JSON.parse(readFileSync(f, 'utf8')); assert.equal(j.profiles.items.length, 2); assert.equal(j.profiles.items[0].label, 'Any Name'); assert.equal(j.profiles.items[1].central.expectedPointsGained, +want[1].central.gain.toFixed(3));
  await page.locator('#h-prof').evaluate(e => e.closest('section').scrollIntoView()); await page.screenshot({path: join(out, 'case_profiles_desktop.png')});
  await page.click('[data-prof="clear"]'); await page.waitForTimeout(150);
});

await t('9 · phone (iPhone 13, touch): readable, no horizontal overflow, presets and finance usable by tap', async () => {
  const {page: ph, c} = await open({...devices['iPhone 13']});
  const over = () => ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await over() <= 1, `${await over()}px`); await ph.screenshot({path: join(out, 'case_top_phone.png')});
  await ph.locator('[data-preset="striker"]').tap(); await ph.waitForTimeout(200); assert.equal(await ph.getAttribute('.v-main', 'data-best'), 'attack');
  await ph.locator('#verdict').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'case_experiment_phone.png')});
  await ph.locator('[data-fin="hypothetical"]').tap(); await ph.waitForTimeout(250); assert.match(await ph.innerText('#afford'), /Attack/);
  assert.ok(await over() <= 1); await ph.locator('#afford').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'case_finance_phone.png')});
  await ph.locator('[data-prof="illustration"]').tap(); await ph.waitForTimeout(250); assert.ok(await over() <= 1, 'profiles fit');
  assert.match(await ph.innerText('#profiles'), /Profile B \(illustration\)/); await ph.locator('#profiles').scrollIntoViewIfNeeded(); await ph.screenshot({path: join(out, 'case_profiles_phone.png')});
  await ph.locator('.menu-btn').tap(); assert.equal(await ph.getAttribute('.menu-btn', 'aria-expanded'), 'true');
  await c.close();
});

await t('10 · no page error and no request to any other site (fonts and the site\'s own health check excepted)', async () => { assert.deepEqual(errors, []); assert.deepEqual(offsite, []); });
await desk.close(); await browser.close(); server.close();
writeFileSync(join(out, 'case-malaga-e2e-results.json'), JSON.stringify({generatedAt: new Date().toISOString(), checks}, null, 2));
const failed = checks.filter(c => c.status === 'FAIL'); console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`); process.exit(failed.length ? 1 : 0);
