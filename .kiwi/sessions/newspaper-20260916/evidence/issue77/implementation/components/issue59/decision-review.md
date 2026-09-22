# Issue 59 revised Astra decision — independent review

Reviewer: Sol
Date: 2026-09-17
Verdict: **PASS — Critical 0, High 0, Medium 0, Low 0**

## Authority of this revision

This review supersedes the earlier review wherever it said or implied that a real Windows Korean IME or a real Chromium/third-party password-manager run was required to close issue 59. The user's latest explicit instruction requires all browser verification to use newly launched, isolated Playwright-owned Chromium. The revised Astra decision's Playwright-only override is therefore authoritative for issue 59 evidence.

The override does not treat synthetic evidence as native evidence. It explicitly records the Windows IME candidate window and real browser/third-party password-manager integration as unverified limitations. Those native integrations do not block issue 59 under the user's override and cannot be promoted as broader native evidence.

## Review result

The revised decision resolves the native-automation conflict without weakening the original issue's product, authentication, session, layout, or regression requirements.

- All browser work is confined to isolated Chromium contexts newly launched and owned by Playwright. Existing/external browser attachment, `connectOverCDP` to an existing browser, `SendInput`, `AppActivate`, HWND manipulation, and OS keyboard or mouse injection are prohibited.
- Playwright-controlled composition events cover composition start/update/end, commit/cancel, composition-ending Enter suppression, retained characters, and the next deliberate single submission. The decision labels this synthetic/CDP evidence and does not call it a real Windows Korean IME run.
- Password-manager compatibility is checked to the extent Playwright can decide it: stable visible labels and ids, native username/password inputs, stable `name` values, correct `autocomplete` tokens, no blocked paste/autofill, no hidden credential fields, and no wrapper that clips native credential UI.
- DOM autofill simulation changes the native input values without relying only on Playwright `fill()` or attributes, then verifies that the actual request receives those current values unchanged. It does not claim to exercise a real password-manager popup or extension.
- Credentials remain absent from URLs, browser storage, logs, analytics, screenshots, and evidence artifacts. The decision forbids trimming, lowercasing, Unicode normalization, password transformation, and stale React state overriding browser-managed native values.

## Product and security evidence retained

The Playwright-only override does not replace product verification with component callbacks or static attributes. The revised checklist still requires:

- actual anonymous entry with the app shell and settings gear absent;
- real login and signup navigation through the built product;
- unchanged login/signup endpoints and exact submitted payload values;
- successful login reaching the authenticated app through the existing HttpOnly-cookie session refresh;
- failed, pending, suspended, and rejected login behavior using the server-approved messages;
- unknown-user and wrong-password responses remaining indistinguishable;
- open, approval, and closed signup modes, including failure to authenticate before approval and success after existing administrator approval;
- pending state, synchronous duplicate prevention, repeated Enter handling, rejected/throwing callbacks, deliberate retry, and stale completion isolation after switching forms;
- preservation of login rate limiting, cookie behavior, account-state gates, pre-auth wiring, shared form behavior, and theme regressions.

Callback fulfillment alone cannot prove an authenticated session or signup account state. Successful login still requires the existing App session refresh and actual protected-app entry. Signup callback success uses neutral receipt wording because the callback does not expose the created account's status or signup mode; exact mode-specific completion remains a separately scoped typed parent handoff.

## Required browser matrix

The decision retains the full 12-environment matrix:

- 1280x720, 1440x900, and 1920x1080;
- light and dark themes;
- 100% and genuine 200% browser zoom.

Genuine 200% uses an isolated persistent Chromium profile with a Playwright-launched extension calling `chrome.tabs.setZoom(tabId, 2)`, verifies `getZoom() === 2`, and records the before/after CSS viewport and DPR. CSS zoom, transforms, `deviceScaleFactor`, and a smaller emulated viewport are not accepted substitutes.

The matrix retains login/signup initial, pending, error, accepted-request, and blocked-account states; maximum 400px column geometry; 24px gutters; 40px controls; long Korean wrapping; keyboard and focus-ring reachability; final navigation visibility; contrast; and absence of horizontal or top/bottom clipping.

## Scope and source consistency

The decision remains consistent with original GitHub issue 59, IR-AUTH-001, FR-AUTH-001, FR-AUTH-004, SEC-AUTH-001, and SEC-AUTH-003. It preserves the existing App/API authority, account status gates, signup modes, HttpOnly session cookie, rate limiting, and root theme behavior.

It does not add email, password confirmation or strength policy, remember-me, social login, password reset, MFA, approval polling, public signup-mode discovery, a new route, or an invented account-state lookup. Installation and its separate 640px flow remain issue 60 scope.

## Inputs inspected

- Original GitHub issue 59 through `gh issue view 59 --repo ice3x2/DocuLight`
- `AGENTS.md` and `docs/spec/00.index.md`
- `docs/spec/09.auth.srs.md`: IR-AUTH-001, FR-AUTH-001, FR-AUTH-004, SEC-AUTH-001, SEC-AUTH-003
- Revised `.kiwi/sessions/newspaper-20260916/evidence/issue59/astra-decision.md`
- The preceding issue 59 decision review

This is a decision review only. No product behavior, automated test result, browser result, SRS status change, or requirement verification is claimed.
