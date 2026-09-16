# Independent final acceptance — GitHub issue #45

## Verdict

**PASS — no Critical, High, Medium, or Low findings remain.**

Reviewed requirement: `IR-SHELL-006` AC-2, AC-7, AC-8, and AC-10, with `IR-SHELL-004` as the existing behavior anchor. The approved handoff assigns issue #45 the same-composition dark comparison, exact delegated palette, applicable state/contrast evidence, and real-browser desktop/200% evidence.

Current artifact SHA-256: `8a0359f6fa0dfe5f287347c1288dce8da505de360a1faaf73b2cd6518252dc02`.

## Hover correction acceptance

Chromium 151 independently exercised all three real `.outline a` anchors at the 100% baseline.

- Every anchor computed `underline`, `currentColor`, `1px` thickness, and `3px` underline offset during pointer hover.
- Every anchor returned to its exact recorded default decoration after pointer leave.
- Every anchor rectangle was identical before and during hover.
- The first anchor retained the approved focus color and `4px` separation. Full Chromium on this Windows display quantized the declared `2px` outline to `1.6` CSS px at DPR 1.25, which is exactly 2 physical pixels. The prior DPR-1 headless measurement computed the declaration as `2px` CSS.
- `actual-anchor-hover-focus.png` records the combined visible hover/focus state. Raw computed values are in `actual-browser-zoom.json` under `anchors`.

The current dark file differs from the prior independently reviewed artifact only by the prescribed hover rule. Removing the exact `.outline a:hover{...}` line in memory reproduces the prior review SHA-256 `f53cf87f4de652a05299cb904bba5d37c77b41fcbed951fe20074671e2cfba37`. The rule does not change anchor or frame geometry, so the prior independently measured light/dark frame-composition equivalence remains valid.

## Genuine Chromium browser zoom at 200%

Actual browser zoom is now proven, replacing the earlier simulation gap.

Method: an unpacked test-only Manifest V3 extension called `chrome.tabs.setZoom(tabId, 2)` in full bundled Chromium, using a fresh OS-temporary browser profile and an off-screen browser window. The artifact was served only on ephemeral `127.0.0.1`; the fixture used no credentials. The browser, local server, extension, and profile were closed/removed after collection.

Authoritative and independent effects:

| Measurement | 100% | Actual 200% |
| --- | ---: | ---: |
| `chrome.tabs.getZoom` | 1 | 2 |
| `innerWidth × innerHeight` | 1440 × 814 | 720 × 407 |
| `outerWidth × outerHeight` | 1441 × 901 | 1441 × 901 |
| `devicePixelRatio` | 1.25 | 2.5 |
| CSS `html/body zoom` | 1 / 1 | 1 / 1 |
| Horizontal overflow | none | none |
| Sidebar / inspector | visible / visible | hidden / hidden |

The physical browser outer dimensions stayed unchanged while the CSS layout viewport halved exactly and DPR doubled exactly. `chrome.tabs.getZoom` returned 2 both immediately after setting and at the final measurement. No CSS zoom, CDP page-scale/emulation command, manual viewport halving, or manual device-scale factor was used. CDP `Page.getLayoutMetrics` was read-only corroboration.

`actual-browser-zoom-200.png` is the screenshot of the genuine 200% state and shows the intended readable single-document responsive composition without horizontal clipping. `actual-browser-zoom-100.png` is its same-window baseline. Playwright page screenshots capture the zoomed content surface rather than browser chrome, so the PNG dimensions differ even though measured browser outer dimensions do not; this is recorded explicitly in the JSON rather than represented as unchanged physical screenshot pixels.

The earlier `dark-review/dark-1440x900-200pct-browser-scale.png` (DPR 2 plus manually halved viewport) remains only a responsive simulation. The two `dark-fix/true-browser-zoom-attempt*` profile-preference results remain failed attempts with ratio 1. Neither is used as actual-zoom acceptance evidence. The first final-review extension attempt in headless Chromium also failed because no extension service worker loaded; it is not used as evidence. Full Chromium was required for the successful extension route.

## Palette, preservation, and retained evidence

- All 24 computed dark custom properties exactly match the delegated handoff palette; the expected and computed maps are retained in `actual-browser-zoom.json`.
- The approved light artifact SHA-256 is still `cecfe19ec6747c41271306b52dd5e59e69c3084caba2ad5f3257182c6d29edf3`.
- `git diff --exit-code d8a9603 -- docs/decision/newspaper-theme.html` returned 0. The baseline and current filtered Git blob IDs both equal `5c0e384afdd576d70e00fb11555be1a65c824418`.
- The prior independent desktop, contrast, static-state, external-resource, and same-composition measurements remain applicable because the only subsequent artifact change is the non-layout hover declaration proven above.
- Disabled text remains accurately documented as 4.05:1 and excluded by AC-8; no token adjustment is required.
- Static controls remain visual specimens, not product-runtime or interaction evidence. IME, permissions, persistence, and product theme switching remain outside issue #45 and are not claimed.

## Evidence inventory

- `final-review.md`
- `actual-browser-zoom.json`
- `actual-browser-zoom.cjs`
- `actual-browser-zoom-100.png`
- `actual-browser-zoom-200.png`
- `actual-anchor-hover-focus.png`
