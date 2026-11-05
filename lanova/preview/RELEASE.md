# Isolated preview release gate

Prepared 5 November 2026. Source: lake-intelligence PR #17, 0626da1e2d4764d08f7d2e6dcd32920bc01ca01c. Target: lake-management /lanova/preview/ only. Existing homepage, /lanova/index.html and /lanova/recruitment/ must remain byte-identical.

The preview keeps its own v3/, recruitment/ and src/ dependencies. Relative worker/module imports resolve inside /lanova/preview/, never into the current product. Only preview index notices/noindex have been added; calculation engine modules are copied without implementation changes. No application fixes are implied by the preview packaging.

The branch and deployment PR are preparation artifacts, not permission to publish. **NO-GO for paid-customer release or public promotion pending Commercial MVP SHA and independent verification.** Synthetic-data evaluation preview may be considered separately by the owner, but still requires explicit merge/publish approval. Do not merge now.

Known PR #17 concerns to resolve: contradictory EUR exchangeRate may be ignored; XLSX date/style semantics are not fully validated; what-if/report workflow requires independent review. The accompanying audit, not old developer-authored tests, determines the final list.

Before approval: inspect manifest.json; verify PR files are confined to lanova/preview/; replay independent import/confirmation/what-if/download/mobile checks against this exact path; use only synthetic data; verify no dependency request escapes the prefix; verify existing-route hashes; confirm no deployment automation publishes unreviewed branch changes.

Rollback after any separately approved release: revert only the preview commit. No DNS, homepage, existing recruitment route, CNAME, analytics or authentication changes are part of this PR. Noindex is a discoverability hint, not an access-control mechanism.
