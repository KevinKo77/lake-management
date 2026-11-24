/**
 * Deterministic build of a LANOVA Player Intelligence facts dataset from a Football.TXT "full" file and an identity
 * registry. Same inputs → byte-identical output (no clock, no randomness; the source manifest is passed in).
 *
 * Usage (repo root):
 *   node scripts/player-intelligence/build_player_facts.mjs --source FILE --registry FILE --manifest FILE --out FILE [--check]
 * Default (no arguments): the SYNTHETIC demonstration dataset of /lanova/cases/player-intelligence/.
 * Real 2025/26 data: run with --out outside the repository (e.g. /tmp/...) — they are not published while their reuse
 * rights are unestablished (lanova/player-intelligence/SOURCE-RIGHTS.md). The script refuses to write a non-synthetic
 * dataset inside the repository unless the manifest records an accepted rights decision.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, relative} from 'node:path';
import {parseFullTxt} from '../../lanova/player-intelligence/parse.js';
import {buildFacts} from '../../lanova/player-intelligence/facts.js';
import {checkRegistry} from '../../lanova/player-intelligence/identity.js';

const DEMO = 'lanova/cases/player-intelligence/demo-data';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const source = args.source ?? `${DEMO}/demo-league-full.txt`, registryPath = args.registry ?? `${DEMO}/demo-registry.json`;
const manifestPath = args.manifest ?? `${DEMO}/demo-manifest.json`, out = args.out ?? `${DEMO}/demo-facts.json`;
const text = readFileSync(source, 'utf8'), sha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')), registry = JSON.parse(readFileSync(registryPath, 'utf8'));
if (manifest.sha256 !== sha256) { console.error(`source SHA-256 ${sha256} differs from the manifest (${manifest.sha256}): refusing to build`); process.exit(1); }
for (const w of checkRegistry(registry)) console.warn('registry warning:', w);
const insideRepo = !relative(process.cwd(), resolve(out)).startsWith('..');
if (!manifest.synthetic && insideRepo && manifest.rightsDecision !== 'ACCEPTED') {
  console.error(`refusing to write non-synthetic data inside the repository: rights decision is "${manifest.rightsDecision ?? 'none'}" (see lanova/player-intelligence/SOURCE-RIGHTS.md)`); process.exit(2);
}
const parsed = parseFullTxt(text), facts = buildFacts(parsed, registry, {synthetic: Boolean(manifest.synthetic && registry.synthetic), source: {...manifest, sha256}});
const json = JSON.stringify(facts, null, 1) + '\n';
if (args.check) { const same = existsSync(out) && readFileSync(out, 'utf8') === json; console.log(same ? `${out} is reproduced exactly` : `${out} differs`); process.exit(same ? 0 : 1); }
writeFileSync(out, json);
const a = facts.identityAudit, v = facts.validation;
console.log(`${out}: ${v.matches} matches, ${facts.players.length} player-club records (${a.resolved} resolved, ${a.ambiguous} ambiguous, ${a.unresolved} unresolved, ${a.conflict} conflict); ` +
  `totals ${JSON.stringify(v.totals)}; ${v.parseProblems.length} parse problems, ${v.inconsistencies.length} inconsistencies`);
