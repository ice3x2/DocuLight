# Issue 76 — non-normative decision rationale and review handoff

Astra, 2026-09-18. **This file is non-normative.** It records reasoning and the location of the actual contract. It adds no behavior, evidence gate or exception. The sole contract is `docs/spec/08.app-shell.srs.md` **IR-SHELL-009 AC-5, AC-7–14 and its Implementation Notes**, together with `docs/spec/07.editor.srs.md` **FR-EDITOR-005**. If this memo differs from those blocks, the SRS governs.

No product code/test edit, runtime test pass, independent-review pass, commit or issue closure is claimed by this authoring pass.

## Review context and source facts

The working tree is `C:\Work\git\DocuLight2.0-wt-issue76`. SpecKiwi confirmed `per-call-workspace-root`, mode `sdd`, Active Target `phase-1`, and no stability blockers. Repository AGENTS/index, the original #76, IR-SHELL-009/006, FR-EDITOR-005, FR-SHELL-006/012 and the original reviewed decision were reread.

The parent supplied Sol's initial contract findings C0/H3/M2/L0 and subsequent re-review C0/H0/M1/L0. The final M1 concerned missing malformed200 identity evidence. The earlier `decision-review.md` concerns an earlier version and is not a pass for this amended contract. This memo reports authored repairs pending independent re-review.

Observed server facts are in `packages/server/src/http/routes/auth.ts`: logout sends204 including when no authenticated cookie is found; password change sends401 for an absent session,400 for invalid input/rejected service result, and204 after accepted change. `packages/web/src/api/client.ts` exposes session counts/role flags separately from `/auth/me` user identity. These facts motivated endpoint-specific outcome domains rather than a generic “failed auth POST” branch.

## Disposition of the five findings

| Finding | Repair location in authoritative SRS | Rationale |
| --- | --- | --- |
| H1 — external memo was functioning as a second SSOT | IR-SHELL-009 Implementation Notes, **#76 normative implementation and verification contract**, including identity/body ownership, B1-A/B1-B/B1-C, B2, navigation, retry and required evidence | The state tables, quarantine lifetime, routing restoration and completion conditions now live inside the requirement block. The prior instruction to follow this memo was removed. This file retains reasons and navigation aids only. |
| H2 — identity/auth401 collapsed into general failure | IR-SHELL-009 AC-9/10 and its endpoint-domain list / B1-B state table | Current session401, /auth/me401 and password POST401 terminate the old owner and trigger quarantine without success claims. /auth/me500/network/malformed identity remain uncertainty/read-retry cases. Password400 is confirmed rejection; transport/500/malformed POST results are unknown. |
| H3 — replaceState on popstate cancellation damaged traversal history | IR-SHELL-009 AC-12 and **Back/Forward and requested-target ownership** rules | Separate accepted and observed entry key/index plus epoch permit compensation via history.go(delta). A keyed restoration token distinguishes the expected compensation event from a real newer traversal. The original A/B entries survive cancellation in both directions. Initial metadata annotation is distinct from URL rewriting during cancel. |
| M1 — endpoint-specific evidence and malformed200 identity follow-up | IR-SHELL-009 AC-14 and **Required RED → GREEN and closure evidence** rows | Logout is tested as204 success or unknown. Password change is tested as204 success,400 rejection,401 ended or unknown. The follow-up adds malformed200 identity to logout unknown, password400 and password unknown, each with RED/closure observations of retained editor/current bytes, uncertainty, blocked writes and GET-only retry without POST replay. |
| M2 — FR-EDITOR-005 AC-2 also appeared to authorize preauth download | FR-EDITOR-005 AC-2 and Implementation Notes | Local download under this AC is limited to save refusal while the same authenticated session remains. Authentication-ended recovery/export permissions and lifetime belong only to IR-SHELL-009. AC-2 was unchecked after wording changed. |

## Architectural reasoning

The newest draft resides in the editor, source textarea or mutable merge-right surface, while a query response may be older. A boundary snapshot therefore has to come from the live surface before teardown. Authentication success and the following read are different facts: an accepted invalidation cannot be undone by a late cached200, while an unsuccessful request does not justify erasing a live editor.

Authentication quarantine and same-session permission recovery are different ownership situations. The former protects an old account's locally held text until that account is actually reauthenticated; the latter rescues local edits for a user who remains authenticated while removing unavailable server content. Neither is a durable draft service or a server-write recovery protocol.

Browser traversal also has two facts: the entry currently observed by the browser and the last navigation accepted by the app. Rewriting the observed entry to simulate cancellation erased a real history destination. Returning to the recorded accepted entry preserves both destinations and gives the verifier a concrete A/B round-trip oracle.

## Candidate implementation seams

This is a code-navigation aid, not additional implementation scope. Behavior and acceptance remain entirely in the SRS.

| Existing seam | Relevant responsibility |
| --- | --- |
| App.tsx | Auth outcomes/generations, current session/me check, capture-before-unmount and accepted/observed route entries |
| DocumentSurface.tsx / MergeView.tsx | Actual current text readers and local recovery ownership |
| useAutosave.ts | Paused/ended owner checks before and after asynchronous work |
| DocumentArea.tsx / AppShell.tsx | Requested-target state, retained unrelated editors, removal of unavailable server content and auth preflight UI |
| PasswordChangeForm.tsx / PreAuthScreen.tsx | Response-specific feedback, sensitive input cleanup and same-owner recovery entry |
| api/queries.ts / api/client.ts | Current request identity and stale-result isolation without changing server APIs |
| Existing #76 test/Playwright harness | State-table observations, actual download bytes, two sessions and settled zoom/geometry |

## Status and objective checks

IR-SHELL-009 and FR-EDITOR-005 remain in_progress/stable. IR-SHELL-009 AC-5 and AC-7–14, and FR-EDITOR-005 AC-1/2, remain unchecked. Historical evidence does not imply the amended branches passed. No unrelated requirement was promoted.

The current authoring check output is `astra-contract-checks.json` alongside this memo. It records validate/summary/links; `git diff --check` is also executed for delivery. The known SRS-W072 numbering warning and IR-AUDIT-004's GitHub issue value `32` are reported rather than silently treated as success. Independent Sol re-review decides whether the five findings are resolved; this memo does not assign itself a zero-finding verdict.
