# Issue #87 Astra decision — independent review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Authority and requirement fit

The decision is valid supporting implementation guidance for planned/stable `FR-CONFIRM-024`; it keeps `docs/spec/` as the acceptance authority and makes no implementation, test, verification, or closure claim. The session state records the user's delegation of design decisions to Astra. The decision implements all five acceptance criteria without changing the policy domain: authoritative individual/coordinated counts, a new count for every confirmation opening, zero-to-L2 and positive-to-L3 mapping, stale-consent rejection before save, and no destructive gate for expansions or finite-to-unlimited changes.

The additional receipt and transaction contract is necessary implementation detail for AC-4 rather than an unauthorized general settings-revision feature. It is operation-specific, binds the exact complete patch and retention baseline, and explicitly avoids an ETag/CAS system, immediate cleanup, new retention limits, integer-only validation, or a sixth setting. It preserves `FR-CONFIRM-007/004/008`, `DR-SHELL-001`, `REL-AUDIT-003`, `FR-STORAGE-007`, and per-changed-field `OBS-AUDIT-006` audit ownership.

## Counting semantics and privacy

The three count domains match the destructive effects of the current cleanup code:

- trash expiration starts from `trash_entry`, and `node.remove(root)` cascades through the subtree, so distinct node IDs including roots and descendants are the truthful unit; unioning overlapping roots prevents double counting;
- audit retention deletes stored `audit_log` rows before the exact UTC-second cutoff, so stored row IDs rather than grouped display rows are the correct unit;
- `SqliteFindingRetention.purgeReferencing` deletes each finding whose references include at least one expired audit row, so distinct finding IDs are a separate affected-object unit.

The namespaced sum `|T| + |A| + |F|` resolves the coordinated-shortening ambiguity recorded by #71 without conflating equal IDs from different tables. Counting all currently eligible objects under the proposed shortened domain, including objects already overdue under the old policy, avoids presenting a false zero merely because a scheduled sweep is late. The decision also preserves the existing boundary distinction: trash uses millisecond `<=`, while audit/finding selection uses the stored UTC-second string and `<`.

The response exposes only typed totals, grade, token, time, and an opaque receipt. Identity membership and decision facts remain inside a keyed digest; names, IDs, audit content, finding content, credentials, and the MAC key do not cross the HTTP boundary or enter shared browser evidence. Superuser-only access, no-store handling, safe structured errors, and explicit redaction of receipts in evidence are sufficient for the current settings surface.

## Freshness, atomicity, and race behavior

The design closes the material check/use gap. Preview takes one read snapshot and final PUT repeats current authentication/privilege, baseline validation, shortening classification, identity/fact membership, receipt/token validation, all setting writes, and all per-field audit appends within one synchronous metadata transaction. The runtime already exposes the same `better-sqlite3` transaction across settings, nodes, trash, audit, findings, principals, sessions, and audit writes. No filesystem, network, Promise, or destructive sweep is placed inside that transaction.

The required handling of another database connection is fail-closed: an intervening commit or snapshot-upgrade/contention error rolls back the attempt and cannot retry only the write under old consent. The receipt binds identities and relevant facts, so equal totals with replaced members, changed references/subtrees, a crossed cutoff, a changed baseline, another actor, or another patch are stale. Unrelated young audit rows and unrelated settings do not cause blanket invalidation. A supplied receipt is rejected after the operation has become non-shortening, preventing replay from being silently accepted as an ordinary safe patch.

The session/role rule is also implementable with the present dependencies. `WorkspaceApiDeps` has sessions, principals, clock, and the original request; commit-time re-authentication can re-read session existence/expiry, account status, and superuser membership inside the transaction rather than trusting the actor captured before preview. The decision explicitly requires current privilege to win and includes unauthorized-at-save tests, so an implementation that rechecks only the stale actor ID would fail this reviewed contract.

Existing cleanup can still run asynchronously and touch filesystem data outside the settings transaction. The decision states the correct limit: commit-time metadata facts are authoritative for consent, while an already-authorized old-policy cleanup or later aging is not a frozen future deletion list. It does not misrepresent a transport failure as rollback, a 204 as physical cleanup, or a receipt as an idempotency key.

## Client, confirmation, accessibility, and evidence contract

The client progression preserves #71's baseline/draft, uncertain-write, and accepted-write/readback semantics. Every opening obtains a new preview; obsolete results are gated by authenticated owner, mount, request generation, and immutable submitted draft generation. No preview failure or guessed zero can enable PUT. Changed facts lock execution even when the displayed total is unchanged, clear prior typing, and require an explicit new review rather than automatic resubmission.

The L2/L3 presentation is exact: zero has no typing input, a positive unformatted decimal total is the token, both proposed retention values and the applicable three-part breakdown are shown, and the delayed-cleanup explanation remains truthful. Safe initial focus, topmost-only Escape, outside-click non-confirmation, focus restoration, live change/error notices, labelled token input, duplicate-submit latching, and IME composition protection conform to the existing `ConfirmGate`/Radix layer contract. The required narrow `ConfirmGate` adaptation does not change other consumers implicitly.

The TDD and closure plan is sufficient and properly separates evidence levels. It requires red-first tests for `FR-CONFIRM-024` AC-1–5, real database/HTTP authorization and rollback tests, same-total membership races, real AppShell integration, and a built-product Playwright flow with a second authenticated actor and actual GET/preview/PUT traffic. The 12 light/dark/resolution/zoom environments plus forced-colors, independently asserted browser zoom, keyboard/focus/IME coverage, raw red/green evidence, and independent final review prevent fixture-only or class-only closure.

## Sources inspected

- Live GitHub issues #87, #88, #71, and #61
- `AGENTS.md`, `.kiwi/sessions/newspaper-20260916/state.json`, and `docs/spec/00.index.md`
- `FR-CONFIRM-024`, `FR-CONFIRM-007/004/008`, `IR-SHELL-013/008`, and the cited storage/audit/settings/auth requirements
- Prior #61 and #71 Astra decisions and independent decision reviews
- Current `InstanceSettings`, settings API client, `ConfirmGate`, `SettingsModal`, and `TokenPanel`
- Current `/api/settings` routes, settings service/audit code, SQLite transaction adapter, trash/node repositories and sweep, audit/finding retention adapters, retention predicates, runtime assembly, and relevant tests
- `.kiwi/sessions/newspaper-20260916/evidence/issue87/astra-decision.md`

This is a pre-implementation decision review. No product implementation, automated test, browser run, SRS status change, commit, GitHub mutation, or issue closure was performed or claimed.
