"""
Reproducible integrity check of the OpenFootballBase-Data release used by LANOVA (data-1.24.6).

  1. Downloads the release archive from its public GitHub release URL (anonymous, read-only), or uses --archive PATH.
  2. Compares the archive SHA-256 with LANOVA's pinned value (evidence/openfootballbase-release.json).
  3. Tries to read the digest GitHub publishes for the release asset (REST API); records the value or the exact blocker.
  4. Checks that the git tag data-1.24.6 points to the pinned release commit (anonymous git read).
  5. Extracts the archive and recomputes the SHA-256 of EVERY file the manifest lists with a hash, in all its groups:
     tables, seasons, work and home (91 files in data-1.24.6). The files LANOVA reads are flagged usedByLanova.
Exits 1 on any mismatch. Writes lanova/cases/spain-data/evidence/openfootballbase-manifest-verification.json (audit log).
Usage (repo root): python3 scripts/spain/verify_ofb_archive.py [--archive PATH]
"""
import argparse, datetime, hashlib, json, os, subprocess, sys, tarfile, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = os.path.join(ROOT, 'lanova', 'cases', 'spain-data', 'evidence')
OUT = os.path.join(EV, 'openfootballbase-manifest-verification.json')
REPO, TAG = 'florentfougeres/OpenFootballBase-Data', 'data-1.24.6'
URL = f'https://github.com/{REPO}/releases/download/{TAG}/openfootballbase-data.tar.gz'
UA = {'User-Agent': 'LANOVA-archive-verification/1.0'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()


def manifest_entries(man):
    """Every (group, name, path, sha256) the manifest lists, whatever the group."""
    out = []
    def walk(o, group, name):
        if isinstance(o, dict):
            if 'path' in o and 'sha256' in o: out.append((group, name, o['path'], o['sha256'])); return
            for k, v in o.items(): walk(v, group, f'{name}/{k}' if name else k)
        elif isinstance(o, list):
            for v in o: walk(v, group, name)
    for group in ('tables', 'seasons', 'work', 'home'):
        walk(man.get(group), group, '')
    return sorted(out, key=lambda e: (e[0], e[2]))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--archive'); a = ap.parse_args()
    pinned = json.load(open(os.path.join(EV, 'openfootballbase-release.json')))
    used = {pinned['season2026_27']['files'][k]['path'] for k in ('squad', 'club_season')}
    log = {'schema': 'lanova-openfootballbase-manifest-verification-v2', 'command': 'python3 scripts/spain/verify_ofb_archive.py',
        'repository': f'https://github.com/{REPO}', 'release': TAG, 'releaseCommit': pinned['releaseCommit'], 'archive': URL,
        'ranAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'steps': []}
    ok = True
    def step(name, result, **kw):
        nonlocal ok
        log['steps'].append({'step': name, 'result': result, **kw}); ok &= result != 'FAIL'
        print(result, name, json.dumps(kw, ensure_ascii=False)[:240])
    with tempfile.TemporaryDirectory() as tmp:
        path = a.archive
        if path: step('download', 'SKIPPED', note=f'local archive given: {os.path.basename(path)}')
        else:
            path = os.path.join(tmp, 'openfootballbase-data.tar.gz')
            try:
                with urllib.request.urlopen(urllib.request.Request(URL, headers=UA), timeout=300) as r, open(path, 'wb') as f:
                    for b in iter(lambda: r.read(1 << 20), b''): f.write(b)
                step('download', 'PASS', bytes=os.path.getsize(path))
            except Exception as e:
                step('download', 'FAIL', error=str(e)); return finish(log, ok)
        digest = sha256(path); log['archiveBytes'] = os.path.getsize(path)
        log['expectedArchiveSha256'], log['observedArchiveSha256'] = pinned['archiveSha256'], digest
        log['archiveSha256Matches'] = digest == pinned['archiveSha256']
        step('archive SHA-256 equals the pinned value', 'PASS' if log['archiveSha256Matches'] else 'FAIL', observed=digest)
        try:
            req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}', headers={**UA, 'Accept': 'application/vnd.github+json'})
            rel = json.load(urllib.request.urlopen(req, timeout=60))
            pub = next((x.get('digest') for x in rel.get('assets', []) if x.get('name') == 'openfootballbase-data.tar.gz'), None)
            step('archive SHA-256 equals the digest published by GitHub', ('PASS' if pub == f'sha256:{digest}' else 'FAIL') if pub else 'BLOCKED', published=pub)
        except Exception as e:
            step('archive SHA-256 equals the digest published by GitHub', 'BLOCKED', blocker=f'GitHub REST API not reachable: {e}', note='not claimed as verified')
        try:
            out = subprocess.run(['git', 'ls-remote', f'https://github.com/{REPO.lower()}', f'refs/tags/{TAG}', f'refs/tags/{TAG}^{{}}'], capture_output=True, text=True, timeout=120).stdout
            refs = {l.split()[1]: l.split()[0] for l in out.splitlines() if l.strip()}
            commit = refs.get(f'refs/tags/{TAG}^{{}}') or refs.get(f'refs/tags/{TAG}')
            step('git tag points to the pinned release commit', 'PASS' if commit == pinned['releaseCommit'] else ('BLOCKED' if not commit else 'FAIL'), tagCommit=commit)
        except Exception as e:
            step('git tag points to the pinned release commit', 'BLOCKED', blocker=str(e))
        x = os.path.join(tmp, 'x'); os.makedirs(x)
        with tarfile.open(path) as t: t.extractall(x, filter='data')
        man = json.load(open(os.path.join(x, 'manifest.json')))
        log['manifestPath'], log['manifestSha256'] = 'manifest.json', sha256(os.path.join(x, 'manifest.json'))
        step('manifest generated_at equals the pinned value', 'PASS' if man['generated_at'] == pinned['manifestGeneratedAt'] else 'FAIL', manifest=man['generated_at'])
        used |= {man['tables'][k]['path'] for k in ('club', 'match', 'birth')}
        files = []
        for group, name, p, h in manifest_entries(man):
            got = sha256(os.path.join(x, p)) if os.path.isfile(os.path.join(x, p)) else None
            files.append({'group': group, 'name': name, 'path': p, 'usedByLanova': p in used, 'expectedSha256': h, 'observedSha256': got})
        bad = [f['path'] for f in files if f['observedSha256'] != f['expectedSha256']]
        by = {g: sum(f['group'] == g for f in files) for g in ('tables', 'seasons', 'work', 'home')}
        log.update({'manifestFileEntries': len(files), 'manifestFileEntriesByGroup': by, 'manifestFileHashesChecked': len(files),
            'manifestFileHashMismatches': len(bad), 'filesUsedByLanova': sum(f['usedByLanova'] for f in files)})
        step('every file the manifest lists with a hash matches it (all groups)', 'PASS' if not bad else 'FAIL', checked=len(files), byGroup=by, mismatches=bad)
        log['verifiedFiles'] = files
    log['limitations'] = ("Byte integrity against the publisher's release and its internal manifest only. It does not establish the truth of the "
        'underlying Wikipedia/Wikidata records, and grants no rights beyond the stated licences. An earlier static log checked 83 files '
        '(tables and seasons); this script checks every hashed entry, including the 7 work files and home.json.')
    return finish(log, ok)


def finish(log, ok):
    log['summary'] = 'PASS' if ok else 'FAIL'
    log['blockers'] = [s['blocker'] for s in log['steps'] if s.get('blocker')]
    with open(OUT, 'w', encoding='utf-8') as f: f.write(json.dumps(log, ensure_ascii=False, indent=1) + '\n')
    print('summary', log['summary'], '| blockers:', log['blockers'] or 'none')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
