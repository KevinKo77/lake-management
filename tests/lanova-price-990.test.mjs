import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('P1: active marketing prices and metadata contain EUR 990 and no obsolete EUR 490',()=>{for(const p of ['index.html','pricing.html','legal.html']){const html=read(p);assert.doesNotMatch(html,/490/);assert.match(html,/€990/);}});
test('P1: pricing discloses recurring monthly organisation price excluding tax',()=>{const p=read('pricing.html');assert.match(p,/€990/);assert.match(p,/per organisation/);assert.match(p,/excl\. VAT|excluding VAT/);assert.match(p,/renews automatically every month/);});
test('P1: terms match the monthly EUR 990 tax-exclusive price',()=>{const p=read('legal.html');assert.match(p,/€990 per month per organisation, excluding VAT/);assert.match(p,/Cancellation takes effect at the end of the current paid month/);});
