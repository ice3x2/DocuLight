# Issue #62 TDD chronology

1. The amended Astra contract was translated into final tests for editor parent state, exact HTTP outcomes, per-key locks/concurrency, cache/generation isolation, accessible status/focus, password composition, and product behavior.
2. `App`, `PersonalSettings`, `PasswordChangeForm`, and #62 shell CSS were reset to `HEAD`. `red-editor-final.raw.txt` recorded the genuine implementation-absent RED: 10 failed/1 passed, exit 1.
3. The implementation was rebuilt manually and reached the initial GREEN.
4. Independent review found concurrent-401 overlay and auth-generation gaps. Expanded tests ran RED in `red-reviewer-fixes.raw.txt`; the controller was fixed.
5. `red-cancel-failure.raw.txt` proved a failed query cancellation incorrectly changed accepted 204 to unknown. Cancellation errors were separated from mutation outcome, then GREEN.
6. Browser RED runs exposed pending-select focus transfer/restoration and stale focus intent. A stable per-field status node, change-time focus intent, conditional restore, and no-steal behavior were implemented and checked in real Chromium.
7. `red-auth-alert.raw.txt` proved duplicate 401 alerts. The triggering field now owns one stable auth-ended status describing both disabled selects.
8. `red-stale-retry.raw.txt` proved a retained retry could write under a later cookie. Synchronous user/auth identity guards now run before read/write retry and before every response/cache mutation; same-ID logout/relogin is covered through App.
9. App integration tests were expanded across load error/retry, 204/400/401/unexpected200/403/404/409/413/429/500/transport, delayed duplicate lock, true mixed-key concurrency, lost-response authoritative reread, and no sibling/theme clobber.
10. Product evidence added exact editor reread, eventful and DOM-native credential paths, controlled delayed Enter+click duplicate suppression, and populated-form logout separation.
11. A final review found that a rejected retry retained for key A could send after key B returned 401 within the same parent user/auth generation. `red-sibling-401-retry.raw.txt` recorded 1 failed/16 passed because invoking that retry caused a third request. The retry now requires the controller generation captured when the failure was recorded.
12. The final targeted run is 4 files/67 tests. The final Playwright matrix ran twice consecutively at 12/12 environments and 672/672 checks. Product smoke passed 21/21. Full web passed 74 files/860 tests.

No implementation was restored from the staged blob to justify GREEN. Verification-evidence rows were added earlier in the broader issue/session history; no SRS mutation occurred in this final reviewer-fix cycle. No commit, push, issue close, existing-browser attachment, OS input, or broad process kill occurred.
