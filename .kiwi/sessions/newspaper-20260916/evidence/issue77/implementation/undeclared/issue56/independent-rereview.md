# Issue #56 independent re-review

Reviewer: independent Sol subagent, 2026-09-17. Product code and tests were not edited.

## Verdict

**FAIL — Critical 0 / High 1 / Medium 3 / Low 0.** The required C/H/M/L0 gate is not met.

This re-review read the revised source, tests, frozen Astra decision, SRS requirements, README/chronology, raw RED/GREEN logs, full regressions, screenshots, shell measurements, and authenticated product runner. It independently reran the focused RTL suite (14/14 PASS) and the current disposable authenticated product runner (PASS: exact bytes, stable node/version identity, history growth and view-only rejection).

The previous H1 persistence/product-path finding is closed. The current authenticated runner creates a real document and view-only principal, restores through the shipped App UI and HTTP API, performs a fresh document read, verifies history growth and the original sequence, and observes an actual denied restore. The previous shell-overflow finding is also closed: the revised AppShell measurements show 240px panes, `scrollWidth=480` against 217/257/377px clients at real 200%, successful horizontal scrolling, and unchanged shell columns.

## Critical

None.

## High

### H1 — At real 200%, long metadata makes each row roughly four CSS viewports tall

The frozen layout says row metadata and actions may wrap to a second line. The implementation keeps `[data-version-row]` as a non-wrapping flex row while `[data-version-actions]` remains beside metadata. At 1280×720 and 1440×900 with real 200% zoom, the center column is only 260/300px. The action block consumes most of that width, forcing the complete long author identifier into an extremely narrow metadata column.

The submitted `green-version-measurements.json` records the result:

- 1280×720 at 200%: first-row height `1572.8px`, list client height `100px`, list scroll height `41189px`.
- 1440×900 at 200%: first-row height `1572.8px`, list client height `135px`, list scroll height `36167px`.
- Even 1920×1080 at 200% produces a `182.8px` first row in a `162px` list viewport.

Thus a single row is more than four 640×360 CSS viewports tall in the minimum environment, and its compare/restore actions sit around the vertical middle, far away from the sequence/author/time context. The checker masks this by calling `compareButton.focus()` directly, which scrolls the inner list to the otherwise remote action. The 200% screenshots show only the shell/header and do not expose the row or comparison. This is a material responsive usability failure in the core #56 list, despite the pane geometry passing.

Required closure: make the row itself wrap so metadata receives the usable row width and actions move to the next line at constrained widths, then assert a meaningful bounded row geometry with the same unbroken author identifier in all real-zoom environments.

## Medium

### M1 — The pending compare control claims to be disabled but still submits requests

`VersionHistory.tsx` puts `aria-disabled=true` on the active compare button while its request is loading, but leaves the button enabled and always calls `compare(row.seq)` from `onClick`. Mouse, Enter and Space therefore start another request even though assistive technology is told the control is unavailable. Repeated activation also increments the request identity and issues redundant GETs. Keeping native focus is correct, but ARIA-disabled controls must suppress activation manually.

Required closure: guard activation for the already-pending sequence while retaining focus, and add a test that repeated click/Enter/Space produces one request until completion.

### M2 — The frozen keyboard traversal contract is still only partially verified

The revised checker verifies Tab from the first compare action to its adjacent restore action, Shift+Tab back, Space activation, and focus retention after compare. It still does not traverse the complete DOM order through first/last row actions, the named comparison viewport, CodeMirror panes and footer; it does not establish that both panes and the footer are reachable; and it does not test the specified arrow-key scrolling behavior. The checker jumps directly to the footer with `.focus()` and manipulates horizontal scrolling with `evaluate`, so those steps do not prove keyboard reachability.

Required closure: drive Tab/Shift+Tab through the required sequence, reach first/last list actions and both pane regions/footer, and operate the applicable scroll regions using keyboard input.

### M3 — Content-shape and 200% screenshot claims remain stronger than the evidence

For `empty`, `equal`, `insertion` and `deletion`, the state loop only asserts two pane containers and two hidden source nodes. It does not verify source bytes, absence of cues for equal/empty content, or the required visible/accessibility `+ 추가` and `− 삭제` markers on the correct sides for pure insertion/deletion. In addition, the README says all 12 screenshots show the open comparison, but the submitted 1280×720 and 1440×900 200% screenshots show only the top shell/header because the document area scrolls internally; the version list and comparison are outside the captured viewport.

Required closure: assert the exact raw sources and cue placement/count for all four shapes, and capture the target list/comparison in each 200% environment (scroll the document content before capture or take scoped screenshots).

## Low

None.

## Evidence and requirement assessment

- TDD RED artifacts now credibly cover conflict raw-source updates, shared Button variants/status, pending-compare focus, and restore-error focus before their fixes.
- Current source predates the final focused/full regressions and final shell matrix. The current authenticated runner postdated its stored log, but the independent rerun passed with the current file.
- Final regression logs report web 727/727, editor 261 passed with 1 skipped, server version service 19/19, typecheck PASS, and production build PASS.
- Requirement stability permits the work: IR-STORAGE-001 is evolving; FR-EDITOR-008, FR-STORAGE-003 and FR-STORAGE-004 are stable. The implementation also preserves the relevant IR-SHELL-009, IR-EDITOR-002 and FR-EDITOR-009 boundaries apart from the findings above.
