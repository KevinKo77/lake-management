/**
 * Home page: a light, live version of the Advantage Lab's Resource Advantage Map. Same engine, same examples, same
 * drawing code as /lanova/advantage/ (lab.js → LANOVA Finance engine; map.js). Illustrative anonymous examples only,
 * all figures invented; nothing is sent or stored.
 */
import {evaluate, fmt, STRATEGIES} from '../lanova/advantage/lab.js';
import {EXAMPLES} from '../lanova/advantage/examples.js';
import {mapSvg} from '../lanova/advantage/map.js';

const box = document.getElementById('home-map');
const TABS = [['semipro', 'Basketball · semi-pro'], ['amateur', 'Rugby · amateur'], ['pro', 'Ice hockey · pro']];
const S = {key: 'semipro', budget: null, model: null};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function load(key) {
  S.key = key; S.model = EXAMPLES[key].make(); S.model.objective = 'development'; S.budget = S.model.finance.decisionBudget;
  render(true);
}
function render(full) {
  const m = S.model; m.finance.decisionBudget = S.budget;
  const r = evaluate(m), narrow = box.clientWidth < 760, base = EXAMPLES[S.key].make().finance.decisionBudget, step = base >= 1e6 ? 50_000 : base >= 1e5 ? 10_000 : 1_000;
  const count = st => r.options.filter(o => o.status === st).length, strat = r.strategies.development;
  const n = strat.best.options.length, pick = strat.status === 'no-feasible' ? 'None feasible' : n ? `${n} option${n > 1 ? 's' : ''}` : 'Do nothing';
  if (full) box.innerHTML = `
    <div class="instrument-bar"><b id="map-title">Resource Advantage Map</b><span>· illustrative anonymous example, invented figures</span></div>
    <div class="instrument-body">
      <div class="seg" role="group" aria-label="Illustrative example">${TABS.map(([k, l]) => `<button type="button" data-ex="${k}" aria-pressed="${k === S.key}">${esc(l)}</button>`).join('')}</div>
      <div class="ctrl"><label for="hm-budget">Budget available for these decisions</label><input id="hm-budget" type="range" min="0" max="${base * 2}" step="${step}" value="${S.budget}"><output for="hm-budget" id="hm-out"></output></div>
      <div id="hm-svg"></div>
      <p class="map-key"><span><i class="k-frontier"></i>Efficient</span><span><i class="k-dominated"></i>Dominated</span><span><i class="k-infeasible"></i>Not feasible</span><span><i class="k-nc"></i>Not comparable</span><span>Vertical: estimated long-term contribution (0–10, the example's own estimate)</span></p>
    </div>
    <div class="readout" aria-live="polite"><div><span>Feasible options</span><b id="hm-feasible"></b></div><div><span>Efficient (not dominated)</span><b id="hm-eff"></b></div><div><span>${esc(STRATEGIES.development.label)}</span><b id="hm-pick"></b><small id="hm-pick-names" class="pick-names"></small></div></div>
    <div class="instrument-foot"><span>Calculated in your browser: Advantage Lab engine and LANOVA Finance engine.</span><a id="hm-open" href="lanova/advantage/?example=${S.key}">Open the full analysis →</a></div>`;
  box.querySelector('#hm-svg').innerHTML = mapSvg(r, m, {narrow, names: box.clientWidth >= 520});
  box.querySelector('#hm-out').textContent = `€${fmt(S.budget)}`;
  box.querySelector('#hm-feasible').textContent = `${r.options.filter(o => o.feasible).length} of ${r.options.length}`;
  box.querySelector('#hm-eff').textContent = String(count('frontier'));
  box.querySelector('#hm-pick').textContent = pick;
  box.querySelector('#hm-pick-names').textContent = strat.best.options.join(' · ');
  box.querySelector('#hm-open').href = `lanova/advantage/?example=${S.key}`;
}
box.addEventListener('click', e => { const b = e.target.closest('button[data-ex]'); if (b) { load(b.dataset.ex); box.querySelector(`button[data-ex="${b.dataset.ex}"]`)?.focus(); } });
box.addEventListener('input', e => { if (e.target.id === 'hm-budget') { S.budget = Number(e.target.value); render(false); } });
let w = 0; addEventListener('resize', () => { if (Math.abs(box.clientWidth - w) > 40) { w = box.clientWidth; render(false); } });
load(S.key); w = box.clientWidth;
