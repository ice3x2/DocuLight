# Issue 60 — binding installation wizard and review decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains authoritative. No implementation, tests or verified status is claimed.

## Authority and actual flow

Read AGENTS/SRS index, GitHub #60, approved #48 shared-overlay and #59 auth decisions/reviews, newspaper guide/forms/handoff, **`docs/spec/04.screen-design-settings.md` §4.2–§4.8**, InstallWizard, PreAuthScreen/App installation entry, API client and install routes. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

IR-AUTH-001, FR-CONFIRM-019, SEC-AUTH-010/011/012/015/017 are verified/stable; SEC-AUTH-013 is verified/evolving; SEC-AUTH-014 is implemented/stable with unverified ACs. Do not infer that this presentation work verifies that entire token-restart requirement. IR-SHELL-009 AC-4, IR-SHELL-006 common control/state rules and IR-SHELL-008/#48 confirmation behavior provide the design delta.

**Preserve the prior specification's five stages: 1 token → 2 first account → 3 initial policy → 4 review → 5 completion.** The current one-screen implementation is a gap to fix under #60, not authority for removing stages. Stages 2–4 provide `이전`; backward movement remains available through stage 4 and preserves entered values. Stage 5 has no Back. Stage 4 is a distinct input-summary screen, **not** the confirmation gate: its `설치 완료` action opens exactly one separate L2 confirmation; only L2 acceptance commits. Canceling L2 returns to stage 4 without mutation. Stages remain internal wizard presentation, not new routes or APIs.

Scope is InstallWizard and scoped styles/tests, with the exact completion handoff required by the prior five-stage contract identified explicitly: PreAuthScreen currently redirects inside `onCommit`, which would bypass stage 5. Commit must resolve without immediate navigation so InstallWizard can show completion, and navigation must occur only from stage 5's `시작하기`. This minimal adapter change must be included in the agreed #60 handoff; it does not authorize wider App/cache/API/server or auth-policy changes. If that narrow integration adjustment is unavailable, stage 5 remains blocked, not waived. The existing `data-pre-auth=install` wrapper may be styled to the same 640px measure. Return/await the real commit Promise from the local confirm handler so #48's pending ownership works; the present detached async invocation is another scoped gap. Expiry metadata, new recovery endpoints and automatic login remain outside scope.

Retain #59's shell-free pre-auth framing and #46 OS-theme authority, but **installation is capped at 640px, not login/signup's 400px**. Preserve the actual `503 + state=uninstalled` entry and do not interpret every 503 as installation. No ordinary login/signup/settings control is introduced while installation is gated.

## Full-page geometry and field grouping

Full-page main on app surface, no background shell/settings gear and no modal for the form. At least `100dvh` with natural vertical document scroll; 24px minimum viewport gutters and 48px top/bottom spacing where available. Inner installation column ≤640px including box sizing. Use safe centering that collapses to page padding when content exceeds the viewport; never fixed-height clipping. Title `설치 마법사` follows #59's 28/38px serif 700, with 24px before the form. No cards, shadow, texture, marketing panel or downloaded font.

Each stage uses a single-column content region, with 18/26px sans 600 stage title and 20px field spacing. Show a compact progress indicator for the four input/review stages (`1/4` through `4/4`) and a separate completion state; it must not provide a way to skip token validation. Only the current stage participates in focus/accessibility navigation; transient values stay in the wizard owner, not browser storage.

| Stage | Content and actions |
| --- | --- |
| 1 `설치 토큰` | Token and console/expiry help; `다음` verifies token before entering stage 2 |
| 2 `최초 슈퍼유저 계정` | Account fields including specified password confirmation; `이전` to token and `다음` to policies |
| 3 `초기 정책` | Signup mode/default-group permission, default workspace identification and open+edit warning; `이전` / `다음` |
| 4 `검토` | Non-secret account/policy/workspace summary; `이전` / `설치 완료` (opens L2 only) |
| 5 `완료` | `설치가 끝났습니다. 설치 토큰은 사용되어 더 이상 유효하지 않습니다.` and `시작하기`; no Back or recommit |

Persistent field labels are 13/20px 600, native control text 14/22px sans, help/error 12/18px. Inputs/selects and stage actions are at least 40px, 4px radius, control surface and border-control; fields fill the column. Token may use mono. Long labels/help wrap and errors grow the document. Stage actions follow content with 24px separation, secondary `이전` before one primary `다음`/`설치 완료`/`시작하기`; wrap the action row when needed. No sticky footer obscures content at 200%.

## Token and first-account inputs

Use existing shared Field/Input/Select/Button while preserving native labels, ids and values. Token: stable name, masked native input, `autocomplete=off`, autocapitalization/spellcheck disabled; allow paste and do not trim/transform. Do not show the token in review, error text, URLs, storage, console logs, screenshots or network evidence. No reveal/copy/reissue action is added.

Token help: `서버 콘솔에 출력된 설치 토큰을 입력하세요. 토큰은 출력 후 30분 동안 유효하며, 정확한 만료 시각은 콘솔에서 확인할 수 있습니다. 분실하거나 만료된 경우 서버를 다시 시작해 새 토큰을 확인하세요.` This is guidance, not a local timer or a restart control. The UI does not know issuance time or absolute expiry; never start a 30-minute countdown at page load. Failed/canceled attempts before commit do not consume the token; server restart invalidates the old token. A transient error must not tell the user every retry requires a restart.

Superuser name remains native text with stable name and `autocomplete=username`; password and the prior §4.4 password-confirmation field are masked with stable names and `autocomplete=new-password`. A mismatch is a stage-2 inline error that blocks `다음`; confirmation is local input checking and is not sent as a new API field. Do not invent complexity/length/pattern rules or transform credentials. The wireframe's email field has unresolved schema/requiredness (§9-Q9); do not invent its storage/API. §4.5 fixes the default workspace as `workspace`; display that value rather than treating the current free-name input as authority for a new naming policy. Preserve current install payload shape with that specified default. Any claimed superseding SRS must be explicitly reconciled before changing these prior contracts. Browser autofill/native values remain intact.

Initial fields show no errors. Connect supported errors with `aria-describedby` and `aria-invalid`: token rejection to token; explicit `empty-password` commit rule to password. `unknown-choice`, `bad-field`, transport failure or workspace failure is not automatically a bad token/password. Clearing an error on editing its field does not consume or validate the token. Error focus targets the deterministically invalid field after a failed submit, otherwise a form-level error region without resetting values.

## Initial policy values and warning

Keep the current enums and defaults exactly:

| Field | Values / initial value |
| --- | --- |
| Signup mode | `open` = 자유 가입; `approval` = 승인 후 가입; `invite-only` = 슈퍼유저 직접 등록. Initial value remains `approval`. The last label does not introduce an invitation mechanism. |
| Default-group initial permission | `none` = 없음; `view` = 보기; `edit` = 편집. Initial value is **edit**, as SEC-AUTH-017 requires. No admin option. |

Reuse the existing GrantWarningList warning when and only when signup is open **and** default-group permission is edit, on the form and in the review. It explains that freely joining users can edit in the default workspace under that initial policy. Use warning text/surface, visible wording and no color-only cue. Other combinations do not inherit this warning. A warning neither blocks a valid selection nor silently changes its value. The none option means no initial default-group ACL grant, not a new permission level.

## Token verification, immutable review and the one L2 gate

Stage 1 `다음` captures the token, acquires a synchronous reentry guard and awaits `onVerifyToken`; it does not open L2 or commit. Show `토큰 확인 중…` and busy state, preventing duplicate requests. Ignore obsolete/unmounted attempts. Success stores the issued session and enters stage 2. Stages 2 and 3 `다음` advance local validated input only, never create the account/workspace or call commit. No server cancellation protocol is added.

Only successful token verification supplies an installation session. Stages 2–4 retain it and preserve entered account/policy values when moving Back/Next; do not invent a session, consume the token early or query extra endpoints. Returning to stage 1 permits token correction; changing/reverifying the token invalidates the old session and stale response. Preserve non-secret/account inputs for correction without displaying secrets in review. Stage 4 derives its summary from current wizard values; changing an earlier stage updates review. Clicking `설치 완료` captures the immutable payload for the separate L2 gate. Canceling the gate returns to stage 4 with inputs/session intact; edits invalidate the old confirmation snapshot, not the successful token merely because a policy changed. An observed invalid/expired session returns to stage 1 and must be reverified.

Stage 4 title is `검토`. It displays workspace `workspace`, superuser name, signup mode and default-group permission with wrapping 14/22px values/12/18px labels, plus the specified note that completing installation opens login/API/MCP paths. Never print passwords (including confirmation), token or session. This summary has `이전` and `설치 완료` and cannot itself commit. The separate L2 title is `workspace 를 만들고 권한을 부여합니다`; its purpose is initial-grant confirmation, not another copy of the four-stage data-entry flow.

**One L2 gate covers the required initial permission grant; no second account/signup-policy confirmation is added.** Preserve the relevant administrator/grant context, but account/signup input review belongs to stage 4. No child-node count, even `0`, no requested/affected counters, no recount endpoint and no typing token. Cancel receives initial focus; outside click is inert and Escape cancels only the gate. Cancel returns to stage 4 with values intact and focus on `설치 완료`. Confirm uses `설치하고 부여`. The gate stays within #48's ≤560px/24px-margin geometry.

The SRS requires a delayed-effect explanation for initial permission assignment, but the generic ConfirmGate `delayedEffect` text says nothing happens now, which is false for installation. Keep that generic flag off and put these two explicit, truthful notices in the gate:

- `확인하면 설치가 즉시 실행되며 되돌릴 수 없습니다.`
- `기본 그룹의 초기 권한 설정은 설치 시 저장되며, 이후 기본 그룹 사용자가 이 워크스페이스의 문서에 접근할 때 적용됩니다.`

The second notice explains subsequent permission effect without denying the immediate irreversible installation or inventing descendant counts. This corrects the current omission against FR-CONFIRM-019's full requirement/AC-5; it does not change ACL timing or policy. Keep the open-signup/edit warning distinct from these two notices.

Only deliberate L2 confirmation calls `onCommit` once with the issued session and reviewed snapshot. The local handler returns its actual Promise to ConfirmGate; a detached async task must not release the guard early. During that Promise, expose `설치 중…` and busy state, prevent duplicate confirm and form resubmit, and do not label any close/cancel control as canceling an in-flight server installation. Block local dismissal during the pending irreversible commit so UI does not imply abort; this does not cancel or change server execution. No artificial percentage or timeout-based success.

## Error, retry, security and completion

| Result | Honest handling |
| --- | --- |
| Token endpoint 401 (wrong, missing, expired or invalidated token) | Same token-rejection guidance using console help; mark token invalid, no reason distinction or raw token echo; release guard and permit reentry |
| Token network/5xx failure | Generic `설치 토큰을 확인하지 못했습니다. 잠시 후 다시 시도하십시오.`; do not call a transport error a wrong token or mark the field invalid |
| Rate limit when observable | `요청이 많습니다. 잠시 후 다시 시도하십시오.`; no invented countdown/backoff or automatic retry |
| Commit explicit existing rule | Preserve safe mapped guidance for `empty-password`, `unknown-choice`, `bad-field`, `already-installed`, `commit-in-flight`, `workspace-failed`; never raw exception/stack/path |
| Commit invalid/expired install session (401) | Generic session-validation failure; return to stage 1 for revalidation, preserving entered account/policy values. Do not infer token expiry/consumption/restart from the generic result. |
| Other commit failure | Stay on stage 4 with safe error and deliberate retry/correction; preserve inputs and valid session, reopen one L2 gate for a fresh attempt. No silent retry or fake success. Explicit password error links back to stage 2. |
| Commit callback resolves | Close L2 and enter the specified stage 5; clear transient token/session/password values, expose completion and `시작하기`. Do not navigate until the user chooses Start. |

The callback resolves only after the existing commit API succeeds; unlike void upload handoffs, local pending can be derived from this Promise. Server outcome still determines installation. An `already-installed`/uncertain concurrent result is not permission to automatically commit again or claim this attempt created the account. Preserve supplied guidance and existing entry behavior; a new persistent recovery/reload control would need a separately agreed callback/parent scope.

Do not change the four installation allowlist categories (screen, its static assets, verify-token, commit). No startup data, settings, principal search, child count, login/signup, new token-read/reissue route or third-party font request is introduced. Keep post-verification requests session-bound, server expiry/rate limit, commit serialization and token consumption semantics. Client state edits cannot bypass the session requirement. Don't set HttpOnly/auth cookies, fabricate account status or auto-login locally.

After successful commit, stage 5 is persistent and observable, with no Back or second install action. `시작하기` performs the existing root navigation, moved out of the premature commit callback. It must not run commit again. The prior screen document explicitly leaves automatic login unresolved (§9-Q23); do not invent an auth/session policy or login endpoint call to implement it. Start follows the existing authenticated/unauthenticated root behavior. The first superuser's active/group status remains server-owned. Actual stage-5 reachability, Start navigation and subsequent first-account login are product evidence. Discard secrets at completion/unmount; never persist them.

## Acceptance and independent evidence checklist

- [ ] TDD first: reproduce the one-screen gap; assert exactly five stages in order, stage-1 token verification before stage 2, stage-2 password-match validation, stage-3 defaults/warning, distinct stage-4 summary, one L2 after `설치 완료`, and persistent stage 5 after successful commit. No account/workspace creation before L2 acceptance.
- [ ] Back/state matrix: 2→1, 3→2 and 4→3 preserve typed values and policy choices; Next returns with them intact. Token replacement invalidates only the obsolete session/review, session errors return to stage 1, and stale token responses cannot skip stages. L2 cancel returns to stage 4 and preserves values. Stage 5 offers no Back and Start neither revalidates nor recommits.
- [ ] Actual fresh disposable instance enters installation through the existing HTML/503-marker path. No shell/settings gear, login/signup or unauthorized startup fetch appears. A marker-free 503 does not show installation. Validate the existing four-category allowlist and no new network paths from styling.
- [ ] Wrong/missing/expired/old-after-restart tokens have indistinguishable token rejection; valid token can retry after failed verification or canceled review. Server-time fixture tests verify 30-minute expiration and token consumption/restart rules; do not replace them with a browser countdown or claim SEC-AUTH-014 fully verified merely by UI tests. Never use a live operating instance for reset/install evidence.
- [ ] Verify actual session issuance and commit rejection without session, after forged client phase state, or with invalid session. Record requests with secrets redacted; don't persist real setup tokens/passwords/session values in screenshots/logs. Test independently that no token-read/reissue API or file is added.
- [ ] Default permission edit and signup approval are preserved. All three permission choices and all signup modes submit exact enum values; no admin option. Warning appears only for open+edit. Successful install creates the active first superuser, intended workspace and exact ACL/settings using existing services.
- [ ] L2 review contains both administrator and default-group grant in one gate, no child count and no extra step. Both immediate-install and subsequent-permission-effect notices are present; generic “nothing happens now” is absent. No commit before deliberate acceptance. Cancel/Escape preserve fields/token and return focus; outside click does not bypass review.
- [ ] Delay actual verify/commit responses: immediate double click, Enter, repeated confirm and reentrant events yield one request per pending phase. Reviewed snapshot equals committed payload. Pending irreversible commit cannot be dismissed as if canceled; failed commit releases guards and returns safe error/correction path. Network failure is distinct from token-invalid where observable.
- [ ] Actual commit success reaches and visibly remains on stage 5 (no premature parent redirect). `시작하기` then navigates through the existing root path; reload no longer allows installation, consumed token cannot reuse setup, and first-account credentials can login. No duplicate account/workspace, recommit or invented automatic-login policy. Concurrent/ambiguous outcome remains server-owned and must not falsely enter successful completion.
- [ ] 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200% = 12 environments for **each of the five stages** plus L2, token/mismatch errors, policy warning, pending and stage-4 commit failure. Measure ≤640px main column, 40px controls, progress/Back/Next/Start reachability and natural scroll; no overflow or inherited #59 400px cap. Stage transitions focus the stage heading/first field, Back restores useful field focus, and no inactive stage controls remain tabbable.
- [ ] True 200% uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, confirms `getZoom===2`, records pre/post CSS viewport/DPR. CSS zoom/transform, device scale or a smaller viewport is not substitute evidence. Test the actual full-page and topmost review overlay, not a bare component screenshot alone.
- [ ] Keyboard: initial token focus, stable labels and Tab order, native selects, cancel-first review, focus restoration and no global Enter handler. Korean IME composition in names/password cannot submit/confirm on commit Enter; next deliberate Enter may. Real native Windows IME/password-manager checks are distinct from synthetic/CDP/fill tests. Autofill/native values match the reviewed/submitted snapshot and secrets stay masked.
- [ ] Theme changes follow existing anonymous OS/root theme, preserve all fields/review state, and do not refetch or submit. Measure normal text ≥4.5:1, large text ≥3:1, active control/focus indicators ≥3:1 in both themes; no clipped 2px ring/2px separation. States include normal/hover/focus, native selection, temporary readonly/disabled, supported invalid, pending and error. No local timer or unobservable success state is invented.
- [ ] Run affected install-wizard/install-routes/install-assembly/allowlist/shared-overlay/auth/theme regressions and the actual disposable install path, including built assets. Independent review uses original SRS, final scoped diff and red/green/browser artifacts. Record any missing external expiry/completion/session handoff as separate scope; no aggregate requirement is verified by this decision.

## Independent review disposition

High 1 accepted (2026-09-17): the first decision incorrectly treated current one-screen implementation/comments as the stage-count authority and omitted `docs/spec/04.screen-design-settings.md` §4.2–§4.7. That restriction is withdrawn. The binding design now preserves token → first account → policy → review → completion, Back through stage 4, a separate single L2 after review, preserved values and persistent completion with Start. The implementation's one-screen flow and immediate parent redirect are identified gaps, not reasons to remove specification stages. The revision also distinguishes specified password confirmation/default workspace from unresolved email/automatic-login policy. No implementation was changed.
