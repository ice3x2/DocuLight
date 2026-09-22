# Issue #64 implementation verification

Date: 2026-09-17

## Scope and requirements

The implementation is limited to TrashPanel, its scoped styles and tests, and the existing trash-specific App/AppShell/query handoff. It traces to FR-SHELL-007, IR-SHELL-002, IR-SHELL-006, IR-SHELL-009, CON-ARCH-004, SEC-SHELL-001, SEC-STORAGE-002, SEC-STORAGE-003, FR-STORAGE-006, FR-CONFIRM-006, and CON-CONFIRM-001. No server endpoint, authorization policy, or product dependency was added.

## TDD chronology

The initial frozen component contracts failed 6/6 (`red-final-tests.log`), App/AppShell contracts failed 4/4 (`red-app-wiring.log`), and the scoped-style contract failed 1/1 (`red-scoped-style.log`). Minimal implementations produced the corresponding GREEN logs.

The independent-review fixes also followed test-first cycles. Context-stale completion, independent row outcomes, and removal focus produced 2 failures with 7 passes (`red-focus-context.log`) before the final 9/9 GREEN (`green-focus-context.log`). Cached rows during background fetch produced 1 focused failure (`red-background-refresh.log`) and then passed (`green-background-refresh.log`). Browser-first assertions separately failed focused-row pinning (`red-virtual-keyboard.log`) and mounted 100% to 200% anchor preservation (`red-mounted-zoom.log`) before the implementation passed the complete matrix. The 899/900/901 resize anchor assertion passed against the existing implementation; that run is truthfully recorded as `existing-resize-anchor.log`, not RED. Expanded multi-role product assertions first failed because their required inputs were absent (`red-product-roles.log`) and then passed through the final product runner.

The final review found that L2 confirmation moved focus from the originating row into the dialog, so the successful purge path did not schedule removal focus. A frozen purge-dialog next/previous/heading contract failed 1/1 for that reason (`red-purge-dialog-focus.log`). The implementation now carries the operation's focus ownership through dialog settlement and waits for dialog teardown before choosing the first enabled action on the next row, previous row, or the heading. The lifecycle file then passed 10/10 (`green-purge-dialog-focus.log`), and the real L2 success path asserts the focused next-row node and action in every browser environment (`green-purge-dialog-browser.log`, final `browser-run.log`). Restore behavior remains on its existing path.

The raw evidence therefore records 15 failing automated test cases (6 + 4 + 1 + 2 + 1 + 1) and three failing end-to-end harness runs (virtual keyboard, mounted zoom, and expanded product roles) before their implementations. Tests were not weakened to reach GREEN.

## Automated results

- Final focused TrashPanel lifecycle: 1 file, 10/10 passed (`green-purge-dialog-focus.log`).
- Final targeted web regression: 2 files, 68/68 passed (`targeted-web.log`).
- Full web regression: 76 files, 896/896 passed (`full-web.log`).
- Relevant server regression: 4 files, 72/72 passed (`server-trash.log`).
- Workspace typecheck: editor, server, and web passed (`typecheck.log`).
- Final browser matrix: 12/12 environments plus forced colors at 100% and 200% (`browser-run.log`).
- Final real product path: PASS, roles=3, restore=1, purge=1, observed lists=5 (`product-run.log`, `product-result.json`).

## Browser matrix

The browser run used only freshly launched Playwright-owned isolated Chromium. It covered 1280x720, 1440x900, and 1920x1080 in light and dark at 100% and true 200%. Each 200% run used a disposable persistent profile with a test-only extension invoking `chrome.tabs.setZoom(2)` and verified `getZoom() === 2`; recorded pre/post viewport and DPR values are distinct. The representative mounted panel additionally transitioned 100% to 200% to 100%, verified `[1,2,1]`, ended with `getZoom() === 1`, and retained the same `trash-544` anchor at the same 19 px relative offset. Forced-colors assertions and screenshots were taken on the actual populated panel at both zoom levels.

Every environment drives the five-column list with 1,000 logical rows and bounded rendered rows, long Korean paths, native select keys, query loading/error/retry/ready, retained lens state, middle/last keyboard navigation, Tab and Shift+Tab across virtual boundaries, focused-row pinning, restore failure/retry, permission-dependent purge absence, and L2 purge cancel/failure/retry/success. After actual L2 acceptance and successful removal, every environment asserts focus on `trash-1`'s enabled restore action. The 899/900/901 transitions assert stable node identity and relative offset, remeasurement without gap/overlap, and the node ID actually clicked. Unit coverage additionally proves next, previous, and heading fallback. Computed focus ring width/offset/contrast, target size, viewport bounds, and row geometry are stored in `browser-matrix/browser-matrix.json`; 14 screenshots include all 12 environments and populated forced-colors 100%/200% states.

## Product path

The final harness launched one fresh Playwright-owned Chromium with three isolated contexts and pages: a superuser, a mixed manager (admin on one workspace and editor on another), and a regular user with no workspace. It observed mine, all, and workspace lens semantics; losing the manager grant excluded another user's item on the next query; forbidden restore/purge returned 404/403 while the item remained intact.

The product run observed five list requests, one actual restore, and one actual purge. No DELETE occurred before L2 acceptance. Restore preserved the original bytes, node ID, ACL, and version history; a name collision used a suffix without overwriting the existing document. Purge made the document, versions, ACL, attachment, and subsequent restore paths all return 404. Evidence records route/count/status semantics without credentials or content bodies.

## Stale-result and refresh behavior

Mutation settlement is awaited separately from query refresh. A stable context key combines owner, auth generation, workspace, and scope, so late outcomes cannot repaint a changed context. Results remain per node, concurrent row outcomes do not erase one another, and same-row duplicate dispatch is blocked. Successful removal moves focus deterministically. Background query fetches retain cached rows and their scroll/focus state instead of replacing the panel with a loading surface.

## Known limits

- The existing API does not expose an authoritative per-row `canRestore` capability or a missing-parent destination choice. Restore is gated by callback availability and server outcome; the implementation does not claim the unsupported missing-parent destination branch of FR-STORAGE-006.
- The existing response has no retention deadline, renamed-destination result, or undo contract, so those are not presented in the panel.
- Native operating-system IME windows, third-party browser extensions, and native dialogs were not exercised. Korean content and keyboard behavior were tested through Playwright-owned browser input. The zoom extension was a disposable test harness owned by Playwright.
