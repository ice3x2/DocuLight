# Issue #70 Astra decision — independent review

Reviewer: Sol
Date: 2026-09-17
Scope: preimplementation decision review only

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

The decision is consistent with #70, the audit/reconciliation SRS, and the current product contracts. It fixes the current read-state coupling without adding unsupported audit or reconciliation mutations, preserves server-owned grouping and masking, and records the superuser entry-path mismatch without weakening #61's category rules or claiming unreachable UI coverage.

## Scope and requirement mapping

- #70 owns the existing `감사 로그` view, its inline grouped detail, and the separate in-panel `재조정 대기열` view. The decision keeps exactly those two read views inside the one existing category.
- `IR-AUDIT-001` is preserved: the only audit filter is operation, and its options are the exact distinct values supplied by the server. The frontend does not hardcode the operation vocabulary or derive it from currently displayed groups.
- `IR-AUDIT-002` is preserved: reconciliation stays an in-panel second view, never becomes an instance category or an audit row, and its sidebar badge counts only the caller-visible unresolved items.
- `IR-AUDIT-003` is preserved: persisted rows remain individual; the server's display groups are rendered in supplied order and expanded inline; no correlation key is exposed, stored, filtered, or reconstructed in the UI.
- `IR-AUDIT-004` is preserved: supplied subject and level render only when present, subject remains distinct from actor, level uses the shared display mapping, unknown historical values are preserved, and neither field becomes a filter, sort, badge, or aggregate axis.
- `SEC-AUDIT-007/008/010/011` are preserved: queue and audit share server eligibility, instance-scope data remains superuser-only, cross-workspace node references retain one fixed mask, and summary counts are the returned in-scope row count without global totals or denominators.
- `OBS-AUDIT-002` is preserved: the panel cannot edit or delete audit rows.
- `REL-AUDIT-002` remains a server resolution contract. Its existence does not imply a web mutation, and the decision does not create a manual-link/resolve control without an HTTP/client callback.
- #61 continues to own category entitlement, settings scrolling, and focus boundaries; #49 supplies table/state conventions. #65's principal picker and sharing actions are not imported into this read-only panel.

The cited requirements are stable or evolving, not draft/deprecated. The decision therefore does not cross the AGENTS stability stop, while correctly refusing to claim new verification from older requirement status.

## Read-only capability boundary

The actual web client exposes only GET `/audit-log` and GET `/reconciliation-queue`. There is no audit mutation, reconciliation resolution route, detail fetch, export, pagination, scan, repair, or job-retry adapter. The decision respects that boundary:

- filter changes, disclosures, view switches, and retries remain reads;
- no L1/L2/L3 confirmation is invented for a GET;
- a queue item is rendered from only `{id,type}` and has no action button;
- underlying server resolution behavior is not presented as a callable UI capability;
- refresh does not mean “run reconciliation” or “rescan”; and
- automatic audit retention is not turned into a row purge action.

Pagination/export/detail enrichment are correctly blocked. The current response has no page, cursor, limit, total, correlation lookup, referenced object ID, or export contract. Client array slicing would fabricate pagination and client CSV/JSON could not prove server-equivalent masking or complete scoped results. The decision adds neither.

## Independent audit and queue state

Current `AuditLogPanel` returns `null` whenever `view` is undefined. That removes the view switch even if the independently fetched queue succeeded, so a healthy queue is unreachable during audit loading/failure. App also passes data only when present, making loading, error, and absence indistinguishable.

The proposed independent `AuditReadState<T>` values solve the actual defect with narrow existing-query handoffs:

- audit and queue each have their own loading, ready, error, and retry;
- error wins over cached privileged data after an authoritative failed re-read;
- undefined data is never interpreted as a successful empty list;
- audit error cannot remove navigation to a ready queue, and queue error cannot replace a ready audit log;
- each retry calls only its corresponding TanStack query refetch;
- operation changes bind audit results to the new filter generation; queue remains independent of that filter; and
- role/account loss invalidates both privileged content and badge state.

The initial audit view and reversible in-panel navigation remain unchanged. Switching views does not modify data, trigger a mutation, or turn the other view's result into success. A successful empty audit and successful empty queue retain distinct truthful messages.

## Filter semantics and response identity

The server applies the operation filter before returning rows and separately queries the distinct operation set for the caller's authorized scope. The decision uses `view.operations` verbatim, with only the native `전체` option added by the screen. It does not derive options from filtered groups, so choosing one operation does not make the others disappear. Newly recorded operation values appear without a frontend deployment.

The controlled filter remains intact while moving between audit and queue. A late response for an old operation cannot repaint under a new selected value. When a successful current response no longer contains the controlled selection, resetting through the existing callback is a truthful repair; retaining a ghost option would claim a server-distinct value that is no longer present. The neutral notice and ordinary GET refetch introduce no new policy.

No unsupported actor, subject, level, origin/copy, counterpart, date, text, external-only, or sorting axis is added. This matches both the API and the SRS requirement that subject/level and cross-boundary roles remain visible facts rather than new query axes.

## Server grouping and stable UI identity

The server groups rows by internal correlation identity plus operation, then removes that key from the response. Two groups can legitimately share the same actor, operation, and timestamp, while a correlated group can span timestamps. The decision therefore correctly:

- renders the exact supplied groups in order without client regrouping;
- uses the first supplied row's unique ID as the React/disclosure identity;
- avoids actor/operation/time, row index, or a manufactured visual hash;
- preserves expansion only when the same first-row ID remains in the same context;
- resets expansion after filter/auth/scope changes; and
- never places a correlation key in text, ARIA, data attributes, or filter state.

This matches `IR-AUDIT-003` AC-8 through AC-10 and the current server/client test rationale. Summary count is exactly `group.rows.length`, and every expanded supplied row remains reachable. There is no total, denominator, hidden-row delta, or locally merged count.

Each detail row keeps its own timestamp, operation, and actor. That is necessary because summary metadata comes from the first row and does not replace the original facts of later correlated rows. Inline disclosure with `aria-expanded` and `aria-controls` improves the current button without creating a new dialog or raw-record view.

## Masking, optional fields, and privacy

The server resolves in-scope node IDs to paths and every missing or out-of-scope node reference to the same fixed masked string. The decision treats that returned string as final. It does not number external destinations, derive aliases, expose IDs/hashes, request another workspace, or interpret missing-node masking as an existence signal.

The target-node workspace remains the audit row's scope owner; counterpart does not widen it. Managers see only managed-workspace rows and operations, while superusers may additionally receive instance rows. The UI never “corrects” scoped counts from global cache or adds outside totals.

Detail handling is also faithful:

- null target gets a neutral visible placeholder without lookup or deep link;
- counterpart renders only when supplied and retains server masking;
- `targetRole` remains a separate origin/copy label, not an operation or filter;
- subject displays the supplied readable name or stored identifier as-is, with no per-row principal request;
- level uses the shared `보기/편집/관리` mapping and falls back to the original unknown value;
- absent subject or level is omitted rather than filled with actor, zero, or invented “unknown user”; and
- before/after values render as escaped text with separate labels and no fabricated missing side.

No hidden field is reintroduced through tooltip, title, ARIA, CSS data attributes, invisible DOM, diagnostics, or a raw-copy action.

## Reconciliation queue and badge

`QueueItemBody` exposes only stable ID and type. The decision renders those facts in read-only rows, provides concise labels only for known vocabulary, and preserves unknown future types as readable text. It does not guess workspace, path, timestamp, actor, candidate match, owner, linked audit row, or resolution result.

The queue query is independent from the operation-filtered audit query. Its sidebar badge therefore remains stable while the audit operation changes. The decision fixes current ambiguous missing data by defining:

- a numeric `items.length` after successful queue read, including `0`;
- a nonnumeric busy indicator while loading;
- a nonnumeric unavailable/error indication after failure; and
- immediate removal of stale numeric state after account/role boundary changes.

The badge and queue view use the same successful scoped response. There is no global total, denominator, optimistic decrement, or claim that this panel resolved an item. A later successful refetch may remove an item because the server state changed elsewhere; that is a read update, not a local mutation.

## Superuser category-entry mismatch

The mismatch identified by the decision is real. Server `auditView` and `queueView` allow a superuser even with zero managed workspaces and include instance-scope records/findings. App enables both queries for that role. However, `audit-log` remains a workspace-section category gated by `adminWorkspaceCount > 0`; a superuser with zero managed workspaces cannot reach it through the settings UI.

The decision handles this correctly for #70:

- it does not silently widen the #61/`IR-SHELL-002` category gate;
- it requires API evidence to remain labeled as endpoint evidence when no UI path exists;
- it requires real manager and superuser-with-category product paths where reachable; and
- it records the zero-managed-workspace superuser entry problem as a separate SRS/category handoff.

This limitation prevents a false full-role UI completion claim. It is not a defect in the decision because #70's issue boundary explicitly preserves existing category permissions and requires added integration/entitlement behavior to be separately specified.

## Focus, layout, and state behavior

The decision remains inside #61's right settings pane. Title, view switch, and audit filter sit above the result scrollport; long groups, rows, values, and queue items wrap or use local overflow without widening the settings shell. Natural row targets are at least 40 px, controls at least 36 px, and tables retain semantic headers and subtle separators.

Native select focus remains during filter changes. Disclosure Enter/Space toggles one group, the summary retains focus, and collapsing focused detail returns focus to its summary. If refresh removes focused content, fallback uses the next surviving logical stable ID or region heading only when the removed content owned focus. Queue/audit navigation keeps the controlled filter and valid expansion identity without replaying privileged stale DOM.

There is no additional focus trap. Theme changes affect semantic styling only. Selected/expanded, optional field labels, busy/error, and focus are conveyed with text/structure as well as color; forced-colors retains real borders and 2 px outlines with separation.

## Browser and verification plan

The matrix is concrete and adequate: 1280×720, 1440×900, and 1920×1080 across light/dark at 100% and genuine 200% gives 12 environments, with forced-colors at 100% and 200% as additional checks. It includes long Korean actors/subjects/paths/operations, large correlated groups, many queue items, independent loading/error/empty combinations, badge states, duplicate summary metadata, stable expansion, last-row reachability, permission boundaries, and the superuser entry limitation.

Genuine zoom uses an isolated persistent Chromium profile with an extension calling `chrome.tabs.setZoom(tabId, 2)`, verifies `getZoom === 2`, and records CSS viewport/DPR before and after. CSS zoom, transforms, device-scale emulation, and a manually halved viewport are excluded. Resize/zoom transitions keep expanded/filter/queue context mounted without reload.

Keyboard evidence covers native select, disclosure Enter/Space, Tab/Shift+Tab, view switching, retries, and stable-ID focus fallback. No new text input exists, so new IME validation is correctly marked not applicable; existing settings behavior must remain unchanged.

No tests or browser checks were run for this review because it evaluates a preimplementation decision and the decision expressly claims no execution evidence. PASS means the design and proposed evidence are coherent and feasible. It does not mean #70, the query-state adapters, or the separate superuser category handoff are implemented or verified.

## Sources and commands

Reviewed:

- `AGENTS.md`
- `docs/spec/00.index.md`
- GitHub issues #49, #61, #65, and #70
- `.kiwi/sessions/newspaper-20260916/evidence/issue70/astra-decision.md`
- Approved #49, #61, and #65 design/review artifacts
- `docs/spec/04.screen-design-settings.md`
- `docs/spec/08.app-shell.srs.md` (`IR-SHELL-002`)
- `docs/spec/12.audit-log.srs.md` (`IR-AUDIT-001/002/003/004`, `SEC-AUDIT-007/008/009/010/011`, `OBS-AUDIT-002`, `REL-AUDIT-002`)
- `packages/web/src/audit/AuditLogPanel.tsx`
- `packages/web/src/App.tsx`
- `packages/web/src/shell/AppShell.tsx`
- `packages/web/src/shell/shell-contract.ts`
- `packages/web/src/api/client.ts`
- `packages/web/src/api/queries.ts`
- `packages/web/src/acl/level-name.ts`
- `packages/server/src/app/audit/audit-view.ts`
- `packages/server/src/app/reconciliation/queue-view.ts`
- `packages/server/src/domain/reconciliation/vocabulary.ts`
- `packages/server/src/domain/ports/audit-sink.ts`
- `packages/server/src/http/routes/workspace-api.ts`
- Relevant web/server audit filter, grouping, subject/level, masking, immutability, reconciliation queue, resolution, category, and permission tests

Commands included:

```text
gh issue view 70 --json number,title,body,url
rg -n -C 20 "IR-AUDIT|SEC-AUDIT|OBS-AUDIT|REL-AUDIT|IR-SHELL-002" docs/spec
rg -n "AuditLogPanel|auditLog|useAuditLog|useReconciliationQueue|queue-badge|reconciliation" packages/web/src packages/web/test
rg -n "auditView|grouped|EXTERNAL_NODE|queueView|resolveByManualLink|operationsInScope|reconciliation-queue|audit-log" packages/server/src packages/server/test
git diff -- .kiwi/sessions/newspaper-20260916/evidence/issue70/astra-decision.md
```

No product code, SRS, Astra decision, GitHub issue, commit, or push was changed.
