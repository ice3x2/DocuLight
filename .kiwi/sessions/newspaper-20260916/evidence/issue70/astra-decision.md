# Issue 70 — binding audit log and reconciliation queue decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains authoritative. No implementation, tests or verification is claimed.

## Authority and read-only scope

Read AGENTS, live #70, SRS index/current mode/target, approved #49/#61/#65 and newspaper state/overlay rules, AuditLogPanel/App query forwarding/client types, server audit-view/queue-view/routes/vocabulary and existing audit/filter/subject/queue/grouping tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

IR-AUDIT-001/002/003 and SEC-AUDIT-009 are verified/stable; IR-AUDIT-004 implemented/evolving; SEC-AUDIT-007/008/010/011 and OBS-AUDIT-002 implemented/stable. Preserve server masking, scope, group construction and immutability. REL-AUDIT-002's resolution/audit behavior is a server contract, not evidence that this web panel has a resolution operation.

Live #70 owns **감사 로그, grouped inline detail and the separate 재조정 대기열 view**. These are read-only through current HTTP contracts. No audit edit/delete, purge, rescan, manual-link, resolve/ignore/retry-job action, export/download, server pagination, date/actor/subject search, sorting control or new endpoint is added. No destructive confirmation grade applies because no destructive operation is exposed. Do not fabricate L2/L3 controls or label a GET retry as reconciliation execution.

Primary scope is AuditLogPanel and scoped styles/tests. Necessary narrow additions are independent actual audit/queue query-state/refetch forwarding and the existing category badge in App/AppShell; include these exact adapters in the #70 handoff. No category entitlement change, server scope/cache redesign, new polling interval or generic admin data framework is authorized.

## Exact state handoff and independent view ownership

```ts
type AuditReadState<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; onRetry: () => void };
// Independently supplied for AuditViewBody and ReconciliationQueueBody.
// Existing operation/onOperation remain the controlled filter contract.
```

App derives these from existing `useAuditLog(operation)` and `useReconciliationQueue`; error outranks cached success, and undefined data is not empty. Retry refetches the relevant existing query only. Bind audit responses to current operation/auth/scope generation and queue responses to current auth/scope; a late filter/account response cannot repaint the new context. Do not show stale privileged rows/badge counts after role loss or a failed authoritative re-read.

Fix the current coupling: undefined audit view must not return null for the entire panel or prevent entering a successfully loaded queue. The in-panel navigation remains available under the existing allowed category while either read is loading/error. Each view displays its own state; audit error does not masquerade as queue failure and vice versa. Switching views does not mutate data or infer success. Keep the existing initial audit view and reversible `재조정 대기열` / `감사 로그` navigation.

| State | Exact presentation |
| --- | --- |
| Audit loading | `감사 로그를 불러오는 중입니다.`, busy audit region; no empty-success text |
| Audit error | `감사 로그를 불러오지 못했습니다.` and actual `다시 불러오기`; no raw exception or missing-versus-forbidden diagnosis |
| Audit successful zero groups | `기록된 감사 행이 없습니다.`; current operation selector remains available |
| Queue loading | `재조정 대기열을 불러오는 중입니다.`, independent busy queue region |
| Queue error | `재조정 대기열을 불러오지 못했습니다.` with its own real retry |
| Queue successful empty | `미해소 항목이 없습니다.`; no assertion about hidden/global findings |
| Ready groups/items | Render exactly supplied authorized data; expansion is local reading, not a new detail request |

There is no mutation-pending or action-success state to invent. A supplied GET completion means data loaded, not that a reconciliation finding was resolved. Explicit refresh, if offered, invokes the existing refetch and does not start a filesystem scan or rewrite audit rows.

## Placement, shell and filters

Stay within #61's existing 감사 로그 category/right pane. No new reconciliation category, browser route or modal. Keep separate from the existing `색인 대기열` category (#75) and from `상속 끊김` in 권한 감사 (#69). Never use ambiguous `감사 목록` as the page name.

Header title `감사 로그` or `재조정 대기열` is 18/26px sans600, with the existing other-view navigation as a secondary ≥36px button and 8px gap. Title/switch and audit filter sit above their result scrollport; they remain reachable within #61's right-body scroll when very short height requires it. Results use document surface, app-surface section headers, subtle rules, no cards/shadows. Body14/22px, labels13/20px600, metadata/help12/18px. Preserve wrapping and local table/detail overflow without growing settings width.

Audit's only filter is native `조작` select (≥36px, full available width capped at 24rem, radius4px). Options are exactly `전체` plus current authorized `view.operations`, retaining server distinct values/order. Do not derive them from displayed groups, hardcode operation vocabulary, combine operation with origin/copy role, or client-filter a broader unscoped response. New stored operations appear without frontend deployment.

Keep operation selection through ordinary audit↔queue navigation. A filter change invalidates old displayed groups while loading; old results cannot sit under the new filter label as current success. During refresh, previously known same-context option labels may remain while result busy state is explicit, but do not preserve them across an authorization boundary. If a successful new authorized operations list no longer contains the selected operation (e.g. retention), reset to `전체` through the existing callback and give a short neutral notice; don't insert a ghost option absent from the server distinct set or silently keep an impossible native selection. Ignore obsolete responses before doing this.

No filters/sort/badges for counterpart, origin/copy target role, subject, level, correlation key, external-only activity or out-of-workspace count. No date range/text search/user lookup is added because the current API exposes none. These restrictions remain even for UI convenience or “admin only.”

## Group summary and inline detail

Render the exact server groups in supplied order. Summary is one full-width native disclosure button, minimum40px, 8px vertical/12px horizontal padding and natural wrapping. Show server occurredAt, operation, actor and **`group.rows.length` authorized row count** (`N건`) as separate readable spans. Text left aligned; count may align right with tabular numerals. A chevron plus `aria-expanded`/`aria-controls` communicates expansion without color dependence. Use generated DOM IDs for disclosure linkage; do not expose a correlation/group key.

Keep React identity based on the first supplied audit row's unique ID, not actor/operation/time, row index or a manufactured hash of those values. Same actor/operation/timestamp groups remain separate. Never regroup historical singleton rows or merge server groups locally. Preserve expansion across a same-context refresh only when the same stable first-row identity remains; if that identity is removed/replaced by scope/retention, collapse the new group rather than transferring old expansion to another operation. A filter/account/scope change resets stale expansion state. Do not synthesize a forbidden stable correlation ID to keep expansion.

Expanded detail stays inline under its own summary, with a 2px subtle guide/inset and 12px padding, not a nested popup or separate raw-JSON view. All supplied rows must be reachable; no unannounced client truncation. Use a semantic table or per-row labeled definition grid with min40px natural row blocks and local horizontal overflow only where needed. Show each row's own timestamp/operation/actor, because a group can span timestamps and summary metadata does not replace the original facts.

| Supplied detail field | Display rule |
| --- | --- |
| target | Display server text exactly, or neutral `—` for null target; no lookup/deep link reconstructed from missing node IDs |
| counterpart | Show only when non-null, with its own label; preserve server masking exactly |
| targetRole | Show `원본`/`사본` when supplied; never fold it into operation, filter or count |
| subject | Show supplied readable name or fallback identifier as-is, separately labeled from actor; no per-row principal request |
| level | Use shared ACL레벨이름 (`보기`/`편집`/`관리`); preserve unknown historical value instead of inventing a label |
| absent subject/level | Omit the field, not an empty placeholder, inferred actor, zero or “unknown user” |
| beforeValue/afterValue | Show available values as escaped text with distinct previous/after labels; don't invent an omitted side or evaluate HTML/JSON markup |

Direct visual text selection/copy is normal reading. No “copy raw record”/export button is introduced. Missing hidden fields must stay absent from tooltip, title, aria, CSS data attributes, invisible DOM and diagnostics. Never decode a fixed external-node string into a guessed path or call another endpoint to enrich it.

## Scope, masking and counts

Server audit scope is based on target-node workspace, not counterpart. Workspace managers receive only their authorized scope; instance-scoped rows/findings require superuser. Treat the returned masked string (currently `다른 워크스페이스의 노드`) as final rendered data regardless of which external workspace was involved. Do not assign destination-specific aliases, numbered placeholders, raw IDs/hashes or different badges for the same masked class. Missing-node masking cannot become a separate existence signal.

Group count is the current returned row array length only: no total, denominator, “outside N more,” removed/hidden count, or external-only totals elsewhere on the screen. The number of expanded rows must match that summary count. Do not count global/cached groups to “correct” a manager's smaller result. Correlation key never crosses the UI/API/filter boundary; first audit row identity is not an excuse to render it as a group key.

Superuser access to instance audit is enforced by existing server query eligibility. The current category gate may still hide 감사 로그 for a superuser with zero managed workspaces even though direct API reads are authorized; #70 must not override #61/IR-SHELL-002 gates on its own. Record that real entry-path mismatch as a separate SRS/category handoff if reproduced. Prove ordinary manager and superuser-with-category UI paths, and distinguish endpoint evidence for an otherwise unreachable role from UI completion.

## Reconciliation queue and persistent badge

QueueItemBody supplies only `{id,type}`. Show a readonly list of actual item types, minimum40px rows, wrapping labels and stable item IDs as internal keys. Known existing vocabulary may have concise display labels (`미등록 파일`, `파일 없음`, `워크스페이스 메타 중복`, `연결 미확정`) while retaining unknown future `type` as readable text; do not replace all types with a generic success/failure label. Do not guess paths, workspace, occurrence time, actor, matching candidates, resolution owner or a referenced audit link absent from the response.

Queue rows are not actionable detail/reconcile buttons. No “해소,” “무시,” “다시 실행,” manual linking, repair or delete action is exposed by this client/API. Underlying server resolution appends a new audit row; it does not mutate an old row. A server service existing without an HTTP/callback contract is not a supported UI operation. The queue remains separate from audit rows and index jobs; do not merge its type into the operation filter or create a new category.

The existing sidebar 감사 로그 badge uses this independent queue query, not the selected operation filter. After successful query, **always** display its authorized `items.length`, including 0, with a concise accessible meaning `미해소 항목 N개`. No denominator/global total. During query loading use a nonnumeric busy indicator/label; on error use a clear nonnumeric unavailable/error marker rather than false 0 or a stale current count. The badge slot may stay present for layout stability but cannot pretend a number is known. Queue view and badge read the same successful data.

Badge adapters are confined to existing AppShell category rendering. Role/account change discards stale badge values. A refresh that removes a resolved item updates the supplied badge; do not optimistically decrement on local navigation or announce a resolution action this screen never performed.

## Unsupported capabilities and confirmation policy

- **Pagination/export:** no page/cursor/limit/total or export contract exists in current viewer endpoints. Do not fabricate pages from array slicing, expose a total beyond scope, or implement client CSV/JSON as a shortcut. Future export must preserve server-equivalent masking, but that future AC is not completed by API read tests.
- **Detail fetching/enrichment:** current group detail is already in the response. No correlation lookup, raw row inspector, external path/name resolution, principal enrichment or linked finding detail is supplied.
- **Reconcile/resolve mutations:** no callable web mutation is present. No new action, pending/success toast or destructive confirmation is defined here. Automatic retention remains a separate server/instance-settings contract, never a row purge action.
- **Authority-sensitive navigation:** supplied paths are presentation, not URL/node-ID capabilities. Do not create links using unavailable IDs. The category-entry mismatch noted above and richer queue-detail workflow require separate scope.

There is therefore no L1/L2/L3 execution matrix for #70 itself: filter, expansion, navigation and GET retries are reads. Applying a destructive dialog to them would add unsupported behavior rather than meet a missing confirmation requirement.

## Focus, runtime layout and evidence checklist

Filter changes retain focus on the select; state updates announce briefly without reading entire logs. Native disclosure Enter/Space expands/collapses; summary remains focused and scroll stays anchored. Collapsing a group that contains focus returns it to its summary. If refresh removes a focused group/item, choose the next surviving logical summary or region heading, only if the removed content owned focus. Never target a same-index different operation. Queue navigation moves to its heading/region or existing switch control meaningfully; return preserves the operation filter and surviving expansion identity without replaying stale privileged detail.

Reuse #61 scroll/title-close and #49 states; no new focus trap within the settings pane. Theme switch changes only semantic styles, not filter/expansion/query identity. Forced colors uses Canvas/CanvasText/ButtonText/Highlight and real disclosure/focus outlines; no global opt-out, shadow-only focus or color-only source/role labels. Normal focus is 2px plus2px separation with scroll padding. Long actor/subject/path/operation values and before/after content remain reachable at 200%.

- [ ] TDD red first for coupled audit/queue failure, undefined-as-blank, fake badge zero/stale count, operation-response races, duplicate summary metadata identity, optional-detail omission and accessible disclosure. Preserve permission/masking assertions, not only visible class names.
- [ ] Actual authorized settings→감사 로그→재조정 대기열 routes work independently: audit error with healthy queue, queue error with healthy log, both loading/error/empty, operation filter and real retries. No success-empty while unresolved or mutation request from navigation/refresh. Preserve settings categories/index-queue separation.
- [ ] Actual server-generated audit entries from ordinary operations provide distinct dynamic filter values; no frontend deploy needed for a new operation. Filter GET uses exact selected value; all options remain server-derived. Late old response cannot paint new selection; removed option resets truthfully and no ghost distinct item is invented.
- [ ] Two distinct operations with identical actor/type/time retain separate expansion. Correlated rows spanning timestamps stay grouped as server supplies, and legacy singleton rows are not merged. Summary count equals returned expanded rows. Refresh/retention removing the first ID resets only that group, never transfers focus/detail to another group.
- [ ] Workspace-manager versus superuser data: visible-scope row/group/badge counts, instance/cross-workspace findings excluded where required, fixed external masking identical for different destinations. Verify API and UI contain no raw counterpart ID, correlation key, disguised alias/tooltip, denominator or outside-only aggregate. Manager diagnostic data stays within server scope; no client broadening.
- [ ] Optional subject/level appear only when provided, actor/recipient remain distinct, historical unknown level/subject ID is preserved without lookup. Counterpart/origin-copy labels are visible facts but absent from filter/sort/count axes. Before/after text and each row timestamp remain exact supplied text, not HTML or fabricated defaults.
- [ ] Queue only presents real id/type facts with no guessed workspace/path or resolve action. Scoped count badge is always numeric on successful query including0, nonnumeric on loading/error, independent of audit operation filter. Server resolution/immutability tests remain separate evidence; the web panel cannot claim reconcile completion or export support.
- [ ] Role loss/account switch and stale query completion remove previous privileged rows/detail/badge rather than hiding them only visually. Test superuser instance read with no managed workspace at API level and explicitly report any existing category-entry gap; do not silently alter #61 gate policy.
- [ ] 1280×720,1440×900,1920×1080 ×light/dark ×100%/genuine200% =12 environments, plus forced-colors active at100%/200%. Long Korean actor/subject/path/operation names, large groups, many queue entries, error/empty states. Capture actual styles/geometry/focus/screenshots and last summary/detail/item/return/close reachability without modal-width growth.
- [ ] Genuine zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, verifies getZoom===2 and records pre/post CSS viewport/DPR. Resize and100→200→100 while a group is expanded/filter selected/queue active; context and scroll/focus remain correct without reload. CSS zoom/transform/device scale/half viewport is not substitution.
- [ ] Keyboard native select, disclosure Enter/Space, Tab/Shift+Tab, navigation/retry and removal-focus fallback use stable actual row identity. No text input is introduced, so new IME input validation is N/A; existing settings keyboard/IME behavior remains unaffected. No global keys or row activation causes an operation.
- [ ] Normal text≥4.5:1, large text≥3:1, active boundaries/focus≥3:1 in both themes. Forced-color disclosure state, optional labels and busy/error badge remain perceivable without colored fills. No clipped focus in expanded detail/local scroll.
- [ ] Run audit-log/audit-filter/audit-subject-level/reconciliation-queue/settings/shared-state tests, server audit-view/grouping/scope/queue-resolution/immutability regressions and built-product path. Independent review checks original SRS, bounded query adapters, red/green and real role/filter/zoom artifacts. No exported/reconciled/paginated capability is claimed where a contract is absent.

Open implementation prerequisites are the independent query-state/refetch/badge handoffs. Unsupported export/pagination/richer queue detail/reconcile actions and any authorized-but-unreachable category path require separate contracts; #70's safe achievable scope is truthful read-only rendering, filtering, group detail and queue navigation.
