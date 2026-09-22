# Issue 77 implementation evidence

Source baseline: `83ae0fc9808e1edc5e049e17e1d9b5657aef29aa` plus the source diff hashed by `final-manifest.json`.

## Requirement disposition

- `CON-ARCH-004` and `IR-EDITOR-001` remain verified under their existing evidence.
- Independent Axis A and Axis B reviews accepted the exact closeout scope. `IR-SHELL-002`, `IR-SHELL-006`, `IR-SHELL-008`, `IR-EDITOR-002`, `IR-PRINCIPAL-001`, and `FR-STORAGE-010` are verified with all ACs checked and closeout/review evidence attached.
- `SEC-STORAGE-007` remains `in_progress` with AC-3 open because its archive operation belongs to phase 2; it was not overpromoted.
- The binding native-IME disposition is `.kiwi/sessions/newspaper-20260916/evidence/issue77/astra-closure-addendum.md`. Native Windows IME, candidate-window input, native password-manager/autofill UI, and native OS high contrast were not exercised and are not claimed.

## Fixes and TDD chronology

1. Large top-level tree RED: 1,000 of 1,000 rows mounted at 1280x720. The frozen test hashes are in `red-test-hashes.txt`; raw failure is `red-large-tree-raw.txt`.
2. `DocumentTree` now uses bounded overscan. The expanded regression measures 1,000 top-level workspaces and 1,000 expanded descendants, bounded mounted rows, total extent, first/middle/last identity, focused actions, live resize, and extension true zoom 100→200→100.
3. Exact focus RED: a middle row changed identity during zoom reset (`large-workspace-420` to `large-workspace-398`). `red-tree-focus-test-hashes.txt` and `red-tree-focus-zoom-raw.txt` preserve the pre-fix test and failure. Resize observation now captures the active logical row before viewport state changes and restores it through the public Tree API in layout effect.
4. Reduced-motion RED: `.cm-initialRevealMatch` retained a 3.2-second animation under `prefers-reduced-motion: reduce`. `red-reduced-motion-raw.txt` and its test hash preserve the failure. The final browser run is 8/8 with `animation-name:none` and `0s` duration.
5. The editor layout checker had a stale broad MergeView locator after the fixture gained pure insertion/deletion views. It now scopes the intended first MergeView; the dynamic selection/theme/undo/save path and 12 light/dark/viewport/true-zoom environments pass.
6. A new disposable built-product runner exercises live-preview and source synthetic composition, composing Enter, punctuation/newline, exact save/readback, rendered re-entry, selection, resize, and extension zoom with separate set/get/reset calls. Its retained result is `product/product-composition-result.json`.

## Final executed checks

- Full editor unit: 261 passed, 1 skipped.
- Full server unit: 1,621 passed.
- Full web unit: 1,384 passed.
- Focused tree component: 35 passed.
- Typecheck: all workspaces pass.
- Build: all workspaces pass.
- Tree Playwright: PASS.
- Editor layout Playwright: PASS dynamic state, production smoke, and 12 environments.
- Reduced-motion/editor complex-content Playwright: 8/8 PASS.
- Built-product editor composition/save/zoom: PASS.
- SpecKiwi summary: no draft/deprecated blockers and no missing evidence entries.
- `speckiwi validate --fail-on-warning`: exits 1 for the pre-existing `SRS-W072` numbering warning only; errors 0.
- `speckiwi links check`: reports the pre-existing `IR-AUDIT-004` reference `32` as `SRS-W004` plus `SRS-W072`; this run does not mutate SRS.

## Closeout disposition

Axis A accepted the fixed 406-row ledger with C0/H0/M0/L0 and Axis B accepted the exact runtime subsets with C0/H0/M0/L0. The accepted ledger contains 406 PASS and 21 source-backed N/A rows, with `independentReviewAccepted=true` and `closureEligible=true`. The untracked directories `.kiwi/sessions/newspaper-20260916/evidence/issue61/.settings-stage-75268-1790022999509/` and `.kiwi/sessions/newspaper-20260916/evidence/issue61/.settings-stage-124176-1790032624646/` were created by interrupted, test-owned settings runners; deletion was rejected by the execution policy after their absolute paths were verified inside this worktree. They are unclaimed and excluded from the final manifest and commit.

## Axis A remediation

- Declared browser inventory: 77 entries, fresh PASS 47, source-backed N-A 30, FAIL/NOT-RUN 0.
- The rejected Cartesian matrix was removed. Its replacement has 427 current-SRS Requirement/AC rows: source-backed N-A 21 and independently accepted PASS 406. Every row carries recomputed evidence and reviewer hashes; `independentReviewAccepted=true` and `closureEligible=true`. The generator parses current SRS AC IDs, verifies the accepted pre-review ledger and ID set, and rejects unknown ACs.
- Fresh targeted runtime evidence now includes: eight product composition cells and four actual consumers; eight role/category fixtures across 12 normal plus two forced-color environments with accessibility snapshots; and first/middle/last tree action identity across true zoom and live resize for both 1,000-workspace and 1,000-descendant fixtures.
- The first final web suite run exposed one issue89 refresh-error timing failure. It passed on an immediate focused 10/10 rerun and a second complete 1,384-test web rerun. Both raw results are retained; no issue89 source or test was changed.
- Axis A H1 remediation replaces the 21 #43-45 build-log links with AC-specific runtime evidence: exact computed palette, dark/system/portal behavior, shared-control geometry and states, numeric composed contrast, and twelve-environment true-zoom matrices. The semantic validator rejects build-only mappings for these visual/behavioral ACs. Axis A accepted the stale disabled-token checker disposition and all 21 remapped rows.
- Fresh actual-product suites cover composition/focus/conflict/search/ACL/gestures, version restore, new-version/file outcomes, PAT, trash, sharing, workspace management/create, offboarding, index queue, resilient app states, instance retention/settings leave, and the current role edges.
- Fresh component matrices cover shared controls/fields/overlays/data, shell/tree/search/right panel/editor/theme/complex content, relocation, principals, audit, versions and conflict.
- Additional TDD fixes found by the expanded run: disabled readable text contrast, search focus-outline clipping, audit focus-outline scaling, offboarding heading focus, and stale asynchronous assertions in owner checkers.
- Native Windows IME and native OS high contrast remain the explicit non-blocking untested limitations in the Astra addendum. No native claim is made.
