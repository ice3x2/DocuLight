# Issue 67 — user management and signup-approval presentation

Decision owner: Astra; re-audited 2026-09-18 under delegated design ownership. Implementation owner: Sol medium; independent review: a different Sol reviewer. This is a supporting implementation reference. Requirements and completion evidence remain in docs/spec/. This revision makes no product/test/SRS/GitHub change and claims no executed verification.

## 1. Authority, actual baseline and independent closure

Live #67 names only UserRoster.tsx and SignupApproval.tsx, defines an independently completable design unit, and requires SRS plus separately scoped work before additional API/function connections. Accordingly, **the previous authorization to implement App/AppShell state adapters, Promise lifecycle, server outcome handling and live integration under #67 is withdrawn**.

#67 may complete after existing-prop presentation, scoped styles/component tests, an actual component-bundle Playwright Chromium harness, applicable state/accessibility evidence and independent review pass, with missing functionality recorded separately. It does not wait for a new integration requirement/issue to be implemented. Harness evidence renders the real exported components and records supplied props; it is not proof that the product already supplies asynchronous state or that a callback produced a server mutation.

Relevant current contracts:
- FR-PRINCIPAL-009 implemented/stable: active/pending/suspended/rejected appear as 활성/대기/정지/거절; do not collapse or discard states.
- IR-SHELL-002 verified/evolving AC-6: 사용자 관리 and 가입 승인 are existing superuser-only categories.
- FR-AUTH-003 verified/evolving: direct registration belongs inside 사용자 관리 after authentication; no new category/screen and no non-superuser access.
- FR-AUTH-002 verified/stable: reopen rejected to pending on the same account; do not directly approve rejected or create a replacement.
- IR-SHELL-006 AC-5/7/8/9/10 own shared label/error/IME handling, applicable UI states, measured contrast, readable list presentation and the actual browser/zoom/role matrix. They apply to this presentation handoff alongside the four issue-declared requirements above.
- FR-CONFIRM-006 AC-8 assigns signup rejection to L1 (no pre-confirmation). FR-CONFIRM-001 owns what L1 means, including its post-action undo toast. Keep grade assignment and L1 outcome/undo ownership separate. The existing server protects the last active superuser; a design-only fixture does not verify all of these broader operation contracts.

Current code facts:
- UserRoster receives users and optional onRegister({name,password}):void. It displays id/name/status, masks the password, enables registration only when both raw strings are nonempty, invokes the callback and immediately clears local fields.
- SignupApproval receives users, optional signupMode and optional void approve/reopen/status callbacks. It filters pending/rejected locally, displays their counts, preserves all supplied order and uses the original stable user ID in callbacks.
- App catches register/queue mutation errors and refreshes the roster; AppShell forwards void callbacks. Neither component receives authoritative loading/error/success or a mutation Promise.
- Existing client/server register returns 201 {id}; approve/reopen/status already have endpoints. The routes enforce authenticated superuser access. No general actor-equals-target prohibition exists; do not invent one from the last-active-superuser rule.
- Existing tests include roster.test.tsx, user-roster-register.test.tsx, signup-approval.test.tsx and settings-categories.test.tsx. Preserve their underlying state labels, callback payloads, raw-input and category-gate contracts.

## 2. Exact allowed implementation boundary

Allowed: the two named components, their scoped CSS, focused component tests and browser-harness fixtures. Reuse #49 visual states/controls and #61's available content width/scroll geometry without editing the shell. Preserve public prop types and callback payloads. No new query/outcome/role prop or Promise adapter is introduced under this issue.

Not allowed under #67: App/AppShell/client/query edits, server endpoint/policy/schema changes, a new auth/cache framework, asynchronous request ownership, pending/success/error fabrication, undo wiring, parent post-response focus restoration, new administrator functions or new settings categories. Before that work, root must register/refine the covering SRS and create a separately scoped integration issue. This decision does not create either.

Local input and callback safeguards using existing props remain testable here: raw-empty submission prevention, optional-callback availability, exact single dispatch per deliberate activation, label/description association, masked password and composition-Enter protection. Establish red first for any local behavior change. A component may not interpret a void return as server success or add timers that mimic pending. Do not clear fields or show success differently based on an invented result; post-success clearing/failure retention needs the separate result handoff.

No uncontrolled new Enter-submit path is introduced merely by changing visual markup. The baseline registration button is type=button. Preserve that explicit action; if a form wrapper is used for semantics, prevent default submission unless it is the same deliberately specified action, and do not add an extra submit/click double-dispatch path. Enter while composing in either input must not dispatch registration or queue actions. Deliberate registration uses the actual button after composition; do not demand native IME operation to prove this component contract.

If onRegister is absent, the registration action is unavailable: keep it disabled and retain input; never invoke an absent function or clear credentials as if an action happened. For queue actions preserve the current optional-handler behavior: no approve/reject/reopen action is offered when its corresponding callback is absent. This is callback availability, not a newly inferred security role.

## 3. Layout, exact UTF-8 vocabulary and privacy

Read/write UTF-8 explicitly (PowerShell: Get-Content -Encoding UTF8). Preserve the exact Korean strings below. Do not copy mojibake output, replace Hangul with question marks or romanize the UI.

Remain in the existing settings content pane. No new page, nested ordinary modal or broad settings-layout edit. Heading/caption 18/26px sans 600; shared app-surface table header, document-surface rows, subtle rules; text 14/22px, header/labels 13/20px 600, help 12/18px; rows minimum 40px with natural multiline height and 8px vertical/12px horizontal cell padding. Form maximum 560px within available width, controls minimum 36px high/radius 4px, field gap 20px and section gap 24px. Actions wrap with at least 8px gap.

Names wrap fully and remain selectable. Do not move complete names into hover-only tooltips, fade whole rows or add extra metadata columns. Roster retains 이름/상태. Approval panels retain 이름/조작. Use stable user ID keys and preserve supplied order; no sorting/filter/search/pagination/virtualization/bulk controls are added.

| Purpose | Exact UTF-8 text |
| --- | --- |
| Roster / approval heading | 사용자 관리 / 가입 승인 |
| Roster columns | 이름 / 상태 |
| Queue columns | 이름 / 조작 |
| active / pending | 활성 / 대기 |
| suspended / rejected | 정지 / 거절 |
| Registration section | 사용자 직접 등록 |
| Registration input labels | 새 사용자 이름 / 임시 비밀번호 |
| Registration action | 등록 |
| Optional-handler unavailable explanation | 등록 기능을 사용할 수 없습니다. |
| No supplied roster rows | 표시할 사용자 항목이 없습니다. |
| Queue tabs | 대기 중 (N) / 거절됨 (N) |
| Pending caption / rejected caption | 승인 대기 / 거절됨 |
| Queue actions | 승인 / 거절 / 재심사 |
| Empty-state accessible label | 빈 상태 안내 |
| Unknown-mode pending-empty | 승인 대기 중인 계정이 없습니다. |
| Rejected empty | 거절된 계정이 없습니다. |

Badges use exact text plus semantic roles: 활성 success; 대기 warning; 정지 neutral secondary text/border; 거절 danger. All remain readable; 정지 is never PrincipalPicker's neutral 비활성 and rejected users are never removed from the full roster. Status is information, not an editable selector.

RosterUser supplies only id/name/status. No email, group, join date, grantor, superuser badge, password, account biography or permission inference is added. Do not replace UserRoster with PrincipalPicker or fetch a separate roster to enrich presentation. Names already legitimately supplied to a privileged component may appear in its accessible action names, not in unrelated tooltip/data attributes or hidden panels.

The components do not own authentication/role gates. Preserve existing IR-SHELL-002/FR-AUTH-003 category-gate regression; do not add a component-local fake role check. **Actual browser role-gate evidence is mandatory for #67:** the isolated Playwright component-bundle harness renders the production AppShell and its real settings categories with explicit viewer fixtures for superuser=true and superuser=false, opens settings, and asserts that 사용자 관리 and 가입 승인 are both present only in the superuser case. Include a non-superuser workspace-manager fixture so workspace administration cannot accidentally imply instance administration. Use production exports, not a copied category list or a lookalike conditional wrapper. Record these as real browser rendering of production gating with supplied viewer props, not a real login/API authorization test. No App/AppShell implementation edit is needed. Real permission loss, privileged-cache cleanup and direct endpoint denial remain separate integration/security evidence.

## 4. Registration input contract and synthetic composition

Keep name and password inside UserRoster even when users is empty. Use native labelled inputs with stable IDs and appropriate DOM autocomplete purpose: username and new-password. Password remains type=password; no password reveal, plaintext confirmation, copy/export or password-manager extension is added. The label 임시 비밀번호 is retained but must not imply automatic expiry or forced first-login reset, neither of which is supplied.

Preserve raw input semantics: name !== '' and password !== ''. Do not trim, normalize, lowercase, impose email format, password length/complexity, confirmation fields or signup-mode conditions. Public signupMode does not govern this existing direct-registration operation.

No invalid fields are painted on initial render. Empty input disables registration and sends no callback. The original nonempty rule does not provide a server field-error taxonomy; do not invent “name exists” or a password-specific error from generic failure. Adding a new validation policy or server-error map requires separate SRS/work scope.

Test observable native/React input behavior through Playwright fill, DOM input/change/paste/autofill-style events and keyboard selection. For synthetic paste, assert resulting controlled value and callback payload; a synthetic event alone does not prove that the browser pasted. DOM-autofill-style assertions prove state synchronization only, not a real password-manager/autofill UI. Use fixture credentials and mask password fields in screenshots; no credentials in traces, console logs, URLs, notices, localStorage or serialized harness artifacts.

Composition evidence: synthetic compositionstart/update/end and input events with Korean text, plus composing Enter/isComposing/229 as appropriate to the actual handler. Assert zero registration/row callbacks during composition and correct retained Korean value; then deliberate button activation sends exactly the entered raw name/password once. If the markup has no form-submission path, assert that fact and the zero-dispatch behavior instead of adding a form merely to create a test target. This test uses existing component props and does not need App/API integration.

The immediate field clearing after a void callback is a known baseline information-loss defect. Do not claim it means registration succeeded. Failure retention, accepted-201 clearing, real busy state and outcome focus belong to the separately specified Promise/result work in §7.

## 5. Approval tabs, mode copy and action gating

Preserve the existing Radix Tabs, initial pending tab and local selection. Counts are derived from supplied pending/rejected rows; N is the number in those supplied arrays, not proof that a roster request succeeded. A default empty array cannot be relabelled authoritative server-empty. Selected tab has selected surface, weight and 2px mark; keyboard focus is separate. Both tab labels must remain reachable, wrapping or scrolling their own strip when narrow.

Only pending rows expose supplied approval/rejection callbacks; only rejected rows expose supplied reopen. Active/suspended users appear in the full roster and do not enter either queue. A selected tab never changes an account's state itself. Accessible action names include the account name for disambiguation and callbacks receive its actual ID, never index or displayed text.

Use these existing mode-dependent messages only when the supplied pending array is empty:

| supplied signupMode | Exact text |
| --- | --- |
| open | 현재 자유 가입 모드라 승인 대기가 발생하지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다. |
| approval | 아직 들어온 가입 신청이 없습니다. |
| invite-only | 현재 슈퍼유저 직접 등록 모드라 가입 신청을 받지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다. |
| absent/unrecognized | 승인 대기 중인 계정이 없습니다. |

Do not infer why mode is absent, add a spinner or claim a mode-load error without its state prop. Existing pending/rejected rows remain visible and actionable under all supplied modes; changing signup mode does not rewrite historical queue states. The instance-settings sentence is guidance, not a new navigation link.

Approval/reopen preserve existing explicit actions. Rejection remains L1 with no new confirmation. Rejected rows do not gain direct approve: reopen calls onReopen(existingId), then a subsequently supplied pending row may be approved as a separate action. Do not create replacement accounts, suspension/status menus, user deletion, group assignment, superuser toggles, password reset or bulk operations.

The baseline has no result-bearing callbacks or rejection-undo receipt. **Do not implement or simulate successful rejection + 실행취소 under #67.** Record both requirements in the integration issue: FR-CONFIRM-006 AC-8 owns the rejection's L1 grade; FR-CONFIRM-001 owns the L1 outcome/undo-toast obligation. Use the existing reopen operation only after an authoritative reject success and appropriate current context. No fabricated toast, automatic row deletion or callback-spy claim of server success is allowed.

## 6. Complete state and accessibility matrix

| State | #67 applicability / treatment | Required component/browser evidence |
| --- | --- | --- |
| Default | Four-state roster, direct-registration fields, supplied queues and mode messages. | Actual component-bundle render, text equality, computed styles/geometry and long-name screenshots. |
| Hover | Registration and available queue actions/tabs show shared hover without layout movement. | Playwright hover with computed contrast/bounds and visible change. No OS popup is opened. |
| Focus | Inputs, buttons and tabs have visible 2px ring with 2px separation; no clipping. | Tab/Shift+Tab, tab arrow keys, focused node/name, ring contrast/bounds. Existing local tab focus is tested here; post-response parent focus is separate integration work. |
| Selected | Active Radix tab and ordinary text selection are distinct from focus/status. No row-selection model. | aria-selected/current panel, keyboard tab change, selected/focus combinations and no hidden-panel duplicate action access. |
| Disabled | Registration with an empty field or missing callback; optional queue actions are absent if their handlers are absent. | Native disabled state and zero callback from keyboard/click, readable adjacent reason. No fabricated mutation-pending disable interval. |
| Readonly | N/A as an editable-control readonly mode: status/name cells are plain selectable information, not disabled inputs. Password input is editable and masked, not readonly. | Correct DOM semantics, copy/selectable text and no invented readonly form field. |
| Invalid | Existing local raw-empty guard applies; neutral initial fields and disabled registration. No server-invalid state is supplied. | Empty name/password produce no callback; no invented initial aria-invalid or field-specific server error. Any new validation/error policy is separate scope. |
| Loading | Not exposed by current props. Do not turn users=[]/missing mode into loading or authoritative empty-query status. | Record absence as separate integration ownership, not passed and not a #67 closure blocker. Real delayed-request tests belong there. |
| Empty | Supplied zero rows, pending-zero/rejected-zero, known-mode copy and neutral unknown-mode fallback. | Actual component harness with each prop combination, retained registration, reachable tabs and preserved nonempty rows under every mode. |
| Error | No authoritative query/mutation error prop exists. No success/error inference from void callback. | Record roster-query, mode-query, registration and row-action errors as separate integration ownership. No fake error fixture passed off as product behavior. |

The component matrix is sufficient for #67 when applicable rows pass and non-applicable/separately-owned rows are honestly recorded. Loading/error and asynchronous outcome rows do not hold #67 open.

Use approved light/dark semantic tokens, no new palette. Normal readable text ≥4.5:1, large text ≥3:1, active borders/focus ≥3:1; do not lower actionable-row opacity. Long Korean/Latin names and mode messages wrap without hiding final actions. At short heights the existing settings content/local table scroll remains usable; no parent layout rewrite.

Forced colors: allow Canvas/CanvasText/ButtonText/Highlight with real borders/outlines and visible status labels; do not globally set forced-color-adjust:none. Selected tab, focused action and status meaning must remain distinguishable without color alone. Use Playwright forced-colors emulation, never native Windows settings automation.

## 7. Separately scoped integration work — not #67 closure conditions

Before implementing these changes, register/refine their official SRS coverage and create a separate issue. That integration requirement and issue must trace to **both FR-CONFIRM-006 (signup-rejection grade) and FR-CONFIRM-001 (L1 result/undo toast)**, as well as the applicable FR-AUTH-002/003, FR-PRINCIPAL-009, IR-SHELL-002 and IR-SHELL-006 AC-5/7/8/9/10. This document records requirements for that planning, not permission to edit App/AppShell/client/server now.

- Distinct roster and signup-mode query states with real retry. Mode failure must not erase an otherwise valid roster; default [] is not request success.
- Promise/outcome transport through existing App/AppShell callbacks; registration's actual 201 {id}, real approval/reopen/reject outcomes and safe failure. Post-success refresh failure remains a read failure and never triggers another write.
- Registration failure retains masked credentials and values; accepted registration clears the submitted generation only after success. Real pending/duplicate guards and API race ownership, not timers.
- Per-account mutation ownership, exact account ID across response/refresh, role/session invalidation and no stale response focus/data leak. Preserve existing superuser/last-active-superuser rules; do not invent an actor-equals-target ban.
- Rejection L1 outcome/undo via exact rejected ID and existing reopen endpoint, with actual success/failure/current-state checks. No account recreation or direct rejected→active shortcut.
- Parent focus restoration after real row removal/result, accepted-result statuses, and credential-clearing/retention behavior after actual server response.
- Real product composition/input/paste/autofill-style events through the existing UI to API payload, distinguished from #67's sufficient component-level synthetic input evidence.
- Actual API authorization, same-account transitions/default-group behavior, refresh-failure separation and concurrent-administrator races. Current endpoints have no expected-state revision field; stronger atomic preconditions or new policies require further SRS+issue scope before backend changes.

Known server metadata may support a specific safe last-active-superuser error, but it is not available as a typed component result today. Do not infer it from roster counts or add a message claiming a general self-action prohibition. Wider user status/offboarding/group screens remain owned by their existing work.

These are separate integration completion conditions. Their absence does not prohibit closing #67's bounded presentation work and does not make their underlying SRS obligations disappear.

## 8. Playwright-only execution and 12-environment evidence

All browser verification uses fresh **Playwright-owned isolated Chromium**. Launch a disposable context/profile; no existing/default browser, connectOverCDP/other CDP attachment, user-profile reuse, OS/native input/window control, SendInput, AppActivate, HWND automation or native browser/permission/password-manager UI. Use Playwright locators, page.keyboard, DOM inspection/events and media emulation only.

Actual 200%: Playwright chromium.launchPersistentContext with a disposable user-data directory and disposable test-only extension. Call chrome.tabs.setZoom(tabId,2); then perform a **separate read-only chrome.tabs.getZoom(tabId)** and assert 2 for the tested component-harness/product tab. On reset call setZoom(tabId,1); then a separate read-only getZoom and assert 1. Record tab identity, pre/post CSS viewport/DPR and screenshots. CSS zoom/transform, deviceScaleFactor, half-sized viewport or native zoom keys do not substitute. Extension files are disposable harness assets, not product dependencies or a user's browser installation.

Native Windows IME candidate windows, physical keyboard layouts, password-manager/autofill UI and OS dialogs are **non-blocking untested limitations**. Only synthetic composition/DOM/paste/autofill-style events and resulting values/callbacks can be automated here. Do not describe synthetic events as native IME/autofill verification. This boundary does not complete separate project-wide manual acceptance obligations.

Matrix: 1280×720, 1440×900, 1920×1080 × light/dark × 100%/verified 200% = 12 environments, plus forcedColors active at both scales using page.emulateMedia({forcedColors:'active'}). **In each of the 12 environments, render the production AppShell/settings surface with all three viewer fixtures: superuser, ordinary non-superuser and non-superuser workspace manager.** Open settings through its actual trigger; assert both 사용자 관리 and 가입 승인 visible/reachable for superuser and absent from the settings category DOM/accessibility tree for the other two. Capture fixture identity, viewport/theme/independent zoom reading, category assertions and screenshots. For the superuser fixture, select each category and inspect the actual component content; do not merely inspect the supplied role flag. This is mandatory browser evidence under IR-SHELL-006 AC-10/IR-SHELL-002 AC-6 and does not require login, an API or changes to AppShell.

Within that production-component bundle, also include four statuses, long Korean/Latin names, many supplied rows, both tabs, all known/unknown mode-empty cases, nonempty rows under every mode, valid/empty/missing-handler registration, input focus/selection and callback action gating. Resize/reset while the actual component bundle is mounted; state/value/focus should remain consistent. Screenshot password fields are masked even with fixture credentials. The readonly supplied rows still do not prove backend authentication/authorization; that distinct evidence remains integration-owned.

Evidence must include computed colors/contrast/geometry, last-row/form/action reachability, keyboard state/action counts and exact values/IDs without credential logging. Render the production source components via a browser bundle; do not replace them with hand-written lookalike HTML. A DOM class/import or callback spy alone is insufficient visual/server evidence, respectively.

Run focused existing roster/user-roster-register/signup-approval tests and existing settings-category gate regression relevant to this change. Focused tests supplement **but do not replace** the mandatory production AppShell role-fixture Playwright checks above. Actual login/API authorization evidence remains separate integration work; it is not required to render and test the existing production gate and does not justify editing parent code under #67. Preserve old assertions' behavior rather than weakening them to class checks.

After use close only the Playwright-owned context. Forced cleanup requires runner-created PID and parent/child ownership confirmation; terminate only owned test processes. No broad node.exe/nodex.exe/Chromium process-name kill, no unrelated server/browser termination. Unknown ownership means do not terminate.

## 9. Minimal implementation handoff and completion

Sol medium: (1) preserve existing props/payloads and write red tests for any local behavior change; (2) apply exact four-state labels, shared table/form/tab presentation, missing-handler availability and local composition-safe dispatch under IR-SHELL-006 AC-5/7/8/9/10; (3) run focused regressions and the actual component-bundle Playwright matrix, including mandatory production AppShell superuser/ordinary/workspace-manager category gates in all 12 environments; (4) record asynchronous wiring/privacy/outcome defects as separate work with FR-CONFIRM-006 and FR-CONFIRM-001 both traced for rejection/undo; (5) obtain independent review.

**#67 can close after those presentation conditions pass.** It does not require App/AppShell Promise/query adapters, actual account mutation/integration evidence, native IME/password-manager UI, or completion of a new issue. The separate integration issue must own its query/outcome/focus/product-input/API evidence. #67 closure does not promote all related SRS ACs or claim that void callbacks implement real server success, rejection undo or failure retention.

Only this design document is revised now. No implementation, tests, SRS mutation, GitHub issue creation/change or commit is performed. Any new API/policy/data field beyond the existing contracts requires official SRS and separately scoped work first.
