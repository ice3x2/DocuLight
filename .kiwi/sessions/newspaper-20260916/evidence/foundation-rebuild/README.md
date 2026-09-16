# Foundation rebuild GREEN evidence

Scope: GitHub issues #43/#44 under `IR-SHELL-006` AC-1/3/4/7/8, `CON-ARCH-004`, and `IR-EDITOR-001`. This directory records implementer evidence only; it is not an independent review result.

## RED reproduced before implementation

- `red-component.log`: exit 1, missing public component barrel.
- `red-browser.log`: exit 1, 23 failed computed-style/geometry assertions.
- `red-build.log`: exit 0, confirming the baseline app could build.
- `red-dist.log`: exit 1, 17 failed dependency/license/built-CSS assertions.

## GREEN foundation results

- `green-component.log`: exit 0, 4/4 tests.
- `green-browser.log`: exit 0, 32/32 assertions across 1280×720, 1440×900, 1920×1080, and the explicitly non-actual-zoom 640×360 applicability case.
- `green-typecheck-web.log`: exit 0.
- `green-build-fresh.log`: exit 0; production build automatically emitted `THIRD_PARTY_NOTICES.md` and complete direct dependency/shadcn license files.
- `green-dist.log`: exit 0, 19/19 dependency pin, exact-license, provenance, CSS connection, and built-style assertions. The shadcn license is 1063 bytes with SHA-256 `1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f`.

## Browser evidence

- `actual-browser-foundation.json`: overall pass. Dev 3/3 and production 3/3 at 1280×720, 1440×900, and 1920×1080.
- `dev-*.png`, `production-*.png`: viewport screenshots.
- `actual-zoom-100.png`, `actual-zoom-200.png`: genuine full-Chromium zoom captures.
- Genuine zoom technique: isolated temporary Chromium profile and temporary extension using `chrome.tabs.setZoom(tabId, 2)`. The same outer window was retained; inner width and height halved, DPR doubled, and computed HTML/body CSS zoom remained `1`. No manual viewport halving, device-scale emulation, or CSS zoom was used.
- Browser evidence is an unauthenticated foundation fixture and does not claim authenticated product-screen coverage.

## Regressions and remaining review items

- `regression-web-vitest.log`: exit 0, 664/664 tests.
- `regression-editor-vitest.log`: exit 0, 253 passed and 1 skipped.
- `regression-root-typecheck.log`: exit 0 across editor/server/web.
- `regression-root-build.log`: exit 0.
- `regression-product-editor-styles-browser.log`: exit 2 because no authenticated product account/server was available. This remains for the native reviewer, as allowed by the dispatch.
- `regression-editor-browser-all-with-server.log`: browser checks passed 12/12 core, 4/4 table, 7/7 drift, and 2/2 tag. The suite then failed the existing math AC-3 geometry check (3/4 math); a dedicated rerun in `regression-editor-browser-math-rerun.log` reproduced it. Inline browser checks did not run after that stop. No editor product file was changed to mask this out-of-scope failure.

The temporary Vite server used for editor browser checks was stopped. Port 3399 had no listener after cleanup.
