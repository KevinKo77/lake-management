# Rights evidence (Player Intelligence)

This folder holds the **only** evidence that can authorise publishing a non-fictional dataset. A source manifest never can.

An approval of kind `licensed-source` in `../publication-policy.json` must point here with `rightsEvidence: {path, sha256}`. The JSON evidence file must contain:

| Field | Meaning |
|---|---|
| `licensor` | Who holds the rights to the data (not the repository that redistributes them) |
| `instrument` | The licence, contract or written permission, with its reference |
| `commercialUse` | `true` only if commercial use is expressly granted |
| `redistribution` | `true` only if public redistribution is expressly granted |
| `sourceSha256` | SHA-256 of the exact source file the permission covers |
| `reviewedBy`, `reviewedOn` | The independent reviewer and the date |

The gate refuses an approval in any of these cases:
- the file is missing;
- its SHA-256 changed after review;
- a field is missing;
- `commercialUse` or `redistribution` is not `true`;
- it names a different source.

**Status (24 Nov 2026):** empty. No external source is authorised; see `../SOURCE-RIGHTS.md`.
