// Advantage Lab V1 — regression for the documented-range defect found in independent review: an option with
// monthlyGain === null and a valid documented gainRange was listed as "financial gain (not estimable)". The three
// cases (known figure, documented range, truly unknown) must read the same in the interface data, the Decision Brief,
// and the HTML, JSON and CSV exports, without any change to the financial calculations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate, brief, briefHtml, briefCsv, gainClassification, gainStatus} from '../lanova/advantage/lab.js';
import {WORKED, EXAMPLES} from '../lanova/advantage/examples.js';

const m = WORKED.make(), r = evaluate(m), b = brief(m, r);
const by = name => r.options.find(o => o.name.startsWith(name));
const PITCH = 'Artificial training pitch', STRIKER = 'Experienced striker', KEEPER = 'Established goalkeeper';

test('classification: known figure, documented range and truly unknown are three different cases', () => {
  assert.deepEqual(gainClassification({monthlyGain: 0}), {status: 'known', label: 'Known financial gain', perMonth: 0, range: null, basis: null, missing: null}, 'a zero gain is a known gain, not missing');
  assert.equal(gainClassification({monthlyGain: 1200}).missing, null);
  const rg = gainClassification({monthlyGain: null, gainRange: {low: 8000, high: 20000, basis: 'Two quotes'}});
  assert.equal(rg.status, 'range'); assert.deepEqual(rg.range, [8000, 20000]); assert.equal(rg.basis, 'Two quotes');
  assert.match(rg.missing, /^financial gain: documented range 8,000 to 20,000 per month \(source: Two quotes\); single figure not known$/); assert.doesNotMatch(rg.missing, /not estimable/);
  assert.equal(gainClassification({monthlyGain: null}).missing, 'financial gain (not estimable)');
  assert.equal(gainClassification({monthlyGain: undefined}).status, 'unknown');
  for (const o of r.options) assert.equal(gainClassification(o.input).status, gainStatus(o.input));
});

test('worked example: the pitch (documented range) is no longer "not estimable"; striker and academy still are', () => {
  assert.equal(by(PITCH).totals.financialStatus, 'range');
  assert.deepEqual(by(PITCH).missing.filter(x => /gain/.test(x)), ['financial gain: documented range 8,000 to 20,000 per month (source: Two written hire enquiries from local clubs (illustrative)); single figure not known']);
  assert.deepEqual(by(STRIKER).missing.filter(x => /gain/.test(x)), ['financial gain (not estimable)']);
  assert.deepEqual(by(KEEPER).missing.filter(x => /gain/.test(x)), [], 'known gain (0): nothing missing');
  for (const o of r.options) {
    const st = o.totals.financialStatus, gm = o.missing.filter(x => /financial gain/.test(x));
    if (st === 'complete') assert.equal(gm.length, 0, o.name); else if (st === 'range') assert.match(gm[0], /documented range/, o.name); else assert.equal(gm[0], 'financial gain (not estimable)', o.name);
  }
});

test('Decision Brief (interface data and JSON): same classification everywhere', () => {
  const pitchLines = b.missingForADecision.filter(x => x.startsWith(PITCH));
  assert.equal(pitchLines.length, 1); assert.match(pitchLines[0], /documented range 8,000 to 20,000 per month/); assert.doesNotMatch(pitchLines[0], /not estimable/);
  assert.ok(b.missingForADecision.some(x => x.startsWith(STRIKER) && /not estimable/.test(x)));
  const json = JSON.parse(JSON.stringify(b)), jp = json.options.find(o => o.name.startsWith(PITCH));
  assert.deepEqual(jp.financialGain, {status: 'range', label: 'Documented financial gain range', perMonth: null, range: [8000, 20000], basis: 'Two written hire enquiries from local clubs (illustrative)'});
  assert.equal(jp.financialStatus, 'range'); assert.ok(!jp.missingData.some(x => /not estimable/.test(x)));
  assert.equal(json.options.find(o => o.name.startsWith(STRIKER)).financialGain.status, 'unknown');
  assert.equal(json.options.find(o => o.name.startsWith(KEEPER)).financialGain.status, 'known');
  // The brief's lists of options with unknown gains are unchanged: the pitch is a range, not an unknown gain.
  assert.ok(!json.financialComparison.optionsWithUnknownGain.some(n => n.startsWith(PITCH))); assert.ok(json.financialComparison.optionsWithGainRange.some(n => n.startsWith(PITCH)));
});

test('HTML and CSV exports: the pitch reads as a documented range, never as not estimable', () => {
  const html = briefHtml(m, r, '2026-11-24');
  assert.ok(!new RegExp(`${PITCH}[^<]*: financial gain \\(not estimable\\)`).test(html), 'no "not estimable" for the pitch');
  assert.match(html, new RegExp(`${PITCH}[^<]*: financial gain: documented range 8,000 to 20,000 per month`));
  const rows = briefCsv(m, r).split('\r\n'), head = rows.find(l => l.startsWith('"Option"')).split(','), col = head.indexOf('"Missing data"');
  assert.ok(col > 0, 'CSV has a Missing data column');
  const pitch = rows.find(l => l.startsWith(`"${PITCH}`)); assert.match(pitch, /documented range 8,000 to 20,000 per month/); assert.doesNotMatch(pitch, /financial gain \(not estimable\)/);
  assert.match(rows.find(l => l.startsWith(`"${STRIKER}`)), /financial gain \(not estimable\)/);
});

test('no change to the financial calculations: the range is still used prudently (low end for cash) and still bounds the ranking', () => {
  // The correction changes wording only. The before/after comparison of every number on all examples is in
  // scripts/compare-advantage-baseline.mjs (27 cases) and the reconciliation tests; here, the range keeps its role.
  assert.match(by(PITCH).warnings.join(' '), /Cash uses the low end of its documented gain range \(8,000 to 20,000 per month/);
  assert.ok(Object.values(r.strategies).some(s => s.missingUsed.some(x => x.startsWith(PITCH) && /within its documented range/.test(x)) || s.assumptionsNeeded.some(x => x.startsWith(PITCH))));
  assert.ok(!r.financial.optionsWithUnknownGain.some(n => n.startsWith(PITCH)) && r.financial.optionsWithGainRange.some(n => n.startsWith(PITCH)));
  for (const k of Object.keys(EXAMPLES)) assert.deepEqual(evaluate(EXAMPLES[k].make()).problems, []);
});

test('header: the Advantage Lab reads V1, not V0.1', () => {
  const html = readFileSync('lanova/advantage/index.html', 'utf8');
  assert.match(html, /ADVANTAGE LAB · V1<\/small>/); assert.doesNotMatch(html, /V0\.1/);
});
