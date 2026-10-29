import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateSnapshot, auditSnapshot} from '../src/data.js';
const path = new URL('../data/tennis.json', import.meta.url);
const text = await readFile(path, 'utf8');
const data = validateSnapshot(JSON.parse(text));
const digest = createHash('sha256').update(text).digest('hex');
const manifestPath = new URL('../data/manifest.json', import.meta.url);
if (process.argv.includes('--write')) {
  await writeFile(manifestPath, JSON.stringify({file: 'tennis.json', sha256: digest, license: data.license, schemaVersion: data.schemaVersion, reviewedAt: data.reviewedAt}, null, 2) + '\n');
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.sha256 !== digest || manifest.file !== 'tennis.json' || manifest.schemaVersion !== data.schemaVersion || manifest.license !== data.license || manifest.reviewedAt !== data.reviewedAt) throw Error('Data manifest mismatch');
}
console.log(JSON.stringify({sha256: digest, profiles: auditSnapshot(data)}, null, 2));
