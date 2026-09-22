# Issue #69 Astra decision — independent review

Reviewer: Sol
Date: 2026-09-17
Scope: preimplementation decision review only

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The decision matches the three-view scope of #69, identifies the current unsafe wiring accurately, and limits implementation to behavior supported by existing server contracts or explicitly blocked prerequisites. It neither treats the first selected subject's preview as evidence for a multi-subject mutation nor claims that inheritance restoration can receive an adequate L2 confirmation from the current row shape.

## Issue and requirement mapping

- #69 owns exactly three audit views: subject ACL revocation, effective-permission simulation, and broken-inheritance audit. Direct grant/change/single-entry revoke remains in #65's sharing surface. The decision adds no fourth activity, sharing, or node-selection view.
- `FR-ACL-003` is preserved: revocation operates on ACL entries only, includes entries on broken-inheritance nodes within the authorized scope, shows the required workspace/path/level/grantor/time columns, and does not alter account state or group membership.
- `FR-ACL-004` is preserved: simulation is server-calculated for one selected subject, includes nodes that subject cannot access, retains `level=null`, and reports only the supplied direct/inherited/none source category.
- `FR-ACL-005` and `IR-ACL-001` are preserved: the audit shows broken-inheritance nodes across the server-authorized managed set, labels the value `ACL 접근자`, retains the exact zero-accessor explanation, and does not substitute the distinct reachable metric.
- `FR-PRINCIPAL-004` is preserved by displaying the server-returned `instance` or `managed-workspaces` scope instead of deriving scope copy from the picker workspace.
- `FR-CONFIRM-020/021/022` are mapped correctly: multiple subjects are allowed, each system-group notice remains separate, the bundle receives one L3 gate, its token is the fresh total ACL-entry count, and a zero total blocks execution without lowering the grade.
- `FR-CONFIRM-004` freshness is strengthened with identity checks as well as count checks. Equal-count entry changes cannot reuse prior consent.
- `FR-PRINCIPAL-011` is treated honestly. The generic system-group warning is supportable from `PrincipalRow.system`; the superuser-group bypass warning is blocked because the client projection does not identify that subtype.
- #61 supplies the settings pane, tabs, scrolling, and focus boundary. #65 supplies the shared scoped `PrincipalPicker`; the decision does not duplicate its search, status, or stale-result policy.

All cited requirements are stable enough for the proposed work. `FR-CONFIRM-020` is `implemented/evolving`, not draft or deprecated, so the AGENTS stability stop does not apply. The decision also avoids claiming that an existing verified requirement means the redesigned integration already has browser evidence.

## Actual product defects and proposed adapters

The current App keeps a multi-principal `subjects` array but calls `useRevocation(subjects[0]?.id)` and passes that one response to `BulkRevokePanel`. The panel calculates the displayed count and L3 token from that response while its callback sends every selected principal ID. This is a real subject-set mismatch: the user can approve one subject's rows and execute mutations for more subjects. The decision makes a complete current per-subject plan a precondition and explicitly prohibits execution from `subjects[0]`, mutable selection state, or incomplete responses.

Current callbacks also hide outcomes. App catches every `revokeAllFor` failure, continues the loop, and invalidates queries; restore likewise catches failure and exposes no result. The proposed `BulkOutcome` and `RestoreOutcome` are necessary narrow adapters. They preserve the POST's actual `RevocationBody`, separate accepted writes from later query refresh, and prevent a refresh error from being reported as mutation failure or triggering a repeated write.

The query unions correctly distinguish idle, actual loading, successful empty, and error with a real refetch. Error takes precedence over cached privileged content. Query identity is bound to the authenticated context, management scope, and selected IDs, so late results cannot repaint another session or selection.

## Full subject-set planning and fresh L3

The existing GET `/principals/:id/revocation` is sufficient to plan each selected subject independently. It returns the actor-authorized scope plus stable ACL entry IDs and the five required columns. The decision requires a response for every distinct selected ID, retains even successful zero-entry subjects, preserves each response's subject association, and rejects missing, failed, duplicate-ownership, or inconsistent-scope data. This closes the first-subject-only defect without inventing a new batch endpoint.

Counting the union of entry IDs is sound. ACL entries have a single principal owner, so a repeated ID across two subject responses indicates inconsistent data and must block rather than inflate or silently deduplicate the impact. Visible selection order remains the frozen execution order; asynchronous preview completion order cannot reorder it.

The L3 gate is fresh and identity-bound:

- Opening it refetches every selected subject and shows exact subject names/kinds, subject count, entry count, and server scope.
- The token is the fresh total ACL-entry count with no denominator. All-zero blocks, while a mixed plan retains its zero-entry subjects and uses the positive aggregate.
- Immediately before submission, every preview is fetched again. Subject ID set/order, scope, entry-ID set, and total must match the consented generation. An equal count with different entry IDs is stale and cannot execute.
- A changed selection or plan invalidates the gate and old input. Failed freshness checks never execute a subset or substitute zero.
- The mutation snapshots the exact confirmed IDs/order, so a later picker result or live array update cannot redirect execution.

This remains honest about server limits. The endpoints have no expected-revision token or atomic multi-subject transaction, and ACL state can change between the last preview and a later sequential POST. The decision requires race evidence and avoids claiming a server snapshot guarantee.

## Sequential execution and partial failures

The server exposes one POST per principal and returns the rows actually removed. Sequential execution in the frozen visible order is therefore the most deterministic supported client behavior. The decision's first-failure stop rule is explicit and safe:

- earlier successful subjects remain `completed` with their returned rows;
- the failing or transport-uncertain subject is `unconfirmed`;
- later subjects are `not-run` and receive no request;
- the client does not attempt to reconstruct removed ACL metadata by regranting;
- query refresh failure does not erase or retry a completed mutation; and
- a deliberate retry requires a new complete preview and a new L3 gate rather than replaying the failed suffix.

A successful POST returning fewer or different rows than preview is reported from the response rather than described as complete removal of all expected effects. The decision also avoids the broader false claim that the subject has lost all access: group-derived and upper-gate access can remain. Unknown transport results are not automatically retried, which avoids misreporting or repeating an uncertain mutation.

## Managed scope, subtype, and privacy gaps

The current App selects `workspaceList.data?.[0]` as the picker scope. `/workspaces` is a visibility list and its row has no management capability, so being first and visible does not prove the caller may use `workspace:{id}` principal search. Missing list data is also currently rendered as “no managed workspace,” conflating loading/error with confirmed empty.

The decision correctly makes authoritative managed-scope proof a prerequisite. It prohibits arbitrary visible-workspace fallback, client-side category widening, and treating missing data as confirmed absence. If no existing projection can prove a managed workspace, picker search and execution remain unavailable until a separately agreed managed-scope projection/selection contract exists. Diagnostic service endpoints retain their own server-side authorization regardless of client gating.

The principal subtype limitation is also real. Search rows expose `system:boolean`, which is enough to retain system groups and show the generic persistence warning. It cannot distinguish the superuser system group from the default system group or identify superuser membership. The decision does not guess from names, client constants, or ACL rows and therefore does not fabricate the specific “ACL revoke cannot remove superuser bypass” warning. This remains a stated completion gap.

Privacy boundaries are preserved. Diagnostic rows are rendered exactly from the server's managed-scope responses, including nodes the manager cannot reach through ordinary ACL, because that is the purpose of the audit. The client does not re-filter through the visible tree, reconstruct hidden ancestor paths, expose out-of-scope counts or denominators, or keep privileged names in stale/error DOM. Non-managers get no partial rows, paths, counts, or disabled diagnostic controls.

## Simulation and source categories

`SimulationBody` carries `subjectId`, so validating it against the live selected ID is feasible and necessary. Selection/query changes clear the old table immediately; late responses cannot be relabeled as the new subject. The result retains every server-authorized managed node, including `level=null` rows, and displays only `direct`, `inherited`, or neutral none. The server does not return an ancestor source path or full causal trace, so the decision correctly avoids inventing one.

No grant, edit, or revoke control is added to simulation. Unsupported roster mode, exact server calculation timestamp, delayed polling, share/offboarding links, and ancestor detail remain explicit gaps rather than locally derived UI.

## Broken inheritance and restore blocker

The current `BrokenInheritanceRowBody` provides node ID, workspace ID/name, path, and `aclAccessors`. It lacks node kind, current direct-entry context, incoming parent ACL effects, and directory descendant impact. The settings design requires `상속으로 되돌리기` to be an L2 widening confirmation; for container targets it also requires fresh applicable-descendant information, and the common confirmation rules state what remains, including direct entries.

Consequently the current one-click `onRestore(nodeId)` path cannot satisfy the existing confirmation contract. The decision correctly blocks execution rather than inferring file kind from a path, showing a guessed before/after population, using `aclAccessors` as a different metric, or silently calling the POST behind an under-specified dialog. It distinguishes restore inheritance from copying parent permissions.

Once a separately supported impact contract exists, the proposed behavior remains within scope: one L2 gate with fresh object/kind/context, no typing token, direct ACL preservation, Promise-backed success/failure, same-node server regression, accepted-write/query-refresh separation, and no bulk restore. Until then, the audit list and its honest unavailable restore state are achievable, but restore completion is not claimed.

## Layout, focus, concurrency, and accessibility

The decision retains one horizontal Radix Tabs root in the existing order with native Arrow/Home/End/Tab semantics and selected/tabpanel relationships. Focused tabs remain revealable in their local strip at narrow widths and 200%. Tables use semantic headers/rows, 40 px minimum natural row height, wrapping names and paths, and named local overflow without widening #61's settings pane.

Selected subjects, plans, results, and row focus use stable IDs rather than array positions. Preview loading does not steal picker focus. Removing a selected subject moves focus to its logical neighbor or picker; L3 cancel returns to its invoker; removed/restored row fallback occurs only when focus belonged to that action. Partial results cannot shift focus to a different subject because preceding rows changed.

Synchronous generation and pending guards prevent duplicate execution, selection changes during a running bundle, stale confirmations, and cross-tab state overwrite. The UI does not claim that closing cancels already-sent POSTs. Long Korean paths/names wrap, states have text/structure in addition to color, focus uses a real 2 px outline plus separation, and forced-colors retains borders/outlines without a global opt-out.

## Browser and evidence plan

The proposed matrix is adequate and honest: 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200% gives 12 environments, with forced-colors at 100% and 200% as additional coverage. It covers all three tabs, long rows and subject names, many selections, per-system-group warnings, loading/empty/error, mixed zero, partial failures, L3 identity changes, first/last reachability, keyboard operation, focus restoration, and role denial.

Genuine zoom uses an isolated persistent Chromium profile with an extension calling `chrome.tabs.setZoom(tabId, 2)`, verifies `getZoom === 2`, and records CSS viewport/DPR before and after. CSS zoom, transforms, device-scale emulation, and half-width viewport substitutes are explicitly excluded. Real Windows Korean IME is distinguished from synthetic composition evidence; composition Enter cannot select, revoke, confirm, or restore.

No tests or browser runs were performed for this review because it audits a preimplementation decision and the decision expressly claims no executed verification. Its matrix is a future implementation requirement. PASS means the proposed boundary and evidence plan are coherent; it does not mark #69, the managed-scope projection, superuser subtype warning, or restore-impact contract implemented or verified.

## Sources and commands

Reviewed:

- `AGENTS.md`
- `docs/spec/00.index.md`
- GitHub issues #61, #65, and #69
- `.kiwi/sessions/newspaper-20260916/evidence/issue69/astra-decision.md`
- Approved #61 and #65 decision/review artifacts
- `docs/spec/05.screen-design-permission.md`
- `docs/spec/08.app-shell.srs.md` (`IR-SHELL-002`)
- `docs/spec/10.access-control.srs.md` (`IR-ACL-001`, `FR-ACL-003/004/005`)
- `docs/spec/11.confirmation-grades.srs.md` (`FR-CONFIRM-004/020/021/022`)
- `docs/spec/16.principal.srs.md` (`FR-PRINCIPAL-004/011`)
- `packages/web/src/acl/AclAuditPanel.tsx`
- `packages/web/src/acl/BulkRevokePanel.tsx`
- `packages/web/src/acl/SimulationPanel.tsx`
- `packages/web/src/acl/InheritanceAuditPanel.tsx`
- `packages/web/src/principal/PrincipalPicker.tsx`
- `packages/web/src/App.tsx`
- `packages/web/src/shell/AppShell.tsx`
- `packages/web/src/api/client.ts`
- `packages/web/src/api/queries.ts`
- `packages/server/src/app/acl/bulk-revoke-service.ts`
- `packages/server/src/app/acl/simulation-service.ts`
- `packages/server/src/app/acl/inheritance-audit-service.ts`
- `packages/server/src/app/acl/grant-service.ts`
- `packages/server/src/app/principal/offboarding-service.ts`
- `packages/server/src/http/routes/workspace-api.ts`
- Relevant web and server ACL audit, revocation, simulation, inheritance, authorization, picker, and confirmation tests

Commands included:

```text
gh issue view 69 --json number,title,body,url
rg -n -C 20 "FR-ACL-003|FR-ACL-004|FR-ACL-005|IR-ACL-001|FR-PRINCIPAL-004|FR-PRINCIPAL-011|FR-CONFIRM-004|FR-CONFIRM-020|FR-CONFIRM-021|FR-CONFIRM-022|IR-SHELL-002" docs/spec
rg -n "AclAudit|BulkRevoke|SimulationPanel|InheritanceAudit|aclAudit|revocation|restoreInheritance" packages/web/src packages/web/test
rg -n "previewRevocation|revokeAllFor|simulate|brokenInheritanceOf|restoreInheritance|revocationNotes" packages/server/src packages/server/test
git diff -- .kiwi/sessions/newspaper-20260916/evidence/issue69/astra-decision.md
```

No product code, SRS, Astra decision, GitHub issue, commit, or push was changed.
