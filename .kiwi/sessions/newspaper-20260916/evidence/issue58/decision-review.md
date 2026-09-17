# Issue 58 Astra decision — independent review

Reviewer: Sol
Date: 2026-09-17
Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Review result

The decision is feasible within `DocumentSurface`, `NewVersionPrompt`, and scoped styles/tests. It preserves existing attachment, overwrite, permission, confirmation, and shell contracts without inventing upload completion signals or extending Phase 1 format support.

## Confirmed contracts

- `FR-ATTACH-003` remains binary: existing image classifications use a bounded `<img>` preview; PDF and every other non-image/non-Markdown file remain download-only. No PDF viewer, text extraction, iframe/embed/object, canvas, thumbnail, or new format branch is introduced.
- Image layout preserves intrinsic aspect ratio and bytes with `object-fit: contain`, no upscaling beyond intrinsic size, no crop/stretch/theme filter/recompression, and bounded width/height through a `min-width:0`/`min-height:0` chain. Long/tall/wide content cannot grow the shell or hide an edge.
- Image loading, cached completion, error, identity reset, stale events, and optional same-resource retry are described as real image-element states. Missing and forbidden resources use the same generic error and do not expose existence or permission detail.
- Generic/PDF download keeps the authenticated stable node URL, full wrapping filename, native anchor download behavior, and server bytes. It adds no fetch/Blob conversion, client rename, completion message, or fabricated transfer state. Playwright must inspect the actual download event, suggested filename, and byte hash.
- Non-Markdown surfaces do not acquire Markdown mode controls. Displayed filenames remain selectable, keyboard reachable, at least 36px in block-axis target size, and bounded under long Korean/Latin names.
- The overwrite entry remains the edit-authorized file-node context-menu action. Directories, pass-through nodes, ordinary upload, paste attachment, creation, and drag/drop do not acquire an overwrite route. Server permission enforcement remains authoritative.
- Target identity comes from the existing node and server-supplied `overwriteIrreversible` classification. The exact selected `File` object is retained; its bytes/name are not reconstructed or normalized. A differently named selected file replaces content without renaming the target or changing node ID, ACL, or history identity.
- Markdown follows the directly specified L1 path: selecting a file invokes the existing handoff once with no confirmation dialog. Native chooser cancel and ordinary prompt cancel perform no upload.
- Binary replacement follows `FR-CONFIRM-010` and `FR-CONFIRM-005`: file selection is input only, then a separate L2 AlertDialog requires explicit affirmative action. There is no L3 token, fake impact count, extra gate, or client-side file classifier.
- Binary cancel/Escape returns to the picker with the exact selection intact and no mutation. Outside interaction cannot accept or dismiss the risk dialog. Whole-form cancel discards only local selection. Target changes invalidate old selection/consent, and one-shot protection prevents repeated callback invocation.
- Shared #48 Dialog/AlertDialog ownership supplies focus trapping and topmost Escape behavior; the existing global Escape listener is removed. Cancel gets initial focus, the destructive action is never auto-focused, and focus returns to the initiating form action or an existing invocation target where available.
- No application text input or filename editor is introduced. OS-native filename-entry IME is correctly marked outside synthetic browser proof; Korean/emoji filenames and composition-key attempts at the risk dialog remain regression inputs without accidental acceptance.
- The decision accurately identifies the void callback boundary. `onPick(file): void`, immediate parent unmount, and App's swallowed upload outcome cannot support honest pending/success/failure/retry UI in the two scoped files. It forbids fake progress, local success before unmount, indefinite busy state, API bypass, and callback-return success.
- Future upload-state wording is explicitly conditional on separately authorized parent signals. Current product evidence must report silent feedback, stale display, network failure, authorization failure, and refresh gaps as unmet integration outcomes; callback spies cannot make those outcomes pass.
- Actual upload evidence verifies unchanged bytes arriving at the new-version endpoint, exact target ID/name/ACL, binary-only irreversible behavior, Markdown prior-version preservation, server permission loss, and existing tree/document refresh behavior.
- The 12-environment browser matrix covers 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%, with actual image/download/picker/dialog geometry, long names, native file control styling, focus bounds, portal theme, and screenshots.
- Genuine zoom requires isolated persistent Chromium with an extension calling `chrome.tabs.setZoom(tabId, 2)`, verification by `getZoom === 2`, and recorded CSS viewport/DPR. CSS zoom, transforms, device scale, and reduced viewport substitutes are rejected.
- TDD requires failing state, interaction, and computed-style checks before implementation. Existing tests cannot be weakened, and external focus/upload/refresh gaps remain separate SRS/issue work rather than implicit scope expansion.

## Inputs inspected

- `AGENTS.md`, `docs/spec/00.index.md`, and original GitHub issue #58
- `.kiwi/sessions/newspaper-20260916/evidence/issue58/astra-decision.md`
- Approved theme, shell, and overlay decisions/reviews, plus newspaper style/forms/handoff sources
- `FR-ATTACH-003`, `FR-SHELL-008`, `FR-EDITOR-006`, `FR-CONFIRM-005`, and `FR-CONFIRM-010`
- Current `DocumentSurface.tsx`, `surface-contract.ts`, `NewVersionPrompt.tsx`, `DocumentTree.tsx`, `AppShell.tsx`, `App.tsx`, upload client/API wiring, shared Dialog/AlertDialog, and upload/new-version server paths

This is a pre-implementation decision review. No product behavior, browser result, automated test result, SRS status, or requirement verification is claimed.
