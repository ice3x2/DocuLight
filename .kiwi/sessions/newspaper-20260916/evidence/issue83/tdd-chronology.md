# Issue 83 TDD chronology

- Requirement: `IR-WORKSPACE-002` (`Status=planned`, `Stability=stable`).
- Binding design: `astra-decision.md`, independently accepted by `decision-review.md` with C0/H0/M0/L0.
- RED: `red-server-raw.txt` records the absent endpoint as three HTTP contract failures; `red-web-raw.txt` records the absent typed client, source query, and fingerprint contract. `red-source-hashes.json` binds those raw outputs and the test sources as they existed before production edits.
- GREEN: `green-server-focused-raw.txt` and `green-web-focused-raw.txt` record focused server and real-App tests. The tests were not weakened during implementation; later additions cover malformed responses, unauthenticated cache policy, pending old-owner removal, same-count scope replacement, retry focus, and removed-owner focus recovery.
- Regression: `full-regression-raw.txt`, `preserved-76-79-88-86-raw.txt`, `typecheck-raw.txt`, and `build-raw.txt` preserve broad and named predecessor checks.
- Product: `product-12-plus-2-raw.txt` and `browser-matrix/capture-manifest.json` record a built-App run against isolated temporary databases/docs roots and an owned persistent Chromium profile. The manifest records 12 light/dark viewport/true-zoom captures, two forced-colors captures, exact artifact membership, real `chrome.tabs.setZoom/getZoom`, role privacy responses, and atomic manifest-last publication.
- SRS promotion and commit remain intentionally deferred until independent implementation review.
