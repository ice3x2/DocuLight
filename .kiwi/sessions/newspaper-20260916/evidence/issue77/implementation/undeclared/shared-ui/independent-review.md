# Independent review — shared UI issues #47, #48, and #49

Review date: 2026-09-17 (Asia/Seoul)
Reviewer: independent Sol reviewer
Acceptance authority: `IR-SHELL-006` AC-4..9, `IR-SHELL-008` AC-3..6, and the existing confirmation contracts referenced by the issue handoff
Reviewed state: the complete uncommitted worktree diff against `HEAD`, followed by a second review after remediation of the two High findings below

## Final disposition

**PASS — no remaining Critical, High, Medium, or Low findings.**

The implementation satisfies the scoped acceptance criteria for #47, #48, and #49. The change remains confined to common UI components and styles, `ConfirmGate`, the existing search-selection integration, dependency attribution/build wiring, tests, fixtures, and evidence. It does not broadly migrate product screens or alter business authorization, persistence, L1/L2/L3, PAT, editor, or server policy.

## Initial independent-review findings

The first review rejected the initial implementation with two High findings.

### High 1 — `AlertDialogCancel` did not consume the shared button contract

The alert cancel control rendered with browser-native button presentation instead of the shared secondary-button contract. The raw Playwright RED result in `review-high-red-browser-final.log` measured:

- radius `0px` instead of `4px`;
- font size `13.3333px` instead of `14px`;
- light background/text `rgb(240, 240, 240)` / `rgb(0, 0, 0)` instead of `rgb(250, 249, 245)` / `rgb(36, 37, 33)`;
- no visible focus outline (`outline-style: none`);
- dark background/text `rgb(107, 107, 107)` / `rgb(255, 255, 255)` instead of `rgb(48, 53, 46)` / `rgb(233, 231, 223)`.

This violated `IR-SHELL-006` AC-4 and AC-7 and the issue requirement that cancel receive initial, visibly indicated focus.

### High 2 — blanket portal promotion violated the fixed overlay stack

The original CSS promoted a pre-existing page popover to `z-index: 900` whenever an alert existed in the body. The alert content was `800`, so a page-owned portal was visually above the confirmation. The implementation inferred ownership from global DOM state rather than from the component tree and could not distinguish page-, dialog-, and alert-owned portals. The raw RED result measured the page popover at `900` over alert content at `800`; ownership attributes were absent.

This violated `IR-SHELL-008` AC-6 and Astra's fixed layering contract:

| Surface | Required z-index |
| --- | ---: |
| Page-owned popover/menu | 300 |
| Dialog overlay | 400 |
| Dialog content | 500 |
| Dialog-owned popover/menu | 600 |
| Alert overlay | 700 |
| Alert content | 800 |
| Alert-owned popover/menu | 900 |

## Remediation review

### Cancel presentation and focus

`AlertDialogCancel` now emits the shared button slot, secondary variant, default size, and shared button classes. Independent Chromium measurements after the fix were:

| Property | Light | Dark |
| --- | --- | --- |
| Height | `36px` | `36px` |
| Radius | `4px` | `4px` |
| Font | `14px`, weight `400` | `14px`, weight `400` |
| Background | `rgb(250, 249, 245)` | `rgb(48, 53, 46)` |
| Text | `rgb(36, 37, 33)` | `rgb(233, 231, 223)` |
| Focus | solid `2px`, offset `2px` | solid `2px`, offset `2px`, `rgb(168, 196, 211)` |

Cancel received initial focus when the alert opened.

### Explicit overlay ownership

Ownership is carried by a small React context whose default is `{ kind: 'page' }`. `DialogContent` and `AlertDialogContent` create distinct owner IDs. Each provider wraps only the content's React children, so a descendant popover/menu retains its logical owner after Radix portals the surface to `body`. Popover and menu content copy the exact owner kind and ID to their portal nodes.

Inspection found:

- no `body:has(...)` blanket promotion;
- no `querySelector`, `closest`, `MutationObserver`, or other DOM ownership inference;
- no module-global, `window`, `document`, or external-store ownership state;
- fixed ownership attributes are applied after caller props on portal content, preventing caller props from forging the owner;
- provider placement is inside `DialogPrimitive.Content` / `AlertDialogPrimitive.Content` and wraps content children only.

Independent Playwright measurements confirmed the complete `300/400/500/600/700/800/900` contract. Dialog content and its child portal reported owner kind `dialog` and the same owner ID. Alert content and its child portal reported owner kind `alert` and the same, separate owner ID. A live nested-alert probe measured the actual parent dialog at `z-index: 500`, `pointer-events: none`, alert overlay at `700`, and alert content at `800`; hit testing reached alert content rather than the parent dialog. The page popover remained at `300` and noninteractive. The alert-owned portal at `900` remained operable.

### Dismissal and restoration sequence

The live browser sequence passed:

1. Outside interaction did not dismiss the alert.
2. The first Escape closed only the alert-owned popover and restored focus to its trigger.
3. The second Escape closed the alert, restored focus to the logical confirmation trigger in the parent dialog, and left zero alert-child portals.
4. The third Escape closed the parent dialog and restored focus to its page trigger.

Radix supplied the actual `dialog`/`alertdialog`, title, description, focus trap, dismissal, and portal semantics; the wrappers preserved those roles.

## Per-issue acceptance evidence

### #47 — shared inputs, buttons, and selection controls

**PASS.** Independent checks covered:

- input height `38px`, standard button/select/loading height `36px`, `4px` input/button radius;
- label `13/20px`, input `14/22px`, help/error `12/18px`, field gap `20px`, section gap `32px`;
- visible separated keyboard focus;
- invalid state through `aria-invalid`, linked help/error text, and a non-color error marker;
- readonly text selection and a separately recognizable disabled state;
- loading geometry retention, `aria-busy`, disabled repeat activation, and a visible spinner;
- native checkbox/radio inputs retaining names, checked state, refs, keyboard behavior, and native indicators within `36px` targets;
- search-selection keyboard behavior and IME composition Enter not submitting or confirming a selection.

The foundation browser check passed at `1280x720`, `1440x900`, and `1920x1080`. Long Korean help and selected text wrapped without horizontal clipping. The relevant foundation and theme tests were not edited or weakened.

### #48 — dialogs, popovers, menus, and risk confirmation

**PASS.** Independent checks covered:

- exact `@radix-ui/react-alert-dialog` usage and preserved Radix roles;
- associated title and description;
- dialog width at most `560px`, at least `24px` viewport margins, `24px` internal padding, and `6px` radius;
- menu height constrained to the viewport with internal scrolling;
- cancel initial focus and visible focus presentation in light and dark;
- outside-click blocking, nested/topmost Escape behavior, focus restoration, and child portal cleanup;
- explicit owner identity and Astra's complete fixed z-index contract;
- controlled async confirmation ownership: pending confirmation did not close early and did not invoke cancel;
- L1 immediate execution, L2 confirmation, L3 exact token gating, incorrect-token blocking, open-time revalidation, changed-value lock, refreshed L3 token, and delayed-effect disclosure;
- existing PAT and confirmation security behavior through the full web regression suite; no business-policy code was broadened.

### #49 — tables, lists, badges, and common states

**PASS.** Computed browser measurements showed row heights `56.5px`, `105px`, and `57px`, all above the `40px` minimum. Numeric content aligned right. The long Korean path wrapped with `overflow-wrap: anywhere`, remained unclipped, and its complete value was keyboard reachable. The selected row used a `3px` edge marker in addition to color. Badges combined text, border, and surface presentation. Loading, empty, and error/notice states had distinct semantics and visible presentation.

## Playwright and genuine zoom compliance

All browser verification used Playwright Chromium. The normal matrix used actual Chromium pages at:

- `1280x720`;
- `1440x900`;
- `1920x1080`.

The 200% check used `chromium.launchPersistentContext` with a newly created isolated temporary profile and only the repository test extension loaded. The extension called `chrome.tabs.setZoom(tabId, 2)`.

Measured zoom evidence:

| Measurement | Baseline | 200% |
| --- | ---: | ---: |
| `innerWidth` | 1427 | 713 |
| `innerHeight` | 807 | 403 |
| root computed CSS `zoom` | `1` | `1` |
| `visualViewport.scale` | `1` | `1` |
| width ratio | — | `2.0014025245441793` |
| height ratio | — | `2.002481389578164` |

The run explicitly recorded `usedCssZoom: false` and `usedCdpEmulation: false`. It did not use CSS zoom, manual DPR changes, half-sized viewport substitution, device emulation, or CDP emulation. At genuine 200% zoom the overlay remained reachable without horizontal overflow: width `560px`, height `157.60000610351562px`, left/right space `76.80000305175781px` / `76.19999694824219px`, and top/bottom space `123px` / `122.39999389648438px`. The same run also exercised #47 controls, IME separation, #49 row/path behavior, and the three required normal viewport sizes.

## Dependency, license, and production distribution

`packages/web/package.json` pins `@radix-ui/react-alert-dialog` exactly to `1.1.23`. `npm ls @radix-ui/react-alert-dialog --workspace @doculight/web --json` resolved exactly `1.1.23` from the npm tarball. The root lock records the same version and resolution.

`packages/web/THIRD_PARTY_NOTICES.md` includes `@radix-ui/react-alert-dialog@1.1.23 | MIT`. A successful production build emitted `packages/web/dist/licenses/@radix-ui/react-alert-dialog/LICENSE` (1063 bytes), confirming that attribution ships in the distributable output.

## TDD chronology and regression results

The raw evidence establishes substantive RED before implementation GREEN:

| Scope | RED evidence | GREEN evidence |
| --- | --- | --- |
| #47 | `47-red-vitest.log` at 01:11:34; `47-red-browser.log` at 01:12:40 | `47-green-vitest.log` and `47-green-browser.log` at 01:13:10 |
| #49 | `49-red-vitest.log` at 01:13:44; `49-red-browser.log` at 01:15:19 | `49-green-vitest.log` and `49-green-browser.log` at 01:16:09 |
| #48 | `48-red-vitest.log` at 01:17:11; license RED at 01:17:43; adapter RED at 01:18:11; browser RED at 01:22:30 | `48-green-vitest.log` and `48-green-browser.log` at 01:23:34 |
| Search-picker IME | `47-red-picker-ime.log` at 01:24:23 | `47-green-picker-ime.log` at 01:24:35 |
| Review fixes | `review-high-red-browser.log` at 02:06:44 and corrected final RED at 02:07:21 | first GREEN at 02:08:15; final browser GREEN at 02:12:21 |

The initial #47 failures were missing native-selection exports/loading semantics and failing computed geometry/focus. The #49 failures were missing shared exports and failing row/alignment/wrapping/state presentation. The #48 failures were missing Radix adapters, missing production licensing, incorrect L1/async/focus behavior, and failing real geometry. The review-fix RED reproduced the native cancel presentation and invalid portal promotion before the fixes. The test correction recorded in the #48 browser RED changed only how a correctly blocked outside attempt was dispatched; it did not weaken product behavior.

Final verification results:

| Verification | Result |
| --- | --- |
| Targeted `newspaper-overlays` + `confirm-gate` | 2 files, **24/24 passed** |
| Full web Vitest | 63 files, **691/691 passed** |
| Workspace typecheck | **PASS** |
| Workspace production build | **PASS** |
| Shared Playwright viewport/zoom matrix | **13/13 assertions passed** |
| Overlay Playwright interaction check | **12/12 assertions passed** |
| Shared controls Playwright check | **3/3 assertions passed** |
| Data-display Playwright check | **4/4 assertions passed** |
| Theme runtime Playwright check | **PASS** |
| Editor Vitest regression | **253 passed, 1 skipped** |

All verification-owned Chromium and Vite processes were closed by their scripts. No process was terminated by executable name, and no listeners remained on the known test ports.

## Editor baseline and limitations

The editor math browser check remains at the known baseline of **3/4**: font rendering, hidden MathML copy, and inline rendering pass; the superscript geometry assertion reports exponent top `163` and baseline-character top `163`. The rerun reproduced the same result. There are no changes under `packages/editor` in this worktree, so the #47–49 diff did not cause this failure.

The authenticated product-screen Playwright suite could not run because `DOCULIGHT_E2E_USER` and `DOCULIGHT_E2E_PASS` were unavailable. This is a genuine environment limitation. The self-contained Playwright fixtures cover the complete common-component scope of #47–49, including computed styles, geometry, semantics, keyboard behavior, IME, nested overlays, focus restoration, portal cleanup, all required normal viewports, and genuine 200% browser zoom.
