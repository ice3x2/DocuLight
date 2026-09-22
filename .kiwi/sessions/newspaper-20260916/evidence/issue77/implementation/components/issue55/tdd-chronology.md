# Issue 55 TDD chronology

| Final behavior | Pre-implementation RED | GREEN |
|---|---|---|
| Shiki emits semantic CSS variables and no fixed light theme | `red-unit.txt`, test 1 | `green-unit.txt`, test 1 |
| Mermaid measured size separates theme/config/width identity | `red-unit.txt`, test 2 | `green-unit.txt`, test 2 |
| Invalid TeX exposes `수식 오류` and exact escaped source | `red-unit.txt`, test 3 | `green-unit.txt`, test 3 |
| Merge changes have deterministic add/delete text cues | `red-diff-unit.txt` | `green-diff-unit.txt` |
| Actual product merge chunks expose both non-color cue DOM labels | `red-playwright-diff-cues.txt` (cue implementation removed; assertion reached) | `green-playwright-matrix.txt` |
| Live-mode Mermaid error disclosure does not reveal/remove its widget | `review-red-error-disclosure.txt` (details event ownership removed; Playwright reached summary-focus timeout) | `review-green-error-playwright.txt` |
| Resolved Mermaid palette/font/security/width form rendering identity | `review-red-config-math.txt` (missing signature API at target assertion) | `review-green-targeted.txt` |
| Code is locally scrollable with 14/22 type | `red-playwright.txt`, reached computed-style failure | `green-playwright.txt` |
| Table/diagram keyboard regions and 2px quote rail | The original browser run did not reach these assertions because the virtualized targets were absent. They are green-only browser coverage; existing table/diagram keyboard semantics and the binding design decision provided the behavior contract. | `green-playwright.txt`, `green-playwright-matrix.txt` |
| KaTeX invalid-result detection cannot collide with an author color; unexpected throws stay contained | `review-red-katex-channel.txt` (corrected implementation removed; both target assertions failed) | `review-green-katex-channel.txt` (6/6) |
| Ordinary invalid TeX stays on KaTeX's non-throwing result path while truly unexpected renderer throws are contained | `review-red-katex-channel.txt` is the preserved behavior RED; the first GREEN used `throwOnError:true` and was rejected in independent review. | `review-green-katex-nonexception.txt` (6/6) uses two non-throwing result renders with distinct error colors; only an option-dependent result is classified invalid, so an author color cannot collide. |
| KaTeX superscript geometry is measured after its actual web fonts settle | `final-editor-browser-all.txt` reached AC-3 and failed at 178px versus 177px before font readiness | `review-green-math-geometry.txt` passes unchanged AC-3 at 176px versus 182px; `final-editor-browser-all-green.txt` completes every aggregate stage. |
| Intrinsic Mermaid overflow reaches its real final edge; resize state, pending theme race, identical diagrams, pure/edited diff chunks, exact source roundtrip, and widget re-entry remain correct | `review-red-acceptance-playwright.txt` records the first broadened run. Its source-mode failure is a checker sequencing RED and is not claimed as product RED. The intrinsic-overflow assertion then failed in a separate raw run whose stdout was overwritten by the next run; this axis therefore has GREEN product evidence but no preserved standalone raw RED claim. | `review-green-acceptance-playwright.txt`, `green-complex-measurements.json` |
| Complex-content Playwright participates in normal aggregates | package-script wiring is structural and had no behavior implementation RED | `final-editor-browser-all-green.txt` exits 0 including issue55 7/7. `final-web-browser-all.txt` runs complex first and passes its 12 environments, then records the unavailable external authenticated-fixture prerequisite. |

No RED claim is made for the final 12-environment repetition itself; it repeats the same product-component geometry contracts across theme, viewport, and genuine browser zoom.
