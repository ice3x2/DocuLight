# Issue 66 — move/copy presentation and separate integration decisions

Decision owner: Astra. Re-audited 2026-09-18 against live #66, SRS and current code after independent C1/H1/H2/M1 findings. Sol medium implements; a different Sol reviewer verifies. This is a supporting design reference, not an alternate SRS or implementation/verification claim.

## 1. Source authority and finding dispositions

The live issue names only `RelocationDialog.tsx` and `RelocationPreview.tsx`, says missing forwarded data is a separate functional defect, and requires SRS plus separate work scope before API/function connections. Existing requirements retain their IDs, status and evidence: FR-SHELL-015 verified/evolving, FR-ACL-006 verified/stable, FR-CONFIRM-016/017 verified/stable, SEC-SHELL-002 verified/stable. SpecKiwi reads resolved to C:/Work/git/DocuLight2.0, server-cwd-discovery, sdd, phase-1.

| Finding | Facts rechecked | Decision |
| --- | --- | --- |
| C1 — integration scope exceeded | AppShell does not forward preview/grade/result, calls relocation and unmounts immediately; App swallows errors and discards returned name/copy count. Those are wiring defects even though the endpoints exist. | **Accepted. Withdraw the prior authorization to add App/AppShell/client async lifecycle, query state, notices or parent focus wiring directly under #66.** #66 is the two components' existing-prop presentation plus scoped styles/tests. Necessary wiring must first receive an official SRS requirement/refinement and a separate issue. |
| H1 — recount scope and automatic L1 execution | FR-CONFIRM-004's general statement describes numeric confirmation; its Implementation Notes enumerate group deletion, trash retention reduction, bulk revoke and container grants, not relocation. ConfirmGate's effect calls onConfirm when open and grade becomes L1. | **Accepted as a concrete hazard.** Do not claim FR-CONFIRM-004 already specifies relocation's full refresh/transition lifecycle. Specify that lifecycle in the prerequisite requirement/issue. The outer transition design in §5 avoids ever rendering an open ConfirmGate with L1; no shared-gate behavior change is authorized here. |
| H2 — final name optional | Move returns {name}; copy returns {id,name,copied}; neither response identifies visible/hidden collision cause. SEC-SHELL-002 requires the same collision handling/notice without extra confirmation. | **Accepted.** Every successful move/copy must display the returned name using the exact common result-name clause in §6. It is mandatory, not “may.” Missing name forwarding is a prerequisite wiring defect, not permission to omit the result or guess a collision reason. |
| M1 — state coverage unclear | Existing props expose selected destination, missing destinations/preview, grade, level and copy count; they do not expose network phase, invalid-input state or mutation outcomes. | **Accepted.** §7 explicitly distinguishes current presentation, non-applicable state and prerequisite state, with evidence for all ten issue-listed states. No loading/error is invented from absent props. |

The older decision's broad frontend-adapter approval is superseded by this scope correction. This does not waive an existing requirement merely because its metadata says verified.

## 2. Authorized #66 write boundary and independent completion

Allowed implementation: the two named components, their scoped CSS and focused tests/fixtures. Render the information supplied through their **existing** props: kind/open/sourceName/destinations/destinationId/relocation/grade/level/result and current callbacks. Preserve callback payloads, public prop meanings and existing confirmation behavior while changing presentation. Do not manufacture source ID, query state, resolved name, elapsed operation state, success or permissions from names/counts/default values.

Do not edit App, AppShell, client/query adapters, server routes/services, shared ConfirmGate semantics or the destination projection as part of this presentation slice. A missing parent focus hook, real loading/error state or forwarded result belongs to the prerequisite work; fixture props are not proof that the product already supplies them. New outcome/query props can be designed by that separate requirement, not silently added here.

The following work is prerequisite to the **separate integration issue**, not to #66 closure:

1. Register/refine an official SRS requirement for existing relocation preview/grade/result forwarding and operation lifecycle, including the transition and final-name rules below. Link it to FR-SHELL-015, FR-ACL-006, FR-ACL-002, FR-CONFIRM-005/016/017, SEC-SHELL-002/003 and the relevant security constraints.
2. Create a separately scoped integration issue covering typed client preview, App/AppShell forwarding, real Promise outcomes, persistent completion notice and actual parent focus restoration. The existing endpoints supply the essential data; no new endpoint or authorization policy is needed for this minimal connection.
3. Independently review the new contract/scope before TDD implementation. This document does not itself register a requirement or issue and does not authorize those changes.
4. If expandable destination search, authoritative root edit eligibility, undo or other additional APIs are desired, assess their SRS coverage and create further scope before implementation.

**#66 is independently completable.** It may close when the two components' existing-prop presentation, applicable state/accessibility/geometry checks, component tests and real Chromium browser-harness evidence pass independent review, and missing forwarded data/functionality is recorded as separate integration work with its scope identified. No App wiring, new SRS requirement, integration-issue implementation or actual backend round trip is a prerequisite to #66 closure. Harness evidence must run the actual components and measure rendered output/interaction; source-class checks alone are insufficient. Clearly label supplied fixture props and do not describe them as proof that the product already forwards real preview/grade/result. Those live transport and lifecycle claims belong only to the separate integration issue.

## 3. Exact UTF-8 copy and layout

Use explicit UTF-8 read/write. PowerShell readers use Get-Content -Encoding UTF8. Current explicit UTF-8 reads render the original Hangul correctly; do not copy locale-decoded mojibake into source. Use these exact strings, retaining spaces and the Unicode ellipsis.

| Purpose | Text / condition |
| --- | --- |
| Title / close | {sourceName} 이동 / {sourceName} 복사; 이동 닫기 / 복사 닫기 |
| Destination label / placeholder | 목적지 / 선택하세요 |
| No selection | 목적지를 선택하세요. |
| Empty supplied option list | 제공된 목적지가 없습니다. — describes supplied data only, not a successful empty server query |
| Missing supplied preview | 영향 정보가 전달되지 않았습니다. — not a loading/success/zero-count claim |
| Move metric | 접근 가능 {before}명 → {after}명 |
| Accessible move wording | 이동 전 접근 가능 {before}명, 이동 후 접근 가능 {after}명 |
| Copy metric | 접근 가능 {reachable}명 |
| Increase / decrease | 볼 수 있는 사람이 늘어납니다. / 볼 수 있는 사람이 줄어듭니다. |
| Admin-only guidance | 누가 접근하는지는 시뮬레이션 화면에서 확인합니다. |
| Fixed copy notice | 권한에 따라 일부 항목이 제외될 수 있습니다 |
| Primary / cancel | 이동 / 복사 / 취소 |
| Prerequisite loading states | 목적지를 불러오는 중입니다. / 접근 가능 인원을 확인하는 중입니다. |
| Prerequisite query/preview errors | 목적지를 불러오지 못했습니다. / 영향을 확인하지 못했습니다. 목적지를 확인하고 다시 시도하십시오. |
| Prerequisite retries | 다시 불러오기 / 다시 확인하기 |
| Prerequisite pending | 이동 중… / 복사 중… |
| Prerequisite mutation error | 요청을 완료하지 못했습니다. 트리를 확인한 뒤 다시 시도하십시오. |
| Prerequisite changed-impact lock | 접근 가능 인원이 바뀌었습니다. 확인을 닫고 다시 실행하십시오. |

For the two-component presentation, use the existing shared visual language: maximum width 560px, outer gutters 24px, maximum height calc(100dvh - 48px), body padding 24px, control surface/border-control and radius 6px. Title 18/26px sans 600; labels 13/20px; controls 14/22px, minimum 36px high, radius 4px; help/status 12/18px. Header/close stay outside a shrinkable scrolling body. Actions wrap with at least 8px gap and long Korean context wraps naturally. Do not change parent unmount/focus lifetime just to achieve this layout.

Body order: supplied source name → native destination select and wrapping selected-path readout → supplied preview/unavailable state → fixed operation notices → supplied result if present → cancel/primary actions. Do not invent a source breadcrumb or full path absent from props. Keep native select; no search input, expandable tree or free-text destination.

Move shows both counts even when equal, with the exact 접근 가능 label. Copy shows only destination reachable count, not before/after or delta. Do not show rosters, initials or avatar samples. Preserve manager-only simulation guidance for actual supplied level=admin, matching FR-ACL-006 VE-2; no new clickable deep link is mandatory. Missing level means no invented administrator status.

Copy always shows the fixed exclusion sentence without a period/qualifier, hidden-count denominator or conditional omission. Move does not show it. Any supplied copy result is labelled as a copy count; never reuse result.copied to invent a moved-item count. The full integrated final-name result requires §6's prerequisite handoff.

## 4. Existing server facts for the separate integration issue

These are boundary facts and proposed handoff inputs, **not authorized #66 code changes**:

- Existing GET /api/nodes/:id/relocation-preview returns move {kind,before,after,grade} or copy {kind,reachable,grade}. The move client type currently omits kind/grade, and copy preview is not connected.
- Move preview targets a directory ID or null/omitted destination for the source workspace root. Copy passes kind=copy and the exact destination directory/workspace ID; cross-workspace copy root must not silently preview the source root.
- Existing move POST uses {parentId:null|directoryId} and returns {name}. Existing copy POST uses exactly {parentId} or {workspaceId}, returning {id,name,copied}.
- AppShell currently closes immediately after invoking its callback; App currently catches failures and loses the result. Therefore reliable pending/error, close-on-success and persistent result notice require the separate adapters.
- Bind preview and mutation to captured source ID, operation kind, destination ID and generation. A path/name is display data, never operation identity.
- Move remains same-workspace and preserves ID; copy may cross workspaces, preserves source and creates a new ID. Source/destination rights, hidden-child movement restrictions and visible-only copy remain server-owned.
- Existing destinationsFor supplies a flat projection. FR-SHELL-015 VE-3 expressly records missing root edit-level projection. Do not fake it from visibility, hidden-child guesses or the existence of an option.
- No role/algorithm/API change is necessary merely to forward already returned counts, grades, names and copied count. New root eligibility/search/undo data requires its own prior SRS/issue decision.

## 5. Proposed outer transition contract — prerequisite work only

FR-CONFIRM-016 supplies equal-count move L1 and changed-count move L2; FR-CONFIRM-017 supplies copy L2. FR-CONFIRM-004 does not explicitly enumerate relocation in its Implementation Notes, so relocation recount/locking must be included in the new requirement rather than silently inheriting an unspecified lifecycle.

Do not pass a changing preview grade directly to an open ConfirmGate. Its existing open+L1 effect invokes onConfirm immediately. The separate integration shall use an outer state machine with captured {sourceId,kind,destinationId,generation,preview} and these exact boundaries:

1. **Selecting / previewing:** invalidate the old tuple on selection/source/kind changes; no write from stale or absent preview. Ignore old responses.
2. **Execution intent / refreshing:** a deliberate form action captures the current tuple and requests its fresh preview. Block duplicate intents. Failed refresh shows retry and performs no write.
3. **Fresh move L1:** execute directly only for the same still-valid, deliberate intent, with **no ConfirmGate mounted/open**. Copy never takes this branch.
4. **Fresh L2:** mount a gate with literal grade=L2 and the captured fresh context. Its guarded acceptance checks outer generation/tuple before dispatching a write. No L1 value is ever forwarded to that mounted gate.
5. **Open L2 receives different counts/grade:** invalidate the acceptance generation first. Keep the gate as L2 solely as a locked explanation/cancel surface, updating the displayed values and changed-impact notice. Disable confirmation and independently reject stale callback invocation in the outer handler. The changed data is not permission to execute.
6. **L2→L1 specifically:** the locked gate still never receives grade=L1. Cancel closes/unmounts it with no write. A **new deliberate form action** re-fetches the same current tuple and may then execute via step 3. A response or rerender never creates that action.
7. **Cancel, source/destination change, close or owner invalidation:** invalidate the captured intent; no deferred callback may execute it later. Reopening creates a new generation. A sent request cannot be claimed aborted.
8. **Mutation:** one guarded awaited callback. On success close only after acknowledgement and deliver the required result through a surviving parent notice. On failure retain context, generic error and deliberate retry with a new preview; never automatically retry copy.

The existing ConfirmGate does not expose a generic external locked-reason contract; passing false node-impact counts to make it lock would display incorrect units. Therefore the separate integration issue must either (a) compose a relocation-specific L2 AlertDialog using the existing shared UI while preserving its semantics, or (b) separately specify/review a backwards-compatible explicit execution-lock API for ConfirmGate. **Do not modify the shared gate or invent fake counts in #66.** Prefer (a) for the narrowest ownership unless independent review establishes that (b) is required.

Required failing tests before that prerequisite implementation: open L2→incoming L1 causes zero mutation and no open gate with L1; cancel after change still causes zero; a new explicit action plus fresh L1 causes exactly one; L1 intent→fresh L2 requires acceptance; changed L2 counts lock; same counts remain usable; stale callbacks/generations and failed recount cannot write. Tests must assert endpoint/callback count, context IDs and visible lock state, not merely a grade prop.

## 6. Mandatory final-name feedback — prerequisite work only

SEC-SHELL-002 requires identical collision behavior/notice for visible and invisible conflicts and prohibits a new confirmation. The move/copy responses supply the resolved name but no collision reason. Always display that actual name using the same clause on **every success**, collision or not:

- Move: 항목을 이동했습니다. 결과 이름: {name}
- Copy: {copied}개 항목을 복사했습니다. 결과 이름: {name}

The clause 결과 이름: {name} is mandatory and identical across both operations and visibility cases. Use the actual returned name; do not compare it with stale sourceName to invent a reason, disclose the conflicting target, expose a hidden name, or claim a renamed count. Do not add or suppress this clause based on guessed collision. Preserve existing server suffix/no-overwrite semantics and existing standardized notices in other flows; this result clause is not a replacement for the rename route's authoritative notice.

The current component result prop contains only copied, so it cannot satisfy this name-feedback contract. Add name/result transport and persistent mounted notice only through the separately registered integration requirement/issue. Do not show a guessed original name or mark the missing result passed in the styling slice.

The integration tests must exercise visible, invisible and case-only collisions and ordinary success; assert the same operation template/result-name clause and real returned value, no overwrite, no extra confirmation and no hidden-target details. A successful mutation followed by tree-refresh failure retains the successful name/count notice and reports a separate read error; it never retries the mutation. Missing/malformed result data is a contract failure, not a zero count or successful name guess.

## 7. All issue-listed states: applicability and evidence

The distinction below prevents absence of supplied data from masquerading as a network state. Evidence uses the actual affected controls/preview; fixtures document supplied-prop presentation only.

| State | #66 existing-prop presentation | Required evidence / separate prerequisite |
| --- | --- | --- |
| Basic | Both operation titles, source, native select, selected path, applicable notices and supplied counts/result. | Component/browser harness computed type/spacing/contrast and screenshots satisfy #66. Available App observations may supplement them but are not required for missing wiring. Fixture data is labelled, not passed off as product transport evidence. |
| Hover | Pointer hover for primary/cancel/close and the **closed native select** must remain distinguishable without layout shift. | Playwright hover plus computed border/background/decoration and bounds. Chromium's native option-popup hover is browser-owned; inspect through Playwright where exposed, do not automate an OS popup or claim custom option styling. |
| Focus | Select and buttons have visible 2px outline plus 2px separation; preview remains readable without focus theft. | Tab/Shift+Tab, focused-element identity, outline contrast/bounds, no clipping. Parent focus-return wiring beyond current callbacks is prerequisite work. |
| Selected | Native select current value/selected option and wrapping readout reflect the exact supplied destination ID/path. No invented row-selection model. | Playwright select/keyboard change; DOM value, selected option and readout equality. Do not infer edit permission from selection. |
| Disabled | Existing no-destination primary button; existing confirmation disabled condition where supplied. | Disabled property, keyboard/click causes no callback, adequate nearby explanation and distinct focus behavior. Real pending/refresh-disabled selector/submit/close requires prerequisite lifecycle data. |
| Readonly | **N/A as a readonly form-control state:** no readonly input/textarea is present. Preview/source/path are ordinary selectable informational text, not disabled controls. | DOM confirms no false readonly editable field; text selection/readability checked. No readonly widget is added solely to fill the matrix. |
| Invalid | **N/A as free-text field validation:** destination is a native finite choice; no-selection is neutral placeholder plus disabled execution, not immediate aria-invalid error. | No fabricated initial field error. Stale/deleted/unavailable destination is a prerequisite selection/preview error, not a guessed invalid-path policy. |
| Loading | **Unavailable from current props; not inferred.** Missing relocation renders the explicit 전달되지 않았습니다 statement, not a spinner or 0. | Fixture checks factual absence wording. Actual tree/preview/mutation loading states need the separate query/outcome contract and delayed-request product tests. |
| Empty | Empty supplied destinations and unselected state are distinct; cancellation stays reachable. | Existing-prop zero-option component/browser fixture satisfies #66. Do not claim successful-empty query from default []. Actual authoritative ready-empty query evidence belongs to the separate integration issue. |
| Error | **Unavailable as an authoritative request state from current props.** No guessed permission/missing-object diagnosis. | Prerequisite separately tests destination-query error, preview error and mutation error with real retry ownership. Query retry is GET only; failed preview never authorizes fallback grade; uncertain mutation never auto-retries. |

Default/hover/focus/selected/disabled distinctions also apply in light/dark and forced colors. When a state is unavailable because of missing wiring, mark it **not exposed by the existing props; tracked in the separate integration issue**, not passed and not a #66 closure blocker. This is distinct from the readonly/invalid N/A reasons above. The actual destination-query, preview-query and mutation loading/error/retry states remain mandatory evidence for that integration issue. No CSS-class-presence-only evidence suffices for the applicable #66 presentation states.

## 8. Playwright-only evidence: separate completion lanes

All browser verification uses fresh Playwright-owned isolated Chromium and a disposable profile. No existing/default browser, connectOverCDP/other CDP attachment, user profile, OS/native input, SendInput, AppActivate, HWND automation, native dialog or external password-manager operation. Native Windows IME/candidate UI is outside automation; any composition protection is tested by explicitly labelled Playwright synthetic composition/DOM events. No new text field exists here, so new text-entry IME coverage is N/A. Native OS surfaces are non-blocking untested limitations, never claimed verified.

Actual 200% requires Playwright chromium.launchPersistentContext with a disposable profile and disposable test-only extension: chrome.tabs.setZoom(tabId,2), then an independent chrome.tabs.getZoom(tabId) result equal to 2. Record tested tab, before/after CSS viewport/DPR and screenshots; assert 1 when resetting. CSS zoom/transform, deviceScaleFactor or a halved viewport is not equivalent. The extension is a harness asset, not a product dependency. Use page.emulateMedia({forcedColors:'active'}) rather than Windows setting changes.

Matrix: 1280×720, 1440×900, 1920×1080 × light/dark × 100%/verified 200% = 12 environments, plus forced-colors at both zoom levels. Include long Korean source/destination names, many native options, move equal/increase/decrease, copy count, no options/no selection, close/cancel and L2 supplied-prop states. Check ≥36px targets, text contrast ≥4.5:1 (large ≥3:1), active boundaries/focus ≥3:1, wrapping and reachability. Native selection/keyboard actions use Playwright, never OS input.

**#66 evidence lane:** a browser harness rendering the actual two components with documented existing props is sufficient for supplied preview/grade/result, empty destination, cancellation, labels, layout and applicable state/accessibility checks. Pair it with component regression tests and the measured Chromium matrix above. Preserve existing relocation-dialog and preview/acl-audit behavioral assertions affected by the presentation change. Do not alter unrelated tree-destinations or screen-wiring assertions to hide their existing missing connections. Actual App/backend observations may be recorded separately, but their absent transport is not a condition for finishing this design issue.

**Separate integration-issue evidence lane:** after its official SRS/scope registration and implementation, require actual tree-context App paths for real preview/out-of-order responses, destination and query loading/error/retry, exact root/directory mapping, safe L1/L2 transitions, awaited mutation/persisted outcomes, mandatory result names/counts, persistent notice/focus and refresh failure separation. These are that issue's completion conditions and are neither authorized code changes nor closure prerequisites for #66. Server move/copy/privacy/collision tests help verify backend semantics but cannot replace its missing UI transport evidence.

Close only the Playwright-owned context. Forced cleanup requires proven runner-created PID and parent/child ownership; never kill node.exe/nodex.exe/Chromium by process name or terminate unrelated servers/browsers. Unknown ownership means no termination.

## 9. Minimal handoff and ownership of remaining work

Sol medium may now implement only the two components' existing-prop newspaper presentation, exact strings and accessible geometry, with tests written red before behavior changes. Independent Sol checks this document, original issue/SRS, diff and component/browser-harness computed-style/keyboard evidence. Passing that bounded work plus explicitly recording the separate functional defects completes #66; do not keep it open solely for absent integration evidence.

Before any App/client/query/async/result/parent-focus changes, root must arrange the official SRS requirement/refinement and separate integration issue. That work must adopt §5's non-autoexecuting outer transition and §6's mandatory resolved-name feedback, and choose the bounded L2 surface/lock API without guessing at shared ConfirmGate behavior. Astra has not created or modified SRS/GitHub here.

Remaining **integration-issue** work: missing product preview/grade/result/query/async connections, relocation recount/locking contract and its unsafe raw open-L1 transition, and missing resolved-name notice transport. Root eligibility/hierarchy/search/undo remain separately scoped limitations. These do not block #66 once its bounded presentation and honest evidence are complete. #66 closure makes no claim that absent product integration or all related SRS ACs are implemented/verified; their obligations remain with the separately scoped work. Do not mark SRS ACs checked from fixture evidence of data transport that does not exist. No instruction here waives an existing SRS contract or authorizes new endpoints/policies.
