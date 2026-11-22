/**
 * Copies the LANOVA Finance engine, unchanged, from a lake-intelligence checkout into lanova/finance/engine/ and
 * rewrites MANIFEST.json. With --check, changes nothing and fails if the files differ from that commit.
 * Usage (repo root): node scripts/sync-finance-engine.mjs <lake-intelligence path> <commit> [--check]
 */
import {execFileSync} from 'node:child_process';
import {writeFileSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [repo, commit, flag] = process.argv.slice(2);
if (!repo || !/^[0-9a-f]{40}$/.test(commit ?? '')) { console.error('Usage: node scripts/sync-finance-engine.mjs <lake-intelligence path> <40-char commit> [--check]'); process.exit(2); }
const FILES = ['model.js', 'report.js', 'pdf.js', 'cases.js'], dir = new URL('../lanova/finance/engine/', import.meta.url);
const sha = b => createHash('sha256').update(b).digest('hex');
let differ = 0;
const files = {};
for (const f of FILES) {
  const src = execFileSync('git', ['-C', repo, 'show', `${commit}:finance/${f}`]);
  files[f] = sha(src);
  if (flag === '--check') { if (sha(readFileSync(new URL(f, dir))) !== files[f]) { console.log(`DIFFERS ${f}`); differ++; } }
  else writeFileSync(new URL(f, dir), src);
}
if (flag === '--check') { console.log(differ ? `${differ} file(s) differ from ${commit}` : `All ${FILES.length} engine files are identical to ${commit}`); process.exit(differ ? 1 : 0); }
const m = JSON.parse(readFileSync(new URL('MANIFEST.json', dir), 'utf8'));
writeFileSync(new URL('MANIFEST.json', dir), JSON.stringify({...m, commit, files}, null, 1) + '\n');
console.log(`Copied ${FILES.length} files from ${commit}`);
