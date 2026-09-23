# Newspaper rollout implementation handoff

> 2026-09-23 [디자인 v2 결정](./design-v2.md)으로 대체되었다. 아래는 이전 결정의 기록이다.

Decision owner: Astra, acting under the user's explicit delegation on 2026-09-16. Implementation and independent verification owner: Sol medium. Target: `phase-1`. This is a supporting implementation reference; the requirement blocks in `docs/spec/*.srs.md` are the acceptance authority. Existing behavioral and permission contracts remain in force. No product implementation or verification is claimed here.

## Foundation release: issues 43 and 44

**Frozen for implementation, subject to independent core review.** Prerequisites: independent review of `IR-SHELL-006` AC-1, AC-3, AC-4, AC-7, AC-8 and `CON-ARCH-004`. Astra explicitly refines the implementation dependency: #43/#44 may start after the core contract review while the remaining #42 operational contracts are authored; #43/#44 may not close before #42 is independently verified. This is an implementation scheduling decision, not a waiver of the issue closure dependency.

Use the existing React 19, Vite 8, TypeScript and Radix application. Add Tailwind CSS **4.3.3** and `@tailwindcss/vite` **4.3.3** as exact pinned development dependencies. Add `class-variance-authority` **0.7.1**, `clsx` **2.1.1**, `tailwind-merge` **3.7.0** as exact pinned web dependencies. These versions and registry license metadata were read using `npm view` on 2026-09-16. Keep React/Vite/Radix on the existing lockfile versions. The shadcn CLI version observed is **4.21.0**; use its Radix source conventions, not a runtime dependency on the CLI. Adapt the small source components locally; do not scaffold a replacement app or run an unrestricted generator over existing source.

Follow the [official shadcn existing Vite setup](https://ui.shadcn.com/docs/installation/vite) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite): add the Vite plugin and a single CSS entry. Preserve existing CSS imports. Use explicit Tailwind layer imports if needed to avoid introducing Preflight resets over CodeMirror/KaTeX before their regression checks. Add `components.json` pointing at `src/components/ui`, `src/lib/utils`, and `src/styles/index.css`; keep existing relative `.js` source imports unless an alias is actually needed. No new router, form engine, table engine, icon/font package, or animation dependency is required.

Registry metadata reports MIT for Tailwind, its Vite plugin, clsx, tailwind-merge and shadcn, and Apache-2.0 for class-variance-authority. Sol must inspect the installed versions' LICENSE/NOTICE files and preserve required third-party notices in the distribution records. Registry labels alone are not the license review evidence. Do not invent CVEs or license notices.

File ownership for this slice: `packages/web/package.json`, root lockfile, `packages/web/vite.config.ts`, `packages/web/components.json`, `packages/web/src/styles/**` (excluding the dark theme map), `packages/web/src/components/ui/**`, `packages/web/src/lib/utils.ts`, and the single application stylesheet import. #43/#44 implement the light palette/tokens/map only. The dark columns below are decisions for #45 preview and #46 product integration; dark product CSS must wait for #45 independent preview/contrast verification. Later screen slices consume these exports instead of duplicating wrappers.

Final CSS order: palette, non-color tokens, light/dark role maps, shared base, component rules, shell, editor integration. #43/#44 load the light map only; #46 adds the approved dark map. All application colors pass through semantic custom properties. Scope base selectors so native browser elements inside third-party editor widgets retain their required layout.

### Palette and role map

| Semantic token | Light | Dark |
| --- | --- | --- |
| `--surface-app` | `#E9E7E2` | `#20221F` |
| `--surface-document` | `#F5F4EF` | `#292C27` |
| `--surface-sidebar` | `#DEDDD6` | `#1A1D19` |
| `--surface-control` | `#FAF9F5` | `#30352E` |
| `--text-primary` | `#242521` | `#E9E7DF` |
| `--text-secondary` | `#65665F` | `#B5B8AE` |
| `--text-sidebar-secondary` | `#5E5F58` | `#B5B8AE` |
| `--border-subtle` | `#CCCBC3` | `#484D44` |
| `--border-control` | `#7A7B71` | `#87917F` |
| `--action-primary` | `#365B70` | `#A8C4D3` |
| `--action-primary-hover` | `#2C4B5D` | `#BBD1DC` |
| `--action-primary-active` | `#233D4D` | `#CADBE3` |
| `--text-on-primary` | `#FAF9F5` | `#19231F` |
| `--surface-selected` | `#DFE7E9` | `#344650` |
| `--focus-ring` | `#365B70` | `#A8C4D3` |
| `--status-danger` | `#963F38` | `#F0ABA3` |
| `--surface-danger` | `#F3E5E1` | `#482C29` |
| `--status-warning` | `#79571F` | `#E2C084` |
| `--surface-warning` | `#F0E8D7` | `#423720` |
| `--status-success` | `#3E6049` | `#A8CFB0` |
| `--surface-success` | `#E4EAE2` | `#293D2E` |
| `--surface-disabled` | `#E3E2DB` | `#353A32` |
| `--text-disabled` | `#74766D` | `#939B8A` |
| `--overlay` | `rgb(36 37 33 / 38%)` | `rgb(0 0 0 / 60%)` |

Use status foreground on its status surface for notices; use status foreground as destructive button fill and `--surface-control` (light) / `--text-on-primary` (dark) as the text. Focus separation uses the surrounding opaque surface, never a transparent same-colored ring. Selected text uses `--text-primary`; links use `--action-primary` with underlines. Decorative borders are not the sole boundary of interactive controls. Disabled uses explicit tokens, not opacity on a whole row containing active actions.

shadcn mapping: background=surface-app, foreground=text-primary, card/popover=surface-control, primary=action-primary, primary-foreground=text-on-primary, accent=surface-selected, accent-foreground=text-primary, muted-foreground=text-secondary, border=border-subtle, input=border-control, ring=focus-ring. Its `accent` means selected surface here. Set a root `data-theme="light|dark"` and `color-scheme`; `system` is a stored preference resolved to one of those two rendered values.

### Shared component contract

Expose a small public barrel at `components/ui/index.ts`. Button accepts `variant` primary/secondary/ghost/destructive and `size` default/auth/icon; default HTML type is button unless the caller explicitly submits. Input/Textarea/Select preserve native props and ref; `Field` connects persistent label/help/error and does not own form state. Use native checkbox/radio/select semantics where already present; searchable PrincipalPicker keeps its shared search contract. `cn` combines clsx and tailwind-merge. Do not create unused component families merely to resemble a template.

Dialog/Popover/Menu adapters retain Radix focus and dismiss behavior. AlertDialog is the risk-confirmation surface. Table/Badge/InlineNotice/EmptyState/LoadingState expose presentation only and leave authorization, fetch policy and operations with screen owners. Add wrappers as their implementation issues arrive.

Geometry: control min-height 36px, auth 40px, icon target 36×36px, input/button radius 4px, overlay radius 6px, badge radius 3px; spacing 4/8/12/16/24/32/48px; label 13/20, body UI 14/22, help/error 12/18; field gap 20px and section gap 32px. No external fonts. Sans: `"Malgun Gothic", system-ui, sans-serif`; serif: `Batang, Georgia, serif`; mono: `Consolas, monospace`. Use rem-compatible text sizing and natural multiline heights.

### Test and review contract

Write failing behavior/computed-style tests first. A source-text test seeing a class or import is insufficient. Check a real primary button, input, selected row and portal in light for #43/#44, then both themes for #46, including a built production bundle. Independent Sol review checks the actual dependency graph, notices, CSS layer effects and light palette preservation.

Run from repository root: `npm run typecheck`; `npm run build --workspace @doculight/web`. Run from `packages/web`: `npx vitest run` and `npm run test:browser:styles`. Run editor regression from `packages/editor`: `npx vitest run`. Browser checks requiring a running fixture must record the server/fixture and command; do not report them passed merely because the script exists. Final gate later includes `npm run test:browser:all` from web and all editor browser scripts.

## Resolved UX decisions

The following rows are navigation to the SRS, not a replacement for its AC text.

| Topic | Decision | SRS |
| --- | --- | --- |
| Theme first paint | OS theme before authentication; DB wins after identity/settings resolution. Cache only in current-tab memory keyed by authenticated user; clear on logout, session loss or user switch. No persistent anonymous previous-user theme hint. | IR-SHELL-007 AC-1..5 |
| 200% settings | Keep two columns; independently scroll menu and body. Fixed outer title/close row, reachable actions. Menu becomes min(260px,32%) below 900 CSS px. | IR-SHELL-008 AC-1..3 |
| PAT nesting | List → issue form → one-time secret → discard confirmation are stages in the settings body. Escape/outside cannot dismiss revealed secret. Intercept category/close intent until explicit discard or successful copy. | IR-AUTH-003 AC-1..5 |
| Overlays | Ordinary child forms replace the settings body; risk confirmation may overlay it. Topmost Escape only, focus restore, menu height constraints. | IR-SHELL-008 AC-4..6 |
| Dark approval | Exact palette above approved by Astra under explicit user delegation; it is no longer awaiting a separate user palette decision. Sol creates and independently checks a same-composition comparison preview before closing #45. | IR-SHELL-006 AC-2, AC-7, AC-8 |
| Desktop scope | Preserve existing three functional panels, no new TOC/properties/mobile/Phase 2 features. | IR-SHELL-009 AC-1..3 |

## Dark comparison artifact assignment: issue 45

Sol authors `docs/decision/newspaper-theme-dark.html` by reusing the approved light preview composition, typography and content, applying the exact dark tokens above. Preserve `newspaper-theme.html` byte-for-byte. Add a companion state panel in the dark artifact (or separate same-directory comparison page) showing primary/secondary/destructive controls, focus, selected, disabled, readonly, invalid, loading, empty and error; include code, table, inline math-style content, tags and a diagram-style specimen. Mark those static specimens as visual examples, not functional implementation evidence.

The resulting dark comparison must be inspected independently against the original light composition at 1280×720, 1440×900, 1920×1080 and 200%. Measure actual foreground/background pairs: normal text ≥4.5:1, large text ≥3:1, control boundary/state indicator ≥3:1. Record numerical results and screenshots, including hover and focus. Palette approval is decided; product compliance and contrast evidence remain pending until the independent check. If an actual contrast failure requires a token adjustment, route the exact pair to Astra, then amend the SRS through MCP before product adoption.

## Operational connection contracts

`IR-WORKSPACE-001` owns #72/#73. Preserve `GET /workspaces`' existing visible-list response for its existing callers. Add explicit `scope=managed|all` only if needed: managed is server-filtered current management permission, all is superuser-only. Keep the response `{id,name,adminless}`. Settings workspace selection feeds the existing workspace/audit/ACL panels by stable ID; do not infer management permission from mere visibility. Wire the existing creation service through a typed client adapter; do not duplicate server creation or ACL rules. Name/administrator/default-group fields and one L2 confirmation are mandatory. Reuse existing grant operations for administrator assignment. No archive/restore work belongs here.

Workspace rename is a **separate display-name operation**, never the node/path rename service. Add `PATCH /api/workspaces/:id` with JSON `{name:string}` and a dedicated application service that rechecks current workspace management permission (including superuser), updates `WorkspaceRepository.rename(id,name)` and rewrites `.workspace.json` through the workspace-files port. The actual domain field is `Workspace.name`; do not introduce a second `displayName` column. Keep `id`, `createdAt`, hash directory, node paths, attachments, backup paths and URLs unchanged. Return `{workspace:{id,name,createdAt},sidecarSync:"synced"|"pending"}`. DB write failure is an ordinary unsuccessful API result with no displayed success; if the DB commit succeeds and the sidecar write fails, return the committed name with `pending` and a persistent UI warning. The next DB-authoritative sidecar reconciliation repairs the copy. Serialize same-workspace rename/sidecar writes or compare the latest DB value so an older write cannot finish over a newer name. Do not roll back the DB from the stale reconstruction copy.

Display-name validation is shared by create and rename: NFC-normalize, trim both ends, then require 1–120 Unicode code points; reject U+0000–U+001F and U+007F with a field-specific validation error. Do not apply Windows filename reservations, path punctuation or node path limits. Duplicate display names are permitted and stable IDs disambiguate them; global duplicate rejection would reveal names outside a workspace administrator's visibility. This explicit delegated decision resolves the former provisional Q15 duplicate-rejection suggestion. UI labels/selectors must identify duplicate visible names by a short stable ID where necessary. Test authorization loss, invalid names, duplicate names, physical-path invariance, DB/sidecar failure and reconciliation; this is server behavior work under `IR-WORKSPACE-001` AC-3, AC-6, AC-7 and `DR-WORKSPACE-001`/`002`.

`IR-PRINCIPAL-001` owns #74. UserRoster and BulkRevokePanel both open the one OffboardingCard in the settings body, using the existing principal offboarding API. Pass the selected user ID through ACL handoff; refresh the card after confirmed mutation. Group selection has no offboarding action. A workspace administrator may reach the ACL portion only within existing authority; superuser-only account and membership mutations remain hidden and server-guarded.

`FR-STORAGE-010` owns #75's necessary bounded feature work. R157 requires a real asynchronous **text** index; current `app/document/search-service.ts` scans files, so a fabricated empty queue or a `direct-scan` explanation cannot close #75. Implement a durable SQLite node-keyed text-index job table and text projection behind a small repository port, a single worker, and typed read-only `GET /api/index-queue` endpoint. Public client prefix conventions must match the existing API helper. Return `{counts:{pending,running,failed}, total, limit:100, items:[{nodeId,name,workspaceName,status,requestedAt,errorCode?}]}`. `errorCode` is a safe finite classification such as `read_failed`, `parse_failed`, `index_failed`; omit stack/path/body details. Sort by request time then node ID. Zero is derived from actual queue state.

Queue requests coalesce by stable node ID and revision/generation; worker completion uses a compare-with-current-generation guard. Recover running jobs at boot and enqueue missing/stale existing text records. Invalidate projections and pending work when nodes disappear. Keep vector lifecycle synchronous, preserve current AND/OR/Korean matching and query-time ACL filtering, and keep names/attachment names from current metadata. No new ranking engine, external service, automatic polling, or operator retry/cancel/rebuild controls. Worker runs after save acknowledgment, with tests able to pause it deterministically. This slice needs server migration/repository/worker/search tests in addition to the visual panel tests; it is not CSS-only.

## Issue to requirement and acceptance mapping

All new requirements below are `phase-1`, `planned`, `stable` at authoring. Existing source requirements retain their status and stability. `IR-SHELL-006` AC-4..10 supplies shared control/state/accessibility checks to every applicable screen; `IR-SHELL-008` supplies overlay checks where the issue uses a dialog/menu. A row's listed ACs are its concrete design delta; base IDs retain their complete existing behavioral contracts.

| Issue | Design/connection ACs | Existing behavior anchors |
| --- | --- | --- |
| #42 | IR-SHELL-006 AC-1..10; IR-SHELL-007 AC-1..5; IR-SHELL-008 AC-1..6; IR-SHELL-009 AC-1..6; IR-AUTH-003 AC-1..5; IR-EDITOR-002 AC-1..5; IR-WORKSPACE-001 AC-1..7; IR-PRINCIPAL-001 AC-1..5; FR-STORAGE-010 AC-1..7 | All issue rows below; document completion requires independent review, not runtime AC checks |
| #43 | IR-SHELL-006 AC-3, AC-4, AC-7 | CON-ARCH-004 |
| #44 | IR-SHELL-006 AC-1, AC-3, AC-8 | CON-ARCH-004; IR-EDITOR-001 |
| #45 | IR-SHELL-006 AC-2, AC-7, AC-8, AC-10 | IR-SHELL-004; delegated decision plus preview evidence |
| #46 | IR-SHELL-007 AC-1..5; IR-SHELL-006 AC-2, AC-3 | IR-SHELL-004; DR-SHELL-002 |
| #47 | IR-SHELL-006 AC-4..8 | CON-ARCH-004; IR-SHELL-004 |
| #48 | IR-SHELL-008 AC-3..6; IR-SHELL-006 AC-7, AC-8 | IR-SHELL-001; FR-CONFIRM-001, FR-CONFIRM-004, FR-CONFIRM-005 |
| #49 | IR-SHELL-006 AC-7..9 | CON-ARCH-004; IR-SHELL-002 |
| #50 | IR-SHELL-009 AC-1, AC-2 | IR-SHELL-003; FR-SHELL-005 |
| #51 | IR-SHELL-009 AC-3; IR-SHELL-006 AC-5..8 | FR-SHELL-001, FR-SHELL-003, FR-SHELL-015, FR-SHELL-016 |
| #52 | IR-SHELL-009 AC-3; IR-SHELL-006 AC-5, AC-7..9 | FR-SHELL-013, FR-SHELL-014 |
| #53 | IR-SHELL-009 AC-3; IR-SHELL-006 AC-7..9 | FR-SHELL-004, FR-SHELL-009, FR-SHELL-010 |
| #54 | IR-EDITOR-002 AC-1, AC-2, AC-5 | IR-EDITOR-001; FR-EDITOR-003, FR-EDITOR-007, FR-EDITOR-009 |
| #55 | IR-EDITOR-002 AC-3..5 | IR-EDITOR-001; FR-EDITOR-007, FR-EDITOR-010 |
| #56 | IR-SHELL-009 AC-6; IR-EDITOR-002 AC-2, AC-4 | IR-STORAGE-001 |
| #57 | IR-SHELL-009 AC-5, AC-6; IR-EDITOR-002 AC-4, AC-5 | FR-EDITOR-008, FR-EDITOR-005, FR-SHELL-012 |
| #58 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-5, AC-7..9 | FR-ATTACH-003; FR-SHELL-008 |
| #59 | IR-SHELL-009 AC-4; IR-SHELL-006 AC-4..8 | IR-AUTH-001 |
| #60 | IR-SHELL-009 AC-4; IR-SHELL-008 AC-4..6 | IR-AUTH-001; FR-CONFIRM-019 |
| #61 | IR-SHELL-008 AC-1, AC-2, AC-4, AC-5 | IR-SHELL-001, IR-SHELL-002 |
| #62 | IR-SHELL-007 AC-1..5; IR-SHELL-006 AC-5, AC-7 | IR-SHELL-004; DR-SHELL-002; SEC-AUTH-018 |
| #63 | IR-AUTH-003 AC-1..5; IR-SHELL-008 AC-5 | SEC-AUTH-006, SEC-AUTH-007, FR-CONFIRM-006 |
| #64 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-7..9 | IR-SHELL-002; FR-SHELL-007; SEC-SHELL-001; SEC-STORAGE-002 |
| #65 | IR-SHELL-009 AC-6; IR-SHELL-008 AC-3..6 | IR-ACL-001, IR-ACL-002, IR-ACL-003 |
| #66 | IR-SHELL-009 AC-6; IR-SHELL-008 AC-3..6 | FR-SHELL-015; FR-ACL-006; FR-CONFIRM-016, FR-CONFIRM-017 |
| #67 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-5, AC-7..9 | IR-SHELL-002; FR-PRINCIPAL-009; FR-AUTH-003, FR-AUTH-002 |
| #68 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-5, AC-7..9 | FR-PRINCIPAL-001; CON-PRINCIPAL-002 |
| #69 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-7..9 | FR-ACL-003, FR-ACL-004, FR-ACL-005; IR-SHELL-002 |
| #70 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-7..9 | IR-AUDIT-001, IR-AUDIT-002, IR-AUDIT-003, IR-AUDIT-004 |
| #71 | IR-SHELL-009 AC-6; IR-SHELL-006 AC-5, AC-7 | IR-SHELL-002; DR-SHELL-001; FR-CONFIRM-007 |
| #72 | IR-WORKSPACE-001 AC-1..3, AC-6, AC-7 | IR-SHELL-002; FR-PRINCIPAL-006; DR-WORKSPACE-001, DR-WORKSPACE-002 |
| #73 | IR-WORKSPACE-001 AC-4..6 | IR-SHELL-002; FR-CONFIRM-019; FR-PRINCIPAL-007 |
| #74 | IR-PRINCIPAL-001 AC-1..5 | FR-PRINCIPAL-003; CON-PRINCIPAL-004; FR-CONFIRM-023 |
| #75 | FR-STORAGE-010 AC-1..7; IR-SHELL-006 AC-7..9 | IR-SHELL-002; FR-SHELL-013; SEC-WORKSPACE-004 |
| #76 | IR-SHELL-009 AC-5; IR-SHELL-006 AC-7..9 | IR-AUTH-001; IR-SHELL-002; FR-AUTH-005; FR-EDITOR-005 |
| #77 | IR-SHELL-006 AC-10; IR-EDITOR-002 AC-5 plus evidence for every applicable row | CON-ARCH-004; IR-SHELL-002; IR-EDITOR-001 |

## Disposition of former open design questions

| Question | Disposition | Implementation boundary |
| --- | --- | --- |
| Dark exact palette/approval | Decided under user delegation; preview and independent contrast review still pending | #45 then #46; #43/#44 light-only |
| Scrolling all 14 settings at 200% | Both columns independently scroll; close header always reachable | IR-SHELL-008; desktop zoom, no mobile feature |
| PAT nested modal | Inline stages with parent close/category interception | IR-AUTH-003; retain secret-protection guarantees |
| Theme cache and logout | Current-tab identity-keyed memory only, anonymous system first paint, DB authoritative | IR-SHELL-007; no cross-user hint |
| Workspace placeholders | Real management-filtered/all lists, selection and existing mutation services | IR-WORKSPACE-001; no Phase 2 archive/restore |
| Offboarding disconnected card | Both existing source screens connect the same card and principal ID | IR-PRINCIPAL-001; no new role or category |
| Index queue lacks engine/API | Implement bounded real async text job/projection and read-only superuser surface | FR-STORAGE-010; separate from vector and reconciliation |
| Mockup TOC/properties/mobile | Visual examples only, excluded from Phase 1 implementation | Existing shell/desktop scope remains authoritative |
| Font download, animation, extra settings | None introduced | System fonts, existing three personal settings and five instance settings |

Independent review must check SRS links, exact AC positions, scope gates and this mapping before #42 closes. No new AC is checked at authoring and no previous implementation evidence is reused as proof of the new design.
