# Issue #81 Astra decision — independent review

Reviewer: Codex
Date: 2026-09-18
Scope: decision feasibility and contract review only; no implementation or SRS/GitHub mutation

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The projection and integration design is consistent with live #81 and `IR-PRINCIPAL-003`, preserves #68's bounded presentation, and is implementable without depending on #82.

## Findings

None.

## Contract coverage

- The additive `/roster/groups` projection distinguishes canonical default/superuser/ordinary subtype, automatic versus managed membership, add capability and complete effective membership without name/client-constant inference.
- Default effective membership is correctly derived from all active users rather than persisted `group_member` rows; managed groups retain complete direct membership while effective access excludes non-active accounts.
- Authorization runs before the uncapped privileged projection, and missing/conflicting completeness or capability fails closed instead of becoming an empty/actionable roster.
- The existing member POST remains user-only and superuser-only. Default manual add, group candidates, rejected/stale candidates and known duplicates are rejected before insertion; predictable duplicate handling does not use a uniqueness exception as control flow or create an audit event.
- The PrincipalPicker extension is narrow and backward compatible. It preserves the server's combined cap/order before user-only filtering, existing status privacy, minimum query length and stale-result protection without a second search implementation.
- Per-group synchronous guards, exact IDs/generations, awaited 204, no optimistic row, accepted-write/refresh separation and conditional focus restoration cover the required request lifetime and allow unrelated groups to proceed independently.
- The TDD plan includes server projection/privacy/invariant tests, real persistence/audit evidence, actual-App authorization checks, isolated extension zoom, forced colors and owned-process cleanup.

## Sources checked

- Live GitHub #81 (open, no comments)
- `IR-PRINCIPAL-003`, `FR-PRINCIPAL-001`, `DR-PRINCIPAL-002`, `CON-PRINCIPAL-002/006`, `IR-SHELL-002/006`, `SEC-AUTH-004/016`
- #68 Astra decision and final decision review
- Current group roster/member service and routes, repositories, App/AppShell, GroupRoster, PrincipalPicker and relevant tests
- Issue #81 `astra-decision.md`

No product code, tests, SRS, GitHub issue, commit or Astra document was changed by this review.
