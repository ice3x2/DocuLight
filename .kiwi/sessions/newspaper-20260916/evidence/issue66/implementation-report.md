# GitHub #66 existing-prop presentation implementation

Date: 2026-09-18
Requirements: FR-SHELL-015, FR-ACL-006
Scope: `RelocationDialog` and `RelocationPreview` presentation, directly related tests, and an isolated component-bundle browser harness.

## Result

The move/copy dialog now uses the approved exact Korean text, a full-width native select with persistent label/placeholder and selected full-path readout, a bounded scrolling dialog body with fixed header/actions, operation-specific primary and close labels, visible focus, Escape and cyclic Tab handling, long-text wrapping, and forced-colors-safe boundaries.

Move preview keeps before and after values when equal, announces distinct before/after wording to assistive technology, and reports increase/decrease without showing a roster. Copy shows only the reachable count and always shows `권한에 따라 일부 항목이 제외될 수 있습니다`. The manager guidance appears only for supplied `level="admin"`. A supplied `{ copied }` result is rendered only for copy and is never reinterpreted as a moved-item count.

## Strict TDD evidence

- RED: `red-component.json` — 45 tests, 31 passed, 14 failed on the newly specified presentation behavior before production edits.
- GREEN: `green-component.json` — 47/47 passed.
- Regression: `regression-web.json` — 944/944 web tests passed.
- TypeScript: `npm run typecheck --workspace @doculight/web` — exit 0.

### Focus behavior TDD correction

The L2 focus-return implementation was removed completely before its direct component contract was written. With no `executeButton` ref and no `restoreFocusRef` prop in production, the new parameterized move/copy test opened the supplied L2 gate, pressed Escape, and asserted invoking-primary focus plus zero parent cancel/write callbacks.

- Focus RED: `focus-red-component.json` — 21 total, 19 passed, 2 failed. The only failures were the move and copy L2 focus-return cases.
- Minimal implementation: reconnect the invoking primary button through the shared gate's existing `restoreFocusRef`; while the L2 gate is open, leave the same Escape event to the child gate so it cannot also cancel the parent dialog.
- Focus GREEN: `focus-green-component.json` — 21/21 passed without changing the new test.
- Related regression after GREEN: 112/112 passed across relocation dialog, ACL preview, confirmation-oracle, and screen-wiring tests; final browser matrix and full web regression were then rerun.

The initial `pnpm --dir` attempt did not reach tests because it tried to fetch the local `@doculight/editor` package from npm. It is not counted as RED. The recorded RED comes from the repository's npm workspace command and contains the expected assertion failures.

## Browser evidence

`browser.json` and `screenshots/` were produced by `npm run test:browser:relocation66 --workspace @doculight/web`.

- 12 environments: 1280×720, 1440×900, and 1920×1080 × light/dark × 100%/actual 200%.
- Actual 200%: a fresh Playwright-owned persistent Chromium with a disposable profile and extension called `chrome.tabs.setZoom(tabId, 2)`. The setter only mutates zoom; a separate read-only function calls `chrome.tabs.getZoom`. Every 200% path records an independent read of 2 after setting and 1 after reset, including forced colors.
- Forced colors: separately exercised at 100% and actual 200%.
- Measured/asserted: native select identity plus exact `select.value`/selected-option/readout equality, primary/cancel/close/select hover computed-style changes and focus identity, 2px focus outline with 2px offset, initial close focus, Tab/Shift+Tab cycling, Escape cancellation, disabled click/keyboard attempts with zero callbacks, supplied L2 topmost geometry and alert-only Escape/focus return with zero parent cancel/write, text contrast ≥4.5:1 (large title ≥3:1), select boundary/focus contrast ≥3:1, ≥36px select target, 560px maximum width, 24px viewport gutters, action reachability, no horizontal overflow, long Korean wrapping, no roster names, and no fabricated readonly/invalid state.
- Additional supplied-prop fixtures cover equal/increasing/decreasing move counts, copy reachable count/result/fixed notice, empty destination list, and missing preview.

The strengthened independent-review measurements recorded these lower bounds across regular, zoomed, and forced-color runs: title text 10.13:1, help text 5.51:1, select text 7.93:1, primary text 6.90:1, cancel/close text 10.13:1, select boundary 5.38:1, and select focus 6.87:1. The supplied L2 alert measured z-index 800 above the parent dialog's 500; Escape removed only the alert, left parent cancel/write callbacks at zero, and returned focus to the parent `이동` button. Disabled click and synthetic keyboard attempts likewise left the confirm callback at zero.

This is a component bundle rendering the actual two components with fixture props. It is not product App integration or backend round-trip evidence.

## Issue state table

| State | #66 evidence |
| --- | --- |
| Basic | Move/copy titles, source, native select, selected full path, supplied preview/result and applicable notices passed component and browser checks. |
| Hover | Primary/cancel/close and closed native select retain measurable hover distinction without geometry change. Native option-popup hover remains browser-owned. |
| Focus | Initial close focus, 2px + 2px select focus ring, Tab/Shift+Tab order and cyclic containment passed. Parent focus restoration is not exposed by current props. |
| Selected | DOM value, selected native option and full-path readout equality passed. |
| Disabled | No-destination primary action is disabled and cancellation remains reachable. Real pending-state disabling belongs to #79. |
| Readonly | N/A: no readonly editable field exists; informational source/path/preview remain ordinary text. |
| Invalid | N/A: the finite native select has a neutral placeholder and disabled primary action; no fabricated initial error is shown. |
| Loading | Not exposed by existing props. Missing `relocation` says `영향 정보가 전달되지 않았습니다.` and does not claim loading or zero. Tracked by #79 / IR-SHELL-011. |
| Empty | Empty supplied destinations say `제공된 목적지가 없습니다.` and keep cancel reachable. This does not claim an authoritative ready-empty server response. |
| Error | Not exposed by existing props. Destination/preview/mutation errors and retry ownership are tracked by #79 / IR-SHELL-011. |

## Limitations and ownership

No changes were made to App, AppShell, API client, server, shared ConfirmGate, SRS, GitHub, commits, or pushes. Actual query/loading/error/result-name/async lifecycle, live caller-level transport, and parent focus restoration remain owned by #79 / IR-SHELL-011. Native Windows IME candidate UI is a nonblocking untested limitation; the dialog adds no text input, and the harness used no OS input or native UI automation.

An independent reviewer still needs to assess intent alignment, regression risk, and the browser evidence. This report records objective executions only and does not claim independent verification.
