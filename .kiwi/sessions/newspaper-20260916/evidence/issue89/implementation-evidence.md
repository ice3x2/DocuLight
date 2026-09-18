# GitHub #89 implementation evidence

Requirement: `IR-WORKSPACE-003` (Status `planned`, Stability `stable`), with `FR-CONFIRM-012`, `FR-CONFIRM-004`, `SEC-WORKSPACE-002`, and `IR-WORKSPACE-001` as related contracts. Persisted work mode remained `sdd`; active target was `phase-1`.

## RED first

- `red-server.txt`: four route-contract tests failed 4/4 with the unimplemented GET/POST routes returning 404.
- `red-server-success-status.txt`: the Astra success contract correction failed with received 201 versus required 200 before the one-line route correction.
- `red-web.txt`: the new L2 component import failed before the component existed.
- `red-web-integration.txt`: the #72 administrator section lacked the `관리자로 지정` entry control before wiring.
- `red-web-expiry.txt`: a preview that expired after display still called the mutation callback before the callback guard was added.
- `red-web-principal-id.txt`: the gate omitted the submitted principal ID before the identity display correction.
- `red-web-authoritative-identity.txt`: the gate initially kept stale prop names instead of the server preview's current workspace/principal identity.
- Playwright runs 6–8 preserved the real focus-return failure before the deferred focus restoration correction.

## Focused GREEN

- Server: `green-server.txt`, 1 file / 6 tests passed. Covers broken-inheritance counting, neutral refusal/structural input, one accepted token/replay, stale visible state, hidden-only non-oracle behavior, and ACL/audit rollback on audit failure.
- Web: `green-web.txt`, 2 files / 17 tests passed. Covers #89 L2 states and #72 workspace-management regression.
- Server and web TypeScript typechecks passed independently.
- Server and web production builds passed as part of `playwright-final-4.txt`.

## Built-product browser evidence

`browser-matrix/browser-matrix.json` and 14 screenshots were produced by an isolated Playwright-owned persistent Chromium profile and an owned MV3 extension. The checker used a temporary DB/storage root and owned ephemeral server port.

- Exercised managed and all-workspaces settings paths.
- Exercised a real broken-inheritance subtree, uncached preview failure/retry, cancel with zero POST, focus restoration, a real visible-node change causing 409 stale, explicit `갱신된 내용 확인`, pending Escape/dismissal suppression, success refresh, and already-assigned state.
- The runner asserted one persisted direct admin ACL entry and one `acl.grant` audit row.
- 1280×720, 1440×900, and 1920×1080 × light/dark × browser zoom 100/200 produced 12 environments. Every 200% case recorded `chrome.tabs.getZoom(...) === 2`; final reset recorded `1`.
- Forced colors at zoom 100/200 recorded active media state and a visible 2px solid focus outline.
- Playwright synthetic `compositionstart`/`compositionupdate`/`compositionend` asserted that Enter did not select a result, open L2, or issue POST; the Korean query plus caret/selection range remained unchanged. Native candidate-window behavior remains unverified and nonblocking; no native PASS is claimed.

## Regression and SpecKiwi facts

- Current full server run: 1518/1519 passed. The sole failure is the unrelated tracked baseline `install-assembly.test.ts`, which expects `/theme-bootstrap.js` 200 before installation but receives 503; #89 does not touch install/static serving.
- Current full web run: 89 files and 1107/1107 tests passed.
- SpecKiwi summary: 0 stability blockers, 0 missing evidence, no draft/deprecated requirements.
- `speckiwi validate --fail-on-warning` reports the existing `SRS-W072` for `02.feature-request-live-preview.md`; links check additionally reports the existing `IR-AUDIT-004` reference `32`. Neither was introduced or changed by #89.

No native IME claim, durable cross-process exactly-once claim, commit, push, or issue closure is included.

## Independent review fix loop

- `red-review-server.txt` preserves failures for exact-session binding, post-commit replay publication, generic 5xx redaction, and visible identity freshness after the pre-existing unverified replay behavior was removed.
- `red-review-web.txt` preserves failures for A→B→A late mutation isolation, committed-success/read-failure separation with GET-only retry, and the displayed-preview expiry lock.
- `red-review-token-bound.txt` proves the oldest live token remained usable before the 512-entry eviction bound was restored. `red-review-already-assigned.txt` proves a preassigned target produced a second successful grant path before the explicit no-write guard was restored.
- `playwright-review-run-1.txt` preserves the incorrect DPR expectation discovered by the new real-zoom geometry assertion. `playwright-review-run-2.txt` preserves the ambiguous success-focus locator before it was made exact. `playwright-review-refresh-red.txt` preserves the built-product failure where TanStack `refetch()` resolved an error result and the UI therefore hid the committed-success refresh failure.
- Final focused results: server 15/15 and web 10/10. The server matrix covers TTL, forged/unknown/cross-session/workspace/principal/actor tokens, authority and account loss, identity/status/topology/inheritance/direct-assignment changes, already-assigned behavior, two deliveries, exact ACL/audit counts, rollback, commit-wrapper failure, redacted 5xx bodies, bounded token eviction, and exact response keys.
- `playwright-review-final.txt` is the final built-product run. The JSON matrix records pre/post CSS viewport, outer geometry and DPR; calculated foreground/background ratios; 200% `scrollHeight`, `clientHeight`, reached `scrollTop` and `maxScrollTop`; action reachability; true zoom 2 and final reset 1. It also exercises the real committed-success plus failed GET refresh and GET-only retry.
- `full-server-review.txt`: 1514/1515 passed with only the same unrelated tracked `install-assembly.test.ts` pre-install `/theme-bootstrap.js` 503 baseline failure. `full-web-review.txt`: 89 files and 1107 tests passed.
- `generate-final-review-manifest.mjs` regenerates the sorted changed-file identity list and aggregate hash from current tracked and untracked files. The manifest deliberately excludes itself to avoid a self-referential hash.


## Exact session contract update (AC5-AC8)

- `red-exact-session-contract.txt` preserves 16 contract failures after the prohibited whole-Cookie SHA256 and injectable `authContextOf` fallback were removed and before the canonical session adapter was implemented. `red-transaction-account-status.txt` separately preserves the transaction-time account-state RED (received 404 instead of required 401) before restoration of the account gate.
- Preview and execution now select only the decoded `doculight_session`, authenticate it with the existing session service, and bind the bounded server record to `session:v1:` plus the exact `hashSecretToken(token)` SessionRepository lookup key and the authenticated actor ID. Unrelated Cookie members and order do not affect the binding. Actor-only, client-generation, arbitrary-header, and whole-Cookie fallbacks are absent.
- The execution transaction re-reads that exact session lookup key and validates expiry, account status, session user/actor identity, current requester groups/ACL, snapshot topology and direct-assignment state before grant/audit. Tests cover same-account different session/relogin (409 while the still-valid original session succeeds), logout, expiry, `removeAllFor` password-style revocation, transaction-time session removal/account suspension, and zero writes on failure. Responses, errors, and audit rows are asserted not to expose the raw token, lookup hash, or `session:v1:` fingerprint.
- `green-exact-session-contract.txt`: focused server 19/19 passed. Focused web remains 10/10. Server and web typechecks passed. `full-server-exact-session.txt`: 1518/1519 passed with only the established install/static baseline above. `full-web.txt`: 1107/1107 passed.
- `playwright-exact-session-final.txt` and the regenerated `browser-matrix/browser-matrix.json` are the final isolated-product run. The JSON records synthetic composition suppression and preservation explicitly and labels the native candidate window unverified/nonblocking, with no native PASS claim. The existing 12 normal viewport/theme/true-zoom environments, two forced-colors zoom environments, exact zoom 2/reset 1, contrast, scroll and product transition assertions remain passing.
- Final SpecKiwi reads made no SRS mutation: validation retains the existing `SRS-W072`; links remains otherwise successful; summary was read for `phase-1`. Requirement status/evidence was not promoted.
