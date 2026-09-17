# Issue #64 independent final review

Date: 2026-09-17

Verdict: **C0 / H0 / M0 / L0 — PASS**

## Review basis

This review independently compared the live Issue #64 requirements, the revised `astra-decision.md`, the staged implementation and tests, and the raw evidence under this directory. The applicable SRS contracts were `FR-SHELL-007`, `IR-SHELL-002`, `IR-SHELL-006`, `IR-SHELL-009`, `CON-ARCH-004`, `SEC-SHELL-001`, `SEC-STORAGE-002`, `SEC-STORAGE-003`, `FR-STORAGE-006`, `FR-CONFIRM-006`, and `CON-CONFIRM-001` for the active `phase-1` target.

The reviewed behavior is the settings Trash panel: truthful query states, workspace/mine/all lenses, row-level restore and permanent delete, permission-hidden purge actions, L2 confirmation, bounded measured virtualization, keyboard and focus continuity, newspaper-theme presentation, and preservation of the existing server authorization and storage behavior. The review did not treat the implementation author's conclusion as evidence; it inspected the staged diff, raw RED/GREEN logs, browser scripts and JSON, screenshots, and product-path result independently.

## Findings and fix rounds

The first implementation review returned **C0 / H3 / M2 / L0**:

1. **H1:** the virtualized list did not yet prove the required keyboard traversal, focused-row retention, removal-focus transfer, and stable anchor behavior.
2. **H2:** the zoom and forced-colors evidence did not yet substantiate true browser 200% or populated-panel accessibility coverage.
3. **H3:** the product run did not yet establish the required multi-role authorization and storage outcomes.
4. **M1:** late asynchronous completions and a shared result surface could overwrite the current lens or another row's outcome.
5. **M2:** the resize evidence did not yet prove stable node identity, relative anchor offset, remeasurement, and the actually activated node across 899/900/901 transitions.

The correction added frozen RED contracts and then the minimum implementation and evidence needed for these cases. Direct inspection confirmed contextual invalidation, per-row results and request guards, cached-row background refresh, bounded virtual keyboard navigation, focused-node pinning, measured anchor preservation, populated forced-colors captures, true zoom evidence, and the expanded three-role product run. The corresponding raw files include `red-focus-context.log`, `red-background-refresh.log`, `red-virtual-keyboard.log`, `red-mounted-zoom.log`, `red-product-roles.log`, and their GREEN/final results. The resize assertion truthfully appears as `existing-resize-anchor.log` because it passed against the then-current implementation; it is not represented as a fabricated RED.

The second independent review returned **C0 / H1 / M0 / L0**. A successful permanent delete initiated from `ConfirmGate` had focus inside the dialog, so the earlier row-button-only focus ownership check did not schedule the required post-removal target. Existing lifecycle coverage exercised direct restore removal but did not catch the L2 success path.

The final correction was test-first. `red-purge-dialog-focus.log` records the frozen L2 purge test failing 1/1 with the expected next node `node-2` and no focused node. The implementation then carried focus ownership through confirmation settlement, selected the next surviving enabled action, then the previous one, then `#trash-heading`, and waited for dialog teardown before the final focus operation. `green-purge-dialog-focus.log` records 10/10 lifecycle tests passing. The Playwright script additionally performs the actual L2 acceptance and successful removal and asserts focus on `trash-1`'s enabled restore action in every matrix environment.

No critical, high, medium, or low finding remains after the two correction rounds.

## Independent reruns and retained evidence

The final reviewer independently reran:

- `issue64-trash-lifecycle.test.tsx` with `screen-wiring.test.tsx`: **2 files, 68/68 tests passed**.
- The complete Trash #64 Playwright harness: **12/12 environments passed**, plus forced colors at 100% and 200%.
- During the earlier product-security review, the real product runner passed with **3 roles, 1 restore, 1 purge, and 5 observed list requests**.

The retained project evidence also records the full web suite at **76 files, 896/896 tests**, the relevant server suite at **4 files, 72/72 tests**, and editor/server/web typechecks passing. These retained results were inspected rather than represented as an additional independent rerun in the final round. `git diff --cached --check` passed, and the staged implementation scope remains limited to the Trash UI, its existing App/AppShell/query handoff, scoped styles, tests, and Issue #64 evidence.

## Browser ownership, true zoom, and process safety

All browser verification uses Chromium launched and owned by Playwright with fresh isolated contexts. The 100% runs use new isolated contexts. Every 200% run uses a disposable persistent profile and a disposable test-only extension that calls `chrome.tabs.setZoom(tabId, 2)` and independently verifies `chrome.tabs.getZoom(tabId) === 2` on the product tab. The matrix records requested viewport, pre/post CSS viewport, DPR, ownership, and screenshots for light and dark themes at 1280×720, 1440×900, and 1920×1080. The representative mounted transition verifies `[1, 2, 1]` and anchor continuity. Device scale factor, CSS zoom, and viewport substitution are not used as 200% evidence.

The harness does not attach to an existing browser, use `connectOverCDP`, reuse a default user profile, inject OS input, or automate native windows. Forced colors use Playwright media emulation. It closes owned contexts and removes only disposable profiles. Its product/fixture server is a child process created by the runner and is stopped through that owned process handle. Review of the staged harness found no process-name-wide `node.exe`, `nodex.exe`, or Chromium termination.

## Product and security conclusions

The product evidence uses one fresh Playwright-owned browser with three isolated contexts: superuser, a manager with different roles in two workspaces, and a user with no workspace. It proves mine/all/workspace filtering without client-side reconstruction of hidden data, loss of access after a manager grant is removed, and denied restore/purge while the item remains intact. No DELETE occurs before L2 acceptance.

Restore evidence preserves bytes, node identity, ACL, and version history and proves collision suffixing without overwriting the existing document. Purge evidence proves the document, versions, ACL, attachment, and later restore paths are unavailable. Mutation success remains separate from query refresh, stale completions cannot repaint a changed owner/auth-generation/workspace/scope context, and row outcomes remain independent.

## Known API limits

The PASS applies to the scope the current API can represent. The API has no authoritative per-row `canRestore` projection and no parent-chain or manager-selected destination contract. Therefore the missing-parent destination branch of `FR-STORAGE-006` is not claimed as implemented by this UI. Restore still relies on server enforcement.

The restore response is 204 and does not return the resolved destination name or path, so the UI does not claim an automatic-suffix destination notice. The API also supplies no retention deadline/countdown or undo contract. Those values and interactions are intentionally absent rather than inferred. Native IME windows, third-party extensions, and native dialogs are outside this Playwright-owned verification; Korean content and web keyboard behavior were exercised through Playwright.

## Final finding count

**C0 / H0 / M0 / L0 — PASS.**
