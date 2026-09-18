# Issue 72 direct workspace administrator revoke closeout

Requirement: `IR-WORKSPACE-001` (`Stability=stable`, `Status=verified`). The combined #72, #73, and #89 evidence resolves AC-1 through AC-7.

## TDD provenance

- UI initial RED: `revoke-initial-red.json`. Import of the then-missing `WorkspaceAdminRevokeDialog` failed before implementation. The permanent test was subsequently expanded and now passes 9/9.
- Authority RED: `IR-WORKSPACE-001 AC-3: entry ...` expected safe 404 but received 200 for an actor that no longer had revoke authority. The warning endpoint now rechecks current revoke authority and matches unknown-entry 404 behavior.
- Fresh-warning RED: a changed warning tuple proceeded directly to DELETE. The dialog now performs a fresh warning GET at confirm time, locks changed content for explicit review, and performs no DELETE until a subsequent matching preflight.
- Product-check REDs preserved by the execution history: ambiguous administrator-name locator; accepted+refresh-error being rejected as full success; focus checked before the documented two animation frames; unique row filtered by a hidden ID. Each checker defect was narrowed without weakening product assertions.

## Implemented behavior

- Every direct administrator row with an actual `entryId` has a revoke entry point.
- One modal alert dialog owns server warning loading, loading/error/ready/stale states, identity display, destructive confirmation, cancel/Escape, duplicate-submit suppression, and auth/context generation guards.
- Cancel/Escape performs zero DELETE and restores focus to the exact row action.
- Confirmation refreshes the warning tuple before DELETE. `last-administrator` is advisory: self-removal and last-admin removal remain allowed.
- Accepted DELETE is retained independently from the subsequent reads. Refresh failure exposes a persistent accepted/refresh-error result and a GET-only retry; DELETE is not replayed.
- When the selected detail disappears after authority loss, the persistent mutation result receives focus and stale detail controls are removed.
- Warning lookup by `entryId` now requires current revoke authority and returns the same 404 shape for unauthorized and unknown entries.

## Objective verification

- Focused web: 3 files, 30/30 passed.
- Focused server authority: 1/1 passed (`114 skipped`).
- Root typecheck: editor/server/web passed.
- Product build: server and web passed as part of the final product runner.
- Product Playwright: PASS in a Playwright-owned isolated persistent Chromium/profile. It exercised real last-admin self-revoke, cancel zero mutation, confirm one DELETE, warning preflight, accepted+refresh-error, focus restoration, authority-loss detail removal, runtime resize, dialog scroll reachability, and synthetic composition on the existing rename input. Native Windows IME candidate UI was not automated or claimed.
- Matrix: exact requested browser viewports 1280x720, 1440x900, 1920x1080; light/dark; true browser zoom 100/200 using extension `chrome.tabs.setZoom`, with exact `getZoom===2` and final `getZoom===1`; forced colors at 100/200. Screenshots and measured geometry are under `browser-matrix/`.
- Full web: 89/90 files and 1115/1116 tests passed. The sole failure is out-of-scope `token-panel.test.tsx` computed style returning empty colors; isolated replay also failed 1/23. The token implementation and styles are byte-identical to base because the #72 diff does not touch them; this run did not claim a passing base execution.
- Full server: 142/143 files and 1519/1520 tests passed. The sole failure is out-of-scope `install-assembly.test.ts` expecting `/theme-bootstrap.js` 200 and receiving 503; isolated replay also failed 1/12. Install assembly/assets are byte-identical to base because the #72 server diff only adds an authority guard to grant-warning lookup; this run did not claim a passing base execution.
- SpecKiwi summary: phase-1 has no stability blockers/warnings and `IR-WORKSPACE-001` is stable/verified with AC-1 through AC-7 checked. Validation reports only the existing `SRS-W072`; links reports only the existing `IR-AUDIT-004 -> 32` warning.

The browser matrix JSON contains the generated fixture IDs and request ledger. These values are per-run evidence, not durable product identifiers.
