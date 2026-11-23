# LANOVA Advantage Lab — V0.1 (prototype)

Static page at `/lanova/advantage/`. It runs entirely in the browser: no server, no account, no storage, no network call. It is isolated from the production application. It is not linked from the public site and is set to `noindex`.

| File | Role |
|---|---|
| `lab.js` | Decision engine (pure functions): costs, hard constraints, dominance, combinations, decision brief, exports. Imports only `../finance/engine/model.js`. |
| `examples.js` | Neutral blank workspace and three illustrative anonymous examples (inputs only, no results). |
| `map.js` | The Resource Advantage Map drawn from an evaluation (shared by the Advantage Lab and the home page). |
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
      gainRange { low, high, basis } (optional, only with monthlyGain null: a documented range and its source),
      shortTermScore 0..10 | null, longTermScore 0..10 | null,   ← the organisation's own estimates
      risk "low" | "medium" | "high" | null, confidence "low" | "medium" | "high" } ] }   at most 10 options
```

A missing value is never treated as zero. In particular, "not estimable" (`null`) and "no gain" (`0`) are different.

A financial gain is in one of three states (`gainStatus`, `financialStatus` in the totals):
- `complete`: a single figure (`monthlyGain`);
- `range`: `monthlyGain: null` and a documented `gainRange` — both ends (low ≤ high), the duration, and `basis`, the source (a quote, an offer, a past season). Without a source the range is refused: a range is not a guess;
- `unknown`: `monthlyGain: null` and no range (not estimable).

## Formulas

### Totals per option (`optionTotals`)
- H = horizon, s = start month.
- Active months in the horizon: `a = min(H, s + commitmentMonths) − s`.
- `runningInHorizon = monthlyCost × a`
- `commitmentsAfterHorizon = monthlyCost × (commitmentMonths − a)`
- `totalCost = upfront + runningInHorizon + commitmentsAfterHorizon`
- `gainInHorizon = monthlyGain × (months of [s + effectMonths, s + effectMonths + gainMonths) inside the horizon)`; `null` when the gain is not estimable.
- `netFinancialInHorizon = gainInHorizon − upfront − runningInHorizon`; `null` when the gain is not a single figure.
- `gainRangeInHorizon`, `netFinancialRange`: the same at both ends of a documented range (a point for a known gain, `null` when unknown).
- `prudentNetInHorizon`: the known net, the low end of a range, or `−(upfront + runningInHorizon)` (costs only) when the gain is unknown. It is a floor, not an estimate of benefits.
- `gainUncertainInHorizon`: whether the unknown part of the gain can change anything inside the horizon (an unknown gain whose effect starts after the horizon cannot).

### Cash (LANOVA Finance engine)
**Organisation plan.** Revenue and operating costs are spread evenly over the months. Three scenarios:
- base;
- downside: every revenue category × (1 − downside %), including the option's gains;
- upside: same as base; the Finance engine requires it.

**Each option becomes Finance decisions:**
- an `investment` for a capital immediate cost, paid in the start month;
- a `cost_change` for running costs over the commitment, and for an expensed immediate cost;
- a `revenue_change` (amount per month) for the gains: the known figure, the **low end** of a documented range, and nothing for a gain that is not estimable.

**Prudent cash.** Every cash figure, feasibility test and lowest-cash value therefore uses known gains, the low end of ranges and no unknown gain. It is labelled "prudent" and is never presented as an estimate of the total benefits. For a range, the engine is also run at the high end, to bound the ranking and the reserve test.

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

**When a gain is unknown or a range.** The dominating option's cash is its prudent figure; the dominated option's cash is the highest it could be (the high end of its range; unbounded when its gain is unknown). A cash figure that leaves a gain out therefore never makes an option look dominated.

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

**Missing estimates (V3 correction).** A blank 0–10 estimate is unknown, not zero:
- each criterion is an interval [low, high]; an unknown estimate spans 0 to 10;
- the ranking uses the midpoint (5), so an undocumented option is neither rewarded nor penalised;
- each candidate also has a score at the low ends and at the high ends;
- a candidate whose high score reaches above the best's low score is a **contender**. The strategy is then `uncertain`, and the brief lists the estimates needed to settle the ranking;
- with complete estimates the intervals are points, and the results are identical to V0.1.

**Financial gains (P0 correction).** Before this correction, an option whose gain was not estimable was ranked on its costs alone, and the strategy could read "indicative" or "close call": the unknown gain was in effect a zero gain. Now:
- `money` and `security` are intervals too. A documented range spans its two ends (net effect; lowest downside cash at the low and the high end). Like a missing estimate, it can make the ranking `uncertain`, and the brief lists the range needed to settle it. A combination that fails the reserve at the low end but not at the high end is also reported.
- A gain that is **not estimable** cannot be bounded. It is left out of the cash (prudent) and the strategy is `financial-incomplete` — "Financial comparison incomplete" — when the gain could change the result:
  - the strategy weighs `money` or `security` (all three presets do) and a feasible option has such a gain; or
  - the option, or a combination within the budget, fails the reserve without that gain (the gain could make it feasible) — whatever the weights.
- Every option with an unknown gain that matters inside the horizon is listed (`financial.optionsWithUnknownGain`) with its role: in the best combination, in the alternative, feasible but not selected, or not feasible (and whether its gain could make it feasible). It is listed even when it is neither selected nor an alternative.
- When no strategy depends on the unknown gain (for example, custom weights with no money and no cash), the status is unchanged, but the notice still says that the cash leaves that gain out.
- `unboundedGains` keeps its name for compatibility; it now lists every option concerned.
- `financialNotice(r)` produces the single notice text used by the interface, the home-page map, the brief (JSON and HTML) and the CSV export, so the five supports always name the same options. A test checks this.

**Reading of the result** (in this order of precedence):
- `no-feasible`: even "do nothing" breaks the reserve.
- `financial-incomplete`: a gain that is not estimable could change the ranking. The options concerned and the reasons are listed.
- `uncertain`: missing estimates or a documented gain range could change the ranking. The contenders and the data needed are listed.
- `close-call`: the runner-up is within 0.05 of the best score. The alternative is shown.
- `indicative`: otherwise.

The score is a reading of the stated preferences and estimates. It is not a forecast of sporting or financial results, and no probability is computed.

### Decision brief
The brief is available as HTML (printable), JSON and CSV. It contains:
- objective and horizon;
- hard constraints and scenarios studied;
- full costs of every option, its status and its reasons;
- dominated and infeasible options;
- the best combination and the alternative under each strategy, with its reading;
- the financial-completeness notice (`financialComparison`: status, warning, options with an unknown gain, options with a documented range, strategies affected, the prudent-cash rule), repeated per strategy and, in the CSV, as the second line, a "Financial status" column and one row per strategy;
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
- An unknown gain is reported, not estimated: the lab cannot say how large it would need to be to change a ranking. A documented range is the way to narrow it.
- Gains are assumed independent across options, like the costs.
- No saving: the workspace is lost on reload, but the brief can be exported. Nothing is sent to any server.
