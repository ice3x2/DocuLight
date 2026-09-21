# Issue #84 final independent review

Requirement: `IR-PRINCIPAL-005`

## Verdict

PASS — CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0.

The revocation-only principal projection and authoritative preview subject metadata satisfy the Astra decision. Ordinary search does not disclose the bypass capability. Revocation search requires an authenticated workspace administrator and preserves the established 401/404 privacy boundary. The server-owned boolean distinguishes direct superuser membership and the actual superuser system group from the default group, misleadingly named ordinary groups, and ordinary groups containing a superuser.

The typed client and UI use preview metadata rather than names, ACL rows, or candidate assertions. A warning is rendered only from a complete valid current plan whose selected principal, plan item, and response subject IDs match exactly. Missing or cross-paired metadata invalidates the plan without exposing the private warning. Capability changes participate in L3 plan identity and invalidate stale consent. Auth generation, managed-scope identity, subject identity, late-response suppression, and role rechecks preserve the issue #83 ownership and race boundaries.

The implementation preserves issue #69 semantics: one L3 confirmation uses the ACL-entry count, zero-entry subjects remain in mixed plans, revocation executes sequentially, the sequence stops at the first unconfirmed result, confirmed removals remain visible, and account or group membership is not mutated automatically.

## Independent verification

- Strict zoom convergence tests: 5/5 passed. Missing, `null`, and `false` resolution-media samples fail closed; only explicit `true` can contribute to two consecutive settled samples.
- The product probe returns a boolean resolution-media result on every sample. Geometry, contrast checks, and screenshots run only after convergence.
- Product browser flow passed with a seeded backend and built application: workspace manager 200, node editor 404, ordinary user 404, unauthenticated request 401.
- Keyboard candidate selection passed. Composing Enter with keyCode 229 selected nothing and issued no revoke POST.
- L3 cancellation returned focus to the exact invoker. Reopening, typing the ACL count, and keyboard confirmation issued exactly one revoke POST.
- Result and audit subject identity matched. Account state and memberships were unchanged. The target logged in again and retained superuser upper-gate access.
- Three complete browser matrices passed. Each contains 12 light/dark viewport/100%/200% captures and two forced-colors captures: 42 observations and images total.
- All 42 convergence records contain `resolutionMatches: true`; browser zoom, CSS viewport, DPR, visual viewport, contrast, and image hashes match their declared axes. Final reset converged to 100%, 1280x720 CSS viewport, DPR 1, and explicit resolution match.
- Artifact set is exact: 42 images plus one manifest. The manifest was written last, all artifact and source hashes match, and the secret scan found no runtime credentials or session material.
- Focused server regression: 24/24 passed. Focused web and convergence coverage passed. Root typecheck passed.
- Full regression evidence: server 1608/1608 and web 1343/1343 passed.

## TDD provenance

The original server and web behavior tests were observed failing before implementation. The corrected server system-group search literal uses repository-owned display names without weakening capability expectations. The cross-paired metadata regression was added and observed failing before its UI fix. The zoom race test was frozen before the convergence helper, and the missing/null resolution cases were observed failing with the prior fail-open predicate before the strict `=== true` fix. Current frozen source hashes match the recorded GREEN evidence.

No SRS promotion, commit, or GitHub mutation was performed by this review.
