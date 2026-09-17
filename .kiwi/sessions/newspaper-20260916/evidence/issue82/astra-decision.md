# Issue 82 — exact group-deletion impact and L3 decision

Decision owner: Astra. Date: 2026-09-18. Binding design handoff only. No implementation, test execution, SRS mutation, commit, push or issue closure is performed or implied.

## Authority, current gap and boundary

**IR-PRINCIPAL-004** is planned/stable, active phase-1/sdd. Live #82 has no comments. MCP identity was `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`. Read AGENTS.md/index, this requirement, FR-PRINCIPAL-002, CON-PRINCIPAL-002, FR-CONFIRM-006/004/001, IR-SHELL-006/008 and #68's binding presentation decision/final independent review.

Existing GroupRoster correctly leaves ordinary deletion disabled and system deletion absent under #68. App's old remove callback swallows failure. Existing server DELETE removes the ordinary group with database ON DELETE CASCADE for all its acl_entry/group_member rows. Member **user accounts** remain. Existing revocation preview omits unplaceable ACL rows, so its rows.length and client member lists are not authoritative deletion impact. A new narrow read projection is required under this issue; no new deletion transaction, ACL pre-revoke, or broad UI redesign.

The design has no implementation dependency on #81, but **#82 is blocked before behavior tests or production implementation until the stable token requirements are reconciled as specified below**. #82 fetches its own complete preview, does not assume #81 effectiveMembers fields exist, and preserves default/superuser immutability through server canonical identity checks. Read-only investigation and test/design planning may continue; this decision is not an override of either stable requirement.

## Authoritative API contract

Add **GET `/roster/groups/:groupId/delete-preview`** under the existing API base. Authentication and authorization occur before returning identity/counts. Successful 200 body:

```ts
type GroupDeletePreview = {
  id: string;
  name: string;
  system: false;
  memberCount: number;
  aclEntryCount: number;
};
```

id is the captured current group ID, name is its exact current name, system is explicitly false because system previews are refused. memberCount is complete distinct direct user memberships for that ordinary group, all account states, with no UI/search cap. aclEntryCount counts **every persisted acl_entry where principal_id equals groupId**, across nodes/workspaces, including orphaned/unplaceable/unservable targets and any rows not shown by revocation. Do not count distinct documents, effective users/permissions, visible grants or grant-preview subsets. Numbers must be nonnegative integers; missing/invalid fields are contract errors, not zero.

Read group identity and both counts from one consistent database read snapshot (existing transaction/store facility) so the response is internally coherent. Existing repository `entriesOfPrincipal(groupId)` is a valid uncapped ACL source; do not reuse the filtered revocation projection. A narrow count repository method is allowed if needed but no cached/denormalized count or schema change is required. Return counts/identity only; no member names, ACL rows, target paths, PATs or content.

Keep existing **DELETE `/roster/groups/:groupId` → 204**, with no invented token/revision/preview ID payload. Authentication absent → 401. Unauthorized or absent/not-group target → uniform 404. Authorized system target → 403. Preview must match the same rule ordering: unauthorized callers do not learn a system ID through a distinct response. Delete independently repeats authorization/immutability, not trust preview, client system flag or token. HTTP/UI confirmation is not a new server authorization mechanism.

Preserve `removeGroupWithGrants` and the existing one-delete/cascade atomic boundary. One accepted DELETE removes the group, memberships and all its ACL rows together. No preflight write, no `revokeAllFor`, no sequential group-then-ACL transaction and no delete of member user rows. Existing audit/foreign-key behavior remains; do not add a new retention or PAT revocation policy.

## Exact token and fresh-impact lifetime

Group deletion is **always L3**, even memberCount=0 and aclEntryCount=0. Its token is the exact current **group name**, not a number, ID, generic word or inferred count. Compare exact raw string without trim, case folding, Unicode normalization or substring matching. Render name as escaped text; never HTML. Same-name groups are distinct captured IDs.

**Unresolved authority conflict:** IR-PRINCIPAL-004 AC-3 and live #82 require the exact group name, while the traced `constrained_by` FR-CONFIRM-004 expressly includes group deletion and requires a refreshed numeric token after count changes. Both are stable. The operation-specific document currently has no established precedence that this decision can invent. An exact-name implementation cannot be claimed to satisfy the current numeric-token ACs.

Targeted reconciliation handoff to the SRS/workflow owner, required before RED tests or implementation:

1. Use supported SpecKiwi tooling to refine **FR-CONFIRM-004's Requirement and AC-4/AC-5 plus directly dependent notes** so refreshed numeric-token rules apply only to operations whose designated token is impact-derived. Preserve fresh-open recount, changed-impact locking and the existing numeric-token contracts of those other operations. Do not weaken the freshness gate or broadly alter other confirmation grades.
2. Explicitly record group deletion's designated-token precedence by reference to **IR-PRINCIPAL-004 AC-3/AC-5**: `그룹 삭제의 지정 토큰은 IR-PRINCIPAL-004가 정한 현재 그룹 이름이다. 그룹 이름·정체성·멤버 수·전체 ACL 항목 수가 바뀌면 기존 입력과 동의를 폐기하고 실행을 잠근다. 취소 후 다시 열어 fresh baseline을 확인한 다음 현재 이름의 exact match와 명시적 수락을 요구한다. 수치만 바뀌어도 입력과 동의를 다시 받아야 하지만 이름 토큰을 숫자로 바꾸지 않는다.` Align directly affected IR-PRINCIPAL-004 explanatory text if necessary; retain its exact-name AC.
3. Align the corresponding live #82 criterion/clarification with this explicit precedence and re-read both stable requirements and the issue. Obtain independent contract review showing no exact-name/numeric-token contradiction and no regression of other impact-derived tokens. Only then may #82 begin RED→GREEN implementation.

Until this completes report `implementation blocked: token contract reconciliation pending`. Do not implement a hybrid token, claim both current contracts pass, or regard this supporting artifact as the SRS change. No SRS/GitHub mutation is performed by this task. The exact-name lifecycle below is the decided **proposed reconciled behavior** and becomes implementable only after that gate.

The minimal owner key is `(authPrincipalId,authGeneration,categoryGeneration,modalOpenGeneration,groupId,previewRequestGeneration,actionGeneration)`. No client name/index is used to locate a target. Retain prior accepted impact only as a comparison baseline, never as authorization for a reopened dialog.

1. Clicking ordinary delete captures ID, initiating action/focus and displayed current group name, opens L3 in **loading** state and issues fresh GET. Initial focus is cancel or static explanation. No token control can execute before a valid current response. First successful response establishes baseline if no prior complete preview exists; compare its ID/name to the triggering current row. If previously accepted complete counts exist for this intent, compare both too.
2. If fresh identity/name/counts differ from the captured accepted baseline, invalidate typed input and consent synchronously; show updated current impact and `삭제 영향이 바뀌었습니다. 취소한 뒤 다시 확인하십시오.`; keep accept locked. Cancel closes this generation. Reopening issues another fresh GET and establishes the displayed updated snapshot as comparison baseline; only an unchanged fresh response can unlock the new explicit intent. If it changed again, lock again. Never unlock a changed dialog merely because state rerendered.
3. Initial fresh read failure shows `삭제 영향을 불러오지 못했습니다.` and GET-only retry, with zero DELETE. If retry obtains a changed previously accepted snapshot, follow the same changed-impact lock. No estimate/fallback counts.
4. User supplies the current exact name. Ordinary typing, paste, drop and browser/programmatic value synchronization may populate the text input; preserve the resulting raw controlled value. The application never prepopulates it from the target name/defaultValue and supplies no copy-name-to-input helper. Input changes, paste/drop/autofill and composing Enter never submit, move focus to the destructive button or constitute consent. The final deliberate action is a separately labelled `그룹 삭제` button, not entry of the last character or Enter inside the token input. Keyboard activation of that button remains supported. A later explicit activation after paste/drop is allowed only if the current raw value exactly matches the current name and all final freshness/ownership guards pass.
5. Deliberate acceptance synchronously locks duplicate intent and issues a final read of the same preview before DELETE. Only if owner/id/name/memberCount/aclEntryCount remain identical, token still exactly matches and actor is current does it send one DELETE. Any changed final read clears/locks consent and requires cancel/reopen. A failed final read sends no DELETE and invalidates acceptance. This additional read narrows staleness but is not an atomic lease.
6. During actual DELETE block accept/cancel, local close/Escape and context-changing form controls. Outside interaction never closes AlertDialog or executes. Same-tick click/Enter/stale handler invocations are rejected by a synchronous guard; state/disabled markup alone is insufficient. Auth/category destruction may invalidate the UI owner but cannot unsend the request or be reported as cancellation.

Before write pending, cancel and Escape dismiss only the top confirmation and send zero DELETE; outside interaction is inert. Wrong/empty token, stale input, row rerender and programmatic callback after invalidation also send zero. Paste/drop/native or synthetic autofill **alone** always sends zero, while preserving synchronized input for a later deliberate activation; the input's provenance is not an additional eligibility rule. Mount shared AlertDialog UI locally; shared ConfirmGate's internal counts-only lock, React-state submission guard and fixed focus restoration are insufficient by themselves. Do not change every shared gate to accommodate this operation or feed false unit counts just to trigger a lock.

**Residual race:** existing DELETE does not consume an expected revision/snapshot and another administrator may change ACLs/name/members after the final GET. Preview is exact at read time; deletion atomically removes the actual current full set. Do not claim exact compared-snapshot execution or automatic changed-impact rejection at the server. Atomic compare-and-delete/revision/idempotency contract needs separate explicit SRS/API scope; it is not silently added here.

## Consequence text, outcome and privacy

L3 title: `{name} 그룹 삭제`. Display `멤버 {memberCount}명` as complete membership impact context and both required sentences verbatim:

- `멤버의 계정은 삭제되지 않습니다.`
- `이 그룹에 부여된 권한 항목 {aclEntryCount}건이 함께 제거됩니다. 되돌릴 수 없습니다.`

Keep full name and wrapped text visible; no tooltip-only consequence. Do not say accounts, PATs or previously read content are destroyed/recalled. Explicit token label identifies the full exact required name and is persistently visible; an initial empty token is neutral with disabled acceptance, not an error on opening. After attempted invalid submit use linked explanation/aria-invalid as appropriate without autoexec. No undo or recreation button.

Accepted 204 announces `그룹을 삭제했습니다.` in the surviving current-owner parent status and closes the gate. Begin group-roster and relevant tree read invalidation, preserving this accepted result even if either read fails. No optimistic removal before 204. Until authoritative roster refresh returns, a stale row may remain visibly marked nonactionable, but cannot offer another delete/add for the acknowledged-deleted ID. GET refresh error/retry is separate from delete error and never repeats DELETE.

Refusal: `그룹을 삭제하지 못했습니다. 목록을 새로 불러온 뒤 다시 확인하십시오.`. Uncertain network result: `처리 결과를 확인하지 못했습니다. 목록을 새로 불러오십시오.`. Neither says nothing changed. Invalidate token/consent, retain safe context and require read reconciliation and a new dialog generation before another deliberate attempt. A failed/uncertain DELETE never automatically retries. A subsequent 404 is not retroactively fabricated as an accepted 204. No raw server error/body, database constraint text or inferred hidden ACL path is shown.

Old auth/modal/group completions cannot close a different dialog, announce another group's success, clear another token or steal focus. Original-owner cache invalidation is permitted only without injecting privileged data into a new principal context. Role loss removes all privileged category/row/action data immediately; ordinary users and non-superuser workspace managers see no group management surface.

## Focus, layout and state matrix

Use existing highest-layer L3 AlertDialog over settings, never a nested ordinary form modal. Keep title/cancel/action reachable in a bounded scrolling body, 560px maximum width and 24px viewport gutters, wrapping name/help, existing typography/tokens and ≥36px controls. AlertDialog traps focus; initial focus never rests on delete. Background settings remain inaccessible until closure; do not focus background during loading/error/pending.

On cancel restore the surviving same-ID delete trigger (or group heading if it vanished). After accepted removal, restore next surviving row action by captured stable-ID order, then previous, then group table heading, **only if the removed action/its confirmation still owned focus and the category/auth owner is unchanged**. If the user navigated elsewhere or another owner holds focus, do not move it. Suppress library default trigger restoration when it would target detached DOM or override a newer context.

| State | Observable behavior |
| --- | --- |
| default / selected | Ordinary trigger opens impact; token editing only, no group multi-select. |
| hover / focus | Distinct nonshifting shared states; 2px outline + 2px clearance, focus not clipped. |
| disabled / readonly | System no-delete explanation; preview unresolved, wrong token, changed impact or pending locks accept. Identity/counts selectable read-only text. |
| invalid | Wrong exact token prevents write; neutral initial input, accessible explanation when validation runs. |
| loading | Fresh initial/final preview versus DELETE pending are distinct; cancel available until write pending. |
| empty | Zero member/ACL values remain explicit valid impact and still require L3, never skipped confirmation. |
| error | Preview read failure, changed-impact lock, refused/uncertain DELETE and accepted-delete/read-refresh error are separate. |

## Strict TDD and proof of the actual path

Primary-REQ-tagged failed assertions precede every production behavior change; record RED then minimum GREEN without weakening tests. Accidental test-after implementation must be removed and redone. Keep sdd; if a later intentional tdd switch occurs its SDS-before-tests/test-first-commit gates also apply. Different verifier reviews original requirements/diff/evidence.

Server RED must create an ordinary group with multiple ACL levels/targets including unplaceable rows, complete memberships and accounts. Assert exact preview counts, authenticated caller gates/system denial/no enumeration, whole-delete cascade with zero remaining group ACLs/memberships, accounts unchanged, and rollback consistency using real SQLite. The count oracle should query persisted ACL rows directly, independently of the new service helper. Preserve existing system-group and last-active-superuser regressions; group removal never reaches system groups.

After the reconciliation gate, Web RED covers: disabled old one-click path, fresh GET-before-action, zero-count L3, wrong/raw-space/case-different/Unicode-different tokens, paste/drop/autofill value synchronization with zero DELETE and no destructive focus shift, and a later deliberate button activation succeeding only for an exact current token with fresh unchanged impact. Composing Enter, cancel/Escape/outside still cause zero writes. Also cover matching deliberate accept one captured-ID DELETE, name/member/ACL/identity changes clearing the typed name and locking even when only counts change, retry/cancel/reopen rebaseline, final-check read failure, same-tick repeated events, stale owner callback, accepted delete + failed roster/tree refresh, obsolete completion and conditional stable-ID focus. Request counts and DB consequences must distinguish reads from writes; a callback spy alone is insufficient. Separate confirmation regression must preserve refreshed numeric tokens for operations whose reconciled designated token is impact-derived.

Run focused GroupRoster/confirmation/settings tests, existing principal roster/system-group server tests and route/transaction tests for new preview, full server/web regressions and typechecks through existing npm workspace commands. Product evidence must open actual App settings against disposable server/database fixtures, perform the real preview+DELETE, and prove persisted group/ACL removal and retained accounts. Clearly labelled interception may inject network races/errors; existing #68 supplied-prop fixture cannot stand in for this evidence.

Browser: fresh Playwright-owned isolated Chromium persistent context/disposable profile/test-only extension. 1280×720, 1440×900, 1920×1080 × light/dark × 100%/real 200% = 12 environments, plus forced-colors at both zooms. Each main environment includes superuser, ordinary and non-superuser workspace-manager role assertions through production App. Set chrome.tabs.setZoom(tabId,2), separately read getZoom===2; reset setZoom(1), separately read getZoom===1. Record tested tab, CSS viewport/DPR, real computed styles/geometry/contrast, screenshots, focus and request counts. Same mounted confirmation survives resize/100→200→100 with token/ID intact and zero accidental DELETE. Check long Korean/name overflow, typed IME text, all controls/consequence lines, last row focus and zero/high counts. Normal/large text contrast ≥4.5/3, active boundaries/focus ≥3; forced colors retains visible real borders/outline and danger text.

No existing/default browser/profile, CDP attachment/connectOverCDP or OS/native input/window automation. Synthetic composition/DOM only; native Windows IME candidate UI remains explicitly **nonblocking untested**. Close owned handles; terminate only runner-owned PID/descendants with proven ownership, never broad node.exe/nodex.exe/Chromium kills.

## Closure

#82 can independently close #68's B2/exact-impact/L3/delete-result/focus integration boundary **only after** the targeted FR-CONFIRM-004/IR-PRINCIPAL-004/live-#82 token reconciliation passes independent review, RED→GREEN implementation is complete, and all IR-PRINCIPAL-004 ACs have independent real-App/server evidence. It is not implementation-ready before that gate and needs no #81 implementation. It cannot close #81/B1/member-add/system projection or all general confirmation ACs, and #68 presentation closure never depended on it. No group creation/rename, member removal, bulk pre-revoke, delete undo/recreation, PAT/content erasure or atomic revision API is authorized. This design-only artifact closes no issue and supplies no verification evidence.
