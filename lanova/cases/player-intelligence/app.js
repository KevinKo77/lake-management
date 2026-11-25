/**
 * Player Intelligence V1 — interface. Display only: every figure comes from demo-data/demo-facts.json, built by
 * scripts/player-intelligence/build_player_facts.mjs from a FICTIONAL fixture. The engines (identity, facts, comparison,
 * integration contract, report) live in ../../player-intelligence/ and are tested independently.
 */
import {compare, filterByPosition, PER90_MIN_MINUTES} from '../../player-intelligence/compare.js';
import {buildPlayerContext, validateContext} from '../../player-intelligence/contract.js';
import {comparisonReport} from '../../player-intelligence/report.js';

const root = document.getElementById('pi');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const POS = {GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward'};
const S = {data: null, audit: null, q: '', club: 'all', season: 'all', pos: 'all', status: 'all', profile: null, selected: []};
const nameOf = r => r.displayName ?? r.nameAsWritten;
const fmtN = v => (v === null || v === undefined ? '<span class="muted">not available</span>' : esc(Number(v).toLocaleString('en-GB')));
const posCell = r => (r.effectivePosition ? `${esc(POS[r.effectivePosition])}${r.sourcePosition && r.sourcePosition !== r.effectivePosition ? ` <span class="small muted">(source: ${esc(POS[r.sourcePosition])})</span>` : ''}` : '<span class="muted">not documented</span>');
const idBadge = r => `<span class="id-${r.identity.status}" data-identity="${r.identity.status}">${esc(r.identity.status.toLowerCase())}${r.identity.confidence ? ` · ${esc(r.identity.confidence)} confidence` : ''}</span>`;

function readUrl() {
  const q = new URLSearchParams(location.search), keys = new Set(S.data.players.map(p => p.key));
  if (keys.has(q.get('player'))) S.profile = q.get('player');
  S.selected = (q.get('compare') ?? '').split(',').filter(k => keys.has(k));
}
function writeUrl() {
  const q = new URLSearchParams(); if (S.profile) q.set('player', S.profile); if (S.selected.length) q.set('compare', S.selected.join(','));
  try { history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname); } catch { /* not essential */ }
}

function shell() {
  const d = S.data, clubs = [...new Map(d.players.map(p => [p.club.id ?? p.club.nameAsWritten, p.club.nameAsWritten])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  root.innerHTML = `
  <section class="case-section" aria-labelledby="h-search"><header class="sec-head"><div><span class="kind obs">Observed</span><h2 id="h-search">1 · Player search</h2>
    <p class="muted">${esc(d.competition)} · ${d.players.length} player-club records from ${d.validation.matches} matches. Search by name or identifier, club, season, position or identity status.</p></div></header>
    <form class="pi-search" onsubmit="return false"><label>Name or identifier<input id="q" type="search" autocomplete="off" placeholder="e.g. Escovar or SYN-A10"></label>
      <label>Club<select id="club"><option value="all">All clubs</option>${clubs.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label>
      <label>Season<select id="season"><option value="all">All seasons</option>${[...new Set(d.players.map(p => p.season))].map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
      <label>Position<select id="pos"><option value="all">All positions</option>${Object.entries(POS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Identity<select id="status"><option value="all">All</option><option value="RESOLVED">Resolved</option><option value="AMBIGUOUS">Ambiguous</option><option value="UNRESOLVED">Unresolved</option></select></label></form>
    <div id="results"></div></section>
  <section class="case-section" id="profile-panel" aria-labelledby="h-profile"></section>
  <section class="case-section" id="compare-panel" aria-labelledby="h-compare"></section>
  <section class="case-section" id="sources" aria-labelledby="h-src"></section>`;
  root.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; results(); } });
  root.addEventListener('change', e => { if (['club', 'season', 'pos', 'status'].includes(e.target.id)) { S[e.target.id] = e.target.value; results(); } if (e.target.matches('[data-select]')) toggle(e.target.dataset.select, e.target.checked); });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (b) { S.profile = b.dataset.open; profile(); writeUrl(); document.getElementById('profile-panel').scrollIntoView({block: 'start'}); }
    const x = e.target.closest('[data-unselect]'); if (x) toggle(x.dataset.unselect, false);
    if (e.target.closest('[data-export="report"]')) exportReport();
    if (e.target.closest('[data-export="context"]')) exportContext();
  });
}
function filtered() {
  const q = S.q.trim().toLowerCase(), base = S.data.players.filter(p => (!q || [p.key, p.playerId, p.displayName, p.nameAsWritten, ...p.spellings].some(v => v && String(v).toLowerCase().includes(q)))
    && (S.club === 'all' || (p.club.id ?? p.club.nameAsWritten) === S.club) && (S.season === 'all' || p.season === S.season) && (S.status === 'all' || p.identity.status === S.status));
  return filterByPosition(base, S.pos).kept;
}
function results() {
  const rows = filtered();
  document.getElementById('results').innerHTML = `<p class="small muted" data-count="${rows.length}">${rows.length} record(s). Tick at least two to compare.</p>
    <div class="table-wrap"><table class="pi-results"><thead><tr><th>Player (as identified)</th><th>Club · season</th><th>Position</th><th>Identity</th><th class="n">Apps</th><th>Compare</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-key="${esc(r.key)}"><td><button class="linklike" type="button" data-open="${esc(r.key)}">${esc(nameOf(r))}</button>${r.playerId ? ` <span class="small muted mono">${esc(r.playerId)}</span>` : ''}</td>
      <td>${esc(r.club.nameAsWritten)} · ${esc(r.season)}</td><td>${posCell(r)}</td><td>${idBadge(r)}</td><td class="n">${r.observed.appearances}</td>
      <td><label class="small"><input type="checkbox" data-select="${esc(r.key)}" ${S.selected.includes(r.key) ? 'checked' : ''}> compare</label></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No record matches these filters.</td></tr>'}</tbody></table></div>`;
}
function toggle(key, on) { S.selected = on ? [...new Set([...S.selected, key])] : S.selected.filter(k => k !== key); results(); comparison(); writeUrl(); }

function profile() {
  const box = document.getElementById('profile-panel'), r = S.data.players.find(p => p.key === S.profile);
  if (!r) { box.innerHTML = `<header class="sec-head"><div><h2 id="h-profile">2 · Player profile</h2><p class="muted">Choose a player in the search results.</p></div></header>`; return; }
  const o = r.observed, m = r.derived.minutesEstimate, id = r.identity;
  box.innerHTML = `<header class="sec-head"><div><span class="kind obs">Observed</span><h2 id="h-profile">2 · ${esc(nameOf(r))}</h2>
    <p class="muted">${esc(r.club.nameAsWritten)} · ${esc(r.season)} · ${posCell(r)} · ${idBadge(r)}. Historical observations: they do not describe current or future performance.</p></div></header>
    <div class="tiles" data-profile="${esc(r.key)}">
      <div><span>Appearances <i class="cat cat-OBSERVED">observed</i></span><b data-f="appearances">${o.appearances}</b><em>${o.starts} starts · ${o.substituteAppearances} as substitute · ${o.substitutedOff} substituted off</em></div>
      <div><span>Goals <i class="cat cat-OBSERVED">observed</i></span><b data-f="goals">${o.goals}</b><em>${o.penaltyGoals} penalties · ${o.ownGoals} own goal(s) not counted</em></div>
      <div><span>Cards <i class="cat cat-OBSERVED">observed</i></span><b data-f="cards">${o.yellowCards} / ${o.secondYellowCards} / ${o.redCards}</b><em>yellow / second yellow / straight red${o.cardsWithoutAppearance ? ` · ${o.cardsWithoutAppearance} while not on the pitch` : ''}</em></div>
      <div><span>Estimated minutes <i class="cat cat-DERIVED">derived</i></span><b data-f="minutes">${m.value.toLocaleString('en-GB')}</b><em>estimate, lower bound: added time ignored${m.matchesWithDismissal ? ` · ${m.matchesWithDismissal} dismissal(s)` : ''}${m.matchesWithAddedTimeIgnored ? ` · ${m.matchesWithAddedTimeIgnored} added-time minute(s) ignored` : ''}</em></div></div>
    <p class="small"><b>Unavailable</b> (not in the source, never shown as a number):</p><ul class="unavail" data-unavailable>${S.data.unavailable.map(u => `<li>${esc(u)}</li>`).join('')}</ul>
    ${r.inconsistencies.length ? `<div class="notice warn" data-inconsistent><b>Inconsistent source records:</b><ul>${r.inconsistencies.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <details class="cov-table"><summary>Match log (${r.matches.length})</summary><div class="table-wrap"><table><thead><tr><th>Date</th><th>Match</th><th>Role</th><th>On</th><th>Off</th><th class="n">Est. minutes</th><th>Ends</th></tr></thead><tbody>
      ${r.matches.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.match.split('/')[1].replace(/-v-/, ' – '))}</td><td>${esc(x.role)}</td><td>${esc(x.on ?? '—')}</td><td>${esc(x.off ?? '—')}</td><td class="n">${x.minutesEstimate}</td><td class="small">${esc(x.endBy)}</td></tr>`).join('')}</tbody></table></div></details>
    <h3>Evidence</h3><ul class="evidence small" data-evidence>
      <li><b>Identity:</b> ${esc(id.status)}${id.confidence ? ` (${esc(id.confidence)} confidence)` : ''} — ${esc(id.reason)}.</li>
      ${id.evidence.map(e => `<li>${e.kind === 'alias' ? `Name “${esc(e.value)}” — ${esc(e.match)}; source: ${esc(e.source)}` : `Affiliation ${esc(e.club)} ${esc(e.season)}; source: ${esc(e.source)}`}</li>`).join('')}
      ${id.candidates.length > 1 ? `<li>Candidates not chosen: ${id.candidates.map(esc).join(', ')}</li>` : ''}
      ${id.nameOnlyMatches?.length ? `<li>Same name documented elsewhere (not used as evidence): ${id.nameOnlyMatches.map(esc).join(', ')}</li>` : ''}
      <li>Spellings in the source: ${r.spellings.map(esc).join(', ')}</li>
      <li>Source: ${esc(S.data.source.description)} · SHA-256 <span class="mono">${esc(S.data.source.sha256.slice(0, 16))}…</span></li></ul>`;
}

function comparison() {
  const box = document.getElementById('compare-panel'), recs = S.selected.map(k => S.data.players.find(p => p.key === k));
  if (recs.length < 2) { box.innerHTML = `<header class="sec-head"><div><h2 id="h-compare">3 · Comparison</h2><p class="muted">Tick at least two records in the search results (${recs.length} selected).</p></div></header>`; return; }
  const c = compare(recs, {unavailable: S.data.unavailable});
  box.innerHTML = `<header class="sec-head"><div><span class="kind obs">Observed</span> <span class="kind est">Derived</span><h2 id="h-compare">3 · Comparison (${recs.length})</h2>
    <p class="muted">Each measure stands on its own. ${esc(c.note)} Per-90 rates need at least ${PER90_MIN_MINUTES} estimated minutes for every record.</p></div></header>
    <div class="table-wrap"><table class="cmp" data-compare><thead><tr><th>Measure</th>${c.players.map(p => `<th>${esc(p.label)}<br><span class="small muted">${esc(p.club)} · ${esc(p.season)} · ${p.effectivePosition ? esc(POS[p.effectivePosition]) : 'no position'}${p.sourcePosition && p.sourcePosition !== p.effectivePosition ? ` (source: ${esc(POS[p.sourcePosition])})` : ''}</span><br><button class="linklike small" type="button" data-unselect="${esc(p.key)}">remove</button></th>`).join('')}</tr></thead><tbody>
      ${c.measures.map(m => `<tr data-measure="${m.id}"><td>${esc(m.label)} <i class="cat cat-${m.category}">${m.category.toLowerCase()}</i>${m.note ? `<br><span class="small muted">${esc(m.note)}</span>` : ''}</td>${m.values.map(v => `<td class="v">${fmtN(v.value)}</td>`).join('')}</tr>`).join('')}
      <tr><td>Unavailable <i class="cat cat-UNAVAILABLE">unavailable</i></td><td colspan="${recs.length}" class="small muted">${esc(c.unavailable.join(', '))}</td></tr></tbody></table></div>
    <ul class="warns small" data-warnings>${c.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    <div class="pi-actions"><button class="btn btn-primary small" type="button" data-export="report">Export comparison report (HTML)</button><button class="btn btn-ghost small" type="button" data-export="context">Export decision context (JSON)</button></div>
    <details class="sources"><summary>Integration with recruitment scenarios (contract V1)</summary>
      <p class="small">Each selected record can be handed to a recruitment scenario as <b>context</b>: identity, evidence and historical facts. Transfer fee, wage, revenue, resale and sporting priority stay <b>empty until you type them</b>; LANOVA infers no valuation and no sporting impact. Unresolved identities cannot become scenario candidates.</p>
      <pre class="ctx" data-context>${esc(JSON.stringify(contexts().map(x => ({identity: x.identity.name, status: x.status, userAssumptions: x.userAssumptions})), null, 1))}</pre></details>`;
}
const contexts = () => S.selected.map(k => buildPlayerContext(S.data.players.find(p => p.key === k), {dataset: S.data}));
function download(name, type, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); }
function exportReport() {
  const recs = S.selected.map(k => S.data.players.find(p => p.key === k));
  download('lanova-player-comparison.html', 'text/html', comparisonReport(compare(recs, {unavailable: S.data.unavailable}), S.data, {generatedAt: new Date().toISOString().slice(0, 10)}));
}
function exportContext() {
  const ctx = contexts(), errors = ctx.flatMap(validateContext);
  if (errors.length) { alert(`Export refused: ${errors.join('; ')}`); return; }
  download('lanova-player-context.json', 'application/json', JSON.stringify({schema: 'lanova-player-context-export-v1', contexts: ctx}, null, 1));
}

function sources() {
  const d = S.data, a = S.audit, ia = d.identityAudit;
  document.getElementById('sources').innerHTML = `<header class="sec-head"><div><h2 id="h-src">4 · Sources, rights and limits</h2></div></header>
    <div class="method-grid">
      <div><h3>This page: demonstration data</h3><p class="small" data-approved="${esc(S.digest)}">${esc(d.source.description)}. Licence: ${esc(d.source.licence)}. Shown because its SHA-256 (<span class="mono">${esc(S.digest.slice(0, 12))}…</span>) is the fictional fixture approved in the publication policy. Identity audit: ${ia.resolved} resolved, ${ia.ambiguous} ambiguous, ${ia.unresolved} unresolved, ${ia.conflict} conflict, of ${ia.records} records. ${d.validation.inconsistencies.length} inconsistent source record(s) are shown, not corrected.</p></div>
      <div><h3>Real LaLiga 2025/26: withheld</h3><p class="small" data-rights="${esc(a?.decision ?? '')}"><b>${esc(a?.decision ?? 'audit not loaded')}</b>. ${esc(a?.decisionReason ?? '')}</p>
        ${a ? `<p class="small">Parser check on the real file (aggregates only, ${esc(a.auditedOn)}): ${a.parserReconciliation.matches} matches, ${a.parserReconciliation.appearances.toLocaleString('en-GB')} appearances, ${a.parserReconciliation.goalsExcludingOwnGoals.toLocaleString('en-GB')} goals — identical to an independent parse. Identity: ${a.identityAudit.resolved} of ${a.identityAudit.playerClubRecords} records resolved with evidence, ${a.identityAudit.unresolved} left unresolved.</p>` : ''}</div>
      <div><h3>How minutes are estimated</h3><p class="small">${esc(d.minutesMethod.formula)}.</p><ul class="small">${d.minutesMethod.limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div></div>
    <p class="small muted">Player Intelligence describes history. It does not rate players, value them, predict their performance or recommend a signing. Position and nationality are never treated as evidence of ability.</p>`;
}

// Fail closed: the dataset is shown only if its exact bytes are the output the reviewed publication policy approves as a
// fictional fixture. A "synthetic" flag inside the file is not trusted on its own.
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const get = f => fetch(f).then(r => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r; });
Promise.all([get('demo-data/demo-facts.json').then(r => r.arrayBuffer()), get('../../player-intelligence/publication-policy.json').then(r => r.json()), get('../../player-intelligence/evidence/source-audit-laliga-2025-26.json').then(r => r.json())])
  .then(async ([bytes, policy, audit]) => {
    const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
    const ok = policy?.defaultDecision === 'DENY' && policy.approvals?.some(a => a.kind === 'fictional-fixture' && a.outputPath === 'lanova/cases/player-intelligence/demo-data/demo-facts.json' && a.outputSha256 === digest);
    if (!ok) throw new Error('this dataset is not an approved fictional fixture (publication policy) — not shown');
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data.synthetic) throw new Error('only the fictional demonstration dataset may be shown here');
    S.data = data; S.audit = audit; S.digest = digest; readUrl(); shell(); results(); profile(); comparison(); sources();
  })
  .catch(e => { root.innerHTML = `<p class="notice warn" role="alert" data-refused>The dataset could not be shown (${esc(e.message)}).</p>`; });
