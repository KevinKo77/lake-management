# Lake Management

Static presentation site and local research workspace. No build or runtime dependencies. Run `node scripts/serve.js` and open http://127.0.0.1:8080. Opening index.html directly as a file is unsupported.

## Public scope

The public distribution contains the presentation UI, deterministic browser-side financial model, local-state validation, exports, fictional demo and functional tests. No private repository history, investor documents, fundraising budget, roadmap, credentials, customer information, real contracts or saved portfolios are included. Code delivered to a browser is publicly readable; this is not an authenticated private workspace.

The two real sporting context profiles in data/tennis.json are a dated CC0 Wikidata snapshot with revision URLs. Historical rankings are not current performance. The financial demo uses synthetic identities and invented assumptions. No athlete relationship, available offer, verified diligence, investment performance or regulatory authorization is asserted.

Cases are saved in the visitor's browser, not remotely. Demo mode runs in memory and preserves the working portfolio. Exports are unencrypted. Do not enter confidential information. No analytics or external runtime dependencies are used. Hosting requests still reach the hosting provider.

Internal investor-document existence tests were excluded along with those documents. Functional financial and browser tests are retained.

## Checks

- `node --test` — 76 functional tests.
- `node scripts/check.js` — JavaScript syntax.
- `node scripts/verify-data.js` — exact snapshot SHA-256 and schema audit.
- `node scripts/smoke.cjs` — full real-browser flow; requires externally available Playwright and Chromium. Optional LAKE_CHROMIUM selects the executable and LAKE_SCREENSHOT_DIR selects the output directory.

## Publication gate

This review branch does not deploy the site. CNAME and the Google verification file are preserved byte for byte. There is no deployment workflow or configuration change.

Before merging, review the new positioning: the home page changes from strategic advisory to a sports-investment research project. The founder name, biography, photograph and business contact are restored from the existing public site. Lake Management is presented as a sports-economy investment-platform project, and Lake Intelligence as a multisport research-platform project whose current demo focuses on tennis. Regulatory authorizations are not represented as obtained. No payments or real investments are available.

After explicit approval, merge the reviewed PR into main. Under the existing Pages main/root configuration, that merge is the publication trigger. Do not change DNS, the Pages source or CNAME. Then check the home page, mobile navigation, fictional demo, exports and data integrity at the existing domain. If necessary, revert the integration commit via a reviewed PR; do not reset main.

The local development server supplies additional HTTP security headers. GitHub Pages does not inherit those server headers; the HTML meta CSP is part of the static site. Browser-local storage is not access control or encrypted storage.
