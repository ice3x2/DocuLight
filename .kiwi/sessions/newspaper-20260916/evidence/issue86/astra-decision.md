# Issue 86 — binding zero-workspace superuser audit entry decision

Decision owner: Astra. Date: 2026-09-18. Decision only; no implementation, tests, SRS edits, commits or GitHub state changes. This supports `IR-SHELL-012`; `docs/spec/` remains authoritative.

## Authority and prerequisite reconciliation

Read AGENTS/index, live #86/#70/#61, prior #70/#61 decisions, `IR-SHELL-012`, `IR-SHELL-002`, existing category/session/App/AppShell contracts, audit/queue routes and audit scope implementation, plus category/ACL/audit tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, `sdd`, target `phase-1`, no stability blockers. `IR-SHELL-012` is planned/stable; `IR-SHELL-002` is verified/evolving.

There is an explicit contract mismatch to resolve before future code: `IR-SHELL-002` AC-5 currently requires workspace management for all three workspace-management categories, while new `IR-SHELL-012` permits a zero-managed-workspace superuser to enter 감사 로그. The approved decision is to refine **only 감사 로그** to `workspace manager OR superuser`. A future authorized SRS step must update the relevant AC/trace/change note and corresponding category reference table, preserving `IR-SHELL-002`'s other categories. This document authorizes the design direction; it neither patches SRS nor treats contradictory ACs as already reconciled. Record fresh evidence for the changed AC and `IR-SHELL-012`, without blanket promotion of unrelated requirements.

Current `/api/audit-log` and `/api/reconciliation-queue` already independently authorize a superuser even with no managed workspaces. App's query eligibility also already uses admin OR superuser. `shell-contract.ts` contains the reusable `workspace-admin-or-superuser` gate, but the audit-log category still uses `workspace-admin`. This is primarily a narrow category/wiring change, not a new API or permission policy.

## Binding category and product behavior

Keep the existing `audit-log` category, label `감사 로그`, place in the existing workspace-management group, and existing order among the fourteen categories. Use the existing OR gate for that category only. Do not add a new instance-audit category, duplicate tab, browser route, admin page or managed-workspace prerequisite. A workspace-management group containing only 감사 로그 for a zero-workspace superuser remains visible because it has a visible child; it does not imply that the other two categories are authorized.

| Current server session facts | 감사 로그 entry | Other boundaries |
| --- | --- | --- |
| Ordinary workspace manager, admin count >0, not superuser | Visible | Existing workspace-scoped reads/masking |
| Superuser, admin count >0 | Visible once | Existing instance eligibility and server scope |
| Superuser, admin count 0, including workspace count 0 | Visible once | Existing instance reads; no invented workspace selection |
| Non-superuser, admin count 0 | Absent, panel unmounted | No audit data/badge requests enabled by this change |
| Session identity/authority unresolved or failed | No privileged entitlement inferred | Honest loading/error through existing shell handling |

Use authoritative session `superuser` and `adminWorkspaceCount`, not user name, a fixed ID, visible workspace count, a selected workspace or locally computed ACL. Category presence is navigation only; direct endpoint requests still authorize server-side. Do not broaden 워크스페이스 management, 권한 감사, 휴지통 or index-queue rules. In particular, superuser status does not make an empty-workspace trash category visible, and 재조정 대기열 stays inside 감사 로그 rather than becoming 색인 대기열.

The zero-workspace superuser can actually activate the category and reach both existing views without constructing a workspace ID. Preserve #70's independent audit/queue loading, error, successful-empty and retry states; one failed read must not block the other view. The existing badge derives only from the successful authorized queue rows, displays 0 on successful empty and a nonnumeric busy/error state while unknown. Preserve operation filtering, grouped detail, masking and queue read-only navigation exactly. No L1/L2/L3 confirmation applies: all added reachability leads to reads, not reconciliation execution.

## Authority changes, focus and disclosure

Session/account/auth-generation change removes previous privileged content, operation options, expansion details and queue badge from the new context. Use #70's existing generation guards and #61's category-removal behavior. A late earlier request cannot reinsert a forbidden tab, data or badge. A still-superuser transition from positive managed count to zero retains this category and continues valid instance reads; do not misinterpret zero as permission loss. Losing superuser with no remaining management removes the category immediately once current server facts arrive. Losing superuser while retaining management retains the entry but invalidates prior instance-scoped data and reloads the narrower view.

When a selected category becomes unavailable, show the existing neutral notice and allow continuation to an allowed category, with personal editor as fallback. Move focus only when the removed tab/panel owned it, to the notice/continuation; otherwise preserve focus. Ordinary activation follows the existing vertical Radix Tabs behavior and does not create a second focus trap. The settings header/close button and independently scrolling category/result panes remain reachable. No stale row names or queue counts may survive merely hidden in DOM/aria/tooltips.

Do not change server audit grouping, retention, instance-row eligibility, cross-workspace counterpart masking, queue filtering, authentication or caching policy to make this entry pass. The screen must display exactly the existing authorized results. No export, resolve/ignore/retry-job, new queue detail, extra filter or mutation callback is added.

## Strict TDD and real evidence

After the bounded SRS reconciliation, first add failing category-role matrix tests for all four resolved roles above and an actual AppShell navigation test for the zero-workspace superuser. Then minimally change the audit-log gate and any demonstrably required narrow adapter. Keep the fourteen-ID/order assertion, preserve unrelated gate assertions, and update only the superseded audit-log expectation rather than deleting the old role tests. If code precedes red, remove the premature implementation and restart test-first.

Test built App mounting, settings entry, audit log→reconciliation queue→audit log, independent retry calls, success-empty versus error, successful 0 badge, account change with late requests, superuser-positive→superuser-zero, superuser→ordinary, and superuser→workspace-manager narrowing. Direct server regressions must still deny the ordinary user and preserve manager-only versus superuser instance rows, cross-workspace fixed masking, authorized group counts, queue scope and immutable audit history. Verify that no navigation/refresh invokes a POST or starts a reconciliation scan. Tests that only inspect the category array do not prove the zero-workspace UI path works.

Playwright uses a temporary seeded backend/database/docs root, unique port and isolated persistent Chromium profile. Create a real superuser with no workspaces and a real instance-scope audit/queue fixture; enter through login and settings against the built product. Never use operating data or delete production workspaces to simulate zero. Also cover manager and ordinary accounts. Record light/dark ×1280×720/1440×900/1920×1080 ×100%/genuine200% and forced-colors at both zoom levels. Set browser zoom with an isolated extension `chrome.tabs.setZoom(tabId,2)`, assert `getZoom()===2`, record CSS viewport/DPR, and test 100→200→100 without reload while audit/queue content is active. CSS zoom, transforms, device scaling or half viewport are not equivalent evidence.

Capture actual focus/computed style/geometry/screenshots for the group heading with its sole tab, long Korean rows, badge loading/error/0, last result and settings close reachability. Check text≥4.5:1, large text≥3:1 and focus/boundaries≥3:1 in each palette and forced-colors visibility. Keyboard arrows/Home/End/Tab, queue navigation and focus after role loss must work. No new text field exists: new-input IME testing is N/A; existing settings/editor keyboard handling is unchanged. Independent review assesses original issue/SRS and red/green/server/browser evidence. Cleanup targets only identified test-owned processes and paths, never every Node process.

## Dependencies and closure

#86 can proceed independently of #83–#85 once its SRS category refinement is recorded; it must not wait for a managed-workspace API to permit an instance-authorized superuser. Prerequisite #70 read-only view and #61 shell are already implemented design slices; their constraints remain except for the explicitly refined audit-log gate.

Live #70 and #61 are already CLOSED; #86 is OPEN. Completing the refined ACs, role matrix, real zero-workspace entry and unchanged server privacy regressions closes #86 and resolves the separately tracked #70/#61 reachability gap. It does not reopen/reclose those parents, close #83–#85, or imply unsupported audit export/pagination/reconciliation actions exist. This decision itself closes no issue.
