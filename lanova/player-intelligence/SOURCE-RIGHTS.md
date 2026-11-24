# Source rights — LaLiga 2025/26 line-ups (Player Intelligence V1)

**Decision (24 November 2026): BLOCKED — not published.** The infrastructure is built and tested with **fictional** data. The real dataset is not committed or shown.

## Candidate source
| | |
|---|---|
| File | `openfootball/espana` → `2025-26/1-liga-full.txt` (Football.TXT "full": line-ups, substitutions, goals, cards, referees, attendance) |
| Repository head | `80035a93dd4920985af52aa097a54a6fb888563b` (accessed 24 Nov 2026) |
| Last change to the file | `6ae1e0f1dcfedefcfd1513d9ec54b06a681612c9`, 31 Jul 2026, "auto-update week 31" (automated) |
| SHA-256 | `453103e77b46fdae96fcf9b3616e1fce553473ae02a98bfb9bb366d9c2fbab42` |
| Declared licence | CC0 1.0 (`LICENSE.md`); README: "free open public domain football data" |

## Why the declared licence is not enough
A repository's licence covers what its authors own. It cannot grant rights the authors never had. The repository does not say where the detailed line-ups come from. The tooling that writes these files points to third-party football sites:

| Evidence (pinned revision) | What it shows |
|---|---|
| `yorobot/football.json@2893723` `.github/workflows/update_full.yml` | A workflow named "Update datasets (full versions w/ lineups, etc.)". |
| `yorobot/fbup@9bea32f` `fbup/lib/fbup/main.rb` | The update tool reads `/sports/cache.api.fbdat` and `/sports/cache.wfb` by default. |
| `yorobot/fbup@9bea32f` `README.md`, `NOTES.UPDATE.md`, `patch.csv` | "World & Co via wfb"; "add wfb upstream"; the `wfb` tool from `../worldfootball`. |
| `yorobot/worldfootball@d06a57c` `wfb/lib/worldfootball/download.rb` | `BASE_URL = 'https://www.worldfootball.net'`. It downloads schedule and match-report pages into a web cache. |
| `yorobot/sport.db.more@1a2cbe3` `fbdat/NOTES.md` | `fbdat` = responses from the football-data.org API. |

So the line-ups appear to come from worldfootball.net match reports and the football-data.org API. Their operators' terms of use and database rights (EU sui generis database right) have not been checked. They could not be read from the audit environment, and no licence from them is on record. **Commercial redistribution rights for the line-up data are therefore not sufficiently established.**

## What is published, and what is not
- **Published:** the engines (parser, identity, facts, comparison, contract, report), a **fictional** demonstration dataset, and **aggregate** audit figures (`evidence/source-audit-laliga-2025-26.json`): counts only, no player-level data.
- **Not published:** any real player-level record from the file, and the 2025/26 identity registry built from OpenFootballBase.
- **Build guard:** `scripts/player-intelligence/build_player_facts.mjs` refuses (exit 2) to write a non-synthetic dataset inside the repository unless the manifest records `rightsDecision: "ACCEPTED"`.

## What would unblock it
One of these:
- written permission from the upstream data owners, or terms that allow commercial reuse;
- a source whose own terms grant that right;
- line-ups the club itself owns (for example its own match sheets).

Record the evidence here, set `rightsDecision: "ACCEPTED"` in the manifest, and get founder approval before publishing.
