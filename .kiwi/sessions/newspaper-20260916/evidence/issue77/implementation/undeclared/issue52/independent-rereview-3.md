# GitHub #52 final independent rereview

## Verdict

**PASS — Critical 0, High 0, Medium 0, Low 0.**

The remaining Low finding from `independent-rereview-2.md` is resolved. The checked-in #51 tree Playwright checker passed five consecutive executions in separate fresh Node processes, including its complete viewport/theme matrix, state and interaction checks, and genuine browser zoom check. No #52 product behavior changed in this remediation, and the previously resolved virtual-focus/outline and OR-order findings remain resolved.

## Visibility-race remediation

The diff replaces the racy `waitFor({ state: 'visible' })` followed by a separately resolved forced click with `visibleTreeRow(page, index)` and a normal Playwright click/focus. I inspected the helper against the requested sequence:

1. It creates a locator and waits for `attached`.
2. It calls `scrollIntoViewIfNeeded()` only when the current locator is not visible.
3. In the page it resolves the indexed tree item, requires a connected `HTMLElement`, nonzero width and height, and non-hidden computed visibility.
4. It waits one `requestAnimationFrame` and requires the same connected visible DOM node to remain at that index for the next frame.
5. It discards the prior locator, creates a fresh role locator, waits for `visible`, and returns that fresh locator for the actual action.

This directly addresses the observed virtual-row replacement window. The matrix also focuses the tree before resolving the row, dismissing the accessible long-name description that could otherwise intercept the pointer.

The remediation introduces no fixed sleep, forced click, retry wrapper, assertion catch, skip, or stored `ElementHandle`. The only swallowed exception in the file remains the pre-existing fixture-server availability poll. The pre-existing 160ms delayed-favorite fixture waits and 400ms browser-zoom settling wait are outside this diff and are not used by the new helper. All product, accessibility, geometry, focus, state, and genuine-zoom assertions remain present.

## Independent fresh-process stress run

I executed the unchanged checked-in command five times sequentially, with each invocation creating a new Node process, Vite child, Chromium instance, and isolated persistent Chromium profile for genuine zoom:

```text
Run 1: PASS newspaper tree layout, state, and interaction checks
Run 2: PASS newspaper tree layout, state, and interaction checks
Run 3: PASS newspaper tree layout, state, and interaction checks
Run 4: PASS newspaper tree layout, state, and interaction checks
Run 5: PASS newspaper tree layout, state, and interaction checks
```

Each run retained:

- light and dark inspection at 1280x720, 1440x900, and 1920x1080;
- 40px tree-row geometry and 240px internally scrolling menu assertions;
- long-name hover/focus accessible description checks;
- selection/focus screenshots and favorites delayed-focus assertions;
- loading, error, empty, naming-error, permission, keyboard, and drag/drop assertions;
- genuine 200% zoom via isolated persistent Chromium, extension permission `tabs`, and `chrome.tabs.setZoom(2)`;
- 200% reachability of the last tree row, settings, and favorites controls.

The prior FAIL/PASS/PASS behavior was not reproduced in any of the five new processes.

## #52 and #51 regression checks

- `node packages/web/test/newspaper-search-layout-check.cjs`: PASS, all 12 environments. This retains the six light/dark 100% cases and six genuine `chrome.tabs.setZoom(2)` cases, first/middle/last four-edge outline geometry, virtual-focus lifecycle, filter behavior, result states, and IME boundary assertions.
- `npm exec --workspace @doculight/web vitest -- run test/search-filter.test.tsx test/search-wiring.test.tsx test/tag-panel.test.tsx`: 3 files, 30/30 PASS.
- `node packages/web/test/newspaper-tree-naming-state-check.cjs`: PASS, including pending, repeated Enter request count, stale-attempt isolation, and empty-invalid behavior.
- `git diff --check 7fe1b32 -- packages/web/test/newspaper-tree-layout-check.cjs .kiwi/sessions/newspaper-20260916/evidence/issue52`: no whitespace errors; only the repository's line-ending conversion warning.

The final remediation diff is confined to `packages/web/test/newspaper-tree-layout-check.cjs` plus evidence documentation. It does not alter `SearchPanel`, search CSS, the search fixture/checker, or server search logic after the prior rereview. Static diff inspection and the passing #52 checker/tests therefore confirm that the earlier fixes remain intact:

- Tab, Shift+Tab, filter activation, and pointer movement clear keyboard virtual focus; returning to the input and pressing an Arrow key restores it.
- The 2px outline plus 2px offset remains contained for the representative first/middle/last rows, while naturally oversized long rows remain independently scroll-reachable.
- `alpha | alph` and its reverse retain identical stable documents/excerpts while distinct offsets, axes, and PDF pages remain separate.

No process was terminated by image/name, and no broad `node.exe` kill was used.

## Evidence limit

As in the prior review, the browser fixture uses the shipped AppShell components with controlled callbacks rather than an authenticated live backend, and IME coverage uses synthetic composition events rather than a real Korean OS candidate window. Those known limits are unchanged and do not affect the visibility-race conclusion.
