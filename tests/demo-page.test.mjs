// The public demo page (V3): a single entry point to working demonstrations, reachable from every page, using only the
// contact channel that already works (e-mail to kevin@lake-am.com). No form, booking link, external service or
// testimonial. Every demonstration button leads to a tool that exists in this repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';

const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('google'));
const read = f => readFileSync(f, 'utf8');
const demo = read('demo.html');
const DEMO_HREF = f => (f === '404.html' ? '/demo.html' : 'demo.html'); // 404 is served at any depth: absolute links

test('every public page links to the demo page from the navigation and the footer', () => {
  for (const f of pages) {
    const html = read(f), href = DEMO_HREF(f).replace(/[./]/g, c => `\\${c}`);
    assert.match(html, new RegExp(`<nav class="nav" id="nav"[^>]*>.*<a class="nav-cta" href="${href}">Request a Demo</a>.*</nav>`), `${f}: navigation`);
    assert.match(html, new RegExp(`<h4>Company</h4>.*<a href="${href}">Request a demo</a>`), `${f}: footer`);
  }
});

test('the demo page: primary CTA is a working e-mail with the request prefilled; every demonstration leads to a real tool', () => {
  const ctas = [...demo.matchAll(/<a class="btn btn-primary" href="([^"]+)"[^>]*>Request a Demo<\/a>/g)].map(m => m[1].replaceAll('&amp;', '&'));
  assert.ok(ctas.length >= 1);
  for (const href of ctas) {
    const u = new URL(href);
    assert.equal(u.protocol, 'mailto:'); assert.equal(u.pathname, 'kevin@lake-am.com');
    assert.equal(u.searchParams.get('subject'), 'LANOVA Sports — demo request');
    for (const field of ['Organisation:', 'My role:', 'Sport:', 'The decision I want to look at:', '30-minute call']) assert.ok(u.searchParams.get('body').includes(field), field);
  }
  assert.match(demo, /If no email application opens, write to that address directly/, 'fallback when mailto does not open');
  const links = [...demo.matchAll(/<a class="btn [^"]+" href="(lanova\/[^"]+)"[^>]*data-demo="([^"]+)"/g)];
  assert.ok(links.length >= 8, 'four entry points, two ways in each');
  for (const [, href] of links) assert.ok(existsSync(href.split('?')[0] + 'index.html'), href);
  for (const title of ['Resource Advantage Lab', 'Financial Forecasting', 'Scenario &amp; Risk Analysis', 'Decision Brief']) assert.ok(demo.includes(`<h3>${title}</h3>`), title);
  assert.match(demo, /href="lanova\/advantage\/\?start=blank"/, 'a neutral start is always offered');
  assert.match(demo, /href="lanova\/workspace\/">Explore the squad economics demo<\/a>/, 'Squad Economics kept as a specialized module');
});

test('the demo page invents nothing: no form, no booking or third-party service, no testimonial, no performance claim', () => {
  assert.doesNotMatch(demo, /<form\b/i);
  assert.doesNotMatch(demo, /calendly|cal\.com|hubspot|typeform|google\.com\/forms|zoom\.us|teams\.microsoft/i);
  assert.doesNotMatch(demo, /testimonial|trusted by|customers say|case study|\d+\s?% (?:more|less|faster|better)|ROI/i);
  assert.match(demo, /LANOVA does not value clubs or companies/, 'investors and advisers: the limit is stated');
  for (const m of demo.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /assets\/site\.js\?v=/, 'only the existing site script');
});

test('the demo page has its own title, description and canonical URL, and the shared assets', () => {
  assert.match(demo, /<title>Request a Demo — LANOVA Sports<\/title>/);
  assert.match(demo, /<link rel="canonical" href="https:\/\/www\.lakecapitalmanagement\.com\/demo\.html">/);
  assert.match(demo, /assets\/v3\.css\?v=20261123-v4/); assert.match(demo, /assets\/site\.js\?v=20261115-private-login-990/);
});
