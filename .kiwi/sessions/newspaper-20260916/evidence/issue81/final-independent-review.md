# IR-PRINCIPAL-003 final independent review

Date: 2026-09-22  
Scope: GitHub issue #81 and `IR-PRINCIPAL-003`  
Verdict: **C0 / H0 / M0 / L0**

## Findings

No remaining findings.

## Independent verification

- Server projection keeps persisted direct `members` separate from complete active-only `effectiveMembers`. Canonical system IDs determine default, superuser, and ordinary subtype; mode and add capability are explicit, and the browser fails closed for missing, incomplete, or contradictory projection data.
- User-only search retains the two-character minimum, server order, and combined limit 20. The browser applies its defensive `slice(0, 20)` before eligibility filtering, so malformed rows within the cap are removed without topping up from rows 21 and 22. Group, rejected, malformed, stale, and known-member candidates cannot dispatch a membership POST.
- Membership writes use typed 409 outcomes for duplicate, rejected-race, and automatic-default refusal. The real SQLite repository executes two add attempts in one transaction through `ON CONFLICT DO NOTHING RETURNING`: one succeeds, one returns `already-member`, one membership row remains, and exactly one audit record is written. Existing group-only membership, system immutability, and last-active-superuser tests remain green.
- The App-level pending-write guard survives GroupRoster category unmount/remount, limits a same-group duplicate to one network write, and leaves another group independent. Auth, category, query, action, selection, group, and stable ID ownership checks prevent late results or focus from repainting another owner.
- Accepted POST and roster refresh are separate outcomes. A successful write retains its receipt across a 503 refresh, exposes GET-only retry, creates no optimistic member row, and never replays POST automatically. Uncertain transport remains locked until a newer authoritative roster snapshot reconciles it.
- Success and recoverable failure return focus to the labelled group search input only when that picker still owns focus. Role loss removes privileged rows and categories; ordinary users and workspace managers receive 404 for direct roster reads and writes.
- Issue #68 table order, wrapping, system explanations, disabled ordinary deletion, overflow behavior, and Issue #80 user administration regressions remain intact.

## Browser and evidence verification

- Fresh isolated product run passed with a disposable server/database, Playwright-owned persistent Chromium profile, test-only zoom extension, and owned-handle cleanup.
- The same mounted GroupRoster retained its mount ID, query, selected candidate (`aria-selected`), group identity, and focused labelled input through three viewport resizes and independently read zoom `1 -> 2 -> 1`; membership writes stayed `0 -> 0`.
- Fixtures include a long Korean group name, 24 direct members, and 22 matching candidates. Every one of the 12 light/dark, three-viewport, 100%/200% environments proves first and twentieth result reachability, member-tail reachability, long-name containment, final-row reachability, and rightmost-action reachability.
- All 12 environments pass measured normal-text, large-text, control-boundary, focus, and table-border contrast thresholds. Two forced-colors environments retain visible system-color focus outlines.
- The matrix contains 12 regular plus two forced-colors environments and 24 ordinary/manager authorization-denial pairs. Default automatic membership, managed superuser add availability, active-only effective members, accepted-write plus GET-503 persistence, conditional focus, uncertainty reconciliation, and stale category completion are exercised through the real App path.
- Recorded full suites pass: server `1606`, web `1338`. The secret scan passes across `65` files. Every source, run, screenshot, and browser-report hash in the manifest matches current content; the manifest was published last within the captured evidence bundle.

## Fresh commands

- Focused server: 4 files, 166 tests passed.
- Focused web including #68/#80 regressions: 7 files, 80 tests passed.
- Root workspace typecheck: editor, server, and web passed.
- Isolated issue #81 product browser runner passed.

## Evidence digest

| Artifact | SHA-256 |
| --- | --- |
| `green-evidence-manifest.json` | `C01D9EC0854B4828BEDF8DCD1BE8F69697CC838D16A00CE9E751F7B48C78AEE0` |

No SRS, GitHub issue, commit, or product implementation was changed by this independent review.
