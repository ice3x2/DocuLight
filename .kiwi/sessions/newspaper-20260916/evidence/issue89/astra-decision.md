# Issue 89 — non-normative workspace administrator grant rationale

Decision: Astra, 2026-09-18, under delegated design ownership. This is a **non-normative** implementation rationale for `IR-WORKSPACE-003`; `docs/spec/` is the only requirements source. Existing design suggestions below add no independent acceptance gate. The 2026-09-18 correction records exact session binding and Playwright-only evidence in IR-WORKSPACE-003 AC-5–8 and its normative Implementation Notes. No product implementation, test pass, issue closure or verification is claimed by this document correction.

## Authority and current facts

Read repository AGENTS, live [#89](https://github.com/ice3x2/DocuLight/issues/89) and [#72](https://github.com/ice3x2/DocuLight/issues/72), the SRS index, #72 Astra decision and admin-impact gap, and current uncommitted workspace management, route, grant/share/count, principal-search, confirmation and SQLite code. SpecKiwi identified `C:\Work\git\DocuLight2.0`, `rootSource=server-cwd-discovery`, mode `sdd`, Active Target `phase-1`. `IR-WORKSPACE-003` is planned/stable with AC-1–4 unchecked and no evidence; there are no target stability blockers. The existing SRS-W072 document-number warning is unrelated.

The new requirement expressly covers server-authoritative administrator impact and stale-consent protection. Related contracts are `IR-WORKSPACE-001` AC-3, `FR-CONFIRM-004`, `FR-CONFIRM-011`, `FR-CONFIRM-012`, `SEC-CONFIRM-003`, `SEC-WORKSPACE-002/003`, `SEC-ACL-008` and existing scoped principal-search/status policy.

Observed implementation constraints:

- `share-service.ts` obtains `ShareView.reached` from `reachedDescendants`; that function stops at broken inheritance. It describes ordinary inherited view/edit grants, not administrator coverage.
- Workspace admin is an upper gate even under broken inheritance. Existing name/state serving gates still apply to administrators (`isServable`); admin is not permission to serve hidden system files, trash, archive or missing content.
- POST `/api/nodes/:nodeId/share` currently maps every non-edit level, including `admin`, to `view`; the web `grantShare` type accepts only view/edit. Neither is an administrator adapter.
- `grantPermission` is the existing policy/write/audit service. It checks grant policy, then writes an ACL entry and `acl.grant` audit event. The repository deduplicates the ACL tuple, but invoking the service twice can still produce two audit events.
- The current uncommitted management panel implements list/rename and an administrator placeholder. Its existence is not completion of #72 administrator ACs.
- `ConfirmGate` compares numeric counts and has no external unavailable/loading gate. Numeric equality alone cannot establish freshness of target identity, principal identity/status or authorization. Missing data must not become an enabled zero-count dialog.

## SRS reconciliation before implementation

There is a literal conflict to resolve through guarded SpecKiwi mutation: `FR-CONFIRM-012` AC-2/3 currently says the count is inherited-only and excludes broken inheritance without qualifying grant level. `IR-WORKSPACE-003` AC-2 specifically forbids that exclusion for workspace admin.

The documented interpretation is **view/edit keep their existing inherited-reach contract; workspace admin follows the upper-gate contract**. The historical reconciliation concern above is governed by the current FR-CONFIRM-012 and IR-WORKSPACE-003 blocks; this rationale does not override them or independently declare implementation ready.

## Narrow server contract

Use a workspace-only adapter around the existing grant service:

1. GET `/api/workspaces/:id/admin-grant-preview?principalId=<id>` obtains the fresh confirmation input. It is read-only with respect to ACL, audit and product state; issuing bounded ephemeral preview state is permitted. Send `Cache-Control: no-store` and do not treat a cached React-query result as this read.
2. POST `/api/workspaces/:id/admin-grants` accepts `{ principalId, previewToken }`. It grants the server-fixed level `admin` after the conditional checks below. It never accepts a client count, authority flag, warning list or substitute level as truth.

The names above describe the implementation handoff. Any contract change belongs in the SRS first; changing this non-normative memo alone cannot authorize it. Existing valid view/edit sharing and its receipts are preserved by the SRS.

The preview response carries these semantic fields, with a shared server/client type:

```ts
type WorkspaceAdminGrantPreview = {
  workspace: { id: string; name: string };
  principal: {
    id: string; name: string; kind: 'user' | 'group';
    status: 'active' | 'pending' | 'suspended';
    system: boolean;
  };
  level: 'admin';
  grade: 'L2';
  coverage: 'workspace-admin-gate';
  visibleDescendantCount: number;
  warnings: ('suspended-subject')[];
  alreadyAssigned: boolean;
  previewToken: string;
  expiresAt: string;
};
```

Use existing principal record/status definitions when materializing the shared type; do not create an independent status policy. `alreadyAssigned` means an existing **direct admin ACL tuple for this workspace and principal**, not effective admin through another group or superuser bypass. Existing indirect admin does not prohibit an explicit direct designation. The preview is not a list of group members and contains no member counts.

Validate scalar, nonempty IDs and token input explicitly. Reject malformed arrays/objects, unsupported levels and attempts to address node IDs; never silently default/downgrade to view. Existence is established from the workspace repository, not “no node found.” Expected invalid-input/denial/stale branches are typed results/conditionals, not exceptions used for normal control flow.

## Permission, principal privacy and coverage

Both requests independently authenticate the current actor and rebuild effective authority from current account status, groups and ACL. Only current workspace management authority, including existing superuser authority, qualifies. Editor/viewer authority is insufficient. Check workspace existence and authority before resolving or exposing principal details, impact or token state.

Use the same candidate visibility policy as the existing `workspace:<id>` PrincipalPicker/search: existing users/groups, rejected accounts absent, pending allowed, suspended allowed with the existing warning. System groups remain governed by the existing ACL policy; this feature does not invent a ban or convert designation into membership/account promotion. A selected ID is rechecked independently of the earlier search response. Do not require it to remain in a particular top-20 query result to be valid.

Unauthenticated requests receive the existing 401 behavior. Missing/unmanageable workspace, wrong target kind, and missing/ineligible principal receive the same neutral 404 body without names, status explanations, counts or existence hints. Validation errors may describe structural input defects only. Safe stale responses are available only after current authorization and candidate eligibility have passed. Never forward internal SQL, paths or stacks.

Administrator semantic coverage is the selected workspace itself and all its ACL-addressable descendants, including branches with broken inheritance, now and as the workspace changes. The designation does not manufacture descendant ACL entries, restore inheritance or cross workspace boundaries. Separate serving/lifecycle gates remain in force.

`visibleDescendantCount` has a deliberately narrower, explicit basis: unique existing file/directory descendants in the current workspace that the requester can currently view through existing serving/visibility rules, excluding the workspace root itself. Include non-Markdown files when the normal tree exposes them. Count broken-inheritance nodes and their visible descendants exactly once; do not prune a branch because `inheritsAcl=false`. Do not count attachments, versions, people, ACL rows, other workspaces or future nodes.

Preserve the existing `isServable` semantics, including leaf-only tombstone handling and ancestor checks for hidden names, trash and archive. Do not introduce a stricter ancestor-orphan exclusion or assume all DB rows are visible. Evaluate chains from authoritative workspace/node state; do not derive the count from a collapsed/paginated client tree, filesystem scan or cached share response. An unreadable/inconsistent graph or failed read makes the preview unavailable, not a partial successful count or zero.

The count is **current visible coverage, not newly gained access and not the total size of hidden storage**. Zero is valid for an empty visible workspace but does not mean no authority is granted. Communicate the invariant upper-gate coverage in words separately from this current count. Do not expose a denominator, excluded/broken-branch count, hidden-node count, percentages, partial/full numerical coverage ratio, descendant names or aggregate accessors. Adding only nonservable hidden records must not produce a visible count change or a stale-token signal that acts as their existence oracle.

## Freshness and one accepted intent

Opening the L2 always issues a new uncached preview request. Render loading until that succeeds. Bind each request/result to actor/authentication generation, selected workspace ID, selected principal ID and a monotonically increasing local request generation. Ignore late results from canceled/replaced requests even if abort did not stop the response. Switching workspace, changing/reselecting the principal, closing settings, losing authority or signing out clears unsubmitted consent.

The preview token is opaque, tamper-resistant and server-bound to this actor/authentication context, workspace, principal, fixed admin operation and semantic snapshot. It is not an authorization capability. Use a bounded server-defined lifetime (five minutes for this implementation), expose `expiresAt`, and reject expired, unknown, forged, cross-actor or cross-target tokens. Expiry/restart never falls back to an unconditional grant. Keep token/receipt state scoped to this operation rather than introducing a general workflow engine.

The previously unspecified authentication-context source is now defined only by **IR-WORKSPACE-003 AC-5–7 and its normative Implementation Notes**: canonical validated `doculight_session` → existing `hashSecretToken` session lookup key, bound together with actor ID. The reason is that SessionRecord has no separate session ID, the same actor can hold different sessions, and hashing an entire Cookie header makes unrelated cookies alter identity. The SRS also owns raw-secret/fingerprint nonexposure, transaction-time revalidation, new-token/session mismatch, logout/expiry/password invalidation and no-fallback behavior; this paragraph supplies rationale, not a second rule set.

A snapshot captures the authoritative displayed identities, candidate status/warnings, direct-assignment state, count and identities of the visible covered nodes, and the material state used for authorization/coverage. Equal numbers after a node is replaced are not sufficient. Relevant visible topology/inheritance changes invalidate it even if the displayed count remains equal. Recheck authorization independently even when the semantic snapshot matches. Changes irrelevant to this confirmation, such as another workspace or only nonservable hidden data, must not expose hidden-state changes via the token. Group designation applies to the group's current/future membership by existing policy; this preview does not freeze, enumerate or count its members.

The server recomputes this snapshot inside the protected execution boundary immediately before writing. Comparison is against the server-issued snapshot, never a client-supplied revision/count. A separate “refresh then unconditional POST” sequence leaves a race and is insufficient.

If displayed/context data changes on opening, background refresh, expiry or final submission, lock old acceptance. Show the new safe data only after a new authorized read. Keep the same L2 surface; provide an explicit `갱신된 내용 확인` acknowledgement that adopts the new baseline without writing, followed by the ordinary `관리자 지정` action. No automatic unlock-and-submit, recursive resubmit, second warning dialog or L3 typing token. When a fresh opening has no prior baseline, its first successful response establishes the baseline; an unchanged fresh response does not create a spurious changed-data warning.

The client disables and guards the mutation callback while preview is absent, loading, failed, expired, invalidated, unacknowledged or submitting. A render-time disabled button alone is insufficient; the callback checks the current intent generation/token too. If shared ConfirmGate requires a narrow availability/lock extension, add it with regression tests for its other callers, not an overlay that leaves a live hidden button. Wire recount callbacks stably to avoid an effect/refetch loop.

## Atomic execution, races and outcomes

Authorize, validate the current principal/workspace, compare the preview, and call `grantPermission` once inside a single DB transaction/serialization boundary protecting the relevant reads and ACL/audit writes. Rebuild the actor there when authority could change since request entry. ACL entry and corresponding audit event commit together or neither commits. Existing MetadataStore.transaction is an available primitive, but its availability alone is not evidence that this route uses it correctly. No `await`/network work may split comparison from the write. Cross-connection contention must fail safely or retry the whole conditional read/write with checks intact; never retry only the write.

For one accepted token, suppress duplicate/replayed execution across rapid clicks and repeated delivery before calling the service. Commit once and return the captured receipt for an authorized replay, or reject a consumed token without executing; never create another audit event. Ephemeral per-process token state is acceptable for this bounded single-server flow if process restart invalidates outstanding tokens and concurrent consumption is serialized. Do not claim durable exactly-once delivery across crashes or a distributed guarantee. The ACL repository's tuple uniqueness is not a substitute for this operation guard.

Use outcomes that distinguish facts:

| Outcome | Server and UI behavior |
| --- | --- |
| Success | 200 with committed `entryId`/existing revocation capability receipt and fixed workspace/principal/admin identity; close gate, announce `관리자로 지정했습니다.`, refresh authorized administrator rows and server adminless/list/session data. Do not fabricate receipt IDs or count superuser bypass as an assignment. |
| Already directly assigned | Preview explains `이미 관리자로 지정되어 있습니다.` and offers no grant execution. A concurrent direct assignment makes the old snapshot stale; refresh into this state. No synthetic success grant/audit. |
| Stale/expired token | Safe 409 machine-readable `preview-stale` after current authorization checks; no grant/audit. Lock, requery and require explicit review as above. Do not auto-submit the fresh token. |
| Missing/denied/ineligible | Safe refusal; no write or protected detail in the error. Clear stale consent and invalidate authorized detail/list state as appropriate. Preserve only still-permitted local input. |
| Preview failure/cancel | No ACL/audit mutation and no call to the grant service. Retry is a read. Esc/cancel restores focus. |
| Transaction failure | No partial ACL/audit commit; generic action error with input retained and a new preview required before another intentional attempt. |
| Transport loss after submit | Result is unknown. Do not say “not granted,” automatically repeat the grant or offer compensating revoke. Re-read current direct ACL state and use a supported receipt if available; otherwise explain that current designation is visible but delivery outcome is unconfirmed. |
| Committed success, refresh failure | Keep success fact and separate `목록을 새로 불러오지 못했습니다.` retry. Retry only the reads, never the grant. |

An in-flight response remains bound to its captured workspace/principal; it cannot overwrite another selection or reopen its dialog. Cancellation is supported before submit; once a request is pending, disable dismissal through the existing confirmation behavior and do not call client abort a server rollback. If outer context disappears anyway, ignore stale UI effects while retaining the actual server outcome semantics.

## Workspace UI, focus and accessibility

Integrate the administrator section in #72's existing settings detail; retain its newspaper layout, managed/all selection ownership and full-name wrapping. Show current direct administrator entries from authorized server data and use their actual entry IDs for removal. Search uses the existing shared PrincipalPicker with `workspace:<selectedId>` scope. Keep the add operation fixed to `관리`; do not add admin to file/directory level choices.

One L2 title: `워크스페이스 관리자로 지정`. Show full workspace name with its stable ID context, selected principal name/kind/status, and level `관리`. Principal/workspace IDs remain the submitted identity even when visible names collide. Use:

- `현재 표시 가능한 적용 하위 노드 {N}개`
- `관리 권한은 이 워크스페이스 전체에 적용되며, 상속이 끊긴 하위 항목에도 적용됩니다.`
- `이 수치는 현재 표시 가능한 하위 항목 기준입니다. 앞으로 추가되는 항목에도 관리 권한이 적용됩니다.`

Do not display the count persistently in the management detail, label it as people/accessors, or describe serving exclusions as ACL exceptions. For a suspended principal, include the existing suspended-subject warning in this same gate: assignment remains allowed and takes effect under the existing reactivation policy. Pending accounts retain their normal status explanation.

Loading `영향 범위를 확인하는 중입니다.`, failed preview `영향 범위를 확인하지 못했습니다.` with real read retry, stale `정보가 바뀌었습니다. 갱신된 내용을 확인하세요.` and submitting `지정 중…` are distinct states. Preserve safe selected input through retry; never substitute zero/empty success for error.

Use the existing accessible AlertDialog, labeled title/description, cancel-first initial focus, trapped Tab/Shift+Tab and Esc behavior. On cancel/success return focus to the originating add control if still present; if authorization/selection removed it, use the nearest authorized management heading/selector or #61 fallback. Status/refresh announcements do not steal focus. Count changes are announced once through an appropriate live status; do not repeatedly announce while refetching. Long Korean names, warnings and actions wrap; body scrolling keeps all actions/close reachable at 200% without widening the settings modal. Visible focus and disabled reasons remain readable in light, dark and forced colors. IME composition Enter in search must not select-and-submit the grant.

Administrator removal retains #72's separate existing contract: direct ACL entry ID, one L2, current last-administrator warning, permitted last/self removal, truthful authority-loss fallback. #89 does not rewrite revoke policy or invent a prohibition on the last administrator. Archive/restore, workspace creation (#73), account/group membership changes and new instance policy are outside this change.

## Strict TDD and independent evidence

After SRS reconciliation, test before each behavior change and record a real red failure tied to the relevant requirement/AC. If implementation is written first, remove that new implementation and restart test-first; adding later tests does not cure it. Existing uncommitted #72 work is a baseline to preserve, not a reason to remove another agent's work. Mode remains sdd; do not silently switch to a TDD step. No meaningful automated test means stop before that implementation and explain an alternative verification plan.

Required automated red→green cases:

1. Authorized manager/superuser preview versus viewer/editor/other-workspace/anonymous denial; unknown versus forbidden workspace and missing/rejected principal are indistinguishable; malicious target kinds/body types rejected. Pending/suspended/system-group behavior matches existing policy.
2. Broken directory and nested descendants are included for admin, ordinary view/edit reached tests still exclude them, zero visible children is correct, duplicate traversal counts once, root excluded, non-Markdown files included, hidden/trash/archive/orphan and ancestor serving rules preserved. Add hidden-only data and confirm no exposed count/staleness signal.
3. Opening performs an uncached read; preview failure/loading/expiry/absent data never call mutate. Same-count identity replacement, visible topology/inheritance changes, principal/workspace rename/status changes, direct assignment and current authority loss invalidate old intent. Wrong actor/target, tampered token and replay cannot write.
4. Deterministically race preview versus create/move/delete/restore/ACL or account changes and race two submissions. Assert expected stale/denied outcome and exact grant service, ACL and audit counts. Exercise DB transaction rollback on audit failure and concurrent-writer contention. Tests must observe persisted records, not merely a mock success callback.
5. One successful acceptance calls the existing grant service once with exact admin/workspace/principal, then reads actual rows/adminless. Cancellation invokes it zero times; duplicate clicks/replays do not duplicate audit. An already-assigned preview makes no grant. Success/refresh failure and unknown transport outcome retain distinct UI behavior.
6. Late preview/mutation results for A cannot populate B after principal/workspace/auth switch. L2 stale acknowledgement is non-mutating, focus returns safely, keyboard/IME cannot bypass guards, and existing ConfirmGate/view-edit/grant/revoke/last-admin regressions remain green.

Use isolated Playwright against the actual built application, a dedicated temporary DB/storage root, isolated account fixtures/profile and owned test ports/PIDs. Never mutate the live service/data or kill processes by executable name. Capture network calls and stored ACL/audit facts for real grant and cancel paths. API stubs/component tests supplement but do not replace end-to-end wiring evidence.

Browser matrix: 1280×720, 1440×900, 1920×1080 × light/dark × genuine 100%/200% = 12 environments, plus forced-colors at both zoom levels. Exercise both settings entry paths, long/duplicate Korean names, broken inheritance, loading/error/stale/pending/success, keyboard/focus, resize and theme changes while intent remains mounted. **IR-WORKSPACE-003 AC-8 supplies the sole IME evidence gate:** Playwright-only synthetic composition lifecycle in the actual product, composing Enter without unintended selection/L2/POST, preserved Korean input/selection, and separate deliberate acceptance after composition. Native Windows candidate-window behavior is explicitly nonblocking unverified because it is not observed by the permitted automation. No OS automation, manual browser operation or native manual evidence is required or permitted. Synthetic coverage is never labelled native PASS. Preserve selection/draft through 100→200→100 and resizing without unexpected submission.

Genuine zoom uses isolated persistent Chromium with an owned extension calling `chrome.tabs.setZoom(tabId, 2)` and verifies `chrome.tabs.getZoom(...) === 2`; record pre/post CSS viewport, window geometry and DPR with screenshots/computed styles. CSS zoom/transform, device-scale changes, half-width viewport and device metrics emulation are not accepted as browser zoom evidence. If the harness cannot establish real zoom, record the blocker rather than report an emulation as passed. Verify readable contrast, real outlines and focus visibility in forced colors; class-name existence is not visual proof.

An independent verifier must review original #89/SRS, final diff and evidence without the implementer's self-approval. Another agent performs fixes identified by review; re-review until no blocking findings remain under the repository feedback loop. This document itself is an authored decision awaiting independent review by the parent workflow.

## Closure and current blockers

Completion is governed by IR-WORKSPACE-003 AC-1–8 and the other applicable SRS requirements, with independent automated/browser evidence and supported evidence/status updates. AC-8's honest native-candidate-window limitation alone does not block #89 when the remaining criteria pass; it is not a waiver of them or a native-IME verification claim. This non-normative document itself closes no gate.

#72's administrator blocker is removed only when its **actual management detail** uses this preview+execution adapter and its existing remove adapter is safely connected and verified. A standalone server endpoint, placeholder, disabled add button or test fixture response does not complete IR-WORKSPACE-001 AC-3. #72 must still satisfy its other list/selection/rename/role/browser conditions; #73 creation ownership remains separate.

Current blockers to implementation/completion: (1) the FR-CONFIRM-012 generic count wording needs the explicit admin refinement before code; (2) authoritative preview, conditional administrator route and atomic one-intent execution do not currently exist; (3) current ConfirmGate availability/context protection and #72 administrator adapters need test-first connection; (4) no red/green, independent review or isolated true-zoom evidence for #89 is claimed. These are bounded work items, not permission to approximate counts or silently enable the current downgraded share request.
