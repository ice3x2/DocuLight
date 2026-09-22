# Shared UI acceptance matrix

Requirements: IR-SHELL-006, IR-SHELL-008, FR-CONFIRM-001..009 and their stable confirmation anchors.

| Issue | Acceptance area | Result | Evidence |
| --- | --- | --- | --- |
| #47 | 36/40px controls, 4px field/button radius, typography/spacing, button variants | PASS | `47-green-vitest.log`, `47-green-browser.log`, `browser/measurements.json` |
| #47 | checkbox/radio/select/search selection; focus, invalid, readonly, disabled, loading | PASS | `47-green-vitest.log`, `47-green-browser.log` |
| #47 | persistent labels/descriptions, long Korean wrapping, IME Enter separation | PASS | `47-green-picker-ime.log`, `shared-ui-browser-green.log` |
| #48 | Radix dialog/popover/menu/alert adapters and existing roles | PASS | `48-green-vitest.log`, `48-green-browser.log` |
| #48 | L1 immediate; L2 alert confirmation; L3 exact token; revalidation/lock/PAT safeguards | PASS | `48-green-vitest.log`, full web Vitest `691/691` |
| #48 | title/description association, cancel initial focus, trap/topmost Escape, outside block, focus restore | PASS | `48-green-vitest.log`, `48-green-browser.log` |
| #48 | controlled async confirmation without premature close or confirm-to-cancel callback | PASS | `48-green-vitest.log` |
| #48 review | Alert cancel matches shared secondary geometry/theme and keeps a visible 2px focus outline with 2px offset in light/dark | PASS | `review-high-red-browser-final.log`, `review-high-green-browser-final.log` |
| #48 review | Explicit owner layers page300, dialog400/500, dialog-owned600, alert700/800, alert-owned900 | PASS | `review-high-green-browser-final.log` |
| #48 review | Underlying page overlay remains noninteractive; alert child stays operable; ordered Escape restores inner trigger, then dialog successor; child portal unmounts | PASS | `review-high-green-browser-final.log` |
| #48 | exact AlertDialog dependency and distributable MIT attribution | PASS | `npm ls` reports `1.1.23`; workspace build emits `dist/licenses/@radix-ui/react-alert-dialog/LICENSE` |
| #49 | shared table/list/badge/loading/empty/error states | PASS | `49-green-vitest.log`, `49-green-browser.log` |
| #49 | 40px minimum rows, wrapping/alignment, selected state, keyboard-reachable full path | PASS | `49-green-browser.log`, `shared-ui-browser-green.log` |
| All | Chromium computed styles/geometry at 1280x720, 1440x900, 1920x1080 | PASS | `shared-ui-browser-green.log`: 12/12 |
| All | Genuine 200% browser zoom | PASS | Playwright persistent Chromium plus isolated `chrome.tabs.setZoom(2)` fixture; viewport ratio 2.001 x 2.002; CSS zoom 1; CDP emulation false |
| Regression | workspace typecheck/build, web Vitest, editor Vitest | PASS | typecheck; build; web 691/691; editor 253 passed, 1 skipped |
| Regression | editor Playwright browser suite | PARTIAL | browser 12/12, table 4/4, drift 7/7, tag 2/2, inline 6/6; pre-existing math superscript geometry check failed 3/4 twice |
| Regression | web authenticated Playwright browser suite | BLOCKED | no `DOCULIGHT_E2E_USER` / `DOCULIGHT_E2E_PASS`; self-contained theme test and shared UI Playwright matrix pass |

Every server started for verification was stopped; ports 3399 and 3400 had no listeners afterward.
