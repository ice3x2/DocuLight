# Astra SRS reconciliation — #79 / #82 / #86 / #89

Date: 2026-09-18. Author: Astra. This records the requested contract authoring in `C:\Work\git\DocuLight2.0-wt-astra-srs`; the requirement blocks in `docs/spec/` remain authoritative. This is not implementation evidence or an independent review verdict.

## Authority and mutation boundary

Read repository AGENTS.md, `docs/spec/00.index.md`, the four committed `issue79/astra-decision.md`, `issue82/astra-decision.md`, `issue86/astra-decision.md`, `issue89/astra-decision.md` artifacts, the affected requirements and their directly related focus, principal, audit-entry and workspace-admin contracts. SpecKiwi read envelopes confirmed workspace root `C:\Work\git\DocuLight2.0-wt-astra-srs`, `rootSource=per-call-workspace-root`, package 3.0.0, persisted mode `sdd`, Active Target `phase-1`, no stability blockers or warnings. Open-work statuses and recent completed-work rows were read before editing.

MCP reads support the worktree override, but a dry-run `replace_acceptance_criteria` with this root returned `MCP_WORKSPACE_ROOT_UNSUPPORTED` / SRS-E075 and identified the server root as `C:\Work\git\DocuLight2.0`. No mutation was applied there. Requirement edits therefore used the supported installed CLI with explicit `--root C:\Work\git\DocuLight2.0-wt-astra-srs`, including status transitions, individual AC edits, statements, section notes, evidence table rows, trace links and change notes. No requirement ID or AC numbering was changed manually. The ledger and directly dependent reference prose were edited in place. Derived index counts were updated by the CLI; its incidental `kiwi/.status.json` rewrite was restored to this worktree's clean baseline.

## Decisions and issue mapping

| Issue | Requirement edits | Reconciled decision and basis |
| --- | --- | --- |
| #79 | IR-SHELL-011 AC-13 | L2 cancellation returns focus to the still-open relocation form's execute control; a failed mutation retains the form and focuses its error/retry/execute control. Outer cancellation or accepted success closes the form and restores the surviving source row or logical tree fallback. An obsolete target/auth/modal owner cannot move focus. This makes AC-13 consistent with retained-form AC-6 and IR-SHELL-008 modal containment. |
| #82 | FR-CONFIRM-004 statement, AC-3/4/5, rationale, notes and trace to IR-PRINCIPAL-004 | Numeric-token refresh applies to operations whose designated token is impact-derived. Group deletion keeps the exact current group name required by IR-PRINCIPAL-004 AC-3/5. Identity, name, member count or whole-delete ACL count changes discard typed input and consent, lock execution and require cancel/reopen, fresh baseline, exact name and explicit acceptance. Numeric equality only avoids the numeric-comparison lock; it does not override identity/name freshness. Existing numeric-token operations retain their new-number requirement. |
| #86 | IR-SHELL-002 AC-5, note and trace to IR-SHELL-012 | Only the existing 감사 로그 category receives the workspace-manager OR superuser gate. A superuser with zero managed workspaces can enter the same category in the same group/order without inventing a workspace ID. 워크스페이스, 권한 감사, 휴지통 and all other category gates retain their contracts; server audit/queue authorization, scope and masking remain independent. |
| #89 | FR-CONFIRM-012 statement, AC-2/3, rationale, analysis, notes and traces to IR-WORKSPACE-003 / SEC-ACL-008 | Ordinary view/edit retains inherited reach and broken-branch exclusion. Workspace admin uses the upper gate and includes currently visible broken-inheritance branches. Its number counts unique currently visible file/directory descendants, excludes the root and hidden/unservable nodes, and preserves existing serving/lifecycle restrictions. The current visible count is distinct from administrator authority over the whole workspace and future descendants. |

The directly dependent reference updates are limited to R116-a, R126/R126-a/R126-d and the R24-a category row in `00.decision-log.md`; the category table, workspace-selection explanation and administrator recount rationale in `04.screen-design-settings.md`; and the reach-count definition/recount/privacy explanation and token rules in `05.screen-design-permission.md`. Historical decision artifacts remain unchanged.

## Status and evidence treatment

- IR-SHELL-011 remains planned/stable; its AC-13 remains unchecked.
- FR-CONFIRM-004 moves verified → in_progress, retaining stable maturity. AC-1/2 remain checked; revised AC-3/4/5 are unchecked. Existing VE-1 now covers the unchanged AC-1/2 and explicitly does not prove the new group-name branch.
- IR-SHELL-002 moves verified → in_progress, retaining evolving maturity. Only revised AC-5 becomes unchecked. VE-1 retains its other coverage, removes AC-5 and records the need for the new role matrix and actual entry-path evidence.
- FR-CONFIRM-012 moves implemented → in_progress, retaining stable maturity and its already-unchecked ACs. Existing reach-count evidence is explicitly limited to view/edit; the administrator branch needs fresh evidence.
- IR-PRINCIPAL-004, IR-SHELL-012 and IR-WORKSPACE-003 remain planned/stable. No implementation or verification promotion was performed, and the Completed Work Log was not edited.

## Executed objective checks

Full machine output is in `astra-srs-reconciliation-checks.json` alongside this report.

| Command | Result |
| --- | --- |
| `speckiwi validate --fail-on-warning --json` | Exit 1: errors 0, warnings 1. The existing SRS-W072 leading-number collision remains between `02.feature-request-live-preview.md` and `02.product-architecture.srs.md`. The same warning was observed before edits. No duplicate Requirement ID diagnostic was returned. |
| `speckiwi summary --target phase-1 --json` | Exit 0: total 284; verified 193, implemented 69, planned 15, in_progress 7; stable 243, evolving 41; stability blockers/warnings empty; `missingEvidence=[]`. This field does not prove the revised AC branches: the reopened statuses and explicit evidence limits above remain authoritative. |
| `speckiwi links check --json` | Exit 0, 1119 references checked, network access false. One broken reference remains: IR-AUDIT-004 `GitHub Issue` value `32`, SRS-W004 invalid GitHub issue URL. It is present in HEAD and outside these edits. The command's zero exit does not mean all links are valid. |
| `git diff --check` | Exit 0 before report delivery. |

No production code, tests or browser behavior were changed or executed in this authoring task. No commit, push or issue closure was performed. The authorized follow-up changed only the #79 GitHub body criterion described below. No independent semantic review was performed by this author.

## Independent-review follow-up

Sol reported C0/H2/M1/L0 through the parent workflow. This author applied the following requested repairs and reran validate, summary, links and diff-check; results remain as recorded above. These are repair records awaiting independent re-review, not a self-issued pass.

- HIGH #79: updated the live GitHub issue body with `gh issue edit --repo ice3x2/DocuLight 79 --body-file ...`, replacing only its focus completion criterion with the exact IR-SHELL-011 AC-13 wording. A subsequent `gh issue view` returned the new inner-L2/retained-form versus outer-close focus boundaries. The returned snapshot is `astra-issue79-reconciled.json`, updatedAt `2026-09-17T23:48:16Z`. GitHub normalized the body line endings to CRLF; no unrelated body change was requested.
- HIGH #82: §5.2 rule 6 of `05.screen-design-permission.md` now requires raw exact current group name without trim, case folding, Unicode normalization or substring comparison. Other token operations continue to use their own designated-token contracts.
- MEDIUM #89: R126-d, settings §5.2 common principle 4 and permission §5.2 rule 1 now distinguish view/edit inheritance-reach changes from administrator current-visible-set changes; a broken inheritance flag alone does not exclude an admin branch.

## Remaining integration gates

The parent workflow must independently re-review original decisions/requirements, the repaired diff and the live #79 read-back. Live #82 reconciliation/read-back remains with the authorized GitHub owner; this report does not claim a #82 mutation occurred. The implementation owners must then perform strict RED → GREEN and collect fresh per-AC evidence, including zero-managed superuser entry and admin broken-branch coverage; historical tests and this document are not substitutes.
