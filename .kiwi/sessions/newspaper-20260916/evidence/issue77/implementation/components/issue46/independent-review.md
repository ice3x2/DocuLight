# Issue #46 independent review

Final verdict: **PASS**. The third review found no remaining Critical, High, Medium, or Low findings.

## Review basis

The review used the current uncommitted diff against `HEAD`, the current product structure, and these governing sources:

- `AGENTS.md`
- `docs/spec/00.index.md`
- `.kiwi/sessions/newspaper-20260916/issues/issue-46.md`
- `.kiwi/sessions/newspaper-20260916/handoffs/sol-theme-runtime.md`
- `docs/decision/newspaper-implementation-handoff.md`
- `IR-SHELL-007` AC-1 through AC-5
- `IR-SHELL-006` AC-2 and AC-3
- `DR-SHELL-002`

No SRS mutation was performed. The implementation remained within issue #46; the richer atomic-editor, syntax-highlighting, and Mermaid palette work assigned to #54 and #55 was not added.

## Findings and closure history

### Round 1

- **High:** an unauthenticated/session-loss transition could retain the previous authenticated user's identity and personal-theme query data, allowing stale user state to survive until another successful identity request. Reproduction exercised an authenticated user followed by a session `401` and inspected the rendered/runtime theme and query state.
- **Medium:** the appearance control accepted a theme selection before the personal preference load had completed, so a user action could race the initial GET.
- **Medium:** an older personal-settings GET could complete after an optimistic PATCH and replace the newly confirmed theme.

The fixes were independently confirmed: a session `401` now removes non-session queries and clears authenticated theme state; personal settings are keyed by the resolved user ID; the control stays disabled until the prerequisite identity and preference loads succeed; pending personal GETs are cancelled around save; stale responses and previous-user responses cannot win.

### Round 2

- **Medium:** when session and tree requests succeeded but `/api/auth/me` returned `500`, the appearance control stayed in an indefinite loading state with no persistent error or retry action.

The fix was independently confirmed against the mounted product flow. With session/tree `200` and the first identity request `500`, the select is disabled, no personal-settings request is issued, and the UI exposes `role="alert"` text `테마 설정을 불러오지 못했습니다.` with `다시 불러오기`. Activating retry changes the described status to `role="status"` text `테마 설정을 불러오는 중…`, keeps the select disabled, and refetches identity. A successful identity response then starts exactly one user-scoped personal-settings fetch; after that response the control is enabled with the database value. The disabled control cannot queue a selection. It remains enabled during a save, as required by the reviewed UX contract.

### Round 3

The full prerequisite sequence above passed after the separate identity fix. A separate TanStack Query observer check also confirmed that a background identity refetch error retains existing successful `identity.data`; therefore an already valid `userId` is not displaced and the application continues through the user-scoped personal-settings branch.

No new regression was found in cache clearing, login transition, identity or preference GET errors, retry loading UX, query cancellation, optimistic rollback/retry, or request ordering.

## Acceptance-criteria result

- `IR-SHELL-007` AC-1: `system` follows live OS color-scheme changes; fixed `light` and `dark` choices ignore later OS changes.
- `IR-SHELL-007` AC-2: anonymous first paint follows the OS through the production bootstrap; after authentication, only the matching user-keyed memory value may bridge the database query, and the database preference takes precedence when returned.
- `IR-SHELL-007` AC-3: the bridge cache is in-memory, keyed by user ID, overwritten by database results, and cleared across logout, session loss, and user transition. No theme value is persisted in `localStorage` or `sessionStorage`.
- `IR-SHELL-007` AC-4: selection previews immediately; save state is reported; failure restores the confirmed value and offers retry; late GET/PATCH and previous-user responses cannot overwrite newer state.
- `IR-SHELL-007` AC-5: root `data-theme` and `color-scheme` remain synchronized; portal content inherits semantic tokens; theme changes do not remount the editor probe.
- `IR-SHELL-006` AC-2/AC-3: the approved dark semantic values map through the newspaper palette and produce the expected computed application, document, sidebar, control, text, border, action, selected, and portal colors.
- `DR-SHELL-002`: the database remains the canonical authenticated preference store, and client query identity is scoped to the resolved user.

## Final verification commands and results

- `cd packages/web; npx vitest run test/theme-runtime.test.tsx` — **1 file, 14 tests passed**.
- `cd packages/web; npx vitest run` — **60 files, 678 tests passed**. The run printed the existing happy-dom `URL is not a constructor` navigation diagnostic, but no test failed.
- `npm run typecheck` from the repository root — **editor, server, and web passed**.
- `npm run build --workspace @doculight/web` — **passed; 2,959 modules transformed**.
- `cd packages/web; node test/theme-runtime-dist.mjs` — **passed**, including production dark CSS and first-paint bootstrap behavior.
- `npm run test:browser:theme --workspace @doculight/web` — **5 browser checks passed** for OS-dark first paint, exact dark computed colors, portal inheritance, live OS changes, fixed-theme immunity, and editor identity.
- `node .kiwi/sessions/newspaper-20260916/evidence/issue46/actual-browser-zoom.cjs` — **passed** with real Chromium `chrome.tabs.setZoom(2)`: CSS viewport changed from `1440x814` to `720x407`, outer window remained `1441x901`, theme and computed portal/document colors remained correct, and editor mount count remained `1`.

## Raw TDD evidence

Identity-prerequisite evidence:

- `identity-prerequisite-red.log` — targeted run failed on the missing identity-load error UI at 2026-09-17 01:00:28.
- The product change in `App.tsx` was written at 2026-09-17 01:00:42.
- `identity-prerequisite-green.log` — 14/14 passed at 2026-09-17 01:01:17.
- `identity-prerequisite-typecheck.log` — workspace typecheck passed.
- `identity-prerequisite-web-regression.log` — 60 files and 678 tests passed.

Isolation and request-race evidence:

- `isolation-race-red-attempt1.log`
- `isolation-race-red.log` — preserved the behavior failures for cache/session isolation and request races before the fixes.
- `isolation-race-green.log` — the corrected targeted suite passed 13/13 at that stage.
- `isolation-race-typecheck.log`
- `isolation-race-web-regression.log`

The identity test file has a later final timestamp, 2026-09-17 01:01:06, than the product change. This is classified as a post-implementation test adjustment rather than proof of a test-after implementation because the raw RED log predates the product change and already contains the same failing identity-error scenario. Taken together, the preserved RED failure, implementation timestamp, GREEN result, and regressions provide credible strict-TDD evidence.

## Browser and zoom evidence boundary

The 200% check used a real Chromium browser zoom through `chrome.tabs.setZoom(2)` in an isolated temporary profile, rather than CSS `zoom`. Its fixture verifies the root theme, exact portal/document computed colors, responsive CSS viewport, and a stable editor mount sentinel. The editor sentinel is a focused fixture rather than the complete production CodeMirror surface. This is a **coverage limitation, not a finding**: the production theme mechanism, editor identity regression, production bundle bootstrap, and targeted application tests all pass, and issue #46 does not include the richer editor rendering work reserved for #54/#55.

## Frozen foundation and scope checks

The four frozen foundation tests were not edited or weakened. Recorded SHA-256 values remain:

- `newspaper-foundation.test.tsx`: `51EDCABD7D55D57D1D39333987D22898E7FEEC612C123D3C654A9949B43F825A`
- `newspaper-foundation-styles.mjs`: `6D9864FA6EEB54A7A1A65055FDBF3D052461E7133CB4C0A485D89C080DBF5CF3`
- `newspaper-foundation-dist.mjs`: `367A794B2F26873E7972F297D9002DE38BBA099FE02C26A344BDEA13AAA89FC7`

The complete current diff was inspected for unrelated expansion. No implementation for issue #54 or #55 and no weakening of the frozen foundation contract was found.
