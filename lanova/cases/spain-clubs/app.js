/**
 * Spanish clubs & squads 2026/27 — explorer. Display only: every figure comes from the versioned files in
 * ../spain-data/ (built by scripts/spain/build_spain_data.py). Nothing is estimated, ranked or predicted here.
 * Licences are kept apart: squads, registry and results CC BY-SA 4.0 (OpenFootballBase, from Wikipedia); Wikidata CC0.
 */
const root = document.getElementById('explorer');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const POS = {GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward'};
const QUAL = {VERIFIED: 'Verified listing', INFERRED: 'Inferred', UNVERIFIED: 'Unverified'};
const DIV = {laliga: 'LaLiga', segunda: 'Segunda División'};
const S = {clubs: null, squads: null, coverage: null, results: null, wd: null, division: 'laliga', club: 'es-malaga-cf', pos: 'all', qual: 'all'};
const dateLabel = d => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}) : '—');
const ageAt = (dob, at) => { if (!dob || dob.length < 10) return null; const [y, m, d] = dob.split('-').map(Number), [Y, M, D] = at.split('-').map(Number); return Y - y - (M < m || (M === m && D < d) ? 1 : 0); };

function readUrl() {
  const q = new URLSearchParams(location.search), c = q.get('club'), club = S.clubs.clubs.find(x => x.id === c);
  if (club) { S.club = club.id; S.division = club.competition; } else if (q.get('division') in DIV) { S.division = q.get('division'); S.club = S.clubs.clubs.find(x => x.competition === S.division).id; }
}
function writeUrl() { try { history.replaceState(null, '', `?division=${S.division}&club=${S.club}`); } catch { /* not essential */ } }

function page() {
  const sq = S.squads, c = S.coverage;
  root.innerHTML = `
  <section class="case-section" aria-labelledby="h-pick"><header class="sec-head"><div><h2 id="h-pick">Choose a club</h2><p class="muted">${c.divisions.laliga.clubs} LaLiga and ${c.divisions.segunda.clubs} Segunda División clubs, 2026/27. Data as of ${esc(dateLabel(sq.asOf))}.</p></div></header>
    <div class="pick">
      <div class="seg" role="radiogroup" aria-label="Division">${Object.entries(DIV).map(([k, l]) => `<button type="button" role="radio" data-division="${k}" aria-checked="${S.division === k}">${l}</button>`).join('')}</div>
      <label>Club<select id="club"></select></label>
      <label>Position<select id="pos"><option value="all">All positions</option>${Object.entries(POS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="none">Position not given</option></select></label>
      <label>Status<select id="qual"><option value="all">All statuses</option>${Object.entries(QUAL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
    </div></section>
  <section class="case-section" aria-labelledby="h-club" id="club-panel"></section>
  <section class="case-section" aria-labelledby="h-squad" id="squad-panel"></section>
  <section class="case-section" aria-labelledby="h-results" id="results-panel"></section>
  <section class="case-section" aria-labelledby="h-cov" id="coverage-panel"></section>
  <section class="case-section method" aria-labelledby="h-src" id="sources"></section>`;
  root.addEventListener('click', e => { const b = e.target.closest('[data-division]'); if (b) { S.division = b.dataset.division; S.club = S.clubs.clubs.find(x => x.competition === S.division).id; S.pos = 'all'; S.qual = 'all'; render(); } });
  root.addEventListener('change', e => { if (e.target.id === 'club') { S.club = e.target.value; render(); } if (e.target.id === 'pos') { S.pos = e.target.value; squad(); } if (e.target.id === 'qual') { S.qual = e.target.value; squad(); } });
  coverage(); sources(); render();
}
function render() {
  const sel = document.getElementById('club');
  sel.innerHTML = S.clubs.clubs.filter(c => c.competition === S.division).map(c => `<option value="${c.id}" ${c.id === S.club ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  document.querySelectorAll('[data-division]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.division === S.division)));
  document.getElementById('pos').value = S.pos; document.getElementById('qual').value = S.qual;
  club(); squad(); results(); writeUrl();
}
function club() {
  const c = S.clubs.clubs.find(x => x.id === S.club), cv = S.coverage.clubs.find(x => x.club === S.club);
  document.getElementById('club-panel').innerHTML = `<header class="sec-head"><div><span class="kind obs">Observed</span><h2 id="h-club">${esc(c.name)}</h2><p class="muted">${esc(c.officialName ?? '')} · ${esc(DIV[c.competition])} ${esc(c.season.replace('-', '/'))}${c.city ? ` · ${esc(c.city)}` : ''}${c.founded ? ` · founded ${esc(c.founded.slice(0, 4))}` : ''}</p></div></header>
    <div class="tiles club-tiles"><div><span>Players listed</span><b>${cv.players}</b><em>${cv.verified} verified · ${cv.inferred} inferred · ${cv.unverified} unverified</em></div>
      <div><span>Squad source</span><b class="small-b">${esc(dateLabel(cv.sourceRevisionDate))}</b><em>${esc(c.squadSource.lang)}.wikipedia · revision ${esc(c.squadSource.revid)}</em></div>
      <div><span>Identity</span><b class="small-b">${c.wikidataQid ? `<a href="https://www.wikidata.org/wiki/${esc(c.wikidataQid)}" rel="noopener noreferrer" target="_blank">${esc(c.wikidataQid)}</a>` : '—'}</b><em>LANOVA id ${esc(c.id)}</em></div>
      <div><span>Squad status</span><b class="small-b" data-status="${cv.flags.length ? 'incomplete' : 'listed'}">${cv.flags.length ? 'Incomplete or needs review' : 'Listed squad'}</b><em>${cv.flags.length ? esc(cv.flags.join('; ')) : 'not an official registration list'}</em></div></div>
    <details class="sources"><summary>How this club is identified (${c.verification.length} sources)</summary><ul>${c.verification.map(v => `<li>${esc(v)}</li>`).join('')}</ul><p class="small muted">Also known as: ${esc(c.aliases.join(', ') || '—')}. Names in LANOVA's historical results: ${esc(c.lanovaResultNames.join(', ') || 'none (not in LaLiga 2012/13–2026/27)')}.</p></details>
    ${c.id === 'es-malaga-cf' ? '<p><a class="btn btn-primary small" href="../malaga-winter-2027/">Open the Málaga CF decision case</a></p>' : ''}`;
}
function squad() {
  const all = S.squads.players.filter(p => p.club === S.club), cv = S.coverage.clubs.find(x => x.club === S.club), at = S.squads.asOf;
  const ps = all.filter(p => (S.pos === 'all' || (S.pos === 'none' ? !p.position : p.position === S.pos)) && (S.qual === 'all' || p.quality === S.qual));
  const by = Object.fromEntries(Object.keys(POS).map(k => [k, all.filter(p => p.position === k).length]));
  document.getElementById('squad-panel').innerHTML = `<header class="sec-head"><div><span class="kind obs">Observed</span><h2 id="h-squad">Squad 2026/27</h2><p class="muted">${all.length} players listed · ${Object.entries(by).map(([k, n]) => `${n} ${POS[k].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}${all.some(p => !p.position) ? ` · ${all.filter(p => !p.position).length} without a position` : ''}. Showing ${ps.length}.</p></div></header>
    ${cv.flags.length ? `<div class="notice warn" role="status" data-incomplete="true"><b>This squad is incomplete or needs review:</b> ${esc(cv.flags.join('; '))}.</div>` : ''}
    <div class="table-wrap"><table class="squad"><thead><tr><th class="n">No.</th><th>Player</th><th>Position</th><th>Nationality</th><th class="n">Age</th><th>Status</th><th>Source</th></tr></thead><tbody>
    ${ps.map(p => { const age = ageAt(p.dateOfBirth, at); return `<tr data-player="${esc(p.id)}" data-quality="${p.quality}"><td class="n">${p.shirtNumber ?? '—'}</td>
      <td><details><summary><b>${esc(p.name)}</b>${p.loan ? ' <span class="tag">on loan</span>' : ''}</summary><div class="prov">
        <p>${esc(QUAL[p.quality])}: ${esc(p.qualityReasons.join('; '))}.</p>
        <p>LANOVA player id <span class="mono">${esc(p.id)}</span>${p.wikidataQid ? ` · Wikidata <a href="https://www.wikidata.org/wiki/${esc(p.wikidataQid)}" rel="noopener noreferrer" target="_blank">${esc(p.wikidataQid)}</a>` : ' · no Wikidata item'} · Wikidata membership of this club: ${esc({open: 'open (no end date; not proof of registration)', ended: 'ended', 'no-statement': 'not recorded', 'not-checked': 'not checked yet'}[p.wikidataMembership])}.</p>
        <p>Born: ${p.dateOfBirth ? `${esc(p.dateOfBirth)} (${esc(p.dateOfBirthSource)})` : 'not sourced'}${p.loanFrom ? ` · on loan from ${esc(p.loanFrom)}` : ''} · listed on ${esc(p.listedIn.join(', ') || p.source.lang)} Wikipedia.</p></div></details></td>
      <td>${p.position ? esc(POS[p.position]) : '<span class="muted">not given</span>'}</td><td>${p.nationality ? esc(p.nationality) : '<span class="muted">not given</span>'}</td><td class="n">${age ?? '—'}</td>
      <td><span class="q q-${p.quality.toLowerCase()}">${esc(QUAL[p.quality])}</span></td>
      <td><a href="${esc(p.source.url)}" rel="noopener noreferrer" target="_blank" title="${esc(p.source.title)} — ${esc(p.source.section)}">${esc(p.source.lang)}.wikipedia, ${esc(dateLabel(p.source.revisionDate))}</a></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">No player matches these filters.</td></tr>'}</tbody></table></div>
    <p class="small muted">Nationality is the sporting nationality shown in the squad table. Age is at ${esc(dateLabel(at))}, from Wikidata. No performance metric, market value, wage or predicted contribution is shown or implied.</p>`;
}
function results() {
  const c = S.clubs.clubs.find(x => x.id === S.club), box = document.getElementById('results-panel');
  if (c.competition !== 'laliga') { box.innerHTML = `<header class="sec-head"><div><h2 id="h-results">Results 2026/27</h2></div></header><p class="notice" data-results="none">${esc(S.coverage.results.segunda.note)}</p>`; return; }
  const ms = S.results.matches.filter(m => m.home === S.club || m.away === S.club), done = ms.filter(m => m.status === 'completed'), name = id => S.clubs.clubs.find(x => x.id === id).name;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of done) { const [h, a] = m.score, f = m.home === S.club ? h : a, g = m.home === S.club ? a : h; gf += f; ga += g; if (f > g) w++; else if (f === g) d++; else l++; }
  const comp = S.results.completeness, shown = ms.filter(m => m.status !== 'scheduled').concat(ms.filter(m => m.status === 'scheduled').slice(0, 3));
  box.innerHTML = `<header class="sec-head"><div><span class="kind obs">Observed</span><h2 id="h-results">Results 2026/27</h2><p class="muted">${done.length} played: ${w} won, ${d} drawn, ${l} lost, goals ${gf}–${ga}, ${3 * w + d} points. LaLiga as a whole: ${comp.completed} of ${comp.due} results due by ${esc(dateLabel(S.results.asOf))} available.</p></div></header>
    <div class="table-wrap"><table class="results"><thead><tr><th class="n">MD</th><th>Date</th><th>Match</th><th class="n">Score</th><th>Check</th></tr></thead><tbody>
    ${shown.map(m => `<tr data-status="${m.status}"><td class="n">${m.matchday}</td><td>${esc(dateLabel(m.date))}${m.dateNote ? ` <span class="tag" title="${esc(m.dateNote)}">date?</span>` : ''}</td><td>${esc(name(m.home))} – ${esc(name(m.away))}</td>
      <td class="n">${m.score ? `${m.score[0]}–${m.score[1]}` : `<span class="muted">${m.status === 'missing' ? 'missing' : 'not played yet'}</span>`}</td><td class="small">${esc(m.validation.join('; ') || '—')}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Results: Wikipedia via OpenFootballBase (CC BY-SA 4.0); matchdays 1–7 agree with openfootball (CC0) on all ${comp.agreeWithOpenfootball} results. Dates are as listed in the source. The current-season data gate stays closed (${esc(comp.gateReasons.join('; '))}), so no 2026/27 probability is computed anywhere in LANOVA.</p>`;
}
function coverage() {
  const c = S.coverage, row = x => `<tr data-cov="${x.club}"><td><a href="?division=${x.competition}&club=${x.club}" data-goto="${x.club}">${esc(x.name)}</a></td><td class="n">${x.players}</td><td class="n">${x.verified}</td><td class="n">${x.inferred}</td><td class="n">${x.unverified}</td><td class="n">${x.withShirtNumber}</td><td class="n">${x.withDateOfBirth}</td><td>${esc(dateLabel(x.sourceRevisionDate))}</td><td class="small">${x.flags.length ? esc(x.flags.join('; ')) : 'listed'}</td></tr>`;
  document.getElementById('coverage-panel').innerHTML = `<header class="sec-head"><div><h2 id="h-cov">What is available, inferred or missing</h2><p class="muted">Every club has a listed squad, but a listing is not an official registration list. Quality: <b>verified listing</b> = in the squad of a Wikipedia revision dated after the summer window closed (2 Sep 2026), with no contradiction; <b>inferred</b> = in a source dated before that; <b>unverified</b> = contradictory (two clubs, marked as left, or Wikidata membership ended).</p></div></header>
    <div class="tiles cov-tiles">${Object.entries(c.divisions).map(([k, d]) => `<div data-division-cov="${k}"><span>${DIV[k]}</span><b>${d.players}</b><em>players at ${d.clubsWithSquad}/${d.clubs} clubs · ${d.verified} verified · ${d.inferred} inferred · ${d.unverified} unverified · ${d.clubsFlagged} club(s) flagged</em></div>`).join('')}
      <div><span>Wikidata checked</span><b>${c.wikidata.checked}</b><em>of ${c.wikidata.playersWithQid} players with a Wikidata item (rate-limited service; the rest are marked "not checked yet")</em></div>
      <div><span>LaLiga results</span><b>${c.results.laliga.completed}/${c.results.laliga.due}</b><em>due by ${esc(dateLabel(c.asOf))}; Segunda: none usable</em></div></div>
    <details class="cov-table"><summary>Coverage by club (42)</summary><div class="table-wrap"><table><thead><tr><th>Club</th><th class="n">Players</th><th class="n">Verified</th><th class="n">Inferred</th><th class="n">Unverified</th><th class="n">With No.</th><th class="n">With birth date</th><th>Source dated</th><th>Status</th></tr></thead><tbody>
      ${['laliga', 'segunda'].map(k => `<tr class="div-row"><td colspan="9"><b>${DIV[k]}</b></td></tr>${c.clubs.filter(x => x.competition === k).map(row).join('')}`).join('')}</tbody></table></div></details>
    <ul class="small gaps"><li><b>Absent:</b> shirt numbers for ${S.squads.players.filter(p => p.shirtNumber === null).length} players, positions for ${S.squads.players.filter(p => !p.position).length}, nationality for ${S.squads.players.filter(p => !p.nationality).length}, birth date for ${S.squads.players.filter(p => !p.dateOfBirth).length}; Segunda 2026/27 results; 2 LaLiga results due by the as-of date.</li>
      <li><b>Not in this product:</b> player ratings, minutes, market values, wages, contract lengths, injuries, club logos and player photographs (rights not cleared).</li>
      <li><b>Outdated risk:</b> squads change with transfers; each listing carries its revision date.</li></ul>`;
  document.getElementById('coverage-panel').addEventListener('click', e => { const a = e.target.closest('[data-goto]'); if (!a) return; e.preventDefault(); const cl = S.clubs.clubs.find(x => x.id === a.dataset.goto); S.club = cl.id; S.division = cl.competition; S.pos = 'all'; S.qual = 'all'; render(); document.getElementById('club-panel').scrollIntoView({block: 'start'}); });
}
function sources() {
  const o = S.squads.source.openfootballbase;
  document.getElementById('sources').innerHTML = `<header class="sec-head"><div><h2 id="h-src">Sources and licences</h2></div></header>
    <div class="method-grid"><div><h3>Squads, registry, results — CC BY-SA 4.0</h3><p class="small">${esc(S.squads.attribution[0])}</p><p class="small">Release ${esc(o.release)}, archive SHA-256 <span class="mono">${esc(o.archiveSha256.slice(0, 16))}…</span>, generated ${esc(dateLabel(o.manifestGeneratedAt))}. The derived LANOVA files are shared under the same licence (share-alike): <a href="../spain-data/squads-2026-27.cc-by-sa.json">squads</a>, <a href="../spain-data/clubs-2026-27.cc-by-sa.json">clubs</a>, <a href="../spain-data/results-laliga-2026-27.cc-by-sa.json">results</a>. Licence: <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener noreferrer" target="_blank">CC BY-SA 4.0</a>.</p></div>
      <div><h3>Identities — CC0</h3><p class="small">${esc(S.wd.attribution[0])} <a href="../spain-data/wikidata-2026-27.cc0.json">Wikidata facts used</a>. ${esc(S.wd.note)}</p><p class="small">Fixtures and matchdays 1–7: openfootball/espana (CC0), already used by LANOVA.</p></div>
      <div><h3>Not used</h3><ul class="small"><li>OpenLigaDB (ODbL 1.0): no LaLiga or Segunda 2026/27 league exists (checked 24 Nov 2026).</li><li>Club logos and player photographs: not part of the data licence; not displayed.</li><li>No paid source, no scraping of sites whose terms forbid it.</li></ul></div></div>`;
}
Promise.all(['clubs-2026-27.cc-by-sa.json', 'squads-2026-27.cc-by-sa.json', 'coverage-2026-27.json', 'results-laliga-2026-27.cc-by-sa.json', 'wikidata-2026-27.cc0.json'].map(f => fetch(`../spain-data/${f}`).then(r => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); })))
  .then(([clubs, squads, coverage, results, wd]) => { Object.assign(S, {clubs, squads, coverage, results, wd}); readUrl(); page(); })
  .catch(e => { root.innerHTML = `<div class="notice" role="alert">The data could not be loaded (${esc(e.message)}). Nothing is shown without it.</div>`; });
