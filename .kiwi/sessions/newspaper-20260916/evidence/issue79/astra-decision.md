# Issue 79 — authoritative relocation integration decision

Decision owner: Astra. Date: 2026-09-18. Scope: design only; no implementation, executed tests, SRS mutation or issue closure is claimed. This is a binding implementation handoff subordinate to `docs/spec/`, not another requirements source.

## Authority and readiness

Live #79 has no comments. Primary requirement: **IR-SHELL-011**, planned/stable, phase-1. SpecKiwi MCP identity was `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`; persisted mode is sdd. Read root AGENTS.md/index and the requirement plus FR-SHELL-015, FR-ACL-002/006, FR-CONFIRM-005/016/017, SEC-ACL-014/015, SEC-SHELL-002/003 and IR-SHELL-008. Preserve #66's binding presentation and its component evidence; that evidence expressly does not prove App integration.

The transport/lifecycle design below is decided. **Implementation is blocked until targeted SRS and live-issue reconciliation:** IR-SHELL-011 AC-13 requires source-tree focus after inner L2 cancellation and failed mutation, while AC-6 retains the form and IR-SHELL-008 requires its modal focus containment. #66 already proves L2 cancellation returns to the parent form's execute button. Focusing the background tree while that modal remains active cannot satisfy both. The proposed authoritative behavior is: inner cancellation/failure returns focus inside the still-open form; outer dismissal/success returns to the source tree. No behavior tests or production implementation under #79 may begin until the reconciliation below is complete. Read-only investigation and test/design planning may continue. This document does not amend a stable requirement or establish precedence over it.

Targeted reconciliation handoff to the SRS/workflow owner:

1. Through supported SpecKiwi mutation tooling, revise **only IR-SHELL-011 AC-13 and directly dependent explanatory text** to distinguish inner and outer focus boundaries. Proposed AC wording: `L2 확인 취소 시 열려 있는 이동·복사 폼의 실행 버튼으로 초점을 복원한다. mutation 실패로 폼과 선택을 유지할 때는 해당 폼 안의 오류 안내·재시도 또는 실행 조작으로 초점을 복원한다. 외부 폼 취소 또는 accepted mutation 성공으로 폼을 닫은 뒤에는 source tree row가 남아 있으면 그 행으로, 없으면 사전에 정한 tree의 논리적 후속 위치로 복원한다. 대상·인증·모달 owner가 바뀐 뒤에는 이전 요청의 결과로 초점을 이동하지 않는다.` Preserve AC-6's retained form and IR-SHELL-008's modal containment.
2. Align live #79's corresponding completion criterion to the same wording. This is a targeted clarification of the existing REQ/issue, not a new behavior source or a broad focus rewrite.
3. Read both authorities back, confirm the stable requirement/issue agree, and obtain independent contract review before starting RED tests or implementation. Until then report `implementation blocked: focus contract reconciliation pending`; do not mark AC-13 satisfied or use this decision as an override. No SRS/GitHub mutation is performed by this design-only task.

## Supported API and data ownership

All paths below are relative to the existing API base; no server endpoint/schema/policy changes.

| Operation | Existing transport | Required handling |
| --- | --- | --- |
| Preview | GET `/nodes/:id/relocation-preview?kind=move|copy&destinationId=...` | Typed discriminated response: move `{kind:'move',before:number,after:number,grade:'L1'|'L2'}`; copy `{kind:'copy',reachable:number,grade:'L2'}`. Use returned grade/counts; no client fallback grade. |
| Move | POST `/nodes/:id/move`, JSON `{parentId:string|null}` | Await `{name:string}`. Root move uses null, only inside the source workspace. |
| Copy | POST `/nodes/:id/copy`, JSON `{parentId:string}` OR `{workspaceId:string}` | Await `{id:string,name:string,copied:number}`. Preserve exclusive destination variants. |
| Destinations | Existing current tree queries plus `destinationsFor` | Transport actual loading/error/ready separately from preview and post-write refresh. A successful empty projection is ready-empty; no default-array inference. |

For a selected directory send its node ID as preview destinationId. Root selections require different transport for move and copy:

| Selected destination | Preview query | Mutation body |
| --- | --- | --- |
| Source workspace root, move | `?kind=move` with **destinationId omitted**; the server receives null. | `{parentId:null}` |
| Another workspace root, move | Reject locally before preview or mutation; zero requests. | None |
| Any eligible workspace root, copy | `?kind=copy&destinationId={selectedWorkspaceId}`; never omit the explicit copy root. | `{workspaceId:selectedWorkspaceId}` |
| Directory, move/copy | `?kind={kind}&destinationId={selectedDirectoryNodeId}` | `{parentId:selectedDirectoryNodeId}` |

Retain the selected workspace ID in the client UI and freshness tuple even when root-move serialization omits destinationId. Existing movePreview treats non-null destinationId as a **node ID** and cannot accept a workspace ID; copy preview accepts workspace IDs. No server change is needed. Reject a move root ID that differs from the source workspace, and never convert a missing/failed ID lookup into a root operation.

Preserve existing destination projection exactly: source/self descendants excluded, move restricted to same workspace, copy supports cross-workspace. Workspace root edit eligibility is not present in the current tree projection; show only its existing supplied option, let authoritative preview/write reject it, and do not invent eligibility from child levels or visibility. A listed option is not authorization.

Minimal edits later: client preview/result types and calls, narrowly scoped query/action adapter, App/AppShell forwarding, RelocationDialog/RelocationPreview integration props and tests. App must stop swallowing writes and preserve their result independently of read invalidation. Keep semantic tokens and #66 layout; shared ConfirmGate API/behavior and destination picker redesign are excluded.

## State machine and exact freshness

One owner captures `(authPrincipalId, authGeneration, modalOpenGeneration, sourceId, kind, destinationId, destinationQueryGeneration, previewRequestGeneration)`. Selection is a stable ID, never an index/name. Increment/invalidate synchronously on owner/source/kind/destination/open changes; aborting a fetch is an optimization, and generation comparison is the correctness boundary. Authentication loss clears privileged data and cancels unsent intent; sent writes are not claimed canceled.

Destination phase and preview phase each use explicit idle/loading/ready/error. No source or no selected destination is idle. Refreshing/error responses cannot leave an actionable stale preview. Missing/malformed count, mismatched kind, unsupported grade, missing result name or invalid copied count is a contract error, never zero or guessed success. Safe error text must not include raw response bodies.

1. Destination read succeeds; retain selection only if the exact selected ID remains in the current projection. Selecting a destination begins a keyed preview read. Display only that response's counts and actual source node level.
2. An explicit execute action synchronously acquires the intent guard and refetches preview for the captured tuple. Compare kind, counts and grade with the displayed accepted snapshot. Error means no write. Any change means show refreshed impact, invalidate prior intent, and require a new explicit action; even a change L1→L2 must not silently consume the original intent as acceptance.
3. An unchanged fresh move L1 executes from that explicit action without mounting ConfirmGate. An unchanged fresh L2, including all copies, opens a relocation-specific shared-UI AlertDialog with literal L2 semantics. Initial focus is cancel/description. The form remains behind it.
4. L2 acceptance synchronously acquires its guard, refetches the captured preview again, and dispatches only if tuple, counts and grade still match. Same-count response permits the deliberate acceptance; any changed response shows a locked explanation, zero write, and requires cancel then a new form execute action. In particular an incoming L1 never turns an open L2 into auto-execution. A mounted shared ConfirmGate must never receive that changing grade; prefer the local AlertDialog adapter rather than altering shared gate semantics or fabricating node counts.
5. While refreshing an execution intent, duplicate execute/accept events cannot overlap. During the actual write disable submit, destination changes, close/cancel, Escape and outside dismissal. Guard checks also reject captured stale callbacks; disabled DOM alone is insufficient.
6. Accepted response closes only its current owner form, records actual outcome in the surviving parent notice, and starts read-only tree refresh. Obsolete responses cannot repaint/focus a new principal/modal/source. Original-owner cache invalidation must not inject old-principal data into current caches.
7. Failed/uncertain mutation retains the form/selection, discards intent/confirmation, displays a safe error and allows only explicit GET refresh followed by a new deliberate attempt. Never automatically retry a move/copy, including network timeout. Explain uncertainty without claiming no write occurred. Fresh preview is not an idempotency key.

No atomic preview-to-write revision/lease exists. A later server change can still make the existing write fail or change impact; server authorization remains final. Do not claim the local freshness guard eliminates this window or extend the API under #79.

## Outcomes, privacy and focus

Every accepted move: `항목을 이동했습니다. 결과 이름: {name}`. Every accepted copy: `{copied}개 항목을 복사했습니다. 결과 이름: {name}`. Both use the actual response, collision or not. No source-name guess, hidden collision reason, count denominator, automatic open, undo or audit link. Copy always retains `권한에 따라 일부 항목이 제외될 수 있습니다` regardless of hidden descendants. Preview shows only 접근 가능 counts, never people/avatars/initials; administrator simulation guidance appears only for actual source `level=admin`.

Tree refresh failure keeps the accepted notice and exposes a separate `목록을 새로 불러오지 못했습니다.` read error/retry. It does not reopen a successful form or relabel/repeat a write. Destination retry repeats its original GET query set; preview retry repeats preview GET; neither is a mutation retry.

After outer cancellation/accepted success restore source tree row if still present; otherwise the next visible sibling in the captured tree order, previous sibling, containing parent/workspace row, then tree container. Resolve by stable IDs after render, not stale DOM nodes. Do not select a different document or steal focus after principal/context replacement. An acknowledged move may still leave its same-ID row present elsewhere and should reuse it.

**Pending SRS alignment:** L2 cancel restores the parent form execute button and preserves selection; failed mutation restores a visible form error summary/retry or execute control, not background tree. Returning to tree happens when the user then closes that retained form. The conflicting AC-13 wording must not be hidden by a passing component test.

## UI/state contract

Retain 560px maximum form width, 24px outer gutters/body padding, bounded body scroll, fixed reachable header/actions, native labelled destination select, wrapping full-path readout and separate L2 overlay. Controls ≥36px/4px radius; title 18/26px, label 13/20px, input 14/22px, help 12/18px. Use existing newspaper semantic roles only; no broad style changes.

| State | Product behavior |
| --- | --- |
| default / selected | Real current option ID/path/counts, counts remain visible when equal; no selection is neutral. |
| hover / focus | Existing distinctions, no layout shift; 2px outline + 2px clearance and logical Tab containment. |
| disabled | No current destination/preview, freshness lock or operation pending; readable reason, zero write for keyboard/pointer. |
| readonly | Source/path/counts are selectable text; no invented readonly input. |
| invalid | Removed/stale destination gets safe actionable explanation, no guessed filesystem validation or raw error. |
| loading | Destination `목적지를 불러오는 중입니다.`, preview `접근 가능 인원을 확인하는 중입니다.`, write `이동 중…`/`복사 중…`; distinguish them. |
| empty | `제공된 목적지가 없습니다.` only after current ready-empty projection; cancel remains reachable. |
| error / locked | Destination/preview/read-refresh/write errors are separate. Changed impact: `접근 가능 인원이 바뀌었습니다. 확인을 닫고 다시 실행하십시오.` No live announcement on every render. |

## Strict TDD and evidence gate

Before production edits write REQ-tagged failing tests and record real assertion RED, then minimum GREEN without weakening tests. If implementation accidentally precedes RED, remove that implementation and restart. sdd remains unchanged; if later intentionally switched to tdd, SDS-before-tests/test-commit-first gates also apply. A different verifier receives original requirements/diff/evidence, not the implementer's conclusion.

After the reconciliation gate, RED must assert exact root transport: same-workspace move omits preview destinationId and sends `{parentId:null}`, root copy explicitly sends its selected workspace ID in preview and `{workspaceId}` in mutation, and cross-workspace root move sends zero preview/write requests. Both preserve the selected root ID in the ownership tuple. Also cover missing grade/result transport, delayed destination/preview error versus empty, all count/grade transitions (especially open L2→L1 zero writes), same-tick click/Enter/accept, malformed success/uncertain write, out-of-order old owner responses, accepted write + failed tree refresh, exact collision/visible-only result wording and reconciled inner/outer focus cases. Assert request counts/IDs/body and durable server outcomes, not just callback invocation.

Run focused relocation-dialog/acl-preview/confirmation/tree-destinations/screen-wiring tests, relevant server relocation/permission regressions, full web tests and web/server typechecks using existing npm workspace scripts. Server remains unmodified. Evidence must include authenticated real App and existing server round trips on disposable data; labelled request interception may inject delayed/errors/races but cannot replace success persistence/privacy checks.

Browser matrix: fresh Playwright-owned Chromium, disposable persistent profile/test extension; 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200% (12 environments), plus forced-colors 100%/200%. `chrome.tabs.setZoom(tabId,2)` followed by a separate read-only `getZoom(tabId)===2`; reset with setZoom(1) and a separate getZoom===1. Record tab identity, CSS viewport/DPR, computed geometry/styles, keyboard/focus, screenshots and request counts. No CSS zoom, transforms, deviceScaleFactor or half viewport substitutes. Same mounted form must survive resize and 100→200→100 without changed target/extra write. Check long Korean paths, last option/action reachability, unchanged focus/selection, normal/large text contrast ≥4.5/3 and boundary/focus ≥3.

No existing/default browser/profile, CDP attach/connectOverCDP, OS/native input/window automation. Native Windows IME candidate UI is explicitly nonblocking untested; synthetic composition/DOM only where applicable. Close owned server/context handles; forced termination only after PID/parent ownership verification, never process-name kills.

## Closure boundary

#79 can close #66's separated preview/query/result/operation integration boundary **only after** the targeted IR-SHELL-011 AC-13/live-#79 reconciliation has passed independent review, implementation has followed RED→GREEN, and every IR-SHELL-011 AC has independent product evidence. It is not implementation-ready while that alignment is pending. It does not reopen #66's independently completed presentation or verify all broader ACL/confirmation requirements. Current decision alone closes nothing. New destination search/hierarchy/root-capability projection, L1 move undo, atomic preview revision, collision diagnostics and automatic copy navigation require separate SRS/work scope.
