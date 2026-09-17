# Issue 64 — binding trash list, restore and permanent-delete decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation direction; `docs/spec/` remains authoritative. No implementation, executed tests or verification is claimed.

## Authority and actual baseline

Read AGENTS, live #64, SRS index/current mode/target, approved #49 states and #61 settings layout, newspaper guide/forms, prior settings §2.4, TrashPanel, query/client/App adapters, trash-view/routes, architecture tests and real trash-round-trip browser test. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

FR-SHELL-007, SEC-SHELL-001, SEC-STORAGE-002/003 and FR-STORAGE-006 are verified/stable. IR-SHELL-002 is verified/evolving and AC-4 owns trash-category visibility. CON-CONFIRM-001 is verified/stable; FR-CONFIRM-006 is implemented/stable. CON-ARCH-004 requires the existing TanStack table/virtualizer. Design delta is the trash portion of IR-SHELL-009 AC-6 and common IR-SHELL-006 state/contrast/list contracts; #61 modal dimensions/scroll/focus remain authoritative. Existing verified metadata does not establish evidence for a newly connected UI path, particularly missing-parent restore.

Observed gaps: permanent delete currently invokes the callback without L2; both mutation callbacks are void and App swallows errors; default `rows=[]` conceals query phase. The virtualizer uses `overscan=model.length` and renders rows without virtual offsets, so package imports do not prove runtime virtualization. These gaps require test-first correction rather than cosmetic PASS claims.

Primary scope is TrashPanel and scoped styles/tests. The necessary **narrow integration additions are explicitly authorized for #64**: adapt existing App trash query/restore/purge handlers and their AppShell prop forwarding to the state/outcome contracts below. No additional permission question is required for these connections. No other App/cache/auth rewrite or server/API change is authorized. Preserve existing endpoint permissions and mutation behavior.

## Binding browser and encoding instructions

All browser verification must use **fresh Playwright-owned isolated Chromium**. Launch it through Playwright with a disposable context/profile; do not use an existing/default browser, attach with `connectOverCDP`, or reuse a user's profile. No OS/native input or window control: no `SendInput`, `AppActivate`, HWND automation, native key injection, native permission-dialog operation or external password-manager interaction. Playwright locator/keyboard actions, DOM inspection/events, API fixtures and browser media emulation are the allowed interaction surface.

True 200% is obtained only in Playwright `chromium.launchPersistentContext` with a disposable user-data directory and disposable test-only extension: `chrome.tabs.setZoom(tabId,2)` followed by an independent `chrome.tabs.getZoom` assertion of 2 for the actual product tab. Record 100%/200% CSS viewport, DPR and screenshots. Device scale factor, CSS zoom/transform or a halved viewport does not substitute. The extension is a harness asset, not a product dependency or installation into an existing browser. Use Playwright forced-colors emulation rather than changing Windows settings.

Close the Playwright-owned context after the run. Before forced cleanup, identify the runner-created PID and parent/child ownership. Kill only owned test processes if needed; never terminate `node.exe`, `nodex.exe` or Chromium by process name, and never terminate an unrelated browser/server. If ownership is unknown, do not terminate it.

This file and implementation sources must be read/written as UTF-8. In PowerShell use explicit UTF-8 decoding rather than a locale-default `Get-Content`. The exact Korean strings below are the implementation vocabulary; preserve Hangul, spaces and the Unicode ellipsis `…`. Do not copy a mojibake terminal rendering into code, and do not substitute question marks or romanized labels. These are presentation decisions under the SRS cited above, not a new requirement authority.

| Purpose | Exact UTF-8 text |
| --- | --- |
| Category / heading | `휴지통` |
| Filter label / all-workspaces option | `워크스페이스 필터` / `전 워크스페이스` |
| Scope actions | `전체 보기` / `본인분만 보기` |
| Current scope labels, if shown | `현재 범위: 전체` / `현재 범위: 본인분` |
| Table columns, in order | `경로`, `워크스페이스`, `삭제자`, `삭제 시각`, `조작` |
| Row actions | `복구` / `영구 삭제` |
| Query loading | `휴지통을 불러오는 중입니다.` |
| Successful empty query | `표시할 휴지통 항목이 없습니다.` |
| Query failure / retry | `휴지통을 불러오지 못했습니다.` / `다시 불러오기` |
| Restore pending / success | `복구 중…` / `항목을 복구했습니다.` |
| Restore failure | `항목을 복구하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.` |
| Permanent-delete title / consequence | `선택한 항목을 영구 삭제합니다` / `이 항목은 복구할 수 없습니다.` |
| L2 cancel / affirmative action | `취소` / `영구 삭제` |
| Permanent-delete pending / success | `영구 삭제 중…` / `항목을 영구 삭제했습니다.` |
| Permanent-delete failure | `항목을 영구 삭제하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.` |
| Stale target | `항목 상태가 변경되었습니다. 목록을 다시 불러오십시오.` |

Accessible action names combine the supplied logical path with `복구` or `영구 삭제`; the visible short label remains as above. Never append physical storage paths or hidden metadata.

## Exact supported state handoffs

Use the current `useTrash` query and current endpoints, with no new request family:

```ts
type TrashQueryState =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; onRetry: () => void };
type TrashActionResult = { ok: true } | { ok: false };
// Existing callbacks, widened only to expose their existing request result:
onRestore?: (nodeId: string) => Promise<TrashActionResult>;
onPurge?: (nodeId: string) => Promise<TrashActionResult>;
```

App forwards real query state plus current-lens rows through AppShell. Error takes precedence over cached successful rows; first load/new-lens fetch is not successful empty. `onRetry` refetches that actual query. A current-lens background refetch may use loading presentation; it must not put old workspace/scope data under the new filter label. No polling, new cache key, fetch-on-every-render or category-query abstraction is introduced.

The action adapter returns `{ok:true}` only after existing restore POST or purge DELETE succeeds (currently 204). All HTTP/network mutation failures return `{ok:false}` or reject into the same generic component failure handler; never catch and report success. Preserve existing tree/trash invalidation on success, but keep its query-refresh outcome **separate** from mutation outcome. A failed refresh must not convert an accepted mutation to `{ok:false}` or trigger mutation retry. Return mutation success and expose any later list error through TrashQueryState. No path/name/permission diagnosis is synthesized from 403/404, and raw error payloads are not passed for UI display.

This shape does not require endpoint changes and supplies honest local pending/result states. Missing callback means the corresponding action is unavailable, not simulated success. Local state tracks action kind and node ID with a synchronous one-request guard. A mutation in flight blocks both actions for that node; distinct rows may operate independently, with independent results and no claimed batch transaction. #64 adds no selection checkboxes, bulk restore/delete or L3 bulk-delete path; Phase 1 bulk purge is explicitly prohibited.

## Boundaries that remain unsupported

- Rows supply `canPurge`, but no authoritative `canRestore` or parent-chain state. Do not derive restore eligibility from deleter, visibility, workspace role or canPurge. Preserve server restore enforcement and existing restore affordance; pre-disabled eligibility UI needs a separately specified projection.
- Missing-parent restore requires manager-selected destination under FR-STORAGE-006, but the current web callback/route takes only node ID. Do not invent a destination tree, root fallback or API request field. Full AC-5 UI completion remains a separate integration blocker.
- Restore responds 204 without resolved name/path. Do not claim an automatic-suffix notification or new destination identity from guessed names. Verify existing server collision behavior separately; truthful detailed result notice needs its own supported response contract.
- No retention-policy value/countdown, remaining days, descendant totals, restored/hidden counts or search query is supplied. Do not assume 30 days when policy is configurable, synthesize subtree counts, expose hidden-item hints or add the old wireframe's unconnected text search. `deletedBy` is supplied and may be displayed as-is without a principal lookup.
- Restore's existing immediate path is preserved; do not add confirmation or fabricate an undo callback/complete L1 toast contract when no such handoff exists. A separate undo-contract gap cannot be solved by guessing a target.

These exclusions do not waive regression: observe and report unmet actual product outcomes, while separately proving the scoped design and existing server behavior.

## Layout, filters and rows

Stay inside #61's `휴지통` right pane; no new page/dialog for the list. Heading 18/26px sans 600. A fixed-within-panel toolbar above the results contains the existing native `워크스페이스 필터` (including `전 워크스페이스`) and the existing mine/all toggle. Controls min 36px, 4px radius, label 13/20px, text 14/22px; gap 12px. They wrap vertically on a narrow right pane without changing available choices or hiding names. A long selected workspace name has a wrapping textual readout if native select truncates it.

Keep lens semantics and supplied workspace list: preserve `scope` when workspace changes and preserve workspace when scope changes. The toggle exists only when supplied `canWidenScope` is true. Its button remains `전체 보기` / `본인분만 보기`; show current scope in a nearby label or aria-pressed state so action text is not mistaken for current state. `all` asks for a broader list, never grants access: server still includes other people's items only in workspaces the caller manages. No client filtering/reconstruction of hidden data and no all-workspaces hidden-count hint.

The result viewport is a bounded shrinkable child (`min-width:0; min-height:0`) that receives remaining panel height, capped at 480px rather than a mandatory overflowing 480px. Toolbar and query/result status stay outside result scroll. On very short heights #61's right scroll remains available to all controls. The table viewport owns horizontal overflow and a sticky header if needed; it must not widen the settings modal or overlay the fixed settings close.

Use the existing TanStack table with columns `경로`, `워크스페이스`, `삭제자`, `삭제 시각`, `조작`. `삭제자` uses already supplied `deletedBy` only; do not resolve other hidden account data. Preserve server row ordering and stable node IDs. Dates remain complete server-derived values via semantic time markup, not a guessed retention countdown. Original paths are user-visible logical paths; never show physical `.trash/...` storage paths.

Header uses app surface/primary text 13/20px 600; rows document surface, min 40px, 8px vertical/12px horizontal padding and subtle rules. Path/name/workspace/actor text is 14/22px (secondary metadata may be 12/18px); full logical paths wrap naturally with `overflow-wrap:anywhere`, not ellipsis-only hover tooltips. Long paths increase measured row height. Avoid fixed-row clipping or hiding tail names. Action labels visually remain compact `복구` and `영구 삭제`, with full supplied path in accessible names; actions wrap with 8px gap and ≥36px targets.

Restore is secondary; permanent delete is destructive. `canPurge=false` means the permanent-delete button is **absent**, never disabled or a locked icon. Pending-disabled controls are different from permission-hidden actions. Hover uses control surface; focused action/row context has a visible focus ring, not an invented row-selected state. There is no multiselect model. The one pending L2 target may have selected surface/side mark solely to identify its confirmation target.

## Measured virtualization and navigation

Retain `@tanstack/react-table` and `@tanstack/react-virtual`. Replace all-row overscan with a bounded window (initial overscan 8), stable `nodeId` item keys and measured row heights. `estimateSize` is an estimate, not a CSS height. Render real scroll geometry with supported table-compatible spacers/offsets and total size; changing only overscan without offsets is insufficient. Maintain table header/cell semantics and expose logical row indices/count only for the currently authorized supplied list. No hidden rows are counted.

Re-measure when container width, browser zoom, wrapping content or row data changes, not only on reload. Before/after resize, preserve the visible anchor node and relative position where possible. A filter/scope change resets result position to its start; preserve focus on the initiating filter. A same-lens refresh anchors a surviving visible row instead of jumping unnecessarily. Inserting/removing an item must not reuse another node's action state because its array index changed.

Native action Tab order and ordinary scroll remain; do not add a grid-selection keyboard model or global shortcuts. Keyboard focus must not be destroyed when its row moves outside the rendered viewport. Keep the focused row mounted until focus transfers, with bounded additional rendering; ensure Tab crossing the virtual boundary scrolls/mounts the next logical row/action rather than trapping/skipping it. Scroll into view only for keyboard navigation, not every data update. First/middle/last rows and both actions are reachable at 200%. If a local boundary handler is needed, it tracks node/action identity and never changes selection or executes an operation.

After a confirmed successful mutation and the updated list removes that row, move focus to the next surviving row's restore action at that position, otherwise previous row, otherwise the results heading/empty state. Do this only if focus belonged to the removed operation/dialog; do not steal focus from a filter/another row/category. Ensure the replacement row is rendered and measured before focusing it. Query refresh/removal alone is not proof that this user's mutation succeeded.

## Restore and single-item permanent delete

Restore keeps the current immediate POST path with no new confirmation. While the real Promise is pending, show `복구 중…` for that row and disable its competing purge. Success gives a concise mounted panel status `항목을 복구했습니다.`; do not promise the old exact path when suffix/destination metadata is absent. Supplied refreshed rows/tree remain authority. Failure keeps the item, shows generic `항목을 복구하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.`, and allows deliberate retry of that same node ID. No auto-retry, forced root placement or permission explanation is guessed.

Permanent delete **must gain the already-required single-item L2 gate**; its current direct invocation is a defect. Use #48 ConfirmGate/AlertDialog, title `선택한 항목을 영구 삭제합니다`, visible exact logical path/workspace and `이 항목은 복구할 수 없습니다.` No descendant count, typing token, second confirmation or bulk action. No destructive callback occurs on opening. Cancel-first focus, Escape cancels, outside click cannot accept/dismiss. Cancel returns to the invoking row action when still present, otherwise a stable list heading/fallback.

Capture node ID/visible target metadata; on acceptance recheck the current supplied row's canPurge and identity so a locally removed/replaced/permission-hidden row is not treated as an authorized new target. Server remains final authority. If the current row is no longer actionable, do not invoke mutation; show a neutral stale-target notice. Do not infer a hidden target's existence from error type. Filter changes behind the modal do not silently change its target.

Affirmative acceptance calls the exact typed callback once and awaits its Promise. Pending blocks duplicate actions for that row and shows `영구 삭제 중…`. Accepted success is `항목을 영구 삭제했습니다.` and refreshed server rows remove it; failure is `항목을 영구 삭제하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.` with item/target preserved. A deliberate retry passes L2 again; no mutation retry is triggered by failed list refresh. Successful operations followed by query errors are announced as operation success plus a separate honest refresh error, not rolled back or repeated.

## Exact query and result states

| Authoritative state | Presentation |
| --- | --- |
| loading | Shared `휴지통을 불러오는 중입니다.` and busy results region; no empty-success text or old-lens metadata |
| ready with zero rows | `표시할 휴지통 항목이 없습니다.`; no reason based on hidden items, and preserve current filters |
| ready with rows | Measured virtual list; no invented totals beyond visible supplied data |
| error | `휴지통을 불러오지 못했습니다.` and actual `다시 불러오기`; do not keep cached rows masquerading as current success |
| restore/purge pending | Per-node actual Promise state and duplicate guard; other nodes' state remains independent |
| mutation failure | Safe action-specific generic error, retained item/target and deliberate retry path |
| mutation success / refresh pending or error | Honest mutation completion; refresh handled solely by query phase, never another write |

No temporary local row deletion on click. One result must not erase another row's pending/error state or claim a set of concurrent operations all succeeded. State/results are keyed to the current component/auth/query context; unmounted/obsolete completions cannot move focus or overwrite a different lens's status. Mutations already sent are not cancellable by switching filters; do not label navigation as server abort.

## Theme, forced colors and verification

Use approved light/dark semantic roles, #61 modal/portal inheritance and #48 layering. No new palette or body opacity. Focus uses 2px outline plus 2px separation with reserved extent inside scrolling areas. In forced colors allow system Canvas/CanvasText/ButtonText/Highlight and real outlines/borders; do not globally disable forced-color adjustment or rely on colored fills/shadows for destructive/selected state. Use Playwright `page.emulateMedia({forcedColors:'active'})` and measure rendered controls; do not manipulate Windows contrast settings. Buttons keep text labels and destructive confirmation remains explicit. Readable expired/disabled metadata must not be guessed because no such trash expiry state is provided.

- [ ] TDD: reproduce direct purge without L2, swallowed mutation failure/query-as-empty and all-row overscan before changes. Preserve old permission/roundtrip assertions; add runtime measurements rather than merely retaining package imports.
- [ ] Fresh Playwright-owned isolated Chromium product path: actual settings gear→trash flow with a regular user, mixed-workspace manager and superuser. Verify no-workspace category hiding, actual mine/all/workspace lens requests, other-user items/counts absent where unauthorized, and canPurge interpreted per row. Losing management permission affects next server query; no hidden hints or disabled purge placeholders. Never attach to an existing browser/CDP session or use OS input/window automation.
- [ ] Actual nested-path delete→trash→restore preserves original bytes, node ID, ACL and version history and updates tree/list. Reject insufficient restore permission; collision creates a suffix without overwriting. Missing-parent/destination UI and detailed rename notice are explicitly unsupported handoffs, not tested as complete from server unit tests alone.
- [ ] Actual purge L2 opens without DELETE; cancel/Escape sends none; confirm sends one exact target DELETE. Forbidden/stale target fails with item intact and generic UI. Success removes file/sidecar/index/version resources under existing service contract and cannot restore. No bulk action, multiselect, L3 or automatic retry.
- [ ] Adapter matrix: delayed, successful, failed restore/purge and query refresh. Failed mutation never claims success; accepted mutation plus failed refresh never retries write or reports write failure. Refresh retry uses existing query refetch. Cross-row concurrency remains independent; same-node restore+purge/double click cannot overlap. Capture actual endpoint calls and persisted outcomes.
- [ ] Large fixture (at least 1,000 authorized rows) proves bounded rendered DOM, correct total scroll size, and first/middle/last reachability. Mixed short/very long Korean paths wrap with measured heights. Stable node/action identity survives sorting-neutral data changes/removal. Keyboard Tab traverses virtual boundaries without losing focused row or skipping actions.
- [ ] Runtime resize **without reload** across representative widths and #61's 899/900/901 CSS breakpoint, then real zoom changes while scrolled mid-list: row measurements update, visible anchor stays sensible, no overlapping/gapped/clipped rows or incorrect click target. Compare clicked action's node ID with the visually intended row after each change. First/middle/last target geometry and final action remain correct.
- [ ] 1280×720, 1440×900, 1920×1080 × light/dark × 100%/genuine 200% = 12 environments, plus forced-colors active at 100%/200%. Inspect table/filter/empty/error/pending/L2, long paths and mixed permissions with actual screenshots/computed geometry/styles. Both settings columns/title/close stay accessible; list/table scroll locally.
- [ ] Genuine zoom uses a **Playwright-launched persistent isolated Chromium** with disposable profile/extension, calls `chrome.tabs.setZoom(tabId,2)`, independently asserts `getZoom===2` and records before/after CSS viewport/DPR. Test both starting at 200% and transitioning 100→200→100% in the same mounted, scrolled panel, asserting 1 again after reset. No OS zoom shortcuts, existing browser/CDP attach, CSS zoom/transform/deviceScaleFactor or half-sized viewport substitution.
- [ ] Normal text ≥4.5:1, large text ≥3:1, active boundaries/focus ≥3:1 on actual light/dark surfaces. Forced-color controls, selection context and focus remain visible without relying on red. No clipping at virtual scroll boundaries or L2 overlay.
- [ ] L2 cancel/failure/success focus returns to appropriate mounted row or stable fallback without stealing from other interactions; filters retain focus while rows change. Use Playwright locators/keyboard for native DOM select/button interactions. #64 introduces no editable text field and no text-entry form, so new IME-entry coverage is N/A; long Korean paths/names still require actual DOM text equality, wrapping and reachability checks. If an already-existing editable control is exercised in regression, use Playwright-dispatched synthetic composition/input events and label that evidence accurately. Native Windows IME/candidate windows, external password managers and OS dialogs are untested non-blocking limitations under the user override, not mandatory verification work.
- [ ] Run relevant trash panel/architecture/settings/overlay tests, server trash/permission/version-purge tests and a built-product path. Reuse the assertions of `trash-round-trip-check.mjs` only through a fresh Playwright-owned Chromium launch; if its launcher violates this decision, adapt the test harness first rather than executing a prohibited path. Independently review original issue/SRS, exact narrow adapter diff, red/green and actual resized/zoomed virtualization evidence. Test cleanup records owned process identity and never uses broad process-name termination.

## Implementation handoff and closure boundary

Sol implements the approved design; a separate Sol reviewer verifies it. This decision changes no product file, test, SRS status or checked AC. Work only in `packages/web/src/trash/TrashPanel.tsx`, its scoped style/tests, and the trash-specific App/AppShell adapter/prop sites. The current `QUERY_KEYS.trash(scope,workspaceId)` and restore/purge API contracts already express the supported request lenses/actions: preserve them. Harness-only fixtures/disposable extension assets may be added for the authorized browser evidence; no new product dependency.

Execute in this order: (1) establish red for missing single-item L2, swallowed mutation failure, query failure misrepresented as empty and unbounded runtime row rendering; (2) pass real query phase and Promise outcomes through existing handlers; (3) apply the exact Korean labels/shared states and measured, keyboard-reachable virtualization; (4) run real restore/purge/permission paths in fresh Playwright Chromium, including actual `getZoom===2`, forced colors, long paths and mutation-success/refetch-failure separation; (5) obtain independent review. Component-only fixtures, import presence or a process exit without product assertions cannot close #64.

No scope approval is still needed for those narrow frontend connections. Existing absent response fields and missing-parent destination selection are **not silently waived or implemented by guessing**: record their unmet requirement IDs and actual route limitations separately. A full `FR-STORAGE-006` AC-5 UI completion claim remains blocked until its destination handoff is explicitly scoped and implemented; this decision neither claims it complete nor changes that requirement. Normal-path restore, role scope, single-item purge, states and virtualization must all pass for the supported #64 design to be considered implemented. Do not hide a failed required product outcome under an unrelated native-OS verification limitation.

Remaining product-contract limits are authoritative restore eligibility, missing-parent destination selection, retention metadata and exact renamed-result/undo information absent from current client/route contracts. The authorized query/action adapter additions need implementation and independent evidence; absent projections/operations must not be claimed complete under #64. Native OS IME, external password managers and native window/dialog verification are non-blocking untested limitations. No browser-safety exception or broad process termination is authorized.
