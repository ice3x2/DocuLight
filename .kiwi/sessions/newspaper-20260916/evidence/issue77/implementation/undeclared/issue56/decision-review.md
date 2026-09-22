# Issue 56 Astra decision — final independent re-review

Reviewer: Sol
Date: 2026-09-17
Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Final disposition

Both prior Medium findings are resolved.

1. The decision now limits #56 to `VersionHistory`, `MergeView`, `DocumentSurface`, and their scoped styles/tests. App, DocumentArea, query-cache, permission propagation, and `useAutosave` repairs require separately agreed SRS/issue scope. Product evidence must record stale visible body, stale comparison input, refresh failure, permission UI gaps, or a pre-restore autosave race as unmet integration outcomes; component fixtures cannot turn those outcomes into passes.
2. Restore success now invokes the existing completion callback once and uses the existing close/focus return as its scoped feedback. The decision explicitly forbids a local success announcement immediately before `onRestored={() => setPanel(null)}` unmounts `VersionHistory`. A persistent restore-success toast/live region is correctly left to a separately scoped parent handoff. The remaining polite status language applies to comparison selection, which does not unmount the component.

The resulting scope is feasible with the current component contracts, and the evidence requirements distinguish what #56 can prove from the integration outcomes it cannot claim.

## Confirmed contracts

- The #54/#55/#56/#57 partition is coherent. #56 owns version history, read-only version comparison, restore presentation, and operation states; #57 retains editable conflict/recovery and unsaved-replacement presentation.
- Version comparison uses the shared CodeMirror merge component with both panes read-only. Conflict use keeps the right pane editable and retains its resolution callback. Mode and action are explicit rather than inferred from labels.
- Loading, empty, list error, comparison loading/error, restore pending/error, stale node/sequence completion, and valid empty-string content are distinct. Restore failure cannot invoke completion or close the panel.
- Persisted restore evidence uses the exact selected `{nodeId, seq}`, server bytes, unchanged node ID/ACL/history identity, and existing permission checks. A later document read or visible editor refresh is a separate outcome and cannot be mislabeled as mutation success.
- The existing L1 undo-completeness gap is disclosed accurately. `FR-CONFIRM-001` AC-1 remains unchecked, the void restore response supplies no safe undo identity, and #56 neither invents an undo target nor claims full L1 compliance.
- Authorization remains server-enforced. No edit default, hidden-principal lookup, internal path, or forbidden-versus-missing disclosure is introduced. Missing client permission propagation is reported as a separate integration gap.
- Complete raw-source alternatives remain in the accessibility tree through a visually hidden technique, do not create ordinary visible duplication or layout width, and do not replace the actual populated CodeMirror panes and markers. Conflict-mode raw source follows the live draft.
- Layout and interaction rules cover long metadata/source, local horizontal and vertical overflow, non-color difference cues, read-only/disabled/focus states, keyboard order, focus return, and runtime theme switching without changing editor content.
- Browser evidence covers 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%. Genuine zoom requires isolated persistent Chromium, `chrome.tabs.setZoom(tabId, 2)`, and `getZoom === 2`; CSS zoom, DPR emulation, and reduced viewport substitutes are rejected.
- The actual product menu-to-history-to-compare-to-restore route supplements component tests. Server snapshot/session/retention regressions, duplicate restore prevention, failure behavior, same-node persistence, another-tab observation, actual merge geometry, and two-session conflict reuse remain required.
- Synthetic composition evidence is not presented as native Windows IME evidence. History adds no text input, while affected shared editor/conflict paths retain the existing IME, undo/cursor, autosave, and focus regression obligations.

## Inputs inspected

- `AGENTS.md`, `docs/spec/00.index.md`, and original GitHub issues #56/#57
- Final `.kiwi/sessions/newspaper-20260916/evidence/issue56/astra-decision.md`
- `IR-STORAGE-001`, `FR-STORAGE-003`, `FR-STORAGE-004`, `FR-EDITOR-008`, and `FR-CONFIRM-001` through `FR-CONFIRM-003`
- Approved issue #54/#55 decisions and newspaper style/forms/handoff sources
- Current `VersionHistory.tsx`, `MergeView.tsx`, `DocumentArea.tsx`, `DocumentSurface.tsx`, `useAutosave.ts`, `App.tsx`, API client, and server version service

This is a pre-implementation decision review. No product behavior, test result, browser run, SRS status, or requirement verification is claimed.
