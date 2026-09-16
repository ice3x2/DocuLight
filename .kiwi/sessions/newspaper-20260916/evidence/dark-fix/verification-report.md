# Dark preview hover correction evidence

## Scope and result

- Requirement: `IR-SHELL-006` AC-7 and the issue #45 static dark-preview evidence boundary.
- Artifact correction: the exact delegated `.outline a:hover` underline declaration was added to `docs/decision/newspaper-theme-dark.html`.
- No base color, font, content, control, or layout declaration changed.
- The approved light artifact remained byte-for-byte unchanged at SHA-256 `cecfe19ec6747c41271306b52dd5e59e69c3084caba2ad5f3257182c6d29edf3` before and after the correction.

## RED

Command (expected nonzero):

```text
node .kiwi/sessions/newspaper-20260916/evidence/dark-fix/hover-check.cjs red
```

Result: exit `1`. Chromium 151 computed no exact hover decoration on any of the three outline anchors. The two ordinary anchors remained `text-decoration-line: none`; the `.here` anchor remained underlined but with `text-decoration-thickness: auto`, not the required `1px`. Keyboard focus itself already remained `2px solid rgb(168, 196, 211)` with a `4px` offset. Full computed values and pre-fix geometry are retained in `red-hover-measurements.json`; the screenshot is `red-hover-focus.png`.

## GREEN

Command:

```text
node .kiwi/sessions/newspaper-20260916/evidence/dark-fix/hover-check.cjs green
```

Result: exit `0`. For all three anchors, including `.here`, Chromium computed:

- `text-decoration-line: underline`
- `text-decoration-color` equal to the computed current text color
- `text-decoration-thickness: 1px`
- `text-underline-offset: 3px`

Mouseleave restored every recorded default decoration property. Anchor rectangles and the seven recorded shell rectangles were identical before and after the CSS correction, and every anchor rectangle was identical before and during hover. The first anchor retained its `2px solid rgb(168, 196, 211)` keyboard-focus outline and `4px` offset while hovered. Full measurements are retained in `green-hover-measurements.json`; the screenshot is `green-hover-focus.png`.

## Browser automation boundary

The required in-app browser bootstrap was attempted first and was unavailable because the runtime rejected setup before a browser session could be created due to missing sandbox-state metadata. This agrees with the already documented unusable in-app baseline under `evidence/dark-review/browser-bootstrap-failure.md`. The repository Playwright fallback was therefore used, as permitted by the assignment. No personal browser profile, secrets, network request, or external mutation was used.

## 200% browser zoom correction

The earlier `evidence/dark-review/product-review.md` description of a DPR-2 context with a 720×450 CSS viewport as “browser-level 200%” is retained as history, but it is not true browser-zoom proof. It manually combined device scale factor 2 with a halved CSS viewport and must be treated only as a responsive/layout simulation.

True Chromium browser zoom at 200% is **not proven in this environment**. Two temporary-profile attempts used Chromium's `partition.default_zoom_level` value `3.8017840169239308` (the level corresponding to factor 2):

1. `true-browser-zoom-attempt1-viewport-emulation.json` records the first attempt with a Playwright viewport. Chromium exposed 1440×900 CSS pixels at both baseline and requested zoom, so the measured ratio was 1.0 and the attempt was rejected.
2. `true-browser-zoom-attempt2-real-window.json` removed Playwright viewport and device emulation and used a real 1440×900 headless browser window. Chromium again exposed 1440×900 CSS pixels at both baseline and requested zoom, with unchanged reference geometry, so the measured ratio was again 1.0 and the attempt was rejected.

Both attempts used a fresh OS-temporary persistent Chromium profile and deleted it after collection. Neither used CSS `zoom`, a CDP emulation/page-scale command, manual viewport halving, or a manual device-scale factor. `Page.getLayoutMetrics` was read only to measure the result. The failed screenshots are accurately labeled `true-browser-zoom-attempt1-viewport-emulation.png` and `true-browser-zoom-attempt2-real-window.png`; neither is evidence of a 200% pass.

The remaining proof gap is an actual Chromium browser-UI zoom of 200% (or a profile preference that Chromium demonstrably applies), followed by independently measured layout effect and screenshot capture. Browser chrome/UI control is unavailable through the repository Playwright fallback, and the isolated headless profile ignored the preference, so no pass is claimed.

## Static-artifact boundary

This evidence checks only the static issue #45 comparison artifact. Product IME, authentication, authorization, persistence, and runtime theme behavior remain outside this correction and are not claimed as verified.
