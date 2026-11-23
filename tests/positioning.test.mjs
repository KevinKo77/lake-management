// Strategic repositioning: LANOVA Sports is presented as financial intelligence for sports institutions, with Squad
// Economics (recruitment) as a specialised module. Availability stays exact: Squad Economics is what Organisation Access
// includes today; LANOVA Finance is in its pilot phase, on request, and never presented as part of the subscription.
// The price is stated exactly but is not the first interaction. Every internal link and image of the public pages exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';

const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('google'));
const read = f => readFileSync(f, 'utf8');
const main = f => read(f).match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const firstSection = f => main(f).match(/<section[\s\S]*?<\/section>/)[0];

test('the central proposition: Financial Intelligence for Sports Institutions, finance capabilities first', () => {
  const home = read('index.html');
  assert.match(home, /<title>LANOVA Sports — Financial Intelligence for Sports Institutions<\/title>/);
  assert.match(firstSection('index.html'), /<h1>Financial intelligence for sports institutions\.<\/h1>/);
  const order = ['Planning &amp; forecasting', 'Cash flow &amp; liquidity', 'Scenarios &amp; risk', 'Investment decisions', 'Financial commitments', 'Squad economics'];
  const at = order.map(x => main('index.html').indexOf(x)); assert.ok(at.every(i => i > 0), 'all six capabilities'); assert.deepEqual([...at].sort((a, b) => a - b), at, 'squad economics comes last');
  const body = f => main(f).replace(firstSection(f), '');
  for (const [f, first] of [['platform.html', 'Financial Planning'], ['how-it-works.html', 'Import the budget']]) assert.ok(body(f).indexOf(first) >= 0 && body(f).indexOf(first) < body(f).indexOf('Squad Economics'), `${f}: finance before squad economics`);
});

test('recruitment is a secondary use case: not in any hero, no scouting or transfer-optimiser positioning', () => {
  for (const f of ['index.html', 'platform.html', 'how-it-works.html', 'demo.html']) {
    const hero = text(firstSection(f)); assert.doesNotMatch(hero, /recruitment|shortlist|signing|transfer/i, `${f}: hero`);
    assert.doesNotMatch(text(main(f)), /scouting platform|transfer optimi[sz]er|player recruitment platform/i, f);
  }
  for (const f of ['index.html', 'platform.html', 'how-it-works.html', 'demo.html', 'pricing.html']) assert.doesNotMatch(read(f), /og:image" content="[^"]*ws-dashboard/, `${f}: social image is a finance view`);
});

test('availability is exact everywhere: Finance is a pilot, not included in Organisation Access; Squad Economics is included', () => {
  for (const f of ['index.html', 'platform.html', 'demo.html', 'pricing.html']) {
    const t = text(main(f));
    assert.match(t, /pilot/i, `${f}: pilot`); assert.match(t, /not (?:included in|part of) (?:Organisation Access|the current subscription)/i, `${f}: Finance not in the subscription`);
    assert.doesNotMatch(t, /Finance[^.]{0,80}(?<!not |not yet )(?:included in|part of) (?:Organisation Access|the (?:current )?subscription)(?!\?)/i, `${f}: never claims Finance is included (a question answered 'No' is allowed)`);
    assert.doesNotMatch(t, /pilot (?:is )?(?:live|running|under way)|pilot clients|in production with/i, `${f}: no claim that the pilot has started`);
  }
  const pricing = text(main('pricing.html'));
  assert.match(pricing, /Squad Economics — recruitment economics for football: Recruitment Workspace and Recruitment Optimizer V2/);
  assert.match(pricing, /Not included: LANOVA Finance/); assert.match(pricing, /subscribing to Organisation Access does not give access to it/);
  assert.match(pricing, /€990 per month per organisation, excluding VAT/);
});

test('the price is exact but not the first interaction', () => {
  for (const f of ['index.html', 'platform.html', 'how-it-works.html', 'demo.html']) assert.doesNotMatch(firstSection(f), /€\s?\d|per month/i, `${f}: no price in the hero`);
  assert.match(main('index.html'), /€990 per month per organisation, excluding VAT, up to 5 users/);
});

test('every internal link and image on the public pages exists; images have alternative text', () => {
  const exists = p => { const path = decodeURIComponent(p.split(/[?#]/)[0]); const f = '.' + (path.endsWith('/') ? path + 'index.html' : path); return existsSync(f) && statSync(f).isFile(); };
  for (const f of pages) {
    const html = read(f);
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) assert.ok(href === '/' || exists(href), `${f}: ${href}`);
    for (const [, src] of html.matchAll(/<img [^>]*src="(\/[^"]+)"/g)) assert.ok(exists(src), `${f}: ${src}`);
    for (const [img] of html.matchAll(/<img [^>]*>/g)) assert.match(img, /alt="[^"]{12,}"/, `${f}: alt text`);
  }
});

test('existing tools and old links are preserved', () => {
  for (const p of ['lanova/workspace/index.html', 'lanova/recruitment/index.html', 'lanova/optimizer/index.html', 'lanova/finance/index.html', 'lanova/index.html']) assert.ok(existsSync(p), p);
  assert.match(main('platform.html'), /href="\/lanova\/workspace\/"/); assert.match(main('platform.html'), /href="\/lanova\/recruitment\/"/);
  assert.match(main('pricing.html'), /href="\/lanova\/workspace\/"/);
});

test('the finance demonstration opens on a neutral decision landing, never on a named club', () => {
  const js = read('lanova/finance/demo.js');
  for (const t of ['Build a Financial Forecast', 'Compare Strategic Scenarios', 'Analyse Cash Flow &amp; Risk'.replace('&amp;', '&'), 'Explore a Financial Decision Report']) assert.ok(js.includes(t), t);
  assert.match(js, /if \(!S\.plan\) \{ main\.innerHTML = landing\(\); return; \}/, 'nothing is opened by default');
  assert.match(js, /S\.plan\.name = exampleName\(id\)/, 'the engine case names are replaced by anonymous example names');
  assert.match(js, /no real or named organisation/);
  assert.doesNotMatch(read('lanova/finance/index.html') + js, /Rivermar|Valdemar|Athletic FC|North United|South Athletic|Basket Club/);
});
