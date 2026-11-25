// Player Intelligence publication gate — adversarial tests. Every attempt to publish a dataset that is not the reviewed,
// approved fictional fixture must fail, whatever the manifest, labels or output path say. Nothing is written in the repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, existsSync, copyFileSync, openSync, ftruncateSync, closeSync, cpSync, lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadPolicy, resolveOutput, decide, scanPublicTree, sha256, safeWrite, ROOT, MAX_INSPECT_BYTES} from '../scripts/player-intelligence/publication_gate.mjs';

const DIR = 'lanova/cases/player-intelligence/demo-data', OUT = `${DIR}/demo-facts.json`;
const SRC = readFileSync(`${DIR}/demo-league-full.txt`), REG = readFileSync(`${DIR}/demo-registry.json`), MAN = JSON.parse(readFileSync(`${DIR}/demo-manifest.json`, 'utf8'));
const APPROVED_OUT = readFileSync(OUT);
const policy = loadPolicy();
const tmp = () => mkdtempSync(join(tmpdir(), 'pi-gate-'));
const build = (...args) => spawnSync('node', ['scripts/player-intelligence/build_player_facts.mjs', ...args], {encoding: 'utf8'});
/** A source that is NOT the approved fixture (one fictional name changed), with a manifest claiming every right. */
function forged(dir, {source = SRC.toString().replace('Kilian Drumvel', 'Kilian Drumvelo'), registry = REG, manifest = {}} = {}) {
  const s = join(dir, 'source.txt'), r = join(dir, 'registry.json'), m = join(dir, 'manifest.json');
  writeFileSync(s, source); writeFileSync(r, registry);
  writeFileSync(m, JSON.stringify({...MAN, synthetic: true, rightsDecision: 'ACCEPTED', licence: 'CC0', commercialUse: true, ...manifest, sha256: sha256(Buffer.from(source))}));
  return ['--source', s, '--registry', r, '--manifest', m];
}
const untouched = () => { assert.equal(sha256(readFileSync(OUT)), sha256(APPROVED_OUT), 'the approved dataset was not modified'); };

test('approved fictional demonstration build PASSES and rebuilds byte for byte; the gate derives "synthetic" from the policy', () => {
  const r = build('--check'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /reproduced exactly/);
  const d = decide({policy, sourceBytes: SRC, registryBytes: REG, output: resolveOutput(OUT)});
  assert.deepEqual([d.allowed, d.scope, d.synthetic, d.approvalId], [true, 'public', true, 'demo-fixture-v1']);
  assert.equal(sha256(APPROVED_OUT), d.expectedOutputSha256);
  assert.match(JSON.parse(APPROVED_OUT).source.publication, /^approved: demo-fixture-v1/);
});

test('manifest-only bypass FAILS: rightsDecision "ACCEPTED" (and any other claim) cannot publish an unapproved source', () => {
  const dir = tmp(), args = forged(dir);
  for (const out of [OUT, `${DIR}/forged.json`, 'lanova/forged.json', 'forged.json']) {
    const r = build(...args, '--out', out);
    assert.equal(r.status, 2, `${out}: ${r.stdout}`); assert.match(r.stderr, /publication gate: DENIED/);
    if (out !== OUT) assert.ok(!existsSync(out), `${out} must not be written`);
  }
  untouched();
});

test('synthetic-label bypass FAILS: "synthetic: true" in manifest and registry does not make a source the approved fixture', () => {
  const dir = tmp(), reg = JSON.parse(REG); reg.synthetic = true; reg.notice = 'FICTIONAL'; reg.players[0].aliases.push({name: 'Extra', source: 'synthetic'});
  const r = build(...forged(dir, {registry: JSON.stringify(reg), manifest: {synthetic: true, description: 'LANOVA synthetic demonstration league (fictional)'}}), '--out', OUT);
  assert.equal(r.status, 2); assert.match(r.stderr, /DENIED .*substitution refused/);
  // Conversely, flipping the labels of the APPROVED fixture changes nothing: labels are not an input of the decision.
  const m = join(dir, 'labels.json'); writeFileSync(m, JSON.stringify({...MAN, synthetic: false, rightsDecision: 'BLOCKED'}));
  const ok = build('--manifest', m, '--check'); assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /reproduced exactly/);
  untouched();
});

test('unapproved real-source publication FAILS: a real-format source, the blocked source hash, or a substituted registry are refused', () => {
  const dir = tmp();
  // A real-looking file (different clubs and players, real format) with every claim of rights.
  const real = SRC.toString().replace(/Synthetic Demo League 2025\/26 \(FICTIONAL — LANOVA demonstration data\)/, 'Spain | Primera División 2025/26').replace(/Altamar CF/g, 'Real Club X');
  const r1 = build(...forged(dir, {source: real}), '--out', OUT); assert.equal(r1.status, 2); assert.match(r1.stderr, /DENIED/);
  // The blocked source is refused even if someone adds an approval for it (blocked list wins).
  const bogus = Buffer.from('any bytes'), p = structuredClone(policy);
  p.blocked.push({id: 'test-blocked', sourceSha256: sha256(bogus), reason: 'test'}); p.approvals.push({...p.approvals[0], id: 'forged', sourceSha256: sha256(bogus)});
  assert.match(decide({policy: p, sourceBytes: bogus, registryBytes: REG, output: resolveOutput(OUT)}).reasons[0], /blocked by the policy/);
  // Approved source, substituted registry.
  const reg = JSON.parse(REG); reg.players.find(x => x.id === 'SYN-B10').aliases.push({name: 'Kilian Drumvel', source: 'x'});
  const d = decide({policy, sourceBytes: SRC, registryBytes: Buffer.from(JSON.stringify(reg, null, 1) + '\n'), output: resolveOutput(OUT)});
  assert.equal(d.allowed, false); assert.match(d.reasons[0], /registry bytes .* substitution refused/);
  untouched();
});

test('output-path manipulation FAILS: traversal, absolute paths, symbolic links and missing directories', () => {
  const dir = tmp(), args = forged(dir);
  const traversal = [join(tmpdir(), '..', ...resolve(ROOT).split('/').slice(1), 'lanova', 'evil.json'), `lanova/cases/../cases/player-intelligence/demo-data/./demo-facts.json`, resolve(ROOT, OUT)];
  for (const out of traversal) { const r = build(...args, '--out', out); assert.equal(r.status, 2, out); assert.match(r.stderr, /DENIED/); }
  // A directory symlink outside the repository that points into it is still the repository.
  const link = join(dir, 'link'); symlinkSync(resolve(ROOT, DIR), link);
  assert.equal(resolveOutput(join(link, 'x.json')).isPublic, true);
  const r2 = build(...args, '--out', join(link, 'evil.json')); assert.equal(r2.status, 2); assert.ok(!existsSync(resolve(ROOT, DIR, 'evil.json')));
  // A file symlink as the target is refused outright, wherever it points.
  const fl = join(dir, 'file-link.json'); symlinkSync(resolve(ROOT, OUT), fl);
  const r3 = build('--out', fl); assert.equal(r3.status, 2); assert.match(r3.stderr, /symbolic link/);
  const r4 = build(...args, '--out', join(dir, 'no-such-dir', 'x.json')); assert.equal(r4.status, 2); assert.match(r4.stderr, /does not exist/);
  untouched();
});

test('outside the repository an unapproved source is built only as RESTRICTED local data, never labelled synthetic', () => {
  const dir = tmp(), out = join(dir, 'facts.json'), r = build(...forged(dir), '--out', out);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /restricted-local/);
  const f = JSON.parse(readFileSync(out, 'utf8')); assert.equal(f.synthetic, false); assert.match(f.source.publication, /^RESTRICTED/);
  assert.ok(!('rightsDecision' in f.source) && !('synthetic' in f.source), 'manifest claims are not carried as decisions');
});

test('an approved source whose output differs from the pinned output is refused (exit 3)', () => {
  const dir = tmp(), m = join(dir, 'm.json'); writeFileSync(m, JSON.stringify({...MAN, description: 'changed description'}));
  const r = build('--manifest', m, '--check'); assert.equal(r.status, 3); assert.match(r.stderr, /differs from the output pinned by demo-fixture-v1/);
  untouched();
});

test('fictional status is proven by regeneration with the reviewed generator, and licensed sources need separate, pinned rights evidence', () => {
  const out = resolveOutput(OUT);
  // An approval claiming "fictional-fixture" for bytes the generator does not produce is refused.
  const other = Buffer.from(SRC.toString().replace('Kilian', 'Kylian')), p1 = structuredClone(policy); p1.approvals[0].sourceSha256 = sha256(other);
  assert.match(decide({policy: p1, sourceBytes: other, registryBytes: REG, output: out}).reasons[0], /not those the fictional-fixture generator produces/);
  const p2 = structuredClone(policy); p2.approvals[0].generatorSha256 = 'f'.repeat(64);
  assert.match(decide({policy: p2, sourceBytes: SRC, registryBytes: REG, output: out}).reasons[0], /generator is missing or differs/);
  const p3 = structuredClone(policy); delete p3.approvals[0].approval.approvedBy;
  assert.match(decide({policy: p3, sourceBytes: SRC, registryBytes: REG, output: out}).reasons[0], /who approved it/);
  // Licensed source: evidence must exist under rights/, be pinned, complete and name this exact source.
  const root = tmp(); mkdirSync(join(root, 'lanova/player-intelligence/rights'), {recursive: true});
  const src = Buffer.from('licensed bytes'), lic = structuredClone(policy.approvals[0]);
  Object.assign(lic, {id: 'lic', kind: 'licensed-source', sourceSha256: sha256(src), outputPath: 'lanova/lic.json'});
  const pol = {...policy, approvals: [lic]}, o = {isPublic: true, rel: 'lanova/lic.json'};
  assert.match(decide({policy: pol, sourceBytes: src, registryBytes: REG, output: o, root}).reasons[0], /no rights-evidence file/);
  const ev = {licensor: 'Owner', instrument: 'written licence', commercialUse: true, redistribution: false, reviewedBy: 'founder', reviewedOn: '2026-11-25', sourceSha256: sha256(src)};
  const evPath = 'lanova/player-intelligence/rights/lic.json'; writeFileSync(join(root, evPath), JSON.stringify(ev));
  lic.rightsEvidence = {path: evPath, sha256: sha256(readFileSync(join(root, evPath)))};
  assert.match(decide({policy: pol, sourceBytes: src, registryBytes: REG, output: o, root}).reasons[0], /rights evidence incomplete \(redistribution\)/);
  writeFileSync(join(root, evPath), JSON.stringify({...ev, redistribution: true}));
  assert.match(decide({policy: pol, sourceBytes: src, registryBytes: REG, output: o, root}).reasons[0], /changed after review/);
  lic.rightsEvidence.sha256 = sha256(readFileSync(join(root, evPath)));
  assert.equal(decide({policy: pol, sourceBytes: src, registryBytes: REG, output: o, root}).allowed, true, 'complete, pinned, reviewed evidence is the only way in');
  // A policy that is not deny-by-default is rejected.
  const bad = tmp(); mkdirSync(join(bad, 'lanova/player-intelligence'), {recursive: true});
  writeFileSync(join(bad, 'lanova/player-intelligence/publication-policy.json'), JSON.stringify({...policy, defaultDecision: 'ALLOW'}));
  assert.throws(() => loadPolicy(bad), /invalid structure/);
});

test('published-tree scan: the repository holds only approved Player Intelligence artifacts; smuggled copies are caught', () => {
  const real = scanPublicTree(); assert.deepEqual(real.violations, []); assert.ok(real.found.length >= 4);
  const root = tmp(), files = [];
  const put = (f, bytes) => { mkdirSync(join(root, f, '..'), {recursive: true}); writeFileSync(join(root, f), bytes); if (!files.includes(f)) files.push(f); };
  for (const a of policy.approvals) for (const [p] of [[a.sourcePath], [a.registryPath], [a.outputPath], [a.generatorPath]]) put(p, readFileSync(p));
  assert.deepEqual(scanPublicTree(root, policy, files).violations, [], 'approved artifacts at approved paths');
  put('lanova/cases/other/facts-copy.json', APPROVED_OUT);                                                              // copy at another path
  put('assets/data.json', JSON.stringify({schema: 'lanova-player-registry-v1', players: []}));                         // a registry
  put('docs/liga.txt', SRC.toString().replace('Kilian', 'Kylian'));                                                     // real-format match file
  put(policy.approvals[0].outputPath, Buffer.concat([APPROVED_OUT, Buffer.from(' ')]));                                 // tampered approved file
  const v = scanPublicTree(root, policy, files).violations.map(x => [x.file, x.reason]).sort();
  assert.deepEqual(v, [['assets/data.json', 'not an approved artifact'], ['docs/liga.txt', 'not an approved artifact'], ['lanova/cases/other/facts-copy.json', 'not an approved artifact'], [policy.approvals[0].outputPath, 'bytes differ from the approved artifact']]);
  const p = structuredClone(policy), blob = Buffer.from('blocked bytes'); p.blocked.push({id: 'x', sourceSha256: sha256(blob), reason: 'test'}); put('misc/blob.bin', blob);
  assert.ok(scanPublicTree(root, p, files).violations.some(x => x.file === 'misc/blob.bin' && x.reason === 'blocked source'));
  // The command-line scan passes on the real repository (it is run in CI).
  const r = spawnSync('node', ['scripts/player-intelligence/publication_gate.mjs'], {encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /PASS publication gate/);
});

test('P1-A: dangling symbolic links are refused — nothing is created or overwritten outside or inside the repository', () => {
  const dir = tmp(), args = forged(dir), outside = join(tmp(), 'victim.json'), inside = resolve(ROOT, 'lanova', `pi-dangling-${process.pid}.json`);
  // Dangling link (target does not exist) pointing OUTSIDE the repository, with an unapproved and with the approved source.
  const l1 = join(dir, 'dangling-out.json'); symlinkSync(outside, l1);
  for (const a of [args, []]) { const r = build(...a, '--out', l1); assert.equal(r.status, 2, r.stdout); assert.match(r.stderr, /symbolic link \(dangling or not\)/); }
  assert.ok(!existsSync(outside), 'no external file created through the dangling link'); assert.ok(lstatSync(l1).isSymbolicLink(), 'the link itself is left untouched');
  // Dangling link pointing INTO the repository.
  const l2 = join(dir, 'dangling-in.json'); symlinkSync(inside, l2);
  const r2 = build(...args, '--out', l2); assert.equal(r2.status, 2); assert.ok(!existsSync(inside), 'nothing written into the repository');
  // Link to an EXISTING external file: refused, file not overwritten.
  const victim = join(tmp(), 'existing.json'); writeFileSync(victim, 'original'); const l3 = join(dir, 'to-existing.json'); symlinkSync(victim, l3);
  const r3 = build(...args, '--out', l3); assert.equal(r3.status, 2); assert.equal(readFileSync(victim, 'utf8'), 'original');
  // A directory or other non-file at the target is refused as well.
  mkdirSync(join(dir, 'a-dir.json')); assert.throws(() => resolveOutput(join(dir, 'a-dir.json')), /not a regular file/);
  // A link planted AFTER the check is replaced by rename(), never written through.
  const late = join(dir, 'late.json'), victim2 = join(tmp(), 'late-victim.json'); const o = resolveOutput(late); symlinkSync(victim2, late);
  assert.throws(() => safeWrite(o, 'data'), /changed into a link/); assert.ok(!existsSync(victim2), 'race: no file created through the late link');
  untouched();
});

test('P1-B: oversized tracked files are rejected, not skipped (sparse temporary file, nothing large committed)', () => {
  const root = tmp(), big = 'lanova/cases/big.bin', fd = (mkdirSync(join(root, 'lanova/cases'), {recursive: true}), openSync(join(root, big), 'w'));
  ftruncateSync(fd, MAX_INSPECT_BYTES + 1); closeSync(fd);                                                         // sparse: no real disk use
  const r = scanPublicTree(root, policy, [big]);
  assert.deepEqual(r.violations.map(v => [v.file, v.kind]), [[big, 'oversized file']]); assert.match(r.violations[0].reason, /content not inspected — rejected unless approved by path and SHA-256/);
  assert.deepEqual(r.uninspectable, [big]);
  // Approved by exact path and SHA-256: accepted; same bytes at another path, or the blocked list: rejected.
  const h = sha256(readFileSync(join(root, big))), p = structuredClone(policy); p.approvals.push({...p.approvals[0], id: 'big', outputPath: big, outputSha256: h});
  assert.deepEqual(scanPublicTree(root, p, [big]).violations, []);
  cpSync(join(root, big), join(root, 'lanova/cases/big-copy.bin')); assert.equal(scanPublicTree(root, p, ['lanova/cases/big-copy.bin']).violations[0].kind, 'oversized file');
  const pb = structuredClone(p); pb.blocked.push({id: 'b', sourceSha256: h, reason: 'test'}); assert.equal(scanPublicTree(root, pb, [big]).violations[0].kind, 'blocked source');
  // Other files the scan cannot inspect are rejected too: tracked symbolic links (even dangling), directories, missing paths.
  symlinkSync('/nonexistent/target', join(root, 'link.json')); mkdirSync(join(root, 'subdir'));
  assert.deepEqual(scanPublicTree(root, policy, ['link.json', 'subdir', 'gone.json']).violations.map(v => v.kind), ['symbolic link', 'not a regular file', 'missing']);
  // The threshold is a parameter; the same rule applies to any size limit.
  writeFileSync(join(root, 'small.txt'), 'x'.repeat(100)); assert.equal(scanPublicTree(root, policy, ['small.txt'], {maxBytes: 10}).violations[0].kind, 'oversized file');
});

test('P1-B: the command-line gate (the CI job) fails on an unapproved oversized tracked file', () => {
  const repo = tmp();
  for (const d of ['scripts/player-intelligence', 'lanova/cases/player-intelligence/demo-data']) cpSync(resolve(ROOT, d), join(repo, d), {recursive: true});
  mkdirSync(join(repo, 'lanova/player-intelligence'), {recursive: true}); copyFileSync(resolve(ROOT, 'lanova/player-intelligence/publication-policy.json'), join(repo, 'lanova/player-intelligence/publication-policy.json'));
  const git = (...a) => spawnSync('git', a, {cwd: repo, encoding: 'utf8'});
  git('init', '-q'); git('add', '-A');
  const ok = spawnSync('node', ['scripts/player-intelligence/publication_gate.mjs'], {cwd: repo, encoding: 'utf8'}); assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  const fd = openSync(join(repo, 'lanova/huge.dat'), 'w'); ftruncateSync(fd, MAX_INSPECT_BYTES + 1); closeSync(fd); git('add', 'lanova/huge.dat');
  const bad = spawnSync('node', ['scripts/player-intelligence/publication_gate.mjs'], {cwd: repo, encoding: 'utf8'});
  assert.equal(bad.status, 1); assert.match(bad.stdout, /VIOLATION lanova\/huge\.dat \(oversized file\)/); assert.match(bad.stderr, /FAIL publication gate/);
});
