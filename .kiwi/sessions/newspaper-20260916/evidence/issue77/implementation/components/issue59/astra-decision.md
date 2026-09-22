# Issue 59 — binding login and signup newspaper decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains the acceptance authority. No implementation, executed test or requirement verification is claimed.

## Authority and scoped contracts

Read AGENTS/SRS index, GitHub #59, approved #47/#49 shared UI review, newspaper guide/forms/handoff, PreAuthScreen/CredentialForm, and read-only inspection of App authentication, API client and server login/signup/account services. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

IR-AUTH-001, FR-AUTH-001, FR-AUTH-004, SEC-AUTH-001 and SEC-AUTH-003 are verified/stable. IR-SHELL-009 AC-4 and IR-SHELL-006 AC-4..8/10 supply the design delta. #59 covers login/signup portions of IR-AUTH-001; installation and its 640px form remain #60. Initial session loading/network/expiry orchestration belongs to its existing owner, not a reclassification inside CredentialForm.

Implement only PreAuthScreen/CredentialForm and scoped styles/tests. Preserve the existing App callbacks, API paths, HttpOnly cookie session, login rate limit, account status checks, signup modes and root-theme behavior. No email field, password confirmation, password-strength policy, remember-me checkbox, social login, password-reset link, MFA, approval polling, public signup-mode endpoint or new route is introduced.

Unlike upload callbacks in earlier slices, these callbacks return real Promises and safe error strings; local submitting/error/duplicate handling is supported without App/API changes. Missing callback must not be mistaken for successful authentication/signup. There are two explicit external-state limits:

1. Signup callback returns no created-account status or signup mode. Do not infer pending/active from successful void return or query superuser-only settings. Use truthful conditional approval guidance below. Exact mode-specific completion routing requires a separate SRS/issue and typed parent handoff.
2. Successful login still depends on App's existing session refresh/navigation. CredentialForm must not fabricate a session, render the shell or announce authenticated success if that parent handoff fails. Product regression observes actual entry; a missing refresh/error signal is a separately traced parent gap, not permission to repair App/cache in #59.

**Playwright-only user override:** all #59 browser verification uses only isolated Chromium contexts newly launched and owned by Playwright. Existing or external browser attachment, `connectOverCDP` to an existing browser, `SendInput`, `AppActivate`, HWND manipulation and OS keyboard/mouse injection are prohibited. Playwright/CDP composition events verify composition state, commit/cancel and Enter suppression; DOM autofill simulation verifies that current native input values, including changes without ordinary React input events, reach the request unchanged. These are explicitly not evidence of a real Windows Korean IME candidate window or a real Chromium/third-party password manager. Those two native integrations are unverified limitations under the user override and do not block #59, while real API/session flows, request bytes, keyboard/focus and the 12-environment matrix remain mandatory.

## Full-page layout

Login/signup are full-page `<main>` surfaces, not Dialogs or AlertDialogs. App shell, sidebars, document tabs and settings gear must be absent from DOM and accessibility tree while unauthenticated. Scope CSS to these two pre-auth IDs so installation keeps its separate width and flow.

Use app surface across at least `100dvh`, with natural document vertical scrolling. An inner column is at most **400px wide**, including any internal box sizing, centered horizontally with minimum 24px viewport gutters. Use 48px top/bottom page spacing when there is room. Safe vertical centering may use flexible auto margins that collapse to the page spacing when content exceeds the viewport; never fixed-height/overflow-hidden centering that makes the top field or final action unreachable at 200%. Do not add shell width breakpoints to this page.

Sequence: quiet `DocuLight` product name, screen heading `로그인` or `가입 신청`, form, alternate-screen action. Product name: 14/22px sans 600. Heading: 28/38px serif 700, 8px gap after product name and 24px before form. No hero graphic, marketing copy, card shadow or decorative paper texture. The page itself is the paper; form controls use control surface with border-control and 4px radius.

Use existing #47 Field/Input/Button and #49 inline states. Labels 13/20px 600; inputs 14/22px sans, minimum **40px** height and full column width; field spacing 20px; description/error 12/18px; primary submit full width/minimum 40px with 24px separation from preceding fields/status. Alternate action below the form has 16px separation, a minimum 36px target and secondary/underlined action styling. It remains a `type=button` invoking existing `onScreen`, not a fabricated URL or form submit.

Long Korean status messages wrap and grow naturally. Single-line name/password fields retain native internal scrolling and caret behavior. No clipping, fixed-height error block or page-level horizontal overflow. Native autofill/password-manager UI must remain visible rather than being hidden by an overflow-clipped wrapper.

## Fields, password managers and validation

Keep exactly the existing two fields:

| Field | Contract |
| --- | --- |
| `이름` | Native text input, stable `name="name"`, `autocomplete="username"`, explicit stable label/id; spelling/autocapitalization disabled where supported |
| `비밀번호` | Native `type=password`, stable `name="password"`; login `autocomplete="current-password"`, signup `autocomplete="new-password"`; explicit label/id |

Do not turn the username into email, block paste/autofill, randomize names per render, use fake hidden credential fields, clear password on blur or render it as plaintext. No new reveal-password control is needed. Submit the actual input values unchanged: no trimming, lowercasing, Unicode normalization or password transformation. Programmatic/browser autofill must reach the submitted values; a stale React state snapshot cannot override what a real password manager placed in native fields. Keep credentials confined to transient form memory/inputs, not URLs, browser storage, logs, analytics or evidence artifacts.

Do not invent name/password length/complexity/pattern rules. The SRS explicitly leaves password policy open, and the current server's username contract must not be silently tightened. Preserve server validation ownership. Initial empty form displays no red errors. A callback's form-level credential/registration rejection is shown at the form level with a connected alert; do not guess which individual field is wrong from a generic string or mark account-status blocks as invalid passwords. Field-specific `aria-invalid` is applicable only to a deterministically supported existing field validation outcome; without such a signal it is N/A, rather than a fabricated validation feature. No required/pattern/minlength attributes may reject values the existing contract allows.

Use a form identity keyed by login/signup so switching modes cannot reuse the other screen's password hint, password, pending result or error/success state. Return navigation clears that departed form's transient credentials; no cross-screen credential cache is introduced. Avoid resets on ordinary rerenders or theme changes. Initial focus is the username field on deliberate entry/screen switch; do not repeatedly autofocus during render/error/theme updates or defeat a password manager's focus.

## Submission, state and error wording

Use native form submit semantics: one submit button, Enter when not composing, no duplicated click handler that submits separately. Synchronously guard submission reentry before awaiting the callback, in addition to the visible disabled state. Capture one coherent pair of field values per attempt. Do not submit while IME composition is active, including a composition-ending Enter; the next deliberate Enter may submit. Handle callback rejection/throw as a genuine request failure, releasing the guard in every outcome; no unhandled Promise rejection or permanently disabled form.

| State | Required presentation/behavior |
| --- | --- |
| Initial/empty | Ordinary form, no error and no automatic request |
| Callback unavailable | Submit disabled, brief `지금은 요청을 보낼 수 없습니다.`; no fabricated success |
| Login request pending | Button `로그인 중…`, disabled; form `aria-busy=true`; controls retain names/values and layout |
| Signup request pending | Button `신청 중…`, disabled; same busy/duplicate rule |
| Returned safe rejection string | Show the exact supplied text as a wrapping inline alert using danger surface/status-danger; retain user-entered values for correction |
| Unexpected thrown request failure | `요청을 처리하지 못했습니다. 잠시 후 다시 시도하십시오.`; no raw error/message/stack; normal submit enables a deliberate retry |
| Login callback success | Let the existing App session-refresh/entry path act; no local “logged in” toast or simulated shell |
| Signup callback success | Persistent inline status: `가입 신청을 접수했습니다. 승인이 필요한 경우 슈퍼유저의 승인 후 로그인할 수 있습니다.`; keep existing `로그인하기` navigation |

Pending does not mean read-only permission: keep native fields usable and do not treat changes during the attempt as a second request. A submitted attempt's result applies to that submitted snapshot; when the user edits fields, clear a stale success/error notice rather than describing the new values as submitted. If the user switches screens while a request is pending, the old component's completion must not paint an error/success on the new screen. Do not introduce request abort/server-cancel semantics; the actual parent authentication callback remains authoritative for any successful session transition.

Only the submit operation is guarded while its Promise is pending; this is not a new rate-limit policy or permanent one-attempt lock. A success notice alone does not create a session or approve an account. Do not poll for approval or automatically resubmit. A rejected signup leaves the form available and does not suggest trying names to probe account existence.

**Security-generic does not mean removing required account-status messages.** The server first verifies credentials, then supplies FR-AUTH-001's distinct `승인 대기 중`, `계정이 정지됨`, `가입이 거절됨` guidance. Preserve those safe returned strings and their distinctness; do not replace them with one generic login message or fetch account status separately. Incorrect username and incorrect password preserve the server's identical `이름 또는 비밀번호가 올바르지 않습니다` response. Existing signup-closed and combined signup-input/name rejection strings from App remain intact; do not split the latter into “account exists” based on guesses. Unexpected transport failures use only the generic local fallback above. Do not echo passwords or interpret supplied text as HTML.

Rate-limit countdown/retry-after detail is not supplied to this component; no invented timer, retry loop, CAPTCHA or limit tuning is authorized. Session-cookie/credential transport and server response codes are unchanged.

## Focus, theme and accessibility

Form-level errors are announced once with `role=alert` and associated with the form/controls as appropriate; preserve useful current focus for correction. Do not repeatedly steal focus to an error on each keystroke. Signup completion uses `role=status`; it remains mounted and observable, unlike a message placed just before navigating away. Ordinary Tab order is username, password, primary submit, alternate navigation; labels remain visible at autofill and zoom. No focus trap on a full page.

Use the existing 2px focus ring plus 2px separation, with opaque separation for filled primary buttons. Error and success have text labels as well as color. Field text, placeholder if any, autofilled text and button states meet the shared actual-surface contrast targets. Do not fight the browser's credential-manager popup with absolute overlays or forced color inversion.

Before authentication, use #46's existing OS/system first-paint theme and root `data-theme`/`color-scheme`; no unauthenticated account-preference lookup or persistent previous-user theme hint. Login/signup share the same light/dark tokens, including native inputs and autofill. No theme toggle/settings gear is added. Theme changes do not remount the form, clear typed values or submit it. Installation styles/state remain #60; the shared PreAuthScreen branch must not inherit the login/signup 400px width.

## Acceptance and independent evidence checklist

- [ ] TDD before implementation: failing component/behavior/computed-style tests for two-screen layout, pending state, same-tick double submit, thrown callback, missing callback, stale switched-form result, IME prevention, native value submission and real error/success messaging.
- [ ] Actual product anonymous entry renders a full-page login with no shell/settings gear; existing `가입 신청하기` reaches real signup and `로그인하기` returns. Correct credentials reach the authenticated app through the actual session refresh; failed/blocked login stays unauthenticated. Test the built product as well as scoped components.
- [ ] Real callback/API flow uses unchanged endpoints and payload bytes. Test unknown username and wrong password for the same generic message; valid-credential pending/suspended/rejected accounts receive the distinct server-approved messages. No client account lookup, reason inference, secret echo or raw thrown error appears.
- [ ] Test approval-mode signup returns the accepted-request notice, cannot authenticate before approval, and succeeds after existing administrator approval. Test open signup and signup-closed mode: the same neutral completion text must not falsely claim pending status; closed response remains supplied App text. No automatic login, new public mode discovery or approval polling. Exact mode-specific handoff, if desired, is a separate scope.
- [ ] Request delayed enough to measure busy/disabled/button label; rapid click, repeated Enter and synchronous reentry yield one request per pending attempt. Promise rejection releases the guard and displays a real error; retry is deliberate. Switching login/signup while pending cannot leak old result or credentials. Theme rerender preserves entered values and emits no request.
- [ ] Native labels/types/names/autocomplete survive shared wrappers. Use synthetic credentials in Playwright-owned Chromium and inspect actual submitted request values, including DOM autofill simulation that changes native values without relying only on `fill()` or attributes. Do not include secrets in logs/screenshots/network artifacts. Record that real Chromium/third-party password-manager compatibility remains unverified.
- [ ] Keyboard Tab/Shift+Tab, noncomposing Enter, focus-ring bounds, long error corrections and alternate navigation work without mouse. In Playwright-owned Chromium, compositionstart/update/end and commit/cancel plus composition-ending Enter cause no premature request or lost/duplicated characters; the next deliberate submit sends once. Record this as synthetic/CDP evidence, not native Windows Korean IME proof.
- [ ] 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200% = 12 environments for login/signup initial/loading/error/accepted-request and blocked-account states. Capture screenshot/computed geometry: column ≤400px, gutter reachability, 40px controls, wrapping descriptions and final navigation, no page horizontal overflow or clipped top/bottom content.
- [ ] Genuine zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, asserts `getZoom===2` and records before/after CSS viewport/DPR. CSS zoom/transform, deviceScaleFactor or smaller emulated viewport is not substitution. OS light/dark before authentication and runtime changes use existing #46 behavior; no prior-user theme leakage.
- [ ] Measure actual normal text ≥4.5:1, large text ≥3:1 and active control/focus boundaries ≥3:1 in both themes, including autofill and pending disabled explanation. Record applicable states: normal/hover/focus/selected text/pending/empty/error/success; read-only permissions and unsupported field-specific invalid signals are N/A, not invented states.
- [ ] Preserve current pre-auth/auth-wiring/auth-round-trip and affected shared-form/theme tests; maintain login server gates, cookie and rate-limit regression. Initial session failures and installation route remain owned by existing App/#60 rather than being forced into anonymous login.
- [ ] Independent reviewer checks original issue/SRS, actual scoped diff and red/green/product-browser evidence. Missing exact signup-status/session-refresh signals or unperformed password-manager/native-IME runs are explicitly pending/separately traced; do not close requirements based only on this decision or callback/component success.
