# Issue #72 Astra decision independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Authority, scope, and partition

The decision correctly treats `IR-WORKSPACE-001` as the stable, issue-linked authority for the functional connection work that the original issue says must first be specified. It assigns AC-1/2/3/6/7 to #72 and leaves AC-4/5 creation behavior to #73. That split still permits a truthful #73 entry handoff but forbids a fake or prematurely completed create flow. Archive/restore, workspace deletion, physical-path editing, membership management, instance policy, and richer lifecycle controls remain outside this issue.

The proposed deltas are feasible from the current seams. The server already has workspace repository list/find/rename operations, a DB-authoritative sidecar writer/reconciler, visibility and permission services, direct ACL grant/revoke, principal search, server-derived adminless detection, and last-administrator warning logic. The web app already has TanStack Query, settings categories, share rows, confirmation infrastructure, and the shared principal picker path. The decision does not misrepresent those pieces as an already connected workspace-management feature.

## Managed/all scopes and selection ownership

The scope rules match `IR-WORKSPACE-001`:

- default `/api/workspaces` behavior remains the existing visible list for current callers;
- `scope=managed` is server-filtered by current management authority, including the superuser upper gate, and cannot equate visibility/edit with management;
- `scope=all` is server-gated to superusers and reads repository rows rather than tree-derived names;
- unknown scopes are rejected instead of widening or silently falling back;
- list responses remain `{id,name,adminless}[]`, without invented paths, dates, or counts.

The settings-wide management choice is owned once by full workspace ID and shared with workspace, ACL-audit, and audit-log contexts. Name, abbreviated ID, row order, and `visibleList[0]` never become authority or identity. Duplicate visible names get only enough stable-ID context to disambiguate the visible set; hidden names are neither queried nor exposed. Refresh retains a still-authorized ID, while disappearance or authority loss removes protected detail without silently applying the prior workspace's draft to a replacement.

The decision also distinguishes shared selection context from actual server filtering. Current downstream audit/revocation endpoints do not all accept a selected workspace, so the UI may thread the ID only where supported and must describe the real scope elsewhere. It does not present all-managed or instance-wide results as selected-workspace results.

## Rename, stale state, and sidecar outcomes

The dedicated `PATCH /api/workspaces/:id` with `{name}` is exactly the interface required by AC-3. Current management authority is rechecked server-side, and the application service changes `Workspace.name` through `WorkspaceRepository.rename`; it does not reuse node rename or move the ID-based directory. ID, creation time, node paths, attachments, URLs, backup paths, and physical location remain stable.

Validation matches AC-6: NFC normalize, trim ends, then require 1–120 Unicode code points and reject C0/DEL controls. The decision correctly permits duplicate display names, path punctuation, and filesystem reserved words and does not leak hidden-name existence. Client checks improve feedback while the server remains authoritative. Drafts survive invalid, forbidden, missing, transport, and storage failures; composition Enter cannot submit; a normalized no-op does not manufacture a mutation.

The response union and sidecar behavior match AC-7. DB failure is an unsuccessful rename. DB success with sidecar failure is a committed rename with `sidecarSync: 'pending'`, persistent current-context warning, no rollback, and no automatic PATCH retry. Existing reconciliation can rewrite the sidecar from the latest DB row. Requiring keyed serialization or an equivalent latest-DB condition prevents an older asynchronous sidecar write from finishing after a newer rename. The decision separately records that the endpoint has no ETag/revision and therefore cannot claim cross-client compare-and-swap. A fresh changed baseline retains the draft for review; selection changes and request generations keep a late result for A from overwriting B.

## Administrator grants, removals, and blockers

The administrator card is limited to direct workspace ACL entries whose level is `admin`. It does not count superuser bypass, group membership, ordinary view/edit entries, or visible people as designated administrators. Server `adminless` remains the only badge authority. Existing share-view rows can supply direct entry IDs/name/kind for the selected workspace, while unavailable reads must render loading/error instead of a fabricated empty administrator list.

The decision identifies a real correctness defect in the existing generic grant route: its body parser coerces every level other than `edit` to `view`, and the client type exposes only view/edit. A separate typed workspace-admin adapter can pass `admin` to the existing `grantPermission` service while verifying that the target is a workspace; document/directory admin remains rejected under `SEC-WORKSPACE-002`. This preserves existing document/directory sharing and avoids a second ACL store or permission model.

Granting workspace admin is L2 under `FR-CONFIRM-011`. The decision does not misuse the existing `share.reached` value as a complete admin-impact statement: it counts inheritance-delivered descendants and omits broken branches, while workspace admin remains an upper gate below those breaks. `FR-CONFIRM-012` requires an authoritative, freshly rechecked container-grant count, but the exact admin coverage presentation is not implemented by the current adapter. Blocking execution if that required confirmation data cannot be supplied is safer and more faithful than inventing a number, omitting the required impact, or presenting view/edit inheritance wording as full admin reach. The decision leaves that narrow capability gap explicit rather than silently expanding #72 with an unspecified preview endpoint.

Removal uses the actual direct entry ID and is L2 because `FR-CONFIRM-018` explicitly assigns workspace-container entry revocation to L2. This does not conflict with `FR-PRINCIPAL-005`: its last-administrator warning is merged into the same confirmation, is refreshed from the server, and does not impose a second dialog or a hard block. Confirmed removal of the last designated administrator and self-removal remain allowed. The unrelated last-active-superuser invariant is not imported. Accepted self-removal triggers authorized refetch/fallback, removes stale protected detail, and uses a surviving parent status rather than claiming success in a component that immediately unmounts.

Grant/revoke mutation state remains tied to captured workspace/principal/entry IDs, guards duplicates, and separates accepted mutation from refresh failure. Warning/count changes invalidate stale consent through the existing confirmation contract. Missing authoritative count/coverage remains a blocker, not a fixture-only success.

## States, accessibility, and browser evidence

Managed list, all list, detail, and mutation state each distinguish loading, ready-empty, error/retry, and pending outcomes. Error outranks stale privileged content; `undefined` and arrays do not stand in for authorization or successful emptiness. One workspace is a readonly textual choice, multiple workspaces use an accessible selector, and zero successful choices is a real empty state. Full names wrap, selected state has programmatic and non-color cues, rows and controls meet the stated minimum targets, and any table owns its own horizontal overflow inside #61's independent settings scrollport.

The evidence contract exercises both real settings entry paths, roles, duplicate/long Korean names, selection churn, rename validation and pending-sidecar state, grant/revoke gates, self-removal fallback, focus, keyboard, and IME. Its 12 environments cover 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%, plus forced-colors at 100%/200%. Genuine zoom requires an isolated persistent Chromium profile and extension `chrome.tabs.setZoom(tabId, 2)`, verifies `getZoom === 2`, and records CSS viewport/DPR; CSS zoom, transforms, device scale emulation, and a manually halved viewport are excluded. The plan requires actual product geometry, computed styles, screenshots, reachable final actions/close, and real API outcomes rather than a disconnected visual fixture.

## Sources inspected

- Original GitHub issue #72 via `gh issue view 72 --json number,title,body,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/13.workspace.srs.md`: `IR-WORKSPACE-001`, `SEC-WORKSPACE-001`, `SEC-WORKSPACE-002`, `DR-WORKSPACE-001`, `DR-WORKSPACE-002`
- `docs/spec/11.confirmation-grades.srs.md`: `FR-CONFIRM-004`, `FR-CONFIRM-011`, `FR-CONFIRM-012`, `FR-CONFIRM-013`, `FR-CONFIRM-018`, relevant security constraints
- `docs/spec/16.principal.srs.md`: `FR-PRINCIPAL-005`, `FR-PRINCIPAL-006`
- `docs/spec/10.access-control.srs.md` and `docs/spec/04.screen-design-settings.md`
- Approved #61 settings-shell decision/review, the #49 shared-UI independent review, and #65 decision/review
- Current `App`, `AppShell`, `WorkspaceList`/settings placeholders, API client/query wiring, share UI, principal picker, confirmation components, and tests
- Current workspace HTTP routes, workspace repository/files/sidecar reconciliation, permission/grant/share/admin-presence services, and associated server tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue72/astra-decision.md`

This is a pre-implementation decision review. No product implementation, Playwright execution, or test result is claimed. The administrator-impact capability and unsupported downstream filters remain explicit blockers to those specific completion claims.
