# Issue 65 Astra decision — independent review

Reviewer: Sol

Date: 2026-09-17

Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Scope and sources

I independently compared the decision with GitHub issue #65, `AGENTS.md`, `docs/spec/00.index.md`, IR-ACL-001/002/003, SEC-ACL-009/015, SEC-PRINCIPAL-002/003, FR-PRINCIPAL-008, FR-CONFIRM-011/012/013/014/015/018, SEC-CONFIRM-004/005/006/007, the approved #48 overlay and #49 shared-state boundaries, the permission design documents, and the current ShareModal, PrincipalPicker, ConfirmGate, RevokeConfirm, GrantToast, App/AppShell/DocumentArea adapters, client API, server routes/services, and tests. This is a preimplementation decision review. I did not modify or execute product code and do not claim implementation verification.

## Findings

No Critical, High, Medium, or Low findings.

## Capability and adapter assessment

The decision accurately identifies the present product gaps:

- `view === undefined` currently produces a false `접근 가능 0명` and still leaves mutation controls visible. The component cannot distinguish loading, read failure, and an unavailable node.
- PrincipalPicker converts fetch failures into the same empty array used for successful zero results.
- Grant invokes a void callback and immediately renders success state. App catches grant, revoke, break-inheritance, and import failures before invalidating, so the component cannot know whether the mutation was accepted.
- The current break-inheritance control is shown for an editor even though SEC-ACL-009 reserves narrowing for admin.
- Group/container/suspended grants do not currently pass the required L2 policy, and the existing ConfirmGate use does not establish fresh count/warning context.
- Current revoke invalidation reads mutable global `sharingId`; it can refresh a different node if the selected share target changes while the request is pending.

The proposed node-bound query union, Promise action result, fresh share view, and warning lookup are sufficient narrow handoffs for supported behavior. They keep the mutation result separate from later share/tree invalidation. An accepted write followed by refresh failure remains an accepted write plus a query error and cannot be retried automatically. A failed write cannot produce success UI. Capturing the source node avoids invalidating or repainting a later modal target.

These adapters extend beyond the two primary component files, but the decision limits them to the existing App/AppShell/DocumentArea callback chain and requires their exact inclusion in the agreed #65 handoff. It does not authorize an unrestricted parent, cache, auth, or server rewrite. Without that explicit integration scope, truthful pending/result states remain blocked and must not be simulated in component fixtures.

## Authoritative ACL identity blocker

The blocker is real. The server grant service creates and returns an ACL entry ID internally, but `POST /nodes/:nodeId/share` discards that result and responds 204. The web client therefore receives no created/updated entry identity. An admin may later see an entry ID in refreshed rows, but an editor receives `rows: null` by SEC-ACL-015 and cannot perform that lookup. Inferring identity from principal name, result order, a cached row, or a fixture would be unsafe and would expose roster information to obtain a capability the response does not provide.

The decision therefore correctly forbids the current enabled no-op `회수` action and states that FR-CONFIRM-014's actionable L1 completion remains unmet until an authoritative response/callback capability is separately agreed. It still allows a non-secret accepted-grant status and retains the required warning that later revocation cannot recover content already read. The analogous full undo contract for an immediate document revoke is also not fabricated from a 204 response. This PASS does not close those requirements or permit #65 to claim complete L1 behavior.

## Permission, privacy, and confirmation assessment

The capability matrix follows the authoritative server response:

- view-only or unavailable nodes expose no sharing data or mutation controls;
- edit receives only `metrics.reachable` plus view/edit grant controls, with `rows=null` treated as restricted rather than empty;
- admin receives supplied direct/inherited rows and admin-only inheritance controls;
- workspaces have no parent inheritance surface and the client does not add unsupported admin-grant options;
- inherited entries stay readonly and have no entry ID action; direct actions use exact supplied IDs.

The decision does not leak manager-only principal/source information through tooltip text, accessible names, hidden DOM, data attributes, stale query content, avatar initials, partial rosters, totals, or inferred ancestors. It uses only the supplied reachable metric and explicitly prohibits fallback zeroes, `viaAcl` mixing, hidden denominators, descendant totals, and client reconstruction. Generic failures do not distinguish forbidden, missing, or hidden targets.

The L1/L2/L3 matrix matches the cited requirements:

- explicit active/pending user plus document grant is L1;
- group plus document, any container grant, and suspended-subject grant are L2, merged into one gate when conditions overlap;
- document direct-entry revoke is L1 and container revoke is L2 with the count-free attachment notice;
- file inheritance break is L2 and directory break is L3 using the fresh exact impact count as the token;
- parent permission import is admin-only L2 on a non-workspace broken-inheritance target;
- widening never gains L3 and workspace inheritance controls are absent.

Missing fresh count, warning, principal, or node context blocks execution rather than defaulting to file, zero, L1, or a guessed subject. Changed counts lock the action and require cancel/reopen because the current shared gate has no explicit unlock contract. Cancel sends no mutation and returns focus to the invoking control or a safe fallback. Repeated confirmation is guarded to one request.

## Principal picker and stale-result assessment

The design preserves the shared cmdk picker, required `node:{nodeId}` scope, server order, two-character minimum, 20-result cap, user/group type labels, neutral active/pending/inactive badges, and rejected-account exclusion. It neither creates a global roster nor adds pagination, invitation, or unmatched-text submission. System groups remain eligible results.

The proposed pending, zero, failure, and exact-query retry states correct the present error-as-empty behavior. Changing query or scope clears stale options and selection; late completions are generation-bound; an accepted refreshed result set that no longer contains the selection invalidates it; and selection is always by stable principal ID rather than name or row position. Enter selects only a cmdk result, does not submit grant, and composition Enter is blocked. A selected-subject summary makes the actual ID-bearing selection visible before level and grant actions.

## Mutation results, focus, and overlay ownership

The decision retains selected context after failed grant/revoke/inheritance actions, provides safe action-specific errors, and requires deliberate retry through the current gate. Query retry never repeats a write. Same-target conflicting operations serialize locally, while close or node change invalidates obsolete UI completions without claiming an already-sent request was aborted.

The focus rules cover initial ready/error focus, cmdk virtual focus, L2/L3 cancel-first focus, trap ownership, cancellation return, removed-row successor focus, and protection against focus theft after navigation. Overlay levels remain consistent with #48, and only the topmost eligible layer responds to Escape. Sharing does not remount the document or change its route.

## Responsive, theme, and evidence feasibility

The 560px shared Dialog geometry, fixed title/close row, scrolling body, 24px viewport gutters, wrapping labels/names/paths, 36px actions, 40px natural-height rows, and local result/list overflow are compatible with the approved form and overlay decisions. Long content does not require a hidden full path or title-only disclosure. Direct, inherited, selected, pending, invalid, error, and destructive meanings retain text or structural cues in addition to color.

The required Playwright evidence is concrete and feasible: 1280×720, 1440×900, and 1920×1080; light and dark; 100% and genuine 200%; plus forced colors at 100% and 200%. Genuine zoom is explicitly an isolated persistent Chromium profile with an extension calling `chrome.tabs.setZoom(tabId, 2)`, checking `getZoom() === 2` and recording pre/post CSS viewport/DPR. Existing repository checkers demonstrate that mechanism. The mounted dialog 100→200→100 transition, long Korean content, role matrix, first/middle/last cmdk option, manager list, L2/L3 focus, computed colors/geometry, screenshots, and real Windows Korean IME requirement are suitable evidence. Synthetic composition remains supplementary.

## Completion constraint

This PASS applies only to the Astra decision. Issue #65 cannot be reported complete from injected ShareModal data, callback spies, or a fixture ACL ID. Completion requires actual node-bound query wiring, real mutation and refresh outcomes, the complete role/privacy and confirmation matrix, principal search churn tests, built-product sharing paths, and the stated Playwright evidence. The authoritative grant-entry identity, complete L1 grant/revoke capability, unsupported workspace admin grant, absent actor/preview metadata, and any parent/session cleanup not carried by current contracts must remain explicitly unmet until separately scoped.

## Inspection commands

```text
gh issue view 65 --json number,title,body,state,url
Get-Content AGENTS.md
Get-Content docs/spec/00.index.md
rg -n -C 5 "IR-ACL-001|IR-ACL-002|IR-ACL-003|SEC-ACL-009|SEC-ACL-015|SEC-PRINCIPAL-002|SEC-PRINCIPAL-003|FR-PRINCIPAL-008|FR-CONFIRM-011|FR-CONFIRM-012|FR-CONFIRM-013|FR-CONFIRM-014|FR-CONFIRM-015|FR-CONFIRM-018|SEC-CONFIRM-004|SEC-CONFIRM-005|SEC-CONFIRM-006|SEC-CONFIRM-007" docs/spec
Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue65/astra-decision.md
Get-Content packages/web/src/acl/ShareModal.tsx
Get-Content packages/web/src/principal/PrincipalPicker.tsx
Get-Content packages/web/src/confirm/ConfirmGate.tsx
Get-Content packages/web/src/confirm/RevokeConfirm.tsx
Get-Content packages/web/src/confirm/GrantToast.tsx
rg -n -C 8 "sharingId|shareQuery|grantShare|revokeShare|breakInheritance|inheritFromParent|fetchShareView" packages/web/src
rg -n -C 8 "grant-warnings|grantPermission|revokePermission|break-inheritance|inherit-from-parent|shareView" packages/server/src packages/server/test
Get-Content packages/web/test/principal-picker.test.tsx
Get-Content packages/web/test/share-modal.test.tsx
rg -n "chrome.tabs.setZoom" packages/web/test
```
