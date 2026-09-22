# Issue 58 implementation evidence

Requirements: `FR-ATTACH-003`, `FR-SHELL-008`, `FR-EDITOR-006`, `FR-CONFIRM-005`, `FR-CONFIRM-010`; presentation contracts `IR-SHELL-006`, `IR-SHELL-008`, `IR-SHELL-009`, `IR-SHELL-010`.

## TDD chronology

1. `red-rtl.txt`: before product edits, the focused 5-test suite reached three intended failures: no image state region; binary selection invoked `onPick` immediately; target changes retained no guarded confirmation action. Existing PDF download-only and Markdown direct handoff checks passed.
2. `green-rtl.txt`: the same focused suite passed 5/5 after the minimum component implementation.
3. `red-playwright-geometry.txt`: after writing the browser checker, the image-fit CSS slice was removed. The checker reached the computed-style assertion and failed with `fill !== contain`. The fit CSS was then restored.
4. `green-playwright-final.txt`: isolated Playwright matrix passed 12/12. Every case uses a unique persistent profile. Genuine 200% cases use the extension service worker and `chrome.tabs.setZoom(tabId, 2)` with `getZoom() === 2`; a separate forced-colors check also passed.
5. `product-integration.txt`: disposable real-product flow passed exact binary storage, stable target identity, Markdown prior-version retention, view-only UI disablement and server 403 enforcement.
6. `product-matrix.json` and `product-matrix-*.png`: the authenticated disposable AppShell passed the full 12-environment matrix with three-panel preservation, issue surfaces, disabled/hover states and numeric text/warning contrast.
7. Latest review-fix regression: web 68 files / 747 tests, targeted issue/shell wiring 69/69, typecheck and build passed. The earlier editor regression remains 261 passes + 1 existing skip. Build emitted only the existing chunk-size warning.
8. The original run had no raw pre-implementation RED file for IR-SHELL-010. The strict rebuild on 2026-09-17 removed the IR async/result/focus production slices while retaining image/download and binary L2 work, then executed the existing IR suite. `ir-shell-010-rebuild-preimplementation-red.txt` records 10 actual failures / 6 passes before reimplementation. `ir-shell-010-fallback-red.txt` separately records the two new missing/permission-removed target fallback failures before their implementation.
9. `ir-shell-010-rebuild-green-vitest.txt` records 85/85 targeted issue, screen-wiring, and autosave tests after the minimum rebuild. `ir-shell-010-tab-fallback-red.txt` and `ir-shell-010-tab-fallback-green.txt` record the final unavailable-tree-region callback RED and the complete issue58 suite passing 17/17. `ir-shell-010-rebuild-typecheck.txt` records a clean typecheck. `ir-shell-010-rebuild-playwright.txt` records the isolated Chromium product flow and 12-case matrix passing. No external browser or OS input was used.
10. Final objective regression logs: `ir-shell-010-rebuild-full-web.txt` records 68 files / 750 tests passing; `ir-shell-010-rebuild-editor.txt` records 23 files / 261 passing + 1 skipped; `ir-shell-010-rebuild-build.txt` records a successful 2,980-module production build with the existing chunk-size warning; `ir-shell-010-rebuild-diff-check.txt` records exit code 0 with line-ending warnings only.
11. The final stale-focus repair reproduces the exact case where another row remains `aria-selected`, the upload target becomes the last focused/context-menu row, and only that target disappears after a permission refresh. `ir-shell-010-stale-last-focus-red.txt` records the pre-fix failure. The minimum production change retries the live selected-row lookup when the remembered row no longer exists. `ir-shell-010-stale-last-focus-green.txt` records 87/87 targeted tests, `ir-shell-010-stale-last-focus-full-web.txt` records 68 files / 751 tests, and `ir-shell-010-stale-last-focus-playwright.txt` records the isolated 12-case product matrix passing.

## Browser evidence

`measurements.json` records viewport/image rectangles, computed `object-fit`, max bounds, DPR, download and dialog geometry and overflow for 1280×720, 1440×900, 1920×1080 × light/dark × 100/200%. `surface-*.png` and `matrix-*.png` contain image and L2-dialog screenshots for all 12 environments. `forced-colors.json`/`.png` record the separate forced-colors run. The checker also verifies a real Playwright download event, exact Unicode suggested filename and SHA-256 of the server bytes; PDF has no viewer DOM. Binary selection causes zero callback, Escape causes zero callback and preserves selection, and one destructive affirmative action causes exactly one callback with cancel-first focus.

## IR-SHELL-010 result wiring

`onPick(file)` now returns `Promise<NewVersionResult>` through App, AppShell and NewVersionPrompt. The prompt stays mounted for upload and refresh outcomes, treats a runtime contract violation as unknown rather than success, retries only failed GET targets after an accepted upload, and gives result focus to retry or close. AppShell owns whole-form focus restoration. Final close restores the same node when present, otherwise the last valid selected file row, then the tree region, then the document-tree tab if the region is unavailable. Product Playwright covers tree-only, document-only and combined refresh failures plus successful GET cardinality, with no repeated POST or new L2 on refresh retry. OS-native file-picker IME remains outside browser automation; browser evidence uses a Korean/emoji filename and Playwright file-input events only.

## Staging hygiene

No files are staged by this repair agent. Commit selection must remain limited to the reviewed issue 58 product, test and evidence paths; unrelated `kiwi/.status.json`, `kiwi/waves.jsonl`, other issue evidence and session artifacts remain excluded.
