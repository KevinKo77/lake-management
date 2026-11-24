# LANOVA Winter Transfer Intelligence — case studies

Static pages under `/lanova/cases/`. They run in the browser: no server, no account, no storage. The only network request is this site's own dataset file. They are not linked from the public navigation and are set to `noindex` until the founder's GO.

| Path | Role |
|---|---|
| `data/laliga.json` | Versioned LaLiga dataset (results and fixtures), built from a pinned CC0 source by `scripts/build-football-dataset.mjs`. |
| `football.js` | The goal model: Poisson probabilities, match outcomes, league rates, team strengths, final points tables. |
| `malaga-winter-2027/` | Release 1 case study: **Málaga CF — Attack or Defence? The January 2027 Survival Decision.** |
| `forecast.js` | Release 2 forecasting engine: team ratings, match probabilities, seeded season simulation, walk-forward evaluation. |
| `data/forecast-validation.json` | Release 2 validation report, produced by `scripts/forecast-validation.mjs` (deterministic; reproduced by the tests). |
| `malaga-winter-2027/player.js` | Release 3 role-based player profiles: hypotheses → per-match factors → expected points (same goal model). |
| `forecast-lab/` | Release 2 page: **Football Forecast Lab** — the validation report and a live historical replay. No current-season probability. |

## Source and data-rights register

| # | Source | What is used | Licence / basis | Permitted use | Updated | Limits |
|---|---|---|---|---|---|---|
| S1 | [openfootball/espana](https://github.com/openfootball/espana), commit `80035a93dd4920985af52aa097a54a6fb888563b` | LaLiga results and fixtures, 2012/13–2026/27 (`<season>/1-liga.txt`) | [CC0 1.0 Universal](https://github.com/openfootball/espana/blob/master/LICENSE.md): public-domain dedication | Any use, including commercial; no attribution required (attributed anyway) | Source commit dated 2026-10-15; 2026/27 results to 20 September 2026 (matchdays 1–7, 69 matches) | Results only, no expected goals or player data. Matchdays 8–13 of 2026/27 are not in the source at this commit. Later fixture dates may still be moved by the league. |
| S2 | Public match reports and a standings page, dated 2 to 24 November 2026: Zonadepor, La Nación (two reports), Futeros, El Desmarque, Málaga CF fixture page | Málaga CF's own line after matchday 13: 13 played, 0 won, 5 drawn, 8 lost, 9 scored, 24 conceded, 5 points, 20th | Facts (results, goals, points) are not copyrighted. Only these facts are used, typed by hand and cited. | Citation of facts. No text, table, logo, photograph or feed is reproduced. | Checked 24 November 2026 | One club's aggregate line, not a dataset of the league. The other teams' matchdays 8–13 are not taken from these pages. |
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

**Validation protocol** (`scripts/forecast-validation.mjs`, seed 20261124, no clock):
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
