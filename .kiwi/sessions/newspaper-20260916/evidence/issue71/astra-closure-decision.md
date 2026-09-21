# Issue 71 — binding closure-evidence remediation

Decision: Astra, 2026-09-22, under delegated design authority. Sol medium authors/runs the remediation; a different Sol reviewer evaluates the resulting evidence. This is a design decision and execution contract, **not an independent verification, issue closure or SRS status change**. Only this document is authored in this task.

## 1. Authoritative checkout and existing evidence

Use `C:/Work/git/DocuLight2.0-wt-issue71-audit`, initially clean at **4cb4457b694f8ec286023f5406e7386cfb52be79**. Do not run against the stale main worktree. Initial working-file SHA-256 values read in this checkout:

| File | SHA-256 |
| --- | --- |
| packages/web/src/settings/InstanceSettings.tsx | 7B0EA7CA5663ABB11945901C3F37B899C5B14CB1DF46B9905A61ECB0C481E12C |
| packages/web/src/shell/AppShell.tsx | 928FDEDF8579488524BD735548714412747635658FABBCEDEF856B32247519C4 |

Read live #71, AGENTS.md, docs/spec/00.index.md, the current settings source, #71 design/implementation-verification/browser matrix, #87 design and green evidence, and #88 design/verification/final-independent-review. The current checkout's SRS records **FR-CONFIRM-024 (#87) and IR-SHELL-013 (#88) as verified/stable**. The original #71 report predates those integrations and says they were missing; retain it as historical evidence, not a description of the current checkout. Stale main-worktree MCP metadata is not used to judge this audit checkout.

Governing requirements are IR-SHELL-002 AC-6/7, DR-SHELL-001, IR-SHELL-006 AC-5/7/8/10, the five settings' existing policy requirements, REL-AUDIT-003, and the integrated FR-CONFIRM-024/IR-SHELL-013 contracts. #87/#88 evidence establishes its own reviewed scope; it does not replace the missing base-five-field or ordinary/workspace-manager browser matrix. Reuse prior evidence only with exact paths/hashes and an explicit scope/source comparison. New combined evidence records its actual checkout, built bundle and source hashes.

The reported audit items are accepted as evidence gaps: two Medium items concern missing browser-role coverage and unresolved native-versus-synthetic IME qualification; one Low item concerns incomplete state/five-field keyboard/contrast coverage. The following decision supplies the missing verification contract without creating settings keys, policies, defaults or APIs.

## 2. Binding IME disposition under the user override

**For #71 closure, Playwright synthetic composition/DOM evidence is the required automated acceptance route. Native Windows Korean IME candidate/commit UI is an explicitly unperformed, non-blocking limitation.** The user's Playwright-only/no-OS-automation instruction supersedes the older #71 checklist's requirement for native IME before closure. Do not call a synthetic event a native keystroke, a real candidate selection, or proof of a physical Korean keyboard layout. Do not mark a separate project-wide manual IME acceptance item complete from this decision.

Required checks on the actual integrated InstanceSettings DOM:

1. Cover **all four numeric text inputs**, one at a time. They are text inputs with decimal input mode; Korean composition may exist transiently even though a committed non-numeric value is invalid. Start from the real loaded baseline, dispatch compositionstart/update and the corresponding input/value changes through Playwright, and record field identity, value and active-element identity.
2. Dispatch a bubbling, cancelable Enter key event with `isComposing=true` from that actual focused field. Observe the event after the production React handler: assert `defaultPrevented` (or dispatchEvent returning false), unchanged form ownership/draft, no implicit submit, **zero PUT /api/settings and zero POST retention-impact** attributable to this Enter. Absence of writes alone is insufficient because an untrusted synthetic key has no native default action. The observed cancellation is the positive evidence that the production guard ran.
3. During active composition, blur/validation must not erase or prematurely reject unfinished input. After compositionend, committed invalid text followed by ordinary blur/explicit save must show the actual connected numeric error and issue no PUT. Then replace it with a valid domain value through ordinary Playwright input and deliberately activate Save with the keyboard; verify the intended request once. Do not create a new numeric normalization/range/integer rule to make the test pass.
4. On the real #87 L3 token input, exercise the same composing Enter cancellation, exact draft/token retention and zero PUT. End composition, enter the valid authoritative token and deliberately activate the real confirmation; verify the permitted request once. Use an owned real retention fixture, not a forged successful receipt. Existing #87 evidence may cover complementary server races; this check addresses the combined input surface.
5. With #88's real leave dialog open, dispatch a composing Enter through the focused safe/confirmation surface and assert no discard/navigation/save. Verify an ordinary deliberate non-composing action still works and cancellation preserves the same form/draft. Synthetic event injection is labelled; no OS candidate window is opened.

Run these composition cases at 1440×900 in both themes at 100% and verified 200% (four environments), in addition to the full 12-environment keyboard/state matrix below. If a guard fails, capture a meaningful failing assertion before a narrowly scoped existing-contract fix; do not drop the case or substitute a callback-only fixture.

Required report wording:

> Playwright synthetic composition and DOM-input checks passed for the four numeric settings inputs and applicable integrated confirmation surfaces. Native Windows Korean IME candidate-window selection, physical-keyboard commit behavior, native password-manager/autofill UI and OS dialogs were not exercised. These remain non-blocking untested limitations under the user's Playwright-only instruction; no native IME verification is claimed.

No existing/default browser, CDP attachment, SendInput, AppActivate, HWND/window automation, OS hotkeys or native UI control is authorized to fill this evidence gap.

## 3. Mandatory actual-browser role matrix

For **each** of 1280×720, 1440×900 and 1920×1080 × light/dark × 100%/verified 200% (12 environments), use the **built production App/AppShell and real settings trigger** with three owned accounts/session fixtures:

| Role | Required browser observation |
| --- | --- |
| Superuser | Open settings through the bottom-left gear; 인스턴스 설정 is present/reachable. Select it and observe exactly the five real settings fields, their server values and explicit actions. |
| Ordinary non-superuser | Open the real settings shell; 인스턴스 설정 and its five-field form are absent from the category DOM/accessibility tree. No hidden privileged form/setting-value copy is rendered. Personal categories still function. |
| Non-superuser workspace manager | Same absence as ordinary user, despite having actual management permission on a fixture workspace. Workspace management must not imply instance administration. |

This yields **36 mandatory role/environment observations**. Use real isolated login/session contexts and server-assigned roles; do not toggle a DOM attribute, inject a fake viewer into a lookalike shell, or infer the UI gate solely from HTTP denial. Record actual actor role facts from the owned fixture/session without credentials in artifacts. Reusing each run-owned authenticated context across its environments is allowed; accounts/contexts must remain separate to prevent cached privileged values crossing roles.

Add one real direct-API denial check per non-superuser role for settings GET and a harmless valid-key PUT, checking the existing denial response and unchanged DB state. This supplements, not replaces, the browser matrix. Add the existing role-loss-stop scenario: an already-open privileged form receives actual denial after role invalidation and cannot retain actionable privileged settings. Do not invent new endpoint semantics.

## 4. Five-field keyboard and contrast contract

In every superuser environment, record the following for **each** field; testing only an error field or the retention token is insufficient:

| Field key / visible label | Control / units | Keyboard and value evidence |
| --- | --- | --- |
| signup-mode / 가입 모드 | Native select, exactly the existing three modes | Tab focus, Arrow selection and selected option/value equality; no save solely from changing selection. Keep current approved option wording. |
| upload-size-limit-bytes / 업로드 크기 제한 | Text input, 바이트 | Focus, select/edit/correct raw text, exact unit/help association; no MB conversion or zero-as-unlimited claim. |
| retained-version-count / 보관 버전 개수 | Text input, 개 | Focus, raw text correction and retained server baseline; no new integer/maximum policy. |
| trash-retention-days / 휴지통 보존 일수 | Text input, 일, 0=무제한 | Focus/edit plus zero semantics and cross-field error association; normal safe edit and reset do not bypass risk confirmation. |
| audit-retention-days / 감사 로그 보존 기간 | Text input, 일, 0=무제한 | Focus/edit plus coupled retention validation; last field/help/error/action remains reachable. |

Traverse forward and backward through all five controls and action buttons using Playwright keyboard, recording active element, accessible label, described-by text, tab order and focus bounds. Use safe valid draft edits from the actual server baseline, then Revert to show restoration of **that baseline** without PUT. Dirty count reflects changed keys. A deliberate Save (not change/blur) performs the real existing preflight/write/readback sequence. No new field, reset-to-hardcoded-default behavior or policy is added.

For each field record actual computed foreground/background pairs and contrast for label, value, help/unit text, active border and focused ring. Include selected-mode text, numeric error text/border for each affected field, cross-field error, enabled Save/Revert, applicable retry buttons and warning/status text. Requirements: ordinary non-disabled text ≥4.5:1, large text ≥3:1, active control boundaries and focus/status indicators ≥3:1. Compute against the actual composited adjacent background, not an unused token swatch. Disabled controls are excluded from the general text threshold, but surrounding labels/help remain readable. Decorative separator lines are not active input boundaries.

Measure 2px focus indication plus separation and unclipped geometry, ≥36px control/action target height, correct 12/18px help readability, natural long-Korean wrapping and the action bar not covering the last field. Do not add duplicate screen-reader descriptions or new policy wording solely for screenshot alignment.

## 5. Complete applicability and evidence table

| State | Binding #71 disposition | Minimum closing evidence |
| --- | --- | --- |
| Default | Applies to all five fields, current values/units, changed-key indicator and Save/Revert. | Exact key/label/control count and per-field measurements in all 12 environments; no sixth field/default invented. |
| Hover | Applies to closed native select, numeric inputs and enabled Save/Revert/retry actions. | Pointer hover, computed visual distinction where authored, unchanged layout and screenshot. Native option-popup hover is browser-owned, not an OS automation target; selected DOM value is tested separately. |
| Focus | Applies to every field/action and integrated risk/leave dialogs. | Forward/backward keyboard order, focus ring/bounds/contrast and no theft from status changes; last field/action accessible at zoom. |
| Selected | Applies to signup-mode selected option and ordinary editable-text selection, not row selection. | DOM selected value matches visible choice; text selection/editing survives same-mount theme/zoom/resize without writes. |
| Disabled | Applies to unchanged/reset-unavailable form actions and actual save/retention-review pending controls. | Native disabled properties, preserved visible values, duplicate activation produces no extra writes; labels/reasons remain readable. Do not relabel disabled controls readonly. |
| Readonly | **N/A as a readonly base-field mode:** the five controls are editable when ready and disabled when pending. Static retention preview/leave descriptions are informational text, not readonly inputs. | DOM records no invented readonly field, static text remains selectable/readable. If the tested checkout actually contains a readonly input, enumerate and test it instead of applying this N/A blindly. |
| Invalid | Applies to empty/whitespace/non-numeric/non-finite/out-of-domain numeric edits, coupled audit/trash invariant and unknown stored signup enum. | Connected aria-invalid/error, correction path, no destructive zero fallback and no PUT on invalid draft. Check all four numeric fields and both linked retention errors. |
| Loading | Applies to actual initial GET, preflight/save/readback and #87 preview pending. | Observe delayed actual requests and busy/disabled presentation; no fabricated zero count or editable default form. Network delay instrumentation is identified, not a mocked successful result. |
| Empty | **N/A as a successful empty collection:** instance settings is one five-key record, not a list. Empty numeric input is invalid; an empty/missing GET value is invalid/unavailable stored data, not an empty-success panel. | Assert no “no settings” success, no client policy defaults and no blank→0 save. Demonstrate empty-input validation; record GET-missing-key handling if a fixture exercises it. |
| Error | Applies distinctly to initial GET failure, validation, preflight conflict/failure, rejected/uncertain PUT, accepted-write/readback failure, preview error/stale consent and leave callback failure. | Keep their actual owners/actions distinct; no false saved state, draft loss, duplicate write from GET retry, or query error mislabelled numeric error. Reuse scoped #87/#88 evidence with provenance and add combined smoke checks. |

Hover/readonly/empty must appear explicitly in the result JSON/report, not disappear because a generic state checklist passed. Unsupported native OS surfaces are the only verification-method limitations disposed here; an actual failed field/permission/error/guard assertion remains actionable.

## 6. Required combined #71/#87/#88 smoke path

At the audited integration checkout, use owned real server/DB/storage fixtures and the production UI:

1. Load five fields → make a safe change → Revert without write → make a safe change → deliberate Save → verify one changed-key patch/readback and persistence after reopen. Existing exact DB/restart evidence may be referenced with its scope, not re-described as newly run.
2. Use real zero-impact shortening for L2 and real positive-impact shortening for L3; inspect current proposed values/breakdown/warning, cancel without write, then valid deliberate consent/save. Do not fabricate impact counts or receipts. Preserve #87 stale-consent/atomic evidence; add its combined interaction with the final five-field shell rather than repeating every server race.
3. Make a dirty draft and exercise category, header close, Escape and outside-click leave paths; Continue Editing preserves exact draft/focus, discard performs only the selected departure and sends no save. Do not conflate leave confirmation with retention consent. Preserve #88 owner/race evidence and perform these combined paths at integration.
4. Accepted save followed by readback error exposes read-only retry; retry must not send a second PUT. Changing theme/size/zoom on the same mounted draft/risk/leave surface must preserve its current ownership and values.

Existing #87/#88 verification is not reopened merely because #71 needs additional base-form evidence. But if a current combined path fails, report and fix it under its existing requirement with test-first evidence before closure. Old #71 text asserting that shortening/leave integration is absent cannot substitute for inspection of the current integrated behavior; stale user-facing copy observed during the run is reported as a factual defect, not quietly ignored.

## 7. Execution isolation, evidence and exact Sol work order

Use fresh **Playwright-owned isolated Chromium**. Launch only run-owned contexts/profiles; no existing/default browser/profile or connectOverCDP/other attachment. Use owned temporary DB/vault/accounts/ports, preferably same-process programmatic Vite or the established owned built-product runner. Do not bind the test to an unrelated live service. No new product dependency is needed.

Real zoom uses `chromium.launchPersistentContext` with a disposable profile and disposable test-only extension. Set zoom with `chrome.tabs.setZoom(tabId,2)`; then perform a **separate read-only** `chrome.tabs.getZoom(tabId)` and assert 2. Reset via setZoom(tabId,1), then separately read and assert 1. Record tab identity, CSS viewport/DPR and screenshots. CSS zoom, transforms, changed deviceScaleFactor, half-sized viewport or OS zoom keys do not qualify. Perform representative resize and 100→200→100 on the same mounted form/dirty draft. Use Playwright forcedColors emulation at 100% and true 200% in both themes; do not automate Windows contrast settings.

The binding remediation work order is:

1. Pin the audit checkout and record source/test/built-artifact hashes before collecting evidence. Keep old #71/#87/#88 captures unchanged. Put fresh output below `evidence/issue71/closure-remediation/` or an equivalent run-owned staging directory.
2. Extend/add focused evidence assertions for §§2–5, including production-role rendering and every base field. The role cases use real authenticated production flows, not only category-array assertions. Harness work may reuse existing issue71/87/88 runners without weakening their checks.
3. Run the 12 environments × 3 roles, all-five-field keyboard/contrast/state checks and the four-environment composition subset. Add forced-colors and combined smoke evidence. Synthetic composition records event trust/defaultPrevented, value/focus, route-call counts and absence of premature action; no credential, session cookie or raw retention receipt is serialized.
4. If a **product behavior** fails, capture meaningful red before changing it and make the smallest fix under the existing requirement. Do not change SRS/policy/defaults or treat green test-after evidence as a substitute. The present task authorizes no code edit; root assigns any resulting implementation to Sol separately.
5. Publish measured JSON plus screenshots, exact commands/exit codes, state applicability and explicit limitations. Record current Git revision and SHA-256 for relevant source, bundle, harness, result and image files. Publish any completion manifest after all referenced artifacts. Do not overwrite old evidence or present it as a fresh integration run.
6. A separate Sol reviewer reruns or independently inspects the original issue/decision, diff and all result artifacts. Only that review may classify the audit findings resolved and recommend #71 closure. No SRS bulk promotion or automatic check-all is part of this decision.

Minimum result records: one environment/role row for each of the 36 observations; one field row per five fields/superuser environment with labels/value/unit/keyboard/focus/color pairs/ratios/geometry; the ten-state applicability table with evidence paths; per-composition-case field/surface/event/network outcomes; combined smoke request/outcome records; source/artifact manifest and the required native-limitations text. Screenshots support, rather than replace, DOM/event/network assertions.

Cleanup closes owned handles/contexts normally. Before any forced termination, verify runner-created PID and parent-child ownership; terminate only those owned processes. Never kill node.exe/nodex.exe/Chromium by process name and never terminate an unrelated browser/server. If ownership is uncertain, stop cleanup and identify it first.

## 8. Closure ruling and author-only completeness assessment

The native Windows IME item is **disposed by explicit user-constraint interpretation**, not marked natively verified. It is non-blocking once the synthetic guard evidence and exact limitation wording are present. The missing ordinary/workspace-manager browser matrix and the base-five-field keyboard/contrast/state matrix remain completion work until the specified evidence passes. #71 may close after independent review confirms those items and the existing integrated #87/#88 combined behavior, without any native OS automation.

Author-only design-completeness assessment: **Critical 0 / High 0 / Medium 0 / Low 0** for this remediation contract. This is **not an independent review and not a product PASS**. Rationale: Critical boundaries preserve real server authorization, secret-free ownership and prohibited-automation limits; High-risk failure modes have exact role/event/route assertions and source provenance; Medium coverage explicitly names all five fields, three roles, 12 environments and native-versus-synthetic limits; Low applicability gaps enumerate hover/readonly/empty and evidence artifacts. These counts do not resolve the outstanding product audit findings by themselves. A separate reviewer may challenge the decision or evidence; any demonstrated failure remains open.

No change is made here to code, SRS, GitHub issue state or historical evidence. No broader project manual-acceptance claim, policy change or native IME claim follows from #71 closure.
