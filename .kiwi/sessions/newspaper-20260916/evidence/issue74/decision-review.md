# Issue #74 Astra decision independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Scope and governing contracts

The decision correctly treats `IR-PRINCIPAL-001` as the stable interface requirement for #74 while preserving `FR-PRINCIPAL-003`, `CON-PRINCIPAL-004`, `FR-CONFIRM-009/023`, `SEC-AUTH-009/016`, and the approved #67–#69 ownership boundaries. It introduces only the two required user entry points, the existing four-stage card, bounded query/mutation adapters, and truthful operation state. It does not add user deletion, ownership or content transfer, successor grants, bulk execution of stages 1–3, token enumeration, group administration, or a second ACL impact flow.

The decision also handles the issue's server-connection condition honestly. The planned/stable `IR-PRINCIPAL-001` authorizes card lookup, real operations, refresh, and the two entries. The proposed `principalStatus` response field and typed membership DELETE adapter are narrow corrections needed to implement those acceptance criteria. The decision does not broaden the card GET or group roster beyond their current superuser gates.

## Entry points and authority boundaries

Both `UserRoster` rows and selected **user** rows in `BulkRevokePanel` open the same `OffboardingCard` by stable user ID. Groups have no user-offboarding action. A multi-selection remains a set of per-user entries for stages 1–3; only stage 4 hands an explicit user selection to #69's bulk revocation flow. Source selection, origin control, and scroll context remain navigation state rather than stored workflow progress.

The current card and group roster routes are superuser-only. The decision therefore refuses to expose account status, memberships, or a disabled privileged card to a workspace manager. It preserves the manager's existing managed-scope ACL flow and records the older manager-readable informational-card concept as an unsupported contract gap. A 404 remains indistinguishable between unavailable target and insufficient authority, stale privileged query data is cleared after role/session loss, and no new administrator capability is invented.

## Exact four-stage predicates

The completion rules match actual domain behavior and correct the current false predicate:

1. Suspension is complete only when authoritative `principalStatus === 'suspended'`; `pending` and `rejected` are not mislabeled as suspended.
2. PAT authentication is blocked automatically whenever status is non-active. The decision claims neither token deletion nor permanent per-token revocation, exposes no third-party token rows or counts, and adds no token button.
3. The current server projection covers ordinary non-system groups only. The decision labels that scope explicitly and never claims that default or superuser membership was removed.
4. ACL completion comes only from a refreshed card with consistent `remaining === 0` and `done`; navigating to or accepting #69's operation is not treated as completion.

The list always has four ordered rows but does not manufacture a persisted current-stage index. Independent later facts can be shown while an earlier stage remains incomplete, and a guard rejection stops the active sequence without rolling back accepted earlier operations. Overall copy does not claim complete access or content recall because system membership and copied/downloaded content remain outside the proven result.

`FR-PRINCIPAL-003` broadly says every stage passes the active-superuser floor, but the implemented offboarding projection and its registered server evidence explicitly exclude both system groups. The decision does not use ordinary-group deletion to claim that the missing superuser-membership guard path has been implemented. It preserves that full system-membership flow as a blocker, which is the honest result for the current contracts and code.

## Suspension, self-target, and last-superuser behavior

Stage 1 uses the existing status route and one per-person L2 confirmation. It re-reads the target at dialog open and before execution, invalidates consent when identity/status changes, suppresses duplicate submission synchronously, and distinguishes accepted mutation plus failed refresh from mutation failure. It does not claim a compare-and-swap guarantee because the endpoint has no revision token.

The decision maps only the actual `last-active-superuser` 409 specially. It does not invent a blanket self-target prohibition or confuse the last workspace administrator warning with the instance superuser floor. Self-suspension remains permitted when another active superuser exists, with truthful warning that all sessions for the actor are removed. The subsequent 401 follows existing authentication teardown, so the design does not promise that a suspended actor can continue the remaining stages or retain cached privileged state.

## Stable-ID membership removal and partial outcomes

The proposed executable plan is feasible with the current roster contract. `groupRoster` returns `{id,name,system,members:[{id,...}]}` under a superuser-only route, so ordinary memberships can be selected by exact target and group IDs. Card names remain display-only and are never reverse-mapped to IDs. Duplicate names are keyed by ID, and missing, failed, or contradictory roster/card data blocks execution.

The plan is rebuilt at dialog open and immediately before submit. Any target, group-ID, or group-name set change invalidates consent and requires a new L2 showing every current ordinary-group name. An empty fresh plan sends no DELETE. The existing DELETE route is authorized per request and returns only 204 or coarse 400/401/404, so the decision correctly avoids inventing detailed failure reasons.

Execution is sequential over the frozen stable-ID set and stops at the first failed or uncertain result. Accepted, unconfirmed, and not-run outcomes remain visible without becoming durable progress. Accepted removals are never rolled back or blindly replayed; a retry first refreshes and builds a new plan with new consent. Authority loss stops the tail. The decision also records the remaining race honestly: no batch snapshot or precondition token makes the read and multiple DELETE requests atomic.

System-group removal remains explicitly unsupported. The ordinary plan cannot remove `default` or `superuser`, cannot exercise the superuser-membership floor, and cannot be evidence that all memberships are gone. This preserves #67/#68 server invariants and avoids silently adding a stronger confirmation or self-removal policy.

## ACL handoff, security, and audit ownership

Stage 4 passes the exact selected user ID to #69 and preserves #69's full-subject-set preview, fresh L3 gate, scope proof, warning, ordering, and partial-failure blockers. It does not union unrelated prior selection, duplicate the impact table, or bypass a blocked #69 action. Returning from cancellation or mutation always re-queries the card. The raw residual ACL count can therefore remain nonzero even after a narrower accepted action without being disguised as success.

Existing status, membership, and ACL services retain audit ownership. The UI does not synthesize a workflow-complete event, event ID, audit deep link, or proof about copied content. Read retries do not repeat mutations or duplicate audit events. PAT plaintext and third-party token metadata never enter the card.

## Layout, accessibility, and Playwright evidence contract

The card remains inside #61's settings title/menu/body geometry with independent body scrolling. Four natural-height vertical rows, wrapping principal/group text, 36px minimum actions, bounded dialog scrolling, in-flow narrow actions, token-based light/dark colors, explicit text/icon state, 2px focus outlines, and forced-colors behavior cover long names and zoom without a horizontal wizard or clipped confirmation controls.

Focus ownership is concrete: heading on entry, Cancel first in L2, Escape closes only the top dialog, cancel restores the stage control, pending state is visible and duplicate-safe, and a removed action hands focus to its status/heading rather than `document.body`. Source restoration uses stable IDs with a heading fallback if the row disappeared. IME cannot activate the entry accidentally, while #69 retains ownership of its L3 composition behavior.

The required browser matrix is genuine and sufficiently specific: 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and extension-driven 200%, for twelve environments, plus forced-colors. It requires an isolated persistent Chromium profile, `chrome.tabs.setZoom(tabId, 2)`, an asserted `getZoom === 2`, and recorded CSS viewport/DPR. CSS zoom, transforms, DPR-only emulation, and half-sized viewport substitutes are rejected. Runtime resizing and 100→200→100 happen with the actual card/dialog/failure mounted, and evidence must measure real bounds, scrolling, focus, contrast, roles, permission denial, partial outcomes, screenshots, and native Windows Korean IME separately from synthetic composition.

## Sources inspected

- Original GitHub issue #74 via `gh issue view 74 --json number,title,body,state,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/16.principal.srs.md`: `IR-PRINCIPAL-001`, `FR-PRINCIPAL-003`, `CON-PRINCIPAL-004`, related principal roster/group requirements
- `docs/spec/09.auth.srs.md`: `SEC-AUTH-009/016` and session/status contracts
- `docs/spec/11.confirmation-grades.srs.md`: `FR-CONFIRM-006/009/023`
- `docs/spec/04.screen-design-settings.md` and the newspaper settings/style/operational decisions
- Approved #67, #68, and #69 decisions and their independent reviews
- Current `OffboardingCard`, `UserRoster`, `BulkRevokePanel`, `GroupRoster`, `App`, `AppShell`, API client/query code, and relevant web tests
- Current offboarding/roster/principal services, status/membership/offboarding HTTP routes, repository contracts, and relevant server/HTTP tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue74/astra-decision.md`

This is a pre-implementation decision review. No product implementation, Playwright run, or test result is claimed. Manager-readable informational card access, complete system-membership removal, atomic multi-group mutation, typed membership failure reasons, and inherited #69 execution blockers remain explicitly unsupported rather than being counted as completed behavior.
