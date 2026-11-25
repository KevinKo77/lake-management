"""
Builds a LANOVA identity registry for LaLiga 2025/26 from the OpenFootballBase-Data release (data-1.24.6):
  - players: Wikidata QID, the name as listed in the dated 2025/26 Wikipedia squad (alias evidence) and the club-season
    affiliation (same evidence). Rows without a QID are left out: they can never be resolved.
  - clubs: LANOVA club id (registry of lanova/cases/spain-data), the OpenFootballBase name, and the name written in the
    Football.TXT file — accepted only when the fixtures align (same date, score and opponent) for at least 36 of the
    club's 38 matches.
The output is CC BY-SA 4.0 (derived from Wikipedia via OpenFootballBase). It is written OUTSIDE the repository by default:
it only serves the local audit of a source whose reuse rights are not established (see SOURCE-RIGHTS.md).

Usage: python3 scripts/player-intelligence/registry_from_ofb.py --ofb DIR --txt FILE --out FILE
"""
import argparse, collections, glob, json, os, re, sys
import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MONTHS = {m: i for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(), 1)}


def txt_matches(path):
    text = open(path, encoding='utf-8').read(); y0, y1 = map(int, re.search(r'# Dates\s+\w+ \w+ \d+ (\d{4}) - \w+ \w+ \d+ (\d{4})', text).groups())
    date, out = None, []
    for line in text.split('\n'):
        d = re.match(r'^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\w{3})\w* (\d{1,2})', line)
        if d: mo = MONTHS[d.group(1)]; date = f"{y0 if mo >= 7 else y1}-{mo:02d}-{int(d.group(2)):02d}"; continue
        m = re.match(r'^\s{2}(\S.*?) v (\S.*?)\s{2,}(\d+)-(\d+)', line)
        if m: out.append((date, m.group(1), m.group(2), int(m.group(3)), int(m.group(4))))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ofb', required=True); ap.add_argument('--txt', required=True); ap.add_argument('--out', required=True); a = ap.parse_args()
    man = json.load(open(os.path.join(a.ofb, 'manifest.json'))); con = duckdb.connect()
    sq = os.path.join(a.ofb, man['seasons']['2025/26']['files']['squad']['path']); mt = os.path.join(a.ofb, man['tables']['match']['path'])
    lanova = {c['name']: c['id'] for c in json.load(open(os.path.join(ROOT, 'lanova/cases/spain-data/clubs-2026-27.cc-by-sa.json')))['clubs']}
    ofb = con.execute(f"SELECT match_date::VARCHAR, home_club, away_club, ft_home, ft_away FROM read_parquet('{mt}') WHERE competition='ESP-LL' AND season='2025/26' AND ft_home IS NOT NULL").fetchall()
    by_key = collections.defaultdict(list)
    for d, h, aw, fh, fa in ofb: by_key[(d, fh, fa)].append((h, aw))
    tm = txt_matches(a.txt)
    votes = collections.defaultdict(collections.Counter)
    for d, h, aw, fh, fa in tm:
        for oh, oa in by_key[(d, fh, fa)]: votes[h][oh] += 1; votes[aw][oa] += 1
    mapping = {t: c.most_common(1)[0][0] for t, c in votes.items()}
    aligned = collections.Counter()
    for d, h, aw, fh, fa in tm:
        if (mapping.get(h), mapping.get(aw)) in by_key[(d, fh, fa)]: aligned[h] += 1; aligned[aw] += 1
    clubs, problems = [], []
    for t, club in sorted(mapping.items()):
        n = sum(1 for m in tm if t in (m[1], m[2]))
        if aligned[t] < 36 or club not in lanova: problems.append(f'{t}: {aligned[t]}/{n} fixtures aligned with {club}'); continue
        clubs.append({'id': lanova[club], 'names': [{'name': club, 'source': 'OpenFootballBase club name (Wikipedia page title)'},
            {'name': t, 'source': f'fixture alignment: {aligned[t]}/{n} matches of "{t}" in the Football.TXT file have the same date, score and opponent as {club} in the OpenFootballBase match table'}]})
    rows = con.execute(f"SELECT player_qid, player, club, position, source_title, source_revid FROM read_parquet('{sq}') WHERE competition='ESP-LL' AND player_qid IS NOT NULL AND player_qid <> '' ORDER BY player_qid, club").fetchall()
    players = {}
    for qid, name, club, pos, title, revid in rows:
        if club not in lanova: problems.append(f'squad club {club} not in the LANOVA registry'); continue
        src = f'Wikipedia squad listing "{title}" rev {revid} (via OpenFootballBase data-1.24.6, CC BY-SA 4.0)'
        p = players.setdefault(qid, {'id': qid, 'displayName': name, 'sourcePosition': pos or None, 'effectivePosition': pos or None, 'externalIds': {'wikidata': qid}, 'aliases': [], 'affiliations': []})
        if not any(x['name'] == name for x in p['aliases']): p['aliases'].append({'name': name, 'source': src})
        p['affiliations'].append({'club': lanova[club], 'season': '2025/26', 'source': src})
        if p['sourcePosition'] != (pos or None): p['sourcePosition'] = p['effectivePosition'] = None   # conflicting listings: no position
    reg = {'schema': 'lanova-player-registry-v1', 'synthetic': False, 'season': '2025/26', 'licence': 'CC BY-SA 4.0 (Wikipedia via OpenFootballBase) + Wikidata CC0 identifiers',
        'clubs': clubs, 'players': [players[k] for k in sorted(players)], 'problems': problems}
    json.dump(reg, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(clubs)} clubs mapped, {len(players)} players with QID; problems: {problems or "none"}')


if __name__ == '__main__':
    main()
