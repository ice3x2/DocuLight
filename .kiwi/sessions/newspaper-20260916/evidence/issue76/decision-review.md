# Issue #76 Astra decision independent final re-review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Prior finding resolution

### M1 resolved — Untyped 401 no longer claims session expiry

The decision no longer treats a previous authenticated session plus 401 as proof of expiration. Initial anonymous 401 shows ordinary login. A later unexplained 401 uses origin-neutral `로그인이 해제되었습니다. 다시 로그인하세요.` and expressly forbids inferred `세션이 만료되었습니다` copy. Password-change wording requires an actually accepted mutation, and logout intent alone cannot claim acceptance.

The local transition context is App-owned, ephemeral, bound to an authentication generation, not persisted, and cleared on failed/cancelled attempts, successful login, or identity replacement. A stale logout intent therefore cannot label another user's or a later generation's 401.

### H1 resolved — Accepted authentication-ending mutations terminate the local generation immediately

The revised precedence now makes a confirmed logout response and confirmed password-change success authoritative terminal events for the current local authentication generation. It requires App to:

- preserve the logout POST outcome instead of swallowing the accepted/rejected distinction;
- immediately mark the old generation ended on accepted logout/password change;
- stop old protected requests and clear privileged cache and secret state;
- render the shell-free login surface without waiting for a follow-up session GET;
- keep the protected shell, settings, documents, and secrets absent when a later GET returns network error, 500, or 401;
- reject a late old-generation 200, so only an actual new successful login can create another authenticated generation.

This fixes the prior security gap in which logout 204 followed by a failed session read could retain stale session data and leave documents visible. Confirmed logout returns ordinary login without an expiry diagnosis. Confirmed password change may show the truthful approved completion context because its response establishes both password acceptance and documented session invalidation.

Failed or unconfirmed mutation paths remain distinct and truthful:

- POST failure/unknown response plus session 200 retains the established shell without success copy.
- POST failure/unknown response plus session 401 ends authentication with origin-neutral wording.
- POST failure/unknown response plus session 500 or transport failure reports session-read uncertainty and offers only the actual read retry; it does not claim logout, password change, or expiry.
- No mutation is automatically replayed.

The permanent test matrix now covers both operations across POST failure followed by session 200/401/500/transport failure and confirmed POST success followed by GET network/500/401. It asserts immediate protected-UI removal before the GET resolves, continued absence for every later outcome, late-200 rejection, request/callback counts, cache and identity isolation, initial anonymous 401, external invalidation, new identity, and stale-intent cleanup.

### B1 remains an honest pre-mutation blocker

The decision does not waive the CodeMirror draft-loss problem to obtain the immediate security transition. For voluntary logout or password change, a secure draft handoff is a prerequisite before sending the invalidating POST whenever a live editor may own unpreserved text. The integration must prove no unpreserved local body exists or complete an explicitly authorized export/discard/isolation handoff first. Cached query bodies and `saved` labels are explicitly insufficient proof.

Until that handoff is separately defined, the affected mutation path remains blocked before POST and cannot be used to claim issue completion. Once a mutation has been accepted, retaining the protected shell for late rescue is forbidden. Involuntary invalidation remains an acknowledged unresolved preservation gap. The evidence plan requires actual current-body bytes and cross-account nonexposure; clean-document auth tests cannot close the blocked branch.

## Regression review

No new Critical, High, Medium, or Low finding was identified:

- State inventory and precedence still distinguish marked install state, generic session read failure, no-access tree, no document selection, unavailable document, initial document loading/error, and valid empty content.
- Deep-link state waits for explicit tree success, including successful empty trees; route generations prevent stale responses and unavailable Back/Forward targets cannot leave unrelated content presented.
- Document read state remains keyed by node ID over existing queries without a second body store, array-index identity, fabricated empty body, destructive refetch, or write replay.
- Missing, deleted, and unauthorized documents remain visibly and accessibly indistinguishable without exposing paths, names, counts, permission causes, or access-request controls.
- Connectivity language remains cause-neutral and does not invent offline detection, server-health knowledge, automatic save replay, or synchronization promises.
- Retry, focus, and live-region requirements remain tied to real operations, guard duplicate activation, avoid nested announcements and background focus theft, and never fall back to `document.body`.
- B2 and B3 remain accurately bounded: mounted-editor denial lacks a safe handoff, and autosave's generic non-409 rejection cannot be relabelled as offline/expired/permission failure.
- The Playwright plan still requires actual product assembly, two-session invalidation and permission changes, long Korean text, forced colors, runtime resize, focus/keyboard/geometry checks, and 1280×720/1440×900/1920×1080 in light/dark at 100% and genuine 200%. Genuine zoom uses isolated persistent Chromium with `chrome.tabs.setZoom(tabId, 2)` and asserted `getZoom === 2`; CSS zoom, transforms, DPR-only emulation, and half-viewport substitutes are excluded.

## Sources and commands inspected

- Revised `.kiwi/sessions/newspaper-20260916/evidence/issue76/astra-decision.md`
- `packages/web/src/App.tsx`: `signOut`, `changeOwnPassword`, session precedence, cache clearing, and query invalidation
- `packages/web/test/auth-wiring.test.tsx`: logout/password-change transitions and protected-screen rationale
- `packages/web/src/api/queries.ts` and `packages/web/src/api/client.ts`
- `docs/spec/09.auth.srs.md`: `SEC-AUTH-019`
- `docs/spec/08.app-shell.srs.md`: `IR-SHELL-009` AC-5
- `docs/spec/07.editor.srs.md`: `FR-EDITOR-005`
- Original issue #76 and the other sources recorded in the initial independent review
- `rg` searches for 204/401/500, logout/password change, authentication generation, stale-response handling, and pre-mutation handoff; `git diff` inspection of issue #76 evidence

This is a pre-implementation decision re-review. No product implementation, Playwright run, or test result is claimed.
