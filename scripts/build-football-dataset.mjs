/**
 * Builds the versioned LaLiga dataset used by LANOVA case studies, from a local clone of openfootball/espana
 * (CC0 1.0, public domain dedication: https://github.com/openfootball/espana/blob/master/LICENSE.md).
 *
 * Deterministic: same source commit → same output. For each season it records every match (date, matchday, home,
 * away, goals or null when not played yet), checks the competition format (20 teams, 38 matches each, 19 at home,
 * 380 in total) and stores the SHA-256 of each source file. Nothing is downloaded by this script; it only reads the
 * clone it is given. Match results are facts; no commentary, player data, logo or image is copied.
 *
 * Usage (repo root): node scripts/build-football-dataset.mjs <path to openfootball/espana clone> [--check]
 */
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const MONTHS = {Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12};
const OUT = 'lanova/cases/data/laliga.json';

/** Parses one openfootball season file (both layouts used over the years). */
export function parseSeason(text, startYear) {
  const matches = [], problems = [];
  let matchday = null, date = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('=')) continue;
    const md = line.match(/^▪\s*(?:Matchday|Regular Season\s*-)\s*(\d+)/);
    if (md) { matchday = Number(md[1]); continue; }
    if (/^\s*\(/.test(line) || /^\s{12,}\S/.test(line) && !/\d+-\d+|\sv\s/.test(line)) continue; // goal scorers and their continuation lines
    const d = line.match(/^\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/);
    if (d) { const m = MONTHS[d[1]], y = d[3] ? Number(d[3]) : (m >= 7 ? startYear : startYear + 1); date = `${y}-${String(m).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}`; continue; }
    const body = line.replace(/^\s*\d{1,2}[:.]\d\d\s+/, '').trim();
    let m = body.match(/^(.+?)\s+v\s+(.+?)(?:\s{2,}(\d+)-(\d+)(?:\s*\(\d+-\d+\))?.*)?$/);
    let home, away, hg = null, ag = null;
    if (m) { [home, away] = [m[1].trim(), m[2].trim()]; if (m[3] !== undefined) { hg = Number(m[3]); ag = Number(m[4]); } }
    else {
      m = body.match(/^(.+?)\s{2,}(\d+)-(\d+)(?:\s*\(\d+-\d+\))?\s{2,}(.+?)$/);
      if (!m) { problems.push(`unparsed line: ${line.trim().slice(0, 80)}`); continue; }
      [home, hg, ag, away] = [m[1].trim(), Number(m[2]), Number(m[3]), m[4].trim()];
    }
    if (!date || !matchday) { problems.push(`match before a date or matchday: ${body.slice(0, 60)}`); continue; }
    matches.push({date, matchday, home, away, hg, ag});
  }
  return {matches, problems};
}
/** Checks the competition format: 20 teams, 380 matches, each team 19 home and 19 away. */
export function checkFormat(matches) {
  const p = [], teams = new Map();
  for (const x of matches) for (const [t, side] of [[x.home, 'h'], [x.away, 'a']]) { const s = teams.get(t) ?? {h: 0, a: 0}; s[side]++; teams.set(t, s); }
  if (matches.length !== 380) p.push(`${matches.length} matches (380 expected)`);
  if (teams.size !== 20) p.push(`${teams.size} teams (20 expected): ${[...teams.keys()].join(', ')}`);
  for (const [t, s] of teams) if (s.h !== 19 || s.a !== 19) p.push(`${t}: ${s.h} home and ${s.a} away matches (19 + 19 expected)`);
  const seen = new Set(); for (const x of matches) { const k = `${x.home}|${x.away}`; if (seen.has(k)) p.push(`duplicate fixture ${k}`); seen.add(k); }
  return p;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repo, flag] = process.argv.slice(2);
  if (!repo || !existsSync(join(repo, 'LICENSE.md'))) { console.error('Usage: node scripts/build-football-dataset.mjs <openfootball/espana clone> [--check]'); process.exit(2); }
  const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD']).toString().trim();
  const commitDate = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%cI']).toString().trim();
  const licence = readFileSync(join(repo, 'LICENSE.md'), 'utf8');
  if (!/CC0 1\.0 Universal/.test(licence)) { console.error('The source licence is not CC0 1.0: stopped (data rights gate).'); process.exit(1); }
  const seasons = {}, files = {}, problems = [];
  for (let y = 2012; y <= 2026; y++) {
    const key = `${y}-${String((y + 1) % 100).padStart(2, '0')}`, path = `${key}/1-liga.txt`, abs = join(repo, path);
    if (!existsSync(abs)) { problems.push(`${path}: missing`); continue; }
    const text = readFileSync(abs, 'utf8'); files[path] = createHash('sha256').update(text).digest('hex');
    const {matches, problems: pp} = parseSeason(text, y), fp = checkFormat(matches);
    problems.push(...pp.map(x => `${path}: ${x}`), ...fp.map(x => `${path}: ${x}`));
    matches.sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday || a.home.localeCompare(b.home));
    seasons[key] = {competition: 'Primera División (LaLiga)', played: matches.filter(x => x.hg !== null).length, matches: matches.map(x => [x.date, x.matchday, x.home, x.away, x.hg, x.ag])};
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const out = {schema: 'lanova-football-dataset-v1', source: {name: 'openfootball/espana', url: 'https://github.com/openfootball/espana', commit, commitDate, licence: 'CC0 1.0 Universal (public domain dedication)',
    licenceUrl: 'https://github.com/openfootball/espana/blob/master/LICENSE.md', files}, fields: ['date', 'matchday', 'home', 'away', 'homeGoals', 'awayGoals'],
    notes: 'Match results as published by openfootball at the commit above; null goals = not played in the source at that commit. Team names are kept as in each season file.', seasons};
  const text = JSON.stringify(out) + '\n';
  if (flag === '--check') { const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text; console.log(same ? `${OUT} is identical to a rebuild from ${commit.slice(0, 10)}` : `${OUT} differs from a rebuild from ${commit.slice(0, 10)}`); process.exit(same ? 0 : 1); }
  mkdirSync('lanova/cases/data', {recursive: true}); writeFileSync(OUT, text);
  console.log(`Wrote ${OUT}: ${Object.keys(seasons).length} seasons, ${Object.values(seasons).reduce((a, s) => a + s.matches.length, 0)} fixtures (${Object.values(seasons).reduce((a, s) => a + s.played, 0)} played), from ${commit.slice(0, 10)} (${commitDate}).`);
}
