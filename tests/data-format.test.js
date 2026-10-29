import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto, createHash} from 'node:crypto';
import {validateSnapshot, auditSnapshot, verifyDigest} from '../src/data.js';
import {esc, csv, parseDatedFlows, money, pct} from '../src/format.js';
const text = await readFile(new URL('../data/tennis.json', import.meta.url), 'utf8');
const source = JSON.parse(text), clone = () => structuredClone(source);

test('CC0 data snapshot and manifest reconcile exactly', async () => { const d = validateSnapshot(source, '2026-10-29'), m = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url))); assert.equal(d.athletes.length, 2); assert.equal(createHash('sha256').update(text).digest('hex'), m.sha256); assert.equal((await verifyDigest(text, m.sha256, webcrypto.subtle)).verified, true); });
test('digest mismatches fail closed', async () => { await assert.rejects(verifyDigest(text + ' ', '0'.repeat(64), webcrypto.subtle), /differs/); });
test('missing WebCrypto is explicitly reported rather than claiming verification', async () => { assert.equal((await verifyDigest(text, '0'.repeat(64), null)).verified, false); });
test('snapshot audit exposes old observation dates and missing financial evidence', () => { const audit = auditSnapshot(source, '2026-10-29'); assert.ok(audit.every(a => a.historicalRankAgeDays > 1000)); assert.ok(audit.every(a => a.financialEvidence === 'missing')); assert.ok(audit[1].unreferencedFields.includes('birthDate')); });
test('future snapshot dates, wrong licenses, unsafe links and duplicate ids rejected', () => { for (const change of [d => d.retrievedAt = '2099-01-01', d => d.license = 'unknown', d => d.athletes[0].revisionUrl = 'javascript:alert(1)', d => d.athletes.push(d.athletes[0]), d => d.athletes[0].properties.birthDate = 'wrong', d => d.athletes[0].birthDate = '2020-01-01', d => d.athletes[0].historicalSinglesRanking.asOf = '2099-01-01']) { const d = clone(); change(d); assert.throws(() => validateSnapshot(d, '2026-10-29')); } });
test('financial figures are not mixed into source identity records', () => { for (const a of source.athletes) for (const field of ['revenue', 'irr', 'npv', 'capital', 'injuryRisk', 'predictedReturn']) assert.equal(a[field], undefined); });
test('HTML escaping covers labels and attributes', () => { assert.equal(esc('<img src=x onerror="bad()"> & \'x\''), '&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &#39;x&#39;'); });
test('CSV neutralizes formula strings but preserves numeric negatives and quotes', () => { const result = csv([['=HYPERLINK("x")', ' +cmd', '@test', '-1', -1, 'a,b\nc']]); assert.ok(result.startsWith('\ufeff')); assert.match(result, /'=/); assert.match(result, /' \+cmd/); assert.match(result, /"-1"/); assert.match(result, /a,b\nc/); });
test('dated-flow input accepts decimal commas and rejects expressions and oversized input', () => { assert.deepEqual(parseDatedFlows('2026-01-01 ; -100,5\n2027-01-01 ; 110.25'), {dates: ['2026-01-01', '2027-01-01'], flows: [-100.5, 110.25]}); for (const input of ['2026-01-01 ; =1+1\n2027-01-01 ; 1', 'date;1;2\ndate;3', 'a;Infinity\nb;2', 'x'.repeat(20001)]) assert.throws(() => parseDatedFlows(input)); });
test('null IRR displays as undefined, never as zero return', () => { assert.equal(pct(null), 'Undefined'); assert.equal(money(Infinity), 'Undefined'); });

