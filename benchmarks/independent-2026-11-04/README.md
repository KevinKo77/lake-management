# Independent benchmark — preliminary evidence, incomplete

Source inspected: lake-management main at 700a11feb199c82469e23e01b57c743eaf885d61. No application files changed. No production writes or paid services.

Run from repository root: `node benchmarks/independent-2026-11-04/run.mjs` (Node 24). This overwrites only generated benchmark JSON in this directory. Three importable fictional scenarios and raw per-repetition timings accompany the runner.

## Scope and independence

The runner independently enumerates all 64 subsets for each six-option, one-season football window. Its reference arithmetic does not call the application's economics, evaluator, brute-force routine or optimizer. It compares the reference winner with the real optimizer, including selection, objective, NPV, upfront expenditure, closing downside cash and squad cost. All revenues and resale values in these deliberately restricted cases are zero. Candidate point estimates are synthetic assumptions, not predictions.

One warmup and 20 measured repetitions per case execute sequentially in one Node process. Raw preparation, engine and reference enumeration elapsed milliseconds, environment and timestamp are in results.json. These are machine execution timings only. They exclude human setup, input, change and reporting time, browser startup, Excel calculation, and professional analyst performance. No speed claim is supported.

## Numeric scorecard

All amounts EUR; objective in EUR except promotion case (points).

| Case | Feasible subsets | Objective | NPV | Upfront | Closing cash | Reference matches |
|---|---:|---:|---:|---:|---:|---|
| Balanced | 13 | 1,555,454.55 | -2,317,272.73 | 1,490,000 | 600,000 | Yes |
| Survival | 1 | 95,454.55 | -1,140,909.09 | 750,000 | 320,000 | Yes |
| Promotion | 3 | 4.8 | -1,872,727.27 | 1,300,000 | 1,070,000 | Yes |

Zero-transfer-budget edits return no feasible portfolio in both implementations. Canonical JSON round trips and decision-state unit checks pass (changed key blocks export, invalidation clears accepted result, late worker response rejected). These are unit checks, not browser export/download or event-wiring verification.

## Inspected engine contract

Permanent, free and loan deals; eight positions; contract and planning lengths 1–6 seasons. Scenario layer caps candidates at 40, imports at 1 MB, saved comparisons at three. Input normalization rejects invalid contract lengths, negative costs, inconsistent resale bounds and invalid instalment totals. Fees, agent costs and signing-bonus instalments are paid at season starts; wages, revenue, bonuses and sale proceeds at season ends. Accounting amortization differs from cash payments. Early exits may accelerate signing bonuses, trigger release compensation and retain unpaid fee instalments.

Objectives include base NPV, downside NPV, points, and blended NPV plus discounted point value. Points diminish within position and season. Constraints include upfront transfer budget, seasonal squad cost, downside cash floor plus reserve, gross lifetime commitments, downside loss, registration, non-EU slots, maximum signings, positional needs, exclusive options and optional minimum NPV. Search has a node budget and reports whether optimality is proven. Full economic life can extend beyond the constraint horizon: this requires explicit reconciliation in further work.

## Manual method and fair Excel protocol still to execute

For these small cases a documented manual procedure is to list the 64 binary selections, reject those violating position, registration, budget, squad-cost and cash requirements, compute remaining objectives and apply the secondary objective on a tie. The reference automates this enumeration; no person was timed performing it.

Construct Excel from the same canonical inputs with separate dated cash and accounting schedules and editable binary selection cells. Use exhaustive subset enumeration for these small cases (an exact optimization equivalent), or Solver with a formulation that handles position-dependent point ranks. Excel can express diminishing returns; a simplistic additive comparator would be unfair. Compare all schedules and constraint slack, not just winner names. Do not report external JavaScript enumeration as Excel execution.

Before any commercial claim, extend to multi-season instalments, resale haircuts, early sale/release, exclusive loan/permanent alternatives, post-horizon obligations and binding risk constraints. Execute Excel, test actual browser scenario edits, CSV/memo downloads and stale responses, check deployed/source parity, and measure setup, computation, edits and reporting separately. Record automated versus human activity explicitly and retain raw timings. Re-run unchanged baselines and controlled edits in balanced order on the same environment; use at least 20 computation repetitions and report median and spread. Human performance remains unmeasured unless real participants complete a separately documented study.

## Commercial recommendation

No substantiated LANOVA-versus-Excel winner yet. The limited source execution checks support arithmetic agreement for these three narrow cases only. Excel is mathematically capable of tying exact results here and offers inspectable cell-level schedules and flexible custom assumptions; those are capabilities, not measured wins. LANOVA may reduce workflow assembly effort through its integrated constraints and reports, but that advantage remains unmeasured. Do not market analyst time savings, superior optimization or team performance from this evidence.

## Outstanding deliverables

Excel workbook and actual Excel execution; multi-season realistic cases; independent full-contract cash reconciliation; browser integration and actual exports; deployed parity; separate change/reporting measurements; completed cross-tool scorecard. This draft is explicitly not the completed requested benchmark.
