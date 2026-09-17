# Issue 80 — user administration request/result integration decision

Decision owner: Astra. Date: 2026-09-18. Binding design only; no code/tests/SRS/GitHub changes or execution claims. Requirements remain solely in `docs/spec/`.

## Authority and permitted boundary

Live #80 has no comments. **IR-PRINCIPAL-002** is planned/stable in active phase-1, mode sdd. MCP identity: `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`. Read AGENTS.md/index, primary requirement and FR-PRINCIPAL-001/009, IR-SHELL-002/006, FR-AUTH-002/003/004, SEC-AUTH-003/004, FR-CONFIRM-006/001; SEC-AUTH-016 preserves the server guard. #67's decision/presentation remains authoritative for layout/labels and its fixture evidence is not product integration evidence.

Approved future edits are narrow App/AppShell query/result adapters, client outcome typing, UserRoster/SignupApproval operation state/guards/focus, and necessary tests. No endpoint/schema/auth-policy change, arbitrary status dropdown, new category, or broad settings redesign. Existing comments in older FR-AUTH/PRINCIPAL notes describe historical G10 uncertainty; do not infer a new account policy from them. The actual existing registration endpoint's response and subsequent roster own observed state.

## Existing transport contract

Paths are relative to the existing API base and retain its session/CSRF/authentication transport.

| Read/action | Contract |
| --- | --- |
| User roster | GET `/roster/users` → array `{id,name,status}`; status is active/pending/suspended/rejected. Full privileged roster, no PrincipalPicker cap. |
| Signup mode | GET `/instance/signup-mode` → `{mode:'open'|'approval'|'invite-only'}`. Unknown/unresolved values use neutral empty copy, not an invented default. |
| Register | POST `/roster/users`, raw JSON `{name,password}` → **201 `{id}`**. Existing route creates active; UI waits for authoritative roster rather than appending a guessed row. |
| Approve | POST `/roster/users/:id/approve` → 204. No body. |
| Reject | POST `/roster/users/:id/status`, JSON `{status:'rejected'}` → 204. There is no separate reject endpoint. |
| Reopen/undo rejection | POST `/roster/users/:id/reopen` → 204; changes the same rejected account to pending. |

Unauthenticated endpoints return 401. Roster/mode/register/status use 404 for non-superuser; approve/reopen use 403 for non-superuser and 404 for invalid target/state. Register refusal is generic 400; status endpoint can return 409 last-active-superuser for its broader callers. UI must not expose raw bodies or guess field/account-existence reasons from codes. No new error taxonomy or endpoint is needed.

Use result-bearing awaited callbacks, never `void`/swallowed rejection. A narrow tagged result is acceptable: accepted with operation/ID, failed with safe category, or stale/obsolete. A resolved void from a presentation callback is not proof of acceptance. Registration must validate accepted 201 and a nonempty returned ID; malformed success is an uncertain/contract result, not permission to clear fields or repeat POST.

## Independent query and generation ownership

Roster and mode each expose idle/loading/ready/error plus accepted query generation, bound to authenticated principal/auth generation and settings/category owner. Only current successful roster data owns rows and pending/rejected counts. Initial/loading/error is not count=0 or authoritative empty. On ordinary read error, hide stale rows/actions and provide roster-only GET retry. On role/auth loss, immediately unmount all privileged categories/rows/actions and discard their caches/requests; a workspace-manager role never substitutes for superuser.

Mode error never clears successful roster data or changes counts/actions. When pending is nonempty, show it regardless of mode. When pending is empty, ready mode selects existing exact #67 copy: open free-signup explanation, approval no-requests explanation, invite-only direct-registration explanation. Unresolved/failed/unknown mode uses `승인 대기 중인 계정이 없습니다.` and, on failure, distinct `가입 모드를 불러오지 못했습니다.` plus mode-only retry. Rejected rows/count are independent of mode and pending tab.

All completion handlers compare principal/auth/category/query/action/form generations and stable target ID. A request cannot repaint another category/form/ID or focus an element the user has since left. Query keys/cache handling must prevent old privileged data becoming visible to a new account. Aborting reads is optional cleanup, not a substitute for these checks.

## Registration

Keep the existing inline 사용자 직접 등록 section, labelled raw name and masked password, `autocomplete=username/new-password`. Preserve raw nonempty eligibility; no trimming/normalization/new password/email rules, credential reveal, expiry claim or signup-mode gate. Password exists only in local form memory and the intended HTTPS/API request, never notices, storage, logs or artifacts. Synthetic browser fixtures use disposable credentials and mask password screenshots/traces.

Deliberate registration captures raw values and form/auth generation, acquires a synchronous ref guard before any await, then sends exactly one POST. Button activation and any existing noncomposing Enter submission share that guard; do not add a second implicit submit path. Disable registration while pending and keep captured values intact. For this bounded change make the two inputs temporarily readonly while the request is outstanding, with readable pending text; do not erase credentials or permit an old result to clear newer edits. Category exit/auth loss invalidates the owner; never persist credentials to recover them later.

On explicit refusal/false/rejection retain the same-owner raw name/password and show `사용자를 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도하십시오.` as a form error, not fabricated field-specific invalid states. On ambiguous network failure retain input, indicate `처리 결과를 확인하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.` and offer GET refresh; no automatic POST retry. Accepted 201 with actual ID clears only its current form and announces `사용자를 등록했습니다.`. A subsequent roster read failure leaves that success and separate read retry visible. Registration focus stays with its current form control, unless owner changed, and does not jump into a newly inserted row.

## Queue actions, rejection undo and race boundary

Approve/reject are enabled only for a pending account in the **latest accepted current client roster snapshot**; reopen only for a rejected account there. Stable IDs, not names/indices, determine targets. Before dispatch recheck current owner, ID, expected local status and snapshot generation. Synchronously acquire one operation guard per account ID; approve/reject/reopen/undo for that same ID cannot overlap, while unrelated accounts may proceed independently. Do not optimistically remove rows or rewrite statuses.

Approval and reopening use their existing explicit buttons. Rejection is L1: no preconfirmation. An accepted reject produces a durable current-owner status/toast `가입을 거절했습니다.` with `실행취소`, captured exact rejected ID, and one-shot undo intent. Undo uses **only reopen of that ID**; no registration, approval, generic status reset or guessed previous state.

The accepted reject receipt may be shown immediately, but undo remains unavailable until a current successful roster confirms that exact ID is rejected. Refresh failure retains the accepted rejection notice and explains that the list must be refreshed to enable undo; retry is GET only. This satisfies the same-snapshot reopen rule without fabricating an optimistic rejected row. A new snapshot where the ID is no longer rejected invalidates that undo. A successful undo announces `재심사 대상으로 되돌렸습니다.` and independently refreshes roster. No automatic undo or arbitrary expiry policy is introduced. Rejection and undo each send at most one write per deliberate current intent; a failed/uncertain undo needs GET reconciliation before a new explicit attempt.

Other accepted results: approve `가입을 승인했습니다.`, reopen `재심사 대상으로 되돌렸습니다.`. Row errors use `요청을 완료하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.` with a read-only reconciliation action. Old-category completions may invalidate their original-owner cache but may not announce/focus in a new category. Accepted write and failed refresh are separate states, never one catch that turns success into failure or repeats the write.

**Local freshness is not atomic cross-admin state validation.** Current approve/status endpoints do not require expected pending status/revision at commit. Another administrator can change an account after the snapshot and before this write. #80 must document/test the local guard without claiming to prevent that race. Arbitrary status management, atomic expected-state/revision and a specialized last-active-superuser 409 UX need separately scoped SRS/work; do not add them here or invent a self-target prohibition. Existing server SEC-AUTH-016 remains untouched and final.

## Focus, layout and all applicable states

Keep #67 two-column roster and queue tables, current Radix pending/rejected tabs, exact four roster labels 활성/대기/정지/거절, no additional metadata. Preserve 18/26 heading, 13/20 label/header, 14/22 body, 12/18 help, rows ≥40px and actions ≥36px. Use existing semantic newspaper roles, multiline names, retained settings pane scroll and reachable final action. Plain values remain selectable; no offboarding/status controls are added.

On refreshed row removal, restore focus **only if that row/action still owned focus immediately before removal and the owner generation remains current**. Resolve next surviving actionable row by captured order/stable ID, then previous, active tab, then empty heading (`tabIndex=-1` programmatic focus). If another account/form/tab now owns focus, leave it alone. Read errors use a reachable labelled retry; status announcements must not take focus or repeat on rerender.

| State | Required result |
| --- | --- |
| default/selected | Real four-state roster, independent queue counts, selected tab distinct from focus; no row selection. |
| hover/focus | No geometry shift; 2px outline + 2px clearance, proper tab arrows/Tab/Shift+Tab without changing outer category. |
| disabled/readonly | Empty raw registration, absent handler, pending same-ID operation and stale roster disable relevant actions. Pending registration values remain masked/readable; informational cells stay selectable. |
| invalid | Initial fields neutral; existing raw-empty condition blocks submit. Generic server failure does not invent a name/password field error. |
| loading | Roster, mode, registration and per-ID action pending distinguishable; loading never renders authoritative zero counts. |
| empty | Only accepted roster supports empty roster/pending/rejected copy; mode only qualifies pending-empty. |
| error | Roster versus mode versus form/action versus post-success refresh; every read retry affects only its GET; no raw errors or credential disclosure. |

## Strict TDD and product evidence

Write primary-REQ-tagged failing tests before behavior edits, record assertion RED, then minimum GREEN without weakened assertions. If test-after occurs remove implementation and restart. Mode remains sdd; any intentional future tdd mode also requires SDS-first/test-first-commit gates. Independent reviewer receives original contracts/diff/evidence.

RED cases: default [] confused with loading; roster/mode independent failure/retry; all mode/nonempty queue combinations; raw input and masked failure retention; 201-ID accepted-only clear; same-tick click/Enter; approve/reject/reopen guard by snapshot/ID; old response after tab/form/account switch; reject without confirmation, undo disabled until fresh rejected snapshot then exact-ID reopen once; accepted write + refresh failure; conditional focus restoration; server role denials; synthetic composition Enter zero writes. Exercise realistic deferred/out-of-order responses and assert request method/body/ID/count.

Run user-roster-register/roster/signup-approval/settings-category/screen-wiring regressions, existing server signup/account-state/auth-route tests, full web suite, and web/server typechecks via existing npm workspace scripts. No arbitrary server mutation change is authorized. Real App with disposable server/database/accounts must prove registration and reject→reopen→approve persisted same-account results, role gating and denied direct endpoints. Clearly label interception used for failures/races; a component-only fixture is insufficient.

Browser: fresh Playwright-owned isolated persistent Chromium/profile/test-only extension; 1280×720, 1440×900, 1920×1080 × light/dark × 100%/real 200% = 12 environments, plus forced-colors at 100% and 200%. In each main environment exercise superuser, ordinary user and non-superuser workspace manager through actual App settings; privileged categories/rows/actions absent from unauthorized DOM/accessibility tree. Use `chrome.tabs.setZoom(tabId,2)`, separate read-only getZoom===2, then reset setZoom(1) and separate getZoom===1. Record CSS viewport/DPR, geometry/contrast/screenshots, keyboard/focus and requests. Same mount resize/100→200→100 must retain current fields/tab/account without extra writes. Text contrast ≥4.5 normal/3 large and active boundary/focus ≥3; long Korean names/mode copy and last actions remain reachable.

No existing/default browser/profile, CDP attachment/connectOverCDP, OS/native input or window automation. Synthetic composition/DOM/paste/autofill-style value synchronization only. Native Windows IME, password-manager and autofill UI remain **nonblocking untested**, not waived as verified. Close owned handles; forced cleanup only verified owned PID/descendants, never node.exe/nodex.exe/Chromium name kills.

## Closure

#80 is independently implementable on the current endpoints and can close #67's separated query/Promise/outcome/undo/focus integration boundary after every IR-PRINCIPAL-002 AC has independent actual-App evidence. #67 presentation closure does not wait for #80. This does not close arbitrary status management/cross-admin atomic race gaps, offboarding (#77), group management (#81/#82), or all underlying auth requirements. No issue is closed by this design-only handoff.
