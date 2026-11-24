/**
 * Deterministic build of a LANOVA Player Intelligence facts dataset from a Football.TXT "full" file and an identity
 * registry. Same inputs → byte-identical output (no clock, no randomness).
 *
 * Publication is decided by the fail-closed gate (publication_gate.mjs), never by the manifest:
 *   - inside the repository (= the public site) only an output approved by publication-policy.json, built from the exact
 *     approved bytes, is written — today only the fictional demonstration dataset;
 *   - outside the repository the dataset is local and RESTRICTED, labelled so, and never "synthetic".
 *
 * Usage (repo root):
 *   node scripts/player-intelligence/build_player_facts.mjs [--source FILE --registry FILE --manifest FILE --out FILE] [--check]
 * Default: the fictional demonstration dataset of /lanova/cases/player-intelligence/.
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {parseFullTxt} from '../../lanova/player-intelligence/parse.js';
import {buildFacts} from '../../lanova/player-intelligence/facts.js';
import {checkRegistry} from '../../lanova/player-intelligence/identity.js';
import {loadPolicy, resolveOutput, decide, outputMatches, sha256} from './publication_gate.mjs';

const DEMO = 'lanova/cases/player-intelligence/demo-data';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const source = args.source ?? `${DEMO}/demo-league-full.txt`, registryPath = args.registry ?? `${DEMO}/demo-registry.json`;
const manifestPath = args.manifest ?? `${DEMO}/demo-manifest.json`, out = args.out ?? `${DEMO}/demo-facts.json`;
const fail = (code, msg) => { console.error(msg); process.exit(code); };

const sourceBytes = readFileSync(source), registryBytes = readFileSync(registryPath), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.sha256 !== sha256(sourceBytes)) fail(1, `source SHA-256 ${sha256(sourceBytes)} differs from the manifest (${manifest.sha256}): refusing to build`);
let output, policy;
try { output = resolveOutput(out); policy = loadPolicy(); } catch (e) { fail(2, `publication gate: ${e.message} — refused`); }
const decision = decide({policy, sourceBytes, registryBytes, output});
if (!decision.allowed) fail(2, `publication gate: DENIED — ${decision.reasons.join('; ')}`);

const registry = JSON.parse(registryBytes.toString('utf8'));
for (const w of checkRegistry(registry)) console.warn('registry warning:', w);
// The dataset's labels come from the gate's decision. Manifest fields are carried as information only.
const {synthetic: _s, rightsDecision: _r, note: _n, ...info} = manifest;
const facts = buildFacts(parseFullTxt(sourceBytes.toString('utf8')), registry, {synthetic: decision.synthetic,
  source: {...info, sha256: decision.sourceSha256, publication: decision.scope === 'public' ? `approved: ${decision.approvalId} (publication-policy.json)` : 'RESTRICTED — local only, not for publication'}});
const json = JSON.stringify(facts, null, 1) + '\n';
if (!outputMatches(decision, Buffer.from(json))) fail(3, `publication gate: DENIED — the built output (${sha256(Buffer.from(json)).slice(0, 12)}…) differs from the output pinned by ${decision.approvalId}`);
if (args.check) { const same = existsSync(output.abs) && readFileSync(output.abs, 'utf8') === json; console.log(same ? `${out} is reproduced exactly` : `${out} differs`); process.exit(same ? 0 : 1); }
writeFileSync(output.abs, json);
const a = facts.identityAudit, v = facts.validation;
console.log(`${out} [${decision.scope}${decision.approvalId ? `: ${decision.approvalId}` : ''}]: ${v.matches} matches, ${facts.players.length} player-club records (${a.resolved} resolved, ${a.ambiguous} ambiguous, ${a.unresolved} unresolved, ${a.conflict} conflict); ` +
  `totals ${JSON.stringify(v.totals)}; ${v.parseProblems.length} parse problems, ${v.inconsistencies.length} inconsistencies`);
