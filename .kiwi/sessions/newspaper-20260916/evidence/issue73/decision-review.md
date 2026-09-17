# Issue #73 Astra decision independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Scope and governing contracts

The decision correctly assigns `IR-WORKSPACE-001` AC-4/5 and the creation half of AC-2 to #73 while preserving #72 ownership of managed/all lists, stable-ID selection, rename, and sidecar rename outcomes. The issue's API-wiring condition is satisfied by the planned/stable `IR-WORKSPACE-001`; the proposed POST/client/App adapters implement that requirement rather than adding an ungoverned creation feature. Archive/restore, delete/undo, nesting, templates/imports, membership editing, and new policy remain excluded.

The current code provides feasible seams but is not falsely described as complete. `NewWorkspaceForm` already has the three conceptual inputs and one L2 component, while `createWorkspaceAs` is the single service that creates storage, the selected administrator ACL, optional default ACL, and audit records. There is currently no workspace POST route or promise-bearing web result adapter, and the decision identifies those as required deltas.

## Exact fields, defaults, and validation

The form has exactly three ordered fields:

1. required workspace display name, initially empty;
2. required single administrator principal, initially unselected;
3. default-group initial permission with `없음`, `보기`, and `편집`, initially `없음`.

That matches `IR-WORKSPACE-001` AC-4, `SEC-WORKSPACE-001` AC-4/5, and `FR-PRINCIPAL-007`. The decision does not auto-select the current superuser or first result, add multiple administrators, create/invite a principal, or turn the creator into a second explicit admin ACL. Users and groups remain selectable under the existing principal-search contract. The shared `group:superuser` scope authorizes the current superuser's search; it does not mean that only superuser-group members are returned.

Name validation exactly reuses AC-6: NFC normalization, end trimming, 1–120 Unicode code points, and rejection of U+0000–U+001F/U+007F. It counts code points rather than UTF-16 units and permits duplicate display names, path punctuation, and filesystem reserved names because workspace directories use stable hashed IDs. Invalid input keeps the draft, exposes a linked field error, and sends no mutation. Composition is exempt from premature validation/submission.

The administrator field uses the shared fixed two-character/20-result picker and distinguishes idle, loading, empty, results, and failure/retry. Rejected accounts remain excluded, while active, pending, and suspended users use the existing neutral status vocabulary. The selected principal is a separately displayed ID-backed choice; query churn alone does not silently replace it, and removal/replacement or form-field changes invalidate a frozen confirmation.

## Fresh warnings and the single L2 gate

Every valid submission enters exactly one L2 confirmation under `FR-CONFIRM-019`, including default `없음` and warning-free cases. The form submit is not treated as the confirmation gate. The dialog contains the normalized name, selected administrator identity and fixed `관리` level, default-group level, and supported warning codes. It contains no child count, denominator, L3 token, automatic grant, or second permission dialog.

The current `/grant-warnings` adapter forwards only principal/entry IDs even though `grantWarnings` also supports `defaultGroupLevel`. The proposed narrow, validated creation-context addition is necessary to obtain both existing warnings: suspended subject and open-signup plus default-edit. Warning lookup failure blocks POST rather than becoming an empty warning set. Opening and executing re-read the selected tuple; changed warnings remain in the same dialog and require renewed activation. The decision does not claim an atomic reservation because no warning revision/token exists.

The creation-specific delayed-effect wording is more accurate than the current generic cleanup notice: creation and initial ACL rows occur now, future documents inherit the chosen access, and already-read content cannot be recalled. It does not imply that the workspace creation itself waits for cleanup or that broken descendant inheritance cancels workspace-admin authority. Cancel/Escape performs no POST, preserves the form, and restores the invoking control. Pending commit suppresses duplicate execution and destructive dismissal without pretending that closing or aborting a fetch would cancel a server-side creation.

## POST adapter and result ownership

The bounded `POST /api/workspaces` request is exactly `{name, administratorId, defaultGroupLevel}` with validated string/enum fields and live superuser authorization. It calls `createWorkspaceAs` once rather than composing independent client-side create/grant calls. The proposed HTTP 201 result `{workspace:{id,name,createdAt}}` faithfully projects the service's successful result. Known authorization, unknown-administrator, and field-validation failures have finite safe mappings; raw paths, SQL, stacks, and exception messages remain hidden.

Replacing the optional void callback with a required Promise/result adapter is necessary for truthful UI. The result owner synchronously guards duplicate click/Enter attempts, waits for actual 201, and retains the accepted stable ID independently of subsequent queries. Accepted creation switches back to the all list, retains a parent-owned status, refreshes all/managed/scope/shell data through #72 ownership, and selects only the returned ID. Duplicate names cannot redirect selection. The design neither fabricates an adminless/list row nor clears the draft before the accepted identity is safely owned above the form.

An accepted 201 followed by refresh failure remains a successful creation with a read-only list retry; it never repeats POST. Cancellation restores prior selection/scroll and the entry trigger. Successful refresh focuses the returned row's meaningful action, with status/heading fallback while loading or after authority loss. No row index, name lookup, body focus, or unconditional scroll-to-top becomes identity or focus ownership.

## Partial creation, response loss, and administrator eligibility

The decision accurately records three material limitations:

- `createWorkspaceAs` inserts the DB workspace before asynchronous directory and sidecar writes, then appends audit and ACL state. No transaction, rollback, compensation, or demonstrated repair contract makes that sequence atomic. An exception can leave a partial workspace, so unclassified storage failure is reported as uncertain and directs the user to inspect the authoritative all list. #72's rename `sidecarSync=pending` result is not reused for creation.
- There is no idempotency key or request-to-workspace lookup. A lost response can follow a committed create, duplicate display names make name matching non-authoritative, and automatic retry could create a second workspace. The decision disables replay of the uncertain attempt, preserves its values for inspection, and labels any later explicit attempt as a new operation rather than promising exactly-once behavior.
- Search excludes rejected users but `createWorkspaceAs` accepts any principal that still exists. The warning route is not an eligibility/existence check. The decision documents stale deletion/status/system-group behavior against actual code and does not invent an active-only or non-system-group rule. A stronger execution-time administrator-eligibility promise requires its own SRS-backed server policy.

These gaps limit completion claims without blocking the supported validated happy path, cancellation, known rejection, accepted result, or safe list refresh. The proposed evidence injects storage and dropped-response failures and inspects actual DB, filesystem, ACL, audit, and UI outcomes instead of proving atomicity with a mock callback.

## Layout, accessibility, and Playwright evidence

The form remains in #61's independently scrolling settings body with no nested ordinary modal or route. Persistent labels, connected errors/help, 36px controls, wrapping selected-principal/warning content, in-flow actions, and max-560 field width remain reachable without covering the settings close control. The decision covers default, hover, focus, selected, disabled, readonly confirmation summary, invalid, loading, empty, error, warning, pending, and accepted/refresh-error states with text and non-color cues.

The browser contract covers 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%, for 12 environments, plus forced-colors at both zoom levels. Genuine zoom requires an isolated persistent Chromium profile and extension `chrome.tabs.setZoom(tabId, 2)`, asserts `getZoom === 2`, and records CSS viewport/DPR. CSS zoom, transforms, DPR-only/device emulation, and a manually halved viewport do not qualify. Runtime resize and 100→200→100 occur while the form, picker, warning, and L2 are already mounted. The matrix requires real product/API/disk behavior, computed geometry/colors, scroll and focus measurements, screenshots, stable-ID refresh, duplicate names, permission roles, partial failures, and native Windows Korean IME; synthetic composition is explicitly supplementary.

## Sources inspected

- Original GitHub issue #73 via `gh issue view 73 --json number,title,body,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/13.workspace.srs.md`: `IR-WORKSPACE-001`, `FR-WORKSPACE-001`, `SEC-WORKSPACE-001/002/003`
- `docs/spec/16.principal.srs.md`: `FR-PRINCIPAL-007`, `SEC-PRINCIPAL-002/003`
- `docs/spec/11.confirmation-grades.srs.md`: `FR-CONFIRM-019` and its confirmation dependencies
- `docs/spec/04.screen-design-settings.md` and newspaper design/operational handoff
- Approved #72 Astra decision and independent review
- Current `NewWorkspaceForm`, `PrincipalPicker`, `ConfirmGate`, warning components, `App`/`AppShell`, API client/query code, and relevant web tests
- Current workspace routes, `createWorkspace`/`createWorkspaceAs`, repository/files/sidecar services, warning/principal-search/permission services, and relevant server/HTTP tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue73/astra-decision.md`

This is a pre-implementation decision review. No product implementation, Playwright run, or test result is claimed. Atomic recovery, idempotency, unknown-result recovery, and stronger administrator eligibility remain explicit unsupported contracts.
