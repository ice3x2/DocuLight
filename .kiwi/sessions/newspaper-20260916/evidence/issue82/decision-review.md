# Issue #82 Astra decision — final independent re-review

Reviewer: Codex
Date: 2026-09-18
Scope: revised decision feasibility and contract review only; no implementation or SRS/GitHub mutation

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The revised decision resolves the prior High token-authority finding and Medium paste/drop finding. It is a sound design handoff, while correctly remaining **blocked for implementation** until `FR-CONFIRM-004`, `IR-PRINCIPAL-004`, and live #82 establish one explicit token-precedence contract and that reconciliation passes independent review.

## Previous findings resolved

### Exact-name versus numeric token authority

Resolved at the decision level. The document now states that both requirements are stable, that no precedence currently exists, and that the decision artifact cannot override either one. It blocks behavior tests and implementation and gives a targeted reconciliation procedure:

- preserve fresh-open recount and changed-impact locking;
- scope `FR-CONFIRM-004`'s refreshed numeric-token clauses to operations whose designated token is impact-derived;
- establish `IR-PRINCIPAL-004`'s exact current group name as group deletion's designated token;
- clear name input and consent on any identity/name/member/ACL count change, including a count-only change;
- require cancel/reopen, a fresh baseline, exact current-name input and deliberate acceptance;
- preserve numeric-token regression coverage for other affected operations;
- align live #82, read all authorities back, and obtain independent contract review before RED.

This removes the prior unsupported claim that #82 was already independently implementable.

### Paste, drop and autofill behavior

Resolved. Ordinary typing, paste, drop and browser/programmatic synchronization may populate the raw controlled value. None of those events submits, moves focus to the destructive action or constitutes consent. A later deliberate button activation may proceed only when the raw value exactly matches the current name and the final preview/owner guards pass. This satisfies live #82's zero-delete boundary without imposing an unsupported input restriction.

The revised Web RED plan tests both halves: paste/drop/autofill alone produce zero DELETE and no destructive focus shift, while a later deliberate activation succeeds only with an exact token and unchanged fresh impact.

## Remaining contract review

The authoritative full ACL/member impact projection, authorization/no-enumeration ordering, existing atomic cascade, residual GET-to-DELETE race disclosure, synchronous operation guard, uncertain outcome handling, accepted-write/read-refresh separation, focus containment/restoration, privacy, strict TDD and actual-App Playwright evidence remain consistent and feasible.

This PASS approves the revised decision as a blocked handoff. It does not authorize RED tests or implementation before the stated SRS/live-issue reconciliation gate, and it does not claim `IR-PRINCIPAL-004` verification.

## Sources checked

- Revised issue #82 `astra-decision.md`
- Live GitHub #82
- `IR-PRINCIPAL-004`, `FR-PRINCIPAL-002`, `CON-PRINCIPAL-002`, `FR-CONFIRM-001/004/006`, `IR-SHELL-006/008`
- #68 decision/review
- Current group roster/delete service/routes, repositories, App/GroupRoster/ConfirmGate paths

No product code, tests, SRS, GitHub issue, commit or Astra document was changed by this review.
