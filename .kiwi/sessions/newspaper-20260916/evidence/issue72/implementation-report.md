# Issue #72 implementation evidence

Requirement coverage: `IR-WORKSPACE-001` AC-1, AC-2, AC-3 (rename and administrator read/search only), AC-6, AC-7. Workspace creation remains #73. Administrator grant/revoke execution remains blocked by `IR-WORKSPACE-003` / GitHub #89 until the server provides an authoritative L2 admin-impact preview.

## TDD RED

- The retained first-RED replays show 5/94 server failures and 5/5 issue #72 web failures while `product_diff_begin` / `product_diff_end` are empty.
- Test-file hashes recorded by those replay artifacts:
  - `packages/server/test/http/workspace-api.test.ts`: `6222E3DD7DCE5B045DADF17D91D44D8AB343FAB19371228C80CC64BA46145635`
  - `packages/web/test/issue72-workspace-management.test.tsx`: `0998F1466136939250BB78F01B59C9CF3EDEE289B9BD9B00410DE7D32EA669D9`
- The independent-review fixes were also observed RED before implementation: one server failure for authority loss through account suspension and two web failures for explicit recovery after selection loss and truthful audit context.
- The delayed old-sidecar race was separately observed RED after temporarily removing serialization: expected the sidecar name `나중`, received `먼저`. Per-workspace serialization was then restored.
- Readonly single-workspace selection and direct administrator rows/search each received a focused failing web test before their implementation.

## Verification

- Focused server workspace API: 96/96 passed.
- Focused issue #72, account-race, settings wiring, and audit integration: 4 files, 37 tests passed; the issue #72 component file has 10/10 tests.
- Full web: 84 files, 1036 tests passed.
- Root typecheck: passed for editor, server and web.
- Root build: passed.
- Built-product browser runner: passed actual AppShell/API checks and 12 light/dark viewport/zoom environments plus forced colors at 100% and 200%. Chromium was Playwright-owned with an isolated disposable profile; zoom used extension `chrome.tabs.setZoom`, was separately read with `getZoom`, and reset to 1. The run covers anonymous/manager/viewer/superuser roles, list error/loading/empty, administrator-read error, delayed rename versus selection, pending sidecar, authority loss with focus and explicit recovery, readonly single selection, keyboard selection, and final-control reachability. Evidence is in `browser-matrix/`; the final `browser-matrix.json` SHA-256 is `94808A0D20A9E00B8177DCE50E569985CBCA2009048AAED10AA4F17FE6A64E97`.
- SpecKiwi validation: zero errors; one pre-existing `SRS-W072` numbering warning. Link check retains the unrelated pre-existing `IR-AUDIT-004` reference `32` warning.
- `git diff --check`: passed.

The full server suite passed 1448/1449 tests. Its one failure is outside the issue #72 diff: the existing install assembly expects `/theme-bootstrap.js` to return 200 before installation, while the current install allowlist permits `/assets` but not that root asset and returns 503. The focused workspace API suite is green.

## Review-finding closure

- Delayed rename completion is bound to the captured workspace ID and operation generation, so it cannot overwrite a later selection or expose the old pending warning.
- A selected workspace that disappears is not silently replaced; protected detail is removed and focus moves to the neutral unavailable notice. A remaining unselected choice stays selectable for explicit recovery; only the selected sole row becomes readonly text with `aria-current`.
- Workspace and administrator query keys include user and authorization generation. Account changes cannot reuse the previous account's privileged cache, and selected administrator reads require the selected ID to remain in the current authorized managed set.
- Audit context displays a selection only while it remains in a current authorized response. The panel always states that the current server query covers every manageable workspace, including after selection authority is lost.
- Duplicate visible names derive the shortest unique visible ID prefix dynamically. Duplicate names remain valid, and unknown explicit server scopes are rejected instead of falling back.
- Same-workspace rename serialization rebuilds the actor from current principal status, group membership, and superuser state, then rechecks existence and authority after entering the serialized section immediately before the DB mutation and sidecar write.
- A fresh read that changes the selected workspace name preserves a dirty draft, identifies the new baseline, and blocks submission until the user chooses which value to continue with.
- Help, validation error, and baseline-conflict text are connected to the name input through stable `aria-describedby` IDs. The server-derived adminless badge remains static text rather than an alert.
- Administrator grant and revoke execution remain blocked behind `IR-WORKSPACE-003` / GitHub #89. #72 provides read/search state and a truthful blocker notice only; it does not synthesize impact or call a grant endpoint.

The browser acceptance checker requires a stale selection to retain the unavailable notice and allow an explicit click on the remaining row; after that click, the sole selected row must be static readonly. It compares the all-workspace row count and IDs to the live `scope=all` response and verifies audit context against the deterministic first API row, avoiding fixture-count and fixture-order assumptions.

Native Windows IME candidate-window automation is not claimed. Playwright has no API to drive or observe the OS-owned candidate UI, and this verification is constrained to Playwright-owned isolated Chromium without OS automation. The automated evidence covers composition-event submit suppression; native candidate selection remains a manual evidence gap rather than being represented as automated proof.
