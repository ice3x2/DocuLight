# Issue #77 Axis A final independent review

Date: 2026-09-22  
Scope: final evidence inventory, exact Requirement/AC ledger, browser-command accounting, role/composition/tree evidence, provenance, and promotion eligibility  
Reviewed manifest SHA-256: `e66dc9783b3e7a5ed33aed520361d4aeedb843f32c201862d2e6326f20a13e72`

## Verdict

**ACCEPT — Critical 0 / High 0 / Medium 0 / Low 0.**

Axis A accepts all 406 rows whose reviewed ledger verdict was `BLOCKED`. The accepted scope is fixed by:

- ledger: `coverage/leaf-matrix.jsonl`
- ledger SHA-256: `a8efd0cc089b0f6fae9849b99133b4545e75f42da832bd7422c2808fc07be8d4`
- accepted row count: 406
- SHA-256 of the lexically sorted accepted row IDs, joined with LF and terminated by LF: `a8149904f4dbd98d10f7b6eb8e171af5d88898e024b74790900ee17cccd73497`

The accepted rows contain exact current Requirement IDs and AC IDs. Their evidence, evidence-reference, reviewer-evidence, and SHA-256 fields recomputed successfully. No generic AC label, circular `final-manifest.json` evidence, missing evidence, duplicate row ID, nonexistent SRS AC, failed row, or unrun row remains in the accepted scope.

## Accepted rows by requirement

| Requirement | Accepted rows |
| --- | ---: |
| FR-CONFIRM-024 | 5 |
| FR-STORAGE-010 | 7 |
| IR-ACL-004 | 11 |
| IR-ACL-005 | 5 |
| IR-AUTH-003 | 5 |
| IR-EDITOR-002 | 19 |
| IR-PRINCIPAL-001 | 5 |
| IR-PRINCIPAL-002 | 12 |
| IR-PRINCIPAL-003 | 10 |
| IR-PRINCIPAL-004 | 10 |
| IR-PRINCIPAL-005 | 4 |
| IR-SHELL-002 | 120 |
| IR-SHELL-006 | 114 |
| IR-SHELL-007 | 10 |
| IR-SHELL-008 | 24 |
| IR-SHELL-009 | 2 |
| IR-SHELL-011 | 13 |
| IR-SHELL-012 | 4 |
| IR-SHELL-013 | 6 |
| IR-WORKSPACE-001 | 8 |
| IR-WORKSPACE-002 | 4 |
| IR-WORKSPACE-003 | 8 |
| **Total** | **406** |

## #43–#45 remediation

The 21 `IR-SHELL-006` rows owned by issues #43, #44, and #45 now reference 36 AC-specific evidence records with current hashes. They no longer use a successful build as blanket visual evidence.

- AC-1: exact approved light palette and computed semantic colors.
- AC-2: dark/system runtime behavior, portal inheritance, and computed colors.
- AC-3: palette/theme/token layer ownership and production runtime integration.
- AC-4: measured control geometry and typography.
- AC-7: shared-control and #66 focus, state, disabled/readonly/invalid, and non-color semantics.
- AC-8: numeric composed text, boundary, state, and focus contrast.
- AC-10: twelve light/dark viewport/true-zoom environments plus forced-colors and product role coverage.

The retained foundation raw output contains four failures for an old exact disabled-text expectation. Those failures are accepted as a stale checker expectation, not hidden or relabelled as passing execution. The checker expected the former `#74766D`; the current palette deliberately uses `--ink-disabled: #5E5F58`, while retaining the explicit `#E3E2DB` disabled surface, opacity 1, disabled semantics, and distinction from selectable readonly content. `IR-SHELL-006` AC-8 explicitly excludes disabled text from its contrast threshold. AC-7 does not require the old exact disabled color, and its current shared-control and #66 evidence independently proves the required state distinction and non-color semantics. The same foundation raw output validly records the scoped AC-1 palette and AC-8 applicable contrast assertions as passing.

## Inventory and provenance

- Declared browser inventory: 77 entries — 47 PASS, 30 source-backed N-A, 0 FAIL, 0 NOT-RUN. All PASS evidence and every N-A equivalence path/hash recomputed, including #78.
- Role matrix: 112 observations across eight roles and fourteen environments, with expected category counts 0/4/5/5/8/11/12/14.
- Composition matrix: eight product cells covering live preview/source, light/dark, and 100%/200%, plus form, PrincipalPicker, L2, and L3 consumers.
- Tree evidence: large workspace and descendant trees retain first/middle/last identity through bounded virtualization, resize, and true zoom transitions.
- Manifest inventory: 1,689 artifacts, 37 sources, and 1,294 bundle files. Recorded artifact/source hashes recomputed and the manifest was written after every referenced artifact.
- Secret scan: 1,689 files, zero exclusions, zero concrete secret matches.
- Final unit suites, typecheck, and builds are green.

## SRS promotion eligibility

The following outstanding newspaper requirements are eligible for normal per-AC SpecKiwi evidence/status mutation:

- `IR-SHELL-002`: remaining AC-5.
- `IR-SHELL-006`: remaining AC-1, AC-8, and AC-10.
- `IR-SHELL-008`: remaining AC-5.
- `IR-EDITOR-002`: AC-1 through AC-5.
- `IR-PRINCIPAL-001`: AC-1 through AC-5.
- `FR-STORAGE-010`: AC-1 through AC-7.

Requirements already verified remain verified. This review does not itself mutate SRS, commit changes, or close an issue. After the accepted disposition is applied to the exact row scope above and normal SpecKiwi promotion succeeds, Axis A recommends closing issue #77.
