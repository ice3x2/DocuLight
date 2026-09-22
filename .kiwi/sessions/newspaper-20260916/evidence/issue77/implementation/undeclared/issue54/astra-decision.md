# Issue 54 — binding editor newspaper decisions

Decision: Astra, 2026-09-17, under delegated design ownership. This is implementation direction supporting `docs/spec/`, not an alternate requirements source or completion evidence. No implementation or tests were performed for this decision.

## Authority, baseline and scope partition

Read AGENTS, SRS index, GitHub #54/#55, newspaper decision/guide/forms/handoff, `DocumentSurface`, `MergeView`, atomic theme/stylesheet/editor assembly, editor CSS, Mermaid/code/math renderers and current browser runners. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers. IR-EDITOR-002 is planned/stable. IR-EDITOR-001, FR-EDITOR-007 and FR-EDITOR-009 are verified/evolving; FR-EDITOR-003 is verified/stable.

Observed: product and demo already import the common editor stylesheet. Its vendor light override declares atomic variables on the editor itself, defeating a root-only map. CodeMirror theme forces `dark:true`; source mode is a native textarea; Mermaid initializes once and caches size by code alone; Shiki uses `github-light`; merge editors do not receive the atomic theme. Preserve the existing editor identity, ref-owned body and autosave paths.

| IR-EDITOR-002 AC | #54 deliverable | Later owner / boundary |
| --- | --- | --- |
| AC-1 | Read/live typography, headings/quote, 720px text measure and padding; source/inline-code/revealed-fence typography | #55 rendered code-widget typography parity. PAT belongs to its existing settings work, not this slice. Do not claim the whole AC solely from #54 if those parts lack evidence. |
| AC-2 | Semantic mapping, atomic/CM theme alignment, read/live/source/search/selection/caret, and already-open comparison editor colors/fonts on theme change | Minimal shared integration or MergeView wiring is allowed for this explicitly named AC. Comparison navigation/actions remain #57. |
| AC-3 | Preserve all existing ten-element behavior and containment while changing base typography | #55 owns complete complex-content styling, rendered-code highlighting, table overflow, KaTeX, tag/link detail and Mermaid palette verification. |
| AC-4 | Preserve existing error/source and comparison semantics; consume shared status tokens | #55 owns Mermaid invalidation, math/diagram error source access and difference non-color cues. #57 later owns complete compare/merge screen treatment. These are explicit outstanding AC portions, not N/A. |
| AC-5 | Run editor geometry, focus/save, IME, text/selection/undo and conflict/recovery regressions after #54 | #55 repeats impacted checks after widget changes. Neither issue alone closes unverified portions of this compound requirement. |

Assumptions: #46 approved runtime light/dark/system mapping and #50 shell geometry remain authoritative. No editor replacement, new document model, dependency, font download, mobile mode, search engine or save policy is introduced. #54's source mode remains the existing textarea; do not add a CodeMirror source editor or source-search feature in this style issue.

## Typography and geometry — frozen for #54

Use the existing sans/serif/mono tokens: `"Malgun Gothic", system-ui, sans-serif`; `Batang, Georgia, serif`; `Consolas, monospace`. CSS sizes use rem; values below assume the unchanged 16px root. Preserve text bytes and case; no text transform, justification, clipping or line clamp.

| Surface | Size / line height | Weight / family |
| --- | --- | --- |
| Read/live body | 16 / 28px | 400 sans |
| H1 | 36 / 50px | 700 serif |
| H2 | 24 / 36px | 700 serif |
| H3 | 20 / 30px | 700 serif |
| H4 | 18 / 28px | 600 serif |
| H5, H6 | 16 / 28px | 600 serif |
| Blockquote | 18 / 30px | 400 serif, primary text |
| Source, inline code, revealed fence; rendered code in #55 | 14 / 22px | 400 mono; inline code retains the surrounding paragraph line box |
| Search and mode controls / count | 14 / 22px sans / 12 / 18px sans | Existing functional labels; no new search features |

Reading measure means **text content width**, not a 720px padded border box. Read/live column: text width `min(720px, available width minus horizontal padding)`, centered. Horizontal padding 40px each; use 24px each when the central editor container is narrower than 800 CSS px, including real browser zoom. The central editor container, not overall window width, is the breakpoint authority. Container border-box limit is therefore 800px normally or 768px in the narrow case, capped at available width. Scope this geometry to the reading column, not search UI or merge panes. Source uses the available central width with the same side padding and no 720px cap; preserve whitespace and use its own horizontal scroll for long source lines, with no app-width growth.

Keep top content padding 16px and the existing CodeMirror bottom editing space (40vh) unless a measured reachability defect requires a separate scoped adjustment. Preserve existing small heading padding and block-wrapper padding, expressed inside measured boxes; do not add outer margins to CM lines or widgets. Typography is identical before/after source-reveal on the same live-preview heading/quote line. Long Korean titles and unbroken prose wrap naturally. No minimum reading width that fights the shell's existing 240px center minimum at zoom.

The document surface is a bounded flex column: mode toolbar and visible notices are outside the body scroller; read/live retain CodeMirror's own scroller, source its own textarea scroller. Keep `min-width:0`/`min-height:0` through the chain, including the source region, and prevent the textarea from resizing outside the region. Search remains CodeMirror's top panel, outside document scrolling, with minimum 36px input/button targets and 4px control radius. At a narrow center width its input/count can occupy one row and navigation/close a second; no hidden controls or horizontal clipping. Mode controls may wrap naturally. Existing aria-pressed and edit-permission aria-disabled behavior remain intact.

## Shared integration and exact token mapping — #54

Keep `packages/editor/src/styles/editor.css` as the single editor style entry for product and demo; import one integration sheet after vendor/KaTeX styles. Map semantic roles at the editor element with sufficient specificity to supersede its own vendor light declarations. Do not rely on ancestor-only custom properties or CSS import order against a more specific child rule. Keep raw color literals in the existing palette source. The package integration consumes semantic roles, never imports web app code. The demo may load the existing palette/non-color/light/dark role files from the application as development-only inputs; do not copy their values into a second palette or import the app's Tailwind/shell/UI layer into the editor package.

| Atomic variable / surface | Semantic source |
| --- | --- |
| `fg` | `--text-primary` |
| `fg-muted`, `fg-faint` | `--text-secondary` (syntax punctuation is readable text, not disabled text) |
| `bg` | `--surface-document` |
| `bg-panel` | `--surface-app` |
| `bg-surface` | `--surface-control` |
| `border` | `--border-subtle`; search/tooltip active boundaries use `--border-control` explicitly |
| `accent`, `accent-bright`, `accent-soft`, code rail | `--action-primary`; cursor may use `--text-primary` as stated below |
| `link` / `link-hover` | `--action-primary` / `--action-primary-hover`; preserve underline |
| `code-bg` | `--surface-app` |
| `selection-bg` | `--surface-selected` |
| `search-bg` | `--surface-warning` |
| `search-bg-active` | `--surface-selected`, plus 2px solid `--action-primary` outline |
| `initial-reveal-bg`, `initial-reveal-bg-strong` | `--surface-warning`, `--surface-selected`; preserve existing fade behavior |
| `font`, `font-mono`, body size/leading, measure | Shared font tokens, 1rem / 1.75rem and 45rem text measure |
| `hl-keyword`, `hl-function`, `hl-property`, `hl-escape`, `hl-operator` | `--action-primary` |
| `hl-string`, `hl-regexp`, `hl-tag` | `--status-success` |
| `hl-number`, `hl-type` | `--status-warning` |
| `hl-comment` | `--text-secondary`, retain italic |
| `hl-variable` | `--text-primary` |
| `hl-invalid` | `--status-danger` |

Task checkbox checked fill/border follows `--action-primary`; its checked glyph (including the existing pseudo-element stroke) must follow `--text-on-primary`, not hardcoded white. This foreground mapping is part of #54's atomic semantic integration because changing the accent fill otherwise leaves the existing glyph unreadable in dark mode. Preserve checkbox behavior and the #55 ownership of complete ten-element styling/regression; this is not a new task-list feature.

All variable names in the table have the existing `--atomic-editor-` prefix. Additional geometric/font-role variables may be introduced only where consumed. Body CodeMirror and source native selection use selected surface with primary text. Retain the special fenced-code selection overlay so an opaque code backdrop cannot hide selection. CodeMirror's drawSelection layer may preserve readable syntax token colors; measure those against selection fill. Caret/drop cursor is a 2px primary-text stroke in both themes. Focused editor and source region have a 2px focus ring with a 2px opaque separation area; reserve its extent outside the scrolling content so it does not clip or alter measured line geometry. Shared search/mode controls use the same focus contract.

Replace the unconditional dark flag with resolved-theme-aware CodeMirror configuration, scoped to the editor instance. Root `data-theme` remains the theme authority. Update a theme compartment/facet or equivalent stable configuration without destroying the EditorView, changing document identity, dispatching document edits, resetting selection/history, remounting source textarea or calling autosave. CSS colors change directly; any state reconfiguration during active composition must be deferred until composition ends. Check existing transaction filters: a theme-only reconfiguration must not be interpreted as leaving read-only mode or move selection out of a Mermaid block. Preserve preexisting genuine read-only transition rules.

Comparison panes use document surface, 14/22px mono, primary text, semantic selection/caret, and addition/deletion surfaces from success/danger. Existing open panes must follow theme without rebuild or loss of right-hand draft. Style integration must cover generated CodeMirror theme specificity; a CSS variable existing on the root is not evidence. Minimal MergeView styling/theme plumbing under AC-2 is authorized, but do not redesign its controls, remove accessible source copies or change resolution semantics in #54.

Measure actual normal text contrast ≥4.5:1, large text ≥3:1 and active boundaries/focus indicators ≥3:1 in both themes. These are required checks, not claimed results; do not silently invent new palette colors to fix a failure.

## Complex-content handoff — binding decisions for #55, preservation gates for #54

1. **Code/table containment:** the measured outer block wrapper owns vertical padding; its inner content owns horizontal scrolling. Keep table `width:max-content; min-width:100%` inside the bounded wrapper and preserve the `.cm-content` minimum-width fix. Rendered code uses 14/22px mono, app-surface background, no outer pre margins and 12px inner padding, with `white-space:pre` and horizontal scroll. In editable revealed fences, preserve the current editor line-wrapping/reveal model; never create separate independently editable code documents merely to add a scrollbar. Tests distinguish rendered block scrolling from revealed source wrapping. Unknown language remains escaped, readable source. Shiki must cease forcing `github-light`; derive light/dark highlighting consistently and update already-rendered blocks while retaining original code bytes.
2. **Table and inline roles:** table header/code backdrop uses app surface, body document surface, primary text, subtle grid; interactive cell focus uses focus role. Retain formatting/link behavior and markdown alignment. Tags use selected surface/action text with 3px radius, keep existing click routing; links remain underlined and missing/forbidden wiki targets remain indistinguishable. Quote rail is 2px action-primary with 16px left inset. Do not change parsing ownership or frontmatter treatment.
3. **Mermaid theme/cache:** keep lazy module loading, `securityLevel:'strict'`, `theme:'base'`, suppressed global error graphics and temporary-node cleanup. Resolve actual semantic CSS colors, not `var(...)` strings, for renderer configuration: primary=selected surface; secondary=control surface; tertiary=app surface; text on all=primary text; node borders/connector lines=border-control; note fill=warning surface, note border/text=status-warning. Background=document surface and font=sans. Theme changes invalidate/update visible diagrams and subsequent virtualized reentries without text edits. Cache identity must distinguish diagram source and resolved theme/configuration; measured-size cache additionally distinguishes available render width. Preserve temporary reserved height until new measurement and request CodeMirror measurement after asynchronous size changes. Reject stale async results from an earlier theme generation, ensure unique SVG IDs per widget and release listeners on destroy. Serialized renderer configuration/render calls or another race-safe per-render strategy must prevent a global Mermaid initialization from painting a diagram using another in-flight theme.
4. **Math/errors:** retain the one shared KaTeX stylesheet, its font/layout rules and hidden MathML accessibility representation; never globally apply UI fonts to KaTeX descendants. Keep `.katex-display` margin zero inside padding-owning math wrappers. Math uses primary text; invalid source uses danger text/surface with an explicit error label. Both math and Mermaid error widgets expose the exact available source as selectable escaped text: use a keyboard-operable native `details`/`summary` (`원문 보기`) for a diagram, and directly visible source or the same disclosure for math. This works in read-only/view permission without enabling editing; in live mode existing cursor reveal remains. Do not send error/source through HTML injection, hide all source behind edit permission, or expose raw stack paths as an error explanation.
5. **Difference cues:** added/removed changed chunks retain success/danger roles and also real DOM `+ 추가` / `− 삭제` labels or equivalent accessible gutter markers associated with each changed chunk. Preserve source text; signs are presentation, not copied/saved document content. A legend alone or CSS-only color change does not satisfy the cue contract. Existing ins/del semantics may supplement the visible labels. #55 covers this minimal AC-4 cue; #57 owns the wider comparison screen UX.

## TDD, real browser and independent verification checklist

- [ ] Before each behavior/style implementation, add failing behavior or browser computed-style assertions and observe red. Preserve original test strength. Do not justify implementation-first code by adding tests afterward.
- [ ] Product-route browser tests use actual DocumentSurface, common stylesheet and current app theme runtime. Include one built-production smoke check. Demo checks supplement product checks; component-only fixtures do not replace the product route or autosave wiring.
- [ ] Geometry/style matrix: 1280×720, 1440×900, 1920×1080 × light/dark × actual 100%/200% = 12 environments, each read/live/source. Record central width, column content width, padding, body/H1/H2/H3/quote/source computed font/line-height, target sizes, focus outlines, scroll extents and screenshots. Include long Korean heading, unbroken URL, many paragraphs and code/table/math/Mermaid before a clickable target paragraph.
- [ ] Real 200% uses isolated persistent Chromium plus extension `chrome.tabs.setZoom(tabId,2)`; assert `getZoom===2` and record the before/after effective CSS viewport/DPR. CSS zoom/transform, deviceScaleFactor or halving viewport is not a substitute. Reuse the existing #50/#52 zoom runner discipline. Record 800px editor-container breakpoint neighbors and verify narrow-center padding as well as whole-shell access.
- [ ] On a single mounted document, test light→dark→light and system-theme changes with body search open, active match and selection present. Check foreground/background including selected code, caret, search controls, tooltip and existing open merge panes. Preserve editor DOM identity, source textarea identity/value/selection and right-hand merge draft across theme changes. No extra save requests from theme-only changes.
- [ ] In the actual product editor, test task checkboxes in light/dark unchecked, checked, hover and keyboard-focus states. Read computed element and `::before`/`::after` styles for the actual fill, glyph stroke/color, border and focus indicator, and retain screenshots. Calculate contrast from those rendered pairs: checked glyph against checked fill and unchecked/focus boundaries against their adjacent surfaces must reach 3:1. Verify the real checkbox toggle still updates only its existing markdown marker. A root token assertion or icon class assertion alone is insufficient.
- [ ] Verify read→live→source→live→read preserves exact markdown, including table separators, footnote definitions, emoji, Korean text and trailing whitespace. Assert complete long-heading visibility. Verify view-only cannot edit and rendered text remains selectable/copyable.
- [ ] Real keyboard/pointer focus: mode/search controls reachable at narrow width; Ctrl/Cmd+F, Enter/Shift+Enter and Escape retain existing search behavior; no focus-ring clipping. Test selection, cursor position and undo/redo in live/source around a theme change; preserve current mode-transition semantics rather than adding new selection/history transfer between separately mounted modes.
- [ ] Autosave/manual-save regression through actual product wiring: wait for observed save completion, assert same editor/active element and cursor, immediately type more and verify body and saved content. Cover success, server conflict and rejected save; retain local body download and merge recovery. Do not replace network completion with a fixed delay as proof of success.
- [ ] Korean IME: exercise actual composition updates/commit and Enter in live editor, source textarea and body search, including a theme change while composing; assert no duplicate/lost characters, premature search navigation, unintended newline or save-induced focus loss. Synthetic composition/CDP checks are supplemental. A real Windows Korean IME headed/manual run is required before claiming native IME validation; record method and evidence honestly if that run is pending.
- [ ] Widget regression after font/padding changes: run existing editor browser/table/drift/math/inline/tag checks and web editor-style/focus checks, then assert product click `posAtCoords`/selected position on lines after code, table, math and Mermaid before/after scroll, theme change and async rendering. Preserve padding-owned geometry and table reveal behavior; no cumulative line drift or false click target. Test widget virtualized exit/reentry. #54 must not introduce regression while #55 improvements remain pending.
- [ ] #55 adds light→dark→light while async code/diagram rendering is pending, old/new cache reuse at multiple widths, malformed math/diagram with read-only keyboard source access, KaTeX single visual rendering, and actual visible plus/minus cues in already-open comparison views.
- [ ] State disposition: normal/hover/focus/selected, read-only/edit-disabled, empty document, body loading, save error/conflict apply. Source invalid-field validation is N/A (raw markdown is allowed); malformed complex-content rendering belongs #55. Preserve existing loading/recovery behavior; do not turn missing body into an editable empty document.
- [ ] Independent reviewer checks original issue/SRS, actual diff and objective red/green/browser artifacts. Keep per-AC partial evidence until all assigned portions pass; this decision itself verifies no requirement.

## Independent review disposition

Medium 1 accepted (2026-09-17): the atomic accent mapping changes dark checked-task fill to approved `--action-primary` (`#A8C4D3`), while the existing checked glyph is hardcoded white. The reviewer reported 1.83:1 for that pair and 8.84:1 with approved `--text-on-primary` (`#19231F`). This decision now requires the semantic checked-glyph mapping in #54 and actual product light/dark unchecked/checked/hover/focus pseudo-style and contrast evidence. #55 retains complete complex-content treatment. The reported ratios identify the design defect; independent rendered verification and implementation remain outstanding.
