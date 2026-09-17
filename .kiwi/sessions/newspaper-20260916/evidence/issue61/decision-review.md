# Issue #61 Astra decision independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Geometry and reachability

The decision matches IR-SHELL-008 AC-1/2 and the newspaper settings decisions:

- settings-only border-box width `min(1200px, 94vw)` and height `min(820px, 90dvh)`;
- 260px left column and 24px right padding at CSS viewport widths of 900px and above;
- below 900px, `min(260px, 32%)` left width and 16px right padding while retaining two columns;
- fixed title/close header outside both scrollports;
- independent vertical scrolling for the category navigation and current body;
- no outer clipping as a substitute for reachable child scrollports and no settings-wide fixed footer covering the final action.

The explicit 899/900/901 checks correctly pin the strict `below 900px` boundary. The 12-environment matrix covers 1280×720, 1440×900 and 1920×1080 in light/dark at 100% and genuine 200%. Genuine zoom requires an isolated persistent Chromium profile and `chrome.tabs.setZoom(2)`, verifies `getZoom`, and records the changed CSS viewport/DPR. It rejects CSS zoom, transforms, device emulation, DPR substitution and a manually halved viewport. At 1280×720/200% it explicitly requires keyboard reachability of the fourteenth category, the right panel's final input/action and the fixed close control.

## Categories, gates and role matrices

The decision consumes `SETTINGS_CATEGORIES` and `visibleCategories(viewer)` rather than duplicating authorization logic. Its 14 IDs, labels, order and section ownership match IR-SHELL-002 and the current shell contract:

- personal: `editor`, `appearance`, `tokens`, `account`, conditional `trash`;
- workspace management: `workspace`, `acl-audit`, `audit-log`;
- instance: `users`, `groups`, `signup-approval`, `all-workspaces`, `instance`, `index-queue`.

The gates are exact: four personal categories for every authenticated user; trash only when `workspaceCount > 0`; the three workspace categories only when `adminWorkspaceCount > 0`; and the six instance categories only for a superuser. The expected counts are consequently correct: 4, 5, 8 and 14 for the main role fixtures, plus 10 for a superuser with zero workspace/admin counts and 11 for a superuser with a visible workspace but no managed workspace. Forbidden tabs, panels and empty group headings must be absent rather than disabled or visually hidden.

The decision keeps index queue distinct from the five instance settings and from audit reconciliation. It preserves the existing filtered `queue.items.length` badge without adding totals, hidden-scope denominators or another fetch. Sharing and version history remain document-header functions rather than invented settings categories.

## Selection and permission-change honesty

One vertical Radix Tabs root spans all groups, preserving its roving focus, Arrow/Home/End behavior, tab-panel association and active-panel-only exposure. Group headings add no keyboard stops. Focused tabs must scroll into view with their 2px/2px ring intact, and selected, hover and keyboard-focus states remain distinguishable.

When newly supplied Viewer facts remove the selected category, the decision immediately removes the forbidden tab/content and provides the specified explicit fallback acknowledgement. It preserves unaffected selection and drafts and moves focus only when the removed content owned it. It does not pretend that AppShell currently has the older screen document's category-list refresh API: child 403/404 refresh, managed-workspace selection and missing child state handoffs are explicitly recorded as separate integration gaps. Empty arrays, undefined data and placeholders cannot be presented as successful empty results.

## Scope, overlays and focus

The shell-only boundary is sound. Existing children, callbacks and policies remain unchanged; #61 does not implement workspace features, new data fetches, selectors, settings values, global save behavior or PAT inner stages. The decision recognizes IR-SHELL-008 AC-5 and IR-AUTH-003 as separate owners and forbids moving a revealed PAT into parent state or weakening its leave guard. A missing callable child/parent guard must be reported instead of inferred from DOM state or hidden by a fixture.

Migrating the settings surface from raw Radix primitives to the existing #48 wrapper is necessary for explicit overlay ownership. The decision avoids a duplicate Portal/Overlay and preserves the approved 300/400/500/600/700/800/900 stack, topmost-only Escape, Dialog focus trap and return to the bottom-left gear. The title, description and 36px accessible close remain outside both scrollports. Page, settings and risk-owned menus stay in their own owner layers; the decision does not globally promote portals or migrate feature-owned ordinary nested dialogs under this issue.

## Sources inspected

- Original GitHub issue #61 via `gh issue view 61 --json title,body,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/08.app-shell.srs.md`: IR-SHELL-001, IR-SHELL-002 and IR-SHELL-008
- `docs/spec/04.screen-design-settings.md` §§1.1–1.6
- `docs/decision/newspaper-style-guide.md` and `newspaper-implementation-handoff.md`
- Approved #48 shared-overlay evidence/review and #50 shell review
- Current `AppShell.tsx`, `shell-contract.ts`, shared Dialog/AlertDialog adapters, overlay CSS and settings children
- `.kiwi/sessions/newspaper-20260916/evidence/issue61/astra-decision.md`
- Targeted `rg` checks for all 14 categories/gates, role inputs, geometry, scrolling, overlay layers, focus/Escape and genuine-zoom evidence requirements

This is a pre-implementation decision review. No implementation, browser run or test result is claimed. The decision's proposed implementation and evidence contract is consistent, feasible and honest about the remaining integration limitations.
