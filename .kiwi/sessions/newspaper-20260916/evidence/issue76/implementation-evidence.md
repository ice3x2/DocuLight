# Issue 76 implementation evidence

Requirements: `IR-SHELL-009` AC-5 and AC-7 through AC-14, `FR-EDITOR-005` AC-1 through AC-2, and the shared presentation contract in `IR-SHELL-006`.

## Implemented behavior

- Authentication-ending actions use an exact `{userId, generation}` boundary. Dirty, saving, conflict, rejected, and composing editor surfaces are read from the live editor before logout/password dispatch. Composition blocks the request; unresolved drafts require exact-byte download acknowledgement or explicit discard.
- Delayed edit-session, autosave, attachment, wiki, merge, version, restore, upload, and protected continuations re-check their captured owner and surface generation. Old results cannot update a replacement owner's UI or cache.
- Identity validation and authentication mutation HTTP outcomes return explicit discriminated results. App branches exhaustively across accepted, malformed, and HTTP outcomes; exceptions are reserved for transport failures.
- Initial identity bootstrap failures remain an unmounted bootstrap error. Once an owner is established, `/auth/me` malformed, HTTP 500, and network failures instead enter an exact owner/attempt/token uncertainty boundary while preserving the same mounted editor instance and bytes. That boundary blocks protected reads and writes and provides a GET-only single-flight retry; same-owner success resumes, 401 ends the boundary, and a different-owner result cannot revive the old surface.
- Requested routes own loading, pending confirmation, error, and missing presentation. The prior exact editor instance and bytes remain mounted only inside a hidden, inert, `aria-hidden` retained host until cancellation or acceptance. Popstate fetches fresh authority, correlates results by generation, and preserves namespaced history key, index, and epoch. Cancellation uses `history.go(delta)` with an exact restoration token.
- Root navigation renders the exact no-selection pane even when tabs are retained; every tree selection invalidates an older requested-route generation.
- Logout and password attempts bind both their POST and follow-up GET continuations and their dispatch lock to the exact `{userId, generation, attempt}` token. Boundary end and owner replacement clear the old lock; an old `finally` cannot release a newer attempt.
- Version list, compare, and restore dispatches and continuations re-check explicit owner, authorization phase, and epoch. Closing authorization settles and invalidates pending UI; same-owner resume refetches the list and re-enables compare/restore. Frozen surfaces share one gate for mode changes, merge edits, local edits, Ctrl+S, attachments, and history actions.
- Authentication handoff makes the protected shell inert, traps focus, and protects unload until download/discard/cancel resolves. Cancel thaws the same exact editor bytes and removes the unload guard.
- Mounted body 404 and authoritative tree omission quarantine only same-owner/node at-risk bytes, remove server content, show neutral not-found, and keep recovery local until download or discard. Every unresolved recovery surface installs `beforeunload`.
- The install page theme bootstrap uses the existing `/assets` allowlist so the built install shell loads all referenced assets without widening the four-route pre-install gate.

## TDD record

- `red-owner-continuations-latest.txt`: delayed edit-session and delayed save continuations initially escaped the owner boundary (2 failures), then passed.
- `red-mounted-recovery-latest.txt`: mounted recovery initially did not protect unload, then passed.
- `red-requested-target-latest.txt`: a popstate target initially exposed the prior document instead of loading/error, then passed.
- `red-tree-omission-latest.txt`: authoritative tree omission initially left the old editor mounted and lost recovery after asynchronous loading unmounted it; snapshot-before-read and commit-on-denial made it pass.
- Review-fix RED runs additionally exposed: missing exact-attempt checks; three unguarded VersionHistory continuations; frozen mode changes; missing handoff inert/unload behavior; retry double dispatch; synthetic exception control flow; and requested-route loading unmounting a rejected pane before confirmation.
- Second-review contract RED is preserved verbatim in `red-review2-contracts.txt`: 18 failures covered the retained requested-target host, root no-selection, explicit VersionHistory authorization lifecycle, exact attempt lock, and discriminated client/App outcomes. `red-review2-malformed-app.txt` is retained only as a superseded audit artifact: that removal also broke valid initial identity mapping, so its failures occurred during bootstrap and do not establish the required mounted-editor transition RED.
- The authoritative third-review behavior RED is `red-review3-malformed-transition.txt`. Valid initial identity/bootstrap mapping remained intact; each logout-unknown, password-400, and password-unknown case first mounted the editor and exact source bytes and observed exactly one mutation POST, then failed because removal of only the malformed transition branch resumed the same owner instead of entering uncertainty. `red-review3-established-identity.txt` separately records the four failures for established-owner malformed, HTTP 500, network, and different-owner retry behavior before the split implementation. `green-review3-identity.txt` records the immediate 8/8 GREEN.
- Fourth-review product RED is retained in `red-h2-product-history.txt`: a third-party history transition initially discarded the rejected B draft when B was revisited. `red-review4-product-coverage.txt` records the missing checker contracts before the expansion. The later focused run is 65/65 GREEN and the final product run covers mounted read recovery, compensating history navigation, live state presentation, and the complete authentication outcome table.
- Fifth-review contract RED is `red-review5-product-contract.txt`. It rejected the vacuous session-read bound and missing confirmed/recovery/observed-state contracts. The final focused run is 66/66 GREEN. Attempts 8 through 16 preserve the successive exact-count, label, focus-restoration, and handoff failures; `playwright-review5-attempt17.txt` is the first complete GREEN.
- Review-8 owner-replacement RED is `red-review8-owner-replacement.txt` with raw test SHA-256 `4722a6adf85910873cef953dcd11a366cadf9cbada46777f7d962560419247f0`. A spontaneous React Query `['identity']` replacement removed the mounted source editor before passive quarantine, so returning to the original identity had no recovery record. The fix keeps ordinary registration cleanup passive and adds a layout cleanup that retires only a mismatched owner registration while its live DOM reader still exists. The test proves exact latest bytes, zero different-owner text/value exposure, and original-owner recovery.
- `review8-failure-ledger.md` classifies review-6 attempts 1–15 and the independent review-8 rerun failures. Navigation/route and request-window failures are recorded as failures; they are not folded into the later green result. Confirmed-204 cells now mark the deliberate late-session request with `x-issue76-late-session`, count only the post-acceptance identity refetch window, explicitly await that refetch, and retain strict equality assertions.

## Product browser evidence

`browser-matrix/measurements.json` is produced by the disposable product runner and isolated Playwright-owned profiles.

- Two actual accounts and two authenticated contexts prove identity separation, zero cross-account recovery disclosure, actual ACL grant/edit/revoke, server 404, exact local recovery bytes, and `beforeunload`.
- Twenty-four actual fresh authentication outcome rows cover confirmed logout/password completion, password rejection, logout/password uncertainty across session and identity same/different/401/500/network/malformed outcomes, and late-success isolation. Every row comes from its own browser profile and records exact mutation, session, identity, and protected-write request counts; no compatibility aliases are counted.
- Four actual at-risk draft cells cover session 401, identity 401, password 401, and account replacement. Each completes the handoff, reaches teardown, restores the exact Blob bytes only after the same real account logs in again, proves a different real account sees zero recovery/name/body/cache and performs zero autosave writes, and then discards the recovery for its lifetime.
- Actual document clicks plus `goBack()` and `goForward()` prove distinct history keys, index ordering, unchanged history length, Back/Forward cancellation with real `history.go(delta)` compensation, an unavailable entry's neutral missing state, and late tree-resolver isolation. A rapid nonmatching pop event does not disturb the compensated destination.
- Mounted HTTP 500 and network failures preserve the exact editor DOM identity, local body, caret/selection, and synthetic composition lifecycle; retry succeeds without remounting it.
- Synthetic composition blocks logout with zero POST. A delayed save produces a busy handoff with zero logout POST and exact downloaded Blob bytes.
- Each of 12 viewport/theme/zoom cells and 6 forced-colors cells owns a fresh persistent profile. Every cell records Chromium tab identity, browser identity, user agent, DPR, zoom-1 baseline, three stable frames, zoom-2 half geometry, measured foreground/background and control-boundary contrast, visible focus, and zoom-1 restoration. The live dialog additionally proves focus trapping/restoration, retained-host inert/`aria-hidden`, actual overflow reachability, and 100→200→100 runtime resize recovery.

Each disposable authentication and 12+6 matrix cell creates its own page after the persistent context and extension worker are ready. The checker does not reuse Chromium's startup page, whose independent startup navigation produced recorded `net::ERR_ABORTED` and route-install timing failures.

Native Windows IME candidate UI remains the permitted nonblocking manual boundary; automated evidence is synthetic composition and DOM behavior only.

## Current validation

- Root typecheck: PASS (editor, server, web).
- Root build: PASS (editor, server, web).
- Root regression: PASS; editor 261 passed and 1 skipped, server 1500 passed, web 1211 passed.
- Product Playwright: PASS; `issue76 product checks passed (12 normal + 6 forced)` plus ACL, 24 actual fresh authentication outcome rows, four same-App same/different-account recovery cells with zero old-owner render frames, unavailable/compensated/late history behavior, mounted 500/network recovery, composition, busy handoff, and exact Blob assertions.
- SpecKiwi validate: 0 errors and the existing `SRS-W072` warning only; phase-1 stability blockers 0 and missing evidence 0. Link check retains the existing unrelated `IR-AUDIT-004` reference `32` warning.
- `git diff --check`: PASS apart from line-ending notices.

No commit, push, requirement status promotion, or Completed Work mutation was performed. Independent review remains the final gate.
