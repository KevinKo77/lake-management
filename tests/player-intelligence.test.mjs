// Player Intelligence V1 — parser, identity engine, facts, comparison, integration contract, report, reproducibility and
// the source-rights gate. Synthetic fixture only (fictional players). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseFullTxt, parseMinute} from '../lanova/player-intelligence/parse.js';
import {resolvePlayer, resolveClub, checkRegistry, foldAccents, STATUS} from '../lanova/player-intelligence/identity.js';
import {buildFacts, estimateMinutes, UNAVAILABLE} from '../lanova/player-intelligence/facts.js';
import {compare, filterByPosition, per90, PER90_MIN_MINUTES} from '../lanova/player-intelligence/compare.js';
import {buildPlayerContext, validateContext, withAssumption, toRecruitmentCandidate, ASSUMPTIONS} from '../lanova/player-intelligence/contract.js';
import {comparisonReport} from '../lanova/player-intelligence/report.js';
import {validateCandidates} from '../lanova/optimizer/model.js';

const DIR = 'lanova/cases/player-intelligence/demo-data';
const TXT = readFileSync(`${DIR}/demo-league-full.txt`, 'utf8'), REG = JSON.parse(readFileSync(`${DIR}/demo-registry.json`, 'utf8'));
const D = JSON.parse(readFileSync(`${DIR}/demo-facts.json`, 'utf8')), MAN = JSON.parse(readFileSync(`${DIR}/demo-manifest.json`, 'utf8'));
const row = key => D.players.find(p => p.key === key);
const SEASON = '2025/26';

test('parser: minutes, nested substitutions, multi-minute scorers, penalties, own goals and card kinds', () => {
  assert.deepEqual(parseMinute("90+4'"), {raw: '90+4', base: 90, added: 4}); assert.equal(parseMinute('abc'), null);
  const p = parseFullTxt(TXT);
  assert.equal(p.season, SEASON); assert.equal(p.matches.length, 6); assert.deepEqual(p.problems, []);
  for (const m of p.matches) for (const s of ['home', 'away']) assert.equal(m.lineups[s].length, 11, `${m.id} ${s}`);
  const m1 = p.matches[0];
  assert.deepEqual(m1.score, [2, 1]); assert.deepEqual(m1.goals.map(g => [g.name, g.minute.raw, g.kind, g.listedFor]), [['Nil ESCOVAR', '23', 'goal', 'home'], ['Nil ESCOVAR', '77', 'penalty', 'home'], ['Rubén Calvisto', '64', 'goal', 'away']]);
  assert.deepEqual(m1.cards.map(c => [c.side, c.kind, c.name, c.minute.raw]), [['home', 'yellow', 'Mateo Rusquel', '33'], ['away', 'yellow', 'Unai Pertxel', '12'], ['away', 'second_yellow', 'Unai Pertxel', '60']]);
  const slot = m1.lineups.away.find(s => s[0].name === 'Yeray Montuno'); assert.deepEqual(slot.map(x => [x.name, x.on?.raw ?? null]), [['Yeray Montuno', null], ['Marco Belvane Ruiz', '90+2']]);
  assert.ok(m1.lineups.home.some(s => s[0].name === 'Nil ESCOVAR' && s[0].captain));
  const og = p.matches.find(m => m.home === 'Dunas CD' && m.away === 'Altamar CF').goals.find(g => g.kind === 'own_goal'); assert.equal(og.name, 'Toni Brescal'); assert.equal(og.listedFor, 'away');
  // Each match: goals listed per side add up to the score (own goals included).
  for (const m of p.matches) assert.deepEqual([m.goals.filter(g => g.listedFor === 'home').length, m.goals.filter(g => g.listedFor === 'away').length], m.score, m.id);
  // A malformed file reports problems instead of inventing data.
  const bad = parseFullTxt('= X 2025/26\n\n▪ Matchday 1\nSat Aug 16\n  A v B  1-0\n');
  assert.ok(bad.problems.some(x => /no line-up for home/.test(x))); assert.ok(bad.problems.some(x => /no scorers listed/.test(x)));
});

test('identity: homonyms at two clubs resolve only within their own club; the same name elsewhere stays unresolved', () => {
  const a = resolvePlayer({name: 'Luis Prandel', club: 'demo-altamar', season: SEASON}, REG), c = resolvePlayer({name: 'Luis Prandel', club: 'demo-cerro-azul', season: SEASON}, REG);
  assert.equal(a.status, STATUS.RESOLVED); assert.equal(a.playerId, 'SYN-A05'); assert.equal(c.playerId, 'SYN-C05');
  const d = resolvePlayer({name: 'Luis Prandel', club: 'demo-dunas', season: SEASON}, REG);
  assert.equal(d.status, STATUS.UNRESOLVED); assert.equal(d.playerId, null); assert.deepEqual(d.nameOnlyMatches.sort(), ['SYN-A05', 'SYN-C05']);
  assert.equal(row('unresolved:demo-dunas:luis prandel').identity.status, 'UNRESOLVED');
  // Same name, right club, wrong season: unresolved.
  assert.equal(resolvePlayer({name: 'Luis Prandel', club: 'demo-altamar', season: '2024/25'}, REG).status, STATUS.UNRESOLVED);
});

test('identity: accents and letter case — case alone is high confidence, accent folding only medium; folding never creates a match by itself', () => {
  const hi = resolvePlayer({name: 'Teo QUORVAZ', club: 'demo-altamar', season: SEASON}, REG), med = resolvePlayer({name: 'Inigo ZARBALETA', club: 'demo-altamar', season: SEASON}, REG);
  assert.deepEqual([hi.status, hi.confidence], [STATUS.RESOLVED, 'high']); assert.deepEqual([med.status, med.confidence, med.playerId], [STATUS.RESOLVED, 'medium', 'SYN-A03']);
  assert.equal(row('SYN-A03@demo-altamar').identity.confidence, 'medium', 'weakest evidence across spellings is kept'); assert.deepEqual(row('SYN-A03@demo-altamar').spellings, ['Inigo ZARBALETA', 'Íñigo Zarbaleta']);
  assert.equal(foldAccents('Íñigo  Zarbaleta'), 'inigo zarbaleta');
  assert.equal(resolvePlayer({name: 'Inigo Zarbaletta', club: 'demo-altamar', season: SEASON}, REG).status, STATUS.UNRESOLVED, 'no fuzzy spelling match');
});

test('identity: ambiguous names, missing names, unknown clubs and contradicting identifiers are never resolved', () => {
  const amb = resolvePlayer({name: 'Marco Belvane', club: 'demo-brisa-norte', season: SEASON}, REG);
  assert.equal(amb.status, STATUS.AMBIGUOUS); assert.equal(amb.playerId, null); assert.deepEqual(amb.candidates, ['SYN-B07', 'SYN-B08']);
  assert.equal(resolvePlayer({name: 'Marco Belvane Ruiz', club: 'demo-brisa-norte', season: SEASON}, REG).playerId, 'SYN-B08');
  assert.equal(resolvePlayer({name: 'Kilian Drumvel', club: 'demo-brisa-norte', season: SEASON}, REG).status, STATUS.UNRESOLVED);
  assert.equal(resolvePlayer({name: '', club: 'demo-brisa-norte', season: SEASON}, REG).status, STATUS.UNRESOLVED);
  assert.equal(resolvePlayer({name: 'Teo Quorvaz', club: null, season: SEASON}, REG).status, STATUS.UNRESOLVED);
  assert.equal(resolveClub('Altamar CF', REG).clubId, 'demo-altamar'); assert.equal(resolveClub('Altamar', REG).status, STATUS.UNRESOLVED);
  const conflict = resolvePlayer({name: 'Teo Quorvaz', club: 'demo-altamar', season: SEASON, externalId: 'SYN-B01'}, REG);
  assert.equal(conflict.status, STATUS.CONFLICT); assert.equal(conflict.playerId, null);
  assert.equal(resolvePlayer({name: 'Teo Quorvaz', club: 'demo-altamar', season: SEASON, externalId: 'Q000'}, REG).status, STATUS.UNRESOLVED);
  assert.throws(() => checkRegistry({clubs: [], players: [{id: 'X', aliases: [{name: 'A'}], affiliations: []}]}), /has no source/);
  assert.throws(() => checkRegistry({clubs: [{id: 'c', names: []}], players: [{id: 'X', aliases: [{name: 'A', source: 's'}], affiliations: [{club: 'zz', season: SEASON, source: 's'}]}]}), /unknown club/);
});

test('identity: an unresolved record cannot silently become a verified match', () => {
  // Adding the same NAME as an alias of a player who has no affiliation to that club changes nothing.
  const reg = structuredClone(REG); reg.players.find(p => p.id === 'SYN-B10').aliases.push({name: 'Kilian Drumvel', source: 'test alias'});
  assert.equal(resolvePlayer({name: 'Kilian Drumvel', club: 'demo-dunas', season: SEASON}, reg).status, STATUS.UNRESOLVED);
  const rebuilt = buildFacts(parseFullTxt(TXT), REG, {synthetic: true});
  for (const p of rebuilt.players.filter(x => x.identity.status !== 'RESOLVED')) { assert.equal(p.playerId, null); assert.equal(p.displayName, null); assert.match(p.key, /^unresolved:/); }
  // The contract refuses to turn it into a recruitment candidate, even with every assumption supplied.
  let ctx = buildPlayerContext(row('unresolved:demo-brisa-norte:kilian drumvel'), {dataset: D});
  for (const a of ASSUMPTIONS) ctx = withAssumption(ctx, a.id, 10);
  assert.equal(ctx.status, 'identity-unresolved'); const out = toRecruitmentCandidate(ctx); assert.equal(out.ready, false); assert.match(out.errors[0], /identity unresolved/);
  assert.ok(validateContext({...ctx, status: 'ready'}).some(e => /cannot be passed on/.test(e)));
});

test('identity: a mid-season transfer gives two club records for one player; the audit counts every case', () => {
  const t = D.players.filter(p => p.playerId === 'SYN-T01');
  assert.deepEqual(t.map(p => [p.club.id, p.observed.appearances, p.observed.goals]), [['demo-altamar', 2, 0], ['demo-dunas', 1, 1]]);
  assert.deepEqual([D.identityAudit.records, D.identityAudit.resolved, D.identityAudit.ambiguous, D.identityAudit.unresolved, D.identityAudit.conflict], [51, 48, 1, 2, 0]);
  assert.deepEqual(D.identityAudit.unresolvedCases.map(c => [c.nameAsWritten, c.club, c.status]), [['Kilian Drumvel', 'Brisa Norte FC', 'UNRESOLVED'], ['Marco Belvane', 'Brisa Norte FC', 'AMBIGUOUS'], ['Luis Prandel', 'Dunas CD', 'UNRESOLVED']]);
});

test('minutes estimate: documented formula, dismissals and added time (hand-checked)', () => {
  const m = s => parseMinute(s);
  assert.equal(estimateMinutes({}).minutes, 90); assert.equal(estimateMinutes({off: m("58'")}).minutes, 58); assert.equal(estimateMinutes({on: m("70'")}).minutes, 20);
  assert.equal(estimateMinutes({on: m("46'"), off: m("80'")}).minutes, 34); assert.equal(estimateMinutes({dismissed: m("60'")}).minutes, 60);
  const st = estimateMinutes({on: m("90+2'")}); assert.equal(st.minutes, 0); assert.equal(st.stoppageIgnored, true);
  assert.equal(estimateMinutes({off: m("45+1'")}).minutes, 45);
  // Hand-checked records from the fixture.
  assert.equal(row('SYN-A10@demo-altamar').derived.minutesEstimate.value, 85 + 90 + 90);                         // replaced at 85'
  assert.equal(row('SYN-A04@demo-altamar').derived.minutesEstimate.value, 90 + 90 + 80);                         // straight red at 80'
  assert.equal(row('SYN-B03@demo-brisa-norte').derived.minutesEstimate.value, 60 + 90 + 90);                     // second yellow at 60'
  assert.equal(row('SYN-A09@demo-altamar').derived.minutesEstimate.value, 90 + 60 + 58);
  const late = row('SYN-B08@demo-brisa-norte'); assert.equal(late.derived.minutesEstimate.value, 0 + 90 + 90); assert.equal(late.derived.minutesEstimate.matchesWithAddedTimeIgnored, 1);
  assert.equal(row('SYN-C07@demo-cerro-azul').derived.minutesEstimate.value, 45 + 90 + 90);                     // replaced at 45+1'
  assert.equal(D.players.find(p => p.key === 'SYN-A04@demo-altamar').derived.minutesEstimate.matchesWithDismissal, 1);
  assert.equal(D.players.every(p => p.derived.minutesEstimate.label === 'estimated'), true);
});

test('observed facts: goals, penalties, own goals, cards; totals reconcile with the scores; inconsistencies flagged, not fixed', () => {
  assert.deepEqual(row('SYN-A10@demo-altamar').observed, {appearances: 3, starts: 3, substituteAppearances: 0, substitutedOff: 1, goals: 3, penaltyGoals: 1, ownGoals: 0, yellowCards: 0, secondYellowCards: 0, redCards: 0, cardsWithoutAppearance: 0});
  const brescal = row('SYN-D04@demo-dunas').observed; assert.equal(brescal.goals, 0); assert.equal(brescal.ownGoals, 1); assert.equal(brescal.redCards, 1);
  assert.deepEqual([row('SYN-B03@demo-brisa-norte').observed.yellowCards, row('SYN-B03@demo-brisa-norte').observed.secondYellowCards], [1, 1]);
  const scores = parseFullTxt(TXT).matches.reduce((s, m) => s + m.score[0] + m.score[1], 0);
  assert.equal(D.validation.totals.goals + D.validation.totals.ownGoals, scores);
  assert.equal(D.validation.totals.appearances, D.players.reduce((s, p) => s + p.observed.appearances, 0));
  assert.equal(D.validation.inconsistencies.length, 3);
  assert.ok(row('unresolved:demo-brisa-norte:kilian drumvel').inconsistencies.some(x => /listed as scorer .* but not in the home line-up/.test(x)));
  assert.ok(row('SYN-C09@demo-cerro-azul').inconsistencies.some(x => /listed twice/.test(x)));
  assert.equal(row('SYN-C09@demo-cerro-azul').matches.filter(x => x.match.includes('Brisa Norte FC-v-Cerro Azul SD')).length, 1, 'counted once');
});

test('nothing fabricated: unavailable measures are named, never present as numbers; no 0 stands in for missing data', () => {
  assert.deepEqual(D.unavailable, UNAVAILABLE); assert.ok(UNAVAILABLE.includes('assists') && UNAVAILABLE.includes('expected goals (xG)') && UNAVAILABLE.includes('market value'));
  const keys = new Set(); const walk = o => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v); } }; walk(D.players);
  for (const k of ['assists', 'xg', 'xG', 'xa', 'shots', 'passes', 'tackles', 'interceptions', 'marketValue', 'salary', 'wage', 'injuryRisk', 'rating', 'probability', 'forecast']) assert.ok(!keys.has(k), k);
  // A position or minute the source does not give is null, not 0 or a guess.
  assert.equal(row('unresolved:demo-dunas:luis prandel').effectivePosition, null); assert.equal(row('SYN-C12@demo-cerro-azul').effectivePosition, null);
  assert.equal(per90(3, 0), null); assert.equal(per90(null, 900), null);
});

test('comparison: descriptive only — no overall score; per-90 only above the minutes threshold; warnings; positions by effectivePosition', () => {
  const a = row('SYN-A10@demo-altamar'), b = row('SYN-B10@demo-brisa-norte'), u = row('unresolved:demo-dunas:luis prandel');
  const c = compare([a, b, u], {unavailable: D.unavailable});
  assert.equal(c.overallScore, null); assert.match(c.note, /No overall score/); assert.ok(!c.measures.some(m => /score|rating|rank/i.test(m.id)));
  assert.deepEqual(c.measures.find(m => m.id === 'goals').values.map(v => v.value), [3, 1, 0]);
  assert.equal(c.measures.find(m => m.id === 'minutesEstimate').category, 'DERIVED');
  const g90 = c.measures.find(m => m.id === 'goalsPer90'); assert.equal(g90.comparable, false); assert.ok(g90.values.every(v => v.value === null)); assert.match(g90.note, /below 900 estimated minutes/);
  assert.ok(c.warnings.some(w => /identity unresolved/.test(w))); assert.ok(c.warnings.some(w => /Different clubs/.test(w))); assert.ok(c.warnings.some(w => /do not describe current or future performance/.test(w)));
  assert.deepEqual(c.unavailable, D.unavailable);
  assert.throws(() => compare([a]), /at least two/); assert.throws(() => compare([a, a]), /twice/);
  // Per-90 above the threshold (records scaled up from the fixture): count × 90 ÷ estimated minutes.
  const big = (r, min) => ({...r, derived: {minutesEstimate: {...r.derived.minutesEstimate, value: min}}});
  const c2 = compare([big(a, 1800), big(b, PER90_MIN_MINUTES)]); const g = c2.measures.find(m => m.id === 'goalsPer90');
  assert.equal(g.comparable, true); assert.deepEqual(g.values.map(v => v.value), [0.15, 0.1]);
  // Position filter uses effectivePosition and keeps the source position.
  const fw = filterByPosition(D.players, 'FW'); assert.ok(fw.kept.some(p => p.playerId === 'SYN-A09' && p.sourcePosition === 'MF'));
  assert.ok(!filterByPosition(D.players, 'MF').kept.some(p => p.playerId === 'SYN-A09'));
  assert.ok(fw.excluded.some(x => x.reason === 'no documented position'));
});

test('integration contract: identity and facts as context; fees, wages and priority only from the user; accepted by the Recruitment engine unchanged', () => {
  const ctx0 = buildPlayerContext(row('SYN-A10@demo-altamar'), {dataset: D});
  assert.equal(ctx0.schema, 'lanova-player-context-v1'); assert.equal(ctx0.status, 'assumptions-required'); assert.deepEqual(validateContext(ctx0), []);
  assert.ok(Object.values(ctx0.userAssumptions).every(a => a.value === null && a.suppliedBy === null));
  assert.equal(toRecruitmentCandidate(ctx0).ready, false); assert.deepEqual(toRecruitmentCandidate(ctx0).missing, ['fee', 'wage', 'revenue', 'resale', 'score']);
  const bad = structuredClone(ctx0); bad.historical.marketValue = 1e6; assert.ok(validateContext(bad).some(e => /forbidden field .*marketValue/.test(e)));
  const bad2 = structuredClone(ctx0); bad2.historical.observed.rating = 7.1; assert.ok(validateContext(bad2).some(e => /rating/.test(e)));
  let ctx = ctx0; for (const [k, v] of [['fee', 900000], ['wage', 300000], ['revenue', 150000], ['resale', 1200000], ['score', 70]]) ctx = withAssumption(ctx, k, v);
  assert.equal(ctx.status, 'ready'); const out = toRecruitmentCandidate(ctx); assert.equal(out.ready, true);
  assert.deepEqual(validateCandidates([out.candidate]), [{id: 'SYN-A10', name: 'Nil Escovar', position: 'FW', enabled: true, fee: 900000, wage: 300000, revenue: 150000, resale: 1200000, score: 70}]);
  assert.throws(() => withAssumption(ctx0, 'marketValue', 1), /unknown assumption/);
  assert.ok(validateContext(withAssumption(ctx0, 'score', 150)).some(e => /score/.test(e)));
});

test('report export: provenance, method, warnings and disclaimers; demonstration banner for synthetic data', () => {
  const html = comparisonReport(compare([row('SYN-A10@demo-altamar'), row('SYN-T01@demo-dunas')], {unavailable: D.unavailable}), D, {generatedAt: '2026-11-24'});
  assert.match(html, /DEMONSTRATION DATA — FICTIONAL PLAYERS AND CLUBS/); assert.match(html, new RegExp(MAN.sha256)); assert.match(html, /not sporting, financial or investment advice/);
  assert.match(html, /Added time is ignored/); assert.match(html, /— \(not available\)/); assert.match(html, /No overall score/);
  assert.doesNotMatch(html, /<script/i);
});

test('reproducibility: the fixture and the dataset rebuild byte for byte; a changed source is refused', () => {
  assert.equal(execFileSync('node', ['scripts/player-intelligence/make_demo_fixture.mjs', '--check']).toString().trim(), 'demo fixture reproduced exactly');
  assert.match(execFileSync('node', ['scripts/player-intelligence/build_player_facts.mjs', '--check']).toString(), /reproduced exactly/);
  const tmp = mkdtempSync(join(tmpdir(), 'pi-')), out1 = join(tmp, 'a.json'), out2 = join(tmp, 'b.json');
  execFileSync('node', ['scripts/player-intelligence/build_player_facts.mjs', '--out', out1]); execFileSync('node', ['scripts/player-intelligence/build_player_facts.mjs', '--out', out2]);
  assert.equal(readFileSync(out1, 'utf8'), readFileSync(out2, 'utf8')); assert.equal(readFileSync(out1, 'utf8'), readFileSync(`${DIR}/demo-facts.json`, 'utf8'));
  writeFileSync(join(tmp, 'src.txt'), TXT + '\n'); const r = spawnSync('node', ['scripts/player-intelligence/build_player_facts.mjs', '--source', join(tmp, 'src.txt'), '--out', join(tmp, 'c.json')]);
  assert.equal(r.status, 1); assert.match(r.stderr.toString(), /differs from the manifest/);
});

test('source-rights gate: non-synthetic data are refused inside the repository; only fictional data and aggregates are published', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'pi-')), man = join(tmp, 'manifest.json');
  writeFileSync(man, JSON.stringify({...MAN, synthetic: false, rightsDecision: 'BLOCKED'}));
  const r = spawnSync('node', ['scripts/player-intelligence/build_player_facts.mjs', '--manifest', man, '--out', 'lanova/cases/player-intelligence/demo-data/should-not-exist.json']);
  assert.equal(r.status, 2); assert.match(r.stderr.toString(), /refusing to write non-synthetic data inside the repository/);
  assert.equal(D.synthetic, true); assert.equal(REG.synthetic, true); assert.ok(REG.players.every(p => /^SYN-/.test(p.id))); assert.ok(D.players.every(p => p.playerId === null || /^SYN-/.test(p.playerId)));
  assert.match(D.competition, /FICTIONAL/);
  const audit = JSON.parse(readFileSync('lanova/player-intelligence/evidence/source-audit-laliga-2025-26.json', 'utf8'));
  assert.match(audit.decision, /^BLOCKED/); assert.ok(!('players' in audit) && !JSON.stringify(audit).includes('"name"'), 'aggregates only');
  assert.equal(audit.source.sha256, '453103e77b46fdae96fcf9b3616e1fce553473ae02a98bfb9bb366d9c2fbab42'); assert.match(audit.source.repositoryHead, /^[0-9a-f]{40}$/);
  assert.equal(audit.parserReconciliation.appearances, 11953); assert.equal(audit.identityAudit.resolved + audit.identityAudit.unresolved + audit.identityAudit.ambiguous + audit.identityAudit.conflict, audit.identityAudit.playerClubRecords);
  // No file of the module carries real line-up text (spot-check of names written in the real source).
  const files = []; const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk('lanova/player-intelligence'); walk('lanova/cases/player-intelligence');
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const n of ['Paulo Gazzaniga', 'Arnau MARTINEZ', 'Kylian MBAPPE', 'Lamine YAMAL']) assert.ok(!t.includes(n), `${f} contains ${n}`); }
});
