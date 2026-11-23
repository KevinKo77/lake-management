// LANOVA Finance public demonstration: the engine is the validated one (byte-identical, manifest), the page uses only
// fictional data, sends nothing, loads nothing from elsewhere, and leads the prospect to a demo request.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const dir = 'lanova/finance/', read = f => readFileSync(dir + f, 'utf8');
const manifest = JSON.parse(read('engine/MANIFEST.json'));

test('engine files are exactly the ones listed in the manifest (no divergent copy)', () => {
  assert.equal(manifest.copiedUnchanged, true); assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(readdirSync(dir + 'engine').filter(f => f.endsWith('.js')).sort(), Object.keys(manifest.files).sort());
  for (const [f, h] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(dir + 'engine/' + f)).digest('hex'), h, f);
  assert.match(read('BUILD.txt'), new RegExp(manifest.commit));
});

test('the engine reproduces the validated results of the four fictional clubs', async () => {
  const {analyse} = await import(`../${dir}engine/model.js`), {CASES} = await import(`../${dir}engine/cases.js`);
  const expected = {football: 5_092_149, basketball: 1_907_000, groupNorth: 22_727_905, groupSouth: 11_935_000};
  for (const [k, v] of Object.entries(expected)) { const a = analyse(CASES[k]()); assert.ok(Math.abs(a.base.totals.closingCash - v) < 0.5, k); assert.ok(CASES[k]().fictional, `${k} is marked fictional`); }
  const f = analyse(CASES.football()).base;
  assert.ok(Math.abs(f.commitments.cover - 0.9563) < 1e-4); assert.ok(Math.abs(f.commitments.cashAfterCommitments - 92_149) < 0.5);
  const south = analyse(CASES.groupSouth()).impact.find(x => x.scenario === 'base').combined.returns;
  assert.ok(Math.abs(south.asset.ebitdaYield - 0.072) < 1e-9 && Math.abs(south.combined.ebitdaYield - 0.216) < 1e-9);
});

test('the demonstration page: fictional banner, strict CSP, own scripts only, no network call, honest availability, contact path', () => {
  const html = read('index.html'), js = read('demo.js');
  assert.match(html, /Demonstration with illustrative, anonymous examples/); assert.match(html, /nothing you enter is sent or stored/);
  assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self';[^"]*connect-src 'self'/);
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.equal(m[1], 'demo.js');
  assert.doesNotMatch(html + js, /https?:\/\/(?!www\.lakecapitalmanagement\.com)[a-z]/i, 'no third-party URL');
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|sendBeacon/);
  assert.doesNotMatch(html + js, / style="/, 'no inline style (CSP)');
  for (const m of js.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(m[1], /^\.\/engine\/(model|cases|report)\.js$/);
  assert.match(html, /not yet part of the self-service subscription/, 'does not claim Finance is in the subscription');
  assert.ok(html.includes('href="../../demo.html"') && html.includes('mailto:kevin@lake-am.com'), 'demo request and contact');
  assert.match(js, /href="\.\.\/\.\.\/demo\.html"/); assert.doesNotMatch(html + js, /stripe|checkout|signup/i);
});

test('the public demo page opens the finance demonstration on its neutral workspace and on each decision path', () => {
  const demo = readFileSync('demo.html', 'utf8');
  assert.match(demo, /<a class="btn btn-ink" href="lanova\/finance\/" data-demo="finance">Open the neutral workspace<\/a>/);
  for (const p of ['forecast', 'scenarios', 'cash', 'report']) assert.match(demo, new RegExp(`href="lanova/finance/\\?path=${p}"`), p);
  assert.match(demo, /LANOVA Finance is a pilot on request, not included in Organisation Access today/);
  assert.doesNotMatch(demo, /finance[^.<]*(?<!not )(?<!not yet )(included in|part of) (the|your) (current )?subscription(?! today)/i, 'never claims Finance is in the subscription');
});
