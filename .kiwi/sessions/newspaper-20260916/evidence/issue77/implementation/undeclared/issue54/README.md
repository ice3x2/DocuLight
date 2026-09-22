# Issue 54 evidence

Requirements: `IR-EDITOR-001`, `IR-EDITOR-002` (partial AC-1/2/5), `FR-EDITOR-003`, `FR-EDITOR-007`, and `FR-EDITOR-009`.

## TDD evidence

- `review-red-final.txt`: after removing every #54 product change, the finalized tests failed 3/3 editor assembly assertions, 2/2 old web source assertions, and the Playwright stable-host theme observation timed out. Product code was then reapplied from this RED state.
- `red-editor-contract.txt`, `red-web-contract.txt`, `red-playwright.txt`, and `red-merge-selection.txt` are the earlier exploratory records; `review-red-final.txt` is the binding redo required by the independent review.
- `review-final-verification.txt`: focused and full GREEN results plus the unchanged browser baseline.
- `green-measurements.json` and `green-editor-*.png`: six light/dark 100% runs and six genuine `chrome.tabs.setZoom(2)` runs at 1280×720, 1440×900, and 1920×1080.

The browser fixture renders the shipped `DocumentSurface`, `useAutosave`, common editor stylesheet, app theme files, CodeMirror editor, source textarea, open merge view, and real task checkboxes. It checks H1-H6/read/live/source typography, 799/800px container breakpoint behavior, exact Markdown round trip, light→dark→light/system state, computed foreground/background/search/selection colors, stable editor/source/merge identity, source selection, undo, IME deferral, zero theme-only saves, one explicit save, and actual checkbox pseudo styles/contrast/marker-only mutation.

The same runner first rebuilds web `dist`, then starts `vite preview`, mocks only the API boundary, mounts the real `App`/AppShell route, opens a document from the real sidebar, and verifies the fresh production bundle reaches the themed editor. Its retained screenshot is `green-editor-production-app.png`; `--production-smoke` runs this check alone.

## Verification

- Editor Vitest: 256 passed, 1 skipped.
- Web Vitest: 721 passed.
- Editor and web typecheck/build: passed; existing bundle-size advisory remains.
- New Playwright matrix: 12 environments passed.
- Existing editor browser baseline and final run are identical through the known KaTeX failure: general 12/12, table 4/4, drift 7/7, tag 2/2, KaTeX 3/4 with superscript top 178px versus base 177px. The aggregate therefore stops at KaTeX in both runs. Inline was run separately afterward and passed 6/6; no test was weakened.
- Web browser aggregate needs a running authenticated product/API pair and credentials and exited 2 before checks; the #54 isolated production-component Playwright run passed instead.
- Spec validation: errors 0, one pre-existing `SRS-W072` warning.

## Explicit limits

- The matrix fixture proves a real save request count/body through the hook; success/conflict/rejection server round trips remain unclaimed. Product assembly/theme reach is separately covered by the built App/AppShell preview smoke.
- A headed Windows native Korean IME run was not performed. Synthetic/native DOM composition behavior remains covered by existing tests, but native OS IME validation is pending and is not claimed.
- #55 retains rendered code, tables, KaTeX/Mermaid/error/cache/diff-specific styling and verification. No IR-EDITOR-002 AC was marked complete.
