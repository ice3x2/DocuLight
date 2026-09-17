# Issue #75 Astra decision independent re-review

Verdict: **PASS — Critical 0 / High 0 / Medium 0 / Low 0**

## Prior finding resolution

### H1 resolved — Queue GET is confined to browser-session authentication

The revised decision binds `GET /api/index-queue` only to the `actorOf` dependency already passed to `workspaceApiRouter`. This matches production assembly: `main.ts` derives that actor from the session cookie through `authenticateSession`, while `mcpRouter` owns the separate Bearer PAT path and does not receive that browser actor.

The contract now explicitly forbids importing or accepting the MCP/PAT actor path. It requires:

- no or invalid session cookie → 401;
- authenticated non-superuser, including a workspace administrator → the existing privileged-read 404 shape with no queue payload;
- current superuser session → snapshot access;
- valid PAT without a session cookie, including a superuser-owned PAT → 401.

The required HTTP matrix includes the valid-PAT/no-cookie case. Implementing the decision no longer broadens PAT authentication into the privileged browser REST surface or invents PAT scope semantics.

### M1 resolved — Prepared source-ready outbox preserves accepted mutation identity

The earlier post-write enqueue gap is replaced with a concrete two-phase durable obligation. The revised ordering is internally consistent with the current filesystem-as-SSOT and synchronous SQLite metadata split:

1. Complete authorization, naming, size, and base-hash preconditions.
2. Before the first source mutation, durably write a `prepared` obligation keyed by stable node ID, unique mutation/generation, and expected resulting fingerprint/hash. It contains no source body or token.
3. For creation, allocate the stable node metadata and prepared obligation in the same SQLite transaction. An outbox insertion failure therefore cannot commit the node/ACL/audit identity or mutate source bytes.
4. Keep prepared work unclaimable. The worker may not read a nonexistent creation file, old bytes, or partial bytes and clear the obligation.
5. After a successful source operation, verify identity/fingerprint and promote the same obligation to runnable pending work. Extraction/indexing remains asynchronous.
6. If promotion fails after source acceptance, retain the durable prepared obligation, return the existing successful `{hash}` or stable `{id, ...}` result, and recover by generation/fingerprint without replaying the source mutation.

This directly preserves the contracts that the prior review found missing:

- A successful save still returns its accepted content hash, so the next autosave uses the new base hash rather than falsely conflicting with its own preceding write.
- A successful create/upload still returns the allocated stable node ID/name; an indexing bookkeeping failure cannot turn it into an ordinary failed response that invites duplicate creation.
- New-version, restore, copy, and overwrite recovery cannot repeat source writes, versions, ACL changes, or audit events.
- A preparation failure occurs before bytes or creation identity change, so the ordinary failure response remains truthful.
- A crash after source write and before promotion recovers the same identity/generation; a crash before source readiness compares actual source state and cannot certify intended bytes as saved.
- Older prepared work cannot suppress or publish over a later mutation, and worker/startup reconciliation never resurrects a missing node or overwrites newer external bytes.

The decision also recognizes current integration reality rather than claiming existing atomicity. Current `/nodes` and upload flows allocate node/ACL/audit metadata before filesystem creation; `saveDocument` writes the file before returning the hash; and new-version handling snapshots before overwrite. The revised design requires implementers to move each applicable metadata/outbox boundary into the required transaction and prove source-ready exclusion for each real path. A path that cannot meet these invariants remains blocked pending an SRS-backed typed partial-acceptance/reconciliation contract; `write source → enqueue → throw 500` is expressly forbidden.

The evidence plan targets the failure windows that matter: outbox preparation failure before mutation, promotion failure after acceptance, pause between ID allocation and source readiness, crash before/after source write, accepted-hash follow-up autosave, stable-ID creation, and absence of duplicate create/overwrite/version/ACL/audit effects. Lost transport responses and general exactly-once creation remain accurately identified as pre-existing separate concerns rather than falsely attributed to the indexing outbox.

## Regression review

No new Critical, High, Medium, or Low issue was found in the unchanged portions of the decision:

- Durable job generations, atomic claim/publication, current-claim-only failure/removal, startup recovery, supersession, and one-worker shutdown semantics remain coherent.
- Successful processed projections remain distinct from pending/failed current source, with no live-source fallback that hides backlog state.
- Final node existence, ancestor servability, deletion, and effective-permission checks prevent stale projection disclosure; names and workspace names come from current metadata.
- Typed PDF extraction continues to distinguish legitimate empty content from read, parse, and index failure without changing legacy callers or publishing partial pages.
- Snapshot counts, ordering, 100-row limit, safe fields, current names, and failure codes remain exact and privacy-preserving.
- The settings panel stays read-only, session/identity scoped, request-generation safe, and separate from reconciliation. It adds no polling, retry-job, cancel, pause, reindex, progress, history, or mutation endpoint.
- The Playwright plan retains the actual settings/worker/API assembly, light/dark and forced-colors checks, 1280×720/1440×900/1920×1080 at 100% and genuine 200%, and isolated persistent Chromium with `chrome.tabs.setZoom(tabId, 2)` plus asserted `getZoom === 2`. CSS zoom, transform, DPR-only emulation, and half viewport substitution remain excluded.

## Sources and commands inspected

- `Get-Content .kiwi/sessions/newspaper-20260916/evidence/issue75/astra-decision.md`
- `git diff -- .kiwi/sessions/newspaper-20260916/evidence/issue75/astra-decision.md .kiwi/sessions/newspaper-20260916/evidence/issue75/decision-review.md`
- `rg` searches for session/PAT/Bearer, actor assembly, outbox/source-ready, accepted hash/stable ID, mutation, retry, and recovery contracts
- `packages/server/src/main.ts` and `packages/server/src/http/routes/workspace-api.ts`
- `packages/server/src/app/node/node-service.ts`
- `packages/server/src/app/document/save-service.ts`
- `packages/server/src/app/document/new-version.ts`
- `docs/spec/14.storage.srs.md`: `FR-STORAGE-002` and `FR-STORAGE-010`
- Original #75 issue and the requirements/dependencies recorded in the prior independent review

This is a pre-implementation decision re-review. No product implementation, test execution, or runtime verification is claimed.
