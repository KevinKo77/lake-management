/**
 * Applies LANOVA's existing completeness gate (lanova/cases/readiness.js → checkSnapshot) to the 2026/27 LaLiga results
 * recovered from OpenFootballBase (Wikipedia-derived, CC BY-SA 4.0), against the 61 results missing from the CC0
 * openfootball dataset. Writes lanova/cases/spain-data/results-readiness-2026-27.json. Deterministic; no network.
 * Usage (repo root): node scripts/spain/results-readiness.mjs [--check]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {missingResults, checkSnapshot, fixtureId} from '../../lanova/cases/readiness.js';

const OUT = 'lanova/cases/spain-data/results-readiness-2026-27.json', AS_OF = '2026-11-24';
const D = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), R = JSON.parse(readFileSync('lanova/cases/spain-data/results-laliga-2026-27.cc-by-sa.json', 'utf8'));
const C = JSON.parse(readFileSync('lanova/cases/spain-data/clubs-2026-27.cc-by-sa.json', 'utf8')), rel = JSON.parse(readFileSync('lanova/cases/spain-data/evidence/openfootballbase-release.json', 'utf8'));
// Identity mapping: LANOVA registry id → the openfootball (CC0) spelling used by the readiness fixture ids.
const ofName = Object.fromEntries(C.clubs.map(c => [c.id, D.seasons['2026-27'].matches.flatMap(m => [m[2], m[3]]).find(n => c.lanovaResultNames.includes(n))]));
const missing = missingResults(D, AS_OF);
const matches = R.matches.filter(m => m.status === 'completed').map(m => ({id: fixtureId('2026-27', m.matchday, ofName[m.home], ofName[m.away]), playedOn: m.date, hg: m.score[0], ag: m.score[1],
  verifiedAgainst: m.validation.find(v => v.startsWith('agrees with')) ?? null, registryId: m.id}));
const snapshot = {provider: 'OpenFootballBase-Data (results read from Wikipedia)', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', permittedUse: {commercial: true, conditions: 'attribution; share-alike for the derived dataset'},
  retrievedAt: rel.manifestGeneratedAt, sha256: rel.archiveSha256, verification: 'matchdays 1–7 against openfootball (CC0); Málaga CF results against LANOVA\'s verified line', matches};
const check = checkSnapshot(snapshot, missing), byId = new Map(matches.map(m => [m.id, m]));
const rows = missing.map(m => { const x = byId.get(m.id); return {id: m.id, matchday: m.matchday, scheduledDate: m.scheduledDate, home: m.home, away: m.away, recovered: Boolean(x), score: x ? [x.hg, x.ag] : null, independentlyVerified: Boolean(x?.verifiedAgainst)}; });
const report = {schema: 'lanova-results-readiness-v1', asOf: AS_OF, season: '2026-27', candidate: {provider: snapshot.provider, licence: snapshot.licence, retrievedAt: snapshot.retrievedAt, sha256: snapshot.sha256},
  missingFromOpenfootball: missing.length, recovered: rows.filter(r => r.recovered).length, recoveredAndIndependentlyVerified: rows.filter(r => r.independentlyVerified).length,
  notRecovered: rows.filter(r => !r.recovered).map(r => r.id), gate: {usable: check.usable, problems: [...new Set(check.problems.map(p => p.replace(/: .*$/, '')))].map(p => `${p} (${check.problems.filter(q => q.startsWith(p)).length})`)},
  decision: check.usable ? 'READY' : 'BLOCKED: gate closed — keep the current-season probability restriction', missing: rows};
const text = JSON.stringify(report, null, 1) + '\n';
if (process.argv[2] === '--check') { const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text; console.log(same ? `${OUT} is reproduced exactly` : `${OUT} differs`); process.exit(same ? 0 : 1); }
writeFileSync(OUT, text);
console.log(`${report.recovered}/${report.missingFromOpenfootball} recovered, ${report.recoveredAndIndependentlyVerified} independently verified; gate ${check.usable ? 'open' : 'closed'}: ${report.gate.problems.join('; ')}`);
