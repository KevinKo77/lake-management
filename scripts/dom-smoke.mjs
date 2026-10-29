/** DOM integration, not a browser or visual test. External LinkeDOM is dev-only. */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {parseHTML} = await import(process.env.LAKE_DOM_MODULE ? pathToFileURL(process.env.LAKE_DOM_MODULE).href : 'linkedom');
const root = new URL('../', import.meta.url);
const pageHtml = await readFile(new URL('index.html', root), 'utf8');
const dataText = await readFile(new URL('data/tennis.json', root), 'utf8');
const demoText = await readFile(new URL('data/investor-demo.json', root), 'utf8');
const manifestText = await readFile(new URL('data/manifest.json', root), 'utf8');
const ids = ['Q28777443', 'Q28493468'];
const {STORAGE_KEY, LEGACY_KEY, parseState} = await import('../src/state.js');
const {defaults} = await import('../src/finance.js');
let runs = 0;
async function launch(initial = {}, options = {}) {
  const {window, document} = parseHTML(pageHtml);
  const saved = new Map(Object.entries(initial));
  const downloads = [];
  // LinkeDOM does not implement browser form submission / FormData / select value.
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? this.querySelector('option')?.textContent ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', (option.getAttribute('value') ?? option.textContent) === String(value)); },
  });
  class HTMLFormData {
    constructor(form) {
      this.values = new Map();
      for (const field of form.querySelectorAll('input[name],select[name],textarea[name]')) {
        if (field.type === 'checkbox' && !field.checked) continue;
        this.values.set(field.name ?? field.getAttribute('name'), field.value ?? '');
      }
    }
    get(key) { return this.values.get(key) ?? null; }
    has(key) { return this.values.has(key); }
  }
  globalThis.document = document; globalThis.window = window; globalThis.FormData = HTMLFormData;
  globalThis.confirm = () => true;
  globalThis.localStorage = {
    getItem(key) { if (options.storageBlocked) throw Error('storage blocked'); return saved.get(key) ?? null; },
    setItem(key, value) { if (options.quota) throw Error('quota'); saved.set(key, value); },
  };
  globalThis.fetch = async url => {
    if (options.missingDemo && String(url).includes('investor-demo')) return new Response('', {status:404});
    if (options.missingData) return new Response('', {status: 404});
    const text = String(url).includes('investor-demo') ? demoText : String(url).includes('manifest') ? (options.badDigest ? manifestText.replace(/"sha256": "[^"]+"/, '"sha256": "' + '0'.repeat(64) + '"') : manifestText) : dataText;
    return new Response(text, {status: 200});
  };
  URL.createObjectURL = blob => { downloads.push(blob); return 'blob:dom-smoke'; };
  URL.revokeObjectURL = () => {};
  await import(new URL('src/app.js?run=' + (++runs), root));
  for (let attempt = 0; attempt < 100; attempt++) {
    if (document.querySelector('#management-heading') || document.querySelector('.metric-card') || document.getElementById('status').textContent.includes('Aucun calcul lancé')) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const query = selector => { const element = document.querySelector(selector); assert.ok(element, `Missing element ${selector}`); return element; };
  const click = selector => query(selector).dispatchEvent(new window.Event('click', {bubbles: true, cancelable: true}));
  const input = (name, value) => { const element = query(`[name="${name}"]`); element.value = String(value); element.dispatchEvent(new window.Event('input', {bubbles: true})); };
  const submit = selector => query(selector).dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  const nav = view => click(`nav [data-view="${view}"]`);
  return {window, document, saved, downloads, query, click, input, submit, nav};
}

let p = await launch();
assert.match(p.query('#content').textContent, /Talent opens up possibilities/);
p.nav('dashboard');
assert.match(p.query('#content').textContent, /Pipeline/);
p.click('[data-action="new"]');
p.input('label', 'Cas A <img src=x onerror=alert(1)>');
p.input('capital', 100000); p.input('upfrontFee', 5000); p.input('revenue', 400000);
p.nav('model'); assert.equal(p.query('[name=capital]').value, '100000');
assert.equal(p.query('#save-opportunity').disabled, true);
p.submit('#model-form'); assert.equal(p.query('#save-opportunity').disabled, false);
p.click('#save-opportunity');
let state = parseState(p.saved.get(STORAGE_KEY), ids);
assert.equal(state.opportunities.length, 1); assert.equal(state.opportunities[0].model.upfrontFee, 5000);
p.nav('opportunities'); assert.equal(p.document.querySelectorAll('#opportunity-results tbody tr').length, 1);
assert.equal(p.document.querySelectorAll('img').length, 0);
p.click('[data-clone]'); p.input('label', 'Cas B'); p.input('revenue', 100000); p.input('capital', 200000);
p.submit('#model-form'); p.click('#save-opportunity');
p.nav('compare'); assert.match(p.query('#content').textContent, /2 cas indépendants/);
assert.equal(p.document.querySelectorAll('.grid.equal > .panel').length, 2);
p.query('#common-rate-enabled').checked = true; p.query('#common-rate').value = '20'; p.submit('#common-rate-form');
assert.match(p.query('#content').textContent, /taux commun/);
assert.equal(parseState(p.saved.get(STORAGE_KEY), ids).opportunities[0].model.discount, 0.15);
p.click('#export-comparison'); assert.match(await p.downloads.at(-1).text(), /HYPOTHETICAL/);
p.nav('opportunities'); p.click('[data-allocate]');
assert.match(p.query('#content').textContent, /105/); state = parseState(p.saved.get(STORAGE_KEY), ids);
assert.equal(state.positions.length, 1); assert.equal(state.positions[0].model.capital, 100000);
p.nav('opportunities'); p.click('[data-edit]'); p.input('revenue', 0); p.submit('#model-form'); p.click('#save-opportunity');
state = parseState(p.saved.get(STORAGE_KEY), ids);
assert.equal(state.opportunities[0].model.revenue, 0); assert.equal(state.positions[0].model.revenue, 400000);
p.nav('portfolio'); p.query('#budget').value = '100'; p.submit('#budget-form'); assert.match(p.query('#status').textContent, /inférieur/);
p.query('#budget').value = '105000'; p.submit('#budget-form');
p.nav('opportunities'); p.click('[data-allocate]'); assert.match(p.query('#status').textContent, /Insufficient/);
p.nav('sources'); assert.match(p.query('#content').textContent, /SHA-256 OK/); assert.match(p.query('#content').textContent, /days — outdated/);
p.nav('model'); p.click('#export-analysis'); assert.equal(JSON.parse(await p.downloads.at(-1).text()).hypothetical, true);
p.query('#dated-input').value = '2026-01-01 ; -100\n2027-01-01 ; 110'; p.submit('#dated-form'); assert.match(p.query('#dated-results').textContent, /10.0/);
p.query('#dated-input').value = '2026-01-01 ; -100\n2027-01-01 ; 230\n2028-01-01 ; -132'; p.submit('#dated-form'); assert.match(p.query('#dated-results').textContent, /non-conventional/);
console.log('PASS DOM: independent cases, dirty guard, escaped labels, clone, compare CSV, allocate, snapshot immutability, budget guard, audit, analysis export, XIRR tool');

const saved = Object.fromEntries(p.saved);
p = await launch(saved); p.nav('portfolio'); assert.equal(p.document.querySelectorAll('[data-remove]').length, 1);
assert.match(p.query('#content').textContent, /Allocations simulées/);
console.log('PASS DOM: reload persistence');

p = await launch({[STORAGE_KEY]: '{broken'});
assert.match(p.query('#status').textContent, /non chargée/);
p.nav('model'); p.click('#save-opportunity'); assert.equal(p.saved.get(STORAGE_KEY), '{broken'); assert.match(p.query('#status').textContent, /mémoire uniquement/);
p.nav('portfolio'); p.click('#allow-save'); assert.equal(JSON.parse(p.saved.get(STORAGE_KEY)).opportunities.length, 1);
console.log('PASS DOM: corrupt storage preserved until explicit replacement');

const legacy = JSON.stringify({version: 1, budget: 1e6, positions: [{id: 'old', athleteId: ids[0], model: defaults}]});
p = await launch({[LEGACY_KEY]: legacy}); assert.match(p.query('#status').textContent, /migré/); p.nav('portfolio'); p.click('#export-portfolio'); assert.equal(JSON.parse(await p.downloads.at(-1).text()).version, 2); assert.equal(p.saved.get(LEGACY_KEY), legacy);
console.log('PASS DOM: v1 migration and v2 export without altering legacy');

p = await launch({}, {quota: true}); p.nav('model'); p.click('#save-opportunity'); assert.match(p.query('#status').textContent, /Sauvegarde impossible/);
p = await launch({}, {storageBlocked: true}); assert.match(p.query('#status').textContent, /non chargée/); assert.ok(p.document.querySelector('.metric-card'));
console.log('PASS DOM: storage failures visible and session stays usable');

p = await launch({}, {badDigest: true}); assert.match(p.query('#status').textContent, /Aucun calcul lancé/); assert.equal(p.document.querySelector('.metric-card'), null);
p = await launch({}, {missingData: true}); assert.match(p.query('#status').textContent, /Aucun calcul lancé/);
console.log('PASS DOM: unavailable or tampered source fails closed');

p = await launch(); p.nav('portfolio');
let confirmCalls = 0; globalThis.confirm = () => {confirmCalls++; return true;};
const importFile = async raw => {
  const file = {size: Buffer.byteLength(raw), text: async () => raw};
  const element = p.query('#import-portfolio');
  Object.defineProperty(element, 'files', {configurable: true, value: [file]});
  await element.onchange({target: element});
};
await importFile('{broken'); assert.match(p.query('#status').textContent, /Import refusé/); assert.equal(confirmCalls, 0);
await importFile(JSON.stringify({version: 2, budget: 100, opportunities: [], positions: [{id: 'too-large', athleteId: ids[0], label: 'x', model: defaults}]})); assert.match(p.query('#status').textContent, /Imported budget exceeded/); assert.equal(confirmCalls, 0);
await importFile(saved[STORAGE_KEY]); assert.equal(confirmCalls, 1); assert.equal(parseState(p.saved.get(STORAGE_KEY), ids).opportunities.length, 2);
console.log('PASS DOM: malformed/overbudget import rejected before confirmation, valid portfolio import round-trip');

p.nav('opportunities');
const search = p.query('#search'); search.value = 'Ruusuvuori'; search.dispatchEvent(new p.window.Event('input'));
assert.equal(p.document.querySelectorAll('#profile-results tbody tr').length, 1);
search.value = 'nothing-matches'; search.dispatchEvent(new p.window.Event('input'));
assert.equal(p.document.querySelectorAll('#profile-results tbody tr').length, 0);
console.log('PASS DOM: search and empty results');


p = await launch(saved);
const workspaceBeforeDemo = p.saved.get(STORAGE_KEY);
p.nav('compare'); p.query('#common-rate').value='20'; p.submit('#common-rate-form'); p.nav('dashboard');
p.click('[data-action="start-demo"]');
for (let n=0;n<100 && !p.document.querySelector('.demo-banner');n++) await new Promise(resolve=>setTimeout(resolve,10));
assert.match(p.query('#demo-controls').textContent, /FICTIONAL DEMONSTRATION/);
assert.equal(p.saved.get(STORAGE_KEY), workspaceBeforeDemo);
p.click('[data-action="demo-create"]');
assert.equal(p.query('[name=athleteId]').value, 'demo-tennis-a');
p.submit('#model-form'); p.click('#save-opportunity');
p.nav('compare'); assert.match(p.query('#content').textContent, /2 cas indépendants/);
assert.equal(p.query('#common-rate').value,'15');
assert.ok(p.document.querySelector('.negative-fill')); assert.ok(p.document.querySelector('.positive-fill'));
p.click('[data-allocate]');
p.nav('compare'); p.click('[data-allocate="demo-case-b"]');
p.nav('portfolio');
p.click('#export-portfolio');
const demoExport = JSON.parse(await p.downloads.at(-1).text());
assert.equal(new Set(demoExport.positions.map(o => o.athleteId)).size, 2);
assert.equal(demoExport.positions.reduce((s,o)=>s+o.model.capital+o.model.upfrontFee,0),225000);
assert.ok(demoExport.positions.every(o=>o.demo === true));
p.click('#export-report');
const report = await p.downloads.at(-1).text();
assert.match(report, /FICTIONAL DEMONSTRATION/); assert.doesNotMatch(report, /<script/);
assert.equal(p.saved.get(STORAGE_KEY), workspaceBeforeDemo);
await importFile(workspaceBeforeDemo); assert.match(p.query('#status').textContent,/uniquement des cas fictifs/);
globalThis.confirm=()=>false; p.click('[data-action="exit-demo"]'); assert.ok(p.document.querySelector('.demo-banner'));
globalThis.confirm=()=>true; p.click('[data-action="exit-demo"]');
assert.equal(p.saved.get(STORAGE_KEY), workspaceBeforeDemo);
assert.equal(p.document.querySelector('.demo-banner'), null);
p.nav('compare'); assert.equal(p.query('#common-rate').value,'20');
console.log('PASS DOM: fictional session, template creation, signed comparison, allocations, HTML report and original workspace restoration without storage writes');

p = await launch(saved,{missingDemo:true});
p.click('[data-action="start-demo"]');
for(let i=0;i<100 && !p.query('#status').textContent.includes('indisponible');i++) await new Promise(resolve=>setTimeout(resolve,10));
assert.match(p.query('#status').textContent,/indisponible/);
assert.equal(p.document.querySelector('.demo-banner'),null);
assert.equal(p.saved.get(STORAGE_KEY),saved[STORAGE_KEY]);
assert.ok(p.document.querySelector('.metric-card'));
console.log('PASS DOM: missing demo fixture leaves the working terminal and stored portfolio available');

