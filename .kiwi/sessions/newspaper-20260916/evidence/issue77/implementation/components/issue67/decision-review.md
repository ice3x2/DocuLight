# Issues #67/#80 integration boundary — final independent review

Reviewer: Sol
Date: 2026-09-18
Scope: live GitHub issues #67 and #80, final `astra-decision.md`, complete `IR-PRINCIPAL-002` AC/trace/index registration, and current API/UI contracts. This review does not claim implementation or browser execution.

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

Issue #80 and `IR-PRINCIPAL-002` now own the separate integration lifecycle without expanding #67 or making #67 closure depend on integration completion. No remaining contradiction, unsupported promise or missing governing requirement was found.

## Previous findings resolved

- **Mode/count separation:** successful current roster data alone owns pending/rejected rows and counts. Signup mode controls only the pending-empty explanation. Unresolved or failed mode keeps nonempty queues/counts and uses neutral empty copy plus a distinct mode error.
- **Unreachable 409 removed:** #80 handles generic register/approve/reject/reopen failures only. `last-active-superuser` 409 and arbitrary account-status controls are explicitly assigned to a future status-management requirement/issue because no #80 action can reach that condition.
- **Concurrency claim narrowed:** “latest” means the latest accepted client roster snapshot. Local generation/status/ID guards discard stale client intent and lock per account, while cross-administrator races and atomic expected-state/revision remain explicitly outside #80.
- **Trace ownership corrected:** `FR-AUTH-002` owns exact same-account rejected-to-pending reopen; `FR-AUTH-003` owns authenticated direct registration in 사용자 관리; `SEC-AUTH-004` owns default-group membership on active transition. `FR-AUTH-004`, `SEC-AUTH-003` and `FR-PRINCIPAL-001` are now linked with accurate notes. `FR-CONFIRM-006` and `FR-CONFIRM-001` correctly remain separate grade and L1 outcome/undo authorities.
- **Browser/process boundary promoted to SRS:** AC-12 and live #80 require a fresh Playwright-owned isolated Chromium, prohibit existing/default profile or browser reuse, direct CDP/`connectOverCDP` attachment and OS/native input automation, verify extension-backed 200% with separate read-only `getZoom` after zoom and reset, cover forced-colors at 100% and 200%, and clean up only runner-owned PIDs without broad process-name termination.

## Contract coverage

- Independent roster and signup-mode loading/error/ready states, read-only retry ownership and stale privileged-data handling are explicit.
- Promise/result transport, same-tick registration guard, name retention and masked-password retention on failure, and submitted-generation clearing only after actual 201 `{id}` are explicit.
- Approve/reject/reopen use stable IDs, current accepted client status and per-account local locks; different accounts may proceed independently.
- L1 rejection has no preconfirmation. Accepted rejection exposes one exact-ID undo through the existing reopen endpoint and never recreates or directly approves the account.
- Accepted writes remain distinct from later roster-refresh failure; a read failure neither reverses nor repeats the write.
- Query/action/category/form generations, stale outcomes, conditional focus restoration and no-focus-steal rules are explicit.
- Superuser UI/category gating, ordinary/workspace-manager DOM exclusion and server authorization as the final boundary are explicit without inventing a component-local role policy.
- Registration/status metadata, wider account management, new endpoints, new server policies and atomic concurrency are not smuggled into #80.

## Status, stability and index

- `Status=planned` is correct: the current UI still uses void callbacks, swallows mutation failures and lacks the specified query/result adapters; Verification Evidence is intentionally empty.
- `Stability=stable` is reasonable after the scope, observable outcomes, limitations and verification boundary were made unambiguous.
- `docs/spec/00.index.md` correctly records planned 17 and interface 29 after adding one planned interface requirement.

## SpecKiwi checks

Executed from the repository root:

```text
speckiwi validate --json
  errors=0, warnings=1
  SRS-W072: pre-existing 02.feature-request-live-preview.md number collision

speckiwi links check --json
  checked=1081
  pre-existing broken link: IR-AUDIT-004 GitHub issue value "32"
  no IR-PRINCIPAL-002/#80 broken-link diagnostic

speckiwi summary --target phase-1 --json
  IR-PRINCIPAL-002 is a planned, stable new-work candidate
  missingEvidence=[]; stabilityBlockers=[]
```

The unrelated global warning and `IR-AUDIT-004` link defect do not affect this verdict.

## Independent verification and change boundary

The primary review inspected both live issues, the full requirement and trace block, the final Astra decision, App/AppShell/query/client components, server routes/services and relevant tests. A separate verification agent independently reached the same **C0/H0/M0/L0** verdict and confirmed that all previous findings remain resolved.

Only this review file was replaced. No product code, tests, SRS, GitHub issue, commit or push was changed.
