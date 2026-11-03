/** Runs the optimisation off the main thread so editing stays responsive. */
import {analyse} from './engine/analysis.js';
import {money} from '../src/format.js';

self.onmessage = event => {
  const {seq, candidates, context, forceInclude, forceExclude, nodeLimit} = event.data;
  try {
    self.postMessage({seq, analysis: analyse(candidates, context, {forceInclude, forceExclude, money, nodeLimit})});
  } catch (error) {
    self.postMessage({seq, error: error.message});
  }
};
