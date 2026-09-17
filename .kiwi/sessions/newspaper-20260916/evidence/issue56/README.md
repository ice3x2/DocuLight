# Issue #56 evidence

## Implemented behavior

- Version history has distinct loading, empty, error/retry, and ready states. Comparison has idle, loading, error/retry, and ready states.
- A successfully loaded version becomes the selected row; late earlier requests cannot replace the latest selection.
- Version comparison uses two read-only CodeMirror panes with named, complete, visually hidden raw-source alternatives. Conflict comparison keeps its editable right pane and its raw alternative follows the live conflict draft.
- Restore targets the stored node/sequence, suppresses duplicate row/footer submissions, reports failure without closing or invoking success, and retries the same operation. Success focuses the existing document-menu trigger and then invokes the existing completion callback once.
- The list scrolls independently within `min(240px, 30dvh)`. Comparison remains side-by-side with two 240px minimum panes and horizontal viewport scrolling at narrow effective widths.

## Verification

- `red-version-history.txt`: initial behavior RED, 3 intended failures.
- `red-restore-duplicate.txt`: duplicate mutation RED (`2` calls versus `1`).
- `red-stale-comparison.txt`: late response overwrote latest selection RED.
- `red-playwright-layout.txt`: computed list overflow RED after removing the affected CSS implementation.
- `red-playwright-restore-focus.txt`: successful close left focus without the document-header target.
- `red-playwright-conflict-raw-source.txt`: edited conflict draft was not reflected by the complete raw-source alternative when the update listener was removed.
- `red-shared-buttons-status.txt`: shared action hierarchy and polite compare completion status were absent.
- `red-playwright-compare-focus.txt`: disabling the pending compare action dropped focus from its initiating control.
- `red-playwright-restore-error-focus.txt`: a failed restore left focus outside the operation area before retry-focus wiring.
- `red-playwright-row-wrap.txt`: genuine 200% kept actions beside metadata instead of wrapping them below it.
- `red-duplicate-compare.txt`: two pending clicks issued two reads for the same sequence.
- `red-playwright-keyboard-traversal.txt`: the read-only left/right pane scrollers were missing from the keyboard sequence.
- `red-compare-a-b-a.txt`: the repeated pending A selection in A→B→A was ignored, so B remained selected after both requests completed.
- `red-playwright-diff-cues.txt`: the pure-insertion case reached the semantic cue assertion with a false `− 삭제` cue in the empty left document.
- `green-version-history-final.txt`: 14/14 focused web tests PASS.
- `green-playwright-layout-final.txt` and `green-version-measurements.json`: actual AppShell → DocumentArea menu/history/compare/restore flow, six 100% environments and six genuine 200% environments PASS. The 200% run uses isolated persistent Chromium contexts and an extension calling `chrome.tabs.setZoom(2)`; no CSS zoom, DPR substitution, or half viewport is used. Measurements include before/after shell columns, CSS viewport/DPR, 240px pane minima, narrow horizontal overflow and scroll, rows/actions, selected marker, hover/focus and clipping, text/control/focus contrast, hidden-source geometry, pending disabled state, and empty/equal/insertion/deletion cases.
- `authenticated-product-green.txt`: a disposable installed instance and authenticated Playwright session passed the real App → HTTP API flow. It observed exact restored bytes by a fresh document read, stable node and version identity, a restore-created history entry, and view-only restore rejection with the history/error UI retained. The runner emitted no credentials and removed its owned data/processes.
- `server-version-service.txt`: actual persistence service tests 19/19 PASS, including restore/ACL/history behavior.
- `web-full-rereview2.txt`: web 728/728 PASS on the final revision.
- `editor-full-rereview2.txt`: editor 261 PASS, 1 skipped.
- `typecheck-rereview2.txt`: web TypeScript PASS.
- `web-build-rereview2.txt`: production build PASS (existing bundle-size warnings only).
- `server-version-service-rereview.txt`: version service 19/19 PASS on the final revision.
- `authenticated-product-rereview2.txt`: the disposable authenticated product/API persistence and view-only rejection check passes after the second review fixes.
- `green-compare-a-b-a.txt`: focused VersionHistory tests 16/16 PASS, including one-request reuse with latest-intent A→B→A behavior.
- `green-playwright-diff-cues.txt`: the checked-in 12-environment Playwright checker passes exact non-color cue semantics for empty, equal, insertion, and deletion shapes.
- `web-full-final.txt`: web 729/729 PASS after the third-review fixes.
- `editor-full-final.txt`: editor 261 PASS, 1 skipped.
- `typecheck-final.txt`: web TypeScript PASS.
- `web-build-final.txt`: production build PASS (existing bundle-size warnings only).

The screenshots named `green-version-<viewport>-<zoom>-<theme>.png` show the full AppShell with open comparison before restore for all 12 environments. The layout fixture uses actual AppShell, DocumentArea, VersionHistory, MergeView, and DocumentSurface components with deterministic transport. The separate authenticated product checker composes the shipped App and real API/persistence boundary.

## Limits and separate integration outcomes

- The existing DocumentArea completion callback closes history but does not refresh its `bodies[nodeId]` input. #56 therefore does not claim that the visible editor immediately reflects the restored bytes. App/query/autosave refresh and stale-save protection remain separate traced integration scope under the frozen decision.
- The repository's standalone `merge-view-check.mjs` invocation initially could not run without supplied credentials/live servers; `browser-merge-regression.txt` records that prerequisite result. The final disposable runner supplies isolated credentials and validates the #56 real product/API route. Shared conflict edit/raw-source behavior is additionally covered in the final #56 Playwright checker and full web/editor suites.
- Automated composition is synthetic and no new history text input exists, so native Windows IME validation is not applicable to the new history UI.
