// Permanent marketing decisions (V3, Sports Decision Intelligence). These tests protect them against regressions:
//  1. LANOVA is not presented as a recruitment or scouting platform; Squad Economics is a specialized module.
//  2. Every sport is addressed explicitly; football is one discipline among others.
//  3. No fictional club is imposed: demonstrations open on a neutral workspace; anonymous examples load on request.
//  4. Existing Squad Economics tools are kept.
//  5. Available, pilot and prototype are always told apart; Finance and the Advantage Lab are never in the subscription.
//  6. Prices are exact (EUR 990 per month per organisation, excl. VAT) but not the first interaction.
//  7. No probability, prediction or invented performance; estimates are labelled.
// Plus: every internal link and image of the public pages exists, relative links work at any host path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {dirname, join, normalize} from 'node:path';

const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('google'));
const MAIN = ['index.html', 'platform.html', 'financial-intelligence.html', 'how-it-works.html', 'demo.html', 'pricing.html'];
const read = f => readFileSync(f, 'utf8');
const main = f => read(f).match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const firstSection = f => main(f).match(/<section[\s\S]*?<\/section>/)[0];

test('1 · the proposition: LANOVA Sports — Sports Decision Intelligence; Compete smarter. Not just bigger.', () => {
  const home = read('index.html');
  assert.match(home, /<title>LANOVA Sports — Sports Decision Intelligence<\/title>/);
  const hero = firstSection('index.html');
  assert.match(hero, /<p class="kicker">LANOVA SPORTS<\/p>/); assert.match(hero, /Sports Decision Intelligence/);
  assert.match(hero, /<h1>Compete smarter\. <em>Not just bigger\.<\/em><\/h1>/);
  assert.match(text(hero), /Understand your financial position, compare strategic opportunities, and make better use of every resource — across sport\./);
  assert.match(hero, /href="lanova\/advantage\/">Explore Advantage Lab<\/a>/); assert.match(hero, /href="demo\.html">Request a Demonstration<\/a>/);
  assert.match(hero, /id="home-map"/, 'a real product visual: the live Resource Advantage Map');
  const order = ['Every resource is a decision', 'The Decision Engine', 'Financial Intelligence', 'Designed for every sport', 'From information to a decision', 'Product availability', 'Request a demonstration'];
  const at = order.map(x => main('index.html').indexOf(x)); assert.ok(at.every(i => i > 0), 'all seven sections'); assert.deepEqual([...at].sort((a, b) => a - b), at, 'in order');
});

test('1 · recruitment and scouting are never the main positioning', () => {
  for (const f of MAIN) {
    assert.doesNotMatch(text(firstSection(f)), /recruitment|scouting|shortlist|signing|transfer/i, `${f}: hero`);
    assert.doesNotMatch(text(main(f)), /scouting platform|recruitment platform|transfer optimi[sz]er/i, f);
    assert.doesNotMatch(read(f), /og:image" content="[^"]*ws-/, `${f}: social image is not a recruitment view`);
  }
  for (const f of pages) {
    const nav = read(f).match(/<nav class="nav" id="nav"[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...nav.matchAll(/>([^<]+)<\/a>/g)].map(m => m[1]), ['Platform', 'Advantage Lab', 'Financial Intelligence', 'How It Works', 'Pricing', 'Request a Demo', 'Login'], `${f}: navigation`);
  }
  assert.match(main('platform.html'), /id="specialized-modules"[\s\S]*Squad Economics/, 'Squad Economics under Specialized modules');
});

test('2 · every sport: the ten disciplines are named, without claiming sport-specific predictive models', () => {
  const sports = text(main('index.html').match(/<ul class="sports">[\s\S]*?<\/ul>/)[0]);
  for (const s of ['Football', 'Basketball', 'Rugby', 'Ice hockey', 'Tennis', 'Volleyball', 'Athletics', 'Cycling', 'Motorsport', 'Multi-sport organisations']) assert.ok(sports.includes(s), s);
  assert.match(text(main('index.html')), /does not claim sport-specific predictive models/);
  assert.doesNotMatch(text(MAIN.map(main).join(' ')), /predict(?:s|ed|ive)? (?:the )?(?:results|performance|wins)(?! of)(?!\?)/i);
});

test('3 · demonstrations open neutral; anonymous examples load only on request; no named fictional club', () => {
  const adv = read('lanova/advantage/app.js'), fin = read('lanova/finance/demo.js');
  assert.match(adv, /else start\(\);/, 'the Advantage Lab opens on its start screen');
  assert.match(adv, /if \(q\.get\('start'\) === 'blank'\)/); assert.match(fin, /if \(!S\.plan\) \{ main\.innerHTML = landing\(\); return; \}/, 'Finance opens on the four questions');
  for (const f of ['lanova/advantage/examples.js', 'lanova/finance/demo.js', 'assets/home-map.js']) assert.doesNotMatch(read(f), /Rivermar|Valdemar|Athletic FC|North United|South Athletic|Basket Club/, f);
  assert.match(read('lanova/advantage/examples.js'), /anonymous; all figures invented/);
  assert.match(text(firstSection('index.html')), /illustrative anonymous examples?, invented figures/, 'the home map is labelled illustrative');
});

test('4 · existing tools and their addresses are preserved', () => {
  for (const p of ['lanova/workspace/index.html', 'lanova/recruitment/index.html', 'lanova/optimizer/index.html', 'lanova/finance/index.html', 'lanova/advantage/index.html', 'lanova/index.html', 'login.html']) assert.ok(existsSync(p), p);
  assert.match(main('platform.html'), /href="lanova\/workspace\/"/); assert.match(main('platform.html'), /href="lanova\/recruitment\/"/);
  assert.match(read('login.html'), /data-app-path="\/login"/, 'sign-in path kept');
});

test('5 · availability: available, pilot and prototype are always distinguished; nothing new is sold', () => {
  for (const f of ['index.html', 'platform.html', 'financial-intelligence.html', 'demo.html', 'pricing.html']) {
    const t = text(main(f));
    assert.match(t, /pilot/i, `${f}: pilot`);
    assert.doesNotMatch(t, /(?:Finance|Advantage Lab)[^.]{0,80}(?<!not |not yet )(?:included in|part of) (?:Organisation Access|the (?:current )?subscription)(?!\?)/i, `${f}: never claims Finance or the Advantage Lab are included`);
    assert.doesNotMatch(t, /pilot (?:is )?(?:live|running|under way)|pilot clients|in production with/i, `${f}: no claim that the pilot has started`);
  }
  const avail = main('index.html').match(/<table class="avail">[\s\S]*?<\/table>/)[0];
  assert.match(avail, /data-module="squad">[\s\S]*?chip available[\s\S]*?Included in Organisation Access: €990 per month per organisation, excluding VAT, up to 5 users/);
  assert.match(avail, /data-module="finance">[\s\S]*?chip pilot[\s\S]*?the pilot has not started yet\. Not included in Organisation Access/);
  assert.match(avail, /data-module="advantage">[\s\S]*?chip prototype[\s\S]*?Not part of any subscription/);
  const pricing = text(main('pricing.html'));
  assert.match(pricing, /Squad Economics — recruitment economics for football: Recruitment Workspace and Recruitment Optimizer V2/);
  assert.match(pricing, /Not included: LANOVA Finance/); assert.match(pricing, /subscribing to Organisation Access does not give access to it/i);
  assert.match(pricing, /€990/); assert.match(pricing, /per month per organisation, excl\. VAT/);
  assert.equal(new Set(MAIN.flatMap(f => [...read(f).matchAll(/€\s?(\d[\d,.]*)/g)].map(m => m[1]))).size <= 1, true, 'no other price than €990');
});

test('6 · the price is exact but not the first interaction', () => {
  for (const f of ['index.html', 'platform.html', 'financial-intelligence.html', 'how-it-works.html', 'demo.html']) assert.doesNotMatch(text(firstSection(f)), /€\s?\d|per month/i, `${f}: no price in the first screen`);
});

test('7 · no probability, no invented performance; estimates are labelled as estimates', () => {
  const all = text(MAIN.map(main).join(' '));
  assert.doesNotMatch(all, /\d+\s?% (?:chance|probability|likelihood)|guarantee[sd]? (?:wins|results|promotion)|testimonial|trusted by/i);
  assert.match(text(main('platform.html')), /LANOVA does not predict sporting results and shows no probability/);
  assert.match(read('assets/home-map.js'), /the example's own estimate/);
  assert.match(read('lanova/advantage/app.js'), /They are your judgement, not predictions of sporting results/);
});

test('every internal link and image on the public pages and tools resolves; images have alternative text', () => {
  const files = [...pages, 'lanova/advantage/index.html', 'lanova/finance/index.html'];
  const resolveHref = (from, href) => { const p = href.startsWith('/') ? '.' + href : join(dirname(from), href); const n = normalize(decodeURIComponent(p.split(/[?#]/)[0])); return n.endsWith('/') || n === '.' ? join(n, 'index.html') : n; };
  for (const f of files) {
    const html = read(f);
    for (const [, href] of html.matchAll(/href="((?!https?:|mailto:|tel:|#|data:)[^"]*)"/g)) { const target = resolveHref(f, href); assert.ok(existsSync(target) && statSync(target).isFile(), `${f}: ${href} → ${target}`); }
    for (const [, src] of html.matchAll(/<(?:img|script)[^>]* src="((?!https?:|data:)[^"]+)"/g)) assert.ok(existsSync(resolveHref(f, src)), `${f}: ${src}`);
    for (const [img] of html.matchAll(/<img [^>]*>/g)) assert.match(img, /alt="[^"]{12,}"/, `${f}: alt text`);
    if (f !== '404.html') assert.doesNotMatch(html.replace(/data-app-path="\/[a-z]+"/g, ''), /(?:href|src)="\/(?!\/)/, `${f}: links are relative, so the site also works under a preview path`);
  }
});
