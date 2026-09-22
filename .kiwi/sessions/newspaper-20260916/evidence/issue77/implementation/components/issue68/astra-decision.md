# Issue 68 — group roster presentation and separate integration work

Decision owner: Astra; re-audited 2026-09-18. Sol medium implements and a separate Sol reviewer verifies. Supporting design reference only: docs/spec/ remains requirements/evidence authority. This document revision does not implement code/tests, mutate SRS, create/edit GitHub issues or claim verification.

## 1. Live scope, source contracts and independent completion

Live #68 is the independently completable GroupRoster design unit: group table, system badges, member-search/add presentation, deletion appearance, keyboard/permissions/error coverage and wrapped members. Additional API/function connections require SRS and separate scope first.

**Withdraw the earlier #68 authorization for App/AppShell/query/Promise adapters, shared PrincipalPicker configuration, real member-add/delete lifecycle, L3 impact transport and post-response parent focus.** These now have explicit integration owners: [#81](https://github.com/ice3x2/DocuLight/issues/81) / IR-PRINCIPAL-003 for group query/member addition/user-only picker/B1 and their lifecycle; [#82](https://github.com/ice3x2/DocuLight/issues/82) / IR-PRINCIPAL-004 for B2/group-delete L3/transaction and deletion focus. #68 closes after current-prop presentation, scoped styles/tests, an actual component-bundle Playwright harness including mandatory production AppShell role gating, the owner mapping in §8 and independent review pass. It does not wait for #81/#82 implementation, verification or closure; its closure does not claim full membership/deletion functionality or complete their SRS ACs.

Contracts re-read:
- FR-PRINCIPAL-001 implemented/evolving: group/member management is superuser-only; other roles do not get its settings category.
- CON-PRINCIPAL-002 verified/stable: both system groups cannot be deleted or renamed.
- FR-PRINCIPAL-002 verified/stable: deleting an ordinary group cascades its ACL entries in one transaction; user accounts are not deleted.
- DR-PRINCIPAL-002 implemented/stable: groups contain users, not nested groups.
- CON-PRINCIPAL-006 implemented/stable: use the one PrincipalPicker; no duplicate fetch/filter/search implementation in GroupRoster.
- FR-CONFIRM-006 AC-5 assigns group deletion to L3; FR-CONFIRM-001 owns L3 execution semantics. FR-CONFIRM-004 explicitly includes group deletion in its numeric-refresh notes. Member removal's L1 grade is FR-CONFIRM-006 AC-8, with L1 outcome/undo semantics owned by FR-CONFIRM-001.
- IR-SHELL-002 AC-6 owns the existing instance category gate. IR-SHELL-006 AC-5/7/8/9/10 own input/composition, states, contrast, readable lists and real browser/zoom/role evidence.

Current facts:
- GroupRoster has groups?: RosterGroup[], onRemove?(groupId):void and onAddMember?(groupId,userId):void. A group supplies id, name, system and members[]; no query/outcome/impact/membership-capability prop.
- Current system rows have no delete button; ordinary rows directly call onRemove with no confirmation. That direct execution conflicts with the L3 requirement.
- Current PrincipalPicker supports scope/onPick/onSelectionInvalidated and its own threshold/loading/error/ready rendering, not a user-only option. GroupRoster currently passes group:{id} and forwards row.id. It must not gain a local search implementation.
- App's existing add/delete callbacks swallow failures and refresh; AppShell forwards void results. Neither component receives a reliable mutation result.
- Existing roster/member/delete routes enforce superuser authority; the current generic response does not provide a typed business failure or exact group-delete impact. System-group immutability is real; a blanket actor-equals-target prohibition is not.
- Existing roster.test.tsx checks table/category/system-delete absence, but also asserts unsafe direct ordinary deletion. That assertion describes the current defect, not permission to override FR-CONFIRM-006.

## 2. Allowed #68 edits and safe deletion decision

Allowed product files: GroupRoster.tsx and its scoped stylesheet only, with focused tests/browser-harness assets. Preserve current public props and callback parameter shapes. Reuse existing shared components and the existing PrincipalPicker unchanged; do not edit App/AppShell/client/query/server/shared-picker/shared-confirmation implementation under this issue.

**Safe deletion presentation is achievable from existing props and is required now:**

- For system=true, preserve the existing **absence of a delete button** and show the system badge plus readable adjacent explanation. No rename control is added.
- For system=false, retain a visible group-named deletion affordance as a genuinely disabled button with no execution handler attached: accessible name {group.name} 삭제, visible label 삭제, adjacent explanation 삭제 확인 기능이 연결되지 않아 여기서 삭제할 수 없습니다.
- Even when onRemove is supplied, no GroupRoster interaction invokes it until a separately specified and implemented L3 handoff exists. Do not add an allow-delete prop, generic Yes/No gate, fabricated count, hardcoded DELETE token or an unreviewed new L3 path under #68.
- This is a local presentation safety restriction under the existing L3 requirement, not removal/weakening of backend delete capability or a claim that ordinary groups are inherently immutable. Preserve the optional onRemove public signature for later integration; no new callback/server feature is added.
- First write a failing test asserting zero onRemove calls for ordinary group button pointer/keyboard/programmatic event attempts with callback present. Preserve system-button absence tests. Replace the old direct-one-click-success expectation because it conflicts with governing L3; record the requirement-based correction rather than claiming that changing the test proves full deletion.
- A disabled control's explanation must be readable without hovering or focusing the disabled button. Do not rely on a disabled tooltip.

Member selection is only the existing callback transport: existing current user candidate → onAddMember(group.id,user.id), without claiming a POST or successful membership. A local row.kind==='user' guard in the existing onPick callback is permitted as a test-first enforcement of the already typed user-ID boundary and DR-PRINCIPAL-002; it does not add a user-only search mode or filter/fetch a different result set. A group-kind candidate must never be passed as userId. No shared-picker modification, new membership policy, current-member disabling, asynchronous duplicate lock or success/error toast is introduced here.

When onAddMember is absent, show 멤버 추가 기능을 사용할 수 없습니다. rather than a picker that appears to execute a no-op. When present, retain the existing shared picker placement/scope and supported callbacks. system:boolean alone must not invent a permanent membership-edit prohibition or a default-versus-superuser subtype policy. Existing supported user-selection callback behavior is preserved; precise B1 capability/effective membership remains separately owned.

## 3. Exact UTF-8 text, layout and data privacy

Use UTF-8 for all reads/writes (PowerShell: Get-Content -Encoding UTF8); do not copy locale-decoded mojibake into source. Preserve these exact strings:

| Purpose | Text |
| --- | --- |
| Caption / category | 그룹 관리 |
| Columns | 이름 / 멤버 / 멤버 추가 / 삭제 |
| System badge | 시스템 그룹 |
| System immutability explanation | 시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다. |
| Ordinary delete unavailable | 삭제 확인 기능이 연결되지 않아 여기서 삭제할 수 없습니다. |
| Add callback unavailable | 멤버 추가 기능을 사용할 수 없습니다. |
| Group-specific search context | {group.name}의 멤버 추가 |
| No supplied groups | 표시할 그룹 항목이 없습니다. |
| No supplied members | 제공된 멤버 항목이 없습니다. |
| System membership qualification | 시스템 그룹의 멤버십은 해당 관리 규칙을 따릅니다. |
| Invalid member-kind local notice, if selection reaches callback | 그룹은 멤버로 추가할 수 없습니다. |

Search labels, states and badges are owned by the existing PrincipalPicker: do not duplicate or redefine its minimum query/result cap/privacy/status text in GroupRoster. Its neutral search badge 비활성 is not the administrative roster's 정지 policy; do not merge those mappings.

Stay within the existing #61 right pane; no page/nested ordinary modal or parent geometry edit. Caption 18/26px sans 600; header 13/20px 600; body 14/22px; help 12/18px. Use shared app-surface header, document-surface rows, subtle borders, minimum row height 40px, cell padding 8px vertical/12px horizontal. Group/member names wrap naturally with overflow-wrap:anywhere where necessary.

Render supplied members as a semantic list of plain readable names with modest 4px/8px gaps; they are not removable chips. Preserve supplied order/stable IDs and all supplied members. Do not add counts claiming effective/full membership, pagination/search/virtualization, email, creation time, superuser-role badge or other absent metadata. Empty supplied members is not proof of no effective members, especially for default.

A named local horizontal scroll container may hold the wide table when picker/action columns cannot fit. It must shrink within the pane, not widen the modal; vertical content and last row remain reachable through the existing content scroll. Do not add an unconditional keyboard stop to a non-overflowing wrapper or trap Tab. Long explanations are visible inline, not tooltip-only.

System groups remain visible. Badge derives only from supplied system. Do not branch on displayed name/client hardcoded IDs to distinguish default/superuser membership. Display supplied system members as supplied, without claiming a complete effective set, alongside the qualification above. Missing B1 projection does not justify invented members, hidden account lookup or a blanket ban on system ACL revocation.

No group multi-selection/checkbox/bulk operation is added. Shared picker selection identifies a candidate for the displayed group, not a selected group for deletion. A group's name may identify its own labelled search region using existing wrapper semantics without reimplementing the input or changing shared-picker props.

## 4. Existing shared search: permitted evidence and limits

Reuse the actual exported PrincipalPicker with the existing group:{id} scope and no new configuration. Preserve its two-character boundary, maximum 20 combined server results, returned order/status labels, and current keyboard/composition behavior. Do not implement user-only result filtering, member exclusion or fetchPrincipals inside GroupRoster.

The harness can intercept the existing search request with clearly labelled fixture responses to exercise its **already implemented** loading/empty/error/retry UI and keyboard selection. This is real component-browser rendering with a simulated read response, not proof of a real membership POST or live server privacy. Use same-name users, a group-kind decoy, supported account statuses and many results. Assert current scope and exact selected user/group target IDs. A local kind guard blocks the group-kind callback, but does not claim the shared list is user-only; configuring a user-only list remains separate integration work.

Check that composing Enter never forwards onAddMember or submits an outer form. Use Playwright synthetic composition/input/Enter events and the actual existing picker code; do not author a new shared composition handler here. If that shared behavior fails, report/route the defect to its existing owner rather than silently changing PrincipalPicker in #68.

Do not claim an existing-user selection succeeded on the server because the void callback ran. No local optimistic member row, spinner timed around a void callback, duplicate-in-flight lock, joined-member count or mutation retry. Correct callback dispatch is the #68 component behavior; actual result/lifetime ownership belongs to the separate integration issue.

## 5. Full ten-state matrix

| State | #68 applicability | Required evidence / separate owner |
| --- | --- | --- |
| Default | Supplied group/member table, system badge/reasons and existing shared search where callback available. | Production component-bundle text/semantic/computed-style/geometry screenshots, including many wrapped members. |
| Hover | Shared search/results and available controls use existing hover; ordinary deletion remains truly disabled. | Playwright hover and bounds/contrast; no enabled appearance for unavailable deletion or tooltip-only explanation. |
| Focus | Picker input/results/other existing controls and overflow access preserve visible 2px ring + 2px separation. Disabled delete does not become a fake tab stop. | Tab/Shift+Tab, cmdk keyboard, focus bounds and no clipping/row jumps. Post-server-response focus is separate integration work. |
| Selected | Existing picker candidate selection/active-descendant only; no row/group-selection model. | Arrow/Home/End/Enter, accessible selected candidate and actual ID callback. Not a completed membership claim. |
| Disabled | Ordinary delete disabled with no handler, even with onRemove present. System delete absent. Missing add handler has unavailable presentation. | Zero remove calls from pointer/keyboard/event attempts, no system delete, persistent explanations reachable independently of disabled buttons. No invented pending mutation disables. |
| Readonly | Plain member/name/system metadata is selectable information. N/A as a readonly form field; no removable chips or readonly input is introduced. | DOM semantics, readability/selection and no fabricated membership editor. |
| Invalid | No new local text-validation policy. Shared below-threshold search remains its existing neutral hint; group-kind callback is locally rejected with the exact existing-contract explanation. | No request below shared threshold, zero member callback for group-kind candidate, no fabricated aria-invalid/server error. |
| Loading | Existing PrincipalPicker read-loading is observable; group-query/add/delete loading is not supplied. | Delayed search fixture tests existing read UI. Record group/mutation loading as separately owned, not inferred from groups=[] and not a #68 closure blocker. |
| Empty | No supplied group/member rows and shared zero-result search are distinct. | All prop combinations with truthful supplied-data wording and retained controls; group-query success-empty requires separate state contract. |
| Error | Existing PrincipalPicker search error/retry is observable. Group-query/member-add/delete error/outcome is not supplied. | Failed search fixture plus exact-scope retry; record mutation/group-query errors for separate integration. No guessed HTTP reason or timer-based success. |

Apply the matrix to light/dark and forced colors. Readonly and unavailable network states have the specific reasons above; they are neither silently passed nor additional blockers for independent #68 closure.

## 6. Required real-browser role fixtures and safety

In **every one of the 12 environments**, the harness renders the production AppShell and actual settings category surface with three explicit viewer fixtures: superuser, ordinary non-superuser, and non-superuser workspace manager. Open settings using its real trigger. Assert 그룹 관리 is visible/reachable for superuser, select it and inspect the real GroupRoster; assert the category is absent from DOM/accessibility tree for both other fixtures. Do not copy the category list or replace it with a hand-written gate. No AppShell source edit, login, API authorization or new role prop is needed.

Record fixture identity, viewport/theme/zoom readings, category assertions and screenshots. Focused settings-category tests supplement but do not replace those mandatory browser assertions. They prove production gating with supplied viewer props, not authenticated backend authorization. Actual role loss and privileged cache cleanup are separate integration evidence.

All browser checks use **fresh Playwright-owned isolated Chromium**. No existing/default browser/profile, connectOverCDP/other CDP attach, OS/native input or window automation, SendInput, AppActivate, HWND control, native candidate/permission/password-manager/autofill UI. Use Playwright locators/keyboard, DOM events/inspection and media emulation only.

True 200% uses Playwright chromium.launchPersistentContext with a disposable user-data directory and disposable test-only extension. Call chrome.tabs.setZoom(tabId,2); perform a **separate read-only** chrome.tabs.getZoom(tabId) and assert 2 for the tested tab. Reset with setZoom(tabId,1), then separately read getZoom and assert 1. Record pre/post CSS viewport/DPR and screenshots. CSS zoom/transform, deviceScaleFactor, half-width viewport or native zoom keys are not substitutes.

Use same-process programmatic Vite for the component bundle where practical so the harness owns server startup/shutdown directly. It is a harness choice, not a product build/dependency change. Never bind to or reuse an unrelated existing service without identifying it. Close server/context handles cleanly. Forced cleanup requires known runner-created PID and parent/child ownership; terminate only owned test processes. No broad node.exe/nodex.exe/Chromium name-based kill and no unrelated process termination. Unknown ownership means no forced termination.

Native Windows IME/candidate windows, physical keyboard layouts and password-manager/autofill UI are **non-blocking untested limitations**. Only labelled synthetic composition/DOM/paste/autofill-style events and resulting values/callbacks are automatable here. Do not claim those events exercised native UI, and do not add OS automation to fill a perceived evidence gap. Separate project-wide manual acceptance is not marked complete.

## 7. Geometry, contrast and 12-environment plan

1280×720, 1440×900, 1920×1080 × light/dark × 100%/verified 200% = 12 environments. Each includes the three role fixtures in §6. Add forced-colors active at 100% and verified 200% with page.emulateMedia({forcedColors:'active'}).

For superuser render mixed ordinary/system rows, long Korean/Latin group names, many wrapped members, multiple real shared pickers, empty supplied rows, missing callbacks, shared search threshold/loading/empty/error/selected/focus and disabled deletion. Test first/middle/last visible search option and first/last group context. No L3 preview fixture is claimed as a real deletion capability.

Within the **same mounted** component tree perform representative width changes and 100→200→100 zoom transitions; no reload to conceal lost query/target/focus. Assert wrapping, scroll reachability, current group/search scope, stable selected user ID and no unintended callback during resize/zoom. Category labels, system explanations and disabled-delete reasons remain readable.

Use approved palette roles only. Normal text ≥4.5:1, large text ≥3:1, active boundaries/focus ≥3:1; no whole-row opacity. Controls ≥36px, radius 4px; focus 2px outline + 2px separation with room inside scroll bounds. In forced colors permit Canvas/CanvasText/ButtonText/Highlight and real borders/outlines; do not globally disable forced-color adjustment or depend on colored fills alone. Disabled controls may use disabled tokens but adjacent explanation/member text remains readable.

Evidence includes actual component-bundle computed styles/geometry, screenshots, keyboard/focus results, role-category assertions and exact callback counts/IDs. No lookalike HTML, class/import-only PASS or fixture-only claim of a persisted membership/deletion. Shared search interception is explicitly labelled; its endpoint request scope is checked.

## 8. Registered integration owners and exact defect mapping

The follow-up requirements are registered as planned: IR-PRINCIPAL-003 and IR-PRINCIPAL-004 in docs/spec/16.principal.srs.md. Their live issues explicitly refer back to #68 and preserve its presentation. This section records ownership; it neither creates nor implements those requirements. **Recording these owners is sufficient to dispose of #68's separated functional defects; completing #81/#82 is not a #68 closure prerequisite.**

| Separated item | One authoritative follow-up owner | Exact requirement coverage |
| --- | --- | --- |
| Group-query loading/error/ready and real read retry | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-1: actual query state, current successful empty, stale privileged rows/action handling. |
| Real member-add Promise/result, duplicate guard and refresh separation | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-4/5: captured group/user/generation, same-group guard, independent groups, accepted POST versus failed roster refresh. |
| Shared user-only picker and existing-member exclusion | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-2/3: shared threshold/cap/order/privacy, user-only selection, supplied-member IDs, stale/rejected/group candidates blocked. |
| B1 authoritative subtype/capability/effective-member projection | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-7/8: default automatic versus superuser-managed membership without client name/ID inference, completeness and existing invariants. |
| Member/query stale-result ownership, non-stolen focus and role visibility | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-1/6/9: obsolete generation cannot repaint/focus another row, role loss handling, superuser-only privileged surface. |
| Actual group/member-add integration browser/server evidence | [#81](https://github.com/ice3x2/DocuLight/issues/81) — IR-PRINCIPAL-003 | AC-10: strict TDD, regressions and actual App Playwright evidence beyond #68's supplied-prop harness. |
| B2 authoritative complete delete-impact projection | [#82](https://github.com/ice3x2/DocuLight/issues/82) — IR-PRINCIPAL-004 | AC-1/2: fresh group identity/system flag/complete member count/full ACL count and server authorization. |
| Exact-name L3, count/name/identity changes and execution lock | [#82](https://github.com/ice3x2/DocuLight/issues/82) — IR-PRINCIPAL-004 | AC-3..6: L3 even at zero ACLs, required consequence text, fresh preview/consent, zero execution for cancel/wrong token. |
| Actual atomic group deletion and Promise/result/refresh separation | [#82](https://github.com/ice3x2/DocuLight/issues/82) — IR-PRINCIPAL-004 | AC-7/8: one existing group+ACL transaction, accounts retained, no optimistic removal/retry/undo reconstruction. |
| Post-deletion focus | [#82](https://github.com/ice3x2/DocuLight/issues/82) — IR-PRINCIPAL-004 | AC-9: stable-ID next/previous/heading only if focus belonged to removed action; no focus theft. |
| Actual delete/L3 integration browser/transaction evidence | [#82](https://github.com/ice3x2/DocuLight/issues/82) — IR-PRINCIPAL-004 | AC-10: strict TDD, atomic server regression and actual App Playwright evidence. |

Group creation/rename, member removal/undo, invitations and batch operations are **non-goals**, not orphaned #68 defects or implied work for #81/#82. Their published scopes exclude them. Do not assign them falsely to either owner or add them to #68 closure; a future request needs its own covering SRS and scoped issue. All functional items actually separated from #68 above have exactly one owner; query/member focus is #81 and deletion-result focus is #82.

Exact server semantics stay unchanged: ordinary-group deletion and group ACL removal are atomic; system groups are immutable; group membership admits users only; current authentication/role/last-active-superuser checks apply. A client cannot authorize itself by receiving a row or returning a callback. No new API, policy, schema or product dependency is introduced under #68.

Full query/member/user-only/B1 evidence belongs to #81 / IR-PRINCIPAL-003; delete-impact/L3/transaction/focus/B2 evidence belongs to #82 / IR-PRINCIPAL-004. Do not describe the safe disabled button as completed L3 deletion, or fixture callback dispatch as completed membership. Their planned/unfinished state does not block the independently complete #68 presentation unit.

## 9. Minimal Sol handoff and completion

1. Preserve existing props/callback signatures. Write red for the unsafe ordinary one-click delete path and local group-kind callback boundary, then implement only safe non-executable deletion and existing-prop presentation; no new server/callback feature.
2. Apply exact UTF-8 labels, system badge/reasons and wrapping list/table geometry. Reuse PrincipalPicker as-is; preserve user-selection callback dispatch and its existing scoped/keyboard behavior.
3. Run focused roster/shared-picker/gating regressions. Preserve system-delete absence. Correct the old one-click-success expectation with explicit FR-CONFIRM-006 trace; do not weaken a genuine L3/authorization regression to pass styling.
4. Run the actual production component-bundle Playwright harness with all 12 environment/three-role checks, same-mount resize/zoom, forced colors, search fixtures and owned cleanup. No new product integration is needed for that harness.
5. Include §8's exact #81 / IR-PRINCIPAL-003 and #82 / IR-PRINCIPAL-004 mappings in the defect/closure report, obtain independent review and close #68 when its bounded presentation/evidence is complete. No #81/#82 implementation or status promotion is required to close #68.

#68 completion is **not dependent on #81 or #82 implementation, verification, closure or native OS verification**. Its defect ownership is explicitly recorded above. #68 does not verify IR-PRINCIPAL-003/004 or all FR-PRINCIPAL/confirmation ACs, lift deletion restrictions, invent membership capability or authorize integration changes inside the presentation issue. Only this decision document is changed by the present task.
