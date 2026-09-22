# Issue 58 TDD chronology

| Contract | Pre-implementation RED | GREEN |
| --- | --- | --- |
| Image pending/load/error/retry state | `red-rtl.txt`, missing named preview region | `green-rtl.txt`, focused state transitions 5/5 suite |
| Binary selection is not consent; L2 cancel/accept one-shot | `red-rtl.txt`, `onPick` already called at selection | `green-rtl.txt`, selection 0 / cancel 0 / affirmative 1 |
| Target identity invalidates selection | `red-rtl.txt`, missing guarded action | `green-rtl.txt`, disabled action and selected name removed |
| Image computed fit/bounds | `red-playwright-geometry.txt`, reached `fill !== contain` after removing the newly added fit slice | `green-playwright-final.txt`, 12/12 |
| Native download bytes/name | Existing stable link behavior passed the pre-product RTL test; the final browser assertion refines integration measurement and did not motivate a product behavior change | `green-playwright-final.txt`, event/name/hash pass |
| IR-SHELL-010 review repair: result contract, binary result focus, single focus owner | `review-fix-red-vitest.txt`, 3 failures / 11 passes | `review-fix-green-vitest.txt`, 14/14 |
| IR-SHELL-010 strict rebuild: original async contract removed before execution | `ir-shell-010-rebuild-preimplementation-red.txt`, 10 failures / 6 passes with App/AppShell/DocumentTree/NewVersionPrompt async and focus implementation absent | `ir-shell-010-rebuild-green-vitest.txt`, 85/85 targeted integration and regression tests |
| IR-SHELL-010 missing or permission-removed close target fallback | `ir-shell-010-fallback-red.txt`, selected-row and tree-region fallback both failed before the fallback implementation | `ir-shell-010-rebuild-green-vitest.txt`, both fallback cases pass; `ir-shell-010-rebuild-playwright.txt` passes the isolated product matrix |
| IR-SHELL-010 unavailable tree region → document-tree tab | `ir-shell-010-tab-fallback-red.txt`, 1 failure / 16 skipped with the callback implementation removed | `ir-shell-010-tab-fallback-green.txt`, complete issue58 suite 17/17 |
| IR-SHELL-010 stale last-focus target → current selected row | `ir-shell-010-stale-last-focus-red.txt`, 1 failure / 17 skipped: removed target remained in `lastFocusedNodeId` and incorrectly skipped a separate `aria-selected` row | `ir-shell-010-stale-last-focus-green.txt`, targeted integration/regression 87/87; `ir-shell-010-stale-last-focus-full-web.txt`, full web 751/751; `ir-shell-010-stale-last-focus-playwright.txt`, isolated product matrix pass |

The browser checker was added after component behavior because the behavioral axes already had reached pre-implementation RTL RED. Its visual image-fit assertion was separately made test-first by removing only that unproven CSS slice, running the checked-in assertion to RED, and restoring the minimum slice. No test was hidden or weakened.

The original run had no raw pre-implementation RED artifact. On 2026-09-17 the strict rebuild removed only IR-SHELL-010 production slices from `App.tsx`, `AppShell.tsx`, `DocumentTree.tsx`, and `NewVersionPrompt.tsx`, while preserving issue 58 image/download and binary L2 design changes. The checked-in IR tests were then executed against that implementation-free state and produced the raw 10-failure log above. The async contract and focus restoration were subsequently rebuilt without weakening those tests. This is a new observed chronology, not a reconstruction or backdated claim about the original run.
