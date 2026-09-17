# IR-SHELL-010 implementation evidence

- Requirement: `IR-SHELL-010`
- Original RED limitation: no raw pre-implementation IR-SHELL-010 log exists. The previously cited `ir-shell-010-red.txt` is absent and must not be treated as evidence.
- Review-fix RED/GREEN: `review-fix-red-vitest.txt` records 3 new failures before the review repair; `review-fix-green-vitest.txt` records the same suite at 14/14 afterward.
- GREEN: latest review-fix targeted issue/shell wiring suites 69/69 and full web regression 68 files / 747 tests; the earlier editor regression remains 261 passes and 1 existing skip.
- Static/build: web typecheck and production build pass.
- Isolated Playwright: `ir-shell-010-playwright-green.txt` reports the 12-environment matrix PASS using runner-owned persistent Chromium profiles, including real 200% zoom and forced colors.
- Product fixture: the refreshed review run covers exact binary bytes and stable target identity, Markdown prior-version retention, tree-only/document-only/both refresh failures, failed-GET-only retry, successful GET non-repetition, zero repeated upload POST, zero new L2 during refresh retry, and 12 product environments.
- Process isolation: the fixture runner created and stopped only its own server, Vite, and Chromium descendants. No process-name-wide termination was used and the pre-existing port 3399 process was not touched.
