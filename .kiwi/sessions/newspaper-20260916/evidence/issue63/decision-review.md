# Issue 63 Astra decision — independent review

Reviewer: Sol

Date: 2026-09-17

Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Scope and sources

I independently compared the decision with the original GitHub issue #63, `AGENTS.md`, `docs/spec/00.index.md`, IR-AUTH-003, SEC-AUTH-006/007/008/009, FR-CONFIRM-006, IR-SHELL-008, the approved #49 and #61 design boundaries, and the current `App.tsx`, `AppShell.tsx`, `TokenPanel.tsx`, token contract, token tests, and wiring tests. This is a decision review. I did not change or execute product code and do not claim implementation verification.

## Findings

No Critical, High, Medium, or Low findings.

The decision accurately distinguishes the portions achievable inside `TokenPanel` from integration contracts absent in the current product:

- **B1 is real:** `SettingsModal` owns close and category changes and exposes no child leave guard. A TokenPanel-only inline reveal cannot satisfy IR-AUTH-003 AC-2. The proposed secret-free intent/defer/accept handoff keeps plaintext out of AppShell and does not authorize a generic unsaved-changes policy.
- **B2 is real:** the current token panel receives role/count facts but no stable authenticated-owner identity or invalidation generation. Local component state alone cannot prove immediate erasure and stale-result rejection across logout, invalidation, or account switch as required by AC-4.
- **B3 is real:** `onRevokeToken` is currently typed as `void`, and App deliberately discards the async result. The decision correctly refuses to manufacture pending, success, or failure feedback from that contract.
- **B4 is real:** App supplies `tokens.data ?? []`, so TokenPanel cannot distinguish loading or load failure from a successful empty result. The decision correctly forbids synthetic states and requires an authoritative query-state/retry handoff.

These blockers are not omissions in the design. They are explicit completion gates. The document states that #63 and IR-AUTH-003 must remain incomplete until the necessary handoffs are explicitly scoped, implemented, and proven in the actual product path.

## Security and behavior assessment

The one-time secret lifecycle matches IR-AUTH-003:

- plaintext exists only in the authorized reveal/confirmation component state and one visible selectable readonly field;
- clipboard success clears only after fulfillment, while unavailable, thrown, rejected, and delayed writes preserve manual recovery;
- manual copying is not falsely inferred, and explicit no-copy departure still requires the discard confirmation and non-secret loss notice;
- Escape and outside interaction cannot discard the secret, while close, category, and back intents converge on one guarded confirmation;
- accepted departure erases and invalidates stale callbacks before executing the exact saved destination once;
- owner change, logout, or session invalidation overrides the prompt and erases immediately;
- late issuance and clipboard completions are generation-guarded and cannot repaint for another owner;
- no plaintext is allowed in rows, query cache, parent state, URLs, storage, logs, accessible live text, tooltips, toasts, screenshots, or failure messages.

The decision also preserves self-only server authorization, the existing scope and expiry choices, L2 revocation, exact request data, and safe generic errors. It does not invent regeneration, export, bulk revoke, custom expiry, admin scope, ownership selection, token prefixes, persistence, or clipboard fallback. Pending issuance is honestly represented as a request that cannot be cancelled with the present API.

## Accessibility, layout, and evidence feasibility

The proposed inline flow is compatible with #61's existing settings body and independent scrolling. It defines durable labels and descriptions, connected errors, focus entry and restoration, native form behavior, IME protection, non-color status text, selectable plaintext, minimum control sizing, local overflow, and forced-colors system colors and borders. The reveal and discard stages do not add a nested ordinary Dialog; only the existing L2 revoke AlertDialog remains an overlay.

The requested browser evidence is feasible with the repository's existing Playwright infrastructure. Existing checked-in browser checkers already demonstrate isolated persistent Chromium with an extension calling `chrome.tabs.setZoom(tabId, 2)` and verify `getZoom() === 2`. The proposed 12-environment light/dark matrix, real 200% zoom, forced-colors cases, long names/tokens, many rows, keyboard/IME, native clipboard, focus, overflow, and geometry checks are concrete. The document correctly separates real Windows Korean IME and secure-context native clipboard evidence from deterministic synthetic coverage, and requires masking or disabling artifacts that could retain a live PAT.

## Completion constraint

This PASS applies to the quality and honesty of the preimplementation decision. It is not a PASS for issue #63 or IR-AUTH-003 implementation. A later implementation may claim full completion only after B1 and B2 are present and proven in the actual AppShell path, and after B3/B4 are present wherever revoke/list pending, error, retry, or empty-state behavior is claimed. Component fixtures alone are insufficient.

## Inspection commands

```text
gh issue view 63 --json number,title,body,state,url
Get-Content AGENTS.md
Get-Content docs/spec/00.index.md
rg -n "IR-AUTH-003|SEC-AUTH-006|SEC-AUTH-007|SEC-AUTH-008|SEC-AUTH-009|FR-CONFIRM-006|IR-SHELL-008" docs/spec
Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue63/astra-decision.md
Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue61/astra-decision.md
rg -n "TokenPanel|onIssueToken|onRevokeToken|chrome.tabs.setZoom|forced-colors" packages/web .kiwi/sessions/newspaper-20260916/evidence
Get-Content packages/web/src/settings/TokenPanel.tsx
Get-Content packages/web/src/shell/AppShell.tsx
Get-Content packages/web/src/App.tsx
Get-Content packages/web/test/token-panel.test.tsx
```
