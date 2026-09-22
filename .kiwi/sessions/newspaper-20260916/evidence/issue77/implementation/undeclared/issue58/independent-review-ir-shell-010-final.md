# Issue 58 / IR-SHELL-010 final independent review

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0**

The current worktree resolves all findings from the preceding independent review. This review found no remaining Critical, High, Medium, or Low issue in the reviewed issue 58 and IR-SHELL-010 scope.

## Previously reported findings

The earlier review reported that a removed upload target stored in `lastFocusedNodeId` could bypass a different current `aria-selected` row and incorrectly restore focus to the tree region. The final implementation now resolves the remembered row first and, when that row no longer exists, performs a fresh lookup of the current non-workspace `aria-selected="true"` row before falling back to the tree region. The final order is therefore same node, surviving remembered/current selected row, tree region, then the document-tree tab when the tree region is unavailable.

The permanent regression test reproduces the exact missing branch: another row remains `aria-selected`, the upload target becomes the last focused row, and only the target disappears. The raw RED fails because focus lands on the tree region instead of the selected row. The implementation file timestamp follows that RED. A later test-file timestamp is explained by adding `vi.restoreAllMocks()` cleanup; the target fixture and focus assertion were not weakened.

Earlier review findings concerning the Promise-only result contract, an `undefined` result being treated as unknown, binary retry focus, single focus ownership, failed-GET-only refresh retry, and the missing/permission-removed target fallback remain resolved in the current diff.

## TDD chronology audit

The checked raw evidence reaches the intended assertions:

- IR-SHELL-010 implementation-removed RED: 10 failed, 6 passed.
- Selected-row/tree-region fallback RED: 2 failed, 14 passed.
- Unavailable-tree callback RED: 1 failed, 16 skipped.
- Stale last-focused target RED: 1 failed, 17 skipped; the failure compares the tree region active element with the expected separate selected row.
- Final issue 58 suite: 18 passed.
- Final targeted integration/regression suite: 87 passed.

The stale-focus RED started at 13:19:05. Its evidence file was written at 13:19:07, while the corresponding `DocumentTree.tsx` implementation change was written at 13:19:14. The final targeted GREEN started at 13:20:05. No assertion removal, skip, force-pass, or behavior-test weakening was found.

## Independent execution

Commands were run from the current worktree:

```text
cd packages/web
npm test -- --run test/issue58-file-surfaces.test.tsx test/screen-wiring.test.tsx test/autosave-wiring.test.tsx
npm test -- --run
npm run typecheck

cd .kiwi/sessions/newspaper-20260916/evidence/issue58
node run-product-fixture.mjs
```

Observed results:

- Targeted Vitest: 3 files, 87 tests passed.
- Full web Vitest: 68 files, 751 tests passed.
- TypeScript typecheck: passed.
- Product Playwright fixture: passed.
- `git diff --check`: exit 0, with line-ending warnings only.
- Staged paths: none.

The product fixture verified exact binary bytes, retained target identity, refreshed binary and Markdown surfaces, retained Markdown version history, failed-tree refresh retry without another upload, and server denial for a view-only user. Its refresh measurements were:

- document-only failure: tree GET 1, document GET 2;
- tree and document failure: tree GET 2, document GET 2;
- successful refresh: tree GET 1, document GET 1;
- total accepted new-version requests exercised by the fixture: 5;
- repeated upload POST during refresh retry: 0;
- new L2 confirmation during refresh retry: 0.

The product visual run covered 12 combinations of 1280x720, 1440x900, and 1920x1080; light and dark themes; and 100% and genuine 200% browser zoom. The genuine zoom cases used Playwright-owned isolated persistent Chromium profiles and an extension calling `chrome.tabs.setZoom(tabId, 2)`. The reported product matrix count was 12.

## Browser and process boundaries

All browser verification in this review used newly launched, isolated Playwright Chromium contexts. It did not attach to an existing browser and did not use OS-level input injection, window activation, HWND automation, CSS zoom, half-width viewport substitution, or manual device-pixel-ratio emulation.

The disposable runner started and stopped only the server, Vite, and Chromium processes it owned. No process-name-wide Node termination command was used.

The native operating-system file chooser and native OS IME were not automated. File selection used Playwright's file-input API with Korean and emoji filenames. This limitation does not supply broader native IME evidence and does not affect the verified IR-SHELL-010 network, result-state, refresh, or focus contracts.

## Final scope assessment

The current diff remains within the authorized issue 58 and IR-SHELL-010 upload/result handoff, file-surface, confirmation, refresh, and focus scope. No new server policy, alternate upload route, automatic retry, invented upload percentage, or permission inference was found. The worktree contains unrelated session artifacts, but none were staged by this review.
