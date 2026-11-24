/**
 * Regression check of the Advantage Lab against a baseline commit (default: faa7695, the validated V3 release).
 * Extracts the baseline's lanova/advantage and lanova/finance/engine into a temporary folder (git archive), then
 * evaluates the three illustrative examples with both versions, for every objective and for three budgets, and
 * compares option statuses, feasibility, lowest cash and each strategy's result. Exit code 1 on any difference.
 * Usage (repo root): node scripts/compare-advantage-baseline.mjs [baseline commit]
 */
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const commit = process.argv[2] ?? 'faa769542e0dec49a92aa58c571e567e79a05a16', dir = mkdtempSync(join(tmpdir(), 'advantage-baseline-'));
try {
  const tar = execFileSync('git', ['archive', commit, 'lanova/advantage', 'lanova/finance/engine']);
  execFileSync('tar', ['-x', '-C', dir], {input: tar});
  const url = p => pathToFileURL(p).href;
  const o = await import(url(join(dir, 'lanova/advantage/lab.js'))), oe = await import(url(join(dir, 'lanova/advantage/examples.js')));
  const n = await import(url(resolve('lanova/advantage/lab.js'))), ne = await import(url(resolve('lanova/advantage/examples.js')));
  const pick = r => JSON.stringify({opts: r.options.map(x => [x.id, x.status, x.feasible, Math.round(x.minCashBase), Math.round(x.minCashDownside), x.dominatedBy]),
    s: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [k, [s.status, s.best.ids, s.runnerUp?.ids, +s.best.score.toFixed(9), s.candidates, s.assumptionsNeeded, s.unboundedGains]]))});
  let cases = 0, diffs = 0;
  for (const k of Object.keys(oe.EXAMPLES)) for (const objective of ['immediate', 'development', 'financial']) for (const budget of [1, 0.4, 2]) {
    const mo = oe.EXAMPLES[k].make(), mn = ne.EXAMPLES[k].make(); mo.objective = mn.objective = objective; mo.finance.decisionBudget *= budget; mn.finance.decisionBudget *= budget;
    cases++; if (pick(o.evaluate(mo)) !== pick(n.evaluate(mn))) { diffs++; console.log(`DIFFERENT: ${k}, objective ${objective}, budget ×${budget}`); }
  }
  console.log(`${cases - diffs}/${cases} cases identical to ${commit.slice(0, 7)} (option statuses, feasibility, lowest cash, strategies, scores, candidates, missing data)`);
  process.exitCode = diffs ? 1 : 0;
} finally { rmSync(dir, {recursive: true, force: true}); }
