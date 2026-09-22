# Issue #51 TDD chronology

Times are local `+09:00`. Every `review-red-replayed-*` run was made after manually removing the named product implementation and before restoring the smallest implementation. No test or product file was hidden, and no assertion was weakened to obtain GREEN.

## Original RED coverage

| Final contract | Raw RED and observed failure | Scope of proof |
|---|---|---|
| New-note toolbar uses primary; external file drop marker and cleanup; common favorites empty copy; synchronous favorite focus | `red-vitest.txt` — 2026-09-17 03:12:57.124 | The raw output reaches and reports the exact primary, active drop marker, empty-state, and focus failures. Later assertions in the two tree tests were not reached because of the earlier assertion/backend failure, so this log is not claimed as proof for them. |
| Real product row height is 40 px | `red-playwright-product.txt` — 2026-09-17 03:13:07.872 | Actual `AppShell`/`DocumentTree` fixture measured the former 28 px row and failed before later checker assertions. It proves row height only. |
| Read-only row differs from editable without being a disabled tree item | `red-readonly-playwright.txt` — 2026-09-17 03:19:53.364 | Focused Playwright run failed the computed-color assertion before the read-only CSS was added. |

## Review correction RED coverage

| Final contract | Removal/reproduction and raw RED | GREEN |
|---|---|---|
| Tree/favorites real query loading versus error versus successful empty; retry uses existing `refetch`; rejected naming remains open with a safe message and `aria-invalid` | `review-red-query-naming-states.txt` — 03:34:57.930. The four tests failed against the former App wiring before the state/error implementation. | `review-green-query-naming-states.txt` — 03:39:52.186, 4/4 passed. |
| Delayed invalidate/refetch removal focuses next, then previous, then Favorites tab; an unrelated intermediate render cannot consume the intent | `review-red-delayed-focus-playwright.txt` — 03:34:08.953, actual product components at 500x720 failed “delayed removal did not focus the next remove control”. | Included in `review-final-playwright.txt` and the final matrix. |
| 40 px row, 36 px expander, 16 px icon; 2 px selected marker; keyboard name-description surface; 240 px internally scrolling menu with 36 px items | The corresponding constants/CSS rules were manually removed together. `review-red-replayed-geometry-playwright.txt` — 03:46:57.361 records independent failures for row (`28`), selected marker (`auto`), description surface (`false`), and menu width (`103`). Because the removed menu assertion threw before cleanup, the later height/favorites lines in this particular raw run timed out and are not cited for those contracts. | `review-green-replayed-geometry-playwright.txt` — 03:50:06.628. |
| Favorite row `min-height:52px`, 6 px vertical padding, two-column wrapping layout, always-visible 36x36 remove control | The favorite layout declarations were manually removed. `review-red-replayed-favorites-geometry-playwright.txt` — 03:47:56.871 records computed `min-height:0px` instead of `52px`. | `review-green-replayed-geometry-playwright.txt`. |
| Tree height comes from the remaining viewport instead of the former fixed 640 px | ResizeObserver sizing was manually removed and height restored to 640. `review-red-replayed-dynamic-height-playwright.txt` — 03:48:48.743 records tree/viewport height mismatch. | `review-green-replayed-geometry-playwright.txt`. |
| Composition Enter does not submit; a separate Enter after composition end submits once | The composition guard was manually removed. `review-red-replayed-composition-playwright.txt` — 03:48:24.467 records that composition Enter submitted `조합 뒤 확정.md`. | Final product checker GREEN. This is synthetic composition-event coverage, not an OS IME candidate-window claim. |
| Inline naming input is connected to the fixed help/error region | `aria-describedby` was manually removed. `review-red-replayed-naming-help-playwright.txt` — 03:50:23.855 records “inline naming input has no help description”. | Final product checker GREEN. |

## Final checker assertion audit

The final `newspaper-tree-layout-check.cjs` assertions map as follows:

- Row height/data attribute, toolbar, read-only distinction, description surface, menu geometry, file-drop marker, naming help, composition, delayed favorite focus, successful empty, and remaining-height/200% reachability map to the RED rows above.
- Menu disabled state and Radix ArrowDown/Escape movement are preservation checks for the pre-existing `NodeMenu` permissions and Radix behavior. Issue #51 changed its surface/item styling only; the styling removal RED is the menu-geometry replay. No new disabled or keyboard policy implementation was introduced.
- The screenshots and the new loading/error/naming-error state scenarios were added after the state RED. They refine observable evidence for the already-red behavior; they do not introduce another product behavior. Their GREEN is `review-final-playwright.txt`.
- Light/dark and 1280/1440/1920 repetitions, and genuine `chrome.tabs.setZoom(2)`, repeat the same contracts under required environments. They are verification dimensions rather than separate product behavior implementations.

The original final checker was indeed expanded after the first implementation. This document does not treat its first failing line as proof for assertions that were never reached. Those gaps are covered by the explicit removal RED runs above.

## Second re-review RED corrections

The earlier `review-red-query-naming-states.txt` naming case is **not** evidence for server rejection: it stopped at the Radix menu lookup. It is superseded for that behavior by the focused run below.

| Contract | Relevant raw RED | GREEN |
|---|---|---|
| A delayed rename accepts exactly one Enter submission and exposes a disabled, busy input while pending | `rereview-red-pending-empty-playwright.txt`: the real AppShell/DocumentTree path reached the call-count assertion and reported `'2' !== '1'`. | `rereview-green-pending-empty-playwright.txt`. |
| A delayed create accepts exactly one Enter submission | `rereview-red-create-pending-playwright.txt`: the expanded directory's real Radix `새 문서` path reached the call-count assertion and reported `'2' !== '1'`. | `rereview-green-pending-empty-playwright.txt`. |
| Empty trimmed input emits no request and exposes connected visible invalid help, then clears when edited to non-empty | `rereview-red-empty-invalid-playwright.txt`: it reached the empty invalid assertion and reported `null !== 'true'`. | `rereview-green-pending-empty-playwright.txt`; screenshot `green-state-empty-name-invalid.png`. |
| Actual tree and favorites loading marks the corresponding tabpanel busy and clears on ready | `rereview-red-aria-busy.txt`: both focused tests reached `aria-busy` and reported `null !== 'true'`. | `rereview-green-states.txt`, 5/5. |
| Server naming rejection retains the input, marks it invalid, and exposes only the safe reason | The `namingError` delivery prop was manually removed after the stable menu/input lookup existed. `rereview-red-server-naming-error.txt` reaches the `aria-invalid` assertion on the connected textbox and reports `null !== 'true'`; it does not fail at menu timing. | `rereview-green-states.txt`. |

The checked-in matrix now waits for the naming textbox to detach and the rebuilt target row to become visible. It contains no time-based settle for this transition. `rereview-matrix-run1.txt` and `rereview-matrix-run2.txt` are consecutive passes of that exact checked-in file, including all six desktop environments, state cases, delayed favorites focus, and genuine extension zoom.