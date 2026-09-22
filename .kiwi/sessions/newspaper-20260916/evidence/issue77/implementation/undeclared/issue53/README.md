# Issue 53 verification evidence

This directory records the test-first implementation evidence for the newspaper right sidebar covered by `FR-SHELL-004`, `FR-SHELL-009`, `FR-SHELL-010`, `FR-SHELL-011`, `SEC-WORKSPACE-004`, `SEC-WORKSPACE-005`, `IR-SHELL-006`, and `IR-SHELL-009`.

## Automated evidence

- `red-rtl-panels-navigation.txt`: the pre-implementation component failures for panel structure, empty/loading/error states, nested link activation, and unresolved-link semantics.
- `red-rtl-tag-fixed-states.txt`: the pre-implementation failure showing that tag scope and basis state were not retained while loading/error state replaced stale rows.
- `red-app-query-wiring.txt`: the actual `App` failure showing stale successful link data instead of the query error. The product wiring was removed before this RED run and restored only after the assertion failed.
- `red-playwright-right-panel.txt`: the pre-implementation Playwright failure at the computed list overflow assertion (`visible` instead of `auto`).
- `green-rtl-panels-navigation.txt`: component and actual-App tests after implementation.
- `green-app-query-wiring.txt`: focused actual-App query-state result.
- `green-playwright-right-panel.txt`: the checked-in Playwright checker over all 12 environments.
- `green-measurements.json`: viewport, browser zoom, panel/list geometry, state, and interaction measurements captured by the checker.
- `green-right-*.png`: light/dark screenshots at 1280×720, 1440×900, and 1920×1080 at 100% and genuine Chromium 200% tab zoom.
- `fixer-red.txt`: review-fix RED for shared empty-state reuse and focus restoration.
- `fixer-green.txt`: targeted/full/static/build/browser GREEN and the corrected evidence boundary.

The browser checker uses the shipped `AppShell`, `LinkPanel`, and `TagPanel` components. It does not mount `App`; actual `App` query wiring is covered by `right-panel-wiring.test.tsx` in RTL. The 200% cases use an isolated persistent Chromium context and an extension calling `chrome.tabs.setZoom(2)`. They do not substitute CSS zoom, DPR changes, or a half-sized viewport.

## Coverage and limits

The Playwright fixture asserts backlink-list `overflow-y:auto`, unchanged tag-header position after assigning the tag list's scroll offset, link targets at least 36px high, tag targets at least 40px high, computed focus/action/selected semantic colors, focus containment within the link list, recursive nested resolved-link activation by Enter and Space, unresolved noninteractive rows, and the search-tab transition after a tag click. It runs those checks in light/dark at 1280×720, 1440×900, and 1920×1080 at 100% and genuine Chromium 200% tab zoom. A separate 1280×720 scenario asserts backlink loading/empty/error/no-document states with retry-success focus restoration.

Long Korean and unbroken names and large counts are present in the fixture and screenshots, but the checker does not assert line wrapping, count right alignment or non-overlap, or exact 2px outline width plus 2px offset. The RTL tests separately assert the tag query text, tag loading/error behavior, and actual `App` query-error/refetch wiring. Exact workspace ACL, hidden/deleted/reserved-node filtering, server ordering, duplicate-occurrence behavior, rapid real-query races, and full-App browser navigation remain outside the Playwright fixture. Error messages in the shell remain fixed safe UI text rather than raw server payloads.

## Regression results

- Review-fix targeted component and shell tests: 36/36 passed.
- Actual App query-state wiring: 1/1 passed.
- Link/tag service regressions: 39/39 passed.
- Full web suite: 721/721 passed.
- Web TypeScript check: passed.
- Web production build: passed (existing chunk-size advisory only).
- Issue 53 Playwright matrix: 12/12 environments passed.
- Issue 50 shell, issue 52 search, and theme runtime Playwright regressions: passed.
