// Engine worker for "Try LANOVA": validates the scenario with the engine's own canonicalisation, runs the unchanged
// analysis, then the robustness probes (or, when nothing is feasible, the single-change fixes).
import {analyse} from '../../recruitment/engine/analysis.js';
import {canonicalScenario} from '../../recruitment/scenario.js';
import {robustness, fixes, forceOf} from './explain.js';
self.onmessage = ({data}) => {
  try {
    const scenario = canonicalScenario(data.scenario);
    const analysis = analyse(scenario.candidates, scenario.context, {...forceOf(scenario), nodeLimit: 200000, now: data.now});
    const best = analysis.result.best;
    self.postMessage({id: data.id, scenario, analysis, robustness: best ? robustness(scenario, best.selection) : null, fixes: best ? null : fixes(scenario)});
  } catch (e) { self.postMessage({id: data.id, error: e.message}); }
};
