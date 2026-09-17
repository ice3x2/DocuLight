# Issue #88 Astra decision — independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Authority and requirement fit

The decision is valid supporting implementation guidance for planned/stable `IR-SHELL-013`; it keeps the SRS as authority and makes no implementation or completion claim. The session state records the user's Astra decision delegation. Its four-field registration exactly matches AC-1 and AC-6: opaque owner ID, nonnegative dirty count, confirmed-discard callback, and cancelled-departure callback. Baselines, drafts, field/value maps, validation strings containing values, PAT plaintext, credentials, DOM serialization, and mutation payloads stay in the child and out of parent state and browser storage.

The scope remains narrow. It wires `InstanceSettings` as the first ordinary dirty-form owner and does not create a global unload service, save-and-leave, auto-save, persisted draft, router interception, new setting, or migration of unrelated child forms. It preserves `IR-SHELL-002/008`, `DR-SHELL-001`, and the stronger `IR-AUTH-003`/`SEC-AUTH-006–009` PAT lifecycle.

## Ownership and race safety

The single-owner capability and epoch rules are sufficient for current React behavior. Only the mounted active category can register. A competing owner is rejected without displacing the live guard; same-owner count updates do not replace ownership; cleanup clears only a matching owner and registration epoch. Explicit invalidation before replacement makes delayed cleanup and React StrictMode mount/cleanup/remount safe. Stable callback identities prevent ordinary rerenders from unregistering the owner or cancelling an open prompt.

The decision correctly requires registration synchronization before the next departure event and forbids an arbitrarily delayed passive effect. A layout-synchronous capability update can observe the committed input edit before the following pointer/keyboard event while the child continues to own the actual strings. Immediate edit-and-leave, rapid count changes, count-to-zero, competing owners, stale cleanup, and replacement-form callbacks are all explicitly required tests.

The pending intent contains only `category(targetId)` or `close` plus owner/session/category epochs and focus, rather than a replaceable callback. First intent wins while confirming; later close/category/outside events cannot change or queue the destination. Cancellation and confirmation consume the intent before callbacks, owner/auth/permission/destination are revalidated, and the exact original transition can occur at most once. Teardown, auth loss, owner replacement, target revocation, callback failure, and double activation all invalidate rather than replay the transition.

## Every dismissal path and PAT priority

The current `SettingsModal` changes category directly from controlled Radix Tabs and closes from `Dialog.onOpenChange`; Escape/outside only have PAT-specific prevention. The decision gives all ordinary dirty departures one parent arbiter: category pointer/keyboard activation, header close, `onOpenChange(false)`, Escape, and pointer-down outside. It keeps the current panel mounted until resolution, normalizes overlapping Radix callbacks with an intent/event latch, and forbids global document listeners or click-through to the page.

The specialized PAT guard remains stronger and earlier than the ordinary guard. Issuing, reveal, copying, and discard stay in `TokenPanel`; plaintext never becomes a generic dirty value or parent payload. Category/header-close intent continues through the existing PAT continuation, while PAT Escape/outside suppression remains its security exception. The design prevents stacked PAT/ordinary prompts and separately prevents a retention L2/L3 save dialog from stacking with the ordinary departure L2. This is consistent with the current `TokenLeaveGuard` continuation contract and `TokenPanel` generation checks.

Permission and identity changes are handled as security lifecycle events rather than user discard. Revoked content and its guard disappear immediately, privileged local state is cleared, pending intent is cancelled without invoking callbacks for a replacement owner, and late child results cannot revive or dismiss another form. This preserves the current #61 unavailable-state behavior without holding unauthorized content open behind a confirmation.

## Save interaction, focus, and accessibility

Dirty count remains truthful throughout #71/#87 preflight, preview, PUT, uncertain, and readback states. Confirmed departure during an already-sent PUT does not claim network cancellation or rollback; the dialog explicitly says the request is not cancelled, and unmount generation checks prevent its late UI result from mutating another form. Reopening uses authoritative GET. A clean form with only readback in flight can leave, and the parent never clears dirty state on a child's behalf.

The shared L2 presentation is feasible with the current `ConfirmGate`: add only a safe-action label while preserving existing defaults. It has a programmatic title/description, safe initial focus, topmost focus trap, outside-click rejection, IME composition protection, live count/failure announcement, and the approved 400/500/600/700/800/900 ownership layers. Focus restoration is concrete and privacy-safe: capture an element reference without reading its value, prefer the still-connected edited/initiating control, then the active category tab; confirmed close returns to the settings gear.

Pointer and keyboard category activation are covered at the real Radix boundary. The decision requires preserving the selected panel while a target tab may temporarily hold roving focus, preventing target-tab focus/`aria-selected` mismatch from retriggering navigation, and restoring the original form control after cancel. It also covers Arrow/Home/End/Enter behavior, topmost menu/risk Escape, follow-up outside click suppression, exact once-only departure, and current-category/target revocation.

## Test-first and Playwright evidence contract

The decision requires failing tests for all six `IR-SHELL-013` acceptance criteria before product edits, with raw red and green output plus revision/hash. The planned integration suite uses actual `AppShell`/`SettingsModal` and `InstanceSettings`, not a disconnected callback fixture, and exercises all four close paths, exact draft/focus retention, clean/reset/reconciled departure, owner epochs, StrictMode, callback failure, auth/session teardown, pending saves, #87 independence, and the real PAT reveal/copy/discard lifecycle.

Privacy verification inspects the registration and parent-state contracts rather than relying on absence from rendered DOM. Product closure requires a real temporary server/database/vault/account/profile/port, the bottom-left gear and actual category tabs, persisted-value checks after exit/reopen, and no mocked successful guard path. The 12 light/dark/resolution/genuine-zoom environments plus forced-colors, independently asserted browser zoom, resize and 100→200→100 while the same dirty form/dialog stays mounted, native keyboard/focus checks, and separately qualified native IME evidence are adequate for the accessibility and reachability claims.

## Sources inspected

- Live GitHub issues #88, #87, #71, and #61
- `AGENTS.md`, `.kiwi/sessions/newspaper-20260916/state.json`, and `docs/spec/00.index.md`
- `IR-SHELL-013`, `IR-SHELL-002/008`, `DR-SHELL-001`, `IR-AUTH-003`, and `SEC-AUTH-006–009`
- Prior #61 and #71 Astra decisions and independent decision reviews
- Current `AppShell`/`SettingsModal`, `InstanceSettings`, `TokenPanel`, `ConfirmGate`, Dialog/AlertDialog wrappers, overlay CSS, client adapters, and relevant tests/runners
- `.kiwi/sessions/newspaper-20260916/evidence/issue88/astra-decision.md`

This is a pre-implementation decision review. No product implementation, automated test, browser run, SRS status change, commit, GitHub mutation, or issue closure was performed or claimed.
