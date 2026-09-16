# Issue #51 independent review

Review base: `8e548b8d8d5df61107347769a029cc2303d7a3b3`

Verdict: **FAIL — 1 High, 2 Medium, 1 Low.** No Critical finding.

This review used the issue body, the current diff, `AGENTS.md`, `docs/spec/00.index.md`, `FR-SHELL-001`, `FR-SHELL-003`, `FR-SHELL-015`, `FR-SHELL-016`, `IR-SHELL-009` AC-3, and `astra-decision.md`. The requirements are eligible for this work: FR-SHELL-001 and FR-SHELL-003 are `verified/stable`, FR-SHELL-015 and FR-SHELL-016 are `verified/evolving`, and IR-SHELL-009 is `in_progress/stable`. No draft or deprecated requirement was implemented.

## Findings

### High — required real loading, error, and invalid states remain disconnected and failures are presented as other states

The claim in `README.md` that the component contracts do not currently receive loading, load-error, or server naming-error inputs is factually true, and the diff does not fabricate those states. It is not a valid completion result under the binding decision. `astra-decision.md` §§3, 7, 9, and 10 require thin delivery of actual states and explicitly say that an unconnected state is incomplete rather than not applicable.

Exact product paths:

- `packages/web/src/App.tsx:957` returns the same bare `<div data-state="loading" />` for every `!tree.isSuccess` value. A real tree query failure is therefore presented indefinitely as loading, and neither the tree list nor a persistent error/retry state is rendered.
- `packages/web/src/App.tsx:1002` passes `favorites.data ?? []`. Both initial loading and query failure therefore reach `FavoritesView` as a successful empty array, which displays “즐겨찾기한 항목이 없습니다.” This violates the requirement that failure must not be disguised as an empty result.
- `packages/web/src/App.tsx:409-415` swallows rename failure, while `App.tsx:523-533` maps create failure to `null`. `DocumentTree` receives no naming error. The new fixed help area consequently has no error boundary, `aria-invalid`, or connected error text. Empty input is silently ignored; actual server rejection cannot be displayed.
- `DocumentTree` and `FavoritesView` expose no loading/error state inputs or retry path, so the shipped fixture cannot exercise the required real states.

Reproduction is static on the actual product wiring: inspect the query branches above and compare them with the props passed at `App.tsx:993-1017`. The full test suite passes because the new fixture supplies successful static arrays and the browser checker never creates delayed, failed, or naming-error responses.

Required correction: route the existing query and naming result states through the smallest existing product boundary, render shared `LoadingState`/persistent error and retry only where a real retry exists, preserve successful empty separately, and expose the real naming error in the fixed help area with `aria-invalid`. This does not require a new request engine or replicated server validation rules.

### Medium — favorite removal loses focus on the real asynchronous update path

`FavoritesView.tsx:38-43` runs its focus effect for both `favorites` and `onEmptyFocus`. `AppShell.tsx:759` creates a new inline `onEmptyFocus` function on every render. After a remove click, any render before the asynchronously invalidated favorites query returns the changed list causes the effect to focus an old button and clear `pendingIndex`. When the query result finally removes that button, no pending request remains and focus falls to the document body.

Independent Playwright reproduction against the real `FavoritesView` module:

1. Render two favorites with an `onUnfavorite` that causes an immediate unrelated rerender and applies the filtered list 100 ms later, matching the product's invalidate/refetch timing.
2. Click the first remove button and wait 160 ms.
3. Observed: one row remains, `document.activeElement.tagName === "BODY"`, and no active label exists.

The shipped unit and Playwright fixtures mutate the array synchronously, so both pass and hide this integration race. The effect must wait for evidence that the clicked node has actually disappeared, rather than consuming pending focus on callback identity or another render. The same race can lose the required return to the Favorites tab after removing the last row.

### Medium — strict TDD chronology does not cover the final browser behavior

The initial automated RED is genuine for several broad contracts: `newspaper-tree.test.tsx` existed at 03:11:54, `red-vitest.txt` was captured at 03:12:57, and the first product edits followed at 03:15:43. It records seven failing test cases. The initial real-component Playwright RED at 03:13:07 also genuinely records the pre-change 28 px row against the required 40 px row. The late readonly RED at 03:19:53 precedes the corresponding CSS edit at 03:19:57.

The final browser checker was nevertheless edited after the main implementation: its current mtime is 03:19:46, after `DocumentTree.tsx` at 03:15:43 and `FavoritesView.tsx` at 03:18:54. The initial RED stack shows `matrix` at line 44, while the current checker has it at line 61; the added assertions sit before `matrix`. The only initial Playwright failure reached was row height at line 19, so raw evidence does not establish pre-implementation RED for the later menu geometry, readonly styling, drag marker, long-name description, composition behavior, or favorite focus checks. Some unit RED cases also failed through a leaked “Cannot have two HTML5 backends” test-environment error rather than the named assertion.

There is no raw pre-implementation RED for the final CSS contracts such as 52 px favorite rows, 36 px remove controls, wrapping, 240 px menu geometry, dynamic remaining height, or the asynchronous product focus path above. Existing tracked tests were not weakened; the relevant new files are untracked and no pre-existing test diff was changed. This finding concerns missing test-first proof, not a weakened old assertion.

Strict remediation requires removing each affected implementation slice, running a focused test that fails for its intended assertion, then minimally reimplementing it and preserving raw RED/GREEN evidence. A test-after replay without removing the implementation would not satisfy `AGENTS.md`.

### Low — browser evidence overstates state and screenshot coverage

The shipped checker executes the real `AppShell`, `DocumentTree`, and `FavoritesView`, and its computed checks are useful. Its six 100% screenshots are taken only after both favorites have been removed. They show an empty Favorites panel, not the tree rows, hover/focus/selected states, menu, drag marker, long-name explanation, inline field, readonly row, or favorite row geometry. The single 200% screenshot is likewise a reachability snapshot, not the full state matrix. The checker also does not assert initial input focus/selection, Escape and empty-name request counts, forbidden drop targets, drop cleanup, selected marker geometry, favorite 52/36 px geometry/wrapping, or a delayed product update.

This does not invalidate the computed checks that did run. It means the screenshots and `README.md` cannot be used as evidence for all rows in `astra-decision.md` §9.

## Requirement and state mapping

- `FR-SHELL-001`: file/directory favorite rows, file open behavior, removal, empty shared state, and synchronous post-remove focus are implemented. The asynchronous product focus path fails as described above.
- `FR-SHELL-003`: the existing nine-item menu order and permission semantics remain intact. On a readonly file, independent Playwright observed new document, new directory, rename, move, delete, share, and new-version disabled; copy and favorite remained enabled. Every menu item measured 36 px and the surface measured 240 px.
- `FR-SHELL-015`: rename/move/copy menu reachability and permissions remain intact. The style change did not alter request policy. Rename failure is still swallowed and cannot populate the required invalid state.
- `FR-SHELL-016`: existing tests continue to cover initial focus/full selection, Enter, Escape, empty-name blocking, server-owned rules, and request count. The new synthetic composition check observes zero confirmation during composition and one after composition end. It is not evidence of an actual OS Korean IME candidate session.
- `IR-SHELL-009` AC-3: selected/default/hover/focus/readonly and successful empty styling are partly delivered. Actual loading, error, and invalid paths are incomplete, and favorites failure is misrepresented as empty.

State applicability:

- default/hover/focus/selected: applicable. CSS and browser calculations are present; the browser probe measured a 2 px focus outline and hover control background.
- disabled: applicable to menu actions. Radix `aria-disabled` semantics and keyboard movement remain intact.
- readonly: applicable. The row remains selectable/openable and copy remains enabled. Light computed text was editable `rgb(36, 37, 33)` versus readonly `rgb(94, 95, 88)`; disabled uses a separate `#74766d` token. This review does not classify that readable secondary treatment as disabled behavior.
- invalid: applicable to empty input and real server rejection; incomplete as described in the High finding.
- loading/error: applicable because TanStack queries have those states; incomplete and sometimes misrepresented.
- empty: applicable only after successful empty data. The approved common `EmptyState` copy is correct, but product wiring also uses it for pending/failed favorites.

## Independent browser measurements

The shipped Playwright checker passed at 1280×720, 1440×900, and 1920×1080 in light and dark. The current `green-measurements.json` records tree rectangles including 1280 light/dark `x=0, y=77, width=300, height=541` after the inline naming check, and 1920 light/dark `height=901`. The smaller post-naming height includes the fixed naming-help row and demonstrates that it is removed from tree allocation.

An independent initial-state probe at 1280×720 measured:

- shell `1280×720`;
- tree toolbar `y=24, height=53`;
- tree viewport `x=0, y=77, width=279, height=589.656`;
- settings row `x=0, y=668, width=279, height=52`, static positioning, with no overlap;
- tree row `40 px`; expander controls `36×36 px`;
- expanded 45-item directory exposed 49 treeitems and internal scrolling;
- at 500×720, the tree viewport was `179 px` wide with `scrollWidth=300`, which keeps deep indentation overflow inside the tree as required.

The menu measured `240×334`, all nine items measured 36 px, and keyboard movement remained inside Radix semantics. Internal tree dragging remains disabled through `disableDrag` and `disableDrop`. External accepted-file drag activates the marker and both `dragleave` and `drop` clear it. A synthetic Escape after synthetic `dragenter` left the marker active; this is not treated as a product failure because Playwright cannot reproduce an OS-originated file drag cancellation, which normally supplies the browser leave/cancel transition. It remains a genuine manual limitation.

The genuine 200% check passed using isolated persistent Chromium plus an extension calling `chrome.tabs.setZoom(tabId, 2)`. Reported zoom was exactly `2`, CSS viewport `394×406`, and the last row, Favorites remove control, and Settings remained reachable. No CSS zoom, device-scale substitution, half viewport, or CDP emulation was used.

## Commands and results

- `npm exec --workspace @doculight/web vitest -- run test/newspaper-tree.test.tsx` — 1 file, 7/7 tests passed.
- `npm test --workspace @doculight/web` — 64 files, 700/700 tests passed. The pre-existing Happy DOM `URL is not a constructor` console trace occurred, but exit status was 0.
- `npm run typecheck --workspace @doculight/web` — passed.
- `npm run build --workspace @doculight/web` — passed, 2,980 modules transformed; existing bundle-size warning only.
- `node packages/web/test/newspaper-tree-layout-check.cjs` — passed six light/dark desktop cases and the genuine extension zoom case.
- `node packages/web/test/newspaper-shell-layout-check.cjs` — passed the #50 boundary, keyboard, and genuine zoom regression matrix.
- `node test/theme-runtime-check.mjs` from `packages/web` — 5 checks passed, 0 failed.
- `npm test --workspace @doculight/editor` — 21 files passed, 253 passed and 1 skipped.
- `node test/editor-styles-check.mjs` from `packages/web` — not runnable because the checkout has no authenticated product account or running API session; the script exited with its documented login prerequisite. No claim is made for authenticated editor product-flow verification.
- `git diff --check 8e548b8` — no whitespace error; only Git line-ending warnings.

The synthetic composition event test only verifies the React/browser composition-event boundary. Actual Korean OS IME candidate-window input remains unverified. Authenticated product flows, real query latency/failure, and actual server naming rejection remain unverified in the shipped fixture; the static wiring inspection above shows those state paths are currently incomplete.
