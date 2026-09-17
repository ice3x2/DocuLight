# Issue #84 Astra decision independent review

Reviewed 2026-09-18 against live #84/#69, `IR-PRINCIPAL-005`, `FR-PRINCIPAL-011`, the #69 decision, and current principal search, direct superuser membership, revocation preview/execution, picker, and confirmation code. This review changes no product code, SRS, GitHub state, or Astra decision.

## Findings

### CRITICAL — none

### HIGH — none

### MEDIUM — none

### LOW — none

## PASS

The decision is feasible and consistent with the governing requirements. `PrincipalRow.system` currently identifies system groups only, while `isSuperuser` is based on direct membership in `system-superuser`; the chosen server-owned boolean closes that exact gap without leaking it through ordinary node/grant searches. Requiring `purpose=revocation` plus an administered `workspace:<id>` keeps the extra metadata behind the management boundary, and selected-subject metadata from each fresh revocation preview avoids trusting a stale candidate.

The boolean semantics correctly distinguish the superuser system group, a user directly in that group, the default group, and an ordinary group that merely contains a superuser member. Suspended-account handling remains truthful because the warning describes preserved bypass membership while explicitly forbidding a claim that the account can currently log in. Existing system groups remain selectable and ACL entries remain revocable, satisfying `IR-PRINCIPAL-005` AC-4 and `FR-PRINCIPAL-011`.

Fresh preview identity includes subject IDs and boolean values, so a capability-only flip invalidates L3 consent even when ACL row count is unchanged. The decision also preserves one L3, ACL-entry-count typing, all-zero blocking, some-zero inclusion, sequential stop-on-first-unconfirmed execution, and separate mutation/refresh outcomes. It acknowledges the remaining post-preview membership race rather than claiming atomic ACL-and-membership semantics. Focus, visible warning text, IME/keyboard preservation, strict red-first tests, authorization/privacy cases, and built-product Playwright evidence are sufficient and appropriately scoped. #83 remains the explicit integration prerequisite for the managed picker context.
