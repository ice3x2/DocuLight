# Issue 71 final independent product review

Date: 2026-09-22  
Audited base: `62338d93a28c0ee4bf2f4aee47701f07a41ec23a`  
Requirements: `IR-SHELL-002`, `DR-SHELL-001`; integrated checks: `FR-CONFIRM-024`, `IR-SHELL-013`

## Verdict

**PASS — CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0. Issue #71 may close.**

This review authorizes closure based on the inspected working-tree implementation and pinned evidence. It does not change SRS status, create a commit, or close the GitHub issue.

## Product evidence

- The built production App/AppShell used three distinct real authenticated roles across three viewports, light/dark, and separately read true 100%/200% browser zoom: 36/36 role observations. The instance-settings category and privileged form were absent for ordinary and workspace-manager accounts. Their valid-key GET/PUT requests returned 403, and the authoritative `signup-mode` DB value remained exactly `approval` before and after.
- The five expected fields produced 60/60 rows. Every environment records exact labels, values, help/unit associations, seven-stop forward/reverse keyboard order, selected signup value, pointer hover, text selection, control geometry, clipping, 2px focus ring plus 2px separation, and per-node composited-background contrast.
- Minimum measured ratios passed: ordinary control text 10.129:1, labels 11.430:1, help/unit text 5.268:1, buttons 4.695:1, borders 3.814:1, and focus indicators 6.869:1. Five error rows cover all four numeric fields plus the coupled retention error; their minimum text contrast is 7.452:1. No field was clipped.
- All ten applicability states are explicit. Readonly and successful-empty are correctly inapplicable; empty numeric input remains an invalid state.
- Forced colors has four observations: light/dark at true 100%/200%.

## Composition and integrated behavior

- There are 24 synthetic composition observations: 16 base numeric-field cases, four #87 L3 cases, and four #88 leave-confirmation cases. All are explicitly `isTrusted=false`; no native IME behavior is claimed.
- Every base-field case drives composition start/update, a real DOM value and `InputEvent`, composing Enter, active-composition blur, composition end, post-end invalid validation, correction, keyboard Save, and readback. Guarded PUT/retention-preview traffic is snapshotted before composition and after validation; all 16 exact deltas are zero. Each deliberate Save then produces exactly one PUT.
- Each #87 case obtains a real positive-impact preview, extracts and enters the exact authoritative token, confirms by keyboard, observes exactly one PUT and readback, and preserves the expected value.
- Category, header close, Escape, and outside-click leave paths each preserve exact draft and focus on Continue Editing, then perform the selected discard transition once with zero PUT. The composing Enter guard prevents accidental confirmation.
- Accepted-write/readback failure records one accepted PUT, the same mounted form and exact draft during failure, then one GET-only retry with zero additional PUT and authoritative readback.

## TDD, regression, and provenance

- The fresh audit-gap RED is a real raw run: 3 failed / 4 passed before remediation, with chronological metadata and filesystem SHA-256 values for the test, prior checker, prior CSS, and raw output. The later GREEN metadata pins the remediated checker/CSS and raw 4-file 76/76 result. Earlier Escape/outside focus REDs are also retained.
- The recorded combined #71/#87/#88 focused suite passed 74/74; the focused closure GREEN suite passed 76/76. Recorded full web regression passed 109 files and 1316/1316 tests. Web typecheck passed. SpecKiwi validation has zero errors, no missing evidence, and no stability blockers; only the existing unrelated warnings remain.
- The closure capture manifest validates 8/8 source files, 2/2 built bundles, 27/27 pre-manifest artifacts, and 10/10 raw command rows, with no mismatches or temporary files and manifest published last.
- The outer 66-file manifest is byte- and hash-exact, UTF-8 bytewise ordered, and published after every included file. Its aggregate SHA-256 independently recomputes to `a7299e5fdf2060df2663f0e1d719995ac3471d074466f983581014e6f9764080`.

## Explicit limitation

Native Windows IME candidate-window selection, physical-keyboard commit behavior, native password-manager/autofill UI, and OS dialogs were not exercised. The evidence uses untrusted Playwright synthetic composition and DOM/network observations under the binding Playwright-only decision. These are nonblocking untested limitations; this review makes no native or manual IME claim.

Representative 100%, true 200%, dark-theme, and forced-colors captures were visually inspected. Content remains reachable, focus indication is visible, long text wraps, and the settings action area does not cover the final field.
