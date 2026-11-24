"""
Spain Real Football Data V1 — builds LANOVA's 2026/27 Spanish club registry, squad dataset, Wikidata facts, LaLiga
results snapshot and coverage report from pinned, licensed sources. Deterministic for the same inputs (no clock).

Inputs (see lanova/cases/spain-data/README.md for how to obtain them):
  --ofb DIR        extracted OpenFootballBase-Data release data-1.24.6 (archive SHA-256 pinned in evidence/)
  --wikidata FILE  JSON cache of Wikidata entities (wbgetentities), CC0; may be partial: coverage is reported
  --laliga FILE    LANOVA's CC0 openfootball dataset (lanova/cases/data/laliga.json)
Outputs (lanova/cases/spain-data/):
  clubs-2026-27.cc-by-sa.json        42-club registry                         CC BY-SA 4.0
  squads-2026-27.cc-by-sa.json       players by club, provenance, quality     CC BY-SA 4.0
  wikidata-2026-27.cc0.json          Wikidata facts used (QIDs, P54, P569)    CC0 1.0
  results-laliga-2026-27.cc-by-sa.json  2026/27 LaLiga results + validation   CC BY-SA 4.0
  coverage-2026-27.json              coverage by club and division            (LANOVA report)
Usage: python3 scripts/spain/build_spain_data.py --ofb DIR --wikidata FILE [--check]
"""
import argparse, glob, hashlib, json, os, re, sys, unicodedata
import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'lanova', 'cases', 'spain-data')
SEASON, OFB_SEASON, AS_OF, WINDOW_CLOSED = '2026-27', '2026/27', '2026-11-24', '2026-09-02T00:00:00Z'
COMPS = {'ESP-LL': 'laliga', 'ESP-SD': 'segunda'}
ATTR_OFB = 'Squads, club seasons and results: OpenFootballBase-Data release data-1.24.6 (github.com/florentfougeres/OpenFootballBase-Data), derived from Wikipedia by its contributors — CC BY-SA 4.0. Each player cites its Wikipedia page and revision.'
ATTR_WD = 'Identities and facts: Wikidata (www.wikidata.org) — CC0 1.0.'
# openfootball (CC0) spellings used in LANOVA's results, mapped to OpenFootballBase names (identity mapping).
OPENFOOTBALL_ALIAS = {'Athletic Club': 'Athletic Bilbao', 'Club Atlético de Madrid': 'Atlético Madrid', 'Atlético de Madrid': 'Atlético Madrid', 'Atlético Madrid': 'Atlético Madrid',
  'RC Celta de Vigo': 'Celta de Vigo', 'RC Celta': 'Celta de Vigo', 'RC Deportivo La Coruña': 'Deportivo de La Coruña', 'Deportivo La Coruña': 'Deportivo de La Coruña',
  'RCD Espanyol de Barcelona': 'RCD Espanyol', 'Espanyol Barcelona': 'RCD Espanyol', 'RCD Espanyol': 'RCD Espanyol', 'Rayo Vallecano de Madrid': 'Rayo Vallecano', 'Rayo Vallecano': 'Rayo Vallecano',
  'Real Betis Balompié': 'Real Betis', 'Real Betis': 'Real Betis', 'Real Racing Club de Santander': 'Racing de Santander', 'Racing Santander': 'Racing de Santander',
  'Real Sociedad de Fútbol': 'Real Sociedad', 'Real Sociedad': 'Real Sociedad', 'Real Madrid C.F.': 'Real Madrid CF', 'Real Madrid CF': 'Real Madrid CF', 'Real Madrid': 'Real Madrid CF',
  'FC Barcelona': 'FC Barcelona', 'Barcelona': 'FC Barcelona', 'Sevilla FC': 'Sevilla FC', 'Sevilla': 'Sevilla FC', 'Valencia CF': 'Valencia CF', 'Villarreal CF': 'Villarreal CF', 'Villarreal': 'Villarreal CF',
  'CA Osasuna': 'CA Osasuna', 'Deportivo Alavés': 'Deportivo Alavés', 'CD Alavés': 'Deportivo Alavés', 'Elche CF': 'Elche CF', 'Getafe CF': 'Getafe CF', 'Levante UD': 'Levante UD', 'Málaga CF': 'Málaga CF',
  'Girona FC': 'Girona FC', 'RCD Mallorca': 'RCD Mallorca', 'Real Oviedo': 'Real Oviedo', 'Granada CF': 'Granada CF', 'UD Almería': 'UD Almería', 'Cádiz CF': 'Cádiz CF', 'CD Leganés': 'CD Leganés',
  'Real Valladolid CF': 'Real Valladolid', 'Real Valladolid': 'Real Valladolid', 'UD Las Palmas': 'UD Las Palmas', 'SD Eibar': 'SD Eibar', 'Sporting Gijón': 'Sporting de Gijón', 'Córdoba CF': 'Córdoba CF'}


def slug(s):
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def wd_value(snak):
    v = snak.get('datavalue', {}).get('value')
    if isinstance(v, dict) and 'id' in v: return v['id']
    if isinstance(v, dict) and 'time' in v: return v['time']
    return v


def wd_time(statement, prop):
    q = statement.get('qualifiers', {}).get(prop)
    return wd_value(q[0]) if q else None


def dob_of(qid, wd_out, birth):
    """Date of birth: Wikidata P569 read directly, else the Wikidata value carried by the OpenFootballBase birth table."""
    if qid and wd_out.get(qid, {}).get('dateOfBirth'): return {'dateOfBirth': wd_out[qid]['dateOfBirth'], 'dateOfBirthSource': 'Wikidata P569 (read directly)'}
    if qid and qid in birth and birth[qid][0]:
        d, pr = birth[qid]; d = d[:10] if (pr or 11) >= 11 else d[:4]
        return {'dateOfBirth': d, 'dateOfBirthSource': 'Wikidata P569 via OpenFootballBase birth table'}
    return {'dateOfBirth': None, 'dateOfBirthSource': None}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ofb', required=True); ap.add_argument('--wikidata', required=True)
    ap.add_argument('--laliga', default=os.path.join(ROOT, 'lanova/cases/data/laliga.json')); ap.add_argument('--check', action='store_true'); a = ap.parse_args()
    ev = lambda f: json.load(open(os.path.join(OUT, 'evidence', f), encoding='utf-8'))
    rel, revs = ev('openfootballbase-release.json'), ev('wikipedia-revisions.json')['revisions']
    manual = ev('manual-corrections-2026-11-24.json')
    match_corrections = ev('laliga-match-corrections-2026-11-24.json')['corrections']
    position_corrections = {x['wikidataQid']: x for x in manual['positionCorrections']}
    city_corrections = {x['club']: x for x in manual['cityCorrections']}
    man = json.load(open(os.path.join(a.ofb, 'manifest.json')))
    # Integrity: every file used must match the manifest fingerprint.
    used = {}
    for t, meta in [('squad', man['seasons'][OFB_SEASON]['files']['squad']), ('club_season', man['seasons'][OFB_SEASON]['files']['club_season'])] + [(k, man['tables'][k]) for k in ('club', 'match', 'birth')]:
        p = os.path.join(a.ofb, meta['path']); h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        if h != meta['sha256']: sys.exit(f'checksum mismatch: {p}')
        used[t] = {'path': meta['path'], 'sha256': h, 'rows': meta['rows']}
    con = duckdb.connect(); rp = lambda t: f"read_parquet('{os.path.join(a.ofb, used[t]['path'])}')"
    wd = json.load(open(a.wikidata, encoding='utf-8'))
    laliga = json.load(open(a.laliga, encoding='utf-8'))
    of_names = {}
    for s, x in laliga['seasons'].items():
        for r in x['matches']:
            for n in (r[2], r[3]): of_names.setdefault(OPENFOOTBALL_ALIAS.get(n, n), set()).add(n)

    # ---------------------------------------------------------------- registry
    cs = con.execute(f"""SELECT s.competition, s.club, s.players, s.source_lang, s.source_title, s.source_revid, k.wikidata_qid, k.wikipedia_title, k.name_local, k.city, k.founded
        FROM {rp('club_season')} s LEFT JOIN {rp('club')} k ON k.wikipedia_title = s.club WHERE s.competition IN ('ESP-LL','ESP-SD') ORDER BY s.competition, s.club""").fetchall()
    ll_wd = set(json.load(open(os.path.join(OUT, 'evidence', 'wikidata-laliga-2026-27-participants.json')))['P1923'])
    of_2627 = {OPENFOOTBALL_ALIAS.get(n, n) for r in laliga['seasons'][SEASON]['matches'] for n in (r[2], r[3])}
    promo = ev('segunda-2026-27-verification.json')
    clubs = []
    for comp, club, players, slang, stitle, srev, qid, wtitle, local, city, founded in cs:
        e = wd.get(qid, {}) if qid else {}
        labels = {l: e.get('labels', {}).get(l, {}).get('value') for l in ('en', 'es')}
        official = next((wd_value(s['mainsnak']) for s in e.get('claims', {}).get('P1448', []) if s.get('rank') != 'deprecated'), None)
        official = official.get('text') if isinstance(official, dict) else official
        verif = [f'OpenFootballBase club_season {OFB_SEASON} ({comp}), source page {slang}:{stitle} rev {srev}']
        if comp == 'ESP-LL':
            if qid in ll_wd: verif.append('Wikidata Q138806502 (2026–27 La Liga) P1923 participating team')
            if club in of_2627: verif.append('openfootball/espana 2026-27/1-liga.txt fixtures (CC0)')
        else:
            verif.append(promo['clubs'][club])
        aliases = sorted({x for x in [club, wtitle, local, official, labels['en'], labels['es'], *of_names.get(club, set())] if x} - {official or local or club})
        cid = 'es-' + slug(club); city_fix = city_corrections.get(cid)
        if city_fix:
            assert city == city_fix['sourceCity'], f"city correction source changed for {club}: {city}"
            verif.append(f"City corrected from source value {city!r} to {city_fix['correctedCity']} using {city_fix['source']}")
        club_row = {'id': cid, 'name': club, 'officialName': official or local, 'officialNameSource': 'Wikidata P1448' if official else 'OpenFootballBase club.name_local',
            'aliases': aliases, 'competition': COMPS[comp], 'season': SEASON, 'wikidataQid': qid,
            'city': city_fix['correctedCity'] if city_fix else city, 'founded': founded,
            'lanovaResultNames': sorted(of_names.get(club, set())), 'verification': verif, 'verified': len(verif) >= 2,
            'squadSource': {'lang': slang, 'title': stitle, 'revid': srev}}
        if city_fix: club_row['sourceCity'] = city; club_row['cityCorrection'] = city_fix
        clubs.append(club_row)
    ids = [c['id'] for c in clubs]
    assert len(clubs) == 42 and len(set(ids)) == 42 and sum(c['competition'] == 'laliga' for c in clubs) == 20, 'registry must have 20 + 22 distinct clubs'
    by_name = {c['name']: c for c in clubs}

    # ---------------------------------------------------------------- squads
    sq = con.execute(f"""SELECT competition, club, player, player_qid, shirt_number, position, nationality, stint, stint_date, stint_other_club, listed_in, source_section, source_lang, source_title, source_revid
        FROM {rp('squad')} WHERE competition IN ('ESP-LL','ESP-SD') ORDER BY competition, club, shirt_number NULLS LAST, player""").fetchall()
    qid_clubs = {}
    for r in sq:
        if r[3]: qid_clubs.setdefault(r[3], set()).add(r[1])
    birth = {q: (d, pr) for q, d, pr in con.execute(f"SELECT player_qid, birth_date, precision FROM {rp('birth')}").fetchall()}
    players, wd_out = [], {}
    for comp, club, name, qid, num, pos, nat, stint, sdate, sother, listed, section, slang, stitle, srev in sq:
        c = by_name[club]; rv = revs.get(str(srev)); reasons = []
        pid = qid or 'lanova-' + hashlib.sha1(f'{slang}:{stitle}:{name}'.encode()).hexdigest()[:12]
        e = wd.get(qid) if qid else None
        membership = 'not-checked'
        if e is not None:
            st = [s for s in e.get('claims', {}).get('P54', []) if wd_value(s['mainsnak']) == c['wikidataQid'] and s.get('rank') != 'deprecated']
            ends = [wd_time(s, 'P582') for s in st]
            if not st: membership = 'no-statement'
            elif any(x is None for x in ends): membership = 'open'
            elif max(ends)[1:11] < AS_OF: membership = 'ended'
            else: membership = 'open'
            dob = next((wd_value(s['mainsnak']) for s in e.get('claims', {}).get('P569', []) if s.get('rank') != 'deprecated'), None)
            wd_out[qid] = {'label': (e.get('labels', {}).get('en') or e.get('labels', {}).get('es') or {}).get('value'), 'dateOfBirth': dob[1:11] if isinstance(dob, str) else None,
                'lastrevid': e.get('lastrevid'), 'P54': [{'club': wd_value(s['mainsnak']), 'start': (wd_time(s, 'P580') or '')[1:11] or None, 'end': (wd_time(s, 'P582') or '')[1:11] or None} for s in e.get('claims', {}).get('P54', []) if s.get('rank') != 'deprecated']}
        # Quality levels (see README): contradictions first, then the date of the squad source.
        if qid and len(qid_clubs.get(qid, ())) > 1: reasons.append('listed in two clubs\' 2026/27 squads: ' + ' / '.join(sorted(qid_clubs[qid])))
        if stint == 'left_mid': reasons.append('marked as having left during the season')
        if membership == 'ended': reasons.append('Wikidata membership of this club has an end date before ' + AS_OF)
        if reasons: quality = 'UNVERIFIED'
        elif rv and rv['timestamp'] >= WINDOW_CLOSED: quality = 'VERIFIED'; reasons.append(f"listed in the squad section of a revision dated {rv['timestamp'][:10]}, after the summer window closed")
        else: quality = 'INFERRED'; reasons.append(f"squad source revision dated {rv['timestamp'][:10] if rv else 'unknown'}, before the summer window closed")
        player = {'id': pid, 'wikidataQid': qid or None, 'name': name, 'club': c['id'], 'season': SEASON, 'position': pos, 'effectivePosition': pos, 'shirtNumber': num, 'nationality': nat or None,
            **dob_of(qid, wd_out, birth), 'loan': {'loan_in': 'on loan to this club', 'arrived_mid': None, 'left_mid': None}.get(stint) if stint else None,
            'stint': stint, 'stintDate': sdate, 'loanFrom': sother if stint == 'loan_in' else None, 'listedIn': listed.split(',') if listed else [], 'quality': quality, 'qualityReasons': reasons,
            'wikidataMembership': membership, 'registrationStatus': 'not-established',
            'source': {'lang': slang, 'title': stitle, 'revid': srev, 'revisionDate': rv['timestamp'] if rv else None, 'section': section, 'url': f'https://{slang}.wikipedia.org/w/index.php?oldid={srev}'}}
        correction = position_corrections.get(qid)
        if correction:
            assert correction['club'] == c['id'] and correction['name'] == name, f"position correction identity mismatch: {qid}"
            assert correction['sourcePosition'] == pos, f"position correction source changed for {name}: {pos}"
            player['positionCorrection'] = {'sourcePosition': pos, 'correctedPosition': correction['correctedPosition'],
                'officialLabel': correction['officialLabel'], 'evidenceStatus': 'independently-corroborated',
                'source': correction['source'], 'verifiedAt': correction['verifiedAt'], 'reason': correction['reason']}
            player['effectivePosition'] = correction['correctedPosition']
        players.append(player)
    assert set(position_corrections) == {p['wikidataQid'] for p in players if p.get('positionCorrection')}, 'every manual position correction must map to one source row'

    # ---------------------------------------------------------------- results (LaLiga 2026/27)
    mt = con.execute(f"""SELECT match_id, round, match_date, home_club, away_club, ft_home, ft_away, source_ref, result_source FROM {rp('match')}
        WHERE competition='ESP-LL' AND season='{OFB_SEASON}' ORDER BY match_date, home_club""").fetchall()
    of = {(OPENFOOTBALL_ALIAS.get(r[2], r[2]), OPENFOOTBALL_ALIAS.get(r[3], r[3])): r for r in laliga['seasons'][SEASON]['matches']}
    malaga = json.load(open(os.path.join(OUT, 'evidence', 'malaga-verified-line.json')))
    res = []
    for mid, rnd, date, h, aw, fh, fa, sref, rsrc in mt:
        md = int(re.search(r'\d+', rnd).group()); o = of.get((h, aw)); done = fh is not None
        checks = []
        if o and o[4] is not None: checks.append('agrees with openfootball (CC0)' if (o[4], o[5]) == (fh, fa) else 'CONFLICT with openfootball (CC0)')
        mk = f'{md}:{h}:{aw}'
        if mk in malaga['matches']: checks.append('agrees with LANOVA verified Málaga line (S2)' if malaga['matches'][mk]['score'] == [fh, fa] else 'CONFLICT with LANOVA verified Málaga line')
        dnote = malaga['matches'].get(mk, {}).get('dateNote')
        res.append({'id': f"{SEASON}/md{md:02d}/{by_name[h]['id']}-v-{by_name[aw]['id']}", 'matchday': md, 'date': str(date), 'dateKind': 'as listed in the source (actual playing date not independently confirmed)',
            'dateNote': dnote, 'home': by_name[h]['id'], 'away': by_name[aw]['id'], 'status': 'completed' if done else ('missing' if str(date) < AS_OF else 'scheduled'),
            'score': [fh, fa] if done else None, 'source': {'results': 'Wikipedia (via OpenFootballBase match table)' if rsrc == 'wikipedia' else rsrc, 'fixtures': sref},
            'validation': checks or (['single source: not independently verified'] if done else [])})
    # Apply separately sourced corrections after preserving the release's original snapshot values.
    for correction in match_corrections:
        row = next((x for x in res if x['id'] == correction['id']), None)
        assert row, f"match correction target not found: {correction['id']}"
        assert row['status'] == correction['sourceStatus'] and row['date'] == correction['sourceScheduledDate'], f"source snapshot changed for {correction['id']}"
        row['sourceSnapshot'] = {'date': row['date'], 'status': row['status'], 'score': row['score']}
        row['correction'] = correction
        if correction['status'] == 'completed':
            row['date'] = correction['playedOn']; row['dateKind'] = 'actual playing date confirmed by official LaLiga match page'
            row['status'] = 'completed'; row['score'] = correction['score']
            row['validation'] = [f"official LaLiga result page (verified {correction['verifiedAt']})"]
        elif correction['status'] == 'suspended':
            row['status'] = 'suspended'; row['score'] = None
            row['suspension'] = {'interimScore': correction['interimScore'], 'minute': correction['suspendedAtMinute'],
                'resumptionDate': correction['resumptionDate'], 'resumptionTime': correction['resumptionTime']}
            row['dateNote'] = f"Suspended at {correction['suspendedAtMinute']}′ at {correction['interimScore'][0]}–{correction['interimScore'][1]}; resumption scheduled {correction['resumptionDate']}"
            row['validation'] = [f"official Rayo Vallecano status: suspended", f"official LaLiga resumption listing: {correction['resumptionDate']}"]
        else: raise AssertionError(f"unsupported match correction status: {correction['status']}")
    due = [x for x in res if (x.get('sourceSnapshot', {}).get('date') or x['date']) < AS_OF]
    unfinished = [x for x in due if x['status'] != 'completed']
    status_counts = {k: sum(x['status'] == k for x in due) for k in ('completed', 'postponed', 'suspended', 'missing', 'scheduled')}
    comp_rep = {'due': len(due), 'completed': sum(x['status'] == 'completed' for x in due), 'unfinished': [x['id'] for x in unfinished],
        'statusCounts': status_counts, 'missing': [x['id'] for x in due if x['status'] == 'missing'], 'suspended': [x['id'] for x in due if x['status'] == 'suspended'],
        'agreeWithOpenfootball': sum('agrees with openfootball (CC0)' in x['validation'] for x in res), 'conflicts': [x['id'] for x in res if any('CONFLICT' in v for v in x['validation'])],
        'singleSource': sum(x['validation'] == ['single source: not independently verified'] for x in res), 'gate': 'closed'}
    comp_rep['gateReasons'] = ([f"{len(unfinished)} fixture(s) due by {AS_OF} remain unfinished ({', '.join(k for k in ('postponed', 'suspended', 'missing') if status_counts[k])})"] if unfinished else []) + [f"{comp_rep['singleSource']} result(s) from a single, non-authoritative source"]

    # ---------------------------------------------------------------- coverage
    cov = []
    def effective_pos(p): return p['effectivePosition']
    def position_counts(ps, field): return {k: sum((p['position'] if field == 'sourcePosition' else effective_pos(p)) == k for p in ps) for k in ('GK', 'DF', 'MF', 'FW')}
    for c in clubs:
        ps = [p for p in players if p['club'] == c['id']]; q = {k: sum(p['quality'] == k for p in ps) for k in ('VERIFIED', 'INFERRED', 'UNVERIFIED')}
        rv = revs.get(str(c['squadSource']['revid']), {}).get('timestamp')
        flags = []
        if rv and rv < WINDOW_CLOSED: flags.append(f'squad source dated {rv[:10]}, before the summer window closed')
        if sum(1 for p in ps if p['position']) < 20: flags.append('fewer than 20 players with a position')
        if len(ps) > 35: flags.append(f'{len(ps)} players listed: the source may include non-first-team players')
        if q['UNVERIFIED']: flags.append(f"{q['UNVERIFIED']} contradictory player record(s)")
        cov.append({'club': c['id'], 'name': c['name'], 'competition': c['competition'], 'players': len(ps), **{k.lower(): v for k, v in q.items()},
            'withWikidataQid': sum(1 for p in ps if p['wikidataQid']), 'wikidataChecked': sum(1 for p in ps if p['wikidataMembership'] != 'not-checked'),
            'withShirtNumber': sum(1 for p in ps if p['shirtNumber'] is not None), 'withPosition': sum(1 for p in ps if p['position']), 'withNationality': sum(1 for p in ps if p['nationality']),
            'withDateOfBirth': sum(1 for p in ps if p['dateOfBirth']), 'positionCounts': {'source': position_counts(ps, 'sourcePosition'), 'effective': position_counts(ps, 'effectivePosition')},
            'independentlyCorroboratedPositions': sum(1 for p in ps if p.get('positionCorrection')), 'sourceRevisionDate': rv,
            'status': 'incomplete or needs review' if flags else 'listed squad (not an official registration list)', 'flags': flags})
    div = {d: {'clubs': sum(x['competition'] == d for x in cov), 'clubsWithSquad': sum(x['competition'] == d and x['players'] > 0 for x in cov), 'players': sum(x['players'] for x in cov if x['competition'] == d),
        'verified': sum(x['verified'] for x in cov if x['competition'] == d), 'inferred': sum(x['inferred'] for x in cov if x['competition'] == d), 'unverified': sum(x['unverified'] for x in cov if x['competition'] == d),
        'clubsFlagged': sum(1 for x in cov if x['competition'] == d and x['flags']),
        'positionCounts': {k: sum(x['positionCounts']['effective'][k] for x in cov if x['competition'] == d) for k in ('GK', 'DF', 'MF', 'FW')}} for d in ('laliga', 'segunda')}

    # CC BY-SA 4.0 section 3(a)(1)(B): say that the material was modified and keep an indication of the changes.
    MODS = ['Filtered the OpenFootballBase release to LaLiga and Segunda División 2026/27 (competitions ESP-LL, ESP-SD).',
        'Normalized club identities and aliases; mapped clubs to LANOVA ids, Wikidata QIDs and the club names used in LANOVA results.',
        'Added the date of each cited Wikipedia revision, evidence codes with reasons, Wikidata membership checks and dates of birth (Wikidata, CC0).',
        'Recorded dated corrections with the source value kept: 4 Málaga CF positions (positionCorrection / effectivePosition), 2 LaLiga fixtures (sourceSnapshot), 1 club city (sourceCity).',
        "Cross-checked results against openfootball (CC0), LANOVA's verified Málaga CF line and official LaLiga match pages."]
    CODE_NOTE = ('quality is an internal evidence code, not a verification of official status. VERIFIED = dated Wikipedia listing only '
        '(displayed as "Dated Wikipedia listing"); INFERRED = listed in a source dated before the summer window closed; UNVERIFIED = contradictory record. '
        'No player is officially registered in this dataset (registrationStatus = not-established).')
    POSITION_NOTE = ('position is the value of the source snapshot (kept unchanged). effectivePosition is the position LANOVA uses and displays: '
        'the source value, or the officially corroborated value where positionCorrection exists. Consumers must read effectivePosition.')
    meta = {'season': SEASON, 'asOf': AS_OF, 'source': {'openfootballbase': {**{k: rel[k] for k in ('repository', 'release', 'releaseCommit', 'archive', 'archiveSha256', 'manifestGeneratedAt')}, 'files': used}}}
    out = {
        'clubs-2026-27.cc-by-sa.json': {'schema': 'lanova-spain-clubs-v1', 'licence': 'CC BY-SA 4.0', 'attribution': [ATTR_OFB, ATTR_WD], 'modifiedByLanova': True, 'modifications': MODS, **meta, 'clubs': clubs},
        'squads-2026-27.cc-by-sa.json': {'schema': 'lanova-spain-squads-v1', 'licence': 'CC BY-SA 4.0', 'attribution': [ATTR_OFB, ATTR_WD], 'modifiedByLanova': True, 'modifications': MODS, **meta, 'windowClosed': WINDOW_CLOSED[:10],
            'qualityCodeNote': CODE_NOTE, 'positionNote': POSITION_NOTE,
            'registrationPolicy': 'No player is described as officially registered unless a named official registration source is present; none is included in this dataset.',
            'qualityLevels': {'VERIFIED': 'Listed in the squad section of a dated Wikipedia snapshot after the summer window closed, with no contradiction. This verifies a listing only, not a registration.',
                'INFERRED': 'Listed in a squad source dated before the window closed; current membership is not established.', 'UNVERIFIED': 'Contradictory: listed at two clubs, marked as left, or Wikidata membership ended.'},
            'positionCorrections': manual['positionCorrections'],
            'players': players},
        'wikidata-2026-27.cc0.json': {'schema': 'lanova-spain-wikidata-v1', 'licence': 'CC0 1.0', 'attribution': [ATTR_WD], 'season': SEASON, 'asOf': AS_OF,
            'checked': len(wd_out), 'playersWithQid': len(qid_clubs), 'note': 'Facts read from Wikidata (wbgetentities). A membership (P54) without an end date is not treated as proof of a current registration.', 'players': dict(sorted(wd_out.items()))},
        'results-laliga-2026-27.cc-by-sa.json': {'schema': 'lanova-spain-results-v1', 'licence': 'CC BY-SA 4.0', 'attribution': [ATTR_OFB], 'modifiedByLanova': True, 'modifications': MODS, **meta, 'competition': 'laliga',
            'statusDefinitions': {'completed': 'Played and has a final score.', 'scheduled': 'Not yet played; future fixture remains on the schedule.', 'postponed': 'Not played and rescheduled or awaiting a new date.', 'suspended': 'Started but not completed; an interim score is not a final result.', 'missing': 'Past scheduled date with no verified final result or explicit postponement/suspension evidence.'},
            'resultCorrections': match_corrections, 'completeness': comp_rep, 'matches': res},
        'coverage-2026-27.json': {'schema': 'lanova-spain-coverage-v1', **meta, 'countNote': 'verified / inferred / unverified count the internal quality codes: verified = dated Wikipedia listings, not official verification or registration.', 'divisions': div, 'clubs': cov,
            'wikidata': {'playersWithQid': len(qid_clubs), 'checked': len(wd_out), 'membership': {k: sum(p['wikidataMembership'] == k for p in players) for k in ('open', 'ended', 'no-statement', 'not-checked')}},
            'results': {'laliga': comp_rep, 'segunda': {'due': None, 'completed': 0, 'note': 'No usable 2026/27 Segunda results: none in openfootball (CC0), OpenFootballBase (no 2026/27 Segunda match table) or OpenLigaDB (no league).'}}},
    }
    changed = []
    for f, data in out.items():
        text = json.dumps(data, ensure_ascii=False, indent=1, default=str) + '\n'; p = os.path.join(OUT, f)
        if a.check:
            if not os.path.exists(p) or open(p, encoding='utf-8').read() != text: changed.append(f)
        else: open(p, 'w', encoding='utf-8').write(text)
    if a.check: print('reproduced exactly' if not changed else f'differs: {changed}'); sys.exit(1 if changed else 0)
    print(json.dumps({'divisions': div, 'results': comp_rep, 'wikidataChecked': len(wd_out)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
