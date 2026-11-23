// Commercial conversion V1: a public "Request a Demo" page reachable from every page, using only the contact channel
// that already works (e-mail to kevin@lake-am.com) and the existing free demo. No form, booking link, external service
// or testimonial is introduced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';

const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('google'));
const read = f => readFileSync(f, 'utf8');
const demo = read('demo.html');

test('every public page links to /demo.html from the navigation and the footer', () => {
  for (const f of pages) {
    const html = read(f);
    assert.match(html, /<nav class="nav" id="nav"[^>]*>.*<a href="\/demo\.html"[^>]*>Request a Demo<\/a>.*<\/nav>/, `${f}: navigation`);
    assert.match(html, /<h4>Company<\/h4>.*<a href="\/demo\.html">Request a demo<\/a>/, `${f}: footer`);
    assert.doesNotMatch(html, /href="\/#demo">Request a Demo/, `${f}: Request a Demo no longer jumps to a home-page anchor`);
  }
});

test('the demo page: primary CTA is a working e-mail with the request prefilled, secondary CTA is the existing free demo', () => {
  const ctas = [...demo.matchAll(/<a class="btn btn-primary" href="([^"]+)"[^>]*>Request a Demo<\/a>/g)].map(m => m[1].replaceAll('&amp;', '&'));
  assert.ok(ctas.length >= 1);
  for (const href of ctas) {
    const u = new URL(href);
    assert.equal(u.protocol, 'mailto:'); assert.equal(u.pathname, 'kevin@lake-am.com');
    assert.equal(u.searchParams.get('subject'), 'LANOVA Sports — demo request');
    for (const field of ['Organisation:', 'My role:', 'Sport:', 'The decision I want to look at:', '30-minute call']) assert.ok(u.searchParams.get('body').includes(field), field);
  }
  // Repositioning: the secondary CTA opens the finance demonstration (decision paths); squad economics keeps its demo link.
  assert.match(demo, /<a class="btn btn-ghost" href="\/lanova\/finance\/"[^>]*>Explore the finance demonstrations<\/a>/);
  assert.match(demo, /<a href="\/lanova\/workspace\/">Explore the squad economics demo<\/a>/);
  assert.ok(existsSync('lanova/workspace/index.html') && existsSync('lanova/finance/index.html'), 'both free demos exist in this repository');
  assert.match(demo, /If no email application opens, write to that address directly/, 'fallback when mailto does not open');
});

test('the demo page invents nothing: no form, no booking or third-party service, no testimonial, no performance claim', () => {
  assert.doesNotMatch(demo, /<form\b/i);
  assert.doesNotMatch(demo, /calendly|cal\.com|hubspot|typeform|google\.com\/forms|zoom\.us|teams\.microsoft/i);
  assert.doesNotMatch(demo, /testimonial|trusted by|customers say|case study|\d+\s?% (?:more|less|faster|better)|ROI/i);
  assert.match(demo, /LANOVA does not value clubs or companies/, 'investors and advisers: the limit is stated');
  assert.match(demo, /not included in Organisation Access today/, 'the finance pilot is not presented as part of the subscription');
  assert.match(demo, /Squad Economics · included in Organisation Access today/);
  for (const m of demo.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.match(m[1], /^\/assets\/site\.js\?v=/, 'only the existing site script');
});

test('the demo page has its own title, description and canonical URL, and keeps the shared assets', () => {
  assert.match(demo, /<title>Request a Demo — LANOVA Sports<\/title>/);
  assert.match(demo, /<link rel="canonical" href="https:\/\/www\.lakecapitalmanagement\.com\/demo\.html">/);
  assert.match(demo, /\/assets\/site\.css\?v=20261117-simplify/); assert.match(demo, /\/assets\/site\.js\?v=20261115-private-login-990/);
});
