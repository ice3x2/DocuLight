# Issue 51 verification

Requirement coverage: IR-SHELL-009 AC-3, FR-SHELL-001, FR-SHELL-003, FR-SHELL-015, FR-SHELL-016.

- `tdd-chronology.md` maps each final checker behavior to the exact original or manual-removal RED. It states where an early failure did not prove later assertions.
- `review-red-query-naming-states.txt` proves the original TanStack tree/favorites loading and error gaps only. Its naming case stopped at menu timing and is not cited as naming RED; the relevant replacement is listed below.
- `review-red-delayed-focus-playwright.txt` and the final browser GREEN cover an unrelated rerender followed by delayed favorite removal; focus waits for the removed node to disappear.
- `review-red-replayed-*.txt` preserve Playwright RED from manually removed geometry, dynamic-height, composition, and naming-description implementations.
- `review-green-product-states-playwright.txt`, `green-measurements.json`, and the `green-*` images cover actual `AppShell`, `DocumentTree`, and `FavoritesView` at 1280x720, 1440x900, and 1920x1080 in light/dark, plus isolated persistent Chromium with `chrome.tabs.setZoom(tabId, 2)`.
- `green-tree-selected-focus-*` captures tree rows; `green-favorites-rows-*` captures populated favorite rows; `green-favorites-empty-*` captures successful empty; `green-state-tree-*`, `green-state-favorites-*`, and `green-state-naming-error.png` capture the named product-component states. Computed assertions, rather than screenshots alone, verify geometry and interaction.

The browser check uses synthetic `compositionstart`/`compositionend` because Playwright cannot operate an OS IME candidate window reproducibly. It verifies only the product composition-event boundary: Enter during composition does not submit, and a separate Enter after composition end submits once. No CSS zoom, `deviceScaleFactor` substitution, half-size viewport, or CDP zoom emulation is used.

Tree and favorites errors display fixed product copy and only expose retry through their existing TanStack `refetch`. Inline naming displays only the existing `ApiError.detail.reason` safe user-message contract; arbitrary thrown error text is replaced with fixed copy. No request engine, validation rule, retry policy, or server behavior was added.
Final regression results:

- Final targeted: 3 files, 20/20 tests passed.
- Full web: 65 files, 705/705 tests passed. The existing Happy DOM URL console trace remains non-fatal.
- Editor: 21 files, 253 passed and 1 skipped.
- Web typecheck and production build passed; the existing bundle-size warning remains.
- Shared UI Playwright: 13 assertions passed, including genuine 200% zoom.
- Theme Playwright: 5 checks passed. Shell regression and issue #51 product-component matrix passed.
- Authenticated editor-styles Playwright could not start because this checkout has no test account/API session; its raw prerequisite failure is `review-editor-styles-playwright.txt`. No authenticated-flow result is claimed.
Second re-review additions:

- `rereview-red-pending-empty-playwright.txt` and `rereview-red-create-pending-playwright.txt` reach the duplicate-call assertions with two calls; the GREEN proves one call and disabled/`aria-busy` inputs for real rename and create paths.
- `rereview-red-empty-invalid-playwright.txt` reaches the empty-name invalid assertion. `green-state-empty-name-invalid.png` shows its fixed help alert; pending screenshots are `green-state-rename-pending.png` and `green-state-create-pending.png`.
- `rereview-red-aria-busy.txt` / `rereview-green-states.txt` cover actual query-backed tree/favorites tabpanel busy semantics.
- `rereview-red-server-naming-error.txt` replaces the earlier irrelevant naming RED and fails at the connected input's `aria-invalid` assertion after the server-error delivery was removed.
- `rereview-matrix-run1.txt` and `rereview-matrix-run2.txt` are consecutive passes of the checked-in race-free Playwright matrix.