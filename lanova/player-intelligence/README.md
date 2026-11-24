# LANOVA Player Intelligence V1

Historical player facts with evidence. Player Intelligence extends the Spain Real Football Data V1 infrastructure. It does not replace it, and it does not change the existing 2026/27 squad data.

**Status: development preview.** It runs on **fictional demonstration data** only. Real LaLiga 2025/26 line-ups are withheld until their reuse rights are established (see [SOURCE-RIGHTS.md](SOURCE-RIGHTS.md)).

## Architecture
```
Football.TXT "full" file ─► parse.js ─► facts.js ◄─ identity.js ◄─ registry (aliases + club-season affiliations, each with a source)
                                         │
                       dataset (OBSERVED / DERIVED / UNAVAILABLE, identity audit, validation)
                                         │
              compare.js ── report.js ── contract.js ─► recruitment scenario (user-supplied fee, wage, revenue, resale, priority)
                                         │
                  /lanova/cases/player-intelligence/  (search · profile · comparison · evidence · export)
```
- The engines are pure ES modules with no I/O and no dependencies. They run in Node and the browser and are tested independently.
- `contract.js` does not import the Finance, Advantage or Recruitment engines. A test checks that its output is accepted unchanged by `lanova/optimizer/model.js → validateCandidates`.

## Identity rule
A name in a match designates a player only when two kinds of evidence agree:
- **Alias:** a documented spelling of the name, with its source.
- **Affiliation:** a documented link to **that club in that season**, with its source.

Outcomes:
- **RESOLVED** — one candidate. Confidence is "high" when the alias matches up to letter case, "medium" when it matches only after removing accents.
- **AMBIGUOUS** — several candidates; none is chosen.
- **UNRESOLVED** — no candidate. The same name documented at another club is reported but never used.
- **CONFLICT** — a supplied identifier contradicts the evidence.

Unresolved records keep the key `unresolved:<club>:<name>` and no player id. Nothing upgrades them later, and the contract refuses them as recruitment candidates.

## Facts
- **OBSERVED:** appearances, starts, substitute appearances, times substituted off, goals (own goals excluded), penalty goals, own goals, yellow cards, second yellows, straight reds, cards while not on the pitch.
- **DERIVED:** estimated minutes.
  - Formula: a starter counts from 0, a substitute from the minute he came on. The count ends at the minute he was replaced, otherwise at 90. A dismissal ends it at its minute.
  - Added time is ignored: `90+4` counts as 90. The estimate is therefore a **lower bound**, and a player who came on in added time gets 0. It is not official playing time.
- **DERIVED in comparisons only:** per-90 rates, shown only when every compared record has at least 900 estimated minutes.
- **UNAVAILABLE**, never a number: assists, xG, xA, shots, passes, tackles, interceptions, market value, salary, injury risk, performance rating, future performance probability.
- **Missing values stay `null`, never 0.**
- **Inconsistent records are flagged, not corrected.** Examples: a scorer missing from the line-up, or a player listed twice in one match.
- **No overall score, ranking or recommendation.** Historical facts do not describe the current or a future season.

## Reproduce
```bash
node scripts/player-intelligence/make_demo_fixture.mjs --check      # fictional fixture, byte for byte
node scripts/player-intelligence/build_player_facts.mjs --check     # demonstration dataset, byte for byte
node --test tests/player-intelligence.test.mjs
node tests/player-intelligence-e2e.mjs out/player-intelligence     # desktop + iPhone 13
```

Local audit of the real file. Its outputs stay **outside** the repository: the build refuses otherwise.
```bash
python3 scripts/player-intelligence/registry_from_ofb.py --ofb <OpenFootballBase data-1.24.6 dir> --txt <1-liga-full.txt> --out /tmp/pi/registry.json
node scripts/player-intelligence/build_player_facts.mjs --source <1-liga-full.txt> --registry /tmp/pi/registry.json --manifest /tmp/pi/manifest.json --out /tmp/pi/facts.json
```
The aggregate results are in `evidence/source-audit-laliga-2025-26.json`:
- **Matches and events:** 380 matches, 11,953 appearances, 1,000 goals + 24 own goals, and 1,652 / 38 / 69 cards (yellow / second yellow / straight red). These are identical to an independent parse.
- **Identity:** 482 of 613 player-club records resolved with evidence (87.1 % of appearances), 131 unresolved, 0 ambiguous, 0 conflict.
- **Cross-check:** on the pairs found by both methods, appearance counts are identical in 480 of 480 cases.
