# Issue 57 evidence

## Requirements and scope

This work implements the frozen issue 57 decision for `FR-EDITOR-008`, with preservation coverage for `FR-EDITOR-005`, `FR-SHELL-012`, `FR-CONFIRM-001`, `FR-CONFIRM-002`, `FR-CONFIRM-003`, `IR-SHELL-008`, `IR-SHELL-009`, and `IR-EDITOR-002`.

The product keeps the existing conflict and rejected save triggers and immediate actions. It adds the approved newspaper presentation, an exact-source download for rejected saves, and a Radix replacement confirmation whose destructive action uses the current request. It does not add pending or success resolution states, undo, autosave policy, or caller refresh behavior.

## TDD evidence

- `red-contract.txt`: pre-implementation RTL RED at the required rejected copy/download name, conflict copy/pane labels/action instruction, confirmation heading/initial focus, and Escape cancellation assertions.
- `red-playwright-layout.txt`: pre-implementation Playwright RED in the actual AppShell/DocumentSurface fixture at the required conflict warning.
- `red-product-focus-restore.txt`: actual product Playwright RED for post-cancel focus. The original assertion required the former tree row. Product virtualization replaces that row, so the frozen decision's permitted stable active-document header fallback is used and independently observed in `focus-diagnostic.txt`.
- `green-focused-confirmation-url.txt`: focused confirmation and clean URL-constructor stubbing pass 29/29 after reached RED.
- `green-targeted-final-revised.txt`: final affected RTL/autosave rerun passes 67/67.
- `green-playwright-visual-expanded.txt`: the checked-in Playwright checker passes all 12 viewport/theme/zoom environments with expanded visual evidence.
- `red-composition-save-count.txt`: reached Playwright RED showing composition cancel preserved exact live/source text and caret but still emitted one unchanged-body PUT in each editor.
- `green-composition-save-count.txt`: after the minimum composition-boundary autosave fix, the disposable installed App/API suite passes real conflict/merge/repeated-conflict plus editable-merge synthetic/CDP composition, exact PUT counts, selection/history/scroll and dialog-cancel recovery (19/19), saved/saving/Ctrl+click, generic transport rejection, ACL rejection, exact download bytes and filename, and replacement confirmation (20/20), plus actual live/source synthetic/CDP composition and exact PUT counts (12/12).

See `tdd-chronology.md` for the assertion-to-RED map.

## Final regression

- `web-full-final-revised.txt`: web 67 files, 733 tests passed.
- `editor-full.txt`: editor 261 passed, 1 existing skip.
- `typecheck-final-revised.txt`: web typecheck passed.
- `web-build-final-revised.txt`: web production build passed with the repository's existing chunk-size warnings.
- `overlay-browser-regression.txt`: shared overlay Playwright regression passed.
- `version-browser-regression.txt`: issue 56 version-history Playwright 12-environment regression passed.

## Browser coverage

`newspaper-conflict-check.cjs` uses Playwright Chromium at 1280x720, 1440x900, and 1920x1080 in light and dark themes at 100% and genuine 200% browser zoom. The 200% cases use an isolated persistent context and an extension calling `chrome.tabs.setZoom(2)`; no CSS zoom, viewport halving, device scale substitution, or CDP emulation is used. Measurements are in `green-conflict-measurements.json`, with one screenshot per environment.

The checker exercises exact conflict and rejected copy, semantic surface geometry/colors/contrast, focus-ring bounds, merge editing and exact saved bytes, post-rejection editing and exact downloaded bytes, focus trap, initial cancel focus, Escape, inert outside interaction, composition-boundary Enter, and one-shot destructive acceptance. It retains separate conflict, rejected, and confirmation screenshots for every environment. `merge-view-check.mjs` and `conflict-rescue-product-check.mjs` separately drive the installed App and API for persistence, repeated conflict/rejection, saved/saving replacement, Ctrl+click tab identity, selection/undo/redo across theme/layout, transport failure, and permission behavior.

## Composition method and limitation

The revised binding decision accepts Playwright-controlled synthetic/CDP composition as the #57 gate under the user's browser-isolation override. `ime-composition-check.mjs` and `merge-view-check.mjs` use only a CDP session obtained from the exact Playwright-owned page and `Input.imeSetComposition` / `Input.insertText`, plus Playwright locator/keyboard APIs. They record observable `compositionstart`/`compositionupdate`/`compositionend`, exact text/caret, commit, cancel, Enter, submit/save counts, theme changes, dialog cancellation, and resumed typing in live, source, and editable merge editors. `green-playwright-revised-decision.txt` covers the confirmation composition guard and one-shot activation across the 12-environment matrix.

This is explicitly synthetic/CDP evidence, accepted for issue #57 only. Native Windows IME remains unverified and broader `IR-EDITOR-002` AC5 native evidence remains open. The abandoned OS-input experiment delivered no trusted input and could not prove isolation; raw failures remain as `native-ime-diagnostic.txt` through `native-ime-diagnostic-7.txt`. Its unsafe helper/checker were deleted and must not be rerun. No current browser check uses OS-level input or an existing browser window.
- The pre-existing autosave hook still exposes no completion result to its caller and has no invented pending/success UI. Persistence is verified independently by reading the restored document through the actual product/API path.
- When a virtualized invoking tree row no longer exists after the product rerenders, cancellation restores focus to the stable active-document breadcrumb, as allowed by the frozen decision.
