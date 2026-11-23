# LANOVA Advantage Lab — V0.1 (prototype)

Static page at `/lanova/advantage/`. It runs entirely in the browser: no server, no account, no storage, no network call. It is isolated from the production application. It is not linked from the public site and is set to `noindex`.

| File | Role |
|---|---|
| `lab.js` | Decision engine (pure functions): costs, hard constraints, dominance, combinations, decision brief, exports. Imports only `../finance/engine/model.js`. |
| `examples.js` | Neutral blank workspace and three illustrative anonymous examples (inputs only, no results). |
| `app.js`, `index.html`, `advantage.css` | Interface: start screen, Resource Advantage Map, Decision Simulator, Decision Brief. Strict CSP, own scripts only. |
| `../finance/engine/` | The LANOVA Finance engine, already published and byte-identical to `KevinKo77/lake-intelligence` (SHA-256 manifest). **It is reused and not modified**: every cash figure comes from it. |

## Data schema `lanova-advantage-v0`

```text
{ schema, fictional, label, sport, structure, startMonth "YYYY-MM", horizonMonths 12|24|36, currency "EUR",
  objective "immediate" | "development" | "financial",
  finance: { openingCash, annualRevenue, annualOperatingCosts, minimumCash, decisionBudget, downsideRevenuePct },
  options: [ { id, name, category,
      upfront ≥ 0, upfrontType "expense" | "capital", usefulLifeMonths (capital only),
      startMonth 0..H-1, monthlyCost ≥ 0, commitmentMonths 0..120,
      monthlyGain (EUR/month, may be negative) | null = not estimable, gainMonths 1..120, effectMonths 0..120,
      shortTermScore 0..10 | null, longTermScore 0..10 | null,   ← the organisation's own estimates
      risk "low" | "medium" | "high" | null, confidence "low" | "medium" | "high" } ] }   at most 10 options
```

A missing value is never treated as zero. In particular, "not estimable" (`null`) and "no gain" (`0`) are different.

## Formulas

### Totals per option (`optionTotals`)
- H = horizon, s = start month.
- Active months in the horizon: `a = min(H, s + commitmentMonths) − s`.
- `runningInHorizon = monthlyCost × a`
- `commitmentsAfterHorizon = monthlyCost × (commitmentMonths − a)`
- `totalCost = upfront + runningInHorizon + commitmentsAfterHorizon`
- `gainInHorizon = monthlyGain × (months of [s + effectMonths, s + effectMonths + gainMonths) inside the horizon)`; `null` when the gain is not estimable.
- `netFinancialInHorizon = gainInHorizon − upfront − runningInHorizon`; `null` when the gain is not estimable.

### Cash (LANOVA Finance engine)
**Organisation plan.** Revenue and operating costs are spread evenly over the months. Three scenarios:
- base;
- downside: every revenue category × (1 − downside %), including the option's gains;
- upside: same as base; the Finance engine requires it.

**Each option becomes Finance decisions:**
- an `investment` for a capital immediate cost, paid in the start month;
- a `cost_change` for running costs over the commitment, and for an expensed immediate cost;
- a `revenue_change` (amount per month) for the gains.

**Option cash change.** For each month: cash with the option minus cash without it. This comes from `forecast()`, in the base and downside scenarios.

**Combination cash.** Baseline plus the sum of the options' cash changes. The engine is linear for these decisions; a test checks that this equals a direct engine run of the combined decisions, to the cent.

### Hard constraints, before any preference
- Immediate cost of the option, or of the combination, must be ≤ the budget available for these decisions.
- Base-case month-end cash must be ≥ the minimum reserve in **every** month. This is what makes payment dates and schedules matter.
- An option that breaks either constraint is **not feasible**, and the reason is stated (amount, month).
- If even "do nothing" breaks the reserve, no combination is proposed (status `no-feasible`).

### Dominance (`markDominance`)
**What is compared.** Feasible options only, on the dimensions both options have:
- total cost (lower is better);
- contribution to the selected objective (higher is better). This is the immediate or long-term estimate, or the calculated net financial effect;
- risk level (lower is better);
- lowest base-case month-end cash with the option (higher is better).

**Rule.** B dominates A when B is no worse on all four and strictly better on at least one.

**When estimates are missing.** If the contribution or the risk is missing for either option, the pair is **not compared** (status `not-comparable`). Infeasible options never dominate.

**Map statuses:** efficient (not dominated), dominated, not feasible, not comparable.

### Strategies (`bestCombination`)
**Candidates.** Every combination of feasible options that meets the hard constraints, including "do nothing" (at most 2¹⁰).

**Criteria:**
- `short` = Σ immediate estimates;
- `long` = Σ long-term estimates;
- `money` = Σ net financial effect over the horizon;
- `security` = lowest downside cash of the combination.

**Score.** Each criterion is scaled to 0–1 between the worst and the best candidate. The score is Σ weight × scaled criterion, with the weights normalised to 1.

**Preset weights (editable):**

| Strategy | short | long | money | security |
|---|---|---|---|---|
| Maximise estimated immediate benefits | 0.6 | 0.05 | 0.25 | 0.1 |
| Prioritise long-term development | 0.1 | 0.6 | 0.15 | 0.15 |
| Preserve financial security | 0.075 | 0.075 | 0.3 | 0.55 |

**Reading of the result:**
- `insufficient-data`: the chosen combination relies on a missing estimate that a weighted criterion uses. No recommendation is given.
- `close-call`: the runner-up is within 0.05 of the best score. The alternative is shown.
- `indicative`: otherwise.

The score is a reading of the stated preferences and estimates. It is not a forecast of sporting or financial results, and no probability is computed.

### Decision brief
The brief is available as HTML (printable), JSON and CSV. It contains:
- objective and horizon;
- hard constraints and scenarios studied;
- full costs of every option, its status and its reasons;
- dominated and infeasible options;
- the best combination and the alternative under each strategy;
- assumptions, limits, and the data missing for a definitive decision.

## Integrated data — inventory

| Dataset | Nature | Provenance | Licence |
|---|---|---|---|
| Example 1 — amateur rugby union club, 24 months | Illustrative, anonymous | Invented for this prototype (`examples.js`) | Part of this repository |
| Example 2 — semi-professional basketball organisation, 24 months | Illustrative, anonymous | Invented for this prototype | Part of this repository |
| Example 3 — professional ice hockey organisation, 36 months | Illustrative, anonymous | Invented for this prototype | Part of this repository |

- **Invented figures.** All the figures in the examples are invented to be plausible in order of magnitude only.
- **No real data.** No real budget, wage, athlete value or club is used.
- **No pre-written results.** The examples contain inputs only; every status, total and recommendation is calculated when an example is loaded, and a test checks it.

**Real sports data: not integrated in V0.1, deliberately.**
- **Candidate source.** The repository already uses `openfootball/espana` (CC0-1.0, pinned commit, SHA-256 hashes) in the existing predictive module.
- **Why not yet.** These are match results, and the Advantage Lab compares the use of financial resources. Results must never stand in for financial indicators, and no published fact links a match result to an option's cost or effect here.
- **Next step.** A *competitive context* panel, for example the points historically needed per league position, reusing that pinned dataset and labelled as sporting results only.

## Limits of V0.1
- Options are treated as independent. Interactions between them are not modelled, for example a coach who needs a facility.
- Contributions are added across options, which assumes they do not overlap.
- Organisation revenue and costs are flat by month. There is no seasonality, no tax, no financing and no payment delay. Finance V1 handles these in a full plan.
- At most 10 options (1,024 combinations).
- No saving: the workspace is lost on reload, but the brief can be exported. Nothing is sent to any server.
