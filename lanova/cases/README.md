# LANOVA Winter Transfer Intelligence — case studies

Static pages under `/lanova/cases/`. They run in the browser: no server, no account, no storage. The only network request is this site's own dataset file. They are not linked from the public navigation and are set to `noindex` until the founder's GO.

| Path | Role |
|---|---|
| `data/laliga.json` | Versioned LaLiga dataset (results and fixtures), built from a pinned CC0 source by `scripts/build-football-dataset.mjs`. |
| `football.js` | The goal model: Poisson probabilities, match outcomes, league rates, team strengths, final points tables. |
| `malaga-winter-2027/` | Release 1 case study: **Málaga CF — Attack or Defence? The January 2027 Survival Decision.** |

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
