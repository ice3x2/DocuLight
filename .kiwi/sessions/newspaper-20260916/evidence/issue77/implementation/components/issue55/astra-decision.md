# Issue 55 — binding complex-content newspaper decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation direction; `docs/spec/` remains the acceptance authority. No product implementation, executed tests or requirement verification is claimed.

## Authority and explicit partition

Read AGENTS, SRS index, GitHub #55, approved #54 decision and its independent PASS rereview, newspaper decision/guide/handoff, current core code/math/Mermaid/tag renderers, common/vendor styles, table event handling and MergeView. Read installed Shiki CSS-variable-theme implementation to choose a supported rendering path. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `rootSource=server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers. FR-EDITOR-007, FR-EDITOR-010 and IR-EDITOR-001 are verified/evolving; IR-EDITOR-002 is planned/stable at this read.

The approved [#54 decision](../issue54/astra-decision.md) remains authoritative for base typography, 720px text measure, central-container padding breakpoint, atomic mappings, source mode, search/caret/selection and runtime theme/editor identity. Do not duplicate or replace those rules. Its accepted checkbox review maps the checked glyph to `--text-on-primary`; #55 must preserve that repair.

| SRS coverage | #55 obligation | Other owner |
| --- | --- | --- |
| IR-EDITOR-002 AC-1 | Rendered-code 14/22px mono parity | #54 base typography/measure; PAT remains settings work |
| IR-EDITOR-002 AC-2 | Consume shared integration and preserve theme propagation | #54 supplies base/source/search/caret/open-merge theme integration |
| IR-EDITOR-002 AC-3 | Complete all ten-element style/behavior checks, code/table containment, syntax colors, tags/links/quotes, KaTeX and Mermaid | No new parser or element family |
| IR-EDITOR-002 AC-4 | Mermaid theme/cache update, math/diagram error source access, minimal difference non-color cues | #57 retains compare/merge navigation, layout and action UX; #55 may minimally wire cues into existing MergeView |
| IR-EDITOR-002 AC-5 | Repeat all affected geometry, selection/undo, IME, autosave and conflict/body-recovery regression after widget changes | Retain #54 evidence, add #55 evidence; never infer untested compound-AC completion |
| FR-EDITOR-007 AC-1..12 | Preserve ten-element source reveal, actual tag-to-search routing and frontmatter exclusion | Existing permission/navigation behavior unchanged |
| FR-EDITOR-010 AC-1..4; IR-EDITOR-001 AC-1..4 | Real KaTeX font/layout/single visual rendering; actual product common stylesheet and tag appearance | Demo is supplementary evidence |

Scope is editor core/styles plus the minimum existing MergeView integration needed for the already-agreed AC-4 cue. No new language support, formatter, renderer replacement, toolbar action, dependency, font download, server/API, save policy or Phase 2 behavior. Native source textarea and author-entered text are preserved.

## Code rendering and overflow

Use Shiki's installed `createCssVariablesTheme` path for rendered code. Give it one stable theme name and semantic variable map; remove the `github-light` output lock. Keep Shiki as the renderer. CSS-driven tokens make existing blocks update when root roles change without rehighlighting or remounting the editor. Delayed highlight results remain theme-independent; attach them only to the still-current widget for that code/language. Do not implement a second per-theme HTML cache if CSS variables already solve the issue.

| Emitted Shiki variable suffix (`--shiki-`) | Existing semantic role |
| --- | --- |
| `foreground`, `token-parameter` | `--text-primary` |
| `background` | `--surface-app` |
| `token-comment`, `token-punctuation` | `--text-secondary` |
| `token-keyword`, `token-function`, `token-link` | `--action-primary` |
| `token-string`, `token-string-expression`, `token-inserted` | `--status-success` |
| `token-constant`, `token-changed` | `--status-warning` |
| `token-deleted` | `--status-danger` |

Define every variable actually emitted by the supported renderer samples; do not leave token text with an unresolved value or a dark-only fallback. If existing ANSI rendering is exercised, map black/white to primary text, bright-black to secondary, red to danger, green to success, yellow to warning, blue/magenta/cyan to action-primary, including bright counterparts. These are semantic ink groups, not new palette colors. Use `fontStyle:false` for the generated code theme so async highlighting adds color without changing glyph metrics; preserve code bytes, whitespace and tab content. Plain text is shown immediately while highlighting loads. Unsupported/empty language remains escaped readable source; it is not a destructive error. Use available language membership checks for predictable unsupported inputs rather than introducing exceptions as normal branches.

Rendered code: 14/22px mono as fixed by #54, app-surface background, primary text, 4px radius, 12px inner padding, no shadow. The outer measured wrapper retains its existing 1em vertical **padding**, zero margin. The inner code viewport owns `overflow-x:auto`, `white-space:pre`, `max-width:100%`, with no wrapping that changes code appearance. Use the same inner box and metrics before/after async highlighting, with zero nested pre margins. Avoid a second scrollbar on the outer wrapper. Long code must scroll horizontally to its final character while the editor/app width stays fixed.

Revealed live-preview fenced source keeps the existing CodeMirror line-wrapping/reveal model and single document. Source textarea preserves its own horizontal scroll. The rendered-code overflow rule does not authorize nested editors or independent editing documents. Unknown-language fences must have bounded readable presentation without inventing language detection.

## Tables, tags, links, quotes and lists

- Preserve table parsing, markdown alignment and existing event contract: edit-mode `mousedown` may reveal the table source; other table events retain their current ownership. Do not replace this with a generic clickable wrapper. Keep the table wrapper's existing 0.5em vertical padding and zero outer margin; it owns horizontal scroll and `overscroll-behavior-x:contain`. Table remains `width:max-content; min-width:100%`; ancestors keep `min-width:0`. Provide keyboard reachability for an overflowing noninteractive viewport if existing cell focus cannot reach its horizontal range; label that viewport `표`, without trapping Arrow keys during cell editing.
- Table header uses app surface and weight 600; body uses document surface; text primary, 1px subtle grid, 8px vertical/12px horizontal cell padding, natural row height. Preserve author-specified left/center/right alignment instead of inferring numeric alignment or sorting. Do not impose the management-table 40px contract on markdown content. Cell focus uses the existing focus role and an actually visible ring; reserve a separation area as needed without altering data or hiding border cells. Do not add zebra striping, toolbar or sticky headers.
- Tag chips use selected surface/action-primary text, 3px radius, existing inline 0.08em vertical/0.5em horizontal padding and 0.9em font size. Long names wrap with the line and remain fully available. Hover changes text to action-primary-hover; focus uses 2px focus role plus 2px separation, without converting the inline chip into a 36px block that changes line geometry. Keep existing role/name/callback semantics; Enter/Space activates once and does not submit another control or page-scroll as a side effect. Verify actual AppShell left-search activation with the existing `#name` query, not only callback emission. Frontmatter and verbatim text remain untransformed.
- Resolved links retain action-primary and underline, hover action-primary-hover, and existing text-edit/open-link gesture separation. Missing and forbidden wiki targets retain identical style/metadata and no existence hint. Keep all link security/navigation rules. Quotes retain #54's serif metrics with primary text, 2px action-primary left rail and 16px inset. Emphasis, heading and list-marker rules are inherited, with no new transforms. Task-checkbox pseudo-glyph remains text-on-primary on action-primary fill; test read-only/editable and checked/unchecked states without changing marker semantics.

## KaTeX and error source access

Keep the one common editor entry importing KaTeX CSS. Do not duplicate imports per widget, remove MathML, restyle KaTeX descendants with app font rules, or flatten its nested line heights. Successful math uses primary text. Inline math participates in the paragraph baseline; block math retains 1em outer-wrapper vertical padding, `.katex-display { margin:0 }` and local horizontal scrolling if required. Preserve actual superscript/subscript/fraction/radical layout and bundled KaTeX fonts. MathML is visually hidden by KaTeX's own technique while remaining available to accessibility tools; do not claim single rendering by deleting it.

For invalid math, display the short visible label `수식 오류` with exact available TeX source as selectable escaped text. Inline errors remain phrasing content, so do not insert a block `details` inside an inline span. Display errors may use a block source area. Apply danger text on danger surface; allow source wrapping and preserve source characters. Failure must not throw through the editor or hide the source behind edit permission. Existing `throwOnError:false` behavior and ordinary invalid partial input must be handled as a render result, without treating user typing as a fatal exception.

Mermaid errors display `다이어그램을 표시할 수 없습니다.` and native keyboard-operable `details`/`summary` labeled `원문 보기`, with exact available diagram source in escaped/selectable mono text. The disclosure works in view-only mode and live mode, does not make source editable, and must not trigger CodeMirror selection-reveal when the user is operating the disclosure. Events outside that control retain the existing live-preview reveal contract. Do not expose raw stack traces, filesystem paths or detached Mermaid error graphics. Expanding/collapsing changes measured height and must trigger correct CodeMirror measurement. Preserve disclosure open state/focus across a color-only theme change where the same error remains.

## Mermaid presentation, theme generation and cache

Keep lazy loading and `startOnLoad:false`, `securityLevel:'strict'`, `theme:'base'`, `suppressErrorRendering:true`, unique render IDs and temporary-node cleanup on both success/failure. Use root resolved theme and **computed semantic color values**, not raw `var(...)` expressions, for Mermaid configuration:

| Mermaid role | Value source |
| --- | --- |
| Canvas/background | document surface |
| Primary / secondary / tertiary node fill | selected / control / app surface |
| Node and general label text | primary text |
| Node outlines, arrows and connector lines | border-control |
| Edge label backing | document surface |
| Note fill / text and outline | warning surface / status-warning |
| Diagram font | shared sans, 16px |

Use these roles consistently for generated flowchart/sequence/class/state fixtures rather than leaving a secondary default-blue theme branch. User-authored Mermaid syntax/styles are not rewritten; palette checks use diagrams without explicit author color overrides. No new diagram type is added.

Keep the measured block's 0.6em vertical padding. Inner panel uses document surface, 16px padding, 1px subtle border, 4px radius. Small diagrams are centered. Large diagrams retain intrinsic readable geometry and scroll inside the panel; do not shrink their 16px labels merely to fit a narrow column at 200%. Both left and right diagram edges must remain reachable: a centered oversized flex child may not clip its starting edge. A keyboard-scrollable overflowing diagram region gets an accessible `다이어그램` name. No zoom/pan toolbar is introduced.

Theme change must update already-rendered visible diagrams and diagrams returning from virtualization without editing text or rebuilding EditorView. Reuse #54's root-theme observation/integration path where appropriate; do not create one unmanaged document observer per widget. A widget's color/config generation is part of rendering identity; viewport reentry must not compare equal solely by source while retaining an old SVG.

Cache rules are explicit:

1. Source/config cache keys include exact code plus resolved palette/font/security configuration (or a deterministic signature of those values). Do not reuse old-theme SVG output. Keep any cache in memory; do not introduce document-content persistence.
2. Measured-size keys additionally include available render width. Preserve an appropriate previous measured placeholder during async replacement, then replace its reserved height with the current measurement rather than keeping an obsolete permanent minimum. Request editor measurement after DOM/height changes, including fonts finishing load and error disclosure toggles where applicable.
3. Serialize global Mermaid initialization and render as one operation, or provide an equivalently race-safe per-render strategy. A render must use its captured configuration even if root theme changes during the await. A stale result must not attach or update current-generation size cache after theme/code/widget changes or destruction.
4. On virtualized detach/destroy release observers/listeners and ignore pending output for detached widgets. Generated IDs remain unique even when identical code is rendered twice. Theme-only changes preserve markdown, selection, undo/history, composition and save state; defer any necessary editor-state reconfiguration until composition ends.

## Minimal comparison cues under the approved partition

#54 supplies existing MergeView theme plumbing. #55 adds only the AC-4 non-color distinction: real visible DOM `+ 추가` on inserted chunks and `− 삭제` on removed chunks (or equivalent accessible gutter labels associated with each changed chunk), using success/danger text and surfaces. Unchanged chunks get no marker. Pure insertion and pure deletion must both produce visible labels. A static legend or two pane titles alone is insufficient. Markers update when right-hand editing recomputes chunks and when chunks enter the viewport; do not scrape only initial DOM or rebuild the merge editor on each change. Keep signs out of copied/saved source, preserve accessible ins/del semantics where present and preserve both source copies. No accept/reject action, navigation or full comparison redesign belongs here; those remain #57.

## Acceptance and evidence checklist

- [ ] TDD: observe failing tests for theme changes, stale async output, width-aware size handling, error source/disclosure, difference cues and new computed styles before implementation. Preserve existing test strength; regression fixtures must not silently adapt to changed output without checking the original contract.
- [ ] Use actual product DocumentSurface/common editor stylesheet and runtime theme path, plus a built-product smoke check. Demo-only or class-presence tests do not satisfy IR-EDITOR-001. No production code was changed by this decision.
- [ ] Run 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200% = 12 environments with read/live samples of all ten elements and source roundtrip checks. Real zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)` with `getZoom===2`, pre/post CSS viewport and DPR recorded; CSS transform/zoom or smaller emulated viewport is not evidence. Preserve #54 width/padding contracts.
- [ ] Capture screenshots plus actual computed text/fill/border/pseudo-element colors, radii, fonts, scroll extents and focus bounds. Normal text ≥4.5:1, large text ≥3:1, focus/interactive boundaries and checkbox glyph ≥3:1. Explicitly check Shiki comments/strings/keywords and selected-code contrast, Mermaid generated labels/outlines, error source and task-checkbox glyph/fill in both themes.
- [ ] Long unbroken Korean/Latin code, long tags, multi-column table and wide diagram reach their final content through local scrolling; editor/app width does not grow. Keyboard can reach/scroll the regions and return to editing. Clipboard/source roundtrips preserve text and omit diff labels. In read-only mode, no attempted widget action changes document bytes.
- [ ] Theme stress: light→dark→light and system-theme change while Shiki/Mermaid work is pending; identical diagrams in two locations; theme change after rendering; virtualized exit/reentry; width/zoom change; destroyed/remounted document. Current output wins, SVG IDs are unique, stale size does not stick, no detached temporary nodes remain, and editor identity/focus/selection/history remain stable.
- [ ] KaTeX: inline and display specimens show KaTeX fonts, one visual rendering with MathML visually hidden, and real superscript/subscript/fraction/radical positioning. Malformed math and Mermaid expose exact selectable source to keyboard in view-only and edit modes; diagram disclosure retains focus and correct height through theme change. Long diagnostic/source text stays bounded.
- [ ] Ten-element matrix: headings, emphasis, lists, links, quote, code, table, math, Mermaid and tags each retain rendered-to-source behavior on cursor entry and restoration on exit. Preserve external link and wiki-link semantics, missing/forbidden indistinguishability, tag-to-real-left-search routing and frontmatter exclusion. Include task-checkbox toggle and pseudo-style states from #54's accepted review.
- [ ] Product coordinate regression: verify actual pointer clicks and resulting selection/`posAtCoords` on lines after code/table/math/Mermaid and on table cells, before/after async render, disclosure, theme change, scroll and reentry at 100%/200%. Retain padding-owned wrappers with no cumulative heightmap drift. Exercise table source reveal and existing cell keyboard/IME paths; do not broaden `ignoreEvent` indiscriminately to make a test pass.
- [ ] Real Korean composition in paragraph, relevant existing table editing path and source: multi-stage composition, commit/cancel/Enter, theme change during composition, undo/redo; no duplicate/lost text or unintended activation. Native Windows Korean IME headed/manual evidence is required for a native-IME claim; synthetic/CDP composition is supplemental and must be labeled accordingly.
- [ ] Actual autosave/manual-save success, conflict and rejected save preserve active element/cursor and accept immediately following input. Preserve local body download and merge recovery. Observe real request completion, not only a timeout. Theme/render updates themselves do not save or mutate markdown.
- [ ] Existing editor unit/browser/table/drift/math/inline/tag and web style/focus regressions pass after the change. Record commands, owned fixture/server and outcomes; terminate only owned test processes. Add product-browser coverage for effects previously tested only in the demo.
- [ ] Actual already-open comparison: additions/deletions visible without relying on color, including pure insertion/deletion and edited/virtualized chunks; labels remain correctly associated after theme change; right-hand draft and saved/copied content contain no display markers. Full comparison UX remains #57.
- [ ] State accounting: normal/hover/focus/selected, read-only/edit-disabled, asynchronous loading, empty code/diagram source and invalid/error source apply by component. Unsupported syntax remains readable fallback. No invented validation for raw markdown. Independently review original issue/SRS, final diff and red/green/browser evidence before closure; report any native-IME or other unperformed checks as pending rather than verified.

This decision freezes design only. #55 can complete its scoped IR-EDITOR-002 AC-3/4 contributions and add AC-1/5 evidence, but must not mark the entire requirement verified while another owned portion lacks evidence.
