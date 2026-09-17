# Issue #67 implementation evidence

## Scope and requirements

- Production scope: `UserRoster.tsx`, `SignupApproval.tsx`, and scoped principal presentation CSS.
- Test/harness scope: direct component tests plus an isolated Playwright production-component bundle.
- Governing requirements: `FR-PRINCIPAL-009`, `IR-SHELL-002`, `FR-AUTH-003`, `FR-AUTH-002`, `IR-SHELL-006`.
- `AppShell` is imported and rendered by the fixture for its production settings/category gate; its source is unchanged.
- Query/loading/error, Promise outcomes, undo and result focus remain owned by issue #80 / `IR-PRINCIPAL-002`.

## Strict TDD record

The recovery cycle first removed every #67 production edit from `UserRoster.tsx`, `SignupApproval.tsx`, `styles/index.css`, and `principal.css`. `git diff --numstat` for the three tracked production files was empty and `principal.css` did not exist. Tests, fixture, runner and evidence remained.

The completed product behavior and visual contract suite was then run against that baseline with the same contract runner later used for GREEN:

```text
npm run test:issue67:contract -- --output .kiwi/sessions/newspaper-20260916/evidence/issue67/tdd-red-raw.log
ISSUE67_TDD_STARTED_AT_UTC=2026-09-17T17:50:57.997Z
focused: 2 failed / 2 passed files; 9 failed / 43 passed tests; exit 1
browser visual contract: exit 1
ISSUE67_TDD_FINISHED_AT_UTC=2026-09-17T17:51:34.652Z
RESULT=FAIL
```

The ignored `.log` output was preserved byte-for-byte as the reviewable `tdd-red-raw.txt` artifact. It includes the exact commands, UTC timestamps, stdout/stderr and exit codes. Its precondition block records an empty tracked product diff and `PRINCIPAL_CSS_EXISTS=false`. Its SHA-256 block fingerprints the runner, browser harness, fixture and four focused test files. Failures covered headings, exact states, semantic badges, shared tables, autocomplete, missing-handler availability, accessible action names and the production browser visual contract.

Only after RED was recorded, the minimum component and scoped-style implementation was reapplied. The identical runner then produced GREEN:

```text
npm run test:issue67:contract -- --output .kiwi/sessions/newspaper-20260916/evidence/issue67/tdd-green-raw.log
ISSUE67_TDD_STARTED_AT_UTC=2026-09-17T17:53:26.035Z
focused: 4 passed files / 52 passed tests; exit 0
browser: 12 environments plus forced colors 100/200; exit 0
ISSUE67_TDD_FINISHED_AT_UTC=2026-09-17T17:54:20.654Z
RESULT=PASS
```

The ignored `.log` output was preserved byte-for-byte as `tdd-green-raw.txt`. Its SHA-256 block is identical to RED for every contract file, while its product block records the reapplied tracked diff and `PRINCIPAL_CSS_EXISTS=true`. The component implementation retains every rationale comment from the HEAD versions of `UserRoster.tsx` and `SignupApproval.tsx`. Full regression and typecheck followed, in that order; the ignored validation `.log` was likewise preserved as `validation-green-raw.txt`: `2026-09-17T17:54:32.869Z` through `2026-09-17T17:55:09.709Z`; 78 files / 951 tests passed and typecheck exited 0.

## Browser evidence

Command:

```text
npm run test:browser:principal67
PASS issue67 production AppShell role gates and principal components (12 environments; forced colors 100/200)
```

`browser.json` records six 100% environments and six actual 200% environments across 1280×720, 1440×900 and 1920×1080 in light/dark themes. Each environment renders the production `AppShell`, opens settings through the real 설정 trigger, and checks superuser, ordinary user, and non-superuser workspace-manager fixtures. `사용자 관리` and `가입 승인` are reachable only for the superuser and absent from both the DOM and accessibility tab list for the other roles.

The superuser path renders the source `UserRoster` and `SignupApproval` components. It checks long Korean/Latin names, all four badges, table and action geometry, contrast, focus, selected tabs, empty copies for every current signup mode, missing/empty state through component tests, raw-value registration, masked password fields, stable IDs, action names, and callback ID routing. Twenty-eight screenshots cover both principal categories in the 12 environments and forced-colors at 100%/200%.

Each 200% run uses a fresh disposable persistent Chromium profile and extension. The runner calls `chrome.tabs.setZoom(tabId, 2)`, then separately reads `chrome.tabs.getZoom(tabId) === 2`; after inspection it calls `setZoom(1)` and separately reads `getZoom(tabId) === 1`. On the same mounted page without reload, it verifies 100→200→100 plus viewport resize/restore. Both transitions independently preserve the roster category, input values and input focus, followed by the approval category, selected rejected tab and tab focus.

The runner starts Vite programmatically in the same Node process on an OS-assigned loopback port, checks a per-run nonce, and awaits `viteServer.close()` in `finally`; no helper Node child exists to orphan. The matrix also exercises exact 18px/26px sans 600 title/caption typography, registration width ≤560px and available width, compositionstart→compositionupdate→compositionend, composing Enter zero-dispatch plus deliberate action, real Tab/Shift+Tab traversal, keyboard tab activation, hover/contrast, last-row viewport reachability, and clipboard-permission-backed `navigator.clipboard.readText()` equality for selected readonly text.

## Privacy and limitations

- Password input remains `type=password`; screenshots show masked glyphs. No real credential is used, and every synthetic password is generated at runtime rather than stored as a source literal. Both raw TDD logs record zero generated-password matches and zero legacy-literal matches. The final `privacy-scan.txt` records an all-evidence scan with both counts at zero without logging any generated value.
- Native Windows IME candidate UI, physical keyboard layout behavior, password-manager/autofill UI, and OS dialogs are nonblocking untested limitations. Evidence covers synthetic composition/DOM input only.
- This is production AppShell/category-gate and source-component bundle evidence. It is not login, API authorization, query lifecycle, mutation-result, undo, or server integration evidence.
