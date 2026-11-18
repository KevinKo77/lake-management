// The public promise on saved analyses must match the app server's limit (MAX_SCENARIOS_PER_ORG = 500 per
// organisation in lake-intelligence club/server.mjs). No page may promise unlimited saved scenarios or analyses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const pages = readdirSync('.').filter(f => f.endsWith('.html'));

test('no public page promises unlimited saved scenarios or analyses', () => {
  for (const f of pages) assert.doesNotMatch(readFileSync(f, 'utf8'), /unlimited\s+saved|saved[^<]{0,40}unlimited/i, f);
});

test('pricing states the limit of 500 saved analyses per organisation', () => {
  const html = readFileSync('pricing.html', 'utf8');
  assert.match(html, /up to 500 saved analyses per organisation/);
  assert.match(html, /Up to 500 analyses can be saved per organisation\./);
});
