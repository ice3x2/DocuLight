# Issue #62 final verification report

Status: the amended editor-state, presentation, password-change, and logout-separation scope is implemented and verified. Applying editor defaults when a new document opens remains outside #62, per the frozen Astra decision.

## Requirements and scope

The relevant source facts are: `IR-SHELL-004` verified/stable; `DR-SHELL-002` verified/stable; `IR-SHELL-007` verified/stable; `SEC-AUTH-018` implemented/evolving with aggregate ACs still unchecked; `SEC-AUTH-019` verified/evolving. Verification-evidence rows were added earlier in the broader issue/session history. This final reviewer-fix cycle does not promote lifecycle fields.

App owns editor read/write state and attempted values and passes them through AppShell/SettingsModal to PersonalSettings. HTTP 204 alone is saved; 400 is rejected; 401 ends the authentication generation with one field-associated alert describing both disabled selects; unexpected 2xx, 403/404/409/413/429/5xx and transport/lost responses are unknown. Same-key writes lock synchronously, different keys remain concurrent, cache adoption merges one key, stale reads are cancelled without allowing cancellation failure to change an accepted 204, and user/auth/request generations block late results and retained read/write retries. Actual App tests cover load failure/retry, the status matrix, exact retry, delayed duplicate lock, mixed concurrent outcomes, lost-response authoritative reread, cache sibling/theme preservation, and same-ID logout/relogin retained-retry no-send.

## TDD evidence

The final amended tests were frozen, all affected #62 implementation was reset to `HEAD`, and `red-editor-final.raw.txt` recorded 10 failed/1 passed tests. The implementation was rebuilt manually. Later independent findings each received a focused RED before repair: `red-reviewer-fixes.raw.txt` (concurrent 401 and auth generation), `red-cancel-failure.raw.txt` (post-204 cancellation failure), `red-auth-alert.raw.txt` (duplicate auth alerts), `red-stale-retry.raw.txt` (same-ID retained retry), and `red-sibling-401-retry.raw.txt` (key-A retry retained after key B ended authentication in the same parent identity). Browser RED runs exposed and fixed conditional focus transfer/restoration and async fixture sequencing. `green-reviewer-fixes.raw.txt` is the final targeted run: 4 files, 67/67 passed.

## Browser and product evidence

The Playwright checker launches only fresh owned Chromium. Six normal contexts and six disposable persistent profiles cover 1280x720, 1440x900, and 1920x1080 in light/dark. Each 200% profile uses a disposable extension, calls `chrome.tabs.setZoom(tabId, 2)`, and verifies `getZoom() === 2`. Two consecutive final runs, `green-browser-12env.raw.txt` and `green-browser-12env-repeat.raw.txt`, each record 12/12 environments and 672/672 checks. The JSON persists every check row.

Coverage includes editor loading/saving/saved/rejected/unknown/auth-ended, a single auth alert, conditional focus anchor and restoration/no-steal, Arrow/Tab/Shift+Tab native select paths, selected/hover/focus/disabled/invalid/pending/error states, exact 200% geometry and reachability, normal/heading/control/warning/error/saved text contrast, Korean composition commit and synthetic cancel, explicit prevention of composition-ending Enter, DOM value/caret and exact request bytes, and theme rerender preservation of password focus/value.

`green-built-product-ui.raw.txt` records a fresh server/web build, disposable install/SQLite DB, and 21/21 product checks. It verifies the exact one-key editor PATCH, authoritative reload with sibling preservation, editor keyboard paths, eventful rejected credential bytes, DOM-native no-event successful bytes, a controlled delayed real endpoint with rapid keyboard Enter plus click producing one request, login return, and logout from populated password fields without a password request. The changed password remains valid. Existing two-user security evidence covers other-account isolation.

## Regression and boundaries

- Targeted editor/password/App/auth: 4 files, 67/67 passed.
- Full web: 74 files, 860/860 passed; `green-web-full.raw.txt`.
- Web typecheck: passed.
- Browser matrix: two consecutive 12/12, 672/672 runs.
- Built product: 21/21 passed.
- Existing server/API/SQLite: 140/140; two-user security: 43/43.

Native Windows IME candidate UI and actual third-party password-manager UI remain unverified; the accepted evidence uses Playwright synthetic composition and DOM autofill/value assignment. The existing logout request-failure/parent completion behavior (#136), #76 auth-ending mutation/secure-draft handoff, and document-opening default consumption are outside this remediation. Open-editor selection/undo preservation is covered by the existing conflict-rescue product path and is not inferred from the password rerender check.

No SRS mutation occurred in this final reviewer-fix cycle; verification-evidence rows were added earlier in the broader issue/session history. No commit, push, issue close, existing-browser/CDP attachment, OS input injection, or broad Node process kill was performed.
