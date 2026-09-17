# Issue #80 Astra decision — independent review

Reviewer: Codex
Date: 2026-09-18
Scope: decision feasibility and contract review only; no implementation or SRS/GitHub mutation

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The decision is feasible on the current endpoints and consistent with live #80 and `IR-PRINCIPAL-002`. The repository's `.git/issue80-body.md` snapshot is stale: live #80 now explicitly assigns unreachable last-active-superuser 409 UX to future status-management work, matching the SRS and Astra decision.

## Findings

None.

## Contract coverage

- Roster and signup-mode phases remain independent; only a current successful roster owns rows/counts, while mode affects pending-empty explanation only.
- Registration awaits a validated 201 `{id}`, synchronously prevents same-tick duplicate submission, retains the masked password/name on refusal or uncertainty, and separates accepted write from refresh failure.
- Approve/reject/reopen are limited to stable IDs and statuses in the latest accepted client snapshot. Per-account guards allow independent accounts while explicitly avoiding claims of cross-admin atomicity.
- Rejection remains L1 with no preconfirmation. Undo is a one-shot reopen of the exact rejected account and is enabled only after a current roster confirms rejected status.
- Generic error handling avoids raw response, credential and account-existence leakage. Role/auth loss removes privileged data and invalidates old owners.
- Conditional stable-ID focus restoration, no-focus-steal rules, operation-specific loading/error states and the existing #67 layout are consistent with the governing shell contracts.
- Strict test-first coverage and the real-App Playwright matrix include deferred races, exact requests, persistence, unauthorized DOM/API absence, isolated extension zoom, forced colors and owned-process cleanup.

## Sources checked

- Live GitHub #80 (open, no comments)
- `IR-PRINCIPAL-002` and its auth/principal/confirmation/shell traces
- #67 Astra decision and final decision review
- Current App/AppShell/client/query, UserRoster/SignupApproval, auth routes/services and relevant tests
- Issue #80 `astra-decision.md`

No product code, tests, SRS, GitHub issue, commit or Astra document was changed by this review.
