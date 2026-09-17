# GitHub #61 independent review

Reviewed 2026-09-17 against GitHub #61, `astra-decision.md`, and requirements IR-SHELL-001, IR-SHELL-002, and IR-SHELL-008. Scope was limited to the AppShell settings assembly, scoped CSS, related tests/checkers, and package scripts. No product code was changed by this review.

## Result

**C0 / H0 / M2 / L0**

No Critical or High product correctness, regression, or accessibility defect was reproduced. The implementation preserves the existing `visibleCategories(viewer)` authorization source, renders the exact 14-item order and three conditional groups, uses the shared Dialog adapter, keeps two independent scrollports, restores trigger focus, and matches the required 900px breakpoint geometry in the exercised Chromium environments.

## Medium findings

### M1 — Browser evidence does not prove the required last real input/action reachability or visual states

`packages/web/test/newspaper-settings-check.cjs` validates dialog geometry and then appends synthetic 1400px `div` elements to the two scrollports. It only sets each `scrollTop` to 300 and checks isolation. It never selects a real long child panel and never locates or reaches that panel's last input or action at 1280×720/200%, although IR-SHELL-008 AC-2 and GitHub #61 require that evidence. It also checks only `End`; ArrowUp/ArrowDown, Home, Tab/Shift+Tab, focus-ring clipping, and computed contrast are not asserted.

The screenshots are captured after `inspect()` clicks **설정 닫기**, so all 12 images show the underlying shell rather than the settings modal. They cannot support the requested modal visual review for light/dark, selected/hover/focus states, long Korean wrapping, or 200% reachability. Move screenshot capture before close and add a real child-content path that scrolls/focuses the final control/action.

This is an acceptance-evidence gap rather than a reproduced layout failure: the independent rerun still passed all 12 Playwright-owned isolated Chromium environments.

### M2 — The recorded red phase does not cover the principal geometry/scroll behavior change

The saved `red-vitest.txt` has only three failing tests: grouped navigation, title/description/close, and revoked-selection fallback. The new width/height, breakpoint, two-scrollport behavior, 200% layout, keyboard reachability, and focus extent are exercised only by the later browser checker; there is no recorded failing pre-implementation run for those behaviors. GitHub #61 explicitly requires failing actual geometry/grouping/close/focus tests before implementation, and the repository TDD rule requires red before every behavior change.

The existing red record is valid for the three behaviors it fails, and `green-vitest.txt` proves those became green. Acceptance should not claim complete TDD-first evidence for IR-SHELL-008 AC-1/AC-2 until the missing pre-implementation evidence is supplied or the exception is explicitly recorded as a process deviation.

## Objective checks

- Targeted current-worktree regression: 38/38 passed across the new settings test and existing settings/modal/layering suites.
- Full recorded web regression: 71 files, 807 tests passed.
- Recorded typecheck and web build passed.
- Recorded isolated installed-product check: 4/4 passed, including one dialog, exact 14 categories, grouping, and trigger focus restoration.
- Independent browser rerun: `npm run test:browser:settings --workspace @doculight/web` passed 12/12 environments. It used only Playwright-launched fresh isolated Chromium contexts/profiles; no existing browser/CDP attachment, OS input, or broad Node termination was used.

## Requirement disposition

- IR-SHELL-001: implementation remains conformant for modal ownership and two-column category/content behavior.
- IR-SHELL-002: implementation remains conformant for exact category identity, ordering, and visibility gates.
- IR-SHELL-008: the implementation and current automated measurements support AC-1 and the shell structure of AC-2, but the requested real final-input/action and visual-state evidence is incomplete. AC-5 remains outside #61 and must not be marked complete from this work.
