# Issue #50 independent review

Review date: 2026-09-17 KST

Reviewer role: independent Sol reviewer

Requirements: `IR-SHELL-009` AC-1/AC-2, `IR-SHELL-003`, `FR-SHELL-005`

Decision source: `docs/decision/newspaper-implementation-handoff.md` and Astra's binding geometry

## Final verdict

**PASS — no Critical, High, Medium, or Low findings remain.**

The initial review found one Medium product defect and one Low evidence defect. A separate fixer addressed both. The second independent review reproduced the corrected keyboard behavior, audited the repaired TDD chronology, reran the complete shell Playwright matrix including genuine browser zoom, and ran proportional regressions. No product, test, scope, or evidence defect remains.

## Reviewed scope

The review covered the full uncommitted diff against `HEAD`, GitHub issue #50, `AGENTS.md`, `docs/spec/00.index.md`, the newspaper implementation handoff, and the complete contracts for `IR-SHELL-009` AC-1/AC-2, `IR-SHELL-003`, and `FR-SHELL-005`.

The final implementation keeps the authenticated desktop shell within the bound scope:

- Three columns fill the viewport.
- Widths are 280px/remainder/320px at 1080 CSS px and above.
- Between 600px and 1080px, widths follow `180 + 100t`, `240 + 240t`, and `180 + 140t`, where `t = (W - 600) / 480`.
- Below 600px, widths remain 180px/240px/180px and the shell scrolls horizontally.
- The document tab row is at least 48px, the header is at least 52px, and content receives the remaining height.
- Settings is an independent 52px bottom row inside the left sidebar, with 8px padding and a 36px target. It is not viewport-fixed.
- Existing left and right tab sets, permissions, document behavior, settings categories, and editor typography remain unchanged.
- No JavaScript zoom detection, resize/collapse state, persistence, mobile layout, new outline/properties panel, or Phase 2 screen expansion was introduced.

The settings modal was moved as one unchanged prop bundle from the center column to the left sidebar footer. Static inspection of `App.tsx` and `AppShell.tsx` found no dropped permission, data, or action prop.

## Initial findings

### Medium — focused narrow sidebar tabs remained clipped

At 500×720, Playwright focused the first tab and pressed `End`.

- Left tab row: focus moved to `즐겨찾기`, but `scrollLeft` remained `0`; the list ended at `179px` while the focused tab ended at `185.03125px`.
- Right tab row: focus moved to `태그`, but `scrollLeft` remained `0`; the list ended at `500px` while the focused tab ended at `519.359375px`.

The tab rows had `overflow-x:auto`, but sidebar triggers lacked the focused-tab reveal used by document tabs. This violated the bound focused-tab reveal behavior and left keyboard focus partially outside the visible row.

The separate fix added only this handler to every sidebar trigger:

```tsx
onFocus={(event) =>
  event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
```

No Radix selection or keyboard implementation was replaced.

### Low — final browser-checker chronology was not initially fully auditable

The initial evidence established that unit tests and the first browser checker existed before product edits, but the final Playwright checker had been modified after implementation. The original `red-vitest.txt` and `red-playwright.txt` were manually transcribed summaries rather than raw command output. That made the complete final checker revision impossible to prove as strictly test-first from the original evidence alone.

No existing unit test was deleted or weakened: the two tracked unit-test diffs only added one test each.

## TDD remediation audit

The remediation is accepted.

The audit in `tdd-chronology.md` distinguishes assertions that existed before product edits, pre-existing behavior tests, green-only repetitions, and behaviors that required a remove→RED→minimal reimplementation cycle. It does not mislabel the original summary files as raw output.

The following raw cycles were inspected:

| Behavior | RED evidence | Implementation order | GREEN evidence |
|---|---|---|---|
| Sidebar keyboard focus reveal | `red-sidebar-keyboard-raw.txt` reports the real clipped tab at `115.703125..185.03125` against list `0..179`. | The raw RED timestamp precedes the final `AppShell.tsx` focus handler by four seconds. The implementation is one `onFocus` handler. | `green-sidebar-keyboard-raw.txt` passes the complete shell checker. |
| Sidebar horizontal overflow | `red-sidebar-overflow-retro-raw.txt` fails with a clipped focused tab after the affected declaration was removed. | The final `shell.css` timestamp follows the raw RED. The reimplementation is the single `overflow-x:auto` declaration. | Final shell Playwright passes. |
| Semantic surface separation | `red-surface-retro-raw.txt` reports both compared surfaces as `rgba(0, 0, 0, 0)` after the affected backgrounds were removed. | The final `shell.css` timestamp follows the raw RED. The semantic background declarations were minimally reintroduced. | Final computed surfaces differ in both themes. |

The current checker retains the same substantive assertions that produced these failures. It was not weakened to obtain GREEN. The computed RED states show that the affected behavior was absent, rather than merely concealed behind a passing fixture. The current diff contains the minimal production behavior needed by those checks.

Other final checker behavior maps to tests that existed before the corresponding product change or to pre-existing regression tests. Late additions for dark repetition, tab order, and settings portal behavior add browser confirmation without introducing corresponding product behavior. Genuine 200% zoom used the extension path that existed before product edits; the expected width calculation was corrected to the already-bound continuous formula.

## Playwright verification

All browser verification used Playwright. No CSS `zoom`, manual DPR change, half-sized viewport substitution, or CDP device emulation was used.

### Viewport and theme matrix

The shipped checker passed light and dark at 1280×720, 1440×900, 1920×1080, 840×720, and 500×720. An independent Playwright probe additionally checked the exact 600px and 1080px boundaries.

| CSS viewport | Expected columns | Measured columns | Shell client/scroll width | Result |
|---|---:|---:|---:|---|
| 500×720 | 180/240/180 | 180/240/180 | 500/600 | PASS |
| 600×720 | 180/240/180 | 180/240/180 | 600/600 | PASS |
| 840×720 | 230/360/250 | 230/360/250 | 840/840 | PASS |
| 1080×720 | 280/480/320 | 280/480/320 | 1080/1080 | PASS |
| 1280×720 | 280/680/320 | 280/680/320 | 1280/1280 | PASS |
| 1440×900 | 280/840/320 | 280/840/320 | 1440/1440 | PASS |
| 1920×1080 | 280/1320/320 | 280/1320/320 | 1920/1920 | PASS |

The persisted shipped measurements show a 49px document tab row. Header heights were 52–53px on wide viewports, 75px at 840px, and 119px at 500px because the full breadcrumb and status wrap rather than clip. The settings row remained exactly 52px in every recorded light and dark case.

The independent stress probe replaced the breadcrumb and status text with long Korean strings. The breadcrumb retained the exact full path, stayed capped at three 20px lines, overflowed vertically, and changed `scrollTop` after keyboard `End`/`PageDown`. The long status wrapped, and the save status and 36px menu remained visible and inside the header.

### Genuine 200% browser zoom

The shipped checker launched an isolated persistent headed Chromium profile with a temporary extension and called `chrome.tabs.setZoom(tabId, 2)`. `chrome.tabs.getZoom()` returned exactly `2`.

Measured effective viewport and geometry:

- CSS viewport: 720×407.
- Columns: 205px/300px/215px, matching the continuous formula.
- Document tab row: 56.4000015px.
- Header: 118.8000031px.
- Breadcrumb: 60px high with `overflow-y:auto` and 20px line height.
- Settings row: 52px.
- Document menu target: 36px.

### Sidebar keyboard retest

An independent Playwright probe ran at 500×720 in both light and dark. For each left and right sidebar it verified:

- `role=tablist` retained horizontal Radix orientation.
- Labels and order remained `문서 트리`, `검색`, `즐겨찾기` and `백링크`, `아웃고잉 링크`, `태그`.
- `End` focused and fully revealed the last tab with positive `scrollLeft`.
- `Home` focused and fully revealed the first tab and returned `scrollLeft` to `0`.
- Two `ArrowRight` presses reached and revealed the last tab.
- Two `ArrowLeft` presses returned to and revealed the first tab.
- Exactly one tab had `aria-selected=true`, and the focused tab retained the Radix roving `tabindex=0` behavior.

All four theme/sidebar combinations passed.

## Commands and results

| Command | Result |
|---|---|
| `npm run test:browser:shell` in `packages/web` | PASS; full light/dark matrix plus persistent-extension 200% zoom |
| Independent Playwright 500×720 sidebar keyboard probe | PASS; light/dark, left/right, End/Home/arrows, visibility, scroll offsets, Radix semantics |
| Independent Playwright boundary and long-text probe | PASS; 500/600/840/1080/1280/1440/1920, light/dark |
| `npx vitest run test/shell.test.tsx test/document-tabs.test.tsx` | 2 files, 31 tests passed |
| `npx vitest run` in `packages/web` | 63 files, 693 tests passed |
| `npx vitest run` in `packages/editor` | 21 files, 253 passed, 1 skipped |
| Shared newspaper component Vitest selection | 3 files, 13 tests passed |
| `npm run typecheck` at repository root | editor, server, and web passed |
| `npm run build --workspace @doculight/web` | PASS; 2980 modules transformed |
| `npm run test:browser:theme` | PASS; 0 failed assertions |

The build emitted its existing large-chunk advisory but completed successfully.

## Authenticated product limitation

`npm run test:browser:styles` could not launch its authenticated browser scenario because `DOCULIGHT_E2E_USER` and `DOCULIGHT_E2E_PASS` were not supplied and the paired API environment was not running. No credentials were inferred or printed.

The shell fixture renders the real `AppShell`, `DocumentArea`, production theme CSS, and shell CSS, so it exercises the changed product components and computed layout. It bypasses `App`'s authenticated API loading and live permission data. Static inspection confirmed that `App` still supplies the same viewer, workspace, settings, roster, ACL, audit, queue, logout, password, and mutation props, but this static check is not a substitute for an authenticated end-to-end run.

This environment limitation does not change the final PASS because the changed behavior is shell layout and focus reveal, the real product components were exercised in Playwright, permission wiring was unchanged, and the unavailable authenticated check was reported rather than represented as passing.
