# Issue 83 — binding managed-workspace scope decision

Decision owner: Astra. Date: 2026-09-18. Decision only; no implementation, test execution, SRS mutation or issue closure is claimed. This is an implementation decision attached to `IR-WORKSPACE-002`, not an alternate requirements source. `docs/spec/` remains authoritative.

## Authority and observed baseline

Read root AGENTS, SRS index, live #83/#69, the #69/#61 decisions, `IR-WORKSPACE-002`, `IR-SHELL-002`, `FR-PRINCIPAL-004`, and current workspace/session/principal routes, managed-workspace policy, App/query/client/panel wiring and relevant tests. SpecKiwi envelope: `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`; mode `sdd`, target `phase-1`, no stability blockers. `IR-WORKSPACE-002` is planned/stable.

`GET /api/workspaces` provides visibility, not a management projection. `/session.adminWorkspaceCount` supplies a count, not authorized workspace identities. `managedWorkspacesOf` already computes workspace administration server-side. App deliberately supplies only loading/error to #69 because it has no authoritative management projection. The existing principal search accepts an explicit `workspace:<id>` authorization context; that context does not filter the principal roster or limit bulk revocation to that one workspace.

## Binding server and client contract

Add one read endpoint, `GET /api/managed-workspaces`, using the existing authenticated actor and `managedWorkspacesOf` policy. Its successful body is:

```ts
type ManagedWorkspacesBody = {
  scope: 'instance' | 'managed-workspaces';
  workspaces: readonly { id: string; name: string }[];
};
```

The server derives `scope` from current authoritative superuser membership, never a request parameter or client claim. A superuser receives the policy-authorized workspace projection and `scope: 'instance'`, even when the instance has zero workspaces. A workspace manager receives only managed workspaces and `scope: 'managed-workspaces'`. An authenticated non-manager receives the same shape with an empty list and managed-workspaces scope: this reports only their own empty authorization set. It must not include instance totals, inaccessible workspace counts/names/IDs/paths, roster candidates, or reasons identifying hidden workspaces. Unauthenticated requests receive the established 401. Authorization/read failures are errors, not fabricated successful empty lists. Set `Cache-Control: private, no-store` on this endpoint's responses, retaining normal cookie/auth cache variation supplied by the server framework. Do not persist this projection in browser storage. React Query may retain only generation-keyed in-memory state, removed on authentication-context transition as specified below.

Return stable IDs and names only, deterministically ordered by ID. Preserve the existing `/workspaces` response byte-shape and meaning. Do not change `permissionOf`, group membership, administrative policy, archived-workspace policy or ordinary tree visibility while adding the projection; derive eligibility from the same policy used by current management diagnostics.

Provide a dedicated typed API function and query hook. The query may run once authenticated identity is known, including for an ordinary user, so a real successful empty result is representable. Do not use an old session count as proof that a positive scope exists or as a substitute for querying it. App forwards loading, ready with data, or error with an actual current-query `refetch`. Missing, disabled, pending or failed query data cannot become ready-empty. While an authoritative refresh is unresolved/failed, privileged candidates and execution are unavailable; stale results are not current proof.

## Complete #69 integration

Use the returned workspace IDs as the only source of the picker authorization anchor. Retain the current anchor if it remains in the successful set; otherwise select the first ID in the server's deterministic order. No extra workspace selector is necessary: this is a search authorization anchor, not a filter of the later operation. Never fall back to the first visible workspace, a tree node, a fixed ID, or an arbitrary group. Pass that exact `workspace:<id>` to the shared picker, which still independently authorizes every request.

The successful empty list maps to #69's `empty` state and may show `관리 권한이 있는 워크스페이스가 없습니다.` Only this state gets that text. Preserve the server `scope` even in this state. A zero-workspace superuser has instance eligibility but no existing workspace-scoped picker target; do not invent `instance:*` search, fabricate a target or broaden the 권한 감사 category. #86 independently owns the audit-log entry case, not principal search.

Wire both bulk-revoke and simulation pickers to this query through App → AppShell → AclAuditPanel. Revocation execution scope remains the scope from each server preview, covering all managed workspaces or the instance as today. Choosing one anchor must not silently narrow that operation. Broken-inheritance reads continue to use their independently authorized endpoint; their data is not reconstructed from this list.

Keep source-query identity separate from dependent authorization context. Key the managed-workspaces source query only by authenticated user identity and auth generation: `['managed-workspaces', userId, authGeneration]`. Returned workspace IDs or scope must never enter that query's own key; the first request does not depend on its result, and receiving a response must not re-key/refetch the source query.

After a successful source response, derive a dependent authorization-context fingerprint from its `scope` and complete sorted workspace-ID set. Combine that fingerprint with user/auth generation for principal-search, simulation and revocation-preview query keys and selection/consent/panel generations. Do not use only count or first ID: a same-count change from workspace A to B is a new dependent context. A fingerprint change invalidates dependent state without changing the source key. Account/auth-generation change cancels and removes the previous source query and dependent privileged queries/state; late responses from that generation cannot repopulate the current cache or UI. Scope loss/change immediately clears old candidates, selected privileged previews, open consent and executable plans; late search/preview/mutation completions cannot repaint another account. Re-establish selection through current authorized searches. Every diagnostic read and POST still checks current authority server-side: the projection is not a bearer authorization token. Do not claim push-based immediate revocation detection when the product has no such subscription.

This slice has no mutation or new confirmation of its own. Existing #69 fresh complete-plan L3, exact subject-set identity, sequential stop-on-first-unconfirmed execution and actual-result/refresh-failure distinctions remain binding. An empty/error scope must cause zero search or mutation requests through the disabled UI.

## UI, focus and evidence gates

Keep three audit tabs, existing newspaper typography/palette, and #61's two independent settings scrollports. Loading is a polite status; an error has an actual retry button. On retry, retain focus on the initiating button until it disappears; if it disappears while focused, move to the current section heading or newly available picker. Scope invalidation moves focus only when its former owner was removed, to an available heading/status; never to another account's result. Names wrap, no global scroll-width growth, no hidden private text in aria/tooltips/cached DOM. Preserve shared picker keyboard and Korean IME handling.

Future implementation is strict test-first: first fail server projection/privacy tests and the actual App integration test that currently cannot produce a ready managed scope; only then implement the minimum change. Required cases: first visible workspace is unmanaged; mixed managed/unmanaged list; user versus group-derived management; superuser with zero/nonzero workspaces; authenticated ordinary user; unauthenticated request; same-count scope replacement; role/account change during pending fetch; loading/error/retry/ready-empty; no cross-account cache hit; source query starts without response data and keeps its key after success; changed response fingerprint invalidates dependent queries without self-refetch churn; auth transition removes previous caches; exact `Cache-Control: private, no-store`; unchanged `/workspaces`; real picker, simulation and revocation authorization after scope loss. Re-run existing workspace/principal-search/ACL-audit/bulk-revoke and relevant server authorization regressions. Do not weaken old privacy assertions to make new tests green.

Use isolated Playwright with temporary database/docs root, unique server port and persistent Chromium profile; seed real users and workspace ACLs, and enter the built app through login → settings → 권한 감사. A component fixture alone cannot prove wiring. Record 1280×720, 1440×900, 1920×1080 × light/dark × 100%/genuine 200%, plus forced-colors at both zoom levels. Apply browser zoom with an isolated extension `chrome.tabs.setZoom(tabId, 2)`, assert `getZoom() === 2`, and record CSS viewport/DPR before/after. CSS zoom, transforms, device scale or half-sized viewports are not substitutes. Exercise 100→200→100 without reload during loading, a ready selected plan and an error; capture computed geometry, focus and last-control reachability. Normal text ≥4.5:1, large text ≥3:1 and focus/control boundaries ≥3:1. Stop only test-owned PIDs after confirming ownership, never all Node processes. Independent verification reviews original issue/SRS, red/green and browser evidence.

## Dependencies and closure

Implement #83 before the integrated #84 picker work. #85 can implement its backend independently but final #69 product evidence follows #83; #86 is independent. No new roster endpoint, policy, selection filter, workspace administration UI or atomic bulk-revoke API is authorized here.

At this decision's live read, #69 and #61 are already CLOSED, while #83 is OPEN. Completing #83 closes only #83 after its own AC/evidence; it resolves #69's managed-search gap but leaves #84's bypass metadata and #85's restore contract outstanding. Do not reopen/reclose a parent or claim all ACL-audit capabilities complete. Collective follow-up completion requires #83 + #84 + #85 and integrated regression evidence; the historical design closure is not that evidence.
