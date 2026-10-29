import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalServer} from '../scripts/serve.js';
test('local HTTP delivery serves the complete module graph and snapshot with security headers', async () => {
  const server = createLocalServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const routes = ['/', '/src/app.js', '/src/finance.js', '/src/state.js', '/src/data.js', '/src/format.js', '/src/components.js', '/src/demo.js', '/src/report.js', '/src/style.css', '/data/tennis.json', '/data/manifest.json', '/data/investor-demo.json'];
    for (const route of routes) {
      const response = await fetch(base + route); assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok((await response.text()).length > 0);
    }
    for (const route of ['/src/management.js','/src/workspace.js','/src/workspace.css']) assert.equal((await fetch(base+route)).status,200,route);
    assert.match((await fetch(base + '/src/app.js')).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/', {method: 'HEAD'})).status, 200);
    assert.equal((await (await fetch(base + '/', {method: 'HEAD'})).text()).length, 0);
    for (const route of ['/README.md', '/package.json', '/src/../../README.md', '/data/private.json', '/%00']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/', {method: 'POST', body: 'private'})).status, 405);
    assert.equal((await fetch(base + '/%zz')).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('all static module imports resolve to repository files without a build', async () => {
  for (const file of ['app', 'finance', 'state', 'data', 'format', 'components']) {
    const source = await readFile(new URL('../src/' + file + '.js', import.meta.url), 'utf8');
    for (const [, specifier] of source.matchAll(/from\s+['"](.+?)['"]/g)) {
      assert.ok(specifier.startsWith('./'), 'runtime has no remote dependency: ' + specifier);
      assert.ok((await readFile(new URL('../src/' + specifier, import.meta.url))).length > 0);
    }
  }
});

