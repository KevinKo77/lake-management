// Spain Real Football Data V1 — registry, squads, results and licences. Checks the built files against independent
// evidence (Wikidata participants, openfootball fixtures, promotion/relegation facts, revision dates), the quality
// rules, licence separation and the completeness gate. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const J = f => JSON.parse(readFileSync(`lanova/cases/spain-data/${f}`, 'utf8'));
const C = J('clubs-2026-27.cc-by-sa.json'), S = J('squads-2026-27.cc-by-sa.json'), R = J('results-laliga-2026-27.cc-by-sa.json'), W = J('wikidata-2026-27.cc0.json');
const COV = J('coverage-2026-27.json'), FEAS = J('source-feasibility.json'), RR = J('results-readiness-2026-27.json');
const EV = f => J(`evidence/${f}`), D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), OFF = JSON.parse(readFileSync('lanova/cases/data/official-outcomes.json', 'utf8'));
const byId = Object.fromEntries(C.clubs.map(c => [c.id, c]));

test('registry: 42 distinct clubs (20 LaLiga, 22 Segunda), stable ids, unique Wikidata QIDs, all 2026/27', () => {
  assert.equal(C.clubs.length, 42); assert.equal(new Set(C.clubs.map(c => c.id)).size, 42); assert.equal(new Set(C.clubs.map(c => c.wikidataQid)).size, 42);
  assert.equal(C.clubs.filter(c => c.competition === 'laliga').length, 20); assert.equal(C.clubs.filter(c => c.competition === 'segunda').length, 22);
  for (const c of C.clubs) { assert.match(c.id, /^es-[a-z0-9-]+$/); assert.match(c.wikidataQid, /^Q\d+$/); assert.equal(c.season, '2026-27'); assert.ok(c.verified && c.verification.length >= 2, c.name); assert.ok(c.officialName, c.name); }
});

test('LaLiga 2026/27 = Wikidata P1923 of Q138806502 (CC0) = the 20 clubs of openfootball\'s 2026-27 fixtures', () => {
  const wd = new Set(EV('wikidata-laliga-2026-27-participants.json').P1923), ll = C.clubs.filter(c => c.competition === 'laliga');
  assert.deepEqual(new Set(ll.map(c => c.wikidataQid)), wd);
  const ofNames = new Set(D.seasons['2026-27'].matches.flatMap(m => [m[2], m[3]]));
  assert.equal(ofNames.size, 20); for (const n of ofNames) assert.ok(ll.some(c => c.lanovaResultNames.includes(n)), `openfootball name mapped: ${n}`);
  for (const c of ll) assert.ok(c.lanovaResultNames.some(n => ofNames.has(n)), `${c.name} maps to a LANOVA result name`);
});

test('Segunda 2026/27 = 15 remaining + 3 relegated from LaLiga 2025/26 (official) + 4 promoted; no club of a previous season mixed in', () => {
  const sd = C.clubs.filter(c => c.competition === 'segunda').map(c => c.name), v = EV('segunda-2026-27-verification.json');
  assert.deepEqual(new Set(Object.keys(v.clubs)), new Set(sd));
  const rel = OFF.seasons['2025-26'].relegated; for (const r of ['Girona FC', 'RCD Mallorca', 'Real Oviedo']) { assert.ok(rel.includes(r)); assert.ok(sd.includes(r), r); }
  for (const x of v.relegatedFromSegunda2025_26) assert.ok(!sd.includes(x), `${x} not in 2026/27`);
  for (const x of v.promotedToLaLiga) { assert.ok(!sd.includes(x)); assert.ok(C.clubs.some(c => c.name === x && c.competition === 'laliga'), x); }
  assert.equal(Object.values(v.clubs).filter(x => x.startsWith('promoted')).length, 4); assert.equal(Object.values(v.clubs).filter(x => x.startsWith('relegated')).length, 3);
});

test('squads: every listing has a registry club, a traceable dated source, a quality level with reasons; nothing invented', () => {
  const revs = EV('wikipedia-revisions.json').revisions;
  assert.equal(S.players.length, 1140); assert.equal(S.licence, 'CC BY-SA 4.0');
  for (const p of S.players) {
    assert.ok(byId[p.club], p.name); assert.equal(p.season, '2026-27');
    assert.match(p.source.url, /^https:\/\/(en|es|it|fr)\.wikipedia\.org\/w\/index\.php\?oldid=\d+$/); assert.equal(p.source.revisionDate, revs[String(p.source.revid)].timestamp);
    assert.ok(['VERIFIED', 'INFERRED', 'UNVERIFIED'].includes(p.quality)); assert.ok(p.qualityReasons.length >= 1);
    assert.ok(p.position === null || ['GK', 'DF', 'MF', 'FW'].includes(p.position)); assert.ok(p.shirtNumber === null || Number.isInteger(p.shirtNumber));
    assert.ok(p.id === p.wikidataQid || (p.wikidataQid === null && /^lanova-[0-9a-f]{12}$/.test(p.id)));
    for (const k of ['value', 'marketValue', 'wage', 'salary', 'rating', 'contribution', 'probability']) assert.ok(!(k in p), `no ${k}`);
  }
  // Quality rules
  for (const p of S.players) {
    const dup = p.qualityReasons.some(r => r.startsWith('listed in two clubs')), late = p.source.revisionDate >= '2026-09-02';
    if (p.quality === 'VERIFIED') { assert.ok(late && !dup && p.stint !== 'left_mid' && p.wikidataMembership !== 'ended', p.name); }
    if (p.quality === 'INFERRED') assert.ok(!late, p.name);
    if (dup || p.stint === 'left_mid' || p.wikidataMembership === 'ended') assert.equal(p.quality, 'UNVERIFIED', p.name);
  }
  // Duplicate identities across clubs are flagged on both sides.
  const qc = {}; for (const p of S.players) if (p.wikidataQid) (qc[p.wikidataQid] ??= new Set()).add(p.club);
  for (const [q, cs] of Object.entries(qc)) if (cs.size > 1) for (const p of S.players.filter(x => x.wikidataQid === q)) assert.equal(p.quality, 'UNVERIFIED');
});

test('Málaga CF: 28 sourced players, numbers 1–39, one dated revision, verified listing, loans marked (5 on loan in)', () => {
  const m = S.players.filter(p => p.club === 'es-malaga-cf');
  assert.equal(m.length, 28); assert.equal(new Set(m.map(p => p.shirtNumber)).size, 28); assert.ok(m.every(p => p.source.revid === 1384338452 && p.source.revisionDate.startsWith('2026-11-07')));
  assert.ok(m.every(p => p.quality === 'VERIFIED')); assert.deepEqual(m.filter(p => p.loan).map(p => p.name).sort(), ['Adam Aznou', 'Carlos Dotor', 'Jens Cajuste', 'José Salinas', 'Juan Cruz']); assert.ok(m.some(p => p.name === 'Alfonso Herrero' && p.position === 'GK' && p.shirtNumber === 1));
  assert.deepEqual(Object.fromEntries(['GK', 'DF', 'MF', 'FW'].map(k => [k, m.filter(p => p.position === k).length])), {GK: 2, DF: 10, MF: 13, FW: 3});
});

test('licence separation: the CC0 file holds Wikidata facts only; no ODbL data anywhere; attribution present', () => {
  assert.equal(W.licence, 'CC0 1.0'); assert.ok(W.attribution.every(a => /Wikidata/.test(a) && !/Wikipedia contributors/.test(a)));
  for (const x of Object.values(W.players)) assert.deepEqual(Object.keys(x).sort(), ['P54', 'dateOfBirth', 'label', 'lastrevid']);
  for (const f of [C, S, R]) { assert.equal(f.licence, 'CC BY-SA 4.0'); assert.match(f.attribution[0], /Wikipedia/); }
  const all = JSON.stringify([C, S, R, W]); assert.doesNotMatch(all, /openligadb/i, 'no OpenLigaDB (ODbL) data incorporated');
  assert.equal(FEAS.sources.find(s => s.id === 'C').decision, 'REJECT');
});

test('results: 380 fixtures; matchdays 1–7 agree with openfootball on 69/69; Málaga line equals LANOVA\'s verified line; exact missing results; gate closed', () => {
  assert.equal(R.matches.length, 380); assert.equal(new Set(R.matches.map(m => m.id)).size, 380);
  assert.equal(R.completeness.agreeWithOpenfootball, 69); assert.deepEqual(R.completeness.conflicts, []);
  assert.deepEqual(R.completeness.missing, ['2026-27/md08/es-rayo-vallecano-v-es-athletic-bilbao', '2026-27/md13/es-levante-ud-v-es-elche-cf']);
  assert.equal(R.completeness.due, 130); assert.equal(R.completeness.completed, 128); assert.equal(R.completeness.gate, 'closed');
  const mal = R.matches.filter(m => m.status === 'completed' && (m.home === 'es-malaga-cf' || m.away === 'es-malaga-cf')), line = EV('malaga-verified-line.json').aggregateAfterMatchday13;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0; for (const m of mal) { const f = m.home === 'es-malaga-cf' ? m.score[0] : m.score[1], g = m.home === 'es-malaga-cf' ? m.score[1] : m.score[0]; gf += f; ga += g; f > g ? w++ : f === g ? d++ : l++; }
  assert.deepEqual({played: mal.length, won: w, drawn: d, lost: l, goalsFor: gf, goalsAgainst: ga, points: 3 * w + d}, line);
  assert.ok(R.matches.every(m => m.status !== 'completed' || m.score.every(Number.isInteger)));
  assert.ok(R.matches.filter(m => m.date >= '2026-11-24').every(m => m.status === 'scheduled' && m.score === null), 'no future result');
});

test('readiness: the existing gate refuses the recovered results (single-sourced, 2 missing); reproduced from the files', () => {
  assert.equal(execFileSync('node', ['scripts/spain/results-readiness.mjs', '--check']).toString().trim(), 'lanova/cases/spain-data/results-readiness-2026-27.json is reproduced exactly');
  assert.equal(RR.missingFromOpenfootball, 61); assert.equal(RR.recovered, 59); assert.equal(RR.gate.usable, false); assert.match(RR.decision, /^BLOCKED/);
  assert.equal(RR.notRecovered.length, 2);
});

test('coverage report: counts add up to the squad file, by club and division; incomplete squads flagged', () => {
  for (const x of COV.clubs) { const ps = S.players.filter(p => p.club === x.club); assert.equal(x.players, ps.length); assert.equal(x.verified + x.inferred + x.unverified, ps.length); assert.equal(x.status === 'incomplete or needs review', x.flags.length > 0); }
  for (const d of ['laliga', 'segunda']) assert.equal(COV.divisions[d].players, COV.clubs.filter(x => x.competition === d).reduce((s, x) => s + x.players, 0));
  assert.ok(COV.clubs.find(x => x.club === 'es-real-sociedad-b').flags.some(f => /before the summer window/.test(f)));
  assert.ok(COV.clubs.find(x => x.club === 'es-levante-ud').flags.length >= 1);
  assert.equal(COV.wikidata.checked, W.checked); assert.equal(COV.wikidata.playersWithQid, W.playersWithQid);
});
