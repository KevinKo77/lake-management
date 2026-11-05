import {analyse} from '../recruitment/engine/analysis.js';
import {canonicalScenario} from '../recruitment/scenario.js';
self.onmessage=({data})=>{try{const scenario=canonicalScenario(data.scenario);const analysis=analyse(scenario.candidates,scenario.context,{nodeLimit:200000,explainExclusions:true});self.postMessage({id:data.id,analysis,scenario});}catch(e){self.postMessage({id:data.id,error:e.message});}};

