# GitHub #53 final independent rereview

## Verdict

**PASS — Critical 0, High 0, Medium 0, Low 0.**

All previously reported findings are resolved in the current diff. This review used the original issue and SRS contracts rather than the implementer's conclusions.

## Prior-finding disposition

- **Actual behavior and security:** `App` now maps real React Query link/tag failure, refetch, and in-flight state into `AppShell`; error takes precedence over stale successful data and the displayed message is fixed safe UI text rather than the server payload. `AppShell` opens resolved rows by the supplied node ID through recursive `nodeById`, including nested duplicate names, and preserves `onOpen(found, false)`. Unresolved rows remain noninteractive and expose only the common `미해결` treatment. The targeted server regressions confirm backlink/tag filtering, ordering, occurrence, and response contracts remain intact.
- **EmptyState and states:** successful empty backlinks, outgoing links, and tags reuse the shared `components/ui/states.tsx` `EmptyState`. Loading, success-empty, error, retry-success, and no-document states remain distinct; stale rows are absent during loading/error. Only loading tabpanels receive `aria-busy`.
- **Focus and keyboard:** `FocusRestoreBoundary` records focus within the changing subtree and restores it to the active Radix tab only when the old focused node disappears and focus has fallen to body/disconnected DOM. It does not restore after a deliberate move outside. Row, retry, scope, active-document, and tab identities are separated. Native link/tag buttons retain single click, Enter, and Space activation; the Playwright run exercised Space on outgoing and retry, Enter on backlink, exact nested target opening, and retry-success focus restoration.
- **CSS selector and grid:** the active selectors target `[data-tag-row] > button`, so the interactive element owns the computed two-column `minmax(0, 1fr) auto` grid. Link/tag flex shrink chains have `min-width:0` and `min-height:0`; lists own `overflow-y:auto`; fixed tag controls remain outside the list; targets are at least 40px with a 36px minimum required by the issue; and computed semantic colors/focus containment passed in light and dark. The checker uses a fresh button locator under `data-testid=tag-row`, avoiding the earlier ambiguous selector.
- **Evidence honesty:** `README.md`, `evidence-fix.md`, `tdd-chronology.md`, and SRS VE-7/VE-8/VE-9 now distinguish the AppShell/component Playwright fixture from the real `App` RTL wiring test and server ACL tests. They expressly do not claim checked assertions for wrapping, count alignment/non-overlap, exact 2px outline plus 2px offset, nonzero tag-list scrolling, exact workspace ACL preservation, or full product App Playwright wiring. Long content remains fixture/screenshot input only for those unasserted axes.
- **SRS status:** `IR-SHELL-009` remains `in_progress`; AC-3 is still unchecked. The added verification rows describe only partial backlink/outgoing/tag coverage and do not claim whole-AC completion. `IR-SHELL-006` AC-10 also remains unchecked. No requirement was promoted or overclaimed.

## TDD chronology audit

The preserved REDs reach their intended behavior assertions rather than failing in setup:

- `red-rtl-panels-navigation.txt` reaches six missing structure, empty, nested-navigation, and query-state assertions.
- `red-rtl-tag-fixed-states.txt` reaches the missing loading-state/stale-row assertion.
- `red-playwright-right-panel.txt` reaches computed `overflow-y` and observes `visible` instead of `auto`.
- `red-app-query-wiring.txt` reaches the real safe-error assertion after the premature App wiring was removed, while stale `오래된 링크` remains visible.
- `fixer-red.txt` records the four focused review-fix failures: two missing shared EmptyState ancestors and two focus losses to body. The final test files were written at 06:06:26, before `LinkPanel.tsx`/`TagPanel.tsx` at 06:07:41 and `AppShell.tsx` at 06:08:11. The App wiring test was written at 05:57:18, its RED at 05:57:30, and `App.tsx` restored at 05:57:37. The initial raw RED logs predate their GREEN logs and final product sources.

The permanent tests still assert the same contracts; no assertion was skipped, loosened, force-clicked, or replaced with an arbitrary delay. The checked-in browser script uses locator/actionability waits and only polls Vite startup. It contains no `force` interaction, assertion swallowing, CSS zoom, device-scale substitution, or half-viewport emulation.

## Independent commands and results

All commands were run from the current workspace without terminating any unrelated process:

| Command | Result |
| --- | --- |
| `npm test -- --run test/link-panel.test.tsx test/tag-panel.test.tsx test/shell.test.tsx test/right-panel-wiring.test.tsx` (`packages/web`) | PASS, 4 files / 37 tests |
| `node test/newspaper-right-panel-check.cjs` (`packages/web`) | PASS, 12 viewport/theme/zoom environments plus 1280×720 state scenario |
| `npm test -- --run` (`packages/web`) | PASS, 66 files / 721 tests; known happy-dom anchor-navigation diagnostic printed without a failed test |
| `npm run typecheck` (`packages/web`) | PASS |
| `npm run build` (`packages/web`) | PASS; existing chunk-size advisory only |
| `npm test -- --run test/app/document/link-servable.test.ts test/app/document/link-service.test.ts test/app/document/tag-service.test.ts test/http/workspace-api.test.ts` (`packages/server`) | PASS, 4 files / 127 tests |
| `git diff --check` | PASS |

The independent Playwright output reports `chrome.tabs.getZoom() === 2` for every genuine-zoom run. Recorded CSS viewports changed from 1280×720 to 640×360, 1440×900 to 720×450, and 1920×1080 to 960×540 while DPR remained browser-reported. Six 100% and six genuine 200% light/dark environments passed with `overflow-y:auto`, semantic token equality, two computed grid tracks, focus containment, keyboard activation, unresolved nonactivation, and tag-to-search transition.

## Scope and residual limits

The current product/test changes are confined to #53's right-panel presentation, real query-state wiring, recursive resolved-link opening, focus restoration, and their tests. The SRS edits add partial verification evidence and an explicit limitation note; they do not change requirement text or status. Workspace-wide Kiwi status/orchestration files and other issue evidence already present in the shared uncommitted tree are outside #53 and are not used as proof here.

The browser fixture mounts the shipped `AppShell`, `LinkPanel`, and `TagPanel`, not authenticated `App` plus a live server. Actual App error/refetch behavior is covered by RTL, and ACL/filter/order behavior by server tests. This limitation is accurately recorded and is why IR-SHELL-009 AC-3 remains unchecked; it is not a residual #53 finding or an overclaim.
