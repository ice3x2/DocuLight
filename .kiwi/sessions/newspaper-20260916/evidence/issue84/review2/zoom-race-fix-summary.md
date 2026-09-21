# Issue #84 H1 true-zoom race fix

- Requirement: `IR-PRINCIPAL-005`; scope is the sole re-review H1 browser-evidence race.
- RED test: `packages/web/test/issue84-zoom-convergence.test.ts`.
- Frozen SHA-256: `61b9febe2c55e5789b6eb55ee1fe5cc1e784636f56f77e9ef99b4ca674165878`; the current test has the same hash.
- Raw assertion RED: `zoom-race-red-raw.txt` (2 failed/2). The one-shot probe accepted a stale render and failed to time out.
- Green: `zoom-race-green-raw.txt` (2 passed/2).
- Convergence contract: two consecutive samples must match the extension's `chrome.tabs.getZoom`, expected CSS `innerWidth`/`innerHeight`, effective `devicePixelRatio`, resolution media query, `visualViewport.width`/`height`, and `visualViewport.scale`. Timeout throws and stops the capture.
- Every contrast/geometry assertion and screenshot runs only after convergence.
- Product run: three complete repetitions. Each repetition contains 12 normal captures and 2 forced-colors captures, for 42 observations/images total.
- Manifest audit: 42 observations, 3 groups of 14, zero expected-vs-observed CSS viewport/DPR mismatches, 43 output files including the manifest, and no artifact newer than the manifest.
- Zoom cycle: the matrix repeatedly covers 100→200→100 across viewport changes while the same L3 remains open. The final reset to 100% is also convergence-gated.
- Regression: web 113 files / 1343 tests passed; root typecheck and build passed; SpecKiwi validate errors 0 with the existing `SRS-W072` warning.
- Secret scan: no matches in issue #84 text/JSON/log evidence for install tokens, runtime passwords, install sessions, bearer tokens, or session strings.
- No SRS promotion, commit, or GitHub mutation was performed.
