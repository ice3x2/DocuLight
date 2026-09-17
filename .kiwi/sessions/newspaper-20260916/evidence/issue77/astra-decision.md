# Issue 77 — binding final newspaper audit decision

Decision: Astra, 2026-09-17, delegated design ownership. This document defines the final audit; it does **not** execute it or declare the rollout complete. `docs/spec/` remains the acceptance authority. No implementation, test execution, screenshot verification or SRS promotion is claimed.

## Authority and audit baseline

Read live #77 and its explicit dependencies #42–76, SRS index/current mode/target, newspaper README/style/forms/approved light and dark reference contracts/operational handoff, issue decision inventory #51–76 and their review dispositions, foundation/shared-ui/#50 review sources, actual shell categories and application state/operation inventory, package test commands and existing browser entry scripts. #42–50 decisions are distributed through the operational handoff, foundation/theme/shared-ui evidence and #50 review, rather than nonexistent per-issue Astra files. Preserve those actual source paths in the audit manifest.

SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, root source `server-cwd-discovery`, mode `sdd`, active target `phase-1`, no draft/deprecated stability blockers. Direct audit ownership is **IR-SHELL-006 AC10 and IR-EDITOR-002 AC5**, plus the applicable ACs of every dependency. IR-SHELL-006/008/009 are in_progress/stable, IR-EDITOR-002 planned/stable, IR-SHELL-007 verified/stable; CON-ARCH-004, IR-SHELL-002 and IR-EDITOR-001 remain source contracts. These are observed metadata, not a verdict about current product behavior. Summary `missingEvidence:[]` does not mean every planned AC has execution evidence.

The authority order is current SRS acceptance contracts, latest approved issue decision including accepted review revisions, then visual reference. A decision review PASS only validates a design; a historic implementation PASS applies to its recorded source snapshot and scope. A screenshot file, green filename, previous checked AC or closed issue is not current runtime evidence. Do not change a reference screenshot or weaken a test to make a changed implementation pass.

## Per-owner surface and acceptance inventory

Use the operational handoff's exact issue→REQ/AC mapping as the manifest base. The following is the mandatory application inventory, not an authorization to invent missing features. Every row needs a real product entry, relevant role/state coverage and evidence disposition.

| Owner | Surface/flow and irreducible audit evidence |
| --- | --- |
| #42 | SRS/decision trace completeness, scope boundaries and accepted review dispositions; document evidence only, no runtime pass by implication |
| #43–44 | Production build/token imports/library boundaries/shared light palette; actual controls/editor styles, dependencies/license notices and no unintended reset |
| #45–46 | Approved dark comparison plus actual light/dark/system behavior, anonymous first paint, per-user DB persistence/rollback, stale identity isolation, portal/editor live theme changes |
| #47 | Button variants, Field/Input/Textarea/Select, checkbox/radio, PrincipalPicker; labels/errors/autocomplete/IME, real field focus and disabled/readonly distinctions |
| #48 | Dialog/AlertDialog/popover/menu ownership, focus trap/return, topmost Escape, outside-click policy, L1/L2/L3 and dynamic fresh-count/token gates |
| #49 | Shared table/list/badge/notice/loading/empty/error primitives, semantic state text and row readability; fixture evidence plus representative real consumers |
| #50 | Authenticated shell three columns, header/tab separate rows, panel/tab overflow, fixed settings entry, keyboard panel scrolling and real zoom geometry |
| #51 | Tree/workspaces/favorites, nested selections, inline create/rename validation, context menu/DnD feedback, pending/failure/name preservation and actual navigation |
| #52 | Search fixed query/filter row, four axes/defaults, scope/query/AND-OR/Korean semantics, idle/no-axes/loading/empty/error, excerpts/scroll and actual HTTP query encoding |
| #53 | Backlinks/outgoing/tags, scopes/counts/states, nested resolved click and keyboard activation opens exact document; unresolved outgoing remains indistinguishable |
| #54 | Reading/live/source typography/width/padding, selection/caret/search/task checkbox computed colors, existing editor instance and undo retention |
| #55 | Existing ten live-preview elements, syntax/code overflow, table reveal/click geometry, tags/quotes/links, KaTeX no duplicate render, Mermaid theme/cache race, error source access, real diff +/- cues |
| #56 | Version query/list/selection/author-time/compare/immediate restore, actual accepted/rejected outcomes; shared readonly MergeView/raw accessible source without visual duplication |
| #57 | Actual two-session conflict, editable local/server merge and no-loss rejection rescue/download, existing replacement Cancel/Confirm; no fabricated save/retry outcome |
| #58 | Images fit/load failure/accessibility; generic/PDF download-only; file input/new-version reversible versus irreversible gate, actual bytes/name/outcome and cancellation |
| #59 | Full-page login/signup, actual entry and auth responses, password-manager/paste/IME, pending/duplicate/error/success/approval states, no shell behind auth |
| #60 | Full-page installation's five specified stages token→account→policy→review→completion; Back through review preserves values, exactly one L2 commit, real token/commit/error/security and completion entry |
| #61 | All14 settings categories, exact role gates, selected/focus updates, independent menu/body scroll, title/close reachable and inline child stages |
| #62 | Exactly two editor settings + one theme setting, per-user persistence/pending/rollback; explicit password change and separate logout with accepted outcome/login transition |
| #63 | PAT list→form→issuing→one-time reveal/copy/discard, owner identity and navigation interception, clipboard rejection/manual copy, revoke L2 and truthful query/mutation states |
| #64 | Trash actual scope/lens/list/empty/error, measured virtualized rows at runtime zoom/resize, restore and per-row authorized single L2 permanent delete, actual read/mutation results |
| #65 | Sharing's admin/editor capability split, exact object/principal context, direct/inherited source visibility, grant/revoke/inheritance confirmations and truthful callback outcomes |
| #66 | Move/copy destination and server preview, latest tuple identity, grade, collision/permission/accepted result versus refresh failure; unsupported hierarchy/search is not a fake UI |
| #67 | User roster four statuses/direct registration; approval/rejection/reopen, duplicate and stale-row controls, real last-active-superuser floor, no invented general self-target ban |
| #68 | Supported group roster/addition; ordinary/system distinctions; group delete unavailable until complete fresh L3 impact, no fictitious create/rename/remove flow |
| #69 | Exactly three ACL audit views; complete subject-set preview/execution identity, one fresh L3, deterministic per-subject partial outcomes, simulation, blocked restoration until real impact |
| #70 | Audit operation filter/grouped inline detail and separate reconciliation queue, independent read states/safe masks/role scope; no invented export/reconcile mutation |
| #71 | Exactly five instance policy fields,0/infinity and audit>=trash, draft preservation/stale reads/leave guard; retention shortening blocked without authoritative impact |
| #72 | Managed/all workspace lists and shared stable-ID selection; dedicated display-name PATCH/shared validation, DB/sidecar outcomes/concurrency, truthful administrator grant/revoke |
| #73 | Actual creation entry/three fields/default-none/one combined L2/no child count, fresh warnings, real returned ID navigation and unknown/partial-result handling |
| #74 | One offboarding card from both supported sources; exact status/PAT/ordinary-membership/ACL predicates, per-user L2 stages and ID-based partial outcomes; manager/system-membership limits |
| #75 | Real durable text queue/worker/projection/source-ready outbox, crash/generation safety and typed PDF failure; session-only GET and read-only entry/manual refresh UI, separate reconciliation/vector data |
| #76 | Initial/no-access/no-selection/missing/read-error/auth-ended states, exact precedence/retry/focus; accepted auth-ending mutation immediately removes protected UI, secure draft-handoff prerequisite remains |

For each leaf flow, enumerate applicable default, hover, focus, selected, disabled, readonly, invalid, loading, empty, error and success states. Add domain states such as denied/unavailable, partial/unknown outcome, conflict, confirmation-changed, reveal and pending-write only where its owner defines them. N/A requires a contract reason: a readonly queue has no selected-job/invalid-input state; an unsupported destructive action is **blocked**, not N/A. Missing API/fixture/implementation cannot justify N/A.

## Exact settings and role matrix

All14 categories must be audited in their actual product destinations, not merely their labels:

| Group | Categories | Existing gate |
| --- | --- | --- |
| Personal | 에디터, 외모(테마), 액세스 토큰, 계정 | Every authenticated user |
| Personal | 휴지통 | workspaceCount>0 |
| Workspace | 워크스페이스, 권한 감사, 감사 로그 | adminWorkspaceCount>0 |
| Instance | 사용자 관리, 그룹 관리, 가입 승인, 전체 워크스페이스, 인스턴스 설정, 색인 대기열 | superuser |

Fixtures include anonymous, ordinary user with zero accessible workspace, ordinary viewer/editor with workspace(s), workspace manager, superuser with managed/visible workspaces, and superuser with zero managed/visible workspaces. Test domain-specific viewer/editor/admin permissions independently of category gates. Expected category counts from #61 are4/5/8/14 for common cases; superuser zero-workspace/admin count10 and superuser workspace/no-admin count11 are valid edge fixtures. Do not override the supplied gates simply because actor is superuser. Role changes while settings/child dialog are open must remove stale privileged content and restore sensible focus. Direct endpoint tests complement menu absence; hidden menu is not authorization proof.

Use disposable separate browser contexts/users for permission/security tests. Exercise same-name/different-ID targets, nested nodes, group/user name collisions, suspended/pending/rejected accounts, stale deletion/selection and returned IDs instead of row indexes. Do not enlarge principal enumeration or add test-only authorization bypasses to production.

## Viewport, theme, portal and contrast matrix

Every distinct required surface and layout-changing state receives the minimum **12-case geometry matrix**:1280×720,1440×900,1920×1080 × explicit light/dark ×100%/genuine200%. Reuse one captured frame for several ACs only when assertions actually cover each. Domain owner matrices remain minimums; #77 does not shrink them to one screenshot. Additional transient states must be exercised in both themes at the narrowest effective desktop layout and included in all12 when they change overflow/layout (long errors, large confirmation lists, complex widgets, full tables).

The issue's three theme choices are light/dark/**system**, not three unrelated palettes. Separately exercise system under OS light/dark and runtime OS flips, fixed preferences ignoring OS flips, anonymous system first paint, DB setting late arrival, save rollback, logout/identity switching and stale previous-user responses. Include open menu/popover/risk dialog and existing editor/Mermaid/comparison during transitions. No editor reconstruction, content/cursor/selection/undo loss or wrong portal theme. Validate palette→semantic→shadcn/CodeMirror/atomic variables using actual computed styles, including task-checkbox pseudo-elements and native control color-scheme.

True zoom evidence uses isolated persistent Chromium with extension `chrome.tabs.setZoom(tabId,2)` and asserts `chrome.tabs.getZoom(tabId)===2`. Record starting viewport/window, before/after innerWidth/innerHeight, DPR, actual zoom and browser version. CSS zoom, transforms, CDP page scale, deviceScaleFactor or half-size viewport alone do not count. Include live100→200→100 and resizing between required desktop sizes while the same populated surface remains mounted. Reload-only snapshots do not prove runtime geometry/cache/virtualizer behavior.

Forced-colors is additional, not a replacement for dark: run every applicable control/overlay/editor/status family and all settings body types at1280×720 in100% and true200% with active forced colors, record matchMedia result, inspect actual selected/focus/error/diff/task-checkbox cues and keyboard reachability. A screenshot whose CSS was not actually forced is not evidence. Browser forced-color emulation and native OS high contrast are labelled separately; require native confirmation for any platform-specific discrepancy before claiming that platform covered.

Contrast evidence measures actual composited foreground/background pairs: normal text/placeholder>=4.5:1, large text>=3:1, essential control boundaries/focus/state icons>=3:1. Include hover/pressed/selected/readonly, warning/danger/success, overlays and editor/code/widget colors. Disabled exceptions do not cover readable information inside a partly active row. Decorative rules are not sole control boundaries. Use readable text/shape in addition to color. Record numerical pairs and selectors/semantic role, not only palette HEX ratios. Do not claim complete WCAG compliance from these bounded criteria or an automated scanner.

Keep approved light HTML immutable. Use independently reviewed same-composition baselines, fonts/platform recorded, deterministic fixture content/time and controlled animation. Screenshot differences require explanation and computed-style/geometry evidence; thresholds must not hide clipped text, missing focus, wrong theme or layout shifts. No baseline overwrite to bless a regression.

## Keyboard, accessibility and editor invariants

Audit logical Tab/ShiftTab, native Enter/Space, arrow/Home/End tab/list/menu navigation, Escape topmost-only, popup last-item reachability and focus-visible. Initial risk focus is Cancel/description, outside clicks do not execute/close risk dialogs, ordinary dialog close returns to actual trigger or defined logical fallback. Portal ownership follows the approved stack, not a global body selector that promotes page popovers above risk confirmation. Input IME/picker Enter never submits its outer form. Focus cannot land on body after a mutation removes its row/control or jump from an editor due to a background refresh.

Verify accessible names/labels/descriptions, field errors/aria-invalid, table headers, live-region single announcement semantics and readonly copy/select. Empty is not urgent error; loading is contextual polite status; repeated rerenders do not announce the same failure incessantly. Confirm cancellation returns exact form values and no mutation request. Measure actual button/input minimum36px (auth/install40px),4px radius,2px focus plus2px separation and long Korean natural height. Keyboard-only traces and accessibility-tree snapshots complement pixels. Any screen-reader claim requires an actual recorded assistive-technology run (for example browser/OS/NVDA versions); absent that, report it untested rather than infer speech behavior from ARIA alone.

Editor read/live/source mode runs must preserve actual source bytes, caret/selection/undo, autosave debouncing and focus, tag interaction, wiki links, task checkbox behavior, table reveal/click, code/table local horizontal overflow, widget heightmap and padding-based geometry. Verify KaTeX single visible rendering and accessible source, Mermaid cache invalidation/out-of-order theme completion, error raw-source access and visible non-color insertion/deletion cues as chunks update/scroll. Demo-only tests cannot close IR-EDITOR-001's actual-product style AC.

Native Korean IME requires a real OS input method in the actual product, with OS/browser/input-mode and keystroke sequence recorded: compose/correct/commit/cancel Korean, punctuation/newline, candidate selection, Enter during composition, editing through autosave/theme/zoom and form/picker confirmation boundaries. Use both relevant editor modes and representative shared form/picker/confirmation consumers, expanding any domain-specific failure. **CDP Input.imeSetComposition, Input.insertText, CompositionEvent dispatch, keyboard.insertText and page.fill are synthetic/automation evidence, not native IME.** The existing ime-composition-check.mjs explicitly uses CDP without an OS input method; its PASS cannot close native evidence. Both evidence classes are useful and must have distinct labels.

Virtualization must be operational: large tree/trash fixtures, actual bounded rendered rows, measured variable-height rows/offsets/spacers and keyboard reveal. Test deep nesting/long Korean, top→middle→last row, selection/action identity, data removal, runtime resize and zoom while scrolled. Rendering all rows via overscan=count is not a virtualization pass. Local table/code scroll and shell overflow are deliberate; unintended whole-app widening or unreachable action is a failure.

## Functional and security end-to-end gates

Functional proof uses the actual App entry and disposable server/storage, not only injected component props. Fixtures are appropriate for precise rare/error/layout states but must be labelled. Each mutation flow includes cancel, duplicate activation, accepted result, known rejection, unknown transport outcome, accepted mutation followed by read failure and stale identity/selection where applicable. Inspect actual HTTP calls/server state, then visible product outcome; callback invocation alone does not prove a completed action.

Required integrated regressions include two-session edit conflict/body rescue, exact downloaded bytes/name, new version/restore and real body/hash behavior, upload limits and binary confirmation, PAT reveal/copy/discard lifecycle, permission revocation and missing/unavailable equivalence, real auth/signup/install, role/category updates, persistence across reload/user change, group/ACL guarded partial failures, workspace rename identity/sidecar behavior, workspace creation accepted ID, and real async worker pending/running/failed/completion/restart. Each remains owned by its decision; no invented API/callback feedback to make audit fixtures look complete.

Carry recent review fixes as permanent guards: nested link navigation (#53), dark checked-checkbox glyph contrast (#54), version restore scope/close feedback (#56), five install stages (#60), generic password failure mapping (#62), actual active-superuser floor rather than general self-target ban (#67), session-only index GET and source-ready durable outbox with accepted hash/ID preservation (#75), neutral auth-ended cause and immediate local end after accepted logout/password change independently of subsequent GET (#76). Their revised acceptance matrices are mandatory, not optional “edge tests.”

Credentials/PATs/local draft bodies are never included in unrestricted logs, traces, screenshots or reports. Use disposable test accounts/tokens and redact artifact capture while separately asserting lifecycle/visibility properties. Capture secret-safe metadata/hash/length or synthetic fixture values where appropriate; masking artifacts does not weaken actual plaintext lifecycle assertions. Avoid dumping session cookies or response headers containing credentials. Isolate install and destructive fixtures from live data. Stop only test-owned PIDs whose provenance is known, never all node processes.

## Existing runners and evidence limits

Observed root `npm run test:browser:all` invokes editor/browser-all and web/browser-all. Editor aggregate includes browser, table, drift, tag, math, inline and issue55 scripts. Web aggregate includes complex/auth/focus/IME/search/merge/styles/theme/ACL/trash/gestures. **It does not currently enumerate every newspaper-specific runner.** Inventory and run the relevant remaining entries explicitly or make an independently reviewed coverage-complete runner; a single aggregate exit0 cannot stand for absent checks.

Existing standalone entries include newspaper shell/tree/naming/review-replay/search/right-panel/editor/shared-ui/shared-controls/field/overlays/data-display/version-history checks and version-history-product-check.mjs. Several start Vite component fixtures (for example newspaper-data-display and theme-runtime); they prove those fixtures' computed behavior, not full login/route/server assembly. version-history-product-check uses a disposable authenticated product and is a different evidence class. Existing script presence says nothing about execution on the final source revision.

The final runner manifest must record command, workspace, server setup, fixture/database identity, browser/platform, source commit plus worktree-diff hash, scenario IDs, start/end, exit result, artifact paths and skipped/blocked reason. Run `npm run typecheck`, relevant production builds and web/editor/server test suites plus the complete browser inventory appropriate to changed contracts. Broader server work in #72–75 needs its server migration/service/HTTP/worker regression, not only frontend build. Run tests once against the consolidated final snapshot; rerun affected suites after changes and dependency-wide browser coverage when shared styles/theme/overlay/editor integration changes. Avoid repeated unchanged runs without a reason.

For each requirement AC produce a manifest row `{issue,REQ,AC,surface,role,state,environment,method,sourceRevision,evidence,verdict,reviewer}`. Verdict is PASS/FAIL/BLOCKED/NOT-RUN/N-A; N-A has a source-backed reason. Missing planned evidence is not PASS. Findings identify observed result/expected contract/reproduction/severity/owner, with no fabricated CVE or speculative new requirement. An independent reviewer consumes original contracts, actual diff and raw evidence; fixes go to a different agent and return for re-review under AGENTS. Do not verify one's own authored result by declaration.

## Known closure blockers and final gate

The following are inherited decision gates, not a fresh claim every item remains unfixed at execution time. Recheck actual final code/approved contract/evidence and record resolution or keep BLOCKED. Do not silently delete them from the manifest:

- #56–58 missing live-body/refresh/save/upload result plumbing where required; distinguish in-scope presentation from unsupported completion feedback.
- #63 secret-owner/leave interception plus truthful issue/list/revoke outcomes; #64 restore destination/eligibility/retention metadata where a claim needs it.
- #65 L1 revoke-from-toast lacks returned ACL identity; complete inheritance/last-admin impacts and capability boundaries cannot be fabricated. #66 preview/result adapters and unsupported hierarchy/root-capability data require their documented scope dispositions.
- #68 exact group-delete impact/system-membership capability; #69 managed scope, complete subject-set plans, restoration impact and system-superuser warnings. #72's managed list may resolve earlier scope proof only after actual integration evidence, not by document proximity.
- #71 retention-shortening authoritative preview and parent dirty-leave interception; #72 accurate workspace-admin impact across broken inheritance and actual rename/list wiring.
- #73 partial-create/lost-response recovery and eligibility limits: do not demand unsupported all-or-nothing/exactly-once guarantees, but do require honest unknown outcomes and no automatic duplicate retry for the issue's supported contract.
- #74 manager-readable card and full system-membership removal remain blocked; exact status projection and ordinary-group plan must be real. Its limited predicates cannot claim complete global access removal.
- #75 actual engine/migration/hooks/typed PDF/API/worker assembly and durable prepared outbox remain prerequisites until implemented/tested; session-only GET cannot be widened to PAT. A path unable to preserve accepted source/hash/ID stays blocked pending explicit contract.
- #76 secure current-editor draft handoff before voluntary invalidating mutations with possible edits, and across involuntary auth loss. Accepted logout/password change cannot leave protected shell visible because a follow-up GET fails. Neutral401 cause wording alone is not preservation evidence.
- Missing native IME, real zoom/runtime resize, product-path role coverage, final-snapshot independent review or a pending dependency implementation is independently sufficient to block #77 closure.

Separate **unsupported optional capability** from **unmet required AC**: no PDF viewer/export/reindex/etc is required merely because it was mentioned as a boundary; mark that exclusion with its owner. Conversely an owner document saying a required branch is blocked does not waive that AC. A changed requirement/approved scope disposition must be made through normal SRS governance before the audit can treat a formerly required branch as excluded. This decision does not authorize new functionality or a waiver.

Close #77, the final rollout, or its parent issue/epic only when every required surface/AC has evidence at the final snapshot, all dependency deliverables are resolved within approved scope, no required row is FAIL/BLOCKED/NOT-RUN, and independent review has **Critical=High=Medium=Low=0 unresolved findings**. A Low that is merely documented, triaged, deferred or assigned remains non-PASS and blocks closure. The only risk-acceptance exception is the user's explicit acceptance of that exact identified risk: record the finding ID, affected behavior/AC, stated risk, exact acceptance reference and scope as a separate disposition. Do not infer acceptance from silence, broad delegation, a reviewer downgrade, a deadline or this decision. An accepted-risk disposition is not a repaired defect or an unqualified PASS; the final report must retain it visibly and limit any closure claim to the user's accepted scope. Without that exact acceptance, continue the fix/re-review loop and block closure.

Final closure checklist:

- Every required surface/state/role/environment and REQ/AC row has current-snapshot evidence and an independent disposition; no required FAIL/BLOCKED/NOT-RUN row remains.
- Critical, High, Medium and Low unresolved counts are all zero. Recheck the full finding register, including documented or deferred Lows; a summary severity filter cannot omit them.
- Any explicitly user-accepted exact risk has its own traceable acceptance disposition and appears in the final report; no unqualified PASS hides it and no broader waiver is inferred.
- Dependency completion and per-AC evidence are confirmed before final issue/epic closure; design approval or partial visual success is insufficient.

Do not bulk-promote requirements or close prior issues from this document. Requirement verification/status changes need per-AC evidence and normal stability checks through SpecKiwi. The final audit report must state exact executed coverage, real limits and unresolved findings; a selective visual PASS is not “the entire newspaper rollout passed.”

## Independent review disposition

**Low1 accepted:** tightened the final rollout/#77/parent issue-or-epic gate to Critical=High=Medium=Low=0 unresolved findings. Documented/triaged/deferred Low findings remain non-PASS and block closure unless the user explicitly accepts that exact risk; any such acceptance must remain a visible, traceable disposition rather than a silent PASS. Added a final closure checklist. No audit execution, implementation or test execution accompanies this revision.
