# Issue 63 implementation verification

Requirements: SEC-AUTH-006, SEC-AUTH-007, SEC-AUTH-008, SEC-AUTH-009, IR-AUTH-003, FR-CONFIRM-006, IR-SHELL-008, IR-SHELL-006.

## Strict TDD restart

The final test files were frozen first. All affected behavior implementation in `App.tsx`, `queries.ts`, `TokenPanel.tsx`, `AppShell.tsx`, and `shell.css` was then removed by restoring those files directly to HEAD.

- `red-manual-rebuild.log`: 3 files failed; 25 tests failed and 12 passed against HEAD behavior.
- The implementation was then written manually from the frozen tests with new edits. No saved patch, diff, blob, or prior implementation was applied or restored.
- `red-computed-expired-style.log`: the permanent legacy token-panel suite included the new computed expired-style assertion and failed; 1 file failed, 13 tests failed and 10 passed against HEAD behavior.
- `green-manual-rebuild.log`: 3 files passed; 37 tests passed after the manual implementation.
- `red-late-clipboard-focus.log`: after the final tests were added, the pending-leave invalidation lines were removed; 1 file failed with 3 failed and 11 passed tests. The invalidation was then manually rebuilt.
- `green-late-clipboard-focus.log`: the final lifecycle suite passed 14/14, including delayed clipboard success and rejection during category navigation and settings close, and the continue-focus contract.
- The preceding RED proved pending-leave invalidation only; its continue-focus assertion already passed. For a separate strict focus cycle, the final assertion stayed frozen while the `cancelDiscard` focus handoff was removed. `red-continue-focus.log` records the focused failure: 1 failed and 13 skipped, with the plaintext textarea focused instead of the copy/close button. The one-line handoff was then manually rewritten without restoring a patch or blob. `green-continue-focus.log` records 1 passed and 13 skipped.
- `ac2-ac4-tests-before-implementation.log`: the six added AC-2/AC-4 tests all passed against the existing implementation (20/20 lifecycle tests). They are recorded as existing-behavior evidence, not as a fabricated RED and not as justification for a behavior change. They cover reveal/discard Escape and outside interaction, the inline close/Back-to-list destination, logout, different-owner and same-ID generation invalidation during clipboard pending, late issuance after logout, and safe non-persistence observations.
- `ac4-query-cache-before-implementation.log`: the added real-App integration assertion passed against the existing implementation (1 passed, 4 skipped). The issued value was absent from the supplied parent QueryClient cache and live-message surfaces; this is likewise existing-behavior evidence.
- `ac5-form-cancel-before-implementation.log`: the frozen form-Cancel assertion passed against the existing implementation (1 passed, 20 skipped). Cancel unmounted the form and focused the currently rendered `새 액세스 토큰` button, so no behavior implementation changed.
- `green-final-targeted.log`: 3 files passed; 49 tests passed.
- Full web regression: 75 files passed, 883 tests passed (`green-full-web.log`).
- Relevant server regression: 2 files passed, 38 tests passed (`green-server.log`).
- Web typecheck: exit 0 (`green-typecheck.log`).

## Browser evidence

- The new focus assertions were written before the final focus implementation. The focus rules were absent for `red-browser-focus.log`, which failed on the first environment with a computed 0px focus gap. The focus rules were then written manually; `green-browser.log` records the complete passing matrix.
- `npm run test:browser:tokens`: 12/12 fresh Playwright-owned isolated Chromium environments passed, plus forced colors.
- Every environment exercised list, form, reveal, discard, and L2 states; issue, metadata-query, and revoke failure/retry; actual input mutation followed by synthetic composition Enter; and Clipboard API unavailable, synchronous throw, rejected promise, and delayed promise outcomes.
- Every environment used `page.keyboard` for Tab and Shift+Tab traversal, native radio and select keys, readonly selection and keyboard manual copy, manual-copy then explicit-close reconfirmation, Enter on the continue action with focus restored to the copy/close action, delayed clipboard success/rejection followed by discard and category navigation, keyboard revoke, and the L2 action.
- `ac2-ac4-browser-before-implementation.log` records the passing existing behavior in all 12 environments. Playwright physically clicked outside the settings dialog and pressed Escape during both reveal and discard, verified that the settings dialog, confirmation, and value remained, and drove the inline close control as the Back-to-list intent through Continue and explicit discard. Every environment also invalidated a pending clipboard operation through logout/owner absence, a different user, and the same user ID with a new authentication generation; plaintext disappeared immediately and late fulfillment did not repaint it.
- The final `green-browser.log` matrix additionally makes every environment enter the issuance form, activate Cancel, assert focus on the newly rendered `새 액세스 토큰` button, and reopen the form before continuing. `browser-matrix.json` records `formCancelFocusToNew: true` per environment.
- Across the 12 environments, 60 focused controls were measured in list, form, reveal, discard, and L2 states. Minimum outline width was 2px, minimum outline offset was 2px, and minimum outline/background contrast was 3.080. Every measured control had positive bounds fully inside the viewport.
- Computed token-row contrast was measured from rendered foreground/background colors. Light: normal 14.00, expired 5.27. Dark: normal 11.43, expired 7.03. The permanent unit test also computes color differentiation and expired contrast from the rendered cells.
- Each 200% environment used a disposable persistent profile extension and asserted `chrome.tabs.getZoom() === 2`. Actual pre/post viewport and DPR were: 1280x720@1 to 640x360@2, 1440x900@1 to 720x450@2, and 1920x1080@1 to 960x540@2, in both themes.
- Screenshots were captured only after plaintext clearing. The forced-colors screenshot likewise contains no plaintext.

## Product evidence

`npm run test:browser:tokens-product` built server and web and used a disposable real server/database with one fresh Playwright-owned Chromium process, two isolated contexts, and two accounts. These counts were derived from the live browser and context observations and recorded in `product-result.json`.

The product run was not repeated for the AC-5 evidence addition because only unit/browser test files and evidence changed; no product source or product-check path changed after its passing run.

- Observed page requests: 1 issue, 2 revoke attempts, and 4 list requests.
- The first post-issue metadata refresh was failed and recovered by Retry. The first revoke returned HTTP 500, retained its target, and succeeded on retry.
- Every observed successful list response contained zero plaintext/token/secret fields.
- While the real issued value was displayed, the product checker observed exactly one authorized plaintext field and no occurrence in URL, history state, localStorage, sessionStorage, live/status/alert regions, element attributes, enumerable window globals, console messages, or token-list query responses. The checker compares booleans and counts and never prints the value.
- The target PAT authenticated against the real MCP route with HTTP 200 before revoke and HTTP 401 after revoke.
- A different token belonging to the primary user and a token belonging to the second user both remained valid with HTTP 200. The second account's list excluded the target.
- The real Clipboard API held the exact issued value and the DOM no longer contained it after close.
- L2 evidence is limited to paths that actually observed it: the browser matrix drives the revoke AlertDialog and records `data-grade="L2"`, and the product run drives that same confirmation before both real revoke attempts. Plaintext discard confirmation is inline and is never counted as L2.

## Limitations

Native Windows IME, external password managers/extensions, native clipboard or permission dialogs, and native window behavior were not exercised. Per the binding decision, these are nonblocking limitations. Browser unload and OS window closure are outside the authorized leave guard.
