# Issue 57 Astra decision — Playwright isolation re-review

Reviewer: Sol

Date: 2026-09-17

Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Disposition

The revised decision satisfies the user's Playwright-only instruction. It confines all #57 browser interaction to isolated Playwright-launched contexts, including the isolated persistent Chromium context used for genuine browser zoom. It permits CDP only when the session belongs to the exact Playwright-owned page and requires two-session conflict checks to use two separately owned contexts.

The decision explicitly prohibits attaching to or manipulating existing browser windows or profiles, Win32 `SendInput`, `AppActivate`, HWND discovery or manipulation, native OS mouse or keyboard injection, and equivalent focus or activation automation. Headed mode does not weaken that rule. A check that cannot be completed inside this boundary must be reported as a limitation; there is no OS-input or alternate-browser fallback.

The earlier failed native-input diagnostics explain why this boundary is necessary: they could not prove process/window isolation and produced no trusted composition/input events. The revised decision does not treat those attempts as evidence and does not authorize rerunning them.

## Korean composition evidence

The Playwright-controlled synthetic/CDP gate is adequate for the behavior owned by #57. It exercises both the actual live/source editor and editable merge pane and requires:

- observable `compositionstart`, `compositionupdate`, `compositionend`, commit, cancel, and Enter-during-composition ordering;
- verification of resulting body bytes, selection, and caret rather than event counts alone;
- theme rerender, attempted confirmation activation during composition, confirmation cancellation, and immediate resumed typing;
- no duplicate or lost text, accidental acceptance, outer form submission, or extra save;
- exact recording of generated events/CDP calls and the owning Playwright page/context.

This covers #57's merge-draft preservation and replacement-confirmation risks without claiming native candidate-window behavior. The decision labels the result as **synthetic/CDP composition evidence**, accepts it only as the user-overridden #57 gate, and twice states that it is not native OS IME evidence and must not satisfy or promote the broader native evidence for `IR-EDITOR-002 AC5` or final rollout.

## Source and scope consistency

- GitHub issue #57 requires browser verification at the three specified viewport sizes and 200%, long Korean content, keyboard behavior, and IME coverage. The revised matrix retains all of these while applying the user's later, more specific Playwright-only safety instruction.
- `IR-EDITOR-002 AC5` and the phase acceptance record retain their broader native/manual IME status. The decision makes no SRS status or verification promotion.
- Genuine 200% remains an isolated Playwright persistent Chromium profile with an extension calling `chrome.tabs.setZoom(tabId, 2)`, verified by `getZoom === 2` and viewport/DPR measurements. This uses browser APIs within a Playwright-owned profile and does not require OS-level window input.
- The actual two-session conflict, exact merged bytes, permission-loss rejection, exact download bytes, confirmation focus/cancel/accept behavior, and no-edit-loss checks remain required. The safety revision does not replace product assertions with a fixture-only or event-only pass.
- No later clause reintroduces native input, existing-window control, or an unqualified native-IME claim.

## Inputs and commands

Inspected without running browser verification or changing product code:

- `AGENTS.md`
- `docs/spec/00.index.md`, the relevant editor and shell SRS entries, and the phase acceptance record
- GitHub issue #57 via `gh issue view 57 --json number,title,body,url`
- `.kiwi/sessions/newspaper-20260916/evidence/issue57/astra-decision.md`
- Existing issue #57 safety evidence and README limitations
- Current `DocumentSurface`, `MergeView`, `AppShell`, autosave, and related browser-checker references
- `rg -n -C 5 "IR-EDITOR-002|AC5|IME|native|Playwright" docs/spec .kiwi/sessions/newspaper-20260916/evidence/issue57 packages/web/test packages/web/src`
- `git status --short` and the scoped decision/report diff

This is a design re-review only. It does not claim implementation, browser execution, native IME coverage, or SRS verification.
