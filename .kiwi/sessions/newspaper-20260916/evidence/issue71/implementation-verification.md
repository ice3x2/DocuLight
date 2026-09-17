# Issue 71 implementation verification

## Supported slice

- Requirements: `IR-SHELL-002`, `DR-SHELL-001`, `FR-AUTH-004`, `FR-ATTACH-006`, `FR-STORAGE-004`, `FR-STORAGE-007`, `REL-AUDIT-003`, `FR-CONFIRM-007`, `FR-CONFIRM-008`.
- The real settings form renders the exact five canonical fields, keeps server baseline and local draft separate, validates raw numeric text and the retention pair, sends one changed-known-key PUT after a GET preflight, and distinguishes rejected, uncertain, accepted/readback-failed, and confirmed saves. Retention risk is evaluated against the authoritative preflight baseline, so stale apparent reductions surface conflicts before any block.
- Retention reductions remain blocked because no authoritative fresh impact-count API exists.

## Automated evidence

- Focused web: `26/26` issue tests; `38/38` with settings-panel regression.
- Full web: `82 files`, `1022 tests`, all passed.
- Relevant server settings/retention/auth/attachment regressions: `8 files`, `216 tests`, all passed.
- Root typecheck and build: passed.
- SpecKiwi validate: zero errors; one pre-existing `SRS-W072` warning.
- Actual-product Playwright: isolated Playwright-owned persistent Chromium; actual AppShell login and settings GET/PUT/readback; pending lock, transport uncertainty reconciliation, load-error retry, and role-loss stop; three viewports by light/dark by genuine 100%/200% zoom; separate `getZoom===2` and reset `getZoom===1`; forced-colors at 100%/200% with an actual invalid field; same-mount resize/zoom preserved draft and focus.

## Explicit limitations

- `FR-CONFIRM-024` / GitHub #87 remains planned: the server does not expose the fresh impact count needed to confirm retention reductions.
- `IR-SHELL-013` / GitHub #88 remains planned: the settings shell has no child-to-parent dirty departure guard, so category/close/Escape/outside-click protection is not claimed.
- Native Korean IME, password-manager, and autofill behavior were not automated. Synthetic composition Enter is covered.
- The product-browser run does not measure the complete keyboard/contrast matrix or exercise ordinary/workspace-admin visibility; role gates remain covered by server/web regressions and the browser run covers an in-session 403 stop.
- The settings API has no revision/conditional-write token; the GET preflight detects known stale cases but cannot provide atomic compare-and-set semantics.
