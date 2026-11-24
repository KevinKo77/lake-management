# LANOVA Advantage Lab — V1 (prototype)

Static page at `/lanova/advantage/`. It runs entirely in the browser: no server, no account, no storage, no network call. It is isolated from the production application. It is not linked from the public site and is set to `noindex`.

| File | Role |
|---|---|
| `lab.js` | Decision engine (pure functions): schema and migration, scenarios, costs, hard and structural constraints, dominance, combinations, decision brief, exports. Imports only `../finance/engine/model.js`. |
| `sensitivity.js` | Sensitivity and break-even analysis: every figure is a Finance engine recalculation (through `lab.js`). |
| `project.js` | Project files: save an analysis as JSON on the user's device, and reopen it with strict validation. |
| `examples.js` | Neutral blank workspace, three illustrative anonymous examples (the sport selectors: Rugby, Basketball, Hockey) and a separate worked example of the V1 workflow (inputs only, no results). |
| `map.js` | The Resource Advantage Map drawn from an evaluation (shared by the Advantage Lab and the home page). |
| `app.js`, `index.html`, `advantage.css` | Interface, six steps: financial situation, options, scenarios and constraints, compare, sensitivity, report. Strict CSP, own scripts only. |
| `../finance/engine/` | The LANOVA Finance engine, already published and byte-identical to `KevinKo77/lake-intelligence` (SHA-256 manifest). **It is reused and not modified**: every cash figure comes from it. |

## Data schema `lanova-advantage-v1`

```text
{ schema "lanova-advantage-v1", fictional, label, sport, structure, startMonth "YYYY-MM", horizonMonths 12|24|36, currency "EUR",
  objective "immediate" | "development" | "financial",
  finance: { openingCash, annualRevenue, annualOperatingCosts, staffCosts (part of operating costs) | null = not split,
             minimumCash, decisionBudget },
  scenarios: { downside: { revenuePct −90..200, operatingPct −90..200, wagePct −90..200, fromMonth 0..H-1 },
               upside:   { same } },
  constraints: { downsideMustHold: boolean },
  options: [ { id, name, category, kind "project" | "signing",
      startMonth 0..H-1, effectMonths 0..120,
      project: upfront ≥ 0, upfrontType "expense" | "capital", usefulLifeMonths (capital only), instalments 1..8,
               instalmentEveryMonths 1..12, monthlyCost ≥ 0, costType "operating" | "staff", commitmentMonths 0..120,
      signing: transferFee, feeInstalments 1..6 (yearly), agentFee, signingBonus, contractMonths 1..72, monthlyWage,
               employerChargeRate 0..1,
      monthlyGain (EUR/month, may be negative) | null = not estimable, gainMonths 1..120,
      gainRange { low, high, basis } (optional, only with monthlyGain null: a documented range and its source),
      shortTermScore 0..10 | null, longTermScore 0..10 | null,   ← the organisation's own estimates
      risk "low" | "medium" | "high" | null, confidence "low" | "medium" | "high",
      mandatory boolean, requires [option ids], exclusiveGroup "" | name } ] }   at most 10 options
```

**Migration.** A `lanova-advantage-v0` model (its single downside: revenue −x% from the first month) is migrated on load: downside `revenuePct = −x`, upside equal to the base case, staff costs not split, every option a stand-alone project paid at once. The Finance engine receives exactly the same plan, so the results are identical: `node scripts/compare-advantage-baseline.mjs` compares the three examples (3 objectives × 3 budgets) with the validated V3 release and finds 27/27 identical.

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
**Organisation plan.** Revenue and operating costs are spread evenly over the months. When staff costs are entered, they are a payroll line and the rest is operating costs; otherwise all costs are operating costs (and a wage scenario is refused: a missing figure is not zero).

**Three scenarios**, each a Finance engine scenario applied from its activation month (`fromMonth`):
- base: the budget as entered;
- downside and upside: every revenue category × (1 + revenuePct), operating costs × (1 + operatingPct), payroll and employer charges × (1 + wagePct). Option gains and costs follow the same factors. Amounts paid before the activation month are not changed — including a signing bonus (the engine's corrected treatment, lake-intelligence PR #58).

**Each option becomes Finance decisions:**
- project, capital immediate cost → an `investment`, paid in its instalments (`instalments` equal payments every `instalmentEveryMonths` months, rounded to the cent, the remainder on the last);
- project, expensed immediate cost → `cost_change` one-off costs, one per instalment;
- project running cost → a `cost_change` (operating) or a `payroll_change` (staff: wage scenarios apply) over the commitment;
- signing → a `player` decision: transfer fee in yearly instalments and agent fee, capitalised and amortised over the contract; wages and employer charges in payroll; signing bonus paid at signing and expensed over the contract. Its immediate cost for the budget is transfer fee + agent fee + bonus; its running cost is the wage with charges;
- gains → a `revenue_change` (amount per month): the known figure, the **low end** of a documented range, and nothing for a gain that is not estimable.

**Prudent cash.** Every cash figure, feasibility test and lowest-cash value therefore uses known gains, the low end of ranges and no unknown gain. It is labelled "prudent" and is never presented as an estimate of the total benefits. For a range, the engine is also run at the high end, to bound the ranking and the reserve test.

**Option cash change.** For each month: cash with the option minus cash without it. This comes from `forecast()`, in the base and downside scenarios.

**Combination cash.** Baseline plus the sum of the options' cash changes, in each scenario. The engine is linear for these decisions (no tax is computed); a test runs the engine directly on every combination of every example (one plan with all its decisions, when it has at most the engine's 12 decisions) and finds the same month-end cash to the cent in all three scenarios.

### Hard constraints, before any preference
- Immediate cost of the option, or of the combination, must be ≤ the budget available for these decisions.
- Base-case month-end cash must be ≥ the minimum reserve in **every** month. This is what makes payment dates and schedules matter.
- Optionally (`downsideMustHold`), the same in the downside scenario.
- An option that breaks a constraint on its own is shown as **not feasible**, with the reason (amount, month). The combination search still tests it with other options when it is within the budget (another option's gain can make a combination affordable).
- If no combination meets the constraints, none is proposed (status `no-feasible`) and the reason is stated: the plan already breaks the reserve, or the mandatory decisions cannot be met.

### Structural constraints between options
- `mandatory`: in every combination.
- `requires`: only in a combination that contains the required options.
- `exclusiveGroup`: at most one option of the group in a combination.
- Rejected, never resolved silently: a dependency on an unknown option or on itself; a cycle (A requires B requires A — merge them into one option); an option whose required options include two of one exclusive group (it could never be chosen); mandatory decisions that need two options of one group.

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
**Candidates.** Every combination of options within the budget on their own (at most 2¹⁰ = 1,024, including "do nothing") that meets the structural and hard constraints. The number excluded by each cause is reported; a test compares the feasible set with an independent enumeration on direct engine runs.

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

**Also reported per strategy:** why the alternative ranks lower (the weighted criteria where it is behind); combinations the preferences rank above the best but a hard constraint rules out, with the constraint; and, when the reserve need not hold in the downside, the best combination that does hold.

## Sensitivity and break-even (`sensitivity.js`)
Each figure is found by recalculating with the Finance engine: a search changes one input, reruns the engine and checks the constraints again. Searches are bisections on a bracket where the response is first checked to be monotonic (sample points). Each result states its bracket, its tolerance and a verification at the threshold. When no threshold can be identified, the result reads **"Not determinable from the available assumptions"**, with the reason; when the constraints hold over the whole tested range, it says so.

| Analysis | What changes | Tolerance | Independent check (tests) |
|---|---|---|---|
| Additional revenue needed | Revenue added to the budget every month from the first month (before the scenario's own revenue change) | €1/month | Closed form: max over months of (reserve − cash_t) ÷ (months of revenue received by t, scenario factor included) |
| Maximum affordable cost | A project's immediate cost, or a signing's transfer fee (same schedule) | €100 | Closed form: min(budget left, cost + min over months from the payment of (cash − reserve)) |
| Breaking points | Budgeted revenue, operating costs and staff costs (in the budget itself, so in every scenario); each option's running cost or wage; each known gain | 0.05 percentage point | Closed form for budgeted revenue; verification on both sides |
| Gain needed to enter the recommendation | An option's monthly gain (for an unknown gain: the break-even figure to evidence, never an estimate) | max(€10, range ÷ 1,000) | Full re-evaluation on both sides of the threshold |
| Most influential assumptions | Each assumption ±5% (budget) or ±10% (options), one at a time | — | Effect equals a direct engine run |

An unknown gain is never set to zero in any of these: it stays out of the cash, thresholds are not computed on it, and it is listed as not tested.

## Project files (`project.js`)
- **Save:** a JSON file on the user's device: `{format "lanova-advantage-project", version 1, schema, savedAt, origin, dataNotice, model}`. `dataNotice` states whether the figures are illustrative (invented) or entered by the user and not verified by LANOVA.
- **Open:** strict. Size ≤ 256 KB; JSON only; known keys only at every level (an unknown key is rejected, never ignored); no `__proto__`, `constructor` or `prototype` key; known format and version (a newer version is refused rather than misread); a v0 model is converted and the user is told; the model must pass the interface's own validation.
- Nothing is uploaded: the browser reads the file locally.

### Decision brief
The brief is available as HTML (printable; "Print or save as PDF" uses the browser's print dialog), JSON and CSV. It contains:
- organisation, objective, horizon and data origin (illustrative or user's own);
- the financial position, scenario assumptions with their activation months, hard and structural constraints;
- the cash commitments of each recommendation in each scenario (lowest cash, its month, headroom over the reserve, cash at the end, reserve met);
- why the alternatives were not chosen;
- the sensitivity thresholds, when the analysis has been run for the current inputs;
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
| Worked example — semi-professional football club, 24 months (signings, instalments, dependency, exclusive goalkeepers, mandatory licence upgrade, dated scenarios) | Illustrative, anonymous | Invented for this prototype | Part of this repository |

- **Invented figures.** All the figures in the examples are invented to be plausible in order of magnitude only.
- **No real data.** No real budget, wage, athlete value or club is used.
- **No pre-written results.** The examples contain inputs only; every status, total and recommendation is calculated when an example is loaded, and a test checks it.

**Real sports data: not integrated in V0.1, deliberately.**
- **Candidate source.** The repository already uses `openfootball/espana` (CC0-1.0, pinned commit, SHA-256 hashes) in the existing predictive module.
- **Why not yet.** These are match results, and the Advantage Lab compares the use of financial resources. Results must never stand in for financial indicators, and no published fact links a match result to an option's cost or effect here.
- **Next step.** A *competitive context* panel, for example the points historically needed per league position, reusing that pinned dataset and labelled as sporting results only.

## Limits of V1
- Dependencies, exclusive groups and mandatory decisions constrain which options are combined; the effects of the options are still added (no interaction effects, e.g. a coach more effective with a facility). Contributions are added across options.
- Organisation revenue and costs are flat by month. There is no seasonality, no tax, no new loans and no payment delay. LANOVA Finance handles these in a full plan.
- Scenario levers are percentages of budget categories with one activation month per scenario; no capital-cost or collection-delay lever.
- At most 10 options (1,024 combinations). Measured: evaluation ≈ 30 ms in Node and ≈ 160 ms in Chromium; the full sensitivity analysis ≈ 1–2.5 s. The limit is kept at 10 until a larger search is demonstrated.
- A direct whole-combination engine run is limited to the engine's 12 decisions per plan; larger combinations rely on the per-option runs (whose additivity is tested).
- Sensitivity is one assumption at a time (no joint stress); the influence ranking uses fixed steps (±5%, ±10%).
- An unknown gain is reported, and its break-even is computed where it enters a recommendation, but it is never estimated.
- No CSV budget import in this version (project files only). Nothing is sent to any server.
