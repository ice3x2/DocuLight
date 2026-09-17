# Issue #89 Astra decision — independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Authority, SRS fit and refinement gate

The decision is valid supporting implementation guidance for planned/stable `IR-WORKSPACE-003`; it keeps `docs/spec/` authoritative and claims no implementation, verification, issue closure or SRS mutation. It correctly identifies the current literal conflict: generic `FR-CONFIRM-012` AC-2/3 defines a view/edit-style inherited reach count that excludes broken inheritance, while `IR-WORKSPACE-003` AC-2 requires workspace administrator impact not to exclude those branches. The decision stops implementation until a guarded SpecKiwi refinement qualifies `FR-CONFIRM-012`, preserves ordinary `share.reached`, and leaves grant execution disabled if reconciliation cannot be applied. This is the required SRS-first gate rather than an undocumented interpretation in code.

The selected refinement is consistent with `SEC-WORKSPACE-002/003` and `SEC-ACL-008`: `admin` is fixed to an actual workspace, acts as the workspace upper gate across broken inheritance, and does not override serving/lifecycle exclusions or cross workspace boundaries. One L2 follows `FR-CONFIRM-011`; no count-dependent L3 or unconfirmed generic share route is introduced.

## Preview coverage, counting and privacy

The dedicated workspace preview separates two facts that must not be conflated. Semantic coverage is the workspace and its ACL-addressable descendants now and in the future, including broken-inheritance branches. `visibleDescendantCount` is the narrower confirmation number: unique currently servable file/directory descendants visible to the authorized requester, with the workspace root excluded. It includes broken branches and non-Markdown tree nodes, while excluding attachments, versions, principals, ACL rows, other workspaces, future nodes, hidden-name/archive/trash/orphan records and descendants suppressed by ancestor serving rules.

This matches the current repository model: existing `reachedDescendants` intentionally prunes broken inheritance for view/edit; workspace administrators and superusers have the upper gate for all ACL-addressable descendants; `isServable` remains the independent name/state gate. The decision explicitly forbids deriving the number from `share.reached`, a client tree, filesystem scan or partial/inconsistent graph.

The privacy boundary is complete. Workspace existence and current management authority are checked before principal details, impact or token state. Missing/unmanageable workspace, wrong target kind and missing/rejected principal share a neutral response. The preview exposes no denominator, hidden/broken/excluded count, descendant names, group expansion or accessor aggregate. Hidden-only mutations neither change the visible count nor invalidate the token, preventing the freshness mechanism itself from becoming a hidden-state oracle. Pending, suspended and system-group candidates retain the existing scoped PrincipalPicker/search and ACL policy rather than creating a second eligibility policy.

## Token integrity, freshness and one-intent execution

The preview token contract is sufficient: opaque and tamper-resistant, five-minute bounded state, bound to authentication context, actor, workspace, principal, fixed `admin` operation and the server-held semantic snapshot. Unknown, expired, forged, cross-actor and cross-target tokens fail closed; restart invalidates outstanding ephemeral state and never falls back to an unconditional grant. A token is not treated as authority, because both preview and execution rebuild current authentication, account/group state and workspace management authority.

The snapshot covers displayed workspace/principal identities, principal status and warnings, direct-assignment state, visible count and exact visible node identities, relevant topology/inheritance, and material authorization state. Equal counts with replaced nodes are stale; visible rename/status/topology/inheritance/assignment changes are stale; irrelevant other-workspace and hidden-only changes are not exposed. The final comparison uses a server-issued snapshot recomputed inside the protected execution boundary, never client counts or a separate refresh-then-write sequence.

Client generations bind preview and mutation results to the captured authentication, workspace and principal context. Late responses cannot populate another selection. Missing, loading, failed, expired, invalidated, unacknowledged or submitting states disable both the control and mutation callback. A changed preview requires explicit non-mutating acknowledgement in the same L2 before a later deliberate submission; it is never auto-resubmitted.

## Atomicity, replay, outcomes and fixed-admin execution

The decision requires current authentication/authority, workspace and principal validation, snapshot comparison, the one `grantPermission` call, ACL write and `acl.grant` audit append within one synchronous metadata transaction/serialization boundary. This matches the existing `MetadataStore.transaction` and `better-sqlite3` adapter. It prohibits network/Promise gaps and write-only retry, and requires contention to fail safely or rerun the complete conditional operation.

The dedicated POST accepts only `principalId` and `previewToken`; the server supplies workspace identity from the route and the fixed `admin` level. It cannot silently downgrade to `view`, accept a node target, or trust client authority/count/warnings. Existing generic view/edit sharing remains unchanged. Direct already-assigned state is distinguished from effective group/superuser authority, and the decision requires no synthetic grant or audit for it.

One accepted token is serialized before the grant service, so rapid clicks and transport replay cannot append duplicate audit events despite ACL tuple deduplication. A replay either returns an authorized captured receipt or is rejected without execution; restart invalidation is stated honestly rather than described as durable exactly-once delivery.

The outcome table preserves facts across success, already assigned, stale/expired, denied/ineligible, preview failure, transaction failure, unknown transport outcome and post-commit refresh failure. In particular, accepted mutation is not repeated to repair a failed read; transport loss triggers authoritative state recovery without claiming rollback; and a late result remains bound to its captured target. Cancellation writes nothing, pending submission is not misrepresented as client-abort rollback, and refresh failures do not erase a committed success.

## #72 integration, accessibility and evidence

The decision connects the adapter to #72's actual workspace management detail rather than accepting a standalone endpoint, fixture response, placeholder or disabled button as completion. It preserves managed/all selection ownership, direct administrator entry IDs, existing removal/last-admin/self-removal behavior, server-derived adminless state and #61 authorization-loss fallback. It correctly states that #89 removes only the administrator-grant blocker; #72's remaining list, selection, rename, role and browser obligations and #73 creation ownership remain separate.

The L2 presentation identifies the full workspace, stable ID context, selected principal/kind/status, fixed level and visible descendant count while separately explaining invariant upper-gate coverage. Loading, failure, stale, acknowledgement and submission states are distinct. Existing AlertDialog semantics, cancel-first focus, focus trap, Escape, return/fallback focus, live announcements, IME protection, long-name wrapping, 200% reachability, light/dark/forced-color focus and disabled-state readability are all explicitly covered.

The decision requires red-first automated evidence after SRS reconciliation for authorization/privacy, broken-inheritance counting, hidden-only non-oracle behavior, same-count identity replacement, token tampering/replay, authority/status races, transaction rollback/contention, exact grant/audit call counts, already-assigned/cancel/transport outcomes, late-result isolation, ConfirmGate regressions and #72 wiring. It also requires an isolated built-product Playwright run with temporary DB/storage/account/profile/ports, captured network and persisted ACL/audit facts, 12 resolution/theme/genuine-zoom environments plus forced colors, independently verified browser zoom, keyboard/focus/resize/theme persistence and separately qualified native Windows Korean IME evidence. Fixture-only or emulated-zoom evidence cannot close the issue.

## Closure assessment

The closure gates are accurate. #89 remains open until `IR-WORKSPACE-003` AC-1–4 have implementation, supported SRS evidence/status updates and independent automated/browser verification. #72's administrator portion remains blocked until its real detail uses both the reviewed preview/execution adapter and the existing safe removal path. The decision records all present blockers and makes no premature completion claim.

## Sources inspected

- Live GitHub issues #89 and #72
- `AGENTS.md`, `docs/spec/00.index.md`, `IR-WORKSPACE-001/003`, `FR-CONFIRM-004/011/012`, `SEC-CONFIRM-003`, `SEC-WORKSPACE-002/003`, and `SEC-ACL-008`
- #72 Astra decision, independent review and administrator-impact gap
- Current uncommitted workspace list/rename/detail code and tests
- Current workspace routes, principal search/scope policy, grant/share/reach/permission/serving services, ACL/node repositories, metadata transaction adapter, `ConfirmGate`, shared client/query adapters and relevant tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue89/astra-decision.md`

This is a pre-implementation decision review. No product implementation, automated test, browser run, SRS/GitHub/status mutation, commit or issue closure was performed or claimed.
