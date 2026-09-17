# Issue 70 implementation verification

- RED: `red-final.txt` records 9/9 initial failures, test SHA-256 `6FA4F63F7AA3B7F25F993EFF6BEB7A8A05C1B62E20B47A6285B251ADB33EE430`, and `PRODUCT_DIFF_ABSENT_AT_FINAL_RED=YES`.
- Follow-up RED: `red-focus-context.txt` records 2/2 failures for authorization-context expansion reset and removed-focused-group recovery before those behaviors were implemented.
- Context-focus RED: `red-context-focus.txt` records the remaining focused-detail fallback failure before context-change heading recovery was implemented.
- App adapter RED: `red-app-race.txt` records 5/5 actual-App failures, test SHA-256 `F22B7542AA298C7DA718A3D9D6752A5DF3F0E9F44FFFC8657FCADCECDA2279AE`, and `PRODUCT_ADAPTER_DIFF_ABSENT_AT_RED=YES`. It covers late filter/account responses, cached-error priority, independent retries, stale badge removal, and native select focus while filtered results load.
- Heading-focus RED: `red-heading-focus.txt` records the isolated Chromium computed-style failure (`3px` instead of the required `2px`) before the heading focus rule was added.
- Filter-error RED: `red-filter-error-shell.txt` records the actual-App failure where a same-context filtered 500 response removed the focused operation select; test SHA-256 `0649E1DBC0A45352367038435C89ADED29842ED39D271ABC194A65C6ECF33F6A`.
- Final post-RED GREEN: `green-post-review-final.txt` records timestamps, the current test and product file hashes, raw output, and 9 files / 89 tests passed after all relevant REDs and product restoration.
- Full web: `npm test --workspace @doculight/web` — 81 files / 996 tests passed.
- Relevant server regressions: audit view/grouping/scope, reconciliation queue/resolution/immutability, and authorization suites — 21 files / 249 tests passed.
- Root typecheck: `npm run typecheck` — editor, server, and web passed.
- Built product: `npm run build --workspace @doculight/web` — 2,983 modules transformed; Vite build passed.
- SpecKiwi: `speckiwi validate --json` — 0 errors, 1 pre-existing `SRS-W072` numbering warning.
- Browser: `node packages/web/test/issue70-audit-browser-check.cjs` — 12 normal light/dark/viewport/zoom environments plus forced-colors 100%/200% passed. `browser/browser.json` records separate extension `getZoom` checks at 1, 2, and reset 1, same-mount state/focus checks, computed heading focus (`2px` outline with `2px` offset), roles/states, and blocked follow-up #86 / `IR-SHELL-012`.

IME input verification is N/A because this change adds no text input. Native password-manager/autofill integration remains nonblocking and untested.
