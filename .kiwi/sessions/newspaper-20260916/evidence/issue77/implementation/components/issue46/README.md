# GitHub #46 implementation evidence

Requirements: `IR-SHELL-007` AC-1..AC-5, `IR-SHELL-006` AC-2..AC-3, and `DR-SHELL-002`.

## TDD evidence

| Contract | RED command and result | GREEN command and result |
| --- | --- | --- |
| AC-1..AC-5 runtime, identity cache, save state | `cd packages/web; npx vitest run test/theme-runtime.test.tsx` — exit 1 because `src/theme/runtime.js` did not exist | Same command — 9/9 passed after runtime and app wiring |
| AC-4 stale response ordering | Same targeted command with the request-generation guard removed — exit 1; late `light` response replaced newer `system` | Same command after the minimal guard was restored — 9/9 passed |
| IR-SHELL-006 AC-2..3, AC-5 portal/first paint | `npm run test:browser:theme --workspace @doculight/web` after removing the not-yet-tested dark map/bootstrap — exit 1; first-paint and three dark computed-style assertions failed | Same command — five browser assertions passed: initial OS dark, exact dark computed colors, portal inheritance, live OS change, fixed-theme OS immunity/editor identity |

The four frozen foundation files were not edited. Current SHA-256 values:

- `newspaper-foundation.test.tsx`: `51EDCABD7D55D57D1D39333987D22898E7FEEC612C123D3C654A9949B43F825A`
- `newspaper-foundation-styles.mjs`: `6D9864FA6EEB54A7A1A65055FDBF3D052461E7133CB4C0A485D89C080DBF5CF3`
- `newspaper-foundation-dist.mjs`: `367A794B2F26873E7972F297D9002DE38BBA099FE02C26A344BDEA13AAA89FC7`

## Acceptance evidence

- AC-1: `system` follows live `prefers-color-scheme` changes; `light` and `dark` ignore them. Covered by targeted Vitest and Playwright.
- AC-2: the blocking same-origin `theme-bootstrap.js` applies OS theme before the application module. After identity comes from existing `/api/auth/me`, only the matching user-keyed memory value may bridge the DB query.
- AC-3: memory is module-local only, keyed by user ID, cleared on session loss/user switch, and overwritten by DB results. No theme value is written to `localStorage` or `sessionStorage`. Personal settings Query keys include the actual user ID.
- AC-4: selection is optimistic, reports saving/saved, restores the confirmed DB value on failure, keeps a retry action, and rejects stale request/user responses.
- AC-5: root `data-theme` and `color-scheme` move together. Body portals inherit semantic tokens. The browser editor probe remains mounted once across changes and actual browser zoom.
- IR-SHELL-006 AC-2/3: all 24 approved dark semantic values are mapped from `palette.css` through `themes/newspaper-dark.css`; production CSS computes the expected app/document/sidebar/control/text/border/action/selected colors.

## Verification runs

- `npx vitest run` in `packages/web`: 60 files, 673 tests passed.
- `npm run typecheck` at repository root: editor, server, and web passed.
- `npm run build --workspace @doculight/web`: passed, 2,959 modules transformed.
- `npx vitest run` in `packages/editor`: 253 passed, 1 existing skip.
- `node test/theme-runtime-dist.mjs`: production dark CSS and first paint passed.
- `node test/newspaper-foundation-styles.mjs`: four viewport cases passed, including the foundation's effective viewport applicability check.
- `node test/newspaper-foundation-dist.mjs`: all dependency/license/light production assertions passed.
- `node actual-browser-zoom.cjs`: real Chromium `chrome.tabs.setZoom(2)` passed in an isolated temporary profile. CSS viewport changed 1440×814 to 720×407 while outer window stayed 1441×901; root remained dark, portal/document colors remained exact, and editor mounts remained 1. See `actual-browser-zoom.json` and the 100%/200% screenshots.

## Remaining boundary

This slice does not claim the richer atomic editor, code syntax, or Mermaid palette work assigned to #54/#55. The issue #46 implementation is ready for independent review; SRS status and issue state were not changed.
