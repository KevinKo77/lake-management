/**
 * Player Intelligence publication gate — FAIL CLOSED.
 *
 * The whole repository is the public site (GitHub Pages), so any file inside it is a public output.
 * A dataset may be written to a public path only when ALL of the following hold; anything else is denied:
 *   1. the reviewed policy (lanova/player-intelligence/publication-policy.json) has an approval for that exact output path;
 *   2. the source and registry BYTES have the SHA-256 the approval pins (a substituted source fails);
 *   3. the source is not on the policy's blocked list;
 *   4. for kind "fictional-fixture": the bytes are exactly what scripts/player-intelligence/make_demo_fixture.mjs generates
 *      (fictional status is proven by regeneration, never read from a label);
 *      for kind "licensed-source": a separate rights-evidence file, pinned by SHA-256, records the licensor, the instrument,
 *      commercial use and redistribution, and an independent review;
 *   5. the approval names who approved it and where it was reviewed;
 *   6. the built output has the SHA-256 the approval pins.
 * Manifest fields (synthetic, rightsDecision, licence…) and the registry's "synthetic" flag are informational only:
 * they never authorise anything. Outputs outside the repository are local and restricted, and are labelled so.
 *
 * Trust boundary: this code, the policy and the CI workflow live in the same repository. Someone who can change them
 * without review can change the gate. The protection therefore relies on review controls (CODEOWNERS + branch protection
 * with required code-owner review and required CI) — see lanova/player-intelligence/PUBLICATION-POLICY.md.
 */
import {readFileSync, existsSync, realpathSync, lstatSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, basename, join, relative, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEMO_FIXTURE} from './make_demo_fixture.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const POLICY_PATH = 'lanova/player-intelligence/publication-policy.json';
export const RIGHTS_DIR = 'lanova/player-intelligence/rights/';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const HEX = /^[0-9a-f]{64}$/;
const posix = p => p.split(sep).join('/');

/** Load and validate the policy. Any structural doubt throws: no policy, no publication. */
export function loadPolicy(root = ROOT) {
  const p = JSON.parse(readFileSync(join(root, POLICY_PATH), 'utf8'));
  if (p.schema !== 'lanova-pi-publication-policy-v1' || p.defaultDecision !== 'DENY' || !Array.isArray(p.approvals) || !Array.isArray(p.blocked)) throw new Error('publication policy: invalid structure');
  for (const a of p.approvals) {
    for (const k of ['id', 'kind', 'sourcePath', 'sourceSha256', 'registryPath', 'registrySha256', 'outputPath', 'outputSha256']) if (!a[k]) throw new Error(`publication policy: approval ${a.id ?? '?'} lacks ${k}`);
    for (const k of ['sourceSha256', 'registrySha256', 'outputSha256']) if (!HEX.test(a[k])) throw new Error(`publication policy: approval ${a.id}: ${k} is not a SHA-256`);
  }
  for (const b of p.blocked) if (!HEX.test(b.sourceSha256 ?? '')) throw new Error('publication policy: blocked entry without a SHA-256');
  return p;
}

/**
 * Where would this output land? Follows symbolic links of the parent directory; refuses a symbolic link as the target
 * and a parent that does not exist (fail closed). isPublic is true for any location inside the repository.
 */
export function resolveOutput(out, root = ROOT) {
  const abs = resolve(out), parent = dirname(abs);
  if (!existsSync(parent)) throw new Error(`output directory does not exist: ${parent}`);
  const target = join(realpathSync(parent), basename(abs)), realRoot = realpathSync(root);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error('output is a symbolic link: refused');
  const isPublic = target === realRoot || target.startsWith(realRoot + sep);
  return {abs: target, isPublic, rel: isPublic ? posix(relative(realRoot, target)) : null};
}

const deny = (reason, extra = {}) => ({allowed: false, reasons: [reason], ...extra});

/** The publication decision. Inputs are bytes and the resolved output; manifests are not an input. */
export function decide({policy, sourceBytes, registryBytes, output, root = ROOT}) {
  const srcSha = sha256(sourceBytes), regSha = sha256(registryBytes);
  const blocked = policy.blocked.find(b => b.sourceSha256 === srcSha);
  if (!output.isPublic) return {allowed: true, scope: 'restricted-local', synthetic: false, approvalId: null, sourceSha256: srcSha, blocked: Boolean(blocked),
    reasons: ['output outside the repository: local, restricted, not for publication']};
  if (blocked) return deny(`source ${srcSha.slice(0, 12)}… is blocked by the policy (${blocked.id}): ${blocked.reason}`);
  const a = policy.approvals.find(x => x.outputPath === output.rel);
  if (!a) return deny(`no approval in the policy for the public output ${output.rel}`);
  if (a.sourceSha256 !== srcSha) return deny(`source bytes (${srcSha.slice(0, 12)}…) differ from the approved source of ${a.id}: substitution refused`);
  if (a.registrySha256 !== regSha) return deny(`registry bytes (${regSha.slice(0, 12)}…) differ from the approved registry of ${a.id}: substitution refused`);
  if (!a.approval?.approvedBy || !a.approval?.reviewRef) return deny(`approval ${a.id} does not record who approved it and where it was reviewed`);
  if (a.kind === 'fictional-fixture') {
    if (!a.generatorPath || !HEX.test(a.generatorSha256 ?? '') || !existsSync(join(root, a.generatorPath)) || sha256(readFileSync(join(root, a.generatorPath))) !== a.generatorSha256) return deny(`${a.id}: the fixture generator is missing or differs from the reviewed generator`);
    const gs = DEMO_FIXTURE[a.sourcePath], gr = DEMO_FIXTURE[a.registryPath];
    if (gs === undefined || gr === undefined || sha256(gs) !== srcSha || sha256(gr) !== regSha) return deny(`${a.id}: the bytes are not those the fictional-fixture generator produces — a "synthetic" label cannot stand in for that`);
  } else if (a.kind === 'licensed-source') {
    const ev = a.rightsEvidence;
    if (!ev?.path?.startsWith(RIGHTS_DIR) || !HEX.test(ev.sha256 ?? '') || !existsSync(join(root, ev.path))) return deny(`${a.id}: no rights-evidence file under ${RIGHTS_DIR}`);
    const bytes = readFileSync(join(root, ev.path));
    if (sha256(bytes) !== ev.sha256) return deny(`${a.id}: the rights-evidence file changed after review`);
    let doc; try { doc = JSON.parse(bytes); } catch { return deny(`${a.id}: rights evidence is not valid JSON`); }
    const missing = ['licensor', 'instrument', 'reviewedBy', 'reviewedOn'].filter(k => !doc[k]);
    if (missing.length || doc.commercialUse !== true || doc.redistribution !== true || doc.sourceSha256 !== srcSha) return deny(`${a.id}: rights evidence incomplete (${[...missing, doc.commercialUse !== true && 'commercialUse', doc.redistribution !== true && 'redistribution', doc.sourceSha256 !== srcSha && 'sourceSha256'].filter(Boolean).join(', ')})`);
  } else return deny(`${a.id}: unknown approval kind ${a.kind}`);
  return {allowed: true, scope: 'public', synthetic: a.kind === 'fictional-fixture', approvalId: a.id, expectedOutputSha256: a.outputSha256, sourceSha256: srcSha, reasons: [`approved by ${a.id}`]};
}

/** Output bytes must equal what the approval pins. */
export const outputMatches = (decision, bytes) => decision.scope !== 'public' || sha256(bytes) === decision.expectedOutputSha256;

/**
 * Scan what the repository publishes (git-tracked files, or every file when not a git checkout) for Player Intelligence
 * datasets, identity registries, decision contexts and Football.TXT "full" match files. Each one must be an approved
 * artifact at its approved path with its approved bytes; files matching a blocked source are always violations.
 */
export function scanPublicTree(root = ROOT, policy = loadPolicy(root), files = null) {
  const list = files ?? (() => {
    try { return execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean); }
    catch { const out = []; const walk = d => { for (const f of readdirSync(join(root, d))) { if (['.git', 'node_modules'].includes(f)) continue; const p = d ? `${d}/${f}` : f; statSync(join(root, p)).isDirectory() ? walk(p) : out.push(p); } }; walk(''); return out; }
  })();
  const approved = new Map(policy.approvals.flatMap(a => [[a.sourcePath, a.sourceSha256], [a.registryPath, a.registrySha256], [a.outputPath, a.outputSha256], ...(a.generatorPath ? [[a.generatorPath, a.generatorSha256]] : [])]));
  const blocked = new Set(policy.blocked.map(b => b.sourceSha256)), violations = [], found = [];
  for (const f of list) {
    const p = join(root, f); if (!existsSync(p) || statSync(p).size > 50e6) continue;
    const bytes = readFileSync(p), h = sha256(bytes), text = bytes.toString('utf8');
    let kind = blocked.has(h) ? 'blocked source' : null;
    if (!kind && f.endsWith('.json')) { try { const s = JSON.parse(text)?.schema; if (typeof s === 'string' && /^lanova-player-(facts|registry|context)/.test(s)) kind = s; } catch { /* not JSON */ } }
    if (!kind && /\n(▪|Refs:)/.test(text) && (text.match(/^\S[^\n:]{1,60}: \S[^\n]* - \S[^\n]*,/gm) ?? []).length >= 2) kind = 'Football.TXT full match file';
    if (!kind) continue;
    found.push({file: f, kind});
    if (kind === 'blocked source' || approved.get(f) !== h) violations.push({file: f, kind, reason: kind === 'blocked source' ? 'blocked source' : approved.has(f) ? 'bytes differ from the approved artifact' : 'not an approved artifact'});
  }
  return {found, violations};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {found, violations} = scanPublicTree();
  for (const f of found) console.log(violations.some(v => v.file === f.file) ? 'VIOLATION' : 'approved ', f.file, `(${f.kind})`);
  if (violations.length) { console.error(`FAIL publication gate: ${violations.length} unapproved Player Intelligence artifact(s) in the published tree`); process.exit(1); }
  console.log(`PASS publication gate: ${found.length} Player Intelligence artifact(s), all approved`);
}
