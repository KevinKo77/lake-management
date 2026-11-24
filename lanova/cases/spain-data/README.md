# Spain Real Football Data V1 (2026/27)

Data as of **24 November 2026**. Budget €0: no paid source, no scraping against terms.

## Files and licences
Licences are kept apart: a CC0 file never contains CC BY-SA or ODbL data.

| File | Content | Licence |
|---|---|---|
| `clubs-2026-27.cc-by-sa.json` | Registry of the 42 clubs (20 LaLiga, 22 Segunda): LANOVA id, names and aliases, Wikidata QID, verification, identity mapping to LANOVA's results | CC BY-SA 4.0 |
| `squads-2026-27.cc-by-sa.json` | 1,140 player listings with source page, revision and date, quality level and reasons | CC BY-SA 4.0 |
| `results-laliga-2026-27.cc-by-sa.json` | LaLiga 2026/27 fixtures and results with cross-checks | CC BY-SA 4.0 |
| `wikidata-2026-27.cc0.json` | Wikidata facts used (memberships P54 with dates, P569) | CC0 1.0 |
| `coverage-2026-27.json` | Coverage by club and division | LANOVA report |
| `results-readiness-2026-27.json` | The existing completeness gate (`readiness.js`) applied to the recovered results | LANOVA report |
| `source-feasibility.json` | Source feasibility report: inspection, licence, coverage, accuracy, decision | LANOVA report |
| `evidence/` | Facts gathered for the review: release metadata, revision dates, OpenLigaDB probes, Wikidata participants, Segunda verification, Málaga line | — |

LANOVA adapts these source datasets: it normalizes club identities and aliases, adds source-linked coverage/evidence fields, and records the position, city and match-status corrections documented in the derived files. Original source values are retained next to each correction. The release archive SHA-256 and all 83 file hashes in its manifest were independently recomputed on 24 November 2026; see `evidence/openfootballbase-manifest-verification.json`.

**Attribution:**
- Squads, club seasons and results come from OpenFootballBase-Data, release `data-1.24.6`, derived from Wikipedia by its contributors. Licence CC BY-SA 4.0. Every player cites its Wikipedia page and revision.
- Identities come from Wikidata (CC0).
- Fixtures come from openfootball (CC0).

## Quality levels (players)
| Level | Meaning |
|---|---|
| **VERIFIED** (listing) | The player is in the squad section of a dated Wikipedia snapshot after the summer window closed (2 September 2026), with no contradiction. This verifies the listing only, not an official registration. |
| **INFERRED** | The player is listed in a squad source dated before the window closed. |
| **UNVERIFIED** | The record is contradictory: listed at two clubs, marked as left during the season, or the Wikidata membership of this club has ended. |

A Wikidata membership without an end date is never treated as proof of a current registration.

Only **333 of 1,028** players with a Wikidata identifier had their membership checked in this snapshot. `Independently corroborated` is reserved for a specific field supported by its own cited source; it does not upgrade the overall squad listing or establish official registration. No player in this dataset is represented as officially registered because no official registration evidence is included.

## Rebuild
1. Download the release archive and check its SHA-256 against `evidence/openfootballbase-release.json`. Extract it.
2. Read the Wikidata entities into a JSON cache (`wbgetentities`, CC0).
3. Run `python3 scripts/spain/build_spain_data.py --ofb <dir> --wikidata <cache> [--check]`. The script verifies every file used against the release manifest's SHA-256.
4. Run `node scripts/spain/results-readiness.mjs [--check]`.

## Coverage, as of 24 November 2026
- **Squads:** all 42 clubs have a listed squad; 1,140 players in total. The counts by level are in `coverage-2026-27.json`.
- **LaLiga results:** 129 of the 130 fixtures due by 24 November are completed: 129 completed, 1 suspended, 0 missing. The suspended match is not counted as a final 0–0.
  - Matchdays 1–7 agree with openfootball (69/69).
  - Málaga CF agrees with LANOVA's verified line.
  - Levante UD–Elche CF is corrected to its official 1–1 result on 23 November.
  - Rayo Vallecano–Athletic Club remains suspended at 0–0 after 24 minutes; resumption is scheduled for 9 December 2026.
  - 57 recovered results remain single-sourced; this and the unfinished match keep the current-season prediction gate closed.
- **Segunda results:** none available from a usable source.
- **Current-season gate:** stays closed.
