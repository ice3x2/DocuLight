# Issue #83 Astra decision independent re-review

Reviewed 2026-09-18 against live #83/#69, `IR-WORKSPACE-002`, the #69/#61 decisions, current workspace/session/principal-search/App/query contracts, and the revised Astra decision. This review changes no product code, SRS, GitHub state, or Astra decision.

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

## Findings

### CRITICAL — none

### HIGH — none

### MEDIUM — none

### LOW — none

## Accepted corrections

The revised decision removes the circular cache contract. The source query is now keyed only by authenticated user identity and auth generation, while `scope + complete sorted workspace IDs` forms a separate fingerprint for dependent principal-search, simulation, revocation-preview, selection, consent, and panel generations. A fingerprint change invalidates dependents without re-keying or refetching the source. Authentication transitions cancel and remove both source and dependent privileged caches/state, and explicit tests cover first request, stable source key, same-count replacement, late responses, and self-refetch churn.

The response cache policy is also exact: `Cache-Control: private, no-store`, no browser-storage persistence, generation-keyed in-memory retention only, and removal on authentication-context transition.

The remaining decision is feasible and consistent with `IR-WORKSPACE-002`: it reuses `managedWorkspacesOf`, preserves `/api/workspaces`, does not treat visibility as administration, distinguishes loading/error/ready-empty with a real refetch, retains server authorization on every operation, and handles zero-workspace superuser, privacy, focus, races, TDD, and built-product Playwright evidence without broadening #86.
