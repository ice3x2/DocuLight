# Issue #79 Astra decision — final independent re-review

Reviewer: Codex
Date: 2026-09-18
Scope: revised decision feasibility and contract review only; no implementation or SRS/GitHub mutation

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The revised decision resolves both prior High findings. It is a sound design handoff, while correctly remaining **blocked for implementation** until the stable `IR-SHELL-011` AC-13 and live #79 focus wording are reconciled and independently reviewed.

## Previous findings resolved

### Workspace-root move transport

Resolved. The decision now matches the existing route/service contract exactly:

- same-workspace root move retains the selected workspace ID in UI/freshness ownership but omits preview `destinationId`, producing server `null`, then sends `{parentId:null}`;
- cross-workspace root move sends neither preview nor mutation;
- root copy sends the selected workspace ID explicitly in preview and `{workspaceId}` in mutation;
- directory move/copy sends the destination node ID and `{parentId}`.

The revised RED plan asserts the exact query/body/request-count boundary for all four cases and prevents a failed lookup from becoming a root operation. No server endpoint or policy change is required.

### `IR-SHELL-011` AC-13 focus conflict

Resolved at the decision level. The document no longer treats its accessible interpretation as implicit precedence over the stable SRS. It explicitly blocks behavior tests and production implementation, identifies the two authorities that must change, supplies narrow replacement wording, requires read-back and independent contract review, and preserves `IR-SHELL-011` AC-6 plus `IR-SHELL-008` modal containment.

The proposed reconciliation is internally consistent:

- inner L2 cancellation restores the still-open form's execute control;
- retained-form mutation failure restores a form error/retry/execute target;
- outer cancellation or accepted success restores the source row or stable logical tree fallback;
- obsolete owners never move focus.

## Remaining contract review

Preview/mutation freshness, L2-to-L1 no-autoexecute, synchronous duplicate guards, uncertain outcomes, result wording, privacy, role/source-level handling, accepted-write/read-refresh separation, conditional focus, strict TDD and actual-App Playwright evidence remain consistent and feasible.

This PASS approves the revised decision as a blocked handoff. It does not authorize RED tests or implementation before the stated SRS/live-issue reconciliation gate, and it does not claim `IR-SHELL-011` verification.

## Sources checked

- Revised issue #79 `astra-decision.md`
- Live GitHub #79
- `IR-SHELL-011`, `IR-SHELL-008`, and traced relocation/ACL/confirmation/security requirements
- #66 decision/review
- Current relocation preview route/service and move/copy client/App/dialog paths

No product code, tests, SRS, GitHub issue, commit or Astra document was changed by this review.
