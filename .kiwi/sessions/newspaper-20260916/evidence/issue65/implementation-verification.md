# Issue 65 implementation and verification

## Scope and requirements

Implemented the Astra-authorized sharing surface for IR-ACL-001/002/003, SEC-ACL-009/015, SEC-PRINCIPAL-002/003, FR-PRINCIPAL-008, FR-CONFIRM-011 through 013, 015 and 018, and SEC-CONFIRM-004 through 007. FR-CONFIRM-014 is only satisfied for an administrator when the post-success fresh list yields exactly one direct row matching node/context generation, principal ID, requested level, and a non-null entry ID. No server route, response, policy, dependency, or SRS file changed.

## TDD chronology

1. Frozen lifecycle tests were run against the original implementation: 7 tests failed (`red-final-tests.log`). They covered query error/loading behavior, exact metrics, search failure/limit, awaited action outcome, L2/L3 confirmation, editor privacy, and stale query/selection.
2. The minimum component implementation made those tests pass. A scoped style contract was then added and failed 1/1 before its CSS existed (`red-scoped-style.log`); the final lifecycle suite passed 8/8 (`green-final-tests.log`).
3. Frozen App/AppShell adapter tests failed 2/2 (`red-app-wiring.log`), including the old void callback outcome. The typed awaited outcome and node-bound query adapter were implemented and passed 2/2 (`green-app-wiring.log`).
4. The final combined targeted regression passed 127/127 (`green-targeted-review.log`). Existing fixtures were updated only where the production contract gained required node kind, grant-warning lookup, and authoritative entry-ID behavior.
5. Independent review found stale selection, entry-bound last-admin warning, and close/reopen pending gaps. Frozen tests reproduced all three failures (`red-review-fixes.log`, 3 failed/8 passed), then passed 12/12 after the minimum fix (`green-review-fixes.log`).
6. The revised authoritative toast contract failed 1/12 before context binding, exact-row matching, and metadata-pending handling (`red-authoritative-toast.log`), then passed in the final lifecycle suite.
7. The metadata-only retry contract failed 1/13 before a retry control existed (`red-metadata-retry.log`). The final flow retries only the fresh GET and never repeats the grant mutation.
8. Level-change/duplicate-preflight and failed automatic revoke retry tests failed 2/15 (`red-final-races.log`) before operation invalidation, preflight pending, and file revoke reset were added; the same suite passed 15/15 (`green-final-races.log`).
9. Editor limitation status and accessible dialog description failed 2/16 (`red-editor-description.log`) before the explicit status and `Dialog.Description` were added; the suite then passed 16/16 (`green-editor-description.log`).

## Verification

- Targeted web: 127/127 passed.
- Full web: 914/914 passed.
- Web typecheck: passed.
- Browser: 12/12 environments passed: 1280×720, 1440×900, and 1920×1080; light/dark; 100%/200%. Each fixture environment exercised loaded/empty/loading/error/retry states, the composition Enter guard, real Home/End/Enter picker selection, topmost Escape, L2, directory L3, post-removal focus containment, overlay presence, computed focus style, editor privacy, and viewport bounds. The 200% environments used fresh disposable persistent profiles and `chrome.tabs.setZoom`; `getZoom()` returned exactly 2. The mounted dialog was transitioned 1→2→1→2. Forced colors ran at 100% and 200% (`browser-run-review.log`, `browser-matrix/`).
- Isolated built product: passed with one fresh Playwright-owned Chromium and three isolated contexts. It opened the real tree context menu and ShareModal, searched the full unique manager name, asserted the selected manager, performed a UI grant, resolved the post-success authoritative entry ID, used the toast to issue the real revoke, awaited the 204 response, and confirmed the direct ACL row was absent afterward. It also observed direct API file/container grants for permission boundaries, manager access, and concealed outsider access (`product-run-review.log`, `product-result.json`).
- Server regression: 1435/1436 passed. The unrelated `SEC-AUTH-011` static-asset assembly check returned 503 for existing `/theme-bootstrap.js`; a focused rerun reproduced 11/12 with the same result. Issue 65 changes do not touch server or that asset route (`server.log`, `server-focused-rerun.log`).

## Known limitations

- The grant POST response supplies no authoritative ACL entry ID. Administrators receive a revoke control only after a fresh GET yields one exact direct match. Editors receive `rows=null`, so the client cannot identify the entry; the UI explicitly reports that limitation and shows no enabled revoke or metadata-retry control. Editor L1 revoke remains an explicit FR-CONFIRM-014 completion blocker pending an API/SRS decision.
- Native OS IME candidate windows and native dialog behavior were not tested. Composition was driven through DOM composition events in Playwright.
- Workspace-admin-only option authoring, actor/granted-by metadata, and dynamic server preview details are unavailable in the existing API and were not invented.
