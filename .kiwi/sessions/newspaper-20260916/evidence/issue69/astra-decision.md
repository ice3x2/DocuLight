# Issue 69 — binding ACL audit view decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains authoritative. No implementation, tests or verification is claimed.

## Authority and scope correction

Read AGENTS, live #69, SRS index/current mode/target, approved #61/#65 and newspaper/shared-state/overlay decisions, prior permission-screen audit sections, AclAuditPanel/BulkRevokePanel/SimulationPanel/InheritanceAuditPanel, current App/query/client wiring and server revocation/simulation/inheritance services/routes/tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

**The live issue owns three audit views**, not another sharing editor: 권한 회수, 유효 권한 시뮬레이션, 상속 끊김. Direct ACL add/change/individual revoke stays in #65's shared ShareModal. Do not add those forms/actions here or make diagnostic inherited rows editable.

FR-ACL-003/004/005 and FR-PRINCIPAL-004 are verified/stable; FR-CONFIRM-020 implemented/evolving, FR-CONFIRM-021 verified/stable, FR-CONFIRM-022 and FR-PRINCIPAL-011 implemented/stable. Preserve IR-SHELL-002 category visibility, IR-ACL-001's distinct metrics, server-managed scope, shared PrincipalPicker and FR-CONFIRM-004 fresh-count gates. Prior verified status does not substitute for this slice's actual product evidence.

Primary scope is the four named panels plus scoped styles/tests. Necessary narrow existing-query/callback adapters in App/AppShell/client are specified explicitly below. No new ACL policy, public roster, grant API, server atomic-batch promise, admin-role exception, offboarding implementation, extra tab or dependency is authorized.

Critical baseline defect: App fetches only `subjects[0]` for preview but executes every selected subject. **Execution must be blocked until a complete current plan covers exactly the execution subject set.** Styling the first subject's count while deleting all subjects is unacceptable.

## State and plan contracts

Use real state from existing queries; absent props are not empty/success:

```ts
type AuditQuery<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; onRetry: () => void };
type ManagedSearchScope =
  | { state: 'loading' }
  | { state: 'ready'; workspaceId: string }
  | { state: 'empty' }
  | { state: 'error'; onRetry: () => void };
type SubjectPlan = { subject: PrincipalRow; response: RevocationBody };
type BulkPlan = { subjects: readonly SubjectPlan[] };
type SubjectOutcome =
  | { subjectId: string; state: 'completed'; removed: RevocationBody }
  | { subjectId: string; state: 'unconfirmed' }
  | { subjectId: string; state: 'not-run' };
type BulkOutcome = { outcomes: readonly SubjectOutcome[] };
type RestoreOutcome = { ok: true } | { ok: false };
```

Query data/request generation is bound to authenticated context, managed scope and selected subject IDs. Error takes precedence over stale privileged results. Idle means no selection, loading is an actual request, ready-empty requires success, and retry is an actual existing refetch. Missing workspaceId must not mean “no management permission” when the workspace query is still loading/failed.

**Managed-scope proof is a blocker where unavailable.** Current App picks the first visible workspace from `/workspaces`; visibility is not proof of management. Do not silently use that ID as `workspace:` search authorization, choose an arbitrary fallback, or locally broaden categories. A supplied scope must be proved managed by an existing authoritative contract; absent proof disables search/execution with truthful unavailable/loading/error state. A new managed-workspace projection/selection API belongs to a separately agreed integration scope. A confirmed empty managed set can show `관리 권한이 있는 워크스페이스가 없습니다.`; do not derive it from missing data. Server still authorizes all diagnostic reads and mutations.

Complete bulk planning can reuse the existing GET `/principals/:id/revocation` for **each** selected principal, retaining the selected principal association. No new server endpoint is necessary. All successful responses must belong to the same current request context/scope and exact distinct selected IDs; a missing/failed subject is not zero entries and must block execution. Derive total from the union of returned ACL `entryId`s, preserve per-subject mapping, and reject inconsistent duplicate ownership/data rather than double count it. The execution order is the frozen visible selection order, independent of request completion order.

Existing mutation POST returns the actual removed RevocationBody. Preserve that result instead of swallowing it; 204 inheritance restore supplies only success/failure. Query refresh failure remains distinct from mutation outcome. These narrow adapter changes need an explicit #69 handoff, not a generic admin-state refactor.

## Common audit layout and scope semantics

Remain inside #61's right settings pane; no new page or nested ordinary dialog. Keep exactly one horizontal Radix Tabs set in existing order: `권한 회수`, `유효 권한 시뮬레이션`, `상속 끊김`; initial tab remains revoke. No fourth direct-grant/activity tab. Native arrow/Home/End/Tab interaction and selected/tabpanel relationships stay intact. Tabs may wrap labels or scroll their own strip at narrow widths, with focused tab reveal; do not hide a tab at 200%.

Section heading 18/26px sans600, body14/22px, labels13/20px600, help/status12/18px. Controls≥36px, radius4px, 20px field/24px section gaps. Tables use app-surface headers, document rows, subtle rules and min40px natural heights, 8px vertical/12px horizontal cells. Names/paths wrap fully; the local table/result viewport owns any horizontal overflow without widening the modal. #61 title/close remain reachable outside settings-body scrolling.

These are manager-authorized diagnostic surfaces. Render exactly server-returned managed-scope data, including relevant nodes that the manager's ordinary direct ACL alone would not reveal; do **not** re-filter diagnostics through the ordinary document tree and hide the very failure being investigated. Conversely, no out-of-managed-scope or hard-hidden/reserved/trash node may be invented/restored from client caches. Non-managers get no names/paths/counts/partial avatars or disabled diagnostic list.

## Bulk subject revocation

Use #65's shared scoped PrincipalPicker for user/group selection, preserving two-character minimum, max20 candidates, neutral candidate statuses and system-group inclusion. Selection is multi-principal, unique by ID. Display name/kind plus a local `선택에서 제거` button for each selected principal; this only edits the plan. Add the narrow existing selection-state callback if needed; no node-row selection or independent per-entry revoke action is introduced.

Changing selected IDs, managed context or current query invalidates the old plan/confirmation immediately. A complete preview covers every selected principal, including successfully queried zero-entry principals; never silently drop them. Each principal may expand/collapse its own result group with the same mandatory columns: 워크스페이스, 경로, 레벨, 부여자, 부여 시각. A workspace ACL's null path is `워크스페이스 전체`; null grantor is `시스템`. Render supplied values, not principal/ancestor names fetched through a new disclosure path. Use normal permission labels 보기/편집/관리. Do not infer effective denial solely from the existence/removal of these ACL rows.

Scope copy follows server response only: `이 회수는 전 인스턴스에 적용됩니다.` or `이 회수는 당신이 관리하는 워크스페이스에만 적용됩니다.` It is not restricted to the one workspace used to authorize the picker. No remaining-outside-scope count, denominator or hidden total. Inconsistent response scopes block the mixed plan until refreshed.

Every selected system group retains its separate supported warning that removed ACL entries are not recreated by later signup/activation. System groups are not excluded merely because deletion/rename is prohibited elsewhere. However `PrincipalRow.system` does not identify superuser-group subtype or a user's superuser membership. FR-PRINCIPAL-011's specific “ACL revoke cannot remove superuser bypass” notice requires an authoritative subtype/capability signal; do not guess by display name/hardcoded client ID or infer it from ACL rows. This missing signal is an explicit completion gap, not permission to claim that all access is removed. Offboarding navigation/data belongs to its own issue and is not invented here.

### One fresh L3, exact subject-set identity

- Execute becomes available only for a complete current plan with at least one selected principal and **total ACL entries >0**. All-zero is blocked, not downgraded. Some-zero selections remain included and are judged by the total.
- Opening L3 re-fetches every selected principal's preview. Show `선택 주체 N개 · 항목 M건`, no denominator, the exact selected names/kinds and server scope. Typing token is the fresh total **ACL-entry count**, not principal/group names or a fixed phrase. One gate for the whole selection, never one gate per principal.
- Re-preview **again immediately before accepting the L3 submission**. The principal-ID set/order, scope, entry-ID set and displayed total must still match the confirmed generation. A changed plan updates the preview and locks/invalidates old typing/consent; cancel/reopen with fresh baseline is the existing safe reset path. Failed re-preview cannot execute a subset or treat it as zero.
- Snapshot the exact subject IDs/order represented in the confirmed plan. Execution must use only those IDs, not live mutable selection state, `subjects[0]`, selected table rows or a later search result. Selection changes invalidate the gate. UI generation checks do not create server transaction atomicity; the endpoints have no expected-revision token.
- Cancellation/incorrect typing/zero or incomplete plan causes no POST. Do not add group deletion, account suspension, PAT revocation or membership mutation as a side effect; these operations remove ACL entries only.

### Deterministic execution and partial outcomes

Use the existing one-principal POSTs sequentially in frozen selection order. Record each returned removed RevocationBody. On the first request failure/unconfirmed result, **stop before sending the remaining subjects**, mark that subject unconfirmed and the remainder not-run. Keep already completed revocations; do not roll them back by regranting. This is deterministic client sequencing of existing endpoints, not an atomic multi-subject server operation.

Report actual removed rows/count from responses per subject and aggregate only confirmed removed entries. A successful request that returns fewer/different rows than preview is not proof that all confirmed access effects occurred; show actual outcome and re-query remaining ACL state. Do not print a blanket “all removed” or “cannot access anything” message. Remaining group/upper-gate access is possible. Unknown transport outcomes remain unconfirmed; automatic retry could repeat an operation and is not allowed.

Keep the panel/selected subjects and a non-secret per-subject result status mounted: completed, result-unconfirmed, not-run. An explicit retry returns to a new complete preview and one new L3; it is not a blind replay and must not silently omit selected zero-entry subjects. Users can deliberately change selection before retry. Other tabs/queries cannot overwrite another subject's pending/status/focus. While executing, prevent conflicting selection/execution and do not present dismissal as canceling already-sent writes; no new abort endpoint.

The server recomputes eligible rows on each POST, so permissions/ACLs may still change between the last preview and a particular call. Record this non-atomic limit and test races; do not promise an exact server snapshot guarantee or implement a new batch API under styling. Refresh after outcomes must not turn a completed mutation into failed execution or retry it.

## Effective-permission simulation

One selected existing subject, using the scoped shared picker. Idle says `시뮬레이션할 주체를 선택하세요.`; loading/error/success-empty are distinct and retry targets the current subject. Validate `SimulationBody.subjectId` against selected ID before showing rows. Changed/cleared selection removes old subject's results immediately; late responses cannot paint a new subject label. Preserve the selected principal's supplied name/kind as context, not a new account lookup.

Rows retain 워크스페이스, 경로, 레벨, 출처. `level=null` explicitly reads `볼 수 없음`; keep the diagnostic row rather than dropping it. Source values are `직접 부여`, `상속`, or neutral `—` for absent source. These are the supplied source categories, not an available ancestor path or complete ACL explanation; do not invent one. Current server calculation is authoritative, not client principal-group inference or cached permission snapshots.

No direct grant/edit/revoke control is added to simulation; #65 owns individual sharing. Existing specification's richer node→roster mode, source ancestor detail, query timestamp, links to share/offboarding or delayed requery timer are not current callback/data contracts. A basic explicit refresh can call existing query refetch when provided; do not label response receipt time as exact server calculation time or introduce polling. Missing navigation/projection is separately traced rather than a fake link or local permission computation.

## Broken-inheritance audit and restoration blocker

Loading/query error must not return null or `상속이 끊긴 노드가 없습니다.`; only successful zero rows gets that empty text. Rows show supplied workspace/path and **`ACL 접근자 N명`**, never reachable/combined metric. At zero, preserve the exact useful notice: `권한으로 접근할 수 있는 사람이 없습니다. 지금은 워크스페이스 관리자와 슈퍼유저만 볼 수 있습니다.` Do not say nobody can see it. No client filtering by requester’s ordinary ACL or imagined hierarchy.

`상속으로 되돌리기` enables receiving parent inheritance again while keeping direct ACL entries; it is **not** `부모 권한 가져오기`, which copies entries. The current direct one-click restore must be replaced by its existing **L2 widening gate**, not L3. Object context must include the supplied workspace/path, direct entries remain intact, and directory restoration requires fresh applicable-descendant count/shared inheritance and broken-descendant notices. Do not infer node type from trailing slash or treat missing type as file.

**Current restoration-impact contract is incomplete:** BrokenInheritanceRow has no kind/direct-entry/parent-after-restore preview. Existing share read can supply some current node-kind/direct/reached metadata but does not prove the incoming parent ACL after restoration. Until a complete supported confirmation context/impact is explicitly supplied, keep restoration execution unavailable with `상속 변경의 영향을 확인할 수 없습니다.` and an honest retry only where it can actually load data. Do not call the restore POST behind an under-specified confirmation. This is an explicit restoration completion blocker, not permission to invent parent names/counts or a new backend preview.

When that handoff is separately satisfied, use exactly one #48 L2 with fresh counts/notices and no typing token; cancel changes nothing. Await typed `{ok:true|false}` from the existing restore endpoint, keep context on failure, refresh on accepted success and separate any query-refresh failure. Preserve direct ACLs and same node ID in real server regression. No bulk restore, independent grant change or other inheritance mode is added.

## Focus, theme and verification matrix

Selected subjects and rows use stable IDs. Tab transitions keep settings shell mounted. Search focus is not stolen by preview loading/results; L3 opens with cancel/explanation focus. Cancel returns to its initiating action, retry returns to its relevant subject/status, and removal of a focused selected subject moves to the next/previous selected subject or picker. Partial results do not focus the wrong subject because earlier rows disappeared. Restored/removed row focus follows a surviving logical row or heading only when the removed control owned focus; otherwise leave the user's current tab/input alone.

Use #48 risk ownership/layers and #61 modal/body scroll, never nested ordinary dialogs. Long Korean paths/subject names/context wrap; command result lists and wide tables scroll locally. Light/dark semantic roles, text labels for selected/direct/inherited/error/partial states, 2px focus ring plus2px separation. Forced-colors uses system colors and real borders/outlines, no global opt-out or shadow-only focus. No opacity-faded actionable content.

- [ ] TDD red first for first-subject-only preview versus all-subject execution, absent-as-zero states, missing manager proof, stale selection/plan and unconfirmed results; test typed adapters, not only prepared fixture props.
- [ ] Actual #61 권한 감사 category has exactly the three audit views, no extra direct ACL editor. Manager/superuser scope is authorized; nonmanager rejected. A visible-but-unmanaged first workspace does not become search scope. Verified-empty management differs from pending/error; missing management projection remains blocked.
- [ ] Select multiple users/groups including zero-entry subjects and supported system groups. Every selected ID is fetched and associated; all-zero blocks, mixed-zero retains all selected subjects, total unique entry count is correct and scope is server-supplied. No first-only counts, hidden denominator or node multiselect.
- [ ] L3 open and immediately-before-submit both re-preview the full subject set. Change entry IDs with equal count, change count/scope/subject selection, fail one preview, and race out-of-order replies: old consent never executes. Typing is exact fresh total; wrong/old token and cancel issue no POST. One gate covers N subjects.
- [ ] Actual bulk execution uses the frozen subject order/IDs. Inject a failure at first/middle/last subject: completed results retained, failing result unconfirmed and remaining not-run, no silent continuation/all-success or regrant rollback. Partial response rows/count are reported honestly per subject. Explicit retry requires fresh complete plan and L3. Verify ACL removal while account states/PATs/group memberships remain untouched.
- [ ] System-group selection remains possible, separate generic notices per selected system group; no claim that revoking superuser ACL disables upper-gate access. Specific subtype/bypass warning without authoritative metadata is an explicit gap. No automatic offboarding or invented link/capability.
- [ ] Actual simulation selection→server result validates subjectId, includes authorized managed nodes the chosen subject cannot see, distinguishes direct/inherited/none and preserves hard-hidden scope boundaries. Query failure/empty/current refresh are honest, stale prior-subject results never appear. No unsupported ancestor path, roster expansion or inline editing.
- [ ] Broken-inheritance exact metric/zero notice/query states; no restoration POST until real complete L2 impact is supplied. Once supported, fresh object/kind/direct/parent context and directory count/notices are tested; success preserves direct entries and reenables inheritance, cancel/failure preserves state. Component-only invented impact fixtures cannot close the product blocker.
- [ ] 1280×720,1440×900,1920×1080 × light/dark ×100%/genuine200% =12 environments, plus forced-colors active at100%/200%. All three tabs, many long rows/subjects, per-subject system notices, query errors, zero/partial states and L3. Capture actual geometry/colors/focus/screenshots and last-row/action reachability within #61.
- [ ] Genuine zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, asserts getZoom===2 and records pre/post CSS viewport/DPR. Resize and100→200→100 without reload while selected plan/search/confirmation/result is mounted; context/counts/focus stay correct. CSS zoom/transform/deviceScaleFactor/half viewport is not equivalent.
- [ ] Native keyboard cmdk/tab controls, add/remove selection, L3 typed count and confirmation cancel/return are tested by actual IDs/context, not row indices. Korean IME commit Enter cannot pick/revoke/restore prematurely; native Windows evidence is distinguished from synthetic/CDP. No global shortcut bypasses consent.
- [ ] Normal text≥4.5:1, large text≥3:1, active boundary/focus≥3:1 on actual light/dark surfaces; forced-color partial/direct/inherited and focus remain readable without color alone. No hidden name/path in tooltips/aria/stale DOM.
- [ ] Run acl-audit/bulk-revoke-confirm/shared-picker/overlay tests and actual server revocation/simulation/inheritance/authorization/audit regressions plus built-product flows. Independent review checks original issue/SRS, bounded adapters, all-subject identity, deterministic failure artifacts and actual browser evidence. Missing managed-scope proof, system subtype and restoration-impact data remain explicit blockers, not passed capabilities.

Open completion limits: authoritative managed search scope, system subtype/bypass warnings and complete restoration impact where absent. The first-only bulk preview defect must be fixed before any multi-subject execution. Richer shared-editor/navigation/offboarding metadata and atomic server batch/revision semantics are separately scoped, not invented under #69.
