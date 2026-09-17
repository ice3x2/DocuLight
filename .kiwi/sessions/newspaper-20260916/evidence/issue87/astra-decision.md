# Issue 87 — binding retention impact and save-consent decisions

Decision owner: Astra, 2026-09-18, under delegated design ownership. This is implementation guidance for existing requirements, not a second requirements source. `docs/spec/` remains authoritative. No implementation, executed test, verification, commit, or issue closure is claimed.

## Authority and observed starting point

Read root AGENTS, SRS index, live GitHub #87/#88/#71, prior #61/#71 decisions, InstanceSettings, client settings methods, workspace-api settings routes, settings service/audit tests, trash/audit/finding cleanup adapters, retention predicates, ConfirmGate and its tests, AppShell/TokenPanel, and the #71 product runner. SpecKiwi reports workspace `C:\Work\git\DocuLight2.0`, root source `server-cwd-discovery`, mode `sdd`, target `phase-1`; no stability blockers. Read target status/stability summaries, open requirement lists and recent completed work. Existing `SRS-W072` is unrelated.

Direct requirement FR-CONFIRM-024 is planned/stable, AC-1–5 unchecked. FR-CONFIRM-007 is implemented/stable; FR-CONFIRM-004 and FR-CONFIRM-008 are verified/stable. Preserve DR-SHELL-001, REL-AUDIT-003, FR-STORAGE-007 and per-field OBS-AUDIT-006 logging. #71 is OPEN and explicitly defers B1 to #87 and B2 to #88.

Current GET `/api/settings` returns five raw strings. PUT takes a flat known-key string patch and returns 204/400 under a superuser gate. `writeSettings` validates the resulting retention pair before writing, but its successive setting writes/audit appends are not themselves enclosed by the HTTP route in a transaction. No authoritative preview or consent receipt exists. #71 correctly blocks shortening and already distinguishes rejected/uncertain writes from accepted writes with failed readback. Extend that path; do not replace it with optimistic saving.

## Policy and authoritative impact units

Shortening is finite to smaller finite, or unlimited zero to finite. Finite to zero, equal effective values and larger finite values are not shortening. Determine this on the server against current effective settings and the complete proposed pair, never lexical string comparison. Preserve accepted finite fractional values; introduce no integer restriction, duration maximum, schedule or new default. For a retention-bearing proposal, invalid/blank/non-finite/negative raw proposed values, or an invalid raw retention baseline whose effective value would require silently choosing a fallback, produce a structured validation/conflict result with no consent. Keep audit >= trash with zero as infinity.

Compute one read-only snapshot at a single server `now` across the instance, without workspace-list, current UI page, search filter or pagination restrictions. The preview describes **currently existing entities eligible under the proposed shortened policy**. It includes entities already overdue under the old policy; it is not the difference between old-policy and new-policy counts. This avoids advertising zero destruction merely because cleanup was already overdue. An unchanged/expanded domain contributes zero to this proposed shortening operation. It does not promise the eventual scheduled cleanup count, which can change with time and later activity.

Define three disjoint typed entity sets:

| Set | Exact membership and unit |
| --- | --- |
| T | If trash shortens: all distinct existing node IDs removed by the existing purge semantics for currently expired trash entries, including each directory root and its descendants. Take a union across overlapping roots; a descendant/root occurring twice contributes once. A trash entry row is not a count of all its contained nodes. Do not count attachments, versions, ACL rows, bytes or index fragments as additional nodes. |
| A | If audit shortens: distinct audit row IDs selected by the existing proposed-policy audit-expiry query. Correlation-group display rows are not units; count stored audit rows, including instance and workspace scopes. |
| F | If audit shortens: distinct reconciliation finding IDs that existing `purgeReferencing` will remove because at least one referenced row is in A. Multiple matching references do not multiply a finding. Reference join rows are not extra entities. |

The authoritative total is `|T| + |A| + |F|`, a union of namespaced identities, not a union of bare numeric/string IDs. Trash nodes and audit rows about those nodes are different objects and each counts once. Findings are included because saving this audit policy removes them through the existing G37 dependency; omitting them would understate actual affected objects. Always show the breakdown `휴지통 노드 N개`, `감사 기록 M건`, `연결된 대기열 항목 K건` and `영향 합계 S건` in the confirmation. For a single shortened domain, show its applicable breakdown; never label the total as documents alone. No denominator or inaccessible/reached totals.

For example, an expired directory containing two documents contributes T=3. Two expired audit rows referenced by one finding contribute A=2,F=1. Coordinated shortening yields total 6, L3 token `6`. Equal bare IDs across these three types never collide.

Match real cleanup boundaries exactly: trash currently uses `deletedAt <= now - days` at Date millisecond precision; audit/finding use `occurred_at < cutoff` with the existing UTC `YYYY-MM-DD HH:MM:SS` truncation. Do not silently unify <= and < or round policy values in this issue. Query helpers must share the corresponding cleanup selection semantics, including descendants and finding joins, without calling a destructive sweep. Boundary tests document the existing distinction. Corrupt/missing identity or unavailable authoritative membership is a failed preview, not count zero. An empty valid query is a real zero.

## Minimal wire contract and consent binding

Keep existing GET and flat PUT bodies. Add authenticated, superuser-only `POST /api/settings/retention-impact` with JSON `{ patch: Record<knownSettingKey,string> }`. The patch is the entire exact pending settings patch, including any accompanying non-retention change. Unknown keys, malformed bodies and invalid retention combinations are rejected before scanning. Use existing credential/CSRF/PAT scope boundaries and no-store responses; no new public count endpoint.

Successful preview returns these fields:

```
{
  beforeRetention: { "trash-retention-days": string, "audit-retention-days": string },
  proposedRetention: { "trash-retention-days": string, "audit-retention-days": string },
  shortened: ("trash-retention-days" | "audit-retention-days")[],
  impact: { trashNodes: number, auditRows: number, findings: number, total: number },
  grade: "L2" | "L3" | null,
  typingToken: string | null,
  computedAt: string,
  receipt: string | null
}
```

If there is no shortening, return grade/token/receipt null and zero contributions. The normal client need not call preview for a known expansion. If there is shortening, total zero is L2/token null; positive total is L3/token the unformatted base-10 total. `computedAt` supports evidence/diagnosis, not a misleading count suffix or a guarantee about a future schedule.

Use an opaque authenticated receipt derived from a server-secret MAC over a versioned, canonical payload: authenticated actor/security context, exact sorted raw patch, both current baseline retention values and their effective meanings, resulting pair/shortened set, and a digest of the sorted typed impact identities plus their decision-relevant expiry/reference/subtree facts. Include counts/grade in that binding. The client cannot mint a receipt from a count. The server keeps identifiers inside the digest; no document names, IDs, audit contents, queue contents or raw credentials need return in the response. The MAC secret is server process memory and is never a setting or client-visible value. Restart may invalidate receipts; a fresh preview recovers. No receipt TTL or generic settings revision system is necessary: every use recomputes and verifies the bound facts against current data. The timestamp itself is not an equality key; unchanged impact after time passes remains valid, while newly crossing an expiry boundary changes membership and invalidates consent.

PUT retains its flat patch and accepts `X-Retention-Impact-Receipt`; for L3 also accept `X-Retention-Impact-Token`. A missing receipt for an actual shortening returns HTTP 409 with code `retention-confirmation-required`. A malformed/invalid/nonmatching receipt, changed binding, wrong/missing L3 token or a receipt used for another patch returns HTTP 409 `retention-confirmation-stale` without writes. Do not accept a receipt whose typed token merely matches a client-supplied total. Even when current settings no longer make this patch a shortening, a supplied stale receipt must be rejected rather than ignored. A receiptless safe patch remains compatible with the current API, provided authoritative validation finds it safe at commit time.

Use 400 with a safe structured code for malformed patch or invalid retention values/pair; 401/403 remain authentication/authorization outcomes, and unexpected storage/scanning failures are failures, never 204 or empty success. The client preserves existing generic handling of unrelated legacy errors. New codes may be introduced narrowly for these branches; this does not authorize a general validation API or numeric-policy rewrite.

## Atomic save and races

The final route/service transaction must recheck actor privilege, read current settings, validate the complete proposed pair, classify shortening, recompute current membership/digest, validate receipt/token, write the entire patch and append the existing per-changed-field audit rows as **one synchronous DB transaction**. Use the same metadata DB for these reads/writes. No await, filesystem deletion, network call or cleanup runs inside it. A successful commit is the linearization point. This is operation-specific consent validation, not a general settings revision/CAS API.

SQLite transaction isolation must prevent an intervening committed metadata change between final verification and settings commit. The existing transaction adapter can be used where its rollback/isolation behavior satisfies this; contention/snapshot-upgrade failure must roll back and return a retryable failure, never retry only the write using old consent. Any storage/audit exception rolls back all settings and all new audit rows. Expected stale/validation branches are checked before writes and returned as values, not implemented by throwing exceptions for normal flow.

| Race/outcome | Required result |
| --- | --- |
| Another administrator changes either baseline retention value after preview | Reject receipt, zero patch/audit writes; client reloads/reviews current pair. Same proposed values do not silently approve accompanying settings. |
| Trash restored/purged, audit expired, finding/reference added/removed, subtree changed, or clock crosses expiry threshold | Recompute under final transaction; membership or decision facts differ => reject old consent even if the total stays equal. |
| Unrelated young audit row or unrelated setting changes | No blanket global revision invalidation; if bound policy/patch/impact facts are unchanged, consent remains valid. |
| Coordinated shortening with an unrelated signup/upload/version edit | One bound patch and one commit, or none. Never persist the unrelated slice after a blocked/stale destructive slice. |
| Preview request fails or old response arrives after edit/unmount/owner change | No confirmable count; preserve live draft, discard obsolete result. |
| Same confirm clicked twice | Synchronous client submission latch; final server recomputation still guards a repeated HTTP request. A receipt is not a generic idempotency key; no promise of arbitrary request replay. |
| Role/session changes | Current server privilege wins; reject and clear privileged client state. Never retain receipt/values for the next account. |
| HTTP success but readback fails | Keep #71 accepted-refresh-error; GET-only retry, no second PUT. |
| Transport fails after request sent | Keep #71 uncertain state; explicit GET reconciliation before any deliberate resave, then new preview/consent if still shortening. Never claim rollback from a network error. |

At commit time evidence is authoritative for currently committed metadata. Async cleanup/filesystem work before or after that point and later newly aged items remain governed by the saved policy; do not promise a frozen future delete list. Preview itself causes no settings audit rows, deletion, cleanup scheduling, finding resolution or policy change.

## Client states, confirmation and accessibility

Preserve baseline/draft/validation and known-key changed-patch construction. Exact progression: ready -> preflight GET -> conflict/invalid OR preview pending -> confirmation ready L2/L3 -> atomic PUT pending -> accepted readback -> success/accepted-refresh-error. Preview error, confirmation stale and uncertain write are distinct states. Gate each async result by current authenticated owner, mounted form, request generation and immutable submitted draft generation. Changing/reverting a draft invalidates its pending receipt and typed input.

Every explicit opening/reopening of the risk confirmation obtains a new POST preview. The read-only pending shell may show `영향을 확인하는 중입니다.` with Cancel, but has no count/grade guess or enabled confirm. A failed preview shows `보존 기간 축소의 영향을 확인하지 못했습니다.` plus `다시 확인` and `계속 편집`; no PUT. Do not refetch in a render/callback dependency loop. Cancel retains the complete draft and restores Save/initiating focus.

On ready L2 show the authoritative zero and no typing field. L3 requires exact plain total digits; no localized grouping, whitespace coercion, previous token or fuzzy comparison. Title `보존 기간 축소`, action `변경 저장`, safe action `계속 편집`. Always show both proposed retention values, relevant typed breakdown and the FR-CONFIRM-008 warning: saving changes policy now; existing data is not deleted by clicking Save and will be removed at the next cleanup. Audit expiry is the permitted automatic removal path, not an audit-row edit/delete feature.

If a fresh preview/revalidation differs, lock execution, clear typed input and display `영향이 변경되었습니다. 새 내용을 확인하세요.` with the new breakdown/grade/token. If only identities changed, explain that affected items changed even when counts are equal. PUT rejection must not itself auto-confirm or auto-resubmit a replacement receipt. Require explicit `새 내용 확인` to acknowledge the fresh preview and unlock a new confirmation generation; L3 then needs fresh typing. Reopening after dismissal also requires a new preview. The existing ConfirmGate only compares serialized counts and has no explicit unlock action: narrowly extend/adapt it for this receipt-generation lock, preserving all other consumers. Never remount solely to erase a stale warning and silently unlock.

Use the existing risk AlertDialog and #48 layers: settings 400/500, settings menus 600, risk 700/800, risk menus 900. Trap focus in the topmost risk dialog, initially focus the safe action; Escape cancels it without closing settings, outside click never confirms. Pending PUT blocks duplicate/cancel paths that would imply cancellation of an already sent write, with truthful `저장 중…`; cancellation of a read-only preview invalidates its generation. Screen-reader title/description, live error/count-change notice, labelled token input, visible focus and IME composition protection are required. Preserve the #61 two-column shell and #71 form geometry, underlying document and root theme.

## Test-first and closure evidence

Implementation starts with failing tests for FR-CONFIRM-024 AC-1–5; record test revision/hash and raw red output before product edits. If implementation precedes red, remove it and repeat test-first. This design-only document needs independent original-requirement review, not fictitious red/green evidence.

- Server real DB/HTTP tests: GET -> preview -> PUT -> readback; superuser versus ordinary/workspace-admin/unauthenticated direct access; body validation; individual/coordinated shortening; 0/unlimited semantics; expiry boundaries; old-overdue objects; directory descendants/overlap; finding multiple references; domain-ID collisions; fresh real zero and positive totals. Assert preview changes no rows/files.
- Consent/transaction tests: missing/forged/cross-actor/changed-patch receipts; same-total replaced members; reference/subtree changes; time threshold; retention race; unauthorized actor at save; safe-to-risky race with no receipt; rollback when a later field/audit append fails; no partial settings or partial successful audit evidence. DB contention must fail without writing from a stale read. Preserve five-key/default/cross-field/audit regression behavior.
- Client/real AppShell tests: every opening fetches, slow/error/obsolete preview cannot enable Save; L2 zero/L3 exact token; locked changed impacts and explicit review; cancel draft/focus preservation; double-click; known rejection versus uncertainty; accepted write plus failed GET; #88 guards remain independent of save consent. Existing #71 fail-closed tests evolve to assert no shortening without verified consent, not deletion of the safeguard.
- Isolated Playwright built product: owned temporary DB/vault/account fixtures and unique persistent Chromium profile/port; actual GET/POST-preview/PUT, no mocked successful count for closure. Exercise real concurrent data change from a second authenticated fixture and inspect 409 plus zero mutation before retry. No existing/default profile, CDP attachment, OS automation, global browser control or name-based process termination.
- Run 1280x720, 1440x900, 1920x1080 x light/dark x genuine 100%/200% (12), plus forced-colors 100%/200%. Use the owned extension `chrome.tabs.setZoom` and independent `chrome.tabs.getZoom` assertions (2 at 200%, 1 after reset), recording CSS viewport/DPR, request sequence, computed geometry and screenshots. CSS zoom/transforms, deviceScaleFactor or halved viewport do not count. Resize and 100->200->100 while dirty/confirmation/error stays mounted; verify full breakdown/token/actions/close reachability and unclipped focus. Capture no credentials or raw receipt in shared evidence.
- Native keyboard tab/shift-tab, safe initial focus, topmost Escape, composition Enter and actual accessible error/token labels. Record any unperformed native IME checks honestly. Run affected server/web settings/retention/finding/confirmation tests, typecheck/build and independent diff/evidence review; no class-only proof.

#87 closes only when real authoritative preview, operation-specific atomic validation/write, L2/L3 and race evidence satisfy FR-CONFIRM-024, relevant FR-CONFIRM-007/004/008 ACs and independent review. #88 is independently implementable; #87 completion alone does not establish safe departure. #71 stays OPEN until **both #87 and #88** are complete and the combined real settings flow is independently exercised. Do not mark all #71 or SRS ACs verified merely because these decisions exist; retain its recorded native IME/other evidence limits and separately scoped B3/B4 limits.
