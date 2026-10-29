import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for (const directory of ['src', 'scripts', 'tests']) {
  for (const file of await readdir(new URL('../' + directory + '/', import.meta.url))) {
    if (!/\.(js|cjs|mjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../' + directory + '/' + file, import.meta.url))], {stdio: 'inherit'});
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
console.log('All source, script and test JavaScript parses successfully.');
