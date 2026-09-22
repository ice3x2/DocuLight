# Issue #59 final independent review

Date: 2026-09-17
Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Review basis

The review independently compared GitHub issue #59, `AGENTS.md`, the revised Playwright-only Astra decision, IR-AUTH-001, FR-AUTH-001/004, SEC-AUTH-001/003, IR-SHELL-006/009, the complete current diff, and the issue59 raw evidence. Product and browser conclusions were based on newly executed checks rather than the implementation author's conclusion.

## Independent execution

- `npm run test:browser:pre-auth-product` from `packages/web`: executed twice in sequence; both runs exited 0 with **13/13** checks passing.
  - The checked-in runner builds server and web output, creates a unique OS-temporary data root, bootstraps and installs an ephemeral superuser, starts an owned product server on an ephemeral port, and launches a Playwright-owned Chromium browser.
  - The checks cover anonymous shell/settings absence, login/signup navigation in both directions, the unchanged login endpoint and exact submitted payload, indistinguishable unknown-user and wrong-password messages, distinct pending/suspended/rejected messages, open-mode authenticated entry, approval-mode pre-approval blocking, neutral signup receipt text, and invite-only closed signup wording.
  - Cleanup closes the owned server and runtime, deletes files before directories, removes the temporary root, and preserves both a primary failure and cleanup failures through `AggregateError` when more than one occurs.
- `npm run test:browser:pre-auth` from `packages/web`: executed twice in sequence; both runs exited 0.
  - Each run covered 30 normal measurements and 30 genuine-200% measurements: 1280x720, 1440x900, and 1920x1080; light and dark; applicable login/signup initial, pending, error, and accepted-request states.
  - Genuine zoom used an isolated Playwright-owned persistent Chromium context and a temporary extension calling `chrome.tabs.setZoom(tabId, 2)`. The checker asserted `getZoom() === 2` and the before/after CSS viewport ratio. It did not substitute CSS zoom, device-scale emulation, or a smaller emulated viewport.
- Latest regression evidence records web Vitest **69 files / 771 tests passed**, web typecheck passed, and web build passed with only the existing chunk-size warning.

## Behavior, accessibility, and security

- The form synchronously prevents duplicate submission and correctly handles Promise rejection, synchronous throw, late results, same-tick reentry, screen changes, and editable pending fields.
- Native input names, IDs, password types, autocomplete hints, and current DOM values are preserved. Synthetic DOM autofill values reach the submitted request unchanged.
- Synthetic composition tests cover composition start/update/end, the composition-ending Enter sequence, candidate-style commit, cancel, the next deliberate Enter, request cardinality, and committed/cancelled character lengths.
- Keyboard checks cover forward Tab through name, password, submit, and alternate navigation, then Shift+Tab back through submit and password.
- Computed browser checks assert a 2px focus outline, 2px outline offset, focus contrast, and all four focus-ring edges within the viewport. Text, control, notice, pending-button, and focus-boundary contrast assertions pass in light and dark themes.
- The actual product flow preserves the existing API and HttpOnly-session architecture. No client account lookup, status inference, secret echo, or raw thrown error was introduced.

## TDD chronology

The raw evidence contains meaningful failures before the corresponding implementation:

- Initial component RED: 17 tests, 10 failed and 7 passed, reaching layout, identity, missing-callback, duplicate-submit, error, throw/reject, DOM-value, composition, and signup-copy assertions.
- Initial browser RED: missing product geometry.
- IME event-order RED: the first deliberate Enter was incorrectly suppressed after the composition keyup sequence.
- IME commit/cancel RED: two failures reproduced the stale suppression flag after candidate-style commit and cancel.
- Pending contrast RED: computed text contrast was 3.549577959:1 before the scoped correction.

The final scoped tests, browser checks, and full regression are green. Existing tests were not weakened to obtain the result.

## Evidence hygiene and limitations

- The two stored direct product logs have SHA-256 values matching `green-product-direct-runs.json`.
- Independent scans found no generated `Issue59-<UUID>` credential, session-cookie value, install-session value, or password payload in the issue59 evidence logs.
- After execution, no `doculight-issue59-product-*` or `doculight-preauth-zoom-*` temporary directory remained, and no listener remained on fixed ports 3399, 3400, or 3420.
- The fixture checker detects an owned Vite process that exits before readiness and awaits shutdown of that owned process. The two consecutive final runs completed without the prior fixed-port lifetime failure.
- All browser verification used newly launched Playwright-owned Chromium. No external browser attachment, existing-browser CDP connection, OS keyboard/mouse injection, `SendInput`, `AppActivate`, or HWND manipulation was used.
- Synthetic/CDP composition is not native Windows Korean IME candidate-window evidence. DOM autofill simulation is not proof of a real Chromium or third-party password-manager popup. These are explicit limitations under the Playwright-only instruction and were not presented as native evidence.

No Critical, High, Medium, or Low finding remains.
