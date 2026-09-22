# Issue 77 — binding closure addendum

Decision owner: Astra, 2026-09-22. Implementation/evidence owner: Sol medium; final review: a separate Sol reviewer. Applies to integration **83ae0fc9808e1edc5e049e17e1d9b5657aef29aa** in `C:/Work/git/DocuLight2.0-wt-issue77-final` and any explicitly recorded later audited revision. This is a decision, not executed verification, SRS mutation or issue closure.

This addendum supersedes only the older #77 decision's native-IME closure condition, obsolete 10/11 category counts, and any evidence/status interpretation conflicting with the current SRS and later accepted owner decisions. All other required behaviors, visual checks, independent review and unresolved-finding gates remain in force. It does not create new product functionality or accept an observed defect as harmless.

## 1. Authority and Audit A input

Read live #77, AGENTS.md, current index and requirements in this integration checkout, the original #77 decision/review, the #71 closure decision, current `shell-contract.ts`, #86 tests and `DocumentTree.tsx`. Audit A was supplied as a **read-only mailbox report**, not a persisted reviewed artifact: the task reports the native-IME/Playwright conflict, obsolete role counts and source pointers including the tree overscan expression. Do not invent a report file or treat its absence as a passed audit.

Current source facts:

- IR-SHELL-002 is in_progress/evolving; its global fourteen-category inventory remains authoritative, supplemented by IR-SHELL-012's audit-entry exception.
- IR-SHELL-006 is in_progress/stable; AC-5/7/8/10 require composition-safe input, applicable states, real contrast and actual role/viewport/zoom evidence.
- IR-SHELL-012 is verified/stable and linked to #86. It explicitly admits a superuser with no managed workspace to the existing audit-log/reconciliation entry without changing server authorization/masking.
- IR-EDITOR-002 is **planned/stable**, with unchecked AC-1..5 and VE-1/VE-2 explicitly partial. Its normative AC-5 calls for Korean IME and other editor regressions in existing tests and the actual product browser; it does not itself mandate a native Windows candidate-window automation method. VE-1's historical native-IME limitation must not be rewritten as a test that was performed.

The #71 closure decision already interprets the user's Playwright-only/no-OS-input instruction as synthetic application-level evidence plus an explicit non-blocking native limitation. That same interpretation now applies to #77. The project index's separate manual acceptance item is not checked, deleted or declared fulfilled here.

## 2. Native IME closure disposition

**Missing native Windows Korean IME/candidate-window execution is not, by itself, a #77 blocker under the user's binding Playwright-only/no-OS-automation constraint.** The older sentence making it independently sufficient to block closure is superseded. Do not attempt OS input injection, physical candidate selection, native password-manager/autofill UI, native high-contrast settings, an existing browser or a CDP attachment to fill that item.

Instead, the required evidence is **Playwright synthetic composition/DOM input on the actual production editor and relevant controls**, with exact resulting text/selection/state/request assertions and an explicit native limitation. This is a change of authorized verification method, not a claim that synthetic input is equivalent to a native OS IME or that a functional composition failure can be accepted.

Use this closure wording only after the required synthetic cases actually pass:

> Korean composition protection was verified through labelled Playwright synthetic composition/DOM input in the production application. Native Windows IME candidate-window selection, physical-keyboard commit/cancel behavior, native password-manager/autofill UI and OS dialogs were not exercised and are non-blocking untested limitations under the user's automation constraint. No native IME verification or separate project-wide manual acceptance is claimed.

Do not relabel an old CDP IME run, `page.fill`, programmatic editor transaction or screenshot as native evidence. Direct browser protocol injection/attachment is not the authorized remediation route; use Playwright's supported high-level input/DOM event mechanisms in its own fresh Chromium. Record synthetic event `isTrusted`/`isComposing` facts accurately.

### Required editor and consumer cases

1. Open a real owned document through the built App using live preview and source editing separately. Reading mode is the resulting render check, not an editable composition surface. Record editor instance, document ID, content hash/bytes, caret and selection before the scenario.
2. Exercise synthetic composition start/update/commit and cancellation/correction with Korean text, then ordinary punctuation/newline and a deliberate subsequent edit. Verify exact final CodeMirror source, rendered result and server readback after the normal save flow; no dropped/duplicated syllables, stale result or accidental extra line. Do not bypass input handling by invoking a test-only editor transaction as the sole composition proof.
3. Composing Enter must not trigger a form submit, picker selection/grant, confirmation or unintended editor newline. On consumers that prevent default, record the production handler's cancellation (`defaultPrevented`/dispatch return), not merely zero writes from an untrusted event with no default action. On editor-specific handling, assert resulting source/caret and absence of the unintended action. A subsequent deliberate non-composing action must still work.
4. Exercise normal autosave and theme/light-dark-system transitions while the relevant editor instance/draft remains mounted; verify focus/caret/selection/undo and final source/readback. Do not add an unsupported policy that all autosave requests are forbidden during any synthetic composition interval; assess the existing documented save behavior and data preservation. Theme/zoom alone must not submit new content or reset history.
5. Include representative actual form, shared PrincipalPicker and L2/L3/discard boundaries, using the latest owner decisions such as #71. A shared primitive result may support several consumers only if current wiring/handler identity is traced; it cannot stand for an untested consumer with its own handler. No composing Enter may accept a destructive or secret-discard action.
6. Run composition-focused scenarios in both editable modes and both themes at 100% and independently verified 200% at least at 1440×900. Keep the full original 12-environment layout/keyboard/widget matrix; the composition subset does not replace it. Include a same-mount resize/100→200→100 interaction and record exact values/selection rather than relying only on pixels.

A failed application-level composition guard, wrong bytes/caret, save loss, unintended action or missing product-path evidence **still blocks its required AC and #77**. Native-UI N/A/untested disposition cannot hide such a failure.

## 3. Authoritative fourteen-category role matrix

The inventory is still fourteen, not fifteen. IR-SHELL-012 changes the gate for the **existing 감사 로그** category only. Current gate rules are:

- Always after authentication: 에디터, 외모(테마), 액세스 토큰, 계정.
- 휴지통: workspaceCount > 0.
- 워크스페이스 and 권한 감사: adminWorkspaceCount > 0.
- 감사 로그: adminWorkspaceCount > 0 **or superuser**.
- Instance six (사용자 관리, 그룹 관리, 가입 승인, 전체 워크스페이스, 인스턴스 설정, 색인 대기열): superuser.

For authenticated fixtures the count is `4 + (workspaceCount>0 ? 1 : 0) + (adminWorkspaceCount>0 ? 2 : 0) + (adminWorkspaceCount>0 || superuser ? 1 : 0) + (superuser ? 6 : 0)`.

| Role / supplied or server-derived facts | Expected category count | Essential assertions |
| --- | ---: | --- |
| Anonymous | 0 | No authenticated settings shell/categories behind pre-auth surface. |
| Ordinary, workspaceCount=0, adminWorkspaceCount=0 | 4 | Personal four only; no trash, audit or instance categories. |
| Ordinary viewer, workspaceCount>0, adminWorkspaceCount=0 | 5 | Personal four + trash; node view-only actions remain separately gated. |
| Ordinary editor, workspaceCount>0, adminWorkspaceCount=0 | 5 | Same categories as viewer; edit/grant capabilities differ at their actual node surfaces. |
| Non-superuser workspace manager, workspaceCount>0, adminWorkspaceCount>0 | 8 | Personal five + workspace/ACL audit/audit log; no instance six. |
| Superuser, workspaceCount=0, adminWorkspaceCount=0 | **11** | Personal four + audit log + instance six; no trash/workspace/ACL-audit category. |
| Superuser, workspaceCount>0, adminWorkspaceCount=0 | **12** | Personal five + audit log + instance six; no workspace/ACL-audit category. |
| Superuser, workspaceCount>0, adminWorkspaceCount>0 | 14 | Full existing inventory. |

The former 10/11 superuser edge expectations are obsolete and must be corrected in audit expectations, never used to change the product back. Test exact category IDs/labels/gates, not only totals. Do not broaden trash/workspace/ACL-audit merely because superuser is true.

In actual-browser role checks use the production AppShell/settings trigger, actual tabs/content and DOM/accessibility-tree assertions, at all required twelve geometry environments for each defined role fixture. Record provenance: a server-authenticated role/session is product evidence; a controlled session-response or direct viewer-prop edge fixture is a **contract/component fixture**. If a rare count tuple cannot be produced by an owned real server setup, test its deterministic shell contract through the production component, explicitly label it, and retain separate real authenticated ordinary/editor/manager/superuser flows. Never forge a viewer flag and call it authentication proof, or treat impossible role/count combinations as mandatory product states.

For the zero-managed-workspace superuser, exercise the actual existing audit/reconciliation panel without fabricating a workspace ID. #86's component tests alone do not prove the new capture reached a real server instance-scope endpoint. Real API/session authorization, scope/masking and role-change isolation must retain their corresponding product/server evidence. Lack of native OS input does not excuse a missing role matrix.

## 4. Product, fixture and current-snapshot evidence

Classify every evidence row explicitly:

| Class | What it can prove | What it cannot prove alone |
| --- | --- | --- |
| Product | Built App, owned server/DB/storage, real entry/navigation and requests/persisted outcomes, captured at an identified revision. | Native OS input or a different untested revision. |
| Production-component fixture | Real exported components/AppShell with documented props or intercepted read/error fixtures; computed visual/keyboard behavior. | Real authentication, API assembly, mutation/DB outcomes, complete live transport. |
| Unit/service/contract | Exact input/output, pure policy, known server transaction or component regression with its declared setup. | Actual pixels/zoom/production entry by merely checking classes/imports. |
| Design/reference | Approved appearance, mapping and decision boundaries. | Implemented/verified runtime behavior. |

Respect later owner decisions allowing independently completed presentation-only issues (#66–#68, etc.) on genuine component-bundle evidence with registered follow-up defects. Their closure is not invalidated by this addendum. Conversely, **#77's integrated product claims** must use product evidence for the runtime behavior now owned by the follow-up requirements; earlier styling fixtures do not turn missing live behavior into PASS. Map required follow-up owners/current completion individually, not an old generic blocked-capability list. Optional out-of-scope capabilities are not invented as new completion gates.

Current snapshot means the exact recorded commit plus relevant uncommitted source/diff hash, dependency lock and built bundle. Historical PASS/screenshot/closed issue is reusable only for its declared behavior after proving relevant source/style/dependency equivalence or supplying a fresh affected regression. A file named green is not a verdict.

The worktree already contained changed issue50 captures and an issue61 staging directory when this author inspected it. This document does not modify, approve or normalize those artifacts. Do not use them as current PASS without their producing run's manifest, source/artifact hashes, completion marker and independent disposition. Preserve historical artifacts and publish fresh #77 outputs to a run-owned directory, with the manifest after every referenced artifact. Failed/partial staging is not a completed capture.

## 5. IR-EDITOR-002 verification ruling

**Yes: IR-EDITOR-002 may ultimately be verified without a native OS IME run**, under this explicit method disposition, if **all five ACs** are fully evidenced on the actual product/current snapshot and independently reviewed. The absence of native Windows automation is not an automatic permanent in_progress gate. The evidence entry/final report must link this addendum and retain the native limitation. Existing partial VE-1/VE-2 stay historically partial; add current scoped evidence rather than silently relabelling their execution.

Required coverage before promotion:

| AC | Required completion evidence |
| --- | --- |
| AC-1 | Exact read/live typography, heading/quote/source/code and required token text sizing, reading width/padding and long-Korean wrapping through current product styling, not demo only. |
| AC-2 | Actual read/live/source/search/selection/caret/open comparison theme changes, correct semantic integrations and preserved editor state. Include system preference behavior as the applicable theme owner requires. |
| AC-3 | Code/table local overflow and existing ten live-preview elements, KaTeX and readable syntax/tag/quote/link/Mermaid colors in the product; no clipped app expansion. |
| AC-4 | Mermaid cache/theme/out-of-order handling, math/diagram error raw-source route, and non-color addition/deletion cues in actual comparison/merge. |
| AC-5 | Existing regression plus actual product widget padding/height and table-click coordinates, autosave focus, the synthetic Korean composition contract in §2, selection/caret/undo, real save conflict and draft rescue. A form-only IME test is insufficient for editor evidence. |

At the inspected 83ae0fc snapshot this requirement is **planned/stable and unchecked**. This decision does not promote it. If execution work is underway, the lifecycle owner may separately set in_progress normally; until full evidence exists it remains unverified (planned or in_progress), not verified merely because the native blocker was disposed.

IR-SHELL-002 and IR-SHELL-006 must remain **in_progress** while their remaining category/body/role/state/contrast/current-product evidence is incomplete. Do not bulk-check their ACs on the basis of this decision. IR-SHELL-012 already being verified does not require demotion because an obsolete audit expected 10/11; correct the audit and preserve/rerun its applicable regression. Any newly observed runtime failure is handled through ordinary requirement/issue evidence rules.

## 6. Other Audit A concern: actual tree virtualization

The native-IME decision does not dispose of unrelated findings. Current DocumentTree uses `overscanCount={rows.length + 64}` near line 608. `rows` is built from top-level workspaces, not the flattened descendant count, so the expression alone does **not** prove that every large nested-tree scenario renders all nodes. It also does not prove bounded virtualization for many workspaces.

Sol must measure mounted row counts, total scroll extent and first/middle/last keyboard/action identity for both a large expanded descendant tree and a many-top-level-workspace fixture, at runtime resize/100→200→100. Declare source node counts, expanded visible logical rows and actual mounted DOM counts. If rendering grows to the entire visible dataset or focus/click identity fails, that observed defect remains open and blocks the corresponding required #77 virtualization row until repaired and independently reviewed. Do not infer either PASS or universal failure solely from the prop name/comment or from a small fixture.

## 7. Exact Sol execution and closure contract

1. Pin 83ae0fc or an explicitly recorded later consolidated revision, capture Git/source/lock/bundle/test hashes, and build an issue→REQ/AC→surface/role/state/environment manifest. Read current SRS and accepted owner addenda; do not carry obsolete 10/11, native-blocker or old missing-integration statements forward as current facts.
2. Use only fresh Playwright-owned isolated Chromium with run-owned profiles, DB/storage/accounts/ports. No existing/default browser/profile, CDP attachment/protocol input injection, OS/native input/window automation or global process control. Prefer same-process owned server/Vite handles where suitable.
3. Retain the original twelve light/dark/viewport/100%-200% geometry matrix, applicable state matrix, runtime resize, virtualization and full functional/security audit. Test system theme separately under Playwright media changes; native OS preference UI is not required. Forced-colors emulation is labelled; native OS high-contrast discrepancy is an untested platform limit, not permission for OS automation. Real accessible/visual failures still block.
4. For actual zoom use a disposable persistent-context extension: setZoom(tabId,2), then a **separate read-only** getZoom(tabId)===2; reset with setZoom(tabId,1), then a separate getZoom===1. Record tab/viewport/DPR/browser version. CSS zoom, transform, DPR or viewport halving is not a substitute.
5. Add/run §2's synthetic product composition and §3's corrected role matrix. Preserve earlier valid input/permission tests. If behavior changes are needed, record red before implementation; never weaken the contract to fit an existing result. Collect §5 editor coverage and §6 measured virtualization.
6. Separate historical/component/product sources in the manifest; preserve secret-safe evidence and old baseline files. Each required row gets PASS/FAIL/BLOCKED/NOT-RUN/N-A with exact evidence and reviewer. Native OS input is a visible **untested limitation with method disposition**, not falsely marked native PASS and not a generic license to downgrade failures.
7. Have a separate Sol reviewer assess original contracts, current source/diff and raw evidence. The original requirement for no unresolved C/H/M/L product findings remains: a real issue merely assigned/deferred is not PASS. This addendum specifically replaces the native-method requirement and old category counts; it does not manufacture user acceptance of other risks.
8. Root owns normal per-AC evidence/status changes and #77 closure. Do not bulk-promote requirements or close the parent epic merely from this document. State the native limitation in the final closure report even if all authorized automated checks pass.

Cleanup closes run-owned handles/contexts first. Any forced termination needs recorded runner-created PID/parent-child ownership and targets only those processes. No broad node.exe/nodex.exe/Chromium name-based kill and no unrelated server/browser termination. Unknown ownership means do not terminate.

**Present disposition:** decision conflict resolved; required evidence and any observed runtime defects still need independent resolution. IR-SHELL-002/006 stay in_progress until their complete evidence exists; IR-EDITOR-002 stays unverified until all five ACs pass. None must remain unverified solely because prohibited native IME automation was not run.
