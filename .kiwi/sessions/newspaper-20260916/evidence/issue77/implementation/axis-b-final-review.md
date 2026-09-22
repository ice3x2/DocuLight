# Issue 77 Axis B final independent runtime review

Date: 2026-09-22  
Reviewer: independent Sol Axis B reviewer  
Reviewed manifest SHA-256: `e66dc9783b3e7a5ed33aed520361d4aeedb843f32c201862d2e6326f20a13e72`  
Reviewed revision: `83ae0fc9808e1edc5e049e17e1d9b5657aef29aa` plus manifest worktree diff `4e19613bf0cd016e530183a219c25dc6c50416111adbad4fb783cceca477e3a0`

## Verdict

**PASS for Axis B — Critical 0 / High 0 / Medium 0 / Low 0.**

The previous Axis B rejection is closed. This review accepts the exact runtime rows listed below and the supporting lifecycle regressions. It does not accept the separate Axis A #43–#45 foundation rows, promote an SRS requirement, mutate the ledger, or by itself close GitHub Issue #77.

## Integrity and provenance

- `final-manifest.json` hashes to the reviewed value above and was written last.
- All 1,689 manifest artifact paths exist; every recorded byte count and SHA-256 matches.
- All 427 `coverage/leaf-matrix.jsonl` evidence and reviewer-evidence references exist and their SHA-256 values match. The previous 21 stale `build-final-raw.txt` references are no longer present.
- The declared browser inventory accounts for all 77 commands: 47 fresh PASS and 30 explicit N-A aliases, aggregates, superseded methods, or stronger-product-equivalence entries; no FAIL or NOT-RUN entry remains.
- The retained native limitation is accurate: native Windows IME/candidate UI, physical input, password-manager/autofill UI, and native OS high contrast were not exercised. Synthetic Playwright composition and forced-colors emulation are not represented as native evidence.

## Runtime findings

### Virtualized document tree

`tree-final/green-measurements.json` is bound to the exact current hashes of `DocumentTree.tsx`, the tree fixture, the tree checker, and `package-lock.json`. Both 1,000-workspace and 1,001-expanded-row fixtures retain bounded DOM windows and full scroll extent.

For both fixtures, first, middle, and last logical IDs have matching action IDs and matching focus IDs before zoom, at independently read 200%, after live viewport resize, and after reset to independently read 100%. Mounted rows remain below 100 throughout the populated windows. This closes the prior unbound-source and row-identity findings.

### Composition and consumers

`composition-matrix-final/issue77-composition-matrix-result.json` contains all eight live-preview/source × light/dark × 100%/200% cells. Every cell records PASS for pre-state, cancellation/correction, composing Enter, exact persisted body and bytes, selection, undo/redo, autosave/readback, theme/system transitions, same-mounted resize, and separately set/read 100→200→100 zoom.

The built-product consumer checks separately pass for `PasswordChangeForm`, `PrincipalPicker`, L2, and L3. Composing Enter is prevented and produces zero unintended requests or mutations.

### Roles and accessibility

`role-category-final/role-category-matrix.json` contains 112 environment rows: eight roles across twelve light/dark viewport/zoom environments plus forced-colors 100% and 200%. Counts are exactly `0/4/5/5/8/11/12/14`. Product sessions, the controlled superuser-viewer production-component fixture, endpoint denials, focus opening/restoration, zoom reset, geometry, system-theme applicability, screenshots, and accessibility snapshots are explicitly classified.

Fresh common and owner matrices retain computed contrast, visible separated focus, keyboard access, forced-colors, long-text geometry, control states, and actual-product outcomes. The four stale disabled-token expectations retained in the separate Axis A foundation transcript are not accepted by this review and are outside the Axis B row scope below.

### Lifecycle and MergeView identity

The reduced-motion regression exercises the real initial-reveal lifecycle and observes `animation-name: none` and `0s`, closing the appended-marker finding. The editor layout regression addresses exactly one `[data-merge-case="theme-transition"] .cm-mergeView`, preserves that instance across theme repaint, and passes the dynamic, product-smoke, and twelve-environment run, closing the positional `.first()` finding.

### Final regression state

- Editor unit: 261 passed, 1 skipped.
- Server unit: 1,621 passed.
- Web unit: 1,384 passed.
- Typecheck: all workspaces pass.
- Build: all workspaces pass.
- Source-bound tree Playwright, eight-cell composition, role/accessibility matrix, reduced-motion lifecycle, MergeView identity, owner/common component matrices, and fresh product suites pass within their declared evidence classes.

## Exact accepted ledger scope

This review accepts only these current ledger row IDs:

- `I77-tree-workspace-first`, `I77-tree-workspace-middle`, `I77-tree-workspace-last`, `I77-tree-descendant-first`, `I77-tree-descendant-middle`, `I77-tree-descendant-last` — `IR-SHELL-006` AC-10.
- `I77-composition-live-preview-light-1`, `I77-composition-live-preview-light-2`, `I77-composition-live-preview-dark-1`, `I77-composition-live-preview-dark-2`, `I77-composition-source-light-1`, `I77-composition-source-light-2`, `I77-composition-source-dark-1`, `I77-composition-source-dark-2` — `IR-EDITOR-002` AC-5.
- `I77-composition-consumer-form`, `I77-composition-consumer-principalPicker`, `I77-composition-consumer-l2`, `I77-composition-consumer-l3` — `IR-SHELL-006` AC-5.
- All 112 rows whose IDs begin `I77-role-` — `IR-SHELL-002` AC-5, limited to their recorded role/environment and evidence class.

The accepted requirement scope is therefore `IR-SHELL-002` AC-5, `IR-SHELL-006` AC-5 and AC-10, and `IR-EDITOR-002` AC-5 only to the exact rows above. This is evidence acceptance, not whole-AC completion outside those rows and not whole-requirement verification.

## Closure boundary

Axis B is closed. Global #77 closure remains owned by the root reviewer after the separate Axis A disposition and normal SRS evidence/status gates are resolved. No SRS, GitHub, commit, or product source mutation is authorized or performed by this review.
