# GitHub #61 independent re-review

Reviewed the current issue #61 worktree and the requested recovery artifacts against IR-SHELL-001, IR-SHELL-002, IR-SHELL-008, and the AGENTS test-after recovery rule.

## Result

**C0 / H0 / M0 / L0**

No remaining findings.

## Recovery assessment

The strict rebuild satisfies the repository's explicit recovery rule for implementation written before complete failing tests:

1. The expanded final checker existed before the recovery RED.
2. The complete affected settings geometry implementation was removed from `shell.css`.
3. The implementation-free state was exercised across six normal environments, the 899/900/901 breakpoint cases, and six isolated extension-driven `getZoom() === 2` environments.
4. The nine normal/breakpoint cases aggregated independent failures for geometry, overflow, padding, focus contrast, and both scrollports rather than stopping at the first assertion.
5. The six actual-200% cases reached the real `InstanceSettings` child and failed final-action visibility.
6. The minimum settings geometry implementation was restored from the already-running contract, after which the same matrix passed 12/12 plus all three breakpoint checks.

This evidence does not rewrite the original chronology, nor does it need to. It demonstrates the mandated remove-to-RED and rebuild-to-GREEN recovery sequence.

## Fixed review findings

- The checker uses the real `InstanceSettings` form, traverses all five inputs, and reaches the final submit action by keyboard.
- ArrowUp, ArrowDown, Home, End, Tab, and Shift+Tab behavior is exercised.
- The accidental Radix tabpanel Tab stop is removed with the narrow `Tabs.Content tabIndex={-1}` change.
- Selected-text and focus-boundary contrast are measured.
- Every focus-ring edge now has an executable `extent >= 0` assertion, so clipping is no longer tolerated. Current matrix measurements retain at least 4 CSS px.
- Screenshots are captured while the dialog remains open, with the final action focused and a separate navigation item hovered.
- Independent left/right scrolling and fixed header position remain asserted after the real-child path.

## Requirement disposition

- IR-SHELL-001: conformant; modal ownership and the two-column settings structure remain intact.
- IR-SHELL-002: conformant; exact category identities, ordering, grouping, and visibility gates remain sourced from the existing category contract.
- IR-SHELL-008 AC-1/AC-2 and the relevant AC-4/AC-6 shell behavior: supported by the recovered RED/GREEN matrix, actual browser zoom, real-child reachability, focus, contrast, and open-dialog screenshot evidence.
- IR-SHELL-008 AC-5 remains outside issue #61 and is not claimed complete.

The artifacts show Playwright-owned isolated Chromium only. No existing browser/CDP attachment, OS input, or process-name-wide termination was used.
