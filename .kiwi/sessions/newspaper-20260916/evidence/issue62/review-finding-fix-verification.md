# Issue #62 staged-review finding verification

Date: 2026-09-17 (Asia/Seoul)

## Browser contract and strict RED/GREEN

The final Playwright contract covers native select ArrowDown, Tab and Shift+Tab; loading, hover, selected, disabled, invalid, pending, saved, rejected, unknown, and shared auth-ended states; conditional focus transfer/restoration; unrelated-focus preservation; theme rerender password value/focus preservation; Korean composition event order, committed DOM value, caret, composition-ending Enter suppression, and exact callback bytes; geometry, contrast, scrolling, and final action reachability.

The checker launches only fresh owned Chromium. Six normal contexts and six disposable persistent profiles cover the three required viewports in light and dark. Each 200% profile uses a disposable extension to call `chrome.tabs.setZoom(tabId, 2)` and confirms `getZoom() === 2`. The final checker SHA-256 is `70F9F673C0072DA6007DB5E847ABE997B225825B5C52749A3EE1C6646AA5893B`; the fixture SHA-256 is `A46112F5DC896526DEE4189ABDFCA98EBFEF7CE25FEF27083C59C6B4633892D8`.

The expanded contract was frozen before the affected #62 presentation and behavior implementation was reset to `HEAD`. `red-editor-final.raw.txt` records 10 failed/1 passed. Browser RED also recorded geometry, state, focus, keyboard, and actual-200% failures. The implementation was then rebuilt manually. Focus, cancellation, duplicate-alert, stale-retry, and auth-generation findings each received a focused failing test before their minimal repair. Two consecutive final browser runs each passed 12/12 environments and 672/672 checks.

## Built-product UI and product evidence

`green-built-product-ui.raw.txt` records a fresh server/web build, disposable installed product and SQLite database, and a fresh Playwright-owned Chromium instance. It passes 21/21 checks: exact editor PATCH and authoritative reload, sibling preservation, keyboard traversal, eventful rejected credential bytes, DOM-native no-event accepted credential bytes, a delayed password endpoint with rapid keyboard Enter plus click producing one request, login return, and logout from populated password fields without a password request. The changed password remains valid.

Existing unchanged artifacts provide 140/140 server/API/DB/auth checks and 43/43 compiled two-user isolation checks.

## Regression and limits

- Targeted editor/password/App/auth: 4 files, 67/67 passed.
- Full web regression: 74 files, 860/860 passed.
- Web typecheck: passed.
- Browser matrix: two consecutive runs, each 12/12 environments and 672/672 checks.
- Built-product UI smoke: 21/21 passed.

The browser evidence uses observable synthetic composition and DOM-native autofill behavior. It does not claim native Windows IME candidate UI or a third-party password-manager UI. The existing editor conflict-rescue product path remains the evidence for open-editor selection/undo preservation; this remediation did not freshly rerun that separate path. SEC-AUTH-018 remains `implemented/evolving`, and its broader lifecycle is not promoted by this work.

No SRS mutation occurred in this final reviewer-fix cycle; verification-evidence rows were added earlier in the broader issue/session history. No commit, push, issue close, browser attachment, OS input injection, or broad process kill was performed.
