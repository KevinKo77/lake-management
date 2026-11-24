# Spain Real Football Data V1 (2026/27)

Data as of **24 November 2026**. Budget €0: no paid source, no scraping against terms.

## Files and licences
Licences are kept apart: a CC0 file never contains CC BY-SA or ODbL data.

| File | Content | Licence |
|---|---|---|
| `clubs-2026-27.cc-by-sa.json` | Registry of the 42 clubs (20 LaLiga, 22 Segunda): LANOVA id, names and aliases, Wikidata QID, verification, identity mapping to LANOVA's results | CC BY-SA 4.0 |
| `squads-2026-27.cc-by-sa.json` | 1,140 player listings with source page, revision and date, evidence code and reasons, source and effective position | CC BY-SA 4.0 |
| `results-laliga-2026-27.cc-by-sa.json` | LaLiga 2026/27 fixtures and results with cross-checks | CC BY-SA 4.0 |
| `wikidata-2026-27.cc0.json` | Wikidata facts used (memberships P54 with dates, P569) | CC0 1.0 |
| `coverage-2026-27.json` | Coverage by club and division | LANOVA report |
| `results-readiness-2026-27.json` | The existing completeness gate (`readiness.js`) applied to the recovered results | LANOVA report |
| `source-feasibility.json` | Source feasibility report: inspection, licence, coverage, accuracy, decision | LANOVA report |
| `evidence/` | Facts gathered for the review: release metadata, archive and manifest verification log, manual and match corrections, revision dates, OpenLigaDB probes, Wikidata participants, Segunda verification, Málaga line | — |

**LANOVA modified/adapted the CC BY-SA source data** (CC BY-SA 4.0, section 3(a)(1)(B)). Each CC BY-SA file carries `modifiedByLanova: true` and a `modifications` list:
- filtered the release to LaLiga and Segunda División 2026/27;
- normalized club identities and aliases, and mapped clubs to LANOVA ids, Wikidata QIDs and LANOVA result names;
- added revision dates, evidence codes with reasons, Wikidata membership checks and dates of birth (Wikidata, CC0);
- recorded dated corrections with the source value kept: 4 Málaga CF positions (`positionCorrection`, `effectivePosition`), 2 LaLiga fixtures (`sourceSnapshot`), 1 club city (`sourceCity`);
- cross-checked results against openfootball (CC0), LANOVA's verified Málaga CF line and official LaLiga match pages.

The derived files stay under CC BY-SA 4.0 (share-alike). The CC0 Wikidata facts stay in their own file.

**Archive integrity.** `python3 scripts/spain/verify_ofb_archive.py` downloads the release, checks the archive SHA-256 against the pinned value, the git tag commit and the manifest date, then recomputes the SHA-256 of **every** file the manifest lists with a hash. It exits 1 on any mismatch and writes the audit log `evidence/openfootballbase-manifest-verification.json`. Last run, 24 November 2026: **PASS, 91 of 91 files** (tables 29, seasons 54, work 7, home 1; LANOVA reads 5 of them). An earlier static log covered only 83 files (tables and seasons). One check is blocked and is not claimed: the digest GitHub publishes for the asset (GitHub REST API: HTTP 403 from the build environment).

**Attribution:**
- Squads, club seasons and results come from OpenFootballBase-Data, release `data-1.24.6`, derived from Wikipedia by its contributors. Licence CC BY-SA 4.0. Every player cites its Wikipedia page and revision.
- Identities come from Wikidata (CC0).
- Fixtures come from openfootball (CC0).

## Evidence codes (players)
`quality` holds **internal evidence codes**. They do not mean official verification or registration. The explorer shows the labels below, never the bare codes.

| Code (data) | Label shown | Meaning |
|---|---|---|
| `VERIFIED` | Dated Wikipedia listing | In the squad section of a dated Wikipedia snapshot after the summer window closed (2 September 2026), with no contradiction. A listing only, not an official registration. |
| `INFERRED` | Inferred | Listed only in a squad source dated before the window closed. |
| `UNVERIFIED` | Unverified (contradictory) | Contradictory record: listed at two clubs, marked as left during the season, or the Wikidata membership of this club has ended. |
| — | Independently corroborated field | A named field (so far: position, 4 Málaga CF players) supported by its own official source. It does not upgrade the listing. |

The coverage counts `verified` / `inferred` / `unverified` count these codes (see `countNote` in `coverage-2026-27.json`). Every player has `registrationStatus: not-established`.

**Positions.** `position` is the source value, kept unchanged. `effectivePosition` is the position LANOVA uses and displays: the source value, or the officially corroborated value where `positionCorrection` exists. Consumers must read `effectivePosition`.

A Wikidata membership without an end date is never treated as proof of a current registration.

Only **333 of 1,028** players with a Wikidata identifier had their membership checked in this snapshot (the explorer reads this count from `coverage-2026-27.json`). `Independently corroborated` is reserved for a specific field supported by its own cited source; it does not upgrade the overall squad listing or establish official registration. No player in this dataset is represented as officially registered because no official registration evidence is included.

## Rebuild
1. Run `python3 scripts/spain/verify_ofb_archive.py` (download and integrity check, see above), then download and extract the same archive for the build.
2. Read the Wikidata entities into a JSON cache (`wbgetentities`, CC0).
3. Run `python3 scripts/spain/build_spain_data.py --ofb <dir> --wikidata <cache> [--check]`. The script verifies every file used against the release manifest's SHA-256 and reproduces the committed files byte for byte (`--check`).
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
