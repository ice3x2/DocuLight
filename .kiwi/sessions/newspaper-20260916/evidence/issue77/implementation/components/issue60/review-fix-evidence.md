# GitHub #60 independent-review remediation evidence

Date: 2026-09-17

Requirements: IR-SHELL-009, IR-AUTH-001, FR-CONFIRM-019, SEC-AUTH-010, SEC-AUTH-011, SEC-AUTH-012, SEC-AUTH-015, SEC-AUTH-017.

## M1 — 12-environment checker coverage

`packages/web/test/newspaper-install-check.cjs` now fails unless every environment records and asserts:

- stages `1,2,3,4,complete`, completion without Back, and Start handoff;
- invalid token, password mismatch, and mapped stage-4 commit failure;
- a computed 2px focus outline, 2px offset, at least 3:1 contrast, and viewport-contained geometry;
- native DOM value submission with exact verify call count, and synthetic composition submission with exact commit call count/snapshot;
- composition-active Enter suppression followed by deliberate Enter advancement after composition ends;
- numeric pre/post DPR, plus `chrome.tabs.setZoom(2) === 2` and the viewport width ratio for actual 200% cases.

Command: `npm run test:browser:install-newspaper`

Result: PASS, exit 0. Matrix: 12 environments; each has 5 stages and all assertions above. The six 200% environments use Playwright-launched isolated persistent Chromium profiles and the extension call `chrome.tabs.setZoom(2)`.

Artifact: `install-matrix-latest/matrix.json` and 36 screenshots (review, pending, completion for each environment).

## M2 — restored strict test-first provenance

The affected InstallWizard behavior and ConfirmGate pending/label behavior were removed. The expanded 27-test contract was then run and confirmed RED before reimplementation.

- RED raw: `red-install-wizard-expanded.raw.json` — SHA-256 `871537AED148CF371753C0765B0DAC2A5BCAEAD1EB84BBB7C356933D9A3D195C`; 1 file, 27 failed, exit 1.
- GREEN raw: `green-install-wizard-expanded.raw.json` — SHA-256 `DDA7D56E928AD6FDB548A188A79BEE766324E2DE8573BF83FE20EFC68D916C15`; the same file has 27 passed, exit 0.
- Final test SHA-256 in both runs: `E1C8A1EC0ACCBB7B916806ED2B34FF8108F16FA9FDFBCB18004807D904388A0D`. Its filesystem modification time predates this final remove→RED→reimplement→GREEN cycle.
- A direct ConfirmGate test now isolates custom confirm/pending labels, disabled cancel, and blocked Escape/overlay dismissal during the pending Promise.

The RED covers the later axes called out by review: stale response invalidation, both enums, warning combinations, invalid/transport/429 token mapping, backward value preservation, mismatch validation, session 401, safe commit rule mapping, and empty-password invalid/focus behavior.

## L1 — server install regression attribution

The exact three-file server command was run twice, once before review-fix changes and once after a fresh production web build performed by the product runner:

`npm test -- --run test/http/install-routes.test.ts test/http/install-gate.test.ts test/http/install-assembly.test.ts`

Both runs produced the same result: 35 passed, 1 failed at `install-assembly.test.ts:119`, `/theme-bootstrap.js` expected 200 but received 503. The #60 diff changes no server source, install gate, static SPA, build bootstrap, or theme bootstrap code. The failure is reproducible and unrelated to #60, so it was reported and left unchanged as required.

## Final verification

- Targeted web: 3 files, 64 passed.
- Full web: 70 files, 798 passed.
- Web typecheck: PASS.
- Browser matrix: PASS, 12 environments, fresh Playwright-owned Chromium only.
- Product install runner: PASS after server/web production builds; commit 200, persistent completion, Start handoff, consumed-token rejection, first-admin login.
- Server install subset: 35 passed, 1 pre-existing unrelated failure documented above.
- `git diff --check`: PASS.

No SRS was mutated. No browser attachment, existing CDP endpoint, OS input injection, or broad process kill was used.
