// Current-season data readiness (LaLiga 2026/27): the exact missing results, the report reproduced from the data,
// and a completeness gate that refuses incomplete, unlicensed or unverified snapshots (nothing is ever invented).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {missingResults, checkSnapshot, readiness, fixtureId, SNAPSHOT_FIELDS} from '../lanova/cases/readiness.js';

const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), R = JSON.parse(readFileSync('lanova/cases/data/current-season-readiness.json', 'utf8'));
const SRC = JSON.parse(readFileSync('lanova/cases/data/current-season-sources.json', 'utf8'));
const miss = missingResults(D, '2026-11-24');

test('the 61 missing results: matchdays 8–13 (10 each) and one postponed matchday-6 match; identities unique; no result filled in', () => {
  assert.equal(miss.length, 61); assert.equal(new Set(miss.map(m => m.id)).size, 61);
  const by = {}; for (const m of miss) by[m.matchday] = (by[m.matchday] ?? 0) + 1;
  assert.deepEqual(by, {6: 1, 8: 10, 9: 10, 10: 10, 11: 10, 12: 10, 13: 10});
  assert.ok(miss.every(m => m.result === null && m.scheduledDate < '2026-11-24'));
  assert.equal(miss[0].id, fixtureId('2026-27', miss[0].matchday, miss[0].home, miss[0].away));
  // Every club appears in the missing matchdays 8–13 exactly once per matchday.
  for (const md of [8, 9, 10, 11, 12, 13]) assert.equal(new Set(miss.filter(m => m.matchday === md).flatMap(m => [m.home, m.away])).size, 20, `matchday ${md}`);
});

test('the report is reproduced from the data and states BLOCKED DATA with no usable source', () => {
  assert.equal(execFileSync('node', ['scripts/current-season-readiness.mjs', '--check']).toString().trim(), 'lanova/cases/data/current-season-readiness.json is reproduced exactly');
  assert.equal(R.verdict, 'BLOCKED DATA'); assert.equal(R.gate.complete, false); assert.equal(R.resultsMissing, 61); assert.equal(R.resultsAvailable, 69); assert.equal(R.resultsDue, 130);
  assert.deepEqual(R.usableSources, []); assert.equal(R.sources.length, SRC.sources.length);
  assert.ok(R.sources.every(s => s.verdict && s.licence !== undefined && s.coverage), 'each source: licence, coverage, verdict');
  assert.equal(R.dataset.commit, D.source.commit);
});

const good = () => ({provider: 'Example licensed feed', licence: 'Commercial licence #123', licenceUrl: 'https://example.org/licence', permittedUse: {commercial: true}, retrievedAt: '2026-11-24T10:00:00Z',
  sha256: 'a'.repeat(64), verification: 'each result checked against the official LaLiga result page',
  matches: miss.map(m => ({id: m.id, playedOn: m.scheduledDate, hg: 1, ag: 1, verifiedAgainst: 'official result'}))});

test('completeness gate: a snapshot is usable only with licence, timestamp, checksum, identities, playing dates, verification and full coverage', () => {
  // Synthetic snapshot (placeholder scores, used only to exercise the gate; never written to the dataset).
  assert.deepEqual(checkSnapshot(good(), miss), {usable: true, problems: [], covered: 61});
  for (const k of SNAPSHOT_FIELDS) { const s = good(); delete s[k]; assert.equal(checkSnapshot(s, miss).usable, false, k); }
  const partial = good(); partial.matches = partial.matches.slice(0, 60);
  assert.match(checkSnapshot(partial, miss).problems.join(' '), /does not cover 1 of 61 missing results \(partial snapshots are not mixed/);
  const nc = good(); nc.permittedUse = {commercial: false}; assert.match(checkSnapshot(nc, miss).problems.join(' '), /does not permit commercial reuse/);
  const unverified = good(); delete unverified.matches[3].verifiedAgainst; assert.match(checkSnapshot(unverified, miss).problems.join(' '), /not verified/);
  const noDate = good(); delete noDate.matches[0].playedOn; assert.match(checkSnapshot(noDate, miss).problems.join(' '), /incomplete match record/);
  const badSum = good(); badSum.sha256 = 'abc'; assert.match(checkSnapshot(badSum, miss).problems.join(' '), /SHA-256/);
  // With no snapshot the gate stays closed; with a usable one it would open (the verdict depends only on the gate).
  assert.equal(readiness(D, {asOf: '2026-11-24', sources: []}).verdict, 'BLOCKED DATA');
  assert.equal(readiness(D, {asOf: '2026-11-24', sources: [], snapshot: good()}).verdict, 'READY');
});

test('the Forecast Lab reads the readiness report and keeps the current-season restriction', () => {
  const app = readFileSync('lanova/cases/forecast-lab/app.js', 'utf8');
  assert.match(app, /current-season-readiness\.json/); assert.match(app, /data-verdict="\$\{esc\(RD\.verdict\)\}"/); assert.doesNotMatch(app, /replay\(D, '2026-27'/);
});
