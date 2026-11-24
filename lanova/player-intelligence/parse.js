/**
 * LANOVA Player Intelligence — parser for the Football.TXT "full" match format (line-ups, substitutions, goals, cards).
 * Pure function, no I/O: works in Node and in the browser. It records only what the text states; it never fills gaps.
 * Each problem found (missing line-up, wrong number of starters, goals that do not add up to the score…) is reported,
 * never silently corrected.
 */
const MONTHS = {Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12};
const pad = n => String(n).padStart(2, '0');
const MINUTE = /^(\d{1,3})(?:\+(\d{1,2}))?'$/;

/** "90+4'" → {raw: "90+4", base: 90, added: 4}. Added time is kept but never used to extend an estimate. */
export function parseMinute(s) {
  const m = MINUTE.exec(s.trim()); if (!m) return null;
  return {raw: s.trim().replace(/'$/, ''), base: Number(m[1]), added: m[2] ? Number(m[2]) : 0};
}
const cleanName = s => s.replace(/\[c\]/g, '').replace(/\s+/g, ' ').trim();

/** Split on a separator that is not inside parentheses. */
function splitTop(s, sep) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += ch;
  }
  out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}

/** "A [c] (58' B (80' C))" → [{name: A, on: null}, {name: B, on: 58'}, {name: C, on: 80'}] (one shirt slot). */
function parseSlot(text) {
  const chain = []; let rest = text.trim(), on = null;
  for (;;) {
    const i = rest.indexOf('(');
    const name = cleanName(i < 0 ? rest : rest.slice(0, i));
    chain.push({name, captain: /\[c\]/.test(i < 0 ? rest : rest.slice(0, i)), on});
    if (i < 0) break;
    const inner = rest.slice(i + 1, rest.lastIndexOf(')')).trim(), m = /^(\d{1,3}(?:\+\d{1,2})?')\s+(.*)$/s.exec(inner);
    if (!m) { chain.push({error: `unreadable substitution "${inner}"`}); break; }
    on = parseMinute(m[1]); rest = m[2];
  }
  return chain;
}

/** Card line "Yellow: A 15', B 20'" → [{name, minute}] */
function parseCards(body) {
  return splitTop(body, ',').map(p => { const m = /^(.*?)\s+(\d{1,3}(?:\+\d{1,2})?')$/.exec(p.trim()); return m ? {name: cleanName(m[1]), minute: parseMinute(m[2])} : {error: `unreadable card "${p}"`}; });
}

/** Scorers of one side: "A 7', B 16', 28', C 45'(p), D 90'(og)" → [{name, minute, kind}] */
function parseGoals(list) {
  const out = []; let last = null;
  for (const piece of list.split(/,\s*/)) {
    const p = piece.trim(); if (!p) continue;
    const only = /^(\d{1,3}(?:\+\d{1,2})?')(?:\((p|og)\))?$/.exec(p), full = /^(.*?)\s+(\d{1,3}(?:\+\d{1,2})?')(?:\((p|og)\))?$/.exec(p);
    if (only && last) out.push({name: last, minute: parseMinute(only[1]), kind: only[2] === 'p' ? 'penalty' : only[2] === 'og' ? 'own_goal' : 'goal'});
    else if (full) { last = cleanName(full[1]); out.push({name: last, minute: parseMinute(full[2]), kind: full[3] === 'p' ? 'penalty' : full[3] === 'og' ? 'own_goal' : 'goal'}); }
    else out.push({error: `unreadable scorer "${p}"`});
  }
  return out;
}

/**
 * Parse a Football.TXT "full" file. Returns {competition, startYear, endYear, matches, problems}.
 * A match: {id, round, date, home, away, score, halfTime, lineups: {home, away}, goals, cards, problems}.
 */
export function parseFullTxt(text) {
  const lines = text.replace(/\r/g, '').split('\n'), problems = [], matches = [];
  const title = (lines.find(l => l.startsWith('= ')) ?? '').slice(2).trim();
  const dm = /# Dates\s+\w+ (\w+) \d+ (\d{4}) - \w+ (\w+) \d+ (\d{4})/.exec(text);
  const startYear = dm ? Number(dm[2]) : null, endYear = dm ? Number(dm[4]) : null;
  if (!dm) problems.push('no "# Dates" header: years cannot be inferred');
  let round = null, date = null, venue = null, cur = null;
  const finish = () => { if (cur) { validate(cur); matches.push(cur); cur = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('▪')) { finish(); round = line.replace(/^▪\s*/, '').trim(); continue; }
    const d = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) (\d{1,2})(?: (\d{4}))?(?:\s+(\d{1,2}:\d{2}))?(.*)$/.exec(line);
    if (d) {
      finish(); const mo = MONTHS[d[1]], y = d[3] ? Number(d[3]) : (mo >= 7 ? startYear : endYear);
      date = y ? `${y}-${pad(mo)}-${pad(Number(d[2]))}` : null;
      const at = /@\s*([^,]+(?:,[^,]+)?)(?:,\s*Att:\s*([\d,]+))?/.exec(d[5] ?? ''); venue = at ? {ground: at[1].trim(), attendance: at[2] ? Number(at[2].replace(/,/g, '')) : null} : null;
      continue;
    }
    const mm = /^\s{2}(\S.*?) v (\S.*?)\s{2,}(\d+)-(\d+)(?:\s+\((\d+)-(\d+)\))?\s*$/.exec(line);
    if (mm) {
      finish();
      cur = {id: `${date}/${mm[1]}-v-${mm[2]}`, round, date, home: mm[1], away: mm[2], score: [Number(mm[3]), Number(mm[4])], halfTime: mm[5] ? [Number(mm[5]), Number(mm[6])] : null,
        venue, lineups: {}, goals: [], cards: [], problems: []};
      // Scorers block: "( home list ; away list )", possibly over several lines.
      let j = i + 1;
      if (j < lines.length && lines[j].trim().startsWith('(')) {
        let block = '';
        while (j < lines.length) { block += ' ' + lines[j].trim(); const open = (block.match(/\(/g) ?? []).length, close = (block.match(/\)/g) ?? []).length; j++; if (open === close) break; }
        const inner = block.trim().slice(1, -1), sides = splitTop(inner, ';');
        if (sides.length > 2) cur.problems.push('scorers block has more than two sides');
        const both = inner.includes(';') ? sides : (cur.score[0] > 0 && cur.score[1] === 0 ? [sides[0], ''] : cur.score[1] > 0 && cur.score[0] === 0 ? ['', sides[0]] : null);
        if (!both) cur.problems.push('scorers block without a side separator for a match where both teams scored');
        else both.forEach((list, k) => { for (const g of parseGoals(list ?? '')) { if (g.error) cur.problems.push(g.error); else cur.goals.push({...g, listedFor: k === 0 ? 'home' : 'away'}); } });
      }
      i = j - 1; continue;
    }
    if (!cur) continue;
    const lu = /^(\S.*?):\s(.*)$/.exec(line);
    if (lu && (lu[1] === cur.home || lu[1] === cur.away)) {
      const side = lu[1] === cur.home ? 'home' : 'away'; let body = lu[2], j = i + 1;
      while (j < lines.length && /^ {6}\S/.test(lines[j])) { body += ' ' + lines[j].trim(); j++; }
      const slots = splitTop(body.replace(/\s+-\s+/g, ', '), ',').map(parseSlot);
      cur.lineups[side] = slots;
      for (const s of slots) for (const x of s) if (x.error) cur.problems.push(x.error);
      while (j < lines.length && /^ {4}(Yellow|Yellow-Red|Red):/.test(lines[j])) {
        const c = /^ {4}(Yellow|Yellow-Red|Red):\s*(.*)$/.exec(lines[j]);
        for (const x of parseCards(c[2])) { if (x.error) cur.problems.push(x.error); else cur.cards.push({side, kind: {Yellow: 'yellow', 'Yellow-Red': 'second_yellow', Red: 'red'}[c[1]], ...x}); }
        j++;
      }
      i = j - 1; continue;
    }
  }
  finish();
  for (const m of matches) for (const p of m.problems) problems.push(`${m.id}: ${p}`);
  const sm = /(\d{4})\/(\d{2})\b/.exec(title), season = sm ? `${sm[1]}/${sm[2]}` : (startYear && endYear && endYear === startYear + 1 ? `${startYear}/${String(endYear).slice(2)}` : null);
  if (!season) problems.push('season cannot be read from the title or the "# Dates" header');
  return {competition: title, season, startYear, endYear, matches, problems};
}

function validate(m) {
  for (const side of ['home', 'away']) {
    const lu = m.lineups[side];
    if (!lu) { m.problems.push(`no line-up for ${side} (${side === 'home' ? m.home : m.away})`); continue; }
    if (lu.length !== 11) m.problems.push(`${side} line-up has ${lu.length} starters, not 11`);
  }
  const forSide = k => m.goals.filter(g => g.listedFor === k).length;
  if (m.goals.length && (forSide('home') !== m.score[0] || forSide('away') !== m.score[1])) m.problems.push(`scorers (${forSide('home')}-${forSide('away')}) do not add up to the score ${m.score[0]}-${m.score[1]}`);
  if (!m.goals.length && (m.score[0] + m.score[1]) > 0) m.problems.push('no scorers listed for a match with goals');
}
