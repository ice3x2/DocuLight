# Issue 71 closure remediation — ready for independent review

Requirements: `IR-SHELL-002`, `DR-SHELL-001`; integrated smoke also covers `FR-CONFIRM-024` and `IR-SHELL-013`.

## Result

- Owned production runner: PASS with temporary database, vault, accounts, ports, Chromium profiles, and extension.
- Role/environment observations: 36/36 (12 environments × superuser, ordinary, workspace administrator).
- Superuser field observations: 60/60 (five fields × 12 environments), including linked label/value/help/unit/error/button/border/focus observations, composited adjacent-background contrast, clipping/separation, and exact seven-stop forward/backward keyboard traversal.
- State applicability: all ten states recorded; readonly and successful-empty are explicitly inapplicable, while empty numeric input remains invalid.
- Forced colors: light/dark × true 100%/200% = 4 observations.
- Synthetic composition: 24/24 (four environments × four numeric fields, #87 L3, #88 leave confirmation). Numeric fields use compositionstart/update, real DOM value/InputEvent, active blur, post-end invalid validation, correction, and keyboard Save/readback. #87 records exact authoritative-token matching and one keyboard-confirmed PUT/readback.
- Combined #88 leave routes: category, header close, Escape, and outside click each preserve exact draft/focus on Continue Editing, then observe a deliberate discard follow-up with zero PUT.
- Accepted-write/readback failure: the real PUT is accepted once, the readback is aborted, the same mounted form and exact `open` draft remain, and keyboard retry performs exactly one GET with zero additional PUT before authoritative readback succeeds.
- Unauthorized roles: privileged tab absent; valid-key settings GET/PUT return 403 for ordinary and workspace-manager accounts. The runner records authoritative `signup-mode` DB value `approval` before and after, exactly unchanged.
- True zoom: extension `setZoom`, separate `getZoom`, and reset/readback are asserted.
- Capture publication: 27 pre-manifest artifacts, eight changed-source hashes, two built-bundle hashes, ten raw command/evidence rows, zero mismatches/temp files; `capture-manifest.json` is physically last.

## TDD and regression

- RED: structural closure contract failed 5/5 at raw SHA-256 `c447cb4ccaa92e8ee359888ead9c991d3a81059acfd41deadc53e294616f8a3b`; it preserves the genuine 2px CSS failure and rejects literal pass flags, empty denied PUT, shallow composition, and incomplete manifest inputs.
- RED: real combined browser runs found stale focus ownership after Escape and outside-click leave cancellation; raw products `red-escape-focus-product.txt` and `red-outside-focus-product.txt` preserve the failures. The narrow coordinator fix distinguishes keyboard/outside paths from stale pointer ownership and remembers the last focused settings control.
- Post-rebase combined closure/#71/#87/#88/ConfirmGate suite: 6 files, 91/91 passed.
- Full web after rebasing onto integration `8df339e`: 112 files, 1345/1345 passed.
- Web typecheck: PASS.
- SpecKiwi: zero errors; existing `SRS-W072` warning only. Summary has no missing evidence or stability blockers; links report only the existing unrelated `IR-AUDIT-004` reference `32`.

## Native limitation

Native Windows IME candidate-window behavior, physical keyboard commit, password-manager UI, and OS dialogs were not performed. Synthetic browser events are untrusted and do not prove native candidate behavior. Under the binding Astra decision this limitation is explicit and nonblocking; no native/manual IME claim is made.

No SRS status was promoted, no commit was created, and issue #71 was not closed. Independent final review remains required.

## Final-review remediation

- Every base-field composition row snapshots PUT/preview traffic before `compositionstart` and after composition update/input, composing Enter, blur, composition end, and post-end validation; all 16 exact deltas are zero.
- Label, help/unit, ordinary numeric errors, the cross-field retention error, controls, borders, focus indicators, and save buttons use their own actual composited adjacent backgrounds for contrast assertions.
- The unjustified 2.5px literal was removed. The existing authored 2px focus ring and 2px offset remain, while product evidence measures focus contrast and separation.
- Fresh audit-gap RED and final GREEN raw outputs have separate chronological metadata with ordinary filesystem SHA-256 values; neither is presented as a Git object or as evidence from an earlier run.
