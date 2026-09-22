# Issue 85 — binding fresh inheritance restoration decision

Decision owner: Astra. Date: 2026-09-18. Decision only; implementation, tests, SRS changes and GitHub mutations are excluded. This is supporting design for `IR-ACL-005`; `docs/spec/` is the requirements authority.

## Authority and factual correction

Read AGENTS/index, live #85/#69, #69/#61 decisions, `IR-ACL-005`, `FR-ACL-005`, `FR-CONFIRM-004/011/012`, `SEC-CONFIRM-003`, current inheritance/permission/share/reach services, routes/client/panels and their tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers. `IR-ACL-005` is planned/stable.

The current broken-inheritance row has node ID, workspace ID/name, path and ACL-accessor count only. InheritanceAuditPanel correctly leaves restoration unavailable. Domain `restoreInheritance` returns `{ok:true|false,...}`; current HTTP POST returns **204 or 404**, while the client returns `Promise<void>`. The issue's `{ok}` wording must not be mistaken for an existing JSON wire response. This decision preserves the 204 success contract and explicitly maps it to a typed client outcome.

## One complete authoritative preview

Add `GET /api/nodes/:nodeId/restore-inheritance-preview`. It authorizes the current requester as a manager of the target workspace, including the existing superuser policy, and requires a real servable node with inheritance currently off. Missing, forbidden, hard-hidden/reserved, trashed or otherwise non-servable targets return the established non-enumerating denial; unauthenticated is 401. Authorize before resolving or returning names, paths, ACL rows or counts. A target already restored is a neutral unavailable/conflict for an authorized requester, not another successful restoration.

Return this minimal complete shape, using the existing permission/share projection rules:

```ts
type RestorePreview = {
  nodeId: string;
  workspace: { id: string; name: string };
  path: string;
  kind: 'file' | 'directory';
  retainedDirectAcl: readonly RestoreAclRow[];
  incomingParentAcl: readonly RestoreAclRow[];
  applicableDescendants: number | null; // file: null; directory: exact permitted count
  revision: string; // opaque server proof of this actor/target/impact snapshot
};
type RestoreAclRow = {
  principalId: string;
  principalName: string;
  principalKind: 'user' | 'group';
  level: 'view' | 'edit' | 'admin';
  source: string | null;
};
```

`retainedDirectAcl` describes all direct entries that remain on this node. `incomingParentAcl` describes the additional inherited ACL rules that will reach the target when only its own inheritance flag becomes true. Calculate from the real ancestor chain with the target flag hypothetically on, stopping at any higher broken inheritance boundary; include workspace inheritance only if the chain reaches it. Do not present already-existing workspace-admin or superuser bypass as newly granted access. For a top-level node the parent source is the workspace. Use existing principal naming/fallback/privacy rules and display normal level labels. The list is ACL rules, not expanded group members or a newly reachable-person count. Preserve separate direct and incoming rows even when the same principal occurs in both; do not imply replacement/deny behavior or clone parent ACL entries.

For directories, `applicableDescendants` counts visible, servable descendants reached through uninterrupted inheritance, excluding each broken descendant and its whole branch. Reuse the reach policy; do not count ordinary ACL denials differently from the management policy. Show it in the confirmation only as `적용 하위 노드 N개`, including true zero. Add the unconditional explanatory notices that inherited changes flow to applicable descendants and that descendants with broken inheritance do not receive them. Do not disclose whether a hidden broken branch exists via a conditional notice, or return excluded count, denominator, total descendants, skipped path list or subtree accessor totals. Files omit that count/these directory notices; never infer kind from the path.

No partial preview is executable: unresolved subject labels/ACL projection, invalid kind, missing count for a directory, missing revision or context mismatch produces unavailable/error with a real retry. Empty direct/parent ACL arrays are valid only when the server actually returned complete empty sets. A zero-count or empty-parent restoration still uses L2; it may affect future inherited grants.

## Freshness must survive the final request race

Read the preview freshly when the user invokes restoration, and re-read immediately before accepting confirmation. Bind it to auth generation, target ID and managed context. Compare the complete relevant snapshot, not only descendant count: a same-count replacement or parent ACL change matters. A changed preview invalidates consent, shows the new context and requires a fresh L2 acknowledgement; it never submits automatically. Query loading/error cannot use a previous preview as current authority.

Extend the existing POST `/api/nodes/:nodeId/restore-inheritance` to require the confirmed `revision` (JSON body). Define the stateless revision exactly as `v1.<base64url(HMAC-SHA-256(serverPrivateKey, canonicalSnapshot))>`, with unpadded base64url encoding of the full 32-byte digest. A plain content hash, client-generated digest or unsigned snapshot is not acceptable. This proves that the server authenticated the snapshot; it does not prove a human read it, replace the L2 flow or grant authorization. No new stored workflow, confirmation-token table or global ACL revision framework is needed.

The canonical snapshot is versioned and domain-separated for `restore-inheritance`, using deterministic UTF-8 serialization with fixed field order, explicit nulls and deterministic ordering of sets/entry tuples. Include actor ID and server-owned authentication context/generation, current authorization-relevant principal state, target/workspace IDs and displayed names/path, parent identity and relevant ancestor chain, kind/inheritance/serving state, ordered direct and incoming ACL entry identities/principals/levels/sources and all fields displayed in the preview, ordered node identities and relevant inheritance/topology/serving state behind `applicableDescendants`, the count itself, and principal state used by the projection. The frontend auth-generation counter is not trusted signing input. Do not sign only the public count or the display arrays: hidden internal entry identities needed to detect replacement stay in the server snapshot. Unrelated workspace edits need not invalidate it. Do not introduce a fresh request timestamp into this deterministic snapshot, which would invalidate an otherwise identical open/submit re-read.

Generate a cryptographically random 32-byte key once for the running server instance and keep it only in server memory; intentionally accept invalidation of open previews on restart or key rotation. Replace the key atomically on rotation and accept only the current key, with no previous-key grace fallback. A revision issued under a replaced key fails as stale (409), leading to a new preview/L2. `v1` fixes the serialization and algorithm contract: reject unknown versions, malformed encoding or wrong digest length as an invalid revision (409) after authorization; never downgrade to an unsigned/older algorithm or accept an unknown version optimistically. Any future version/key-sharing deployment requires an explicit contract update rather than silent cross-process fallback.

After validating the version, encoding and length using ordinary conditional checks, recompute the expected digest and compare the equal-length digest bytes in constant time, using the runtime's cryptographic constant-time primitive. Do not compare digest strings with ordinary equality or parse expected invalid input by throwing/catching exceptions. Return only the version plus digest as `revision`; do not put the secret, raw canonical snapshot, authentication/session identifiers or internal entry/descendant lists into the token. Never expose the signing key or canonical snapshot in logs, traces, client bundles or error responses; keep errors generic and do not return the expected digest on mismatch. The separately authorized preview response contains only its documented public projection.

At POST, rebuild the current actor, reauthorize and recompute/compare the relevant snapshot **inside the same database transaction/serialization boundary** that sets inheritance and appends the existing restore audit event. Do not await between the final check and write. Authorization loss gets the existing neutral denial, before any changed impact is disclosed. Missing precondition is 428; mismatched revision or an authorized already-restored target is 409. No mutation or successful restore audit event occurs for either case. Fresh valid execution remains 204. A transaction error rolls back both inheritance and audit event. All HTTP callers must obey the precondition; no legacy tokenless fallback or second unguarded route is permitted. Internal trusted domain callers are not proof that a web confirmation occurred.

The current general stores do not themselves promise this atomic boundary; wiring a narrow transactional restore application operation from the existing SQLite transaction facility is part of #85's backend scope. A client re-fetch followed by the old unconditional service is insufficient. Test the race at the write boundary, not only stale component state. This scoped freshness protocol does not create atomic multi-principal revocation or a general confirmation service.

## Exactly one L2 and honest outcomes

Use the existing shared ConfirmGate/alert-dialog layering with grade L2 for both files and directories. Title `상속으로 되돌리기`; show workspace/path/kind, the two read-only ACL sections, `직접 부여한 권한은 유지됩니다.`, and directory context above. No typing token, checkbox prerequisite, L3 escalation, per-row confirmation or edit/grant/revoke controls. No `부모 권한 가져오기` operation is invoked. The accepted operation changes only the same node ID's inheritance flag; its direct entries, descendant flags and node identity remain intact.

Keep preview preparation and stale/error state inside the same operation flow; never stack a second ordinary dialog with the L2. On stale impact, replace/lock the current consent and require cancel/reopen against the displayed fresh baseline; one active L2 at a time. Cancellation or failed pre-submit reads sends no POST and preserves server state. Disable duplicate submission and conflicting target changes while a write is pending. Dismissing UI must never imply cancellation of a request already sent.

Map confirmed 204 to client `{ok:true}` and definite server rejection to `{ok:false}` with a non-disclosing local outcome reason. Transport failure is **unconfirmed**, not proof of failure or rollback. A minimal adapter can carry `completed | rejected | unconfirmed` plus independent refresh status; never collapse these into success booleans. After a confirmed mutation, refresh broken-inheritance, affected share/accessor/tree/simulation data that is currently in use. Retain the successful outcome if any refresh fails and provide read-only retry; do not send restoration again. Until the broken list refreshes, leave that row marked completed/unavailable rather than executable. On transport uncertainty, re-read current authoritative state without automatically re-POSTing; if it is restored, report current state while not claiming which request caused it. If still broken, a deliberate retry starts a complete new preview/L2.

Target/account/role changes discard pending previews and close invalid consent. A late outcome may not paint another account or another node. Already-sent work cannot be rolled back by local unmount. The original target's actual server state/audit is the reconciliation source.

## Accessibility and test-first completion

Reuse settings' layout and existing semantic colors; long paths and ACL names wrap in local scrollports. Initial L2 focus is Cancel, background settings are inert, topmost Escape cancels only when not submitting, Tab stays in the dialog, and no default Enter or IME composition bypasses deliberate confirmation. Cancel/error returns to the same node's invocation button; after successful removal of that row, focus the next surviving node's action, previous one, or section heading in that order, only if removed content owned focus. Announce one concise result/stale/error message and do not steal focus on unrelated refreshes. Verify the whole ACL preview and last action remain reachable at 200%.

Strict TDD: first fail service/HTTP tests for complete projection and atomic stale rejection, then fail App→panel→preview→L2→POST integration tests, then implement only enough to pass. Test files/directories/top-level nodes, broken ancestors, retained direct ACL, duplicate principal sources, true-zero count, broken descendant pruning, hidden/trashed paths, ordinary editor/non-manager/privacy, forged/missing/cross-actor revision, altered digest/version/encoding/length, key rotation/restart rejection and fresh-preview recovery, canonical ordering stability, authorization loss, node move/rename/delete, parent ACL change, direct ACL change, same-count descendant identity replacement, already-restored race and transactional audit failure. Check that responses/logs do not leak keys or canonical snapshot internals; independent code review confirms the equal-length constant-time comparison rather than relying on a flaky wall-clock timing test. Test cancel/no POST, exactly one L2/no typing, failed preview, double-click, stale recheck, 204, definite rejection, unknown transport, refresh failure and role/account races. Regression includes inheritance-audit, share/permission/reach, HTTP ACL-admin routes, confirmation and settings overlay behavior. If implementation was written before red, remove it and restart test-first; never weaken a test to reach green.

Use a separately seeded backend/database/docs root, unique port and isolated persistent Chromium profile for Playwright against the built app; actually log in, restore via settings and inspect server state/audit, including a concurrently changed fixture. Component-only fabricated impact does not satisfy this issue. Record 1280×720/1440×900/1920×1080 × light/dark ×100%/genuine200%, plus forced-colors100%/200%. Browser zoom must use isolated `chrome.tabs.setZoom`, verified `getZoom`, pre/post CSS viewport/DPR, and 100→200→100 without reload with L2 open. CSS zoom, scaling and reduced viewport are not proof. Capture computed styles/geometry, focus/cancel/removed-row fallback and screenshots; contrast body≥4.5:1, large text/focus/boundaries≥3:1. No new text input is introduced, so new-field IME is N/A; preserve existing picker/keyboard regression. Stop only processes owned by this test, never all Node processes. Independent review must inspect original contracts and red/green/API/browser evidence.

## Order, exclusions and closure

Backend work can proceed independently of #84; final #69 integration is validated after #83, with its managed authorization context. No new bulk restore, audit browsing feature, raw roster disclosure, ACL editing, offboarding, undo re-breaking, copy-parent permission or permission-model change is authorized.

Live #69 is already CLOSED and #85 is OPEN. #85 closes only on its own AC and real server/client/UI evidence. If #83 and #84 are also complete, this removes the last of the three explicitly separated #69 integration gaps; otherwise name the remaining gap. Do not reopen/reclose #69 or mark broad ACL requirements verified solely from a decision document. Future SRS evidence must record this issue's specific projection/freshness/confirmation results through supported tooling.
