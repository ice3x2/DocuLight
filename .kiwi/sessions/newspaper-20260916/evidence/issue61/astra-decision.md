# Issue 61 — binding settings modal shell and category decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation direction; `docs/spec/` remains authoritative. No product implementation, tests or verification is claimed.

## Authority and scope

Read AGENTS/SRS index, GitHub #61, newspaper guide/handoff, approved #48 shared UI/overlay and #50 shell reviews, `docs/spec/04.screen-design-settings.md` §1.1–§1.5, SettingsModal in AppShell, shell-contract, common Dialog/CSS and current category/TokenPanel assembly. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

IR-SHELL-001 is verified/stable; IR-SHELL-002 verified/evolving; direct layout requirement IR-SHELL-008 in_progress/stable. IR-SHELL-008 AC-1/2's two independently scrolling columns and 200% geometry take precedence over the earlier screen document's single right-scroll assumption. IR-SHELL-008 AC-4/6 and approved #48 preserve focus/layering; AC-5 inner-form migration and IR-AUTH-003 PAT stages remain their feature owners' work.

Scope is the existing SettingsModal assembly in AppShell plus scoped styles/tests. Preserve all existing category children, callbacks and settings policies. Do not implement placeholders, new selectors, settings values, save flows, workspace management, PAT issuance/leave stages, admin data fetching or nested-form migration here. No new category, separate admin page, global Save button, dependency or palette is introduced.

Settings opens only from the existing authenticated shell's bottom-left `설정` gear, without route navigation or destroying the underlying document/editor. Document sharing/version history remain in the document header, not settings. Pre-auth screens never acquire a gear or hidden settings modal.

## Exact container geometry

- Outer settings Dialog is centered, border-box width `min(1200px,94vw)` and height `min(820px,90dvh)`, with a 1px border-control border and 6px radius. Use existing control surface/primary text and #48 overlay. Do not inherit the ordinary 560px Dialog width or its `calc(100dvh - 48px)` max-height when those would shrink this specified settings geometry.
- Scope width, height, max-size, padding and overflow overrides to the settings instance (e.g. a settings data attribute), leaving ordinary/confirmation dialogs unchanged. Root has zero content padding and a two-row grid: header `auto`, body `minmax(0,1fr)`. Outer overflow clipping may contain radius, but must not be the mechanism hiding overflowing content: actual left/right child scrollports and focus space are mandatory.
- Header has minimum 60px height, 12px vertical/24px horizontal padding, `설정` title at 18/26px sans 600, subtle bottom rule, and a 36×36px close button with accessible name `설정 닫기`. Title and close live **outside both scrolling columns**. Use the actual shared Dialog close/dismiss path; do not close by unmounting arbitrary state outside existing ownership.
- Body retains two columns at all supported zoom widths. At effective **CSS viewport width ≥900px**, left column is 260px and right is `minmax(0,1fr)` with 24px padding. Below 900px, left is `min(260px,32%)` of the available split-body width and right padding is 16px. This is a CSS viewport breakpoint, not physical monitor width, DPR or JavaScript zoom detection. Do not collapse categories to a menu, stack columns or hide labels.
- Both columns and the intervening Tabs wrappers use `min-width:0; min-height:0`. Left navigation and right current content each own independent `overflow-y:auto`. Category/body scrolling cannot move the header/close. Right content may contain feature-owned local horizontal table/code scroll; it may not grow the outer modal or silently cut off its final field/action.
- Do not add a settings-wide fixed footer. Feature-owned action rows remain in their existing location, either outside their internal result scrolling or reachable at the end of the right content scroll. No shadow/absolute overlay can cover the final action. Right shell padding remains measurable even when child components own further internal spacing; do not globally restyle their layouts to enforce this shell.

## Exact categories and visibility

Render the existing `SETTINGS_CATEGORIES`/`visibleCategories(viewer)` result; group presentation by its section without copying a second authorization list into JSX. Preserve this order and all 14 identities:

| Group | Category label (`id`) | Existing gate |
| --- | --- | --- |
| 개인 | 에디터 (`editor`) | everyone |
| 개인 | 외모(테마) (`appearance`) | everyone |
| 개인 | 액세스 토큰 (`tokens`) | everyone |
| 개인 | 계정 (`account`) | everyone |
| 개인 | 휴지통 (`trash`) | `workspaceCount > 0` |
| 워크스페이스 관리 | 워크스페이스 (`workspace`) | `adminWorkspaceCount > 0` |
| 워크스페이스 관리 | 권한 감사 (`acl-audit`) | `adminWorkspaceCount > 0` |
| 워크스페이스 관리 | 감사 로그 (`audit-log`) | `adminWorkspaceCount > 0` |
| 인스턴스 | 사용자 관리 (`users`) | `superuser` |
| 인스턴스 | 그룹 관리 (`groups`) | `superuser` |
| 인스턴스 | 가입 승인 (`signup-approval`) | `superuser` |
| 인스턴스 | 전체 워크스페이스 (`all-workspaces`) | `superuser` |
| 인스턴스 | 인스턴스 설정 (`instance`) | `superuser` |
| 인스턴스 | 색인 대기열 (`index-queue`) | `superuser` |

Invisible categories and their panels are absent, not disabled, offscreen or present as locked labels/tooltips. A group with no visible children has no heading. Do not extend the superuser gate to trash or managed-workspace categories: those use their own existing count inputs. Instance settings retain their existing five settings; index queue is a distinct category, not a sixth setting or audit reconciliation queue. Group headings add structure, not new selectable categories.

Left surface uses sidebar role, right document surface, header control surface. Navigation padding 12px vertical/8px horizontal. Group headings are 13/20px sans 600 with sidebar-secondary text; 24px between groups and 8px before their tabs. Tabs are full-width, minimum 40px, 8px vertical/12px horizontal padding, 14/22px left-aligned text, 4px radius; long Korean labels wrap with natural height. No icon package or newly invented glyphs.

Selected category uses selected surface, primary text/600 weight and a 2px action-primary left mark; preserve Radix aria-selected association. Hover uses control surface; keyboard focus uses the shared 2px ring/2px separation and is distinguishable from selection. Reserve at least 4px scroll padding for ring extent, and reveal a focused tab with nearest scrolling so first/last labels and outlines are visible.

Retain the existing audit-log unresolved badge only when its supplied queue is present, using its supplied filtered `items.length`, right aligned in a small 12/18px badge. Do not introduce total counts, hidden-workspace denominators, guessed queue sizes or another fetch. Labels wrap while count stays readable. No badges for other categories without existing data/contracts.

## Selection, permission updates and inner-state limits

Keep one vertical Radix Tabs set for all visible categories, not three independent tabsets. Group labels are noninteractive and add no keyboard stops. Preserve vertical ArrowUp/Down, Home/End and existing activation behavior; Tab moves from selected category to its panel controls. Do not manually intercept document-editing keys. Only the active panel is exposed as current content; category switching replaces the right panel while modal/header/list remain mounted.

Normal opening starts at the existing first available personal category (`editor`); no new persisted last-category preference. Initial focus goes to the active category and the Dialog traps focus. Category activation keeps focus on its tab rather than unexpectedly jumping into an input. Existing child focus/leave contracts take priority.

If new supplied Viewer facts remove the selected category, immediately stop rendering its now-forbidden content and hidden tab. Follow the prior §1.5 intent: show a neutral inline notice that the setting is unavailable and allow an explicit continuation to the first remaining category in the same group, otherwise personal `editor`; selecting another allowed tab also acknowledges the change. Do not leave a blank stale selected ID, silently execute a hidden child or invent a server-side permission explanation. Move focus only if it belonged to removed content, to the notice/allowed continuation. Unaffected category updates must not steal focus or reset form drafts.

The older screen document describes server-calculated category requery on child 403/404, but the present AppShell contract supplies Viewer facts, not that category-list/refresh API. #61 must preserve the existing gate inputs and not add a new server endpoint, inspect arbitrary child errors or repurpose an empty data array as authorization. Missing permission-refresh/managed-workspace-selection wiring is a separately traced integration gap. The authoritative server still checks operations.

Settings shell itself does not fetch category bodies. Existing child states own loading/empty/error/retry and remain visible in the right region with stable modal geometry. Known theme-load state, for example, continues through PersonalSettings; no second global loading overlay is added. Do not treat default `[]`, undefined view data or an unimplemented placeholder as successful empty settings, and do not fabricate busy/errors to satisfy screenshots. Any missing child state remains its own issue. Verify representative real states plus deterministic shell stress fixtures without claiming a new global query contract.

### PAT and nested workflow boundary

No inner category feature is implemented by #61. Current TokenPanel owns a nested form/revealed/confirmation flow; IR-AUTH-003's inline PAT migration belongs #63. Do not expose plaintext to SettingsModal/global state, force-close a child on category change, flatten its controls or change its copy/revoke policy for layout convenience. Existing child Escape/outside-interaction blocking must continue to win. The pending parent close/category interception contract cannot be inferred by inspecting DOM or a generic string; if the added shell close control exposes an existing guard gap, report it and require a separately scoped child/parent handoff before claiming PAT-safe closure. No secret-bearing screenshot is needed for shell evidence; use a fixture token with redacted artifacts.

## Close, focus restoration and layer ownership

Use the shared #48 Dialog adapters for this instance so its portals own the correct overlay context; avoid a raw Radix settings portal that bypasses those wrappers. Do not nest the adapter's built-in Portal/Overlay inside a duplicate manual Portal/Overlay. Provide DialogTitle plus concise description such as `왼쪽에서 설정 항목을 선택하세요.` (visually hidden if redundant).

Close button, ordinary outside dismissal and topmost Escape follow the existing Dialog contract subject to active child leave/security guards. Do not add a blanket unsaved-settings confirmation or silently bypass existing ones. After normal close, restore focus to the original bottom-left gear if present; otherwise an existing logical shell target. Opening/closing must not alter underlying active document/body, save state or URL. The gear remains visible in #50's independent bottom row and is not duplicated inside the dialog.

Keep exact approved layers: page menu/popover 300 → settings overlay 400 → settings content 500 → settings-owned menu/popover 600 → risk overlay 700 → risk content 800 → risk-owned menu/popover 900. Only the owning dialog/alert promotes its child portal; no global selector raises every menu because settings is open. Escape closes only the topmost eligible layer; a menu closes without closing settings, and a risk dialog cancels without closing settings. Do not promote/replace feature-owned ordinary nested dialogs under #61; their migration is separate AC-5 work.

Light/dark/system changes propagate through existing root roles to modal/portals without remounting the shell, losing category selection or restarting child mutations. Normal text ≥4.5:1, large text ≥3:1, focus/active boundaries ≥3:1 against actual backgrounds; sidebar secondary uses its dedicated role. Preserve common readonly/disabled styles in child content instead of applying blanket opacity to the panel.

## Acceptance and independent evidence checklist

- [ ] TDD before changes: failing actual geometry/grouping/close/focus and permission-filter tests, using existing category identities and no implementation-mirroring class-only assertions.
- [ ] Actual bottom-left gear opens one settings modal without navigation, duplicate overlay, background document reset or shell-remount. Visible title/description/close and focus trap work; ordinary close restores the gear. No settings shell exists on pre-auth pages.
- [ ] Role matrix with real allowed sessions and equivalent Viewer fixtures: ordinary no-workspace user = 4; ordinary member with workspace = 5; non-superuser workspace admin = 8; superuser with workspace/admin scope = 14. Also test superuser with zero workspace/admin counts = 10 and superuser with workspace but zero admin count = 11 to reject invented gate bypasses. Forbidden labels/panels/headings are absent from DOM/accessibility, not merely CSS-hidden.
- [ ] Enumerate exact 14 labels/order/IDs under the fully authorized fixture, grouped personal/workspace/instance; no shared/version category or new item. `색인 대기열` remains distinct from instance-settings values and audit reconciliation. Badge contains only existing filtered queue count.
- [ ] 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200% = 12 environments. Verify real role/category paths plus shell stress content. Record border-box modal width/height against `min(1200,94vw)`/`min(820,90dvh)`, left width, right padding, independent scrollports, header/close coordinates and screenshots. At CSS viewport widths 899/900/901 confirm the exact breakpoint; percent width resolves within split body.
- [ ] Actual 200% uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, confirms `getZoom===2`, records pre/post CSS viewport/DPR. CSS zoom/transforms, deviceScaleFactor or half-sized viewport do not qualify. On 1280×720 at 200%, reach the 14th permitted category, right content's last input/action and header close by keyboard, with two columns still present.
- [ ] Independently scroll left to last category and right to last action; each other's scrollTop/header-close position stays unchanged. Long Korean category/section names and right content wrap; no clipped rings or viewport-wide horizontal growth. Any necessary child horizontal table scroll is local and does not hide close/categories.
- [ ] ArrowUp/Down, Home/End and Tab/Shift+Tab traverse the one vertical Tabs set and current panel. Focused first/middle/last tab is fully visible, selected and focus states remain distinct, selected content alone is current. Category changes preserve modal geometry and do not reset the document behind it.
- [ ] Supply revoked Viewer facts while open: forbidden tab/panel disappears, neutral notice and explicit allowed fallback behave without hidden child actions; unaffected selection survives. Real child-permission refresh gaps are reported separately rather than hidden by fixture-only PASS or new API wiring.
- [ ] Exercise existing representative child loading/error/retry/empty/read-only states and long-body action placement without implementing their features. Do not call placeholders empty successes. Inner-form/PAT migration and missing per-child state handoffs remain explicit exclusions.
- [ ] Settings-owned popover/menu, page-owned menu and an existing shared risk confirmation preserve #48 z-order/ownership, topmost Escape, cancel focus and return. A child PAT guard remains effective; no raw token copied into parent state, screenshot or log. If there is no callable close guard, report the exact separate wiring gap rather than bypass it.
- [ ] Native child input typing/IME is unaffected by category keyboard handling or newly scoped CSS. No inputs are introduced by the shell itself, so new field-validation/IME policy is N/A; affected existing child interactions retain their regression tests and native-IME evidence where applicable.
- [ ] Run existing settings-category/shell/shared-overlay/theme and affected child smoke tests plus a built-product modal check. Inspect computed light/dark contrast, focus extents and actual category geometry. Independent review checks original issue/SRS, final diff and red/green/browser evidence. #61 may prove IR-SHELL-008 AC-1/2 and shell portions of AC-4/6; do not mark inner AC-5/PAT or all category features complete.
