# Issue #42 independent contract review

Date: 2026-09-16

Reviewer: independent Sol review lane

Verdict: **PASS**

## Scope reviewed

- Original GitHub issue intake for #42 through #77 in `.kiwi/sessions/newspaper-20260916/issues-intake.json`.
- The nine new stable requirements: `IR-SHELL-006` through `IR-SHELL-009`, `IR-EDITOR-002`, `IR-AUTH-003`, `IR-WORKSPACE-001`, `IR-PRINCIPAL-001`, and `FR-STORAGE-010`.
- `docs/decision/newspaper-implementation-handoff.md`, including the per-issue AC map, dispositions, and operational connection contracts.
- Existing authority cited by those requirements, with focused checks of workspace rename/naming, theme cache/logout, PAT plaintext lifetime, and the real asynchronous text-index obligation in R157.
- Current code entry points for workspace creation, node rename, workspace repository persistence, search, and settings surfaces.

## Findings

### HIGH — the workspace rename handoff points to the wrong domain operation

`IR-WORKSPACE-001` AC-3 requires a selected workspace to reach a workspace rename path and requires the server to recheck authority and name validation. The handoff instead says to “Reuse existing node rename ... for management” (`newspaper-implementation-handoff.md:87`). Existing node rename changes a node/path; the workspace repository has creation and lookup but no workspace display-name update path. The authoritative settings design defines workspace rename as a DB display-name update while the hash directory remains unchanged and `.workspace.json` remains a reconstruction copy (`docs/spec/04.screen-design-settings.md:280-303`, R40-a/R40-d).

Using node rename would target the wrong entity and persistence rules. The handoff must specify a workspace rename service/repository/API path that updates the DB authority and causes the sidecar to be reconciled, with the required server authorization.

The same contract currently cites `FR-WORKSPACE-004` as its name-validation dependency. That requirement explicitly governs **node** names and filesystem/path restrictions. A workspace display name is not a filesystem component under R40-a. The SRS must either identify an existing workspace-display-name rule or define the bounded validation contract; it must not silently inherit node-name semantics.

### MEDIUM — the “exact” issue-to-requirement authority map drops declared issue authorities

The handoff's mapping table omits these requirements that the corresponding issue bodies explicitly list:

| Issue | Missing declared authority |
| --- | --- |
| #47 | `IR-SHELL-004` |
| #48 | `IR-SHELL-001` |
| #55 | `IR-EDITOR-001` |
| #64 | `IR-SHELL-002` |
| #67 | `IR-SHELL-002` |
| #73 | `IR-SHELL-002` |
| #76 | `IR-SHELL-002` |

Additional authorities already present in the handoff may remain when justified. Because #42's deliverable is an exact REQ/AC map and the third table column presents the pre-existing authority, these omissions need correction before the design gate can pass.

## Checks that passed

- The nine new requirements are `Status=planned`, `Stability=stable`, with no acceptance criterion checked and no implementation evidence reused.
- Strict SRS validation returns 0 errors. It returns one pre-existing `SRS-W072` warning for `02.feature-request-live-preview.md` sharing leading number 2 with `02.product-architecture.srs.md`; it is unrelated to #42.
- The earlier dark-theme contradiction is resolved: the exact dark palette is decided, #43/#44 remain light-only, #45 owns the same-composition preview and independent contrast evidence, and #46 owns product integration.
- `IR-SHELL-007` explicitly keys the in-memory theme cache by the authenticated user and clears it on logout, invalid session, or user change. DB remains authoritative.
- `IR-AUTH-003` keeps PAT plaintext in component memory only, intercepts every exit while plaintext is visible, and clears it on authentication boundary changes.
- `FR-STORAGE-010` represents R157 as a real durable asynchronous text-index queue and projection, preserves temporary search staleness, performs final existence/ACL filtering, and keeps this queue separate from reconciliation and vector indexing.
- The remaining shell, overlay, editor, offboarding, responsive, state, and browser-evidence ACs are internally consistent with the cited existing requirements in this review.

## Pass condition

Resolve both findings, rerun strict SRS validation, and independently recheck the changed SRS/handoff text. Runtime verification belongs to the implementation issues and is not required to prove this design-only #42 gate.

## Re-review 1 — 2026-09-16

The original HIGH and MEDIUM findings are resolved:

- `IR-WORKSPACE-001` AC-3/6/7 and the handoff now define a dedicated workspace display-name PATCH service, DB-authoritative sidecar behavior, bounded display-name validation, stable physical identity, failure semantics, and concurrent rename protection. The previous review's statement that the repository lacked a rename method was inaccurate: `WorkspaceRepository.rename(id,name)` exists; the missing service and HTTP layers are now specified correctly.
- All seven omitted issue-declared authorities are restored in the per-issue map.
- Strict validation remains at 0 errors and the same unrelated `SRS-W072` warning.

One stale live-text contradiction remains, so the verdict is still **CHANGES REQUIRED**: `docs/spec/04.screen-design-settings.md:750` says workspace display-name validation is absent and points to Q15, while Q15 is now resolved at line 1566 by `IR-WORKSPACE-001` AC-6. Replace the stale sentence with the resolved AC-3/6/7 reference, then perform one final bounded recheck.

## Final re-review — 2026-09-16

The remaining stale sentence now identifies Q15 as resolved and delegates validation to `IR-WORKSPACE-001` AC-6, rename/path invariance to AC-3, and DB/sidecar recovery to AC-7. The live settings text and the resolved Q15 row agree.

Final strict validation: 0 errors and one unrelated pre-existing `SRS-W072` warning. No unresolved critical, high, medium, or low finding remains in the #42 design gate. **PASS.**
