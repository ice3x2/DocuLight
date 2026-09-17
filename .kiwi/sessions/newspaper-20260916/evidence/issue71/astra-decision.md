# Issue 71 — binding instance-policy settings decisions

Decision: Astra, 2026-09-17, under delegated design ownership. Supporting implementation reference; `docs/spec/` remains authoritative. No implementation, tests or verification is claimed.

## Authority, exact scope and prerequisites

Read AGENTS, live #71, SRS index/current mode/target, approved #61 and newspaper form/state rules, prior settings §2.12, InstanceSettings/client GET+PUT, server settings/defaults/retention/grade consumers and settings/retention tests. SpecKiwi confirmed `C:\Work\git\DocuLight2.0`, `server-cwd-discovery`, mode `sdd`, target `phase-1`, no stability blockers.

DR-SHELL-001 and FR-AUTH-004/FR-ATTACH-006/FR-STORAGE-004/007 are verified/stable; REL-AUDIT-003 is verified/stable and owns `audit retention ≥ trash retention` with zero treated as unlimited. FR-CONFIRM-007 is implemented/stable and FR-CONFIRM-008 verified/stable. IR-SHELL-002 fixes five fields. Preserve server DB authority and superseding R154 retention rules; older screen notes treating audit default/zero/cross-field relation as unresolved are no longer controlling.

Primary scope is InstanceSettings and scoped styles/tests. This component already owns real loadSettings/saveSettings Promises, so truthful local query/edit/save/retry does not need a new App mutation layer. The parent category/close guard described below is an explicit narrow integration prerequisite. No new settings key, server API, auth/retention policy, schedule control, immediate cleanup operation or dependency is authorized.

| Prerequisite/gap | Disposition |
| --- | --- |
| B1: retention reduction impact | No HTTP/client contract supplies authoritative current affected counts for proposed trash/audit reductions. Such a save must remain blocked, never executed with guessed zero, default L2 or maximum L3. Complete FR-CONFIRM-007 requires separately scoped server preview/consent integration. |
| B2: unsaved parent departure | Prior §2.12 requires category/modal exit confirmation for dirty values. InstanceSettings cannot intercept parent unmount alone. Add only a scoped secret-free leave-guard registration in #61's SettingsModal (or reuse an agreed compatible handoff), with dirty count and callback ownership; no form values need global storage. Without it the departure contract is incomplete. |
| B3: effective/default metadata and numeric server validation | GET returns raw stored strings/defaults, no validation schema, revision or impact. Consumers apply finite-number fallbacks while the write route accepts raw known-key strings. Do not claim strict server numeric validation or invent limits/integer restrictions. Invalid persisted values and unsupported concurrent guarantees are reported honestly. |
| B4: signup/default-ACL combination | GET settings does not supply the current default workspace ACL. Do not fabricate “default currently has edit” or a permission-navigation link to implement the older conditional warning. Its authoritative ACL handoff is separate. General signup-mode explanation is supported. |

Safely achievable work includes all five-field presentation, explicit safe saves, real load/save states, numeric/cross-field checks and dirty draft preservation. Full shortening/exit/combination-warning completion is not claimed without its prerequisite.

## Exactly five fields, units and observed defaults

Render keys/labels from existing INSTANCE_SETTING_FIELDS; no sixth item. Defaults below are **observed server registry values returned by GET**, not new client fallback or policy:

| Key / label | Control and unit | Server default / meaning |
| --- | --- | --- |
| `signup-mode` / 가입 모드 | Native select: 자유 가입=`open`, 승인 후 가입=`approval`, 슈퍼유저 직접 등록=`invite-only` | `approval` |
| `upload-size-limit-bytes` / 업로드 크기 제한 | Numeric text input, explicit `바이트` unit | `104857600` bytes; no guessed MB conversion |
| `retained-version-count` / 보관 버전 개수 | Numeric text input, `개` | `20`; oldest excess versions are pruned under existing snapshot behavior |
| `trash-retention-days` / 휴지통 보존 일수 | Numeric text input, `일` | `30`; `0` means unlimited retention |
| `audit-retention-days` / 감사 로그 보존 기간 | Numeric text input, `일` | `365`; `0` means unlimited retention |

No font/autosave delay, personal theme, queue, SMTP, port/docsRoot/DB/proxy field, administrator role or cleanup interval is introduced. Values persist in the instance DB, never config/localStorage/personal-settings storage. Do not add a defaults-reset button; the specified `되돌리기` resets only unsaved edits to the latest confirmed server baseline.

Do not copy illustrative `50 MB` from an old wireframe or prefill client defaults when GET fails/misses a field. Preserve exact server strings as the baseline; a missing key or unrecognized enum is an unavailable/invalid stored setting to correct, not permission to silently write a fallback. Keep enum display choices fixed by existing contract without treating a raw unknown stored value as a valid new option.

## Form geometry and explicit saving

Stay in #61's 인스턴스 설정 right panel; no nested ordinary modal/new route. Use a max640px content column within available body width, left aligned. Heading18/26px sans600, five stacked sections with 32px separation and subtle rules as needed; each field has a persistent13/20px600 label, native14/22px control,36px minimum height,4px radius, control surface/border-control. Help/errors12/18px wrap; numeric input and unit are associated programmatically, not placeholders.

The action row has `변경 N건`, secondary `되돌리기`, primary `저장`. Count is the number of changed keys among the five, not values/characters. Use a sticky row **inside the right settings scrollport** only with reserved space and an opaque surface/border so it cannot cover the last field; when height is insufficient it stays reachable at the content end. It never covers #61 title/close/categories. Buttons≥36px,8px gap and wrapping allowed. No immediate save on change/blur and no global Enter handler.

Maintain distinct `baseline` and editable `draft` in component memory. This is an explicit form draft, not a second DB authority. `되돌리기` copies baseline into draft and clears relevant validation/status; it does not issue PUT or load hardcoded defaults. No-change Save is disabled. During actual save, lock the submitted snapshot/guard duplicate submits and keep inputs visible; pending readonly/disabled styling does not erase values.

## Numeric and cross-field validation

Use numeric text inputs with appropriate inputMode to preserve partial typing/error text; values are still submitted as strings. Validate with explicit checks, not exceptions or fallback substitution. Initial pristine fields show no errors; validate after blur/submit, and do not validate unfinished IME composition.

- Reject an empty/whitespace-only numeric draft, a non-finite/non-numeric value, or an out-of-domain sign before constructing a save. Do not let `Number('')` silently become zero/unlimited. Show an adjacent actionable field error and aria-invalid.
- Match current consumer domains: upload size and retained-version value are finite **greater than zero**; retention values are finite **greater than or equal to zero**. Zero is not a disable/unlimited option for upload/version count.
- Current server consumers do not enforce a shared integer schema or maximum. Do not invent integer-only limits, range caps, rounding/truncation, multiplication from display MB or a hidden canonicalization policy in #71. Preserve accepted text/numeric meaning; if a stricter bytes/count/days integer policy is desired, specify it separately in SRS/server validation. Do not claim existing endpoints reject every invalid raw string just because the form blocks it.
- Invalid persisted raw values may be shown with a correction message; do not quietly replace them with the runtime fallback and call that a saved value. A risk comparison against an invalid/unknown baseline cannot authorize a reduction.

Validate the **whole proposed retention combination**, including unchanged companion value. Map zero to infinity for comparison: audit0 covers any trash value; trash0 requires audit0; otherwise auditDays≥trashDays. Equal finite values are valid. This catches either lowering audit below trash or raising trash above audit, including a coordinated valid two-key change. Error copy: `감사 로그 보존 기간은 휴지통 보존 기간보다 짧을 수 없습니다. 0은 무제한입니다.` Link it to both implicated fields without blaming unrelated settings. Server remains final authority.

`open` explanation may state that new users can register freely; `approval` requires approval and `invite-only` means superuser registration. Do not infer effective workspace access/default-group ACL from signup mode alone. Do not invent email invitations or automatic role changes when the mode changes.

## Query, stale state and save outcomes

| Actual phase/outcome | Scoped UI |
| --- | --- |
| Initial GET pending | Shared `인스턴스 설정을 불러오는 중입니다.`; no editable blank/default form |
| Initial GET failure | `설정을 불러오지 못했습니다.` and real `다시 불러오기`; no save/false empty success |
| Ready | Baseline-backed form/draft, actual changed-key count |
| Save checking/pending | `설정 확인 중…` / `저장 중…` only while corresponding existing Promise runs; guard duplicates |
| Client numeric/cross-field error | Keep draft and focus first deterministically invalid field; no PUT |
| PUT rejected/unconfirmed | `저장 요청을 완료하지 못했습니다. 입력은 유지됩니다. 현재 값을 확인한 뒤 다시 시도하십시오.`; keep form/draft, no “load failed” replacement or false saved state |
| PUT accepted, readback ready | Show `저장됨`, update baseline from authoritative current values and clear only the submitted/unchanged draft generation |
| PUT accepted, readback fails | `저장은 완료됐지만 현재 값을 다시 불러오지 못했습니다.` with read-only GET retry, never resend PUT to repair refresh |

Use existing GET before a save to verify the current baseline/proposed combination and determine whether the real change is a reduction; another administrator may have altered retention since opening. If dirty keys or coupled retention values changed on the server, retain the draft, show `서버의 설정이 변경되었습니다. 현재 값과 변경값을 다시 확인하세요.`, and require a fresh explicit review/save against that baseline. Do not silently overwrite local edits with the late response or auto-approve a newly destructive delta.

Send only changed **known** keys in one existing PUT snapshot; don't submit unmodified stale keys or split a coupled retention change into independently ordered writes. Fresh server companions inform the invariant. No conditional-write/revision API exists, so this cannot guarantee atomic optimistic concurrency between last GET and PUT; record that limitation and test it rather than inventing ETags/server conflict semantics.

After accepted PUT, re-read via existing GET for actual current values; don't mistake HTTP204 for cleanup already performed. If GET fails, keep accepted-write state separate, preserve necessary baseline/draft facts and allow explicit GET retry. Any later editing/owner/unmount/request generation prevents an obsolete read/save result from clearing a newer draft or painting a different session. No automatic write retry, rollback PUT or optimistic “saved” timer. A transport failure may be uncertain; preserve draft and re-read before the next deliberate save, not assert DB was unchanged without evidence.

The current PUT returns a generic400 for validation and no structured `retention-inverted` body. Known local validation can show its exact field error; other HTTP400/403/5xx/network failures use safe generic operation guidance. Never turn every failure into a numeric error, leak raw body/stack or continue operating after role loss. Existing server superuser gate remains final; workspace managers/ordinary users neither see the category nor save through direct requests.

## Retention shortening and confirmation blocker

Classify retention semantics correctly against current effective baseline: finite→smaller finite is shortening; unlimited0→finite is shortening; finite→0 is expansion; same semantic value or larger finite is not shortening. This applies independently to trash and audit. Do not interpret zero as the shortest duration or compare raw numeric magnitudes.

For a shortening, FR-CONFIRM-007 requires an authoritative fresh impact count: **0 → L2; positive → L3 with that count as exact typing token**. Counts are refreshed when opening and before accepting stale consent; changes lock/update the confirmation under FR-CONFIRM-004. All such confirmations include the delayed-effect explanation that existing items/rows are not deleted by clicking Save and effect occurs at the next cleanup. For audit, explain that retention expiry is the permitted automatic removal path, not row editing/deletion.

**No current preview endpoint supplies this data. Therefore do not send any PUT snapshot containing a shortening until B1 is satisfied.** Show `보존 기간 축소의 영향을 확인할 수 없어 저장할 수 없습니다.` and keep the complete draft. Do not count the visible trash/audit arrays, guess zero, invoke an internal sweep to discover impact or substitute L2/L3 “to be safe.” Do not silently save only the nongated fields from the same attempted snapshot; user can deliberately revert the risky edits and save a different draft.

If both retention fields shorten together, their objects/counting domains differ (trash nodes versus audit rows, with queue consequences). Do not sum them into a made-up token or invent a combined confirmation contract. The future authoritative preview must define this coordinated change before it can execute; single combined settings validation alone is not sufficient impact evidence. Until then it is blocked with the same preserved draft.

For expansion/unlimited changes, preserve the existing explicit-save flow without introducing a destructive gate. Keep truthful help that subsequent cleanup uses the configured policy; no immediate purge/rescan button. The retention-grade rule specifically names trash/audit periods; do not attach a guessed impact count/L3 to unrelated signup/upload/version edits. Version count still follows existing oldest-excess pruning; #71 does not alter that service or promise its side-effect timing beyond the actual contract.

## Unsaved departure, focus and theme

Prior §2.12 requires warning on category/modal departure with dirty fields. Through B2, intercept before InstanceSettings unmounts and show the existing shared risk-style confirmation with `저장하지 않은 변경 N건이 있습니다.`; safe choice `계속 편집`, explicit discard `변경 버리고 나가기`. It is a local draft-discard guard, not the retention L2/L3 save consent. Cancel/Escape returns to the draft intact; outside click cannot accidentally discard it. Do not create “save and leave” that bypasses validation/impact gate. `되돌리기` after explicit action leaves no dirty draft and therefore no leave prompt. Auth invalidation does not preserve privileged settings across users or add browser storage.

Keep #61 modal geometry and #48 overlay ownership. The child guard exposes only dirty count/intent continuation, not a copied global settings draft; conflicting pending navigation cannot silently replace the destination after confirmation opens. Until the parent handoff exists, no component-only claim proves category/close safety. No broader document/settings unload policy is introduced.

Normal focus stays on edited field; query/status updates do not steal it. Failed validation goes to its actual field, save failure stays within form, discard cancel restores initiating control and confirmed departure follows existing parent focus. Theme changes use shared roles without remounting/clearing drafts or submitting. Native Tab/select/edit/submit behavior remains; IME commit Enter does not save or confirm. Forced-colors permits Canvas/CanvasText/ButtonText/Highlight with real focus outlines/borders and visible error/warning words, no global authored-color override or shadow-only cue.

## Acceptance and independent evidence checklist

- [ ] TDD red first: current save failure destroys draft, missing retry/pending, numeric blanks/fallback, five-key exactness, dirty count/reset, stale responses, leave guard and blocked shortening. No class-only or generic callback success proof.
- [ ] Actual superuser GET→edit→explicit PUT→readback/reopen/server-restart persists the five settings in DB. Defaults come from actual server response; personal settings/config unchanged. Ordinary/workspace-admin GET/PUT blocked; no cached privileged form/actions after role loss. No sixth/bootstrap/queue field.
- [ ] Validate blank/whitespace/NaN/Infinity/negative and zero per field; preserve valid consumer-domain values without invented integer caps/rounding/unit conversion. Test audit≥trash both directions, equal, audit0, trash0/auditfinite invalid and both0, plus coordinated valid patch. Server generic errors are not mislabeled as a particular field.
- [ ] Test actual initial-load failure separately from save failure: initial failure has no blank editable form; failed PUT keeps draft/field values/count and offers real correction/retry. Accepted PUT plus failed GET shows accepted save with refresh error; GET retry sends no second write. Delayed/obsolete responses cannot replace newer draft/account state.
- [ ] Concurrent administrator changes between load/preflight/save: only dirty keys are sent; altered baseline/coupled values require review, and semantic reduction classification uses current values. Record lack of atomic conditional-write guarantee rather than claiming CAS protection. No optimistic inverse write or automatic retry on uncertain outcome.
- [ ] Shortening finite→smaller and0→finite sends no PUT without real impact preview. Component fixtures may test the intended0=L2/positive=L3/count-refresh/delayed-warning behavior, but cannot close B1 with invented counts. Both-field shortening remains blocked without defined combined impact contract. Expansion/finite→0 preserves normal explicit save and invariant.
- [ ] Real existing downstream behavior after safe changes: signup mode affects new signup as existing server defines; upload boundary uses exact byte value on tree/paste; version retention maintains oldest-first behavior; safe retention expansion/unlimited persists without immediate cleanup fiction. Preserve per-changed-field audit logging and no false claim that a displayed saved status proves physical pruning completed.
- [ ] Actual parent category change/close/Escape/outside with dirty draft goes through B2 before unmount; continue preserves exact values, discard navigates once, reset clears dirty state. No stale navigation target, cross-user draft persistence or save bypass. Missing guard remains explicit unmet evidence.
- [ ] 1280×720,1440×900,1920×1080 ×light/dark ×100%/genuine200% =12 environments, plus forced-colors active at100%/200%. Long Korean help/errors, numeric partial input, loading/error/save/blocked-warning/discard states. Measure controls/units/action-bar reserved space, last field/save/close reachability and no modal overflow; retain computed styles/screenshots.
- [ ] Genuine zoom uses isolated persistent Chromium extension `chrome.tabs.setZoom(tabId,2)`, asserts getZoom===2, records pre/post CSS viewport/DPR. Resize and100→200→100 while dirty/error/confirmation is mounted; state/focus and sticky/end action placement remain correct without reload. CSS zoom/transform/deviceScaleFactor/half viewport is not equivalent.
- [ ] Keyboard Tab/Shift+Tab, select arrows, explicit Enter submission, number corrections, error focus and discard return work. Native Korean IME composition/commit Enter does not save/confirm; synthetic/CDP is supplementary. Native fields keep exact strings and units/labels accessible.
- [ ] Actual text≥4.5:1, large text≥3:1, active control/focus≥3:1 in both themes; forced-colors warning/invalid/disabled/readonly/pending states remain non-color identifiable. No clipped2px focus+2px separation or covered final field.
- [ ] Run settings-panel/instance-settings/shared-form/overlay tests, server settings/audit-retention-invariant/attachment/version/retention regressions and built-product flow. Independent review checks original SRS, exact local logic/leave adapter and real state evidence. B1/B2 and unprovided ACL/validation/revision metadata remain explicit completion limits.

Open blockers: authoritative retention-shortening impact (including coordinated cuts) and parent dirty-leave interception; conditional signup/default-ACL warning and stronger backend numeric/revision semantics are separately scoped. Do not mark blocked destructive policy saves complete by using a fake confirmation or guessed count.
