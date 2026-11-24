/**
 * Current-season data readiness report (LaLiga 2026/27) → lanova/cases/data/current-season-readiness.json.
 * Deterministic: fixed as-of date, no clock, no network. Usage (repo root): node scripts/current-season-readiness.mjs [--check]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {readiness} from '../lanova/cases/readiness.js';

export const AS_OF = '2026-11-24';
const OUT = 'lanova/cases/data/current-season-readiness.json';
const dataset = JSON.parse(readFileSync('lanova/cases/data/laliga.json', 'utf8')), sources = JSON.parse(readFileSync('lanova/cases/data/current-season-sources.json', 'utf8'));
const report = {...readiness(dataset, {asOf: AS_OF, sources: sources.sources}), sourcesCheckedOn: sources.checkedOn}, text = JSON.stringify(report, null, 1) + '\n';
if (process.argv[2] === '--check') { const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text; console.log(same ? `${OUT} is reproduced exactly` : `${OUT} differs`); process.exit(same ? 0 : 1); }
writeFileSync(OUT, text);
console.log(`${report.verdict}: ${report.resultsMissing} of ${report.resultsDue} results due by ${AS_OF} missing (${JSON.stringify(report.missingByMatchday)}); usable sources: ${report.usableSources.length}`);
