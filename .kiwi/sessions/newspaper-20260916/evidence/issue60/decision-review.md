# Issue #60 Astra decision independent re-review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Prior finding disposition

The prior High finding is resolved. The revised decision no longer treats the current one-screen implementation as authority. It explicitly preserves the five stages required by `docs/spec/04.screen-design-settings.md` §§4.2–4.8:

1. installation token;
2. first superuser account;
3. initial policy;
4. review;
5. completion.

It keeps `1/4` through `4/4` progress for the four input/review stages, provides Back from stages 2–4, preserves entered values and policy choices while moving backward and forward, and gives stage 5 no Back or recommit action. The TDD checklist now requires the five-stage order and the Back/value-preservation matrix instead of freezing the former one-screen gap.

## Review and confirmation separation

Stage 4 is correctly retained as a distinct non-secret input summary. Its `설치 완료` action only captures an immutable payload and opens one separate L2 gate. The summary itself cannot commit. Cancel/Escape returns to stage 4 with values and session intact and restores focus to `설치 완료`; only deliberate L2 acceptance calls the commit callback. The decision retains one gate, omits child/affected counts, and does not add a second account or signup-policy confirmation.

The decision also reconciles the SRS evidence and screen-design wording without using the generic false `지금은 아무 일도 일어나지 않습니다` text. It separately states the immediate irreversible installation and the later use of the stored default-group permission. The open-signup/edit warning remains distinct.

## Completion handoff

The revised handoff is narrow and necessary. The current `PreAuthScreen` performs `window.location.assign('/')` inside `onCommit`, which would make the specified stage 5 unobservable. The decision requires the real commit Promise to resolve first, keeps InstallWizard on a persistent stage 5, and moves only the existing root navigation to `시작하기`. This can be represented as a completion/navigation callback without changing App routing, API payloads, server install behavior, session policy, or the four-category installation allowlist.

This handling is honest about §4.7/§9-Q23: it does not invent automatic login. `시작하기` follows the existing root behavior, and subsequent login with the created credentials remains product evidence. If the narrow adapter cannot be supplied, the decision marks stage 5 blocked instead of silently waiving it.

## Remaining contract review

No C/H/M/L issue remains in the other reviewed axes. The decision correctly keeps the full-page shell-free entry, 640px cap, server-owned 30-minute token expiry and restart invalidation, session-bound commit, exact signup/permission enums and defaults, fixed `workspace` identity, local password confirmation without a new API field, no invented unresolved email storage, Promise-owned pending and duplicate guards, secret masking/non-persistence, safe error mapping, and disposable-instance security evidence.

The Playwright plan covers every stage plus L2 at 1280×720, 1440×900, and 1920×1080 in light/dark at 100% and genuine 200%. Genuine zoom uses an isolated persistent Chromium profile with `chrome.tabs.setZoom(2)` and records the actual zoom/viewport rather than substituting CSS zoom, DPR emulation, or a manually smaller viewport. Native Windows IME and password-manager checks remain explicitly separate from synthetic Playwright evidence.

## Sources and inspection commands

- Original issue: `gh issue view 60 --json title,body,url`
- `AGENTS.md`
- `docs/spec/00.index.md`
- `docs/spec/04.screen-design-settings.md` §§4.2–4.8
- `docs/spec/09.auth.srs.md`: IR-AUTH-001, FR-AUTH-004, SEC-AUTH-010 through SEC-AUTH-017 as relevant
- `docs/spec/11.confirmation-grades.srs.md`: FR-CONFIRM-019 and its evidence/change notes
- `docs/decision/newspaper-style-guide.md`, `docs/decision/newspaper-forms.md`, and related newspaper decision sources
- Approved #48 shared-confirmation and #59 authentication decision material
- Current `InstallWizard.tsx`, `PreAuthScreen.tsx`, `App.tsx`, API client/install wiring, `ConfirmGate.tsx`, and shared `Button`
- Revised `.kiwi/sessions/newspaper-20260916/evidence/issue60/astra-decision.md`
- Targeted `rg -n` checks for the five stages, Back/value preservation, stage-4/L2 separation, stage-5 Start handoff, and current premature redirect

This is a pre-implementation decision review. It does not claim that browser checks or product tests have already run; it finds the revised implementation and evidence contract complete, consistent, and feasible.
