# Issue 52 evidence

- `green-measurements.json` records six 100% environments and six genuine 200% environments using an isolated persistent Chromium context and `chrome.tabs.setZoom(2)`, including CSS viewport before/after values.
- `green-search-*.png` covers light/dark, 1280×720, 1440×900, 1920×1080, 100% and genuine 200%.
- `green-search-state-*.png` covers idle, loading, success-empty, and error/retry with the shipped AppShell/SearchPanel components.
- `review-green-playwright-12env.txt` covers cmdk virtual keyboard focus (2px outline with separation and clipping checks), pointer/keyboard distinction, unchecked and checked filter hover semantics, and Enter opening the keyboard-selected result exactly once.
- `review-red-overlap-identity.txt` and `review-green-overlap-identity.txt` record the permanent service and Express HTTP overlap regression for `alpha | alph`: one excerpt for a shared source location and a separate excerpt for a distinct source location.
- `rereview-red-stale-virtual-focus.txt` and `rereview-red-outline-clipping.txt` capture the Tab lifecycle and corrected four-edge 4px outline geometry failures. `rereview-green-playwright-12env.txt` verifies first/middle/last rows, stale-focus removal, and genuine 200% zoom.
- `rereview-red-or-order.txt` and `rereview-green-or-order.txt` capture service and actual HTTP equality for `alpha | alph` and `alph | alpha`.
- `independent-rereview-2.md` contains the independent fresh-process #51 checker visibility RED. `rereview3-green-tree-five-runs.txt` records five consecutive fresh-process passes after meaningful virtual-row readiness and fresh locator resolution were added.
- Synthetic composition events verify the event boundary. Actual OS Korean IME candidate-window input was not automated and remains unverified.
- Search input/filter have no readonly/disabled product contract; they remain operable while loading.
- Browser work used Playwright Chromium. The fixture Vite child was terminated by its owned process handle.
