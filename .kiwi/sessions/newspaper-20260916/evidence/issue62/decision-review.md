# Issue #62 Astra decision independent re-review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Prior finding disposition

The prior Medium finding is resolved. The revised decision correctly identifies the lossy boundary in `App.changeOwnPassword` and authorizes only the necessary adapter correction:

- return a rule string only when the password endpoint returned HTTP 400 with one of `wrong-password`, `empty-password`, `self-only` or `unknown-account`;
- leave rule-less 400, 401, 429, 5xx, unknown rules and network exceptions on the rejected-Promise path;
- let `PasswordChangeForm` render that rejected path as one generic safe failure;
- retain existing successful password-change cache/session cleanup unchanged.

This proposal is feasible with the current `ApiError` contract, which exposes status and `detail.rule`. It removes the invented `unknown-account` fallback without adding an endpoint, server rule, status probe or authentication policy. The required TDD evidence exercises the actual App callback-to-form path for every relevant status and unknown rule, so a component-only mock cannot hide a regression.

## Personal-setting contract

The decision preserves the exact IR-SHELL-004 list and consumes `personalFieldsOf` rather than creating a second enum:

- `default-view-mode`: `view` / `edit`, missing-key default `view`;
- `default-edit-subview`: `live-preview` / `source`, missing-key default `live-preview`;
- `theme`: `light` / `dark` / `system`, missing-key default `system`.

It adds no font, font-size, autosave-delay, format, extra theme, checkbox or global Save/Apply/Reset control. The editor subview preference remains independently selectable. Personal settings stay separate from the five instance settings.

DB rows keyed by user and item remain authoritative. The decision requires actual two-user isolation, durable reread/reopen behavior, missing-key defaults, unknown-key/value rejection and separation from instance settings. It does not create browser-storage truth or cross-user state.

## Save and rollback honesty

Theme presentation uses the real #46 load/save/retry states, optimistic preview and request/user ownership. Only the supplied saved state may say `테마 저장됨`; failure restores the last confirmed preference and palette and exposes the real retry callback. Rapid and stale responses, user switching, logout and `system` following the current OS theme remain covered.

The two editor-setting callbacks currently expose neither a Promise result nor per-key loading/success/error/retry state. The decision does not manufacture successful-save feedback, local optimistic truth, a timeout or theme-derived status. It requires persistence/failure to be checked through the real request and server reread, and explicitly leaves per-key feedback and actual document-opening consumption as unmet integration gaps. This is consistent with the original issue's boundary: additional preference-state wiring needs separately agreed scope before the issue can claim those completion portions. The implementation may not use this design review to mark those gaps complete.

## Password and logout contracts

Password change remains an inline self-only form with exactly current and new masked password fields. It preserves stable names/autocomplete and exact native values, adds no confirmation field, target account, email/profile edit, reset, reveal, strength meter, password policy or L2/L3 gate.

The impact notice accurately describes existing server behavior: successful password change invalidates every session and PAT for that account, including the current session. It exposes no counts or secrets and is not copied to logout. Real evidence covers old/new login, a second session, live PATs and another account's isolation.

The form design includes a synchronous reentry guard, Promise-backed pending/disabled state, safe known-rule mapping, generic rejection handling, field-specific `aria-invalid`/descriptions, correction focus and composition-ending Enter protection. A post-success session-refresh ambiguity remains explicitly separate because the current callback has no phase distinction; the form must not retry or claim the old password still works.

Logout stays a separate AppShell/App action for this browser session. It does not submit the password form, mutate a password, revoke all PATs or advertise all-device logout. Existing swallowed-error or focus-handoff limitations remain reported rather than covered by a duplicate control or fake success.

## Browser and accessibility evidence

The decision requires Playwright coverage at 1280×720, 1440×900 and 1920×1080 in light/dark at 100% and genuine 200%, with computed geometry, state, contrast and final action reachability inside #61's two-column settings shell. Genuine zoom uses an isolated persistent Chromium profile and `chrome.tabs.setZoom(2)`, asserts the zoom and records CSS viewport/DPR. CSS zoom, transform, device scale and a smaller emulated viewport are rejected as substitutes.

Native Windows Korean IME and real password-manager evidence remain distinct from Playwright `fill` or synthetic composition. Theme rerender must preserve password input/focus and editor state. Applicable loading, pending, invalid, error, saved, disabled and focus states have textual or structural cues rather than color alone.

## Sources inspected

- Original GitHub issue #62 via `gh issue view 62 --json title,body,url`
- `AGENTS.md` and `docs/spec/00.index.md`
- IR-SHELL-004, DR-SHELL-002, SEC-AUTH-018, SEC-AUTH-019 and related session/PAT requirements
- Relevant parts of `docs/spec/04.screen-design-settings.md`
- Newspaper decision/handoff sources and approved #46/#61 decisions/reviews
- Current `PersonalSettings.tsx`, `PasswordChangeForm.tsx`, `App.tsx`, `AppShell.tsx`, API client, password route/service and tests
- Revised `.kiwi/sessions/newspaper-20260916/evidence/issue62/astra-decision.md`
- Targeted source searches for preference enums/defaults, theme state ownership, password `ApiError` mapping, session/PAT invalidation and logout

This is a pre-implementation decision review. No product implementation, browser execution or test pass is claimed.
