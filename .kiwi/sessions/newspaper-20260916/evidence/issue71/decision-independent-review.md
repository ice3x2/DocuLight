# Issue 71 closure decision independent review

Date: 2026-09-22  
Reviewed decision: `astra-closure-decision.md`  
Decision SHA-256: `E0B8DE9D4CE4219B4BFEA94D594CF82D95155140789DC2377CF88720C854DED6`  
Audited integration HEAD: `4cb4457b694f8ec286023f5406e7386cfb52be79`

## Verdict

**PASS — CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0. Sol may implement this decision.**

This verdict covers the completeness and internal consistency of the remediation contract. It is not a product-completion finding, SRS verification, GitHub closure approval, or evidence that the prescribed browser work has run.

## Review findings

The decision correctly treats the prior #71 audit findings as evidence gaps. It does not claim native Korean IME verification. It makes Playwright synthetic composition and post-handler DOM/event/network observations the automated acceptance route, requires positive `defaultPrevented` evidence rather than inferring behavior from zero requests, and preserves the exact limitation that the Windows candidate window, physical keyboard commit path, password-manager UI, and OS dialogs remain untested.

The role matrix is complete and arithmetically exact: three viewports by two themes by two verified zoom levels gives 12 environments, each exercised with superuser, ordinary non-superuser, and non-superuser workspace-manager sessions for 36 actual-role observations. The contract requires built production App/AppShell entry, real authenticated server roles, separate contexts, absent privileged DOM/value copies for unauthorized roles, direct GET/PUT denial, unchanged DB state, and role-loss teardown. It forbids viewer injection and DOM-only inference.

All five settings are enumerated with their existing keys, labels, control types, units, keyboard behavior, baseline semantics, and policy boundaries. The result contract requires 60 per-field superuser rows across the 12 environments. It preserves server values, explicit Save/Revert, changed-key counting, preflight/write/readback, retention zero and cross-field semantics, and prohibits new defaults, fields, integer/range policy, MB conversion, or implicit saving.

The ten requested states are individually disposed: default, hover, focus, selected, disabled, readonly, invalid, loading, empty, and error. Readonly and successful-empty are explicitly classified as inapplicable with observable checks, while empty input remains an invalid case. Hover, readonly, and empty must remain explicit result rows rather than disappearing behind a generic checklist.

Keyboard, accessibility, theme, and geometry gates are measurable. They cover forward and reverse traversal, native select arrows, text selection, deliberate keyboard save, composition cancellation, focus ownership and non-theft, connected labels/help/errors, composited contrast ratios, control boundaries, focus separation, minimum target height, long Korean wrapping, scroll reachability, last-field visibility, sticky-action non-overlap, both themes, forced colors, runtime resize, and independently read true 100%/200% browser zoom.

The combined smoke path keeps #71, `FR-CONFIRM-024` (#87), and `IR-SHELL-013` (#88) distinct while exercising them in the integrated product. It requires real zero- and positive-impact retention fixtures and receipts, separate retention and leave confirmations, every leave route, exact draft/focus preservation, accepted-write/readback retry without duplicate PUT, and same-mount theme/size/zoom preservation. Existing #87/#88 evidence may be reused only with exact scope, paths, hashes, and source comparison; a current combined failure remains actionable.

Evidence provenance and independence are sufficient: the work order pins checkout/source/test/bundle hashes, stages fresh artifacts separately from historical evidence, records exact commands and exit codes, requires all environment/role/field/state/composition/smoke rows, excludes credentials and raw receipts, publishes the completion manifest last, and reserves final closure recommendation for a different reviewer. Owned browser/server/process cleanup and the prohibition on process-name termination are explicit.

## Sources checked

- Live GitHub issue #71 and its closure checklist
- `AGENTS.md`, `docs/spec/00.index.md`, and current SpecKiwi status
- Current `InstanceSettings.tsx` and `AppShell.tsx`; their SHA-256 values match the decision preconditions
- Relevant SRS blocks including `IR-SHELL-002`, `DR-SHELL-001`, `IR-SHELL-006`, `FR-CONFIRM-024`, and `IR-SHELL-013`
- Historical #71 design, TDD, implementation verification, and browser evidence
- #87 design/green evidence and #88 design/verification/final independent review
- The prior independent #71 closure audit findings

No product code, test, SRS requirement, GitHub issue, or historical evidence was changed by this review.
