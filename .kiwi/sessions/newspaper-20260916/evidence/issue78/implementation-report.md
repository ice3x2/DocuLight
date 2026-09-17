+# Issue 78 implementation and verification report

Requirement: IR-ACL-004 (stable), with FR-CONFIRM-014, SEC-ACL-009 and SEC-ACL-015 constraints.

## TDD chronology

Tests were frozen before product changes.

- Server RED: 3 failed, 15 passed across 3 files. The route still returned 204 for represented requests and the receipt projection did not exist. The repository identity test already passed because no repository/schema change was required. Raw: `red-server.txt`.
- Initial web run: 8 failed across 2 files. The five client failures were valid RED. The three UI failures stopped at a wrongly encoded `추가` locator and are retained as invalid chronology evidence in `red-web.txt`; they are not claimed as behavioral RED.
- Corrected UI rebuild RED: after removing all receipt rendering while the corrected tests remained frozen, 5 failed/1 passed for the intended missing receipt behaviors. The implementation was then manually rebuilt, without restoring a patch/blob. Raw: `red-ui-rebuild.txt`.
- Runtime fix RED: failure/retry and refetch preservation failed against the first implementation (`red-runtime-fixes.txt`, 3 failed/3 passed). The initial duplicate-warning case in that file had an invalid grant-warning precondition, so it is not claimed. After fixing the precondition and removing the duplicate lock implementation, `red-duplicate-revoke-lock.txt` failed on the intended enabled button assertion; the lock was manually reimplemented.
- Second-review RED: warning lookup loss and container kind loss failed for the intended reasons in `red-review2-runtime.txt`. Its original file-retry assertion was ambiguous because two alerts were present and is not claimed; after correcting it and removing the kind-preservation implementation, `red-query-error-file-retry.txt` failed on the intended second-DELETE count. The cross-context lock test passed against the generation-bound visible disabled state; the lock was nevertheless changed to token ownership so an old completion cannot clear a newer lock.
- Final-review RED: principal replacement and level change during in-flight grant/revoke both remained labelled `추가 중…`, producing 2 failed/10 passed for the intended stale pending ownership in `red-pending-generation.txt`. The frozen tests passed 12/12 after the minimal generation handoff.
- Targeted GREEN: server 18/18; receipt lifecycle 10/10; receipt plus legacy screen wiring 70/70. Raw: `green-server-final.txt`, `green-review2-runtime-attempt2.txt`, `green-review2-runtime-attempt3.txt`.

## Implemented behavior

- The existing POST and body remain unchanged. A comma-separated, case-insensitive `Prefer: return=representation` token opts into HTTP 200 with exactly `entryId` and `canRevoke`; no or unrelated preference remains 204.
- `entryId` comes from the existing grant/repository result. The new projection reads that row and invokes the existing `canRevoke` policy with current effective permission.
- Duplicate tuples retain their ID, original `grantedBy`, and row count. View/edit tuples remain independent. No schema, endpoint, permission policy, or dependency changed.
- The web adapter requests a representation once and accepts only the exact minimal shape. Legacy 204 and malformed 200 become accepted-without-receipt; HTTP failure remains failure. No path automatically repeats POST.
- A current, revocable receipt enables the existing toast action and exact DELETE. A non-revocable receipt shows the safe policy message without an action. Owner/node/modal operation generation continues to discard stale completions. The administrator fresh-row fallback remains active when no receipt is available.
- Receipt revoke preflight is synchronously latched and visibly disabled. A failed DELETE restores the same receipt action with an error so only an explicit user retry can issue another DELETE. A failed independent share refetch shows its GET retry while retaining the usable receipt action.
- Warning lookup failure also preserves the receipt for an explicit retry. Each preflight owns a unique lock token, so an old context cannot unlock a newer operation. The grant result captures the authoritative target kind; query errors therefore retain container L2 confirmation and let failed file revokes reset for retry.
- Principal selection/invalidation and level changes now supersede the prior operation, release its pending/preparing UI ownership immediately, and clear its gates. Stale mutation completion returns before clearing or repainting state owned by the new generation.

## Product evidence

`product-run-attempt6.txt` is the final passing run against freshly built server/web in two fresh Playwright-owned isolated contexts: the editor in a disposable persistent Chromium and the administrator in a second owned Chromium.

- The same mounted editor share dialog transitioned 100% -> 200% -> 100%; extension `chrome.tabs.getZoom` observed 1, 2, 1.
- Editor GET share returned `rows:null` before and after.
- An editor-owned grant returned 200 with only `entryId,canRevoke`, showed one revoke action, issued one exact DELETE, and the persisted row disappeared.
- A foreign duplicate returned 200/`canRevoke:false`, showed no revoke action, emitted no DELETE, retained the original grantor, and did not change row count.
- The administrator opened the actual roster UI, granted another principal, received the minimal revocable receipt, and completed its exact DELETE.
- Request observation: editor 2 POST and 1 DELETE; administrator 1 POST and 1 DELETE. Every POST carried the representation preference.
- Structured observations: `product-browser-observation.json`, `product-persistence.json`; masked UI screenshot: `product-editor-200.png`.

## Regression results

- Web focused: 4 files, 111/111 tests passed. Web full: 78 files, 933/933 tests passed.
- All workspace typechecks passed.
- Server full: 139 files passed and 1 unrelated existing assembly test failed; 1440/1441 tests passed. `install-assembly.test.ts` expected `/theme-bootstrap.js` to return 200 during install but received 503. A focused rerun reproduced it. No issue 78 file touches install routing or that asset. Raw: `full-server.txt`, `server-install-rerun.txt`.
- Product attempt 1 failed only because the checker selected two status roles while search was pending; the assertion was narrowed to the toast containing the selected principal. Attempt 2 passed the editor flow; attempt 3 added and passed the administrator flow.

## Limitations

Native OS IME, browser extension UI, password-manager UI, and native dialogs were not exercised. The browser evidence uses Playwright DOM input and a dedicated zoom extension only. Legacy/malformed server compatibility is covered in automated client tests, not a separately deployed old-server product.

## Independent review history

An independent review previously returned C0/H0/M0/L0 and independently reran 49/49 tests, then a later final inspection found one Medium stale-pending ownership gap. That M1 is addressed by `red-pending-generation.txt`, the 12/12 focused GREEN, the 111/111 regression, the 933/933 full web run, typecheck, and product attempt 6. Per the task instruction, no additional independent re-review was requested. The reviewer also confirmed the install asset failure is outside the issue 78 diff.
