# Grant-result identity handoff for issue 65

Decision owner: Astra, 2026-09-17. Status: **design input for a new SRS requirement and separate GitHub issue; not implementation authorization or completion evidence**. This document supplements the existing #65 decision without changing `docs/spec/` requirements, statuses or evidence. Root must register and independently review the resulting requirement/issue before implementation. No product code, test, SRS mutation or issue creation is included in this task.

## Problem and source contracts

An editor may grant view/edit permission but must not receive the ACL/accessor roster. The grant service already returns the authoritative affected entry ID; the HTTP route discards it and returns 204. Consequently the editor cannot bind the post-grant `회수` action to that entry without guessing or violating roster privacy.

| Source | Existing obligation or observed behavior |
| --- | --- |
| `FR-CONFIRM-014` AC-1..3, VE-1/VE-2 | L1 widening has an actionable `회수` toast and the warning that already-read content cannot be recovered. VE-2 preserves the administrator's grant → fresh list → exact entry DELETE path. |
| `SEC-ACL-015` AC-1/5/6 | Roster names and substitutes are management-only; editors may see access counts. An operation receipt cannot become a partial roster. |
| `SEC-ACL-009` AC-1/2/5/6 | Editors grant at or below their level and revoke only entries they granted; administrators may revoke all. `grantedBy` remains authoritative. |
| `packages/server/src/app/acl/grant-service.ts` | `grantPermission` already returns `{ok:true,entryId}` after existing authorization, repository mutation and audit recording. `revokePermission` looks up the entry and recalculates current permission and `canRevoke`. |
| `packages/server/src/infra/sqlite/acl-repository.ts` and `migrations/001_init.sql` | `(node_id,principal_id,level)` is unique. A duplicate grant returns the existing row; `ON CONFLICT DO NOTHING` preserves its original ID and `grantedBy`. It does not transfer ownership to the caller. |
| `packages/server/src/http/routes/workspace-api.ts` | `POST /api/nodes/:nodeId/share` currently returns 204 on successful grant, 401 without an actor and the existing collapsed failure response otherwise. |
| `packages/server/src/app/acl/share-service.ts` | An editor's share view has `rows:null`; an administrator gets authoritative direct/inherited rows. This remains unchanged. |
| `packages/web/src/api/client.ts` | `grantShare` currently has a void result. The existing helper accepts successful HTTP responses and attempts JSON parsing; the grant-specific adapter can consume a typed result without rewriting the generic client. |

The missing handoff is an **operation result**, not a bearer capability, authorization token, roster lookup or new permission. Knowing its entry ID never authorizes DELETE by itself.

## Chosen minimum HTTP contract

Keep the existing endpoint, request body and policy. Preserve legacy 204 behavior using a single opt-in response preference:

```http
POST /api/nodes/:nodeId/share
Prefer: return=representation
Content-Type: application/json

{"principalId":"<existing selected principal ID>","level":"view"}
```

On success with this preference, return **200 application/json**:

```ts
type GrantReceipt = {
  entryId: string;
  canRevoke: boolean;
};
```

`entryId` is exactly `grantPermission(...).entryId`, whether the unique entry was created or already present. `canRevoke` is an advisory snapshot obtained by applying the **existing `canRevoke` domain policy** to that returned entry and the request actor's current effective permission. It is not a new stored grant or guarantee of future authorization. No timestamp, signed token, expiry, principal/name/group membership, source path, grantor, ACL list, count, `created` flag or unrelated entry ID is added.

Requests without `Prefer: return=representation` keep the existing 204/no-body success response. An unrecognized preference is not an opt-in and follows the existing no-representation response. Do not accept the preference as permission or skip any existing body/auth/ACL checks. Existing failure status/body mapping is preserved and never includes a receipt. There is no new GET-by-principal endpoint, no roster expansion, no DELETE behavior change and no capability database.

The preference is one bounded compatibility branch, not a configurable API policy framework. The frontend sends it only from the grant adapter that needs the receipt. This allows old callers and their exact-204 expectations to remain valid while the new client explicitly requests the handoff. No general client JSON parsing, request-header or error-handling refactor belongs in this change.

## Server assembly and permission invariants

The existing service/repository already determine the entry ID; do not reconstruct it from request fields, row ordering or a second grant. For the opted-in representation, the route reads that returned entry through the existing repository and calls the existing `canRevoke` rule with current actor/permission. Use the same rule as the DELETE service rather than duplicating conditions in HTTP code. This is a read-only result projection after the one existing mutation; service authorization, database schema, uniqueness, grantor ownership and audit behavior remain unchanged.

Within the current synchronous grant-route assembly, the returned entry is available immediately after the service returns. Do not invent a normal `entryId` fallback if that invariant fails. A genuine post-mutation response failure is an uncertain outcome to the client, never authority to send an automatic second POST. No transaction, retry worker, lock service or idempotency-key subsystem is introduced here.

| Successful grant case | Receipt / toast behavior |
| --- | --- |
| Editor creates a permitted entry | Actual new ID; existing policy permits own-entry revoke, so `canRevoke:true`. L1 document grant exposes working `회수`. |
| Editor repeats their own same-node/principal/level grant | Same existing ID and original grantor; `canRevoke:true` while existing policy permits it. The action revokes that entry; it does not promise to restore a prior ACL state. |
| Editor repeats an entry granted by another person or system | Same existing ID, unchanged grantor; `canRevoke:false`. Do not transfer ownership, create a duplicate or elevate permission to manufacture undo. |
| Administrator grants/repeats | Returned actual ID and policy-derived `canRevoke:true` at response time. Existing fresh-list route remains a supported fallback/regression. |
| Permission changes after receipt | The receipt cannot override current DELETE authorization. The existing DELETE endpoint rechecks and may deny. |

The duplicate-foreign-entry case is an existing no-op mutation plus an existing revoke restriction, not a newly introduced exception to security. It must be represented explicitly in the **new SRS acceptance wording**, linked to `SEC-ACL-009`: a successful receipt does not promise that the caller created or owns the entry. `FR-CONFIRM-014` must not be silently rewritten to demand a forbidden revoke. Preserve actionable L1 completion for a newly created editor-owned entry and for all policy-permitted receipt cases. Keep the duplicate denied case separately tested and honestly explained.

## Editor privacy and rendering

Keep GET share `rows:null` for editors and all existing search/roster filtering. The receipt returns one opaque operation-specific entry reference for the caller's authorized selected node/principal/level; it does not authorize browsing entries or reveal names of other accessors. `canRevoke:false` must not disclose who originally granted it or why ownership differs. Avoid raw receipt data in DOM attributes/tooltips, query strings, UI logs or an editor-visible ACL list.

Use the already selected principal's permitted display name for the result message. Preserve the existing `회수` label and `되돌려도 이미 열람된 내용은 회수되지 않습니다.` notice. A policy-permitted L1 receipt enables `회수`; clicking it sends the existing DELETE for the exact receipt ID. Await the real outcome, guard duplicate activation, show a safe failure and allow deliberate same-action retry where the current policy still permits it. A 404/denied/stale response is not declared successful, and it does not trigger another grant.

For `canRevoke:false`, show the accepted-operation status and the non-secret explanation `현재 권한으로는 이 항목을 회수할 수 없습니다.`. Do not offer an enabled no-op, expose a roster or identify the original grantor. This truthfully reflects existing policy for an already-present foreign/system entry. It is distinct from the old editor handoff gap: a new editor-owned entry must now return a usable receipt and cannot remain generically unsupported.

The receipt does not change L1/L2/L3 selection. Use it for the existing L1 document-grant toast. Group/container/suspended flows retain their current gates; do not add an unconditional toast shortcut that bypasses a container revoke's L2 confirmation. No bulk action or grant-level option is added.

## Client ownership, rollout and failure handling

Adapt only the grant-specific typed result chain through `client.ts` → existing App callback → sharing prop owners → ShareModal/GrantToast. Carry the captured source node, selected principal, requested level and current authenticated-owner/operation generation locally alongside the receipt. Do not put it in persistent storage or use a global last-grant slot shared across users/nodes. The receipt itself remains only `{entryId,canRevoke}`; the caller already owns the request context.

Only accept a correctly shaped receipt for the request that produced it, while its node/owner/operation generation is current. Closing the modal, selecting another target, changing authenticated owner or starting a superseding local operation makes a late completion ineligible to repaint, enable an old action or close a new modal. A mere list refresh or theme change must not erase the valid current operation result. Ignore obsolete completion; do not secretly revoke its entry or repeat the POST.

Grant mutation and metadata refresh have separate outcomes. Return a valid successful receipt even if the later share/tree refetch fails; expose the latter as query error with GET-only retry. Never withhold a usable editor receipt until a forbidden roster arrives. Do not obtain the receipt through polling.

Compatibility paths are explicit:

- Old client → new server, no preference: unchanged 204 behavior.
- New client → new server: preference opts into 200/typed receipt; editor L1 path is complete when tested end to end.
- New client → old server, or successful response without a valid receipt: classify the write as **accepted but receipt unavailable**, not as permission-grant failure. Administrator may use the approved fresh-node-read/unique direct principal+level match from the main #65 decision. Editor displays a safe unavailable-receipt notice and has no guessed action. No automatic POST retry. This degraded rolling-upgrade behavior is honest but does not satisfy the editor-path completion gate; deploy the new server before closing the issue.
- Failed HTTP/network response: show the existing safe mutation failure/uncertain-outcome handling; do not produce a receipt or a success toast from an exception. A lost response after possible commit must never trigger an automatic grant retry. Deliberate user retry remains subject to existing uniqueness and permission rules.

The frontend should model accepted-with-receipt, accepted-without-receipt and failed/uncertain separately in its local result type. Use shape checks/branches for predictable missing or malformed fields; do not use thrown parsing errors as normal state selection. The generic request helper remains out of scope.

## Proposed acceptance inputs for SRS and the separate issue

These numbered cases are drafting inputs, not allocated Requirement IDs or checked SRS ACs. The new requirement must be registered under `docs/spec/` using official tooling before implementation; associate it with this receipt behavior and trace to `FR-CONFIRM-014`, `SEC-ACL-009` and `SEC-ACL-015`. Preserve their existing IDs/statuses/evidence. Add new per-role product evidence; do not delete or weaken VE-2 because a better receipt path is being introduced.

1. With no preference the successful existing grant endpoint returns 204; with the exact representation preference it returns 200 and only a nonempty actual `entryId` plus boolean `canRevoke`. Denials retain existing status semantics and contain no receipt.
2. The receipt entry matches the persisted node/principal/level entry returned by the existing service. Duplicate same-tuple grants return the same ID, add no entry and do not change its original `grantedBy`; view and edit tuples stay distinct.
3. An editor with no ACL roster creates an authorized L1 document grant, receives `canRevoke:true`, sees exact `회수` plus the existing warning, clicks it and actually removes that entry through the existing DELETE. GET share remains `rows:null` before and after; no accessor names/initials/source paths/roster are exposed.
4. An editor repeating a foreign/system-created tuple receives `canRevoke:false`; the existing grantor and DELETE denial remain unchanged. An administrator and an editor repeating their own tuple retain policy-permitted revoke. Test the actual policy, not just a passed boolean fixture.
5. The administrator App grant → fresh-list authoritative match → toast DELETE regression from VE-2 remains valid as a no-receipt fallback. Cover same-name different-principal, same-principal different-level and inherited decoys. New receipt use must not weaken the public behavior or bless guessed IDs.
6. A captured receipt never overrides later permission loss, missing/replaced entries or another actor's session. DELETE recalculates policy; unauthorized attempts fail and do not remove another entry. There is no bearer-like bypass based on `canRevoke:true`.
7. Duplicate UI submission/clicks are guarded. Late grant/revoke/refetch results after node/owner change or close cannot enable/mutate UI for the new context. Failed refresh after successful grant preserves the usable receipt and offers only query retry. Failed revoke preserves safe status and never regrants.
8. A legacy 204 or malformed/missing receipt on an otherwise successful response produces accepted-without-receipt behavior; administrator fallback works and editor limitation is explicit. No fabricated ID, success-from-error or automatic POST retry. Simulate response loss/parse failure without claiming rollback of a possibly committed grant.
9. Existing permission grades, search privacy, server audit records and original grant/revoke policies pass regression. New JSON includes no grantor, additional principal details, roster, ancestor path or secret. No new endpoint/schema/dependency is introduced.
10. Fresh isolated Playwright product evidence covers administrator and editor L1 toast, scope/privacy and actual persisted revoke result, with red→green tests preceding implementation. Reuse the approved #65 geometry/keyboard/theme coverage; all browser evidence remains fresh Playwright-owned Chromium only, no existing browser/CDP/OS automation. Any 200% evidence uses the disposable persistent-profile extension `setZoom(2)` plus independent `getZoom===2`. Synthetic composition is labelled honestly; native OS surfaces remain non-blocking untested limitations. Cleanup targets only known owned PIDs.

## Allowed implementation boundary after requirement registration

Expected server change: the existing grant POST route's optional success representation, using the existing returned ID, repository read and current `canRevoke` rule. No repository/migration/grant/revoke policy mutation is needed. If a tiny result-projection helper improves testability, it must only compose those existing reads/rules and must not become a second policy implementation.

Expected web change: grant client preference/receipt typing, grant-specific App/AppShell/DocumentArea adapters and ShareModal/GrantToast operation-result ownership. Existing generic query/auth/router frameworks remain intact. Tests cover the actual route, policy-preserving duplicates, client fallback, product App wiring and editor no-roster roundtrip. The implementer writes failing tests first, a different reviewer evaluates the result, and root owns SRS evidence and separate-issue/#65 closure.

This design closes the **missing design decision** for an editor-owned grant receipt. It does not close the implementation blocker: the new SRS requirement, issue registration, implementation, independent review and actual editor grant→toast→revoke evidence are still required. The historical administrator behavior stays required throughout; no existing SRS contract is generally downgraded to “unsupported.”
