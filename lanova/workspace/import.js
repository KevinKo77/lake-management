/**
 * Shortlist import for the Recruitment Workspace: read a CSV or single-sheet XLSX, let the user match columns,
 * then convert every row with the existing V3 rules (v3/model.js → explicit currency/FX, gross wage, periods,
 * registration, contradictory EUR rate refused) and the engine's own validation. Nothing is uploaded.
 */
import {convert, number} from '../v3/model.js';
import {canonicalCandidate} from '../recruitment/scenario.js';

export const MAX_BYTES = 1_000_000;
const POS = {gk: 'GK', goalkeeper: 'GK', keeper: 'GK', cb: 'CB', 'centre-back': 'CB', 'center-back': 'CB', 'centre back': 'CB', 'center back': 'CB', 'central defender': 'CB',
  fb: 'FB', 'full-back': 'FB', fullback: 'FB', 'full back': 'FB', 'left-back': 'FB', 'right-back': 'FB', 'left back': 'FB', 'right back': 'FB', 'wing-back': 'FB',
  dm: 'DM', cdm: 'DM', 'defensive midfielder': 'DM', cm: 'CM', 'central midfielder': 'CM', midfielder: 'CM', am: 'AM', cam: 'AM', 'attacking midfielder': 'AM',
  w: 'W', winger: 'W', lw: 'W', rw: 'W', st: 'ST', cf: 'ST', striker: 'ST', forward: 'ST', 'centre-forward': 'ST', 'center-forward': 'ST'};
const DEAL = {permanent: 'permanent', transfer: 'permanent', buy: 'permanent', purchase: 'permanent', loan: 'loan', free: 'free', 'free agent': 'free', 'free transfer': 'free'};

/** Fields the user maps. `constants`: values that may be applied to every row instead of a column. */
export const FIELDS = [
  {key: 'name', label: 'Player name', required: true, syn: ['name', 'player', 'player name', 'jugador', 'nom']},
  {key: 'position', label: 'Position (GK, CB, FB, DM, CM, AM, W, ST or e.g. “striker”)', required: true, syn: ['position', 'pos', 'role', 'posicion', 'poste']},
  {key: 'dealType', label: 'Deal type (transfer, loan, free)', required: true, syn: ['deal', 'deal type', 'dealtype', 'type', 'operation'], constants: ['permanent', 'loan', 'free']},
  {key: 'contractYears', label: 'Contract length (seasons)', required: true, numeric: true, syn: ['contract', 'contract years', 'contractyears', 'contract seasons', 'years', 'seasons', 'length', 'duration']},
  {key: 'fee', label: 'Transfer / loan fee (0 if none)', required: true, numeric: true, syn: ['fee', 'transfer fee', 'loan fee', 'price', 'cost']},
  {key: 'wage', label: 'Gross wage', required: true, numeric: true, syn: ['wage', 'salary', 'gross wage', 'gross salary', 'pay']},
  {key: 'wagePeriod', label: 'Wage is per…', required: true, syn: ['wage period', 'wageperiod', 'salary period', 'period', 'wage per', 'salary per'], constants: ['season', 'year', 'month', 'week']},
  {key: 'wageBasis', label: 'Wage is gross or net', required: true, syn: ['wage basis', 'wagebasis', 'basis', 'gross/net'], constants: ['gross', 'net']},
  {key: 'currency', label: 'Currency (ISO code, e.g. EUR)', required: true, syn: ['currency', 'ccy', 'curr'], constants: ['EUR', 'GBP', 'USD', 'CHF']},
  {key: 'exchangeRate', label: 'Exchange rate, EUR per unit (only if not EUR)', numeric: true, syn: ['exchange rate', 'exchangerate', 'fx', 'rate', 'eur per unit']},
  {key: 'points', label: 'Expected league points (your estimate)', required: true, numeric: true, syn: ['points', 'expected points', 'pts', 'contribution', 'league points']},
  {key: 'pointsPeriod', label: 'Points are per…', required: true, syn: ['points period', 'pointsperiod', 'points per'], constants: ['season', 'contract']},
  {key: 'registration', label: 'Registration for your club (EU / NON-EU)', required: true, syn: ['registration', 'eu', 'eu status', 'non-eu', 'noneu', 'nationality status'], constants: ['EU', 'NON-EU']},
  {key: 'agentFee', label: 'Agent fee', numeric: true, syn: ['agent', 'agent fee', 'agentfee', 'commission']},
  {key: 'signingBonus', label: 'Signing bonus', numeric: true, syn: ['signing bonus', 'signingbonus', 'signing-on fee', 'sign-on']},
  {key: 'bonusExpected', label: 'Expected bonuses per season', numeric: true, syn: ['bonus', 'bonuses', 'expected bonus', 'bonusexpected']},
  {key: 'wageGrowth', label: 'Wage growth per season (fraction, 0.03 = 3%)', numeric: true, syn: ['wage growth', 'wagegrowth', 'raise', 'growth']},
  {key: 'wageShare', label: 'Loan: share of wage your club pays (fraction)', numeric: true, syn: ['wage share', 'wageshare', 'share']},
  {key: 'instalments', label: 'Fee instalments (e.g. 0.5|0.5)', syn: ['instalments', 'installments', 'payment schedule']},
  {key: 'exitSeason', label: 'Planned sale after season', numeric: true, syn: ['exit season', 'exitseason', 'sale season', 'sell after', 'sale after season', 'sell after season']},
  {key: 'exitValue', label: 'Expected resale value', numeric: true, syn: ['resale', 'resale value', 'exit value', 'exitvalue', 'sale value']},
  {key: 'exitValueDownside', label: 'Bad-case resale value', numeric: true, syn: ['exit value downside', 'downside exit value', 'downside resale', 'bad case resale', 'bad-case resale', 'resale downside', 'resale bad case'], conv: 'resale value lowered by the bad-case haircut'},
  {key: 'exitValueUpside', label: 'Good-case resale value', numeric: true, syn: ['exit value upside', 'upside exit value', 'upside resale', 'good case resale', 'good-case resale', 'resale upside', 'resale good case'], conv: 'resale value raised by the good-case uplift'},
  {key: 'sellOnPct', label: 'Sell-on share (fraction)', numeric: true, syn: ['sell-on', 'sell on', 'sellon', 'sellonpct']},
  {key: 'saleCostPct', label: 'Sale costs (fraction)', numeric: true, syn: ['sale cost', 'sale costs', 'salecostpct']},
];
/** Contract terms the engine knows but this import does not carry. A column with one of these names is refused, never ignored. */
const UNSUPPORTED_FINANCIAL = {revenue: 'Player revenue', 'player revenue': 'Player revenue', 'attributable revenue': 'Player revenue',
  signingbonusonexit: 'Signing bonus on early exit', 'signing bonus on exit': 'Signing bonus on early exit',
  releasecompensationpct: 'Release compensation', 'release compensation': 'Release compensation', 'release compensation pct': 'Release compensation',
  group: 'Exclusive option group', 'exclusive group': 'Exclusive option group'};
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_*]+/g, ' ').replace(/\s+/g, ' ').trim();

/** CSV → {headers, rows: [[{v}]]}. Delimiter: “;” if the first line contains one, else “,”. */
export function parseCsv(text) {
  if (text.length > MAX_BYTES) throw Error('The file is larger than 1 MB.');
  const lines = [], first = text.split(/\r?\n/, 1)[0], d = first.includes(';') ? ';' : ',';
  let row = [], v = '', q = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { v += '"'; i++; } else if (c === '"') q = false; else if (c === undefined) throw Error('A quoted value is never closed.'); else v += c; }
    else if (c === '"' && !v) q = true;
    else if (c === d) { row.push(v); v = ''; }
    else if (c === '\n' || c === undefined) { row.push(v.replace(/\r$/, '')); if (row.some(x => x.trim())) lines.push(row); row = []; v = ''; }
    else v += c;
  }
  return table(lines.map(r => r.map(x => ({v: x.replace(/^﻿/, '')}))), 'csv');
}

/** XLSX → same shape; uses the V3 zip worker (bounded expansion, one sheet, no macros or external links). */
export async function parseXlsx(buffer, workerUrl) {
  const decoded = await new Promise((resolve, reject) => {
    const w = new Worker(workerUrl);
    const timer = setTimeout(() => { w.terminate(); reject(Error('Reading the Excel file took too long. Try a smaller file.')); }, 8000);
    w.onmessage = ({data}) => { clearTimeout(timer); w.terminate(); data.error ? reject(Error(data.error)) : resolve(data); };
    w.onerror = () => { clearTimeout(timer); w.terminate(); reject(Error('The Excel file could not be read.')); };
    w.postMessage(buffer, [buffer]);
  });
  const xml = name => { const t = decoded.files[name]; if (t === undefined) return null; if (/<!DOCTYPE|<!ENTITY/i.test(t)) throw Error('The Excel file contains unsafe XML.'); const doc = new DOMParser().parseFromString(t, 'application/xml'); if (doc.querySelector('parsererror')) throw Error('The Excel file is damaged.'); return doc; };
  const ss = xml('xl/sharedStrings.xml'), strings = ss ? [...ss.getElementsByTagName('si')].map(s => s.textContent) : [];
  const sheet = xml(decoded.sheet);
  if (sheet.getElementsByTagName('f').length) throw Error('The sheet contains formulas. Save a copy with values only (Paste special → Values) and import that copy.');
  const dates = dateStyles(xml('xl/styles.xml'));
  const grid = [];
  for (const c of sheet.getElementsByTagName('c')) {
    const m = c.getAttribute('r')?.match(/^([A-Z]+)(\d+)$/); if (!m) throw Error('The sheet has an invalid cell reference.');
    let col = 0; for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    const row = Number(m[2]); if (row > 41 || col > 40) throw Error('Use at most 40 players (rows) and 40 columns.');
    const type = c.getAttribute('t'); if (type === 'e') throw Error(`Cell ${m[0]} contains an Excel error.`);
    const raw = c.getElementsByTagName('v')[0]?.textContent ?? c.textContent;
    (grid[row - 1] ??= [])[col - 1] = {v: type === 's' ? strings[Number(raw)] : raw, ref: m[0], isDate: type === 'd' || dates.has(Number(c.getAttribute('s') ?? -1)), numericCell: !type || type === 'n'};
  }
  const width = Math.max(0, ...grid.map(r => r?.length ?? 0));
  return table(grid.map(r => Array.from({length: width}, (_, i) => r?.[i] ?? {v: ''})).filter(r => r.some(x => String(x.v).trim())), 'xlsx');
}
function dateStyles(styles) {
  const set = new Set(); if (!styles) return set;
  const custom = new Map([...styles.getElementsByTagName('numFmt')].map(f => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '']));
  const builtin = id => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58);
  const isDate = code => /[ymdhs]/i.test(code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '').replace(/General/gi, ''));
  const xfs = styles.getElementsByTagName('cellXfs')[0];
  [...(xfs ? xfs.getElementsByTagName('xf') : [])].forEach((xf, i) => { const id = Number(xf.getAttribute('numFmtId') ?? 0); if (builtin(id) || (custom.has(id) && isDate(custom.get(id)))) set.add(i); });
  return set;
}
function table(lines, kind) {
  if (lines.length < 2) throw Error('The file needs a header row and at least one player.');
  if (lines.length > 41) throw Error('At most 40 players can be imported.');
  const headers = lines[0].map(c => String(c.v).trim());
  if (headers.some(h => !h)) throw Error('Every column needs a name in the first row.');
  if (new Set(headers.map(norm)).size !== headers.length) throw Error('Two columns have the same name.');
  return {kind, headers, rows: lines.slice(1)};
}

/** Suggested mapping from column names: {fieldKey: {column: index} | {constant: value} | null}. */
export function suggestMapping(headers) {
  const H = headers.map(norm), used = new Set(), map = {};
  for (const f of FIELDS) {
    const i = H.findIndex((h, j) => !used.has(j) && (h === norm(f.key) || f.syn.includes(h)));
    if (i >= 0) { used.add(i); map[f.key] = {column: i}; } else map[f.key] = null;
  }
  return map;
}

/** Apply the mapping and convert every row. Returns per-row results; never throws for row-level problems. */
export function checkRows(parsed, mapping, format) {
  const fmt = parsed.kind === 'xlsx' ? 'decimal-dot' : format; // Excel stores numbers with a decimal point
  const missing = FIELDS.filter(f => f.required && !mapping[f.key]).map(f => f.label);
  if (missing.length) return {fatal: `Match a column or a value for: ${missing.join('; ')}.`};
  const usedCols = new Set(Object.values(mapping).filter(m => m && 'column' in m).map(m => m.column));
  const unused = parsed.headers.filter((h, i) => !usedCols.has(i));
  const refused = unused.filter(h => UNSUPPORTED_FINANCIAL[norm(h)]);
  if (refused.length) return {fatal: `Your file contains financial terms this import cannot use: ${refused.map(h => `“${h}” (${UNSUPPORTED_FINANCIAL[norm(h)]})`).join(', ')}. They would change the result, so LANOVA will not ignore them. Remove these columns, or use a file without them after checking the contracts.`, unused};
  const notes = [];
  const rows = parsed.rows.map((cells, i) => {
    const r = {}, errors = [];
    for (const f of FIELDS) {
      const m = mapping[f.key];
      if (!m) continue;
      if ('constant' in m) { r[f.key] = m.constant; continue; }
      const cell = cells[m.column] ?? {v: ''};
      if (f.numeric && cell.isDate && String(cell.v).trim() !== '') errors.push(`${f.label}: cell ${cell.ref} is formatted as a date in Excel, so its number is a date, not an amount. Enter a plain number.`);
      r[f.key] = String(cell.v ?? '').trim();
    }
    const p = POS[norm(r.position)]; if (p) r.position = p; else if (r.position) r.position = r.position.toUpperCase();
    const d = DEAL[norm(r.dealType)]; if (d) r.dealType = d;
    if (r.registration) r.registration = /^non/i.test(r.registration.replace(/[\s_-]/g, '')) ? 'NON-EU' : /^eu$/i.test(r.registration.trim()) ? 'EU' : r.registration;
    // Field-level checks first, so each message names the field and the value.
    for (const f of FIELDS) if (f.numeric && r[f.key] !== undefined && r[f.key] !== '' && !errors.some(e => e.startsWith(f.label))) {
      try { number(r[f.key], fmt); } catch { errors.push(`${f.label}: “${r[f.key]}” is not a plain number in the chosen format (${fmt === 'decimal-comma' ? '1.234,56' : '1,234.56'}; no “k”, “m” or currency signs).`); }
    }
    for (const f of FIELDS) if (f.required && mapping[f.key] && String(r[f.key] ?? '').trim() === '') errors.push(`${f.label}: empty for this player.`);
    const cur = String(r.currency ?? '').trim().toUpperCase();
    if (cur && cur !== 'EUR' && String(r.exchangeRate ?? '').trim() === '') errors.push(`Currency ${cur} needs an exchange rate (how many EUR one ${cur} is worth). Add an exchange-rate column and match it; LANOVA never looks up rates.`);
    let candidate = null, changes = [];
    if (!errors.length) {
      try {
        const out = convert([r], fmt);
        candidate = out.candidates[0]; changes = out.changes;
        canonicalCandidate({...candidate, id: `row-${i + 1}`}); // the engine's own validation
      } catch (e) { errors.push(e.message.replace(/^Row 1 \([^)]*\): /, '')); candidate = null; }
    }
    return {index: i + 1, name: r.name || `(row ${i + 1})`, raw: r, candidate, changes, errors};
  });
  const names = new Map();
  for (const row of rows) { const k = norm(row.name); if (names.has(k)) row.errors.push(`Same name as row ${names.get(k)}: give each player a unique name.`); else names.set(k, row.index); }
  for (const f of FIELDS) {
    const m = mapping[f.key];
    if (f.required || !m || !('column' in m)) continue;
    const blank = rows.filter(r => String(r.raw[f.key] ?? '') === '').map(r => r.name);
    if (blank.length) notes.push(`${f.label}: empty for ${blank.join(', ')}, so LANOVA uses its standard convention there (${f.conv ?? 'none / no extra cost'}). An explicit 0 is used as 0.`);
  }
  if (unused.length) notes.unshift(`Columns in your file that LANOVA does not use (ignored): ${unused.map(h => `“${h}”`).join(', ')}.`);
  const provided = new Set(FIELDS.filter(f => mapping[f.key]).map(f => f.key));
  const absent = FIELDS.filter(f => !f.required && !provided.has(f.key) && f.key !== 'exchangeRate').map(f => f.label.replace(/ \(.*\)$/, ''));
  if (absent.length) notes.push(`Not in your file, so LANOVA uses its standard conventions: ${absent.join(', ')} — no extra cost, flat wage, fee paid at signing, no planned sale, bad-case resale lowered and good-case resale raised by the standard percentages. Add these columns if they apply.`);
  return {rows, notes, unused, ok: rows.every(x => !x.errors.length)};
}

/** Final candidates with stable ids, built only from rows without errors. */
export function toCandidates(check) {
  return check.rows.map((r, i) => ({...r.candidate, id: `p${i + 1}`}));
}

export const TEMPLATE_CSV = [
  'Player,Position,Deal,Contract seasons,Fee,Gross wage,Wage per,Currency,Expected points,Points per,Registration,Agent fee,Resale value,Sale after season',
  'Example defender (fictional),CB,transfer,3,300000,180000,season,EUR,1.5,season,EU,30000,400000,3',
  'Example striker (fictional),ST,loan,1,50000,20000,month,EUR,1.2,season,NON-EU,0,,',
].join('\n') + '\n';
