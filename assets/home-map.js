/**
 * Home page: a light, live version of the Advantage Lab's Resource Advantage Map. Same engine, same examples, same
 * drawing code as /lanova/advantage/ (lab.js → LANOVA Finance engine; map.js). Illustrative anonymous examples only,
 * all figures invented; nothing is sent or stored.
 */
import {evaluate, fmt, STRATEGIES, FINANCIAL_INCOMPLETE} from '../lanova/advantage/lab.js';
import {EXAMPLES} from '../lanova/advantage/examples.js';
import {mapSvg, STATUS} from '../lanova/advantage/map.js';

const box = document.getElementById('home-map');
// Selection labels name the sport only; the level of each illustrative organisation is a detail of its scenario.
const TABS = [['semipro', 'Basketball'], ['amateur', 'Rugby'], ['pro', 'Hockey']];
const S = {key: 'semipro', budget: null, model: null};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function load(key) {
  S.key = key; S.model = EXAMPLES[key].make(); S.model.objective = 'development'; S.budget = S.model.finance.decisionBudget;
  render(true);
}
function render(full) {
  const m = S.model; m.finance.decisionBudget = S.budget;
  const r = evaluate(m), base = EXAMPLES[S.key].make().finance.decisionBudget, step = base >= 1e6 ? 50_000 : base >= 1e5 ? 10_000 : 1_000;
  const count = st => r.options.filter(o => o.status === st).length, strat = r.strategies.development;
  const n = strat.best.options.length, pick = strat.status === 'no-feasible' ? 'None feasible' : n ? `${n} option${n > 1 ? 's' : ''}` : 'Do nothing';
  if (full) box.innerHTML = `
    <div class="instrument-bar hm-head"><div><b id="map-title">Resource Advantage Map</b><span>Illustrative anonymous example · invented figures</span></div>
      <div class="seg" role="group" aria-label="Illustrative example">${TABS.map(([k, l]) => `<button type="button" data-ex="${k}" aria-pressed="${k === S.key}">${esc(l)}</button>`).join('')}</div></div>
    <div class="instrument-body">
      <div class="ctrl"><label for="hm-budget">Budget available for these decisions</label><input id="hm-budget" type="range" min="0" max="${base * 2}" step="${step}" value="${S.budget}"><output for="hm-budget" id="hm-out"></output></div>
      <div class="readout tiles" aria-live="polite"><div><span>Feasible options</span><b id="hm-feasible"></b></div><div><span>Efficient (not dominated)</span><b id="hm-eff"></b></div><div><span>${esc(STRATEGIES.development.label)}</span><b id="hm-pick"></b><small id="hm-pick-names" class="pick-names"></small><small id="hm-fin" class="pick-fin"></small></div></div>
      <div class="hm-grid"><div id="hm-svg"></div>
        <aside class="hm-list" aria-label="Options on the map"><ol id="hm-options"></ol>
          <p class="map-key"><span><i class="k-frontier"></i>Efficient</span><span><i class="k-dominated"></i>Dominated</span><span><i class="k-infeasible"></i>Not feasible</span><span><i class="k-nc"></i>Not comparable</span></p>
          <p class="map-axis">Vertical: estimated long-term contribution (0–10, the example's own estimate). Horizontal: total cost, all commitments.</p></aside></div>
    </div>
    <div class="instrument-foot"><span>Calculated in your browser: Advantage Lab engine and LANOVA Finance engine.</span><a id="hm-open" href="lanova/advantage/?example=${S.key}">Open the full analysis →</a></div>`;
  // The chart shows numbers; the names sit in the list beside it (below it on a phone), never truncated.
  const svgBox = box.querySelector('#hm-svg');
  svgBox.innerHTML = mapSvg(r, m, {narrow: (svgBox.clientWidth || box.clientWidth) < 600, names: false});
  box.querySelector('#hm-options').innerHTML = r.options.map((o, i) => `<li class="${o.status}"><span class="badge">${i + 1}</span><span class="nm">${esc(o.name)}</span><span class="meta">${esc(STATUS[o.status])} · €${fmt(o.totals.totalCost)}</span></li>`).join('');
  box.querySelector('#hm-out').textContent = `€${fmt(S.budget)}`;
  box.querySelector('#hm-feasible').textContent = `${r.options.filter(o => o.feasible).length} of ${r.options.length}`;
  box.querySelector('#hm-eff').textContent = String(count('frontier'));
  box.querySelector('#hm-pick').textContent = pick;
  box.querySelector('#hm-pick-names').textContent = strat.best.options.join(' · ');
  // Same rule as the Advantage Lab: a gain that is not estimable is never read as zero, and the ranking says so.
  box.querySelector('#hm-fin').textContent = strat.financial.incomplete ? `${FINANCIAL_INCOMPLETE}: the gain of ${strat.financial.optionsWithUnknownGain.map(x => x.name).join(', ')} is not estimable, so this choice could change.` : '';
  box.querySelector('#hm-open').href = `lanova/advantage/?example=${S.key}`;
}
box.addEventListener('click', e => { const b = e.target.closest('button[data-ex]'); if (b) { load(b.dataset.ex); box.querySelector(`button[data-ex="${b.dataset.ex}"]`)?.focus(); } });
box.addEventListener('input', e => { if (e.target.id === 'hm-budget') { S.budget = Number(e.target.value); render(false); } });
let w = 0; addEventListener('resize', () => { if (Math.abs(box.clientWidth - w) > 40) { w = box.clientWidth; render(false); } });
load(S.key); w = box.clientWidth;
