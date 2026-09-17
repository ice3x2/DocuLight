# GitHub #61 independent-review fix evidence

Requirements: IR-SHELL-001, IR-SHELL-002, and IR-SHELL-008 AC-1/AC-2 plus the
shell portions of AC-4/AC-6.

## M2 strict rebuild

`strict-rebuild-red.md` records the genuine recovery RED required by AGENTS: the
expanded tests existed first, then the complete affected settings geometry
implementation was removed, and all 15 normal, breakpoint, and
actual-browser-zoom environments failed. The nine 100%/breakpoint cases
reported geometry, overflow, independent-scroll, padding and focus failures;
the six actual-200% cases also failed real final-action visibility. The minimum
implementation was restored from that test contract. The same checker then
exited 0 and printed:

```text
PASS 12 Playwright-owned isolated Chromium environments
```

The three 899/900/901 breakpoint cases also passed in that run.

## M1 browser evidence

`packages/web/test/newspaper-settings-check.cjs` now:

- fulfills the real InstanceSettings API and selects the real instance category;
- reaches all five real inputs and the final submit action with keyboard input;
- asserts Tab, Shift+Tab, ArrowUp, ArrowDown, Home, and End behavior;
- verifies the final action is fully within the right content viewport;
- verifies selected text contrast >= 4.5:1 and focus boundary contrast >= 3:1;
- verifies all four focus-ring edges have at least the required visible extent;
- retains the independent left/right synthetic overflow probe for deterministic
  scroll-isolation coverage after the real-child path;
- captures each screenshot before closing the dialog, while the real final
  action has keyboard focus and a separate navigation item is hovered;
- aggregates failures across all environments so a RED records the complete
  normal/breakpoint/actual-200% matrix.

`browser-matrix.json` contains 12 rows. Every row records
`realReachability.actionVisible=true`; the actual 200% CSS viewports are
640x317, 720x407, and 960x497 for each theme. Every recorded focus extent is
at least 4 CSS px. `settings-matrix/` contains 12 open-dialog screenshots.

The checker exposed one real keyboard defect before the implementation fix:
the Radix tabpanel itself consumed the first Tab stop. The RED was
`Tab enters the real instance-settings form: false !== true`.
`Tabs.Content tabIndex={-1}` is the minimum product change; Tab now moves from
the selected category directly to the first real child input, and Shift+Tab
returns to the selected category.

## Regression

- Targeted Vitest: 5 files, 52 tests passed.
- Web typecheck: passed (`tsc --noEmit`).
- Browser matrix: 12/12 environments plus 899/900/901 breakpoint checks passed.
- Browser ownership: only Playwright-launched isolated Chromium was used. Every
  200% case used a disposable persistent profile and extension. No existing
  browser/CDP attachment, OS input, or process-name-wide termination was used.
