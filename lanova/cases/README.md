# LANOVA Winter Transfer Intelligence — case studies

Static pages under `/lanova/cases/`. They run in the browser: no server, no account, no storage. The only network request is this site's own dataset file. They are not linked from the public navigation and are set to `noindex` until the founder's GO.

| Path | Role |
|---|---|
| `data/laliga.json` | Versioned LaLiga dataset (results and fixtures), built from a pinned CC0 source by `scripts/build-football-dataset.mjs`. |
| `football.js` | The goal model: Poisson probabilities, match outcomes, league rates, team strengths, final points tables. |
| `malaga-winter-2027/` | Release 1 case study: **Málaga CF — Attack or Defence? The January 2027 Survival Decision.** |
| `ranking.js` | LaLiga table with the RFEF tie-breakers (head-to-head first, partial resolution, no random tie-break). |
| `data/official-outcomes.json` | Verified official outcomes used to check the rebuilt tables (S4). |
| `forecast.js` | Release 2 forecasting engine: team ratings, match probabilities, seeded season simulation, walk-forward evaluation. |
| `data/forecast-validation-v2.json` | Current validation report (v2), produced by `scripts/forecast-validation-v2.mjs` (deterministic; reproduced by the tests). |
| `data/forecast-validation-v1.json` | Archived v1 report (commit 2a05287), kept as the "before" reference. Superseded. |
| `malaga-winter-2027/player.js` | Release 3 role-based player profiles: hypotheses → per-match factors → expected points (same goal model). |
| `forecast-lab/` | Release 2 page: **Football Forecast Lab** — the validation report and a live historical replay. No current-season probability. |

## Source and data-rights register

| # | Source | What is used | Licence / basis | Permitted use | Updated | Limits |
|---|---|---|---|---|---|---|
| S1 | [openfootball/espana](https://github.com/openfootball/espana), commit `80035a93dd4920985af52aa097a54a6fb888563b` | LaLiga results and fixtures, 2012/13–2026/27 (`<season>/1-liga.txt`) | [CC0 1.0 Universal](https://github.com/openfootball/espana/blob/master/LICENSE.md): public-domain dedication | Any use, including commercial; no attribution required (attributed anyway) | Source commit dated 2026-10-15; 2026/27 results to 20 September 2026 (matchdays 1–7, 69 matches) | Results only, no expected goals or player data. Matchdays 8–13 of 2026/27 are not in the source at this commit. Later fixture dates may still be moved by the league. |
| S2 | Public match reports and a standings page, dated 2 to 24 November 2026: Zonadepor, La Nación (two reports), Futeros, El Desmarque, Málaga CF fixture page | Málaga CF's own line after matchday 13: 13 played, 0 won, 5 drawn, 8 lost, 9 scored, 24 conceded, 5 points, 20th | Facts (results, goals, points) are not copyrighted. Only these facts are used, typed by hand and cited. | Citation of facts. No text, table, logo, photograph or feed is reproduced. | Checked 24 November 2026 | One club's aggregate line, not a dataset of the league. The other teams' matchdays 8–13 are not taken from these pages. |
| S3 | RFEF Reglamento General art. 201 (art. 224 of the new edition) and Normas Reguladoras y Bases de Competición Primera y Segunda División 2025/26 (Circular 34; rfef.es) | The tie-breaking rules for clubs level on points (`ranking.js`) | Official regulation; rules are applied, not reproduced | Application of the rules | Checked 24 November 2026 | **Verbatim text not opened:** the PDFs could not be downloaded from the build environment. The rules were taken from the excerpts the search index shows from these documents, cross-checked with official outcomes (S4). Exact wording to be confirmed by the reviewer. |
| S4 | Verified official outcomes, 2012/13–2025/26 (`data/official-outcomes.json`): relegated clubs of every season, 35 positions with points, one point deduction, one administrative relegation, with cited pages (Wikipedia, Sky Sports, Sportsmole, NBC Sports, 90min, Football España, UEFA and others) | Check of the rebuilt final tables | Facts, entered by hand with their sources | Citation of facts; no table reproduced | Checked 24 November 2026 | Pages read through search results only; positions not listed there were not checked against an official source. |
| — | Expected goals (xG), player statistics, market values, wages | **Not used** | No source was found that allows this use at €0 under its terms. Commercial providers (Opta/Stats Perform, StatsBomb and others) are licensed. FBref and Transfermarkt terms do not permit this reuse or scraping. | — | — | **Blocked:** no xG-based model, no named player, no player-specific impact, no real price. |

**Rebuilding the dataset:**
1. `git clone https://github.com/openfootball/espana` and `git checkout 80035a93dd`.
2. `node scripts/build-football-dataset.mjs <clone>`, or the same with `--check` to compare with the committed file.

The script stops if the source licence is not CC0. It also checks every season: 20 teams, 380 matches, 19 home and 19 away each, no duplicate fixture.

## Release 1 model (`football.js`)
**Goals.** Each side's goals in a match follow independent Poisson distributions:
- home goals = μ_home × attack_home × defence_away;
- away goals = μ_away × attack_away × defence_home.

**League rates** (μ_home, μ_away): goals per match in LaLiga 2025/26 and the 2026/27 matches of the dataset (449 matches): 1.595 home and 1.154 away.

**Team strengths.** Goals relative to the league average per team-match μ, shrunk by k = 5 prior matches at the average:
- attack = (goals scored + k μ) / ((matches + k) μ);
- defence = (goals conceded + k μ) / ((matches + k) μ).

Which matches feed the strengths:
- **Málaga CF:** its verified 13-match line (S2).
- **Other teams:** their 2026/27 matches in S1.

The open dataset's own Málaga results (7 matches, 3 points, 3–12) are checked to be consistent with the more recent verified line.

**Interventions** (your hypotheses), each from the first remaining match on or after its activation date:
- attack: Málaga's scoring rate × (1 + a%);
- defence: Málaga's conceding rate × (1 − d%).

**Outputs** (model estimates):
- expected points per match = 3 P(win) + P(draw), summed exactly over scores up to 15 goals each (tail < 1e-9);
- expected final points = 5 + the sum over the 25 remaining matches;
- break-even sizes, found by bisection (expected points rise with each improvement).

**Historical reference (observed):** the points of the 17th-placed team (last safe place) in the 14 complete seasons of S1: 35 to 43, median 39.

**Financial impact:**
- the interventions are signings in the Advantage Lab V1 (`../advantage/lab.js`), so the cash comes from the LANOVA Finance engine (corrected signing-bonus treatment);
- base case, and a downside (relegation) case from a chosen month;
- all figures are the user's hypotheses; nothing is pre-filled. The optional illustration is labelled "Hypothetical financial assumptions — not Málaga CF data";
- a test reconciles every result with a direct engine run.

**What it is not:**
- not a validated forecast;
- no probability of survival or relegation;
- it does not separate opponent quality from Málaga's own rates;
- it does not know injuries, suspensions, managers or tactics;
- a percentage improvement is an assumption about a player or a system change, not a measured effect.

## Validation (Release 1)
`tests/case-malaga.test.mjs` (12 tests) covers:
- dataset integrity and licence;
- Poisson and draw probabilities against closed forms (I0 series);
- strengths by hand;
- the snapshot's arithmetic and its consistency with S1;
- the 17th-place reference recomputed independently;
- ranking reversals by size and by timing;
- monotonicity;
- break-even equality;
- missing and invalid inputs;
- financial reconciliation to the cent;
- export consistency;
- the page's links and calls to action.

`tests/case-malaga-e2e.mjs` (10 checks, desktop and iPhone 13) checks:
- every figure shown against the same calculation in Node;
- presets, timing, keyboard, finance, exports and calls to action;
- phone layout, page errors and network requests.

## Release 2 — forecasting engine (`forecast.js`)
> **Superseded figures.** The validation figures in this section are version 1. They were produced with an incorrect tie-break rule (overall goal difference). See **Correction sprint: ranking rules and validation v2** below for the corrected figures; the v1 relegation advantage claim is withdrawn.
**Model.** λ_home = c · H · att_home · def_away and λ_away = c · att_away · def_home, fitted by weighted Poisson maximum likelihood (iterative scaling) on matches played **strictly before** the forecast date.
- Weights halve every `halfLife` days; matches older than 1,095 days are ignored.
- Each team is pulled towards a prior centre by `k` pseudo-matches: the league average, or, for a team new to the division, the average first-season strength of earlier promoted teams (learnt only from seasons completed before the forecast date).
- Optional Dixon–Coles correction ρ for the four low scores (tested; not selected).
- Season simulation: every remaining score drawn from the score matrix with a seeded generator (mulberry32). Ranking by points, goal difference, goals scored; LaLiga's head-to-head tie-breaker is **not** modelled.

**No look-ahead.**
- Walk-forward: one fit per matchday, with the cut-off at the matchday's first match.
- Replay: the cut-off is the first match of the next matchday. A match of an earlier matchday postponed beyond the cut-off counts as not yet played.
  - This rule was tightened during Release 2: the first version counted such a match in the table at matchday 13.
  - The relegation Brier score moved from 0.0746 to 0.0840 as a result. The figures below use the corrected rule.
- Tests change every later result and check that no earlier forecast moves.

**Validation protocol** (`scripts/forecast-validation-v1.mjs`, archived, seed 20261124, no clock):
1. Tuning on 2015-16, 2016-17, 2017-18, 2018-19: grid halfLife {120, 240, 365, 730} × k {2, 4, 8} × Dixon–Coles {off, on}, chosen by log loss. Chosen: halfLife 730, k 8, Dixon–Coles off.
2. Hold-out 2019-20 to 2025-26 (2660 matches), chosen settings only.
3. Relegation after matchday 13 for 2015-16 to 2025-26 (220 team-seasons), 4,000 simulations each.
   - Baselines: the share relegated from the same matchday-13 position in **earlier** seasons only, and a flat 15%.

| Hold-out (2660 matches) | Engine | Past frequencies | Uniform |
|---|---|---|---|
| Log loss | 0.9909 | 1.0698 | 1.0986 |
| Brier | 0.5905 | 0.6464 | 0.6667 |
| RPS | 0.1988 | 0.2250 | 0.2332 |

- Calibration error (ECE): home 0.026, draw 0.021, away 0.035.
- The engine beats past frequencies in **every** hold-out season.

| Relegation at matchday 13 | Engine | Position baseline | Flat 15% |
|---|---|---|---|
| Brier, all 220 | 0.0840 | 0.1128 | 0.1275 |
| Log loss, all 220 | 0.2642 | 0.3668 | 0.4227 |
| Brier, hold-out 140 | 0.0927 | 0.1102 | 0.1275 |

Relegation calibration (ECE 0.040), by predicted-probability bin:
- 0.0–0.2: n = 162, predicted 0.032, observed 0.037
- 0.2–0.4: n = 29, predicted 0.296, observed 0.414
- 0.4–0.6: n = 13, predicted 0.481, observed 0.231
- 0.6–0.8: n = 6, predicted 0.641, observed 0.667
- 0.8–1.0: n = 10, predicted 0.910, observed 0.800

**Pre-registered internal criteria:**
- Hold-out log loss at least 2% below the past-frequency baseline
- Expected calibration error ≤ 0.05 for home win, draw and away win (hold-out)
- Relegation Brier score at matchday 13 below the position baseline (2015/16–2025/26)

All three pass. **Passing them does not authorise publication.** No survival probability for 2026/27 is computed or shown until both of these hold:
- an independent reviewer has validated this report;
- the open dataset covers the current season to date. At commit `80035a93dd` it stops at matchday 7.

**Known limits:**
- The chosen half-life (730 days) is at the **edge** of the grid: longer memories were not tested.
- Mid-range relegation bins are small and miscalibrated: 0.2–0.4 is under-predicted and 0.4–0.6 over-predicted, on 29 and 13 team-seasons.
- No injuries, transfers, managers or congestion: strengths move only with results.
- No head-to-head tie-breaker.
- Results only: no xG, no odds.

**Release 2 tests:**
- `tests/forecast.test.mjs`, 10 tests:
  - team identity across seasons;
  - scoring rules and calibration against closed forms;
  - score matrix and Dixon–Coles;
  - recovery of known strengths;
  - no look-ahead in `fit`, `walkForward` and `replay`;
  - seeded reproducibility and coherent shares;
  - the report reproduced from the code;
  - criteria flags;
  - the page's promises.
- `tests/forecast-lab-e2e.mjs`, 7 checks on desktop and iPhone 13:
  - figures equal the report;
  - the live replay equals Node;
  - links and calls to action work;
  - no page error and no off-site request.

## Release 3 — role-based player profiles (`malaga-winter-2027/player.js`)
**Purpose.** Turn hypotheses about a signing, described by **role** rather than by name, into expected points with the same goal model as the attack-versus-defence experiment.

**Inputs** (all the user's hypotheses; nothing pre-filled):
- **Role**, one of 8. It sets the channel the player mainly acts on:
  - attack: striker, winger, attacking midfielder;
  - defence: goalkeeper, centre-back, defensive midfielder;
  - both: full-back, central midfielder.
  - Choosing a role sets the *other* channel to an explicit, editable 0.
- **On-pitch change** in Málaga's goals scored (−50 to +300%) and conceded (−50 to 90% reduction), **relative to the player he would replace**, as low, central and high values. A negative value means worse than the current option.
- Share of minutes; availability; first match; matches needed to reach full effect (0–15).

**Model.** At the k-th match from the first one:
- factor = 1 ± effect × minutes × availability × ramp(k);
- ramp(k) = min(1, (k + 1)/(R + 1)).

This linear expected-value approximation does not simulate line-ups. With 100% minutes, 100% availability and no ramp, a profile equals the experiment exactly (tested).

**Comparison.**
- Profiles are ranked by central expected points.
- The ranking is called **separated** only if the best profile's *low* value beats the next profile's *high* value. Otherwise the page says the ranges overlap.

**Names: blocked.**
- No verified player data is available at €0, so no player is named, looked up or scored.
- A user may type a label (for example a name) for their own use. It is marked "your label · unverified", never fetched and never changes a number (tested).
- Publishing a named player's survival-probability uplift would need both:
  - verified player data under a licence that permits the use;
  - a validated player-impact model and a validated season model.
  Neither exists here.
- No causal claim: the figures translate hypotheses, they do not measure a player.

**Tests.**
- `tests/player-impact.test.mjs` (9 tests):
  - equivalence with the experiment;
  - scaling by minutes and availability;
  - ramp;
  - ranges, including negative lows;
  - label invariance and no lookup;
  - role defaults;
  - missing and invalid inputs;
  - ranking reversal and overlap;
  - exports with escaping.
- `tests/case-malaga-e2e.mjs`, check 9a:
  - nothing pre-filled;
  - illustration figures equal Node;
  - a label changes no figure;
  - an invalid range is refused;
  - JSON export;
  - phone layout.

## Correction sprint: ranking rules and validation v2
### The defect
The independent review found that version 1 ordered clubs level on points by overall goal difference, then goals scored, with random order for exact ties. LaLiga applies the RFEF tie-breakers, which put **head-to-head first**.

### Ranking rules (`ranking.js`)
Clubs level on points are ordered as follows:
1. **Head-to-head.**
   - Two clubs: points, then goal difference, in their two matches.
   - Three or more clubs: points, then goal difference, in a separate table of the matches between them.
2. **Partial resolution:** clubs still level after a criterion are resolved again from step 1, among themselves only.
3. **Overall criteria:** goal difference, then goals scored.
4. **Fair play.**

Further rules:
- **Head-to-head only when complete.** It is used only once every match between the clubs concerned has been played. During a season, an incomplete head-to-head is skipped.
- **Fair play is not in the data.** A tie only fair play could break is left as an unresolved block: its clubs share the positions with equal weight. It is never decided at random, and it is reported.
- **Point adjustments by the competition** apply to final tables.
- **One rule everywhere.** The same rules apply to:
  - simulated final tables;
  - historical final tables;
  - backtest relegation labels;
  - the table at the forecast date, used by the position baseline.

### Check against official outcomes (S4)

| | RFEF rules (v2) | Previous rule (v1) |
|---|---|---|
| Seasons whose relegated clubs equal the official sporting outcome | **14/14** | 12/14 |
| Verified positions with points matching | **35/35** | — |
| Final tables with a tie that needs fair play | 0 | — |
| Seasons where the restart variant (head-to-head restart only after head-to-head splits) changes the order | 0 | — |

The previous rule failed in two seasons:
- **2014/15:** it relegated Granada instead of Eibar.
- **2025/26:** it relegated Levante instead of Mallorca (three clubs on 42 points).

Fixtures (`tests/ranking.test.mjs`, 9 tests):
- synthetic cases for every rule;
- the 2025/26, 2014/15 and 2015/16 boundary ties;
- every rebuilt final table against S4;
- consistency across simulation, replay and labels.

**Special cases:**
- **Almería 2014/15:** 3-point deduction, 29 points instead of 32. It changes no position.
- **Elche 2014/15:** administrative relegation. The backtest uses the sporting outcome.

### Validation v2 (`scripts/forecast-validation-v2.mjs` → `data/forecast-validation-v2.json`)
**Protocol, unchanged from v1:**
- tuning on 2015/16–2018/19 only;
- hold-out 2019/20–2025/26;
- relegation after matchday 13 for 2015/16–2025/26;
- 4,000 simulations, seed 20261124.

**Grid extended beyond 730 days:**
- half-lives 120, 240, 365, 730, 1,095, 1,460 days, and no decay;
- prior strength 2, 4, 8; Dixon–Coles off or on;
- training window 1,095 or 1,825 days. Half-lives longer than the window are skipped, since a half-life longer than the window adds nothing.
- **Chosen:** half-life 365 days, k 4, window 1825 days, Dixon–Coles off. The choice is not at the edge of the grid.

**Uncertainty:** 2,000 bootstrap resamples, by match or team-season and by whole season; Wilson 95% intervals by calibration band.

**Before and after:**

| | v1 (before) | v2 (corrected) | v2 95% interval |
|---|---|---|---|
| Match log loss, hold-out (2660) | 0.9909 | **0.9893** | 0.972–1.006 |
| Match Brier, hold-out | 0.5905 | **0.5893** | 0.578–0.601 |
| Past-frequency baseline (log loss) | 1.0698 | 1.0698 | gain 0.067–0.094 |
| Relegation Brier, all 220 | 0.0840 | **0.0871** | 0.063–0.113 |
| Position baseline, all | 0.1128 | 0.1097 | gain 0.006–0.038 (by season 0.002–0.042) |
| Relegation Brier, unseen 140 | 0.0927 | **0.0975** | 0.065–0.132 |
| Position baseline, unseen | 0.1102 | 0.1076 | **gain -0.012–0.031: includes zero** |
| Relegation log loss, all | 0.2642 | 0.2639 | — |
| Relegation calibration error | 0.0396 | 0.0473 | — |

**Relegation labels corrected:**
- 2025-26 RCD Mallorca: stayed up → relegated (final position 18)
- 2025-26 Levante UD: relegated → stayed up (final position 16)

**Relegation calibration by band (all 220 team-seasons):**

| Band | n | Relegated | Mean predicted | Observed | Wilson 95% |
|---|---|---|---|---|---|
| 0.00–0.05 | 126 | 2 | 0.009 | 0.016 | 0.004–0.056 |
| 0.05–0.10 | 22 | 0 | 0.075 | 0.000 | 0.000–0.149 |
| 0.10–0.20 | 11 | 3 | 0.147 | 0.273 | 0.098–0.566 |
| 0.20–0.40 | 30 | 13 | 0.281 | 0.433 | 0.274–0.608 |
| 0.40–0.60 | 14 | 3 | 0.475 | 0.214 | 0.076–0.476 |
| 0.60–0.80 | 7 | 4 | 0.640 | 0.571 | 0.251–0.842 |
| 0.80–1.00 | 10 | 8 | 0.907 | 0.800 | 0.490–0.943 |

**Sensitivity** (reported, not used for the choice):

| Half-life | Window | Brier, all | Brier, unseen |
|---|---|---|---|
| 120 | 1095 | 0.0869 | 0.0964 |
| 120 | 1825 | 0.0869 | 0.0963 |
| 240 | 1095 | 0.0863 | 0.0964 |
| 240 | 1825 | 0.0863 | 0.0964 |
| 365 | 1095 | 0.0873 | 0.0983 |
| 365 | 1825 | 0.0871 | 0.0975 |
| 730 | 1095 | 0.0885 | 0.0989 |
| 730 | 1825 | 0.0887 | 0.0992 |
| 1095 | 1095 | 0.0889 | 0.0992 |
| 1095 | 1825 | 0.0894 | 0.1003 |
| 1460 | 1825 | 0.0896 | 0.1005 |
| none | 1095 | 0.0898 | 0.1001 |
| none | 1825 | 0.0909 | 0.1023 |

- **Monte Carlo noise:** another seed gives Brier 0.0870; no single probability moves by more than 0.025.
- **Ties needing fair play at the relegation line:** 0.0023% of simulations on average, 0.025% at most. Effect on any relegation probability: under 0.03 percentage points.

### What the corrected figures support
- **Match-result forecasts:** better than past frequencies, with every interval excluding zero and the gain present in every season.
- **Relegation over all 220 team-seasons:** better than the position baseline, with intervals excluding zero.
- **Relegation on the 140 unseen team-seasons:** the advantage over the position baseline is **not statistically established**; the interval includes zero. The v1 claim of a clear relegation advantage is **withdrawn**.
- **Calibration:** every band lies within its Wilson interval. Between 20% and 60%, where relegation decisions are made, the bands are small and alternate between under- and over-prediction.
- **Internal criteria:** the three pre-registered criteria still pass. They are necessary, not sufficient.

### Current season (2026/27)
- **Still blocked.** 61 results played before 24 November 2026 are missing from the open dataset:
  - matchdays 8–13: 10 each;
  - one postponed match of matchday 6.
- **Exact list:** on the Forecast Lab page.
- **Requirements before any 2026/27 probability:**
  1. A newer CC0 commit or a licensed results feed.
  2. Independent review of this report.
  3. The founder's approval.

### Report integrity (Málaga case)
`tests/case-report-integrity.test.mjs` (5 tests) and browser check 7b cover:
- intervention magnitude;
- activation date;
- matches affected;
- expected points;
- financial assumptions;
- missing-data labels;
- scenario identity.

**Defect found and fixed:** the HTML report re-rounded the 2-decimal JSON figures to one decimal. A value such as 29.4499 then printed 29.5 against 29.4 on screen. Figures shown are now rounded once, from the model value, and carried in the export as `shown`.

**Exports now also carry:**
- each scenario's exact intervention and the matches it affects;
- the missing financial inputs, by name;
- the reason for "costs unknown".

### Reproduce
1. `git clone https://github.com/openfootball/espana && git -C espana checkout 80035a93dd`
2. `node scripts/build-football-dataset.mjs espana --check`
3. `node scripts/forecast-validation-v2.mjs --check` (about 2–3 minutes)
4. `node --test tests/ranking.test.mjs tests/forecast.test.mjs tests/case-report-integrity.test.mjs`

## Financial integrity correction (Málaga case)
### The defect
Found by the independent review, defensive reinforcement fixture. Inputs:
- transfer fee €1,800,000 in two yearly instalments;
- agent fee €150,000 and signing bonus €120,000;
- wages €75,000 a month plus 30% charges, for 18 months.

The former "Cost in 2027" showed **€3,240,000**. That is the committed one-off amounts (fee, agent, bonus) plus 2027 wages. It counted the January 2028 fee instalment as a 2027 cost.

### What the schedules give
From the LANOVA Finance engine payment schedules, reconciled with its month-end cash to the cent:

| Defence | Hand calculation | Shown |
|---|---|---|
| Paid at signing (January 2027) | 900,000 + 150,000 + 120,000 | **1,170,000** |
| Cash paid in 2027 | 1,170,000 + 12 × 97,500 | **2,340,000** |
| Future payments (after 2027) | fee instalment **900,000 due 2028-01** + 6 × 97,500 wages | **1,485,000** |
| Total contractual commitment | 2,340,000 + 1,485,000 | **3,825,000** |
| Budget commitment (Advantage Lab V1 definition: fee + agent + bonus in full) | 1,800,000 + 150,000 + 120,000 | 2,070,000 |
| Accounting cost 2027 (engine, not cash) | 1,170,000 + 120,000 × 12/18 + 1,950,000/18 × 11 | 2,441,667 |

**Attack:** 880,000 at signing; 1,738,000 cash in 2027; no future payments; 1,738,000 committed.

**Both:** 2,050,000 at signing; 4,078,000 cash in 2027; 1,485,000 future; 5,563,000 committed.

### How the definitions are applied
- **One definition per measure.** Each measure has one definition, period and unit (EUR). They are listed in `FIN_DEFINITIONS` and used by the dashboard, the HTML and JSON exports, and the payment schedule.
- **Engine-derived.** `paymentProfile()` reads the engine's own payment schedules (`decisionComponents`: fee instalments, agent fee, signing bonus, wages and charges) and checks four things:
  - cash paid equals the engine's change in month-end cash, in the base and downside cases;
  - the future fee equals the engine's transfer payments after the horizon;
  - the total equals the Advantage Lab total cost;
  - every month matches.
- **No engine change.** The Finance engine and the Advantage Lab are unchanged.
- **Timing.** Signing and first payments are in January 2027 (winter window). The sporting activation date moves the sporting effect, not the payments.

### Tests
`tests/case-finance-presentation.test.mjs` (9 tests) checks values computed by hand from the inputs, not by the code under test:
- the review fixture;
- attack and combined;
- engine reconciliation;
- accounting;
- reserve in the base and downside cases;
- one, two or three instalments and a 30-month contract;
- activation dates;
- missing costs;
- exports.

The browser check reads the dashboard cells against the same fixture.

## Current-season data readiness (2026/27) — BLOCKED DATA
Produced by `scripts/current-season-readiness.mjs` → `data/current-season-readiness.json` (deterministic; `--check`).

**Missing results:**
- 61 of the 130 results scheduled before 24 November 2026 are missing: matchdays 8–13 (10 each) and one postponed matchday-6 match.
- Each is listed with its identity (season, matchday, home, away), its scheduled date and the source it requires.

**Sources examined** (`data/current-season-sources.json`):
- **openfootball/espana and football.json (CC0):** no commit beyond matchday 7.
- **football-data.co.uk:** licence for commercial reuse not established.
- **OpenLigaDB (ODbL):** LaLiga coverage not confirmed.
- **laliga.com:** personal, non-commercial use only. Usable as a verification reference, not as a data source.
- **Wikipedia (CC BY-SA):**
  - not authoritative;
  - not reachable from the build environment;
  - share-alike would apply to the snapshot.
  This is a possible path, but it needs a founder decision.
- **Commercial feeds:** not available at €0.

**Result:** no source is usable today.

**The completeness gate** (`checkSnapshot`) accepts a snapshot only if it has:
- provider, licence and licence URL, with commercial reuse permitted;
- retrieval timestamp and SHA-256 checksum;
- match identities, actual playing dates and scores;
- per-result verification against the official result;
- **full** coverage of the missing results.

Partial data are never mixed with the open dataset, and no result is filled in. The current-season probability restriction stays in place.
