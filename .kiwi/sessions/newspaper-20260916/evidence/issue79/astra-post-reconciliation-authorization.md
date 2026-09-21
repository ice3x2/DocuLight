# Issue #79 — post-reconciliation authority read-back

Decision authority: Astra. Date: 2026-09-18. Scope: contract readiness only.

## Authorization

**AUTHORIZED: begin strict test-first implementation of #79 under IR-SHELL-011.** The focus reconciliation prerequisite in `astra-decision.md` is now satisfied. This authorization supersedes only that document's pending-reconciliation/blocking statements; its implementation contracts and evidence gates remain binding. It does not assert implementation, passing tests, verified requirements or issue closure.

Read repository AGENTS.md and `docs/spec/00.index.md`. SpecKiwi MCP read envelopes identify `C:\Work\git\DocuLight2.0-wt-issue79`, `rootSource=per-call-workspace-root`, mode `sdd`, Active Target `phase-1`, no stability blockers/warnings. IR-SHELL-011 remains planned/stable, all 13 ACs unchecked, with no verification evidence. SRS-W072 is the existing unrelated document-number warning.

## Current-authority comparison

Read the current parsed IR-SHELL-011 and its eleven linked requirements, live GitHub #79 (updatedAt `2026-09-17T23:48:16Z`), `astra-decision.md`, `decision-review.md`, and reconciliation commit `b51c8519c63cb4e2c5d682727c12d12b11f437cd` plus its report and issue read-back. The live issue and current AC-13 have exactly the same focus wording:

> L2 확인 취소 시 열려 있는 이동·복사 폼의 실행 버튼으로 초점을 복원한다. mutation 실패로 폼과 선택을 유지할 때는 해당 폼 안의 오류 안내·재시도 또는 실행 조작으로 초점을 복원한다. 외부 폼 취소 또는 accepted mutation 성공으로 폼을 닫은 뒤에는 source tree row가 남아 있으면 그 행으로, 없으면 사전에 정한 tree의 논리적 후속 위치로 복원한다. 대상·인증·모달 owner가 바뀐 뒤에는 이전 요청의 결과로 초점을 이동하지 않는다.

This preserves retained-form AC-6 and IR-SHELL-008 modal containment. The issue's remaining completion criteria agree with AC-1–12 and the binding design; they introduce no contradictory product requirement. The earlier independent decision review approved the transport design while withholding implementation solely for reconciliation. No unresolved product decision prevents implementation now.

Primary requirement: **IR-SHELL-011**. Related contracts: **FR-SHELL-015, FR-ACL-002, FR-ACL-006, FR-CONFIRM-005, FR-CONFIRM-016, FR-CONFIRM-017, SEC-ACL-014, SEC-ACL-015, SEC-SHELL-002, SEC-SHELL-003, IR-SHELL-008**. This artifact is a read-back and authorization subordinate to `docs/spec/`, not an alternate requirements source.

## Non-negotiable implementation contracts

- Preserve #66 presentation and destination projection. Existing server APIs/policies and shared ConfirmGate semantics remain unchanged; use the relocation-local L2 adapter. No search, hierarchy redesign, inferred root eligibility, undo, collision diagnostics, automatic copy opening or audit link.
- Root move within the source workspace omits preview destinationId and writes `{parentId:null}`; root copy explicitly previews the selected workspace ID and writes `{workspaceId}`. Directory operations use their node ID and `{parentId}`. Cross-workspace root move sends zero preview/write requests. Keep the selected workspace ID in ownership; missing lookups never become root operations.
- Bind destination/preview/intent/write results to principal/auth generation, modal generation, source, kind, selected destination and query/request generations. Distinguish authoritative destination loading/error/ready-empty, preview states and post-write refresh. No guessed grades, counts, source levels or mutation results.
- Refresh preview at explicit execute and again at L2 acceptance. Any changed count/grade invalidates prior intent and requires a new deliberate form action. Open L2 to L1 never autoexecutes. Synchronous guards prevent duplicate click/Enter/accept writes; pending writes block destination changes and local dismissal. Authentication/context replacement suppresses obsolete UI/focus results, not an already-sent write.
- Failed or uncertain writes retain form/selection, discard intent, show safe error and allow only fresh GET preview plus explicit reattempt; never automatically repeat writes. Accepted writes alone close the current owner's form. Tree refresh failure preserves success and offers a separate read retry.
- Success always uses the server result: `항목을 이동했습니다. 결과 이름: {name}` or `{copied}개 항목을 복사했습니다. 결과 이름: {name}`. Preserve visible-only copy, same/cross-workspace authorization, privacy and constant copy caveat. Show administrator simulation guidance only for actual source `level=admin`.
- Inner L2 cancellation focuses the form execute button; retained failure focuses its visible error summary/retry/execute control. Outer dismissal/success uses surviving source row, otherwise next visible sibling in captured tree order, previous sibling, containing parent/workspace row, then tree container, resolved by stable IDs. Never change document selection or move focus for an obsolete owner.
- Start with REQ-tagged failing assertions and record real RED before production edits, then minimal GREEN without weakening tests and independent review. Retain sdd; intentional tdd mode would add SDS-before-tests and test-commit-first gates. Run the decision's focused/full regressions and typechecks, then actual authenticated App/server persistence and privacy evidence.
- Retain the decision's 12 browser environments, forced-colors, same-mounted-form resize/zoom, contrast/focus/keyboard checks and screenshots. Use fresh Playwright-owned Chromium and disposable profile/extension; actual 200% requires setZoom and independent getZoom, not CSS/DPR/viewport substitution. Native Windows IME candidate UI stays nonblocking untested. No existing-browser/CDP/OS automation or process-name kills.

No SRS ID/status/AC checkbox, production code or test was changed by this authority review. Implementation completion still requires independent evidence for every IR-SHELL-011 AC and does not verify the broader linked requirements wholesale.
