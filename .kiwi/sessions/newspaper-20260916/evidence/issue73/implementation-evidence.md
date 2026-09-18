# Issue #73 implementation evidence

Date: 2026-09-18
Workspace: `C:\Work\git\DocuLight2.0-wt-issue73`
Requirements: `IR-WORKSPACE-001`, `FR-CONFIRM-019`, `FR-PRINCIPAL-007`, `SEC-WORKSPACE-001`

## Contract implemented

- The all-workspaces settings panel exposes exactly three creation fields: workspace name, administrator principal, and default-group initial permission.
- The client sends `POST /api/workspaces` only after a fresh L2 warning read. A changed warning set requires another activation.
- The accepted response's workspace ID is selected before the managed/all/tree/session reads are refreshed.
- Known 4xx failures are retryable. An unknown/lost response preserves the entered tuple, tells the operator to inspect the authoritative all-workspaces list, and disables replay until a field changes. No idempotency guarantee is claimed.
- Superuser authorization is checked live by the server. Non-superusers do not see the form and direct POST is rejected with finite HTTP 403 `{rule:"needs-superuser"}`.
- Issue #72 list/rename/admin-roster behavior and issue #89 work were not changed.

## TDD evidence

The first server RED had 4 failures and 96 passes: the new POST route returned 404 and creation warning context was absent. The first web RED had 4 failures and 6 passes: validation, fresh-warning, changed-warning, and pending behavior were absent. The smallest implementation made the focused server suite 100/100 and the then-current web suite green.

The browser product test then exposed an invalid administrator search scope. The product line was reverted before adding an exact URL contract test. [`red-principal-scope-contract.txt`](./red-principal-scope-contract.txt) records `group:superuser` versus expected `group:system-superuser`; [`green-principal-scope-contract.txt`](./green-principal-scope-contract.txt) records 11/11 after the one-line correction.

Partial-creation limits received a further test-first cycle. [`red-partial-creation-contract.txt`](./red-partial-creation-contract.txt) records two failures: an execution-time warning-read failure was incorrectly described as an uncertain POST and a lost response allowed replay. [`green-partial-creation-contract.txt`](./green-partial-creation-contract.txt) records 13/13 after separating warning reads from POST outcomes and locking the uncertain tuple.

Refresh-outcome honesty received a final test-first cycle. [`red-refresh-outcome.txt`](./red-refresh-outcome.txt) records the missing error-propagating refresh adapter; [`green-refresh-outcome.txt`](./green-refresh-outcome.txt) records the green adapter using `throwOnError: true` for all four authoritative reads.

Final focused verification:

- server workspace API: 101/101 passed
- web creation/admin expanded regression: 33/33 passed
- server and web TypeScript checks: passed
- `git diff --check`: passed
- `speckiwi validate --json`: 0 errors; one pre-existing `SRS-W072` numbering warning

## Product browser evidence

[`browser-matrix.json`](./browser-matrix/browser-matrix.json) and the adjacent screenshots were produced by a Playwright-owned, isolated persistent Chromium profile. A temporary extension called `chrome.tabs.setZoom(tabId, 2)` and every 200% case asserted `chrome.tabs.getZoom(tabId) === 2`. Cleanup restored zoom and separately asserted `getZoom === 1`.

The reviewer-improved final product run in [`playwright-product-review-final.txt`](./playwright-product-review-final.txt) passed:

- 1280×720, 1440×900, and 1920×1080
- light and dark themes
- true browser zoom 100% and 200% for all 12 combinations
- forced-colors at true zoom 100% and 200%
- list/create surface replacement; inline back/footer cancel; cancel selection/scroll/entry-focus restoration; returned-row action focus
- independently measured navigation/content scroll, picker containment, hover/invalid/loading/error states, text contrast, and numeric typography/spacing
- no horizontal overflow, usable controls, L2 content/focus behavior, one POST despite rapid activation, stable returned ID, administrator access, default-group edit access, hidden non-superuser UI, and finite direct non-superuser rejection

Native Windows IME was not driven because this issue expressly prohibits OS automation. Playwright dispatches the composition lifecycle, proves Enter suppression and input preservation, and the browser report labels native IME as unverified rather than claiming evidence that was not collected.

## Independent-review correction cycles

[`red-review-ui.txt`](./red-review-ui.txt), [`red-review-server.txt`](./red-review-server.txt), [`red-warning-loading.txt`](./red-warning-loading.txt), and [`red-create-field-rules.txt`](./red-create-field-rules.txt) preserve the reviewer-driven RED states before their product changes. The corresponding GREEN logs are `green-review-ui-expanded.txt` (33/33) and `green-review-server-final.txt` (101/101). [`final-review-manifest.json`](./final-review-manifest.json) records SHA-256 hashes for every RED artifact, the HEAD/diff identity, and the clean baseline delta.

## Full regression

[`full-regression.txt`](./full-regression.txt) records the complete workspace run. Issue #73 suites are green. Three unrelated baseline failures remain:

- editor architecture contract: 1 failed, 260 passed, 1 skipped (the pre-existing broad React-state source scan)
- server install assembly: 1 failed, 1453 passed (`/theme-bootstrap.js` returned 503 in the test fixture)
- web token-panel computed style: 1 failed, 1049 passed

The failing test identities exactly match the captured pre-review baseline; the added tests increased only the passing counts. No new regression failure remains.

No commit, push, or issue state change was performed.

## Second independent-review correction

The second review's asynchronous accepted-response case received its own test-first cycle. `red-rereview-ui.txt` preserves the initial three UI contract failures, `red-rereview-pending-nav.txt` preserves navigation while a fresh warning read is pending, and `red-rereview-async-refresh-focus.txt` preserves the browser-discovered ordering defect where a 201 response returned before the parent published its refresh error. `green-rereview-async-refresh-focus.txt` records 3/3 after retaining the accepted workspace identity until either its row or an accepted-result fallback target exists.

The final owned-browser run is `playwright-rereview.txt`; it passed the 12 viewport/theme/true-zoom cases plus forced-colors at 100% and 200%. The regenerated `browser-matrix/browser-matrix.json` also records stale warning invalidation, warning-pending navigation suppression, L2 Escape/Cancel focus restoration, draft and administrator preservation, picker containment, popup geometry and scrolling, independent settings scrolling, refresh-failure truthfulness, one POST, forced-colors keyboard focus, and final zoom restoration to 1. Native Windows IME remains explicitly unverified; Playwright verifies only composition events, Enter suppression, and input preservation. A browser route cannot prove the server commit boundary for a dropped response, live authority was not mutated during an accepted POST, and readonly contrast is inapplicable because the exact form has no readonly control.

Final verification after this cycle:

- focused web creation/principal tests: 33/33 passed
- focused server workspace/principal tests: 124/124 passed
- web full regression: 1 pre-existing token-panel failure, 1052 passed
- server full regression: 1 pre-existing install-assembly failure, 1453 passed
- web and server typechecks: passed
- `git diff --check`: passed
- SpecKiwi validation: 0 errors and the pre-existing `SRS-W072` warning; therefore `--fail-on-warning` exits 1

`final-review-manifest.json` is regenerated after all product, test, browser, and evidence files and hashes every current tracked modification and untracked file except itself. Its `baselineDelta` distinguishes the unchanged baseline failures from the increased passing counts.

## Third independent-review correction

The warning preflight now follows Astra line 40 exactly: only `만들기` is disabled while `권한 부여 내용을 확인하는 중입니다` is shown; inline Back and Cancel remain enabled. Actual POST pending still disables execution and dismissal. `red-rereview-warning-cancel.txt` records the old text and over-blocked navigation before the 19/19 GREEN correction.

`red-rereview-ime-readonly.txt` records the picker selecting a principal on composing Enter and the missing frozen-summary readonly semantics. `red-rereview-product-expanded.txt` records actual Chromium collapsing the name selection from `[2,5]` to `[120,120]` across warning retry and L2 cancellation. The implementation now tracks picker composition through compositionupdate, preserves the name caret/selection, labels the frozen summary `aria-readonly`, and prevents a closing Radix dialog from stealing the parent-owned accepted-result focus.

`playwright-rereview-expanded.txt` is the final successful browser run. In addition to the 12-environment matrix, it measures a 20-row picker while already open through live zoom `1 → 2 → 1` and runtime viewport resizing, with popup containment and actual `scrollTop=max=800`. It asserts compositionstart/update/end and picker selection suppression, caret `[2,5]`, warning-preflight navigation availability, theme-state contrast, frozen-summary semantics and contrast, forced-colors keyboard focus outline, and an actually held POST where Cancel/execute and Escape stay blocked until the response is released. Native Windows IME remains unverified because OS automation is prohibited.

Server API evidence in `server-failure-injection.txt` injects DB, directory, and sidecar failures. DB failure leaves no row. Directory and sidecar failures expose the real DB-only or DB+directory partial state with no ACL and no sidecar. Every response is the truthful finite HTTP 500 `{rule:"creation-unknown"}`; no rollback or commit-boundary guarantee is claimed.

Final verification for this correction:

- focused web: 35/35 passed
- focused server: 127/127 passed
- product Playwright: passed
- web full regression: one unchanged token-panel failure, 1054 passed
- server full regression: one unchanged install-assembly failure, 1456 passed
- web/server typechecks: passed
- SpecKiwi: 0 errors and the pre-existing `SRS-W072` warning

## Final accessibility and editor-invariance gate

`red-final-gate-contrast-editor.txt` preserves the first owned-browser RED. All newly added contrast and editor-open/cancel assertions had passed, but the accepted-creation refresh-error path exposed a real focus ordering defect: when the created row was already present in a cached list, focus preferred that row over the refresh retry action. `red-final-gate-focus-diagnostic.txt` records the active created-row button while the refresh-error dialog remained open. The minimal correction gives the retry action priority whenever the accepted result reports a refresh error. `playwright-final-gate.txt` is the GREEN rerun and records `PASS issue73 creation and 12-environment browser matrix`.

The regenerated `browser-matrix/browser-matrix.json` contains calculated assertions, rather than color samples alone:

- light/dark normal control boundary ratios are 3.47 and 4.88; focus-ring ratios are 5.89 and 8.78
- light/dark invalid-boundary ratios are 5.54 and 8.44
- light/dark picker-selected text ratios are 12.30 and 7.93
- disabled opacity is exactly 0.65 in both themes, with composited identification ratios 5.58 and 3.98
- editor identity, node ID, draft `# issue73 editor draft\n`, and save count `1` are identical after settings creation opens, after cancellation, and after completed creation

The sidecar failure injection now additionally performs `stat(docsRoot/workspaceId)` and asserts `isDirectory() === true`, proving the reported DB+directory partial state. `green-sidecar-directory-proof.txt` records the focused server API suite at 104/104.

Final gate verification:

- product Playwright: passed, including all 12 viewport/theme/true-zoom combinations and forced-colors 100%/200%
- focused parent/confirm UI: 23/23 passed
- focused server workspace API with directory proof: 104/104 passed
- web/server typechecks: passed
- `git diff --check`: passed

The full regressions were not repeated for this evidence-only gate. The sole product correction is covered by the browser RED/GREEN and focused parent-flow tests; the immediately preceding complete regressions and their unchanged baseline failures remain recorded above.
