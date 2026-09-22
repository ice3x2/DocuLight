# Issue 55 evidence

Requirements: `FR-EDITOR-007`, `FR-EDITOR-010`, `IR-EDITOR-001`, `IR-EDITOR-002`.

## TDD chronology

- `red-unit.txt`: before product edits, three assertions reached and failed for the hard-coded Shiki light theme, Mermaid cache identity, and invalid-math source access.
- `green-unit.txt`: the same three assertions passed after the minimum implementations.
- `red-diff-unit.txt`: before the merge cue implementation, the cue contract failed because `diffCueText` did not exist.
- `green-diff-unit.txt` and `final-diff-unit.txt`: the unchanged cue contract passed after implementation.
- `red-playwright.txt`: before the layout/accessibility product edits, the actual `AtomicCodeMirrorEditor` demo reached the code computed-style assertion and failed (`overflow-x: visible`, `line-height: 28px`). The initial checker then could not reach virtualized lower blocks; the checked-in checker replaces the demo document through the actual CodeMirror view so each final assertion uses the shipped components. It was not used as evidence for assertions it did not reach.
- `green-playwright.txt`: the actual product editor component passed code local scrolling/14px-22px type, table and diagram keyboard regions, and the 2px quote rail.
- `review-red-acceptance-playwright.txt`: the broadened product checker reached the source-mode interaction and failed because the fixture had not entered edit mode. Subsequent product assertions also exposed missing intrinsic Mermaid overflow before the renderer-width fix; no product claim is based on the early harness failure alone.
- `review-green-acceptance-playwright.txt`, `green-complex-measurements.json`, and `green-complex-*.png`: actual `DocumentSurface`, `AtomicCodeMirrorEditor`, and `MergeView` passed rapid pending light/dark/system repaint, identical diagrams, runtime table resizing, pure add/delete and edited diff chunks, exact source roundtrip/re-entry, final-edge table/Mermaid scrolling, and 1280/1440/1920 x light/dark at 100% plus genuine `chrome.tabs.setZoom(2)`.
- `review-red-katex-channel.txt`: after removal of the corrected implementation, the exact assertions failed for both an author-selected former sentinel color and an unexpected KaTeX throw. `review-green-katex-channel.txt` is a superseded intermediate run because it used expected parse exceptions. The final result is `review-green-katex-nonexception.txt` (6/6): ordinary invalid input uses two `throwOnError:false` results, while only genuinely unexpected renderer failure reaches `catch`.

## Regression evidence

- `green-targeted-editor.txt`: 64 targeted editor tests passed.
- `final-editor-full.txt`: 261 passed, 1 pre-existing skip. `final-web-full.txt`: 722 passed.
- `final-editor-typecheck.txt`, `final-web-typecheck.txt`: both typechecks passed. `final-editor-build.txt`, `final-web-build.txt`: both production builds passed.
- `final-issue55-editor-browser.txt`: issue 55 editor Playwright 7/7 passed.
- `final-editor-browser-all.txt` preserves the RED font-loading race (KaTeX 3/4). `review-green-math-geometry.txt` and `final-editor-browser-all-green.txt` synchronize the measurement on `document.fonts.ready`; the full updated aggregate exits 0 with Mermaid 12/12, table 4/4, heightmap 7/7, tags 2/2, KaTeX 4/4, inline 6/6, and issue55 7/7.
- `final-web-browser-all.txt`: the updated normal web aggregate executes the complex-content checker first; its theme stress, 12 environments, and genuine 200% zoom pass. The next pre-existing authenticated suite exits 2 because `DOCULIGHT_E2E_USER`/`DOCULIGHT_E2E_PASS` and the external API fixture are absent, so later credential-dependent suites are not claimed as run.
- `final-web-browser-all-fixture.txt`: a disposable generated account/API fixture passes complex, auth 11/11, focus 5/5, and IME 3/3, then fails at the old search checker's stale-placeholder timeout. `final-web-browser-remaining-fixture.txt` starts at search and proceeds through merge, styles, theme, ACL, trash, and gestures; it records merge 7/7, styles 3/3, theme PASS and gestures 4/4, plus the unrelated current search timeout, ACL inheritance (7/8), and trash setup/locator failures. No issue55 assertion fails, and no broad process termination or persisted credential is used.
- `review-green-error-playwright.txt`: malformed Mermaid source disclosure is operable in live mode, preserves focus/open state through a theme repaint, and changes measured height.
- `review-green-playwright-matrix.txt`: theme stress plus all 12 product-component environments passed, including genuine extension zoom and final-edge local scrolling.
- `review-issue54-editor-regression.txt`: product autosave/cursor/theme/typography regression and its own 12-environment matrix passed.
- `spec-validate.txt`: zero errors and one unrelated pre-existing `SRS-W072` warning.

## Limits

- The synthetic composition regressions remain synthetic browser events; no native Windows IME session was performed.
- The initial KaTeX 3/4 result measured before KaTeX web fonts settled (exponent 178px, base 177px). Waiting on the browser's font readiness produces the stable product geometry (176px vs 182px) without changing the assertion or product CSS.
- The authenticated merge browser flow was rerun with the disposable generated fixture and passed 7/7 in `final-web-browser-remaining-fixture.txt`. The product `MergeView` cue helper is also covered by Vitest, and the issue55 fixture includes the shipped `MergeView`.
- No SRS lifecycle/status mutation was made. The implementation supplies additional evidence for `IR-EDITOR-002`, but the requirement also owns work outside issue 55, so this patch does not claim full verification.
