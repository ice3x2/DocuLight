# Issue 64 Astra decision — independent review

Reviewer: Sol

Date: 2026-09-17

Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Scope and sources

I independently compared the decision with GitHub issue #64, `AGENTS.md`, `docs/spec/00.index.md`, FR-SHELL-007, IR-SHELL-006, IR-SHELL-009 AC-6, CON-ARCH-004, SEC-SHELL-001, SEC-STORAGE-002/003, FR-STORAGE-006, FR-CONFIRM-006, CON-CONFIRM-001, the approved #49 shared-state and #61 settings-shell boundaries, and the current TrashPanel, AppShell, App, query/client, server route/service, and trash tests. This is a preimplementation decision review. I did not modify or execute product code and do not claim implementation verification.

## Findings

No Critical, High, Medium, or Low findings.

## Contract and scope assessment

The baseline statements are accurate:

- App currently passes `trash.data ?? []`, so TrashPanel cannot distinguish initial loading, failed loading, or successful empty data.
- Restore and purge callbacks are typed as `void`; App catches mutation failures and then refreshes, so the component cannot honestly represent pending, accepted, or failed mutation results.
- The existing virtualizer uses `overscan: model.length` and renders virtual items without total-size/spacer/offset geometry, so it is not a bounded runtime virtual list.
- Purge currently calls the callback directly without the FR-CONFIRM-006 single-item L2 gate.
- The list row supplies `canPurge` but has no authoritative `canRestore`, parent-chain state, retention metadata, descendant counts, or resolved restore destination/name.
- The restore and purge HTTP routes return 204 and carry no detailed result body. The current restore route accepts only a node ID, although the domain service has a separate destination form for the missing-parent case.

The proposed query union and Promise action result are sufficient narrow handoffs for honest supported states. The decision correctly requires the mutation request to determine `{ok:true}` or `{ok:false}` and treats subsequent trash/tree invalidation as a separate query outcome. A successful 204 followed by a failed refetch therefore cannot become a write failure or trigger a second write. A request failure cannot be swallowed and announced as success. Missing callbacks remain unavailable actions.

These App/AppShell adaptations are outside the issue's primary TrashPanel file target, but the decision does not silently absorb a general App or API rewrite. It defines the exact minimal handoff, maps it to existing stable requirements, and requires it to be recorded as an explicit #64 integration scope before implementation. If that handoff is not explicitly accepted in the implementation task, it remains a blocker and the component may not fabricate the states.

The unsupported cases are also stated honestly. The decision does not derive restore eligibility, invent a missing-parent destination, assume a retention period, synthesize collision details from the original path, promise an undo callback, expose hidden counts, or add search, pagination, bulk selection, bulk purge, or L3 behavior. Server authorization and supplied row ordering remain authoritative.

## Virtualization, identity, and focus assessment

The virtual-list design is feasible with the installed TanStack table and virtualizer packages. It requires all of the runtime pieces missing today: bounded overscan, `nodeId` item identity, total scroll geometry, real item offsets, element measurement for wrapped rows, and remeasurement after width, zoom, content, and data changes. Treating 40px as an estimate while allowing long paths to grow avoids the fixed-row clipping defect.

The decision covers the important identity and concurrency failures:

- per-node action state survives array-index changes and one row cannot inherit another row's pending/error state;
- restore and purge cannot overlap on the same node, while distinct nodes may proceed independently;
- stale component, authentication, lens, and request completions cannot move focus or overwrite a new context;
- a changed filter resets list position but preserves the initiating filter's focus;
- same-lens refresh attempts to preserve a surviving visible anchor;
- a removed successful target returns focus only when focus belonged to that operation, using next, previous, then a stable heading/empty fallback;
- the focused virtual row remains mounted during transfer, and boundary Tab behavior scrolls and mounts the next logical action without creating a grid-selection model or shortcut.

The proposed 1,000-row runtime checks, stable key/removal tests, row-height measurements, click-to-node identity checks, live resize without reload, and 100→200→100% mounted-panel checks can disprove spacer, stale measurement, and recycled-action bugs rather than merely asserting imports or CSS classes.

## Restore, purge, permissions, and result behavior

Immediate restore remains unconfirmed as required. The decision does not claim cancellation of a sent request and does not remove a row optimistically. Generic failure text avoids leaking whether a forbidden or stale hidden target exists. A restore success notice avoids promising the original name/path because the 204 response cannot describe collision suffixing or a destination.

Permanent deletion gains exactly one single-item L2 ConfirmGate. Opening and cancelling send no DELETE; acceptance rechecks stable target identity and current supplied `canPurge`, invokes the exact callback once, and still relies on server authorization. Permission-hidden purge actions are absent, while pending-disabled actions are represented separately. No bulk operation or L3 path is introduced.

The decision also preserves the security boundary for combined workspaces: mine/all is only a server request lens, `canPurge` is row-specific, hidden rows and counts are not reconstructed, management loss takes effect on the next server query, and physical `.trash` paths are never exposed.

## Accessibility, appearance, and browser evidence

The layout remains inside #61's right settings pane with its title and close outside the independent scroll regions. Controls retain at least 36px targets, rows retain a 40px minimum while allowing wrapping, logical paths are keyboard-readable without title-only disclosure, the result viewport shrinks and owns local horizontal/vertical overflow, and toolbar/status content remains outside result scrolling. Focus, pending, failure, destructive, and confirmation states have text or outline cues rather than color alone.

The proposed Playwright matrix is concrete and feasible: 1280×720, 1440×900, and 1920×1080; light and dark; 100% and genuine 200%; plus forced colors at 100% and 200%. Genuine zoom is explicitly limited to an isolated persistent Chromium profile with an extension calling `chrome.tabs.setZoom(tabId, 2)`, asserting `getZoom() === 2` and recording CSS viewport/DPR before and after. Repository browser checkers already establish this mechanism. The additional mounted 100→200→100 transition, 899/900/901 resize, long Korean paths, many rows, mixed permissions, computed geometry, focus bounds, and screenshots are appropriate evidence. No new text input is introduced, so new IME behavior is correctly marked inapplicable while native select keyboard behavior remains in scope.

## Completion constraint

This PASS applies only to the Astra decision. Issue #64 may not be reported complete from a TrashPanel fixture or package-import test. Completion requires the explicit query/action handoff, actual product settings path, real mutation and refresh outcomes, bounded measured virtualization, L2 behavior, permission regressions, and the stated Playwright evidence. Missing-parent destination selection, authoritative restore eligibility, retention data, detailed renamed-result feedback, and undo remain unsupported and must not be claimed.

## Inspection commands

```text
gh issue view 64 --json number,title,body,state,url
Get-Content AGENTS.md
Get-Content docs/spec/00.index.md
rg -n -C 5 "FR-SHELL-007|IR-SHELL-006|IR-SHELL-009|CON-ARCH-004|SEC-SHELL-001|SEC-STORAGE-002|SEC-STORAGE-003|FR-STORAGE-006|FR-CONFIRM-006|CON-CONFIRM-001" docs/spec
Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue64/astra-decision.md
Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue61/astra-decision.md
Get-Content packages/web/src/trash/TrashPanel.tsx
Get-Content packages/web/src/api/queries.ts
Get-Content packages/web/src/api/client.ts
rg -n "afterTrashAction|purgeTrash|restoreTrash|trash.data|onTrashPurge|onTrashRestore" packages/web/src/App.tsx packages/web/src/shell/AppShell.tsx
rg -n "restoreFromTrash|purgeFromTrash|router.get\('/trash'|router.post\('/trash|router.delete\('/trash" packages/server/src packages/server/test/app/trash
rg -n "TrashPanel|trash-round-trip|영구 삭제|복구" packages/web/test packages/server/test
rg -n "chrome.tabs.setZoom" packages/web/test
```
