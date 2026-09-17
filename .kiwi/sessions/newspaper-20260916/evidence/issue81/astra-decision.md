# Issue 81 — group membership integration and projection decision

Decision owner: Astra. Date: 2026-09-18. Binding design only, not implementation/test evidence or an SRS amendment. Only this issue's decision artifact is authored.

## Authority and scope

Live #81 has no comments. **IR-PRINCIPAL-003** is planned/stable, phase-1/sdd; MCP identity is `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`. Read AGENTS.md/index, primary ACs, FR-PRINCIPAL-001, DR-PRINCIPAL-002, CON-PRINCIPAL-002/006, IR-SHELL-002/006, SEC-PRINCIPAL-002/003, SEC-AUTH-004/016 and #68's binding decision/final presentation review.

The existing #68 table, wrapping member list, system badge, local overflow/focus geometry and permanently disabled ordinary deletion remain intact. #81 owns authoritative group-query state, shared picker user-only configuration, membership results and B1 system/effective-member projection. #82 alone owns executable group deletion/L3/B2; #81 must remain deployable without it.

Existing facts: groupRoster returns `{id,name,system,members}` where members comes only from persisted group_member rows. Default access is derived at permission evaluation, so that list can be empty while active users effectively belong to default. Client `system:boolean` cannot distinguish default from superuser. addGroupMember currently accepts user kind and inserts directly; duplicate membership can hit the SQLite uniqueness exception. App swallows POST errors and refreshes. PrincipalPicker is shared, combined-cap-20, server-order, scoped, and has no user-only/disabled-member prop.

## Exact additive server projection

Extend existing superuser-only GET `/roster/groups`; do not create a second roster or use `/principals` as one. Paths are relative to existing API base. Retain id/name/system/members and add this typed authoritative data per row:

```ts
type GroupMembershipProjection = {
  systemType: 'none' | 'default' | 'superuser';
  membership: { mode: 'automatic' | 'managed'; canAdd: boolean };
  effectiveMembers: Array<{ id: string; name: string; status: 'active' }>;
  effectiveMembersComplete: true;
};
```

`members` retains complete **direct persisted** user membership for managed ordinary/superuser groups, with the existing four roster status values and repository order. `effectiveMembers` contains their active users, and for default contains every active user from the server user repository whether or not a direct row exists. No pending/suspended/rejected user contributes effective access. Deduplicate by stable ID, not name; same-name users remain distinct. The effective list is uncapped/unpaginated like the existing privileged roster and computed on the server from current source repositories. It is not assembled from the capped picker or a separate browser user roster.

For default use `systemType='default'`, `mode='automatic'`, `canAdd=false`; display `effectiveMembers`, never incomplete persisted rows as total membership. For superuser use systemType superuser, mode managed, canAdd true for authorized actor; display direct members, with existing state semantics remaining server-owned. Ordinary groups use none/managed/canAdd true. system remains true for both system types. Server uses canonical system IDs; browser must not compare magic IDs/names. Names that happen to equal 'default' or 'superuser' do not confer subtype.

`effectiveMembersComplete:true` asserts complete effective membership at the response snapshot, not future freshness or an atomic membership lease. Missing/unknown/conflicting projection is a nonactionable contract error; do not infer canAdd from system=false, members.length or name. No incomplete count, pagination or approximate total is introduced. If implementation cannot produce complete projection, keep add unavailable and fail the relevant acceptance evidence rather than silently set completeness true.

Authorization precedes projection: unauthenticated 401, authenticated non-superuser 404; no privileged body for a workspace manager. Extend existing service/route/client types only; no database schema or denormalized cached counts. Default automatic membership is not a stored-row operation: shared capability resolution must be used by member POST too, rejecting default manual-add with the existing generic 400 failure shape, so an advertised nonaddable group cannot be manually populated via this route. This enforces the declared automatic-membership behavior, not a blanket system-group immutability rule. Superuser membership stays managed; system immutability prohibits delete/rename, not adding a user or ACL revocation.

## Membership API and safe server boundary

Keep POST `/roster/groups/:groupId/members` JSON `{userId}` → 204. No nested groups, invitation/name-to-ID creation, batch payload or new membership endpoint. Existing authorization and audit recording remain mandatory. Validate known group and user kind through ordinary branches before insertion; a known duplicate uses an explicit membership precheck returning the existing generic 400, with no duplicate audit event. Do not use uniqueness exceptions as normal flow, change the API to guessed success, or manufacture a returned member. Current synchronous SQLite path must keep check+insert in its established execution/transaction boundary; verify duplicate/concurrent attempts against the real repository.

Client excludes rejected users through the shared search contract and revalidates selection before dispatch; group-kind, stale, rejected and known-member candidates send zero POST. Do not claim this freezes a selected account's status between search and write. Do not invent a new account-state policy for direct POST beyond current server/domain rules; if a status race is accepted by the existing service, refresh reports the actual result. Unknown server failures/races stay generic. Last-active-superuser protections on removal/status transitions remain unchanged and tested; this issue adds no member-removal or account-status path.

## Shared picker configuration and ownership

Add only narrow backward-compatible PrincipalPicker options, conceptually `selectionKind?:'user'` and a read-only set of disabled member IDs/reason, plus pending/disabled state if needed. Existing callers without those options preserve identical behavior. The group screen passes `scope=group:{capturedId}` and user-only mode; it never reimplements fetch/search/input/results.

Keep existing GET `/principals` scope/query, minimum trimmed length 2, combined maximum 20 and server order. In the shared picker first respect the server's combined cap (and existing defensive slice), **then** expose user rows in user-only mode; do not refill/paginate/top-up after filtering or add a caller-controlled limit. Exclude rejected even in a malformed test response. Preserve active/대기 and suspended/비활성 search labels; administrative roster 정지/거절 labels must not leak into search. Current members stay visible as disabled candidate rows with `이미 멤버입니다.`; skip them in keyboard selection and reject synthetic stale onSelect dispatch too. Disabled membership set uses complete direct members for managed groups plus any supplied effective-member IDs; default has no picker.

Scope/query/selection changes synchronously invalidate selected candidate and request generation. A group-switch same-name result cannot post the prior ID. Late request success/error cannot replace a current list. Composing Enter (isComposing/229) selects nothing and never submits an outer form. Uncomposed user selection is the existing deliberate add action; no extra invented confirmation grade. If a retained explicit add button is used, it must consume the same current selected ID once, not duplicate onPick dispatch.

## Query/action state, outcomes and focus

Group roster uses explicit idle/loading/ready/error bound to auth principal/generation and settings owner. Only ready current data can establish empty or actionable rows. On roster error hide stale actionable rows and provide GET-only retry. On auth/role loss remove privileged rows/categories from DOM/accessibility tree, clear owner-specific caches and invalidate all search/action generations. Mode or unrelated query data cannot substitute for this role.

For a deliberate selection capture `(principal,authGeneration,categoryGeneration,groupId,groupQueryGeneration,pickerQueryGeneration,selectionGeneration,userId)`. Recheck current ready row, authoritative canAdd and membership IDs, then synchronously acquire a **per-group** guard before awaiting POST. Same-group click/Enter/onPick bursts send one write; separate ordinary groups may proceed independently. While one group is pending its picker/add path is disabled, but readable members and other groups remain usable. A read refresh starting for another group must not turn the first accepted write into a failed one.

Await actual 204; no optimistic member list insertion. Accepted write announces `멤버를 추가했습니다.` for the current same-owner row and starts group-roster GET refresh. Refresh error retains that success with `그룹 목록을 새로 불러오지 못했습니다.` and GET retry, never POST retry. Refusal: `멤버를 추가하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.`; uncertain transport: `처리 결과를 확인하지 못했습니다. 목록을 새로 불러오십시오.`. Preserve safe current selection/query where still valid, but require current roster/selection revalidation before another explicit attempt. Do not interpret a void resolved callback as success.

Late completions may invalidate their original-owner caches but never repaint another group, clear another picker's query, create an optimistic row or focus after category/auth change. On accepted add keep focus in the same picker if it still owns focus; if its selection becomes disabled/removed by fresh membership, return to that group's labelled search input. If user moved elsewhere, do not move focus. Read retry status never takes focus automatically. Guards cover stale closures in addition to disabled buttons.

## UI and state matrix

Preserve #68 right-pane table: 이름/멤버/멤버 추가/삭제; long names wrap; member names are readable lists, not removable chips. Default explanation: `활성 사용자는 자동으로 이 그룹에 속합니다.` and no picker. Managed system explanation retains `시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다.` without falsely claiming all membership is immutable. Default zero active members says `현재 활성 멤버가 없습니다.` only with current complete projection. Managed zero direct members says `멤버가 없습니다.` only after current complete roster. Projection failure uses `멤버 정보를 확인하지 못했습니다.` rather than zero.

| State | Requirement |
| --- | --- |
| default / selected | Current authoritative subtype/list/capability; picker candidate selection uses ID, never row-selection/bulk state. |
| hover / focus | Existing hover without layout movement, 2px + 2px ring; named overflow wrapper keyboard stop only while overflowing. |
| disabled / readonly | Automatic membership, unavailable/incomplete projection, same-group pending and known duplicate candidates; member metadata selectable and no fake editable readonly chips. |
| invalid | Below-threshold is neutral; group/rejected/stale candidates blocked with no POST; no invented validation rules. |
| loading | Group query, shared search and per-group member POST distinguished. |
| empty | Current successful empty roster, complete empty member set and filtered zero search results distinguished. |
| error | Roster/search/membership/post-success-refresh errors and corresponding GET-only retry ownership distinguished. |

Keep 18/26 caption, 13/20 header, 14/22 body, 12/18 help, ≥40px rows, ≥36px controls/radius 4px, existing shared semantic palette. No new metadata columns, local roster sorting/filter/pagination or page/nested ordinary modal. At 200% the last picker/control and rightmost delete explanation remain reachable without widening the settings modal. Forced-colors uses real system-color borders/outlines; no global forced-color-adjust:none.

## Strict TDD and browser evidence

REQ-tagged assertion RED precedes every behavior edit; minimum GREEN without weakening tests. Test-after means remove premature implementation and restart. sdd stays in place; intentional later tdd mode additionally requires SDS before tests and test-first commit. Separate verifier evaluates original source contracts/diff/evidence.

Server RED: default with no persisted rows and active/pending/suspended/rejected users, subtype independent of name, complete effective membership and managed direct membership preserved, denied projection callers, default manual-add refusal, group-as-member refusal, duplicate no exception/no extra audit, ordinary/superuser add success and existing last-active-superuser invariants. Web RED: independent authoritative query phases; user-only cap-before-filter and unchanged existing picker callers; same-name IDs/known-member disabled; rejected/group/stale zero POST; concurrent groups/same-group bursts; role loss/out-of-order search/write; accepted write plus failed refresh; conditional focus. No test may mistake existing-user callback dispatch for persistence.

Run shared picker/GroupRoster/settings/category/screen-wiring tests, principal-search/search-scope/roster/principal/auth-guard server regressions, full web and server suites and both typechecks using existing npm workspace scripts. Product evidence starts authenticated real App against disposable server/database fixtures and observes persisted membership/audit, including default effective list and actual authorization denial. Label any delay/error interception separately.

12 environments: 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200%, plus forced-colors 100/200. In each exercise superuser, ordinary user, non-superuser workspace manager through real settings categories. Fresh Playwright-owned isolated Chromium persistent context/disposable profile/test extension only. Set `chrome.tabs.setZoom(tabId,2)`, independently read getZoom===2; reset setZoom(1), independently read getZoom===1. Record viewport/DPR, computed styles/geometry/contrast, screenshots, stable group/user IDs and request counts. On same mount resize and zoom 100→200→100 keep exact query/selection/focus without member write; test first/last result, many members, long Korean names and horizontal-end explanation. Normal/large text contrast ≥4.5/3, active boundary/focus ≥3.

No existing/default profile/browser, CDP attachment/connectOverCDP, OS/native input/windows. Synthetic composition/DOM alone; native Windows IME candidate UI is **nonblocking untested**. Cleanup closes owned handles; forced termination needs owned PID/parent relationship and never broad node.exe/nodex.exe/Chromium name kills.

## Closure and exclusions

#81 can independently close #68's B1/query/user-only/member-add/result/focus integration boundary after IR-PRINCIPAL-003 evidence and independent review. It cannot close B2/deletion (#82) or all of FR-PRINCIPAL-001; #68's presentation did not depend on implementing either follow-up. #81 has no dependency on #82 projection. Group creation/rename, member removal/undo, nested groups, invitations/bulk actions, arbitrary user status and atomic membership revision remain outside this scope. This design alone closes/promotes nothing.
