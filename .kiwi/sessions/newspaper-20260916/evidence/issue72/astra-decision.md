# Issue 72 — binding workspace management/list decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains authoritative. No implementation, tests or verification is claimed.

## Authority and explicitly authorized functional work

Read AGENTS, live #72/#73, SRS index/current mode/target, approved #61/#49/#65 and newspaper operational handoff, WorkspaceList/NewWorkspaceForm, AppShell/App/client assembly, current workspace-list/grant routes, workspace repository/files/create/admin-presence services and tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

**IR-WORKSPACE-001 is planned/stable and explicitly authorizes connection work.** Its approved operational handoff already defines managed/all listing, dedicated rename endpoint, validation and sidecar outcomes. They are required implementation deltas here, not speculative additions merely because current code is a placeholder. FR-PRINCIPAL-006 remains implemented/evolving; DR-WORKSPACE-001/002 and SEC-WORKSPACE-001/002 are verified/stable; administrator authority/last-administrator/confirmation contracts remain in force.

| Acceptance contract | #72 ownership |
| --- | --- |
| IR-WORKSPACE-001 AC-1 | Real server-managed list, stable selected workspace ID, common management-scope selection handoff |
| AC-2 | Real superuser-only all list and persistent server adminless badges; creation entry behavior is completed with #73 |
| AC-3 | Dedicated display-name rename and existing-policy administrator assignment/revoke integration; no workspace inheritance/lifecycle controls |
| AC-6 | Shared rename name validation and visible-duplicate identity handling; #73 reuses it for creation |
| AC-7 | DB-authoritative sidecar sync, pending warning and stale-write protection |
| AC-4/5 | Creation form/combined confirmation/create outcomes are **#73**, not silently implemented by #72 |

No archive, archive restore, delete workspace, storage-path editor, migration, membership registry, instance signup-policy editor, extra category or Phase2 action appears. “관리자 지정” means ACL admin grant to an existing user/group, not group membership or account promotion.

## Exact list scopes and selection ownership

Preserve default GET `/api/workspaces` visible-list behavior for existing callers. Add the already-approved explicit query scopes:

- `scope=managed`: server returns only workspaces where the current requester has management authority, including existing superuser authority. Mere visibility/edit permission is insufficient.
- `scope=all`: server requires superuser and returns actual workspace repository rows with server-derived adminless state. Non-superuser rejection cannot enumerate hidden names.
- Unknown explicit scope is rejected, never silently widened/fallback to another list. Response remains `{id,name,adminless}[]`; do not add inferred creation dates, filesystem paths or counts.

Use distinct query keys for managed/all and identity/authorization context consistent with the existing app. The common management selection is owned once in the existing SettingsModal/AppShell integration by **workspace ID**. Workspace detail and managed workspace selector consume the same ID, and pass it consistently to workspace/ACL-audit/audit-log context. Do not use `visibleList[0]` as managed proof. One managed choice is a readonly label; multiple choices use an accessible selector/list; zero successful choices is a true empty management state.

Changing the selected ID must not imply that all audit endpoints already filter to that workspace. #69 bulk revoke's actual scope remains server-defined all-managed/instance, and current audit-log/other queries may lack a selected-workspace filter. Thread the shared authorized ID as context and state the actual query scope truthfully; any required additional endpoint filtering is separately traced instead of displaying all-managed rows as though filtered to one workspace. This resolves managed-picker authorization inputs where supported without rewriting audit scope policy.

All-list selection may open the same management detail because the superuser has management authority. It must not create a separate detail implementation or a new URL. On first load, select a current authorized ID deterministically from the returned list if no prior selection exists; on refresh preserve a still-present ID even if its name changes. If selected ID disappears/authority is lost, remove its protected detail, show a neutral unavailable notice and use #61's explicit allowed fallback/empty-state handling. No silent switch that submits an old draft against a new workspace.

## Truthful list and detail states

Use a small real query state (`loading`, `ready`, `error` with actual retry) separately for managed list, all list and selected administrator/detail reads. Error outranks stale privileged success; arrays/undefined do not stand for successful empty. Never fill missing metadata by walking ordinary tree names or counting displayed people.

| State | Copy/behavior |
| --- | --- |
| Managed loading/error | `관리 워크스페이스를 불러오는 중입니다.` / `워크스페이스를 불러오지 못했습니다.` + real retry |
| Managed ready-empty | `관리 권한이 있는 워크스페이스가 없습니다.`; no forbidden names or editable detail |
| All loading/error | `전체 워크스페이스를 불러오는 중입니다.` / same safe error+retry |
| All ready-empty | `등록된 워크스페이스가 없습니다.`; #73 creation affordance only when its real callback is connected |
| Detail loading/error | Preserve selected known identity but no fabricated administrator count/list; show its real state and disable mutations awaiting authority |
| Mutation pending | Exact operation Promise state, duplicate guard, no optimistic success or array removal |

Opening both existing categories must render real WorkspaceList content, not title text. Loading/empty/error distinction also applies to the managed selector; a query failure is not “no management.” Persistent `관리자 없음` badge uses **only server `adminless`**, on list and selector labels as required. It is not dismissible and does not appear in the document tree. Never count superuser bypass as a designated workspace administrator or infer badge state from reachable people/visible ACL rows.

## List/detail newspaper geometry

Inherit #61 two-column settings modal/scroll; no nested ordinary dialog/page. Each category title uses18/26px sans600. Lists are full available right-pane width with natural-height rows≥48px,8px vertical/12px horizontal padding and subtle bottom rule. Main workspace name14/22px600, status12/18px; selected row uses selected surface, 2px action-primary side mark and a programmatic selection/current state. Hover uses control surface and focus2px+2px separation. Group/status meaning remains visible text.

Full names wrap, never hover-only ellipsis. Duplicate **visible** names are allowed; display a short stable ID alongside them, lengthened only as needed to disambiguate the currently visible set. Do not query hidden workspaces for duplicate detection or reject duplicate names globally. Selection/mutation/React identity always uses full ID, not abbreviated ID, name or row order.

Management detail stays in the same right pane, with selected workspace heading, display-name form, then administrator section. No back-and-forth ordinary modals for editing. Controls max560px/available width, minimum36px, radius4px, label13/20px600, input14/22px and help12/18px; 20px field/32px section gaps. Any table owns local horizontal overflow; long names/administrator labels and final actions remain reachable at 200%. Do not invent physical-path or createdAt fields on list/detail before an actual response supplies them; a storage-invariance explanation is enough.

Readonly single-workspace selection is selectable text, not a misleading enabled dropdown. Adminless badge uses warning role/text, never whole-row opacity. No fake Create button that does nothing: prepare the #73 handoff/entry location, but do not claim AC-4/5 or create flow until connected.

## Dedicated rename: exact endpoint, validation and outcomes

Implement the already-approved **PATCH `/api/workspaces/:id`** with `{name:string}`. Recheck current management authority including superuser at request time. Use a dedicated workspace application service calling WorkspaceRepository.rename and WorkspaceFiles.writeSidecar; never the node/path rename route. Update `Workspace.name`, not a second displayName field. ID, createdAt, hash directory, node paths, attachments, backup paths and existing URLs stay unchanged.

Shared create/rename validation is already frozen in IR-WORKSPACE-001 AC-6: NFC-normalize, trim ends, require **1–120 Unicode code points**, reject U+0000–U+001F/U+007F. Count code points after normalization/trim, not UTF-16 units/graphemes. Do not apply Windows reserved names, slash/path punctuation bans or file-path length rules. Same visible/hidden workspace name is valid; no duplication probe. Use server-authoritative same validation with client precheck for feedback.

Form: persistent `표시 이름`, existing loaded name, `변경` submit, help `표시 이름을 바꿔도 워크스페이스 ID와 저장 위치는 바뀌지 않습니다.` Initial form has no error. Empty/too-long/control-character input gets connected field-specific error after blur/submit, preserves draft and makes no mutation. No-change after normalization is a no-op, not a manufactured rename. IME commit Enter does not submit.

Use the exact approved success shape:

```ts
type WorkspaceRenameResult = {
  workspace: { id: string; name: string; createdAt: string };
  sidecarSync: 'synced' | 'pending';
};
```

Successful response updates the selected/list name by returned stable ID and canonical name. DB write failure is unsuccessful and does not show the new name as committed; keep draft/error. Missing versus forbidden target uses safe equivalent refusal, not an existence hint. Validation errors identify the known name field; transport/storage errors remain generic with no raw paths/stacks.

DB success plus sidecar failure is **committed rename with `sidecarSync=pending`**, not a failed rename: use persistent `표시 이름은 변경됐지만 재구성 사본 갱신이 대기 중입니다.` Do not roll back the DB, repeat PATCH automatically or promise disk synchronization. Keep that warning for the current settings context; a normal list refetch lacks sync status and cannot falsely clear it. Background reconciliation repairs from latest DB as specified; no new operator repair endpoint/button is introduced. Observing its later completion requires a supported signal, not a timer.

Serialize same-workspace DB/sidecar rename sequence or condition stale sidecar writes on the latest DB value, so an older write cannot leave the sidecar older than the final DB name. Preserve newer requests/results per workspace generation; a late A response cannot overwrite B's newer UI. The approved PATCH body has no revision/ETag: do not invent a conditional-write protocol or claim compare-and-swap. If a fresh read shows the name changed since editing began, retain the draft and require explicit review of the new baseline; re-reading cannot eliminate all cross-user races, which remain acknowledged last-write concurrency under the server's serialized sync rule.

Changing selected workspace invalidates the old form's unexecuted intent and scoped error/confirmation; no name typed for A is submitted as B. Pending callbacks remain bound to their captured ID, and success/error for A must not replace B's detail or force selection back. Re-query the two list scopes/tree labels through existing authorized paths as appropriate; accepted-write success and readback failure are separate, with no second PATCH to fix refresh.

## Administrator list, search and grant/revoke gates

Administrator section represents explicit workspace `admin` ACL entries, not all group members, superuser accounts or ordinary view/edit grants. Reuse existing authorized share-view rows where they genuinely supply workspace-direct admin entries, with their real entry IDs/name/kind. No entry count is substituted for server adminless determination. If this data read is unavailable, show loading/error instead of an empty list or inferred administrator.

Addition uses #65's shared PrincipalPicker with **`workspace:{selectedId}`** scope, current actor management gate, existing two-character/20-result/status rules and exact selected principal ID. This is a fixed admin assignment operation, not a free admin option added to document/directory sharing. Search/query/selection changes invalidate stale grant intent; no create-user/group or invitation feature appears.

Current generic ShareModal/client and `/nodes/:id/share` route accept/coerce only view/edit; sending `admin` today would silently become view. Required narrow correction under AC-3/SEC-WORKSPACE-002: add a typed workspace-administrator grant adapter using the existing grant service, carry requested `admin` faithfully, and have the route/domain verify the target is a workspace and caller may grant admin. Invalid/directory/document admin is rejected, never downgraded. Existing valid document view/edit calls remain unchanged. No parallel ACL store or custom permission calculation.

Administrator grant is **one L2** (FR-CONFIRM-011); document's named-user L1 is not applicable. Fresh warning lookup uses existing server warning codes, including a suspended-subject notice; merge it into that same gate, not a second dialog. Gate identifies full workspace name/ID context and selected user/group, fixed level관리. Accepted grant is reflected by server ACL reread and server adminless refresh; no success before204 and no inferred entry ID.

**Fresh count/impact caveat:** existing `share.reached` counts inheritance-delivered descendants and skips broken branches. Workspace admin authority is an upper gate and still applies below broken inheritance. Do not label that count as the full admin-grant impact or show view/edit broken-branch exclusion wording as an admin limitation. Validate the precise count/coverage contract required by the administrator L2 against governing SRS; if current preview cannot supply it, treat that specific confirmation data as a narrow explicit blocker before execution, not an invented number or silently omitted required impact. No new preview endpoint is implicitly designed here. Context/warning/count data is refreshed at gate opening and before stale acceptance; changes lock prior consent under #48/FR-CONFIRM-004.

Administrator removal uses the real direct ACL entry ID and existing revoke operation with **L2** (workspace container). Ask server warning endpoint whether it is the last designated administrator; don't count displayed names or upper-gate users. If last, show the existing `마지막 관리 권한자` warning in the same gate. **Do not block removal merely because it leaves no designated admin** (FR-PRINCIPAL-005); cancellation makes no request, deliberate acceptance may proceed. This is not the unrelated last-active-superuser account/group invariant.

No self-target ban is invented: removing one's own workspace admin entry may legitimately remove one's access to this management view. After accepted removal refresh managed/all lists, selected detail and existing session/category scope facts as needed; remove now-unauthorized content and follow #61 fallback. A persistent existing parent status can convey accepted operation after a disappearing detail; do not set an unobservable local success just before unmount. Superuser's all list can still show the server adminless badge.

Grant/revoke callbacks return awaited `{ok:true}|{ok:false}` based on actual existing endpoint acceptance; per-workspace operation guards prevent duplicate/conflicting local submissions. Preserve IDs and context through refresh and reject stale target/principal/entry state. Failure keeps useful input/selection and generic error; retry requires fresh L2 data/consent. Accepted mutation plus refresh failure is not a failed mutation or invitation to replay it. Scope-warning or complete impact data missing from current contracts remains an explicit blocker, not a fake successful administrator action.

## Forbidden/unsupported extensions

- Archive/archive restoration are Phase2 and **no button**, even disabled, belongs here under AC-3. No workspace deletion or physical path editing.
- Creation is #73: no hidden direct create endpoint call, simulated create success or premature AC-4/5 completion. Reuse shared name validation and selected-ID/list refresh ownership there.
- No workspace “members” list or default-group policy editor is invented. Administrators are ACL principals; group membership/instance policy stays in its actual owner.
- No group-member expansion, created-date/storage-path/global-count column from data not present in `{id,name,adminless}`. No client duplicate-name exclusion or hidden-workspace enumeration.
- Current audit endpoints' all-managed scopes do not become selected-workspace-filtered merely because shared selection is passed. Missing child query support is separately traced and labeled truthfully.

## Acceptance and independent browser matrix

- [ ] TDD red first for both title-only category entry gaps, visible-versus-managed list, all-list role gate, selected-ID sharing, dedicated rename/persistence/sidecar outcomes and admin grant silently downgraded toview. Use exact SRS AC mapping, not CSS-only tests.
- [ ] Actual settings 워크스페이스 and 전체 워크스페이스 paths render real data. Manager sees only current managed workspaces, not merely visible ones; superuser all scope includes actual repository rows. Preserve default visible GET callers and reject unknown/all-unprivileged scopes. Zero/loading/error distinguishable. Selected ID shared consistently with child context and no fake per-workspace data filtering.
- [ ] Duplicate visible names select correct distinct IDs and are disambiguated without hidden-name queries. Refresh/reorder/rename retains selection byID; revoked/deleted/unavailable selection removes protected detail and uses proper fallback/focus. One choice is readonly label; many choices keyboard selectable; adminless badge is persistent only in lists/selectors, never tree.
- [ ] Rename validation NFC/trim/code-point boundaries, control characters, empty and120/121-code-point values; path punctuation/reserved words and duplicate names are not incorrectly forbidden. Correct field error/draft retention, unknown/forbidden safe refusal, no node-rename request or physical directory move.
- [ ] Actual rename confirms stable ID/createdAt/hash directory/node paths/attachments/URLs/backup paths. DB failure leaves prior committedname; DB success/sidecar failure returns pending and persistent warning with no rollback/retryloop. Reconciliation rewrites latest DB name. Concurrent same-workspace renames and delayed old sidecar/write responses cannot leave final stale metadata. Document no invented ETag/CAS guarantee.
- [ ] Administrator selection/grant via existing service truly stores admin on workspace, neverview; admin on document/directory rejected. Fresh selected-user warning and accurate L2 impact/count context required before execution. Missing current preview coverage is tested as unavailable, not completed by fixture-only data. No success/cancel/duplicate confusion.
- [ ] Removal L2 includes actual target/entry and fresh last-admin warning; cancel no change, confirmed last/self removal permitted by existing policy, not falsely blocked. Managed list/category may disappear after loss; no stale admin content remains. Adminless is server-derived; upper-gate superuser not counted as designated administrator. Correct result/error/refresh separation.
- [ ] 1280×720,1440×900,1920×1080 ×light/dark ×100%/genuine200% =12 environments, plus forced-colors at100%/200%. Both entry paths, long Korean/duplicate names, lists/selector/detail/rename errors/pending sidecar/admin gates. Actual geometry/colors/focus/screenshots; last list/form/action and #61 close remain reachable without modal-width growth.
- [ ] Genuine zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, confirms getZoom===2, records pre/post CSS viewport/DPR. Resize and100→200→100 while selection/draft/L2 remain mounted; stable target/focus and natural wrapping persist. CSS zoom/transform/device-scale/half viewport is not equivalent.
- [ ] Native list/select/form/cmdk keyboard, stable label/context, L2 cancel-first/return and fallback after self-revocation tested by IDs, not row positions. Native Windows Korean IME rename and candidate query commit Enter cannot submit/confirm prematurely; synthetic/CDP supplementary. Theme changes don't remount draft/selection or save.
- [ ] Normal text≥4.5:1, large text≥3:1, active borders/focus≥3:1. Forced-colors uses system surfaces/text/Highlight and real outlines; selected/adminless/error states retain text/marks without color-only cues. No global forced-color-adjust:none, opacity-faded controls or clipped focus.
- [ ] Run relevant list/settings/shared-picker/grant/admin-presence/workspace-sidecar/visibility/rename/auth-scope tests and actual built-product E2E. Independent review checks original requirement and approved operational handoff, exact server/client deltas, red/green and on-disk/API evidence. Do not mark creation/lifecycle/richer audit filtering/unsupported admin-preview data complete.

Required implementation deltas are explicit managed/all listing, shared selection, dedicated validated rename/sidecar service and truthful administrator grant/revoke adapters. Open capability blockers are precise administrator-impact preview where current inherited-count data is insufficient, and selected-context filtering/metadata in downstream panels where not yet supported. Creation and lifecycle operations remain outside #72.
