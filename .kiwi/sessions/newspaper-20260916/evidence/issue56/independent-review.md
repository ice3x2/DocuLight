# Issue #56 independent review

Reviewer: independent Sol subagent, 2026-09-17. This review did not rely on the implementer's conclusions and did not modify product code or tests.

## Verdict

**FAIL — Critical 0 / High 3 / Medium 4 / Low 1.** The required C/H/M/L0 gate is not met.

The review used GitHub issue #56, `astra-decision.md`, `decision-review.md`, the current uncommitted diff, raw RED/GREEN logs, screenshots and measurements, and the authoritative requirements IR-STORAGE-001, FR-EDITOR-008, FR-STORAGE-003, FR-STORAGE-004, IR-SHELL-009 AC-6, IR-EDITOR-002 AC-2/AC-4, and FR-EDITOR-009. The independently rerun focused suite passed 14/14. That objective pass does not close the findings below.

## Critical

None.

## High

### H1 — The mandatory real product compare/restore/persistence regression was not run

`newspaper-version-history-fixture.tsx` replaces `globalThis.fetch` and treats `document.body.dataset.persistedSeq` as persistence. The browser checker therefore proves component routing and a fixture callback, not an authenticated browser-to-API restore, exact persisted bytes, stable node/ACL/history identity, or server rejection through the product. The server's 19 service tests exercise the other end in isolation; they do not compose the browser and server paths. `browser-merge-regression.txt` confirms that the authenticated product check stopped because credentials and live servers were unavailable. The README correctly admits the visible-body refresh gap, but still counts the split fixture/service evidence as actual persistence. This does not meet issue #56's “실제 비교·복원 회귀” criterion or the frozen rule that a fixture/API spy supplements rather than replaces the product path.

Required closure: run the authenticated product route through the real API and observe the restored body with a new read plus node ID, ACL and version-history identity. Preserve and report the already-known immediate visible-body/cache/autosave limitation separately, as the decision requires.

### H2 — The 200% evidence omits the full shell and never exercises required comparison overflow

The fixture mounts `ControlledDocumentArea` directly, without `App`/`AppShell` and its 180px side panels. Consequently it gives the document area almost the full viewport at 200%. The recorded 200% measurements are 597/677/917px comparison client widths and every environment has `scrollWidth === clientWidth`; no run actually scrolls the comparison viewport horizontally. The frozen contract specifically requires two 240px panes to remain available by horizontal scrolling at narrow effective widths and requires proof that this scrolling does not alter the outer shell widths. The direct-DocumentArea fixture cannot prove either condition, and the screenshots visibly omit both shell sidebars.

Required closure: exercise the version route inside the actual shell at the three required viewports and real 200% zoom, assert the 240px pane minima, assert `scrollWidth > clientWidth` at the narrow case, operate the horizontal scroll, and compare outer panel widths before/after.

### H3 — Current MergeView behavior is outside the recorded TDD/verification chronology

The current source adds the conflict-pane `EditorView.updateListener` that updates the hidden right-hand raw alternative, but `MergeView.tsx` has a modification time of 08:53:14. The claimed final browser artifact is 08:52:13, the web full suite is 08:50:44, and the focused final artifact is 08:47:39. None verifies the current file. The TDD chronology contains no failing test for a stale conflict raw alternative, and the RTL file has no assertion that edits update it. The browser checker contains such an assertion, but its claimed passing artifact predates the current source. This violates the strict test-first rule and leaves the FR-EDITOR-008/FR-EDITOR-009 conflict regression unverified for the submitted diff.

Required closure: add the behavior assertion first, capture a raw RED against the pre-fix behavior, apply the minimum implementation, then rerun the focused, full web/editor, and browser checks against the unchanged final source.

## Medium

### M1 — Version controls do not use the shared control tokens or frozen action hierarchy

All row and footer controls are plain `<button>` elements. They do not render the shared `Button` contract (`data-slot="button"`) and therefore miss its themed border/background/text, focus, hover and disabled tokens. The screenshot shows browser-native controls. The row compare/restore actions have no secondary/ghost distinction, and the footer restore action is not the unique primary action required by the frozen design. The local CSS supplies only minimum height and one focus selector; it does not provide the missing state system or an adjacent disabled-permission reason.

Required closure: use the existing Button variants (row compare secondary, row restore ghost/secondary, footer primary) and verify default/hover/focus/disabled/readonly state styles in both themes.

### M2 — Keyboard and compare-success focus/status contracts are unimplemented or unverified

The checker calls `.focus()` directly and presses Enter on only the 26th compare and footer restore controls. It does not traverse with Tab/Shift+Tab, activate with Space, reach first/last rows and both pane regions, test arrow scrolling, or verify focus remains on the initiating compare control while loading. In product code, successful compare selection is a plain `span` (“비교 중”) with no polite status/live semantics, despite the frozen requirement for a polite success announcement without focus theft.

Required closure: implement the polite, concise selected-version status and add browser keyboard traversal/activation/scroll assertions, including focus during loading and restore-error retention.

### M3 — The visual evidence covers only a small subset of the mandatory states and measurements

The 12-environment checker measures list height/overflow, pane widths/editability, raw-source count, and one focus outline style. It does not measure row/action geometry, focus extent or clipping, selected-rule/color contrast, text/control contrast, hidden `<pre>` zero-flow geometry and pointer behavior, pane/header/action reach, or shell panel invariance. The fixture's comparison data covers one large changed document; it does not exercise equal versions, empty bodies, pure insertion, or pure deletion. Loading/error/empty states run only once and have no theme/zoom geometry or contrast checks. Thus the screenshots and JSON do not substantiate several explicit claims in the frozen 12-environment checklist.

Required closure: extend computed-style and geometry assertions for these states and content shapes, then regenerate the evidence matrix.

### M4 — Permission behavior is not covered by the browser or focused tests

The issue requires permission-based exposure/regression. The fixture has no role/effective-level variants and converts restore failure into only a generic synthetic 500. There is no product/browser 403 permission-loss run and no proof that list/compare reads and restore mutations preserve the authoritative permission boundary. The decision permits the missing proactive disabled control to remain a separately reported plumbing gap, but it still requires preservation of server rejection and an honest failed operation on permission loss.

Required closure: exercise at least view-only and edit/admin product sessions (or the real API boundary through the product browser), verify allowed reads, denied restore, persistent error/retry behavior, and absence of unauthorized metadata/path disclosure.

## Low

### L1 — New issue #56 tests are nested under an unrelated requirement suite

Several restore, stale-response and comparison tests were inserted inside `describe('OBS-AUDIT-004 — 감사 제외의 근거가 되는 재현처')` rather than the IR-STORAGE-001 suite. This produces misleading test output and weakens requirement traceability even though the assertions themselves pass.

Required closure: move the issue #56 cases into the IR-STORAGE-001/version-history describe without changing their assertions.

## Evidence assessment

- Raw RED evidence for list failure, failed restore callback, read-only version comparison, duplicate restore, stale comparison, list overflow, and restore focus reaches the intended assertions and is credible.
- Independent focused rerun: 1 file, 14 tests, all passed.
- The recorded web/editor/server/typecheck results are objective for the source that existed when each log was captured, but H3 means they are stale for the current `MergeView.tsx`.
- Genuine `chrome.tabs.setZoom(..., 2)` is called and returns 2. The JSON does not record the required before/after CSS viewport and DPR, and H2 prevents it from proving shell-constrained horizontal overflow.
- Requirement stability permits the work: IR-STORAGE-001 is evolving; FR-EDITOR-008, FR-STORAGE-003 and FR-STORAGE-004 are stable. IR-EDITOR-002 and IR-SHELL-009 are stable but not fully complete; this review makes no status promotion claim.
