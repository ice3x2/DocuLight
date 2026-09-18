# Issue #75 implementation evidence

Requirement: `FR-STORAGE-010` (stable/planned), with `FR-SHELL-013`, `SEC-WORKSPACE-004`, `IR-SHELL-002`, and `IR-SHELL-008` regression boundaries.

## Product result

- Added a durable SQLite text-index outbox and processed projection, keyed by stable node ID and monotonic generation. Prepared obligations cannot be claimed; successful source writes promote the matching fingerprint to pending. Publication and matching-job removal share one transaction.
- Added one production worker with startup interrupted/failed recovery, prepared-obligation fingerprint reconciliation, missing/stale backfill, and a final node/servable-chain/type/source-fingerprint check before publication. A stale claim never publishes or fails the current generation; the current source remains pending.
- Wired save, new-version/version restore, create/upload/copy, rename/type change, trash/restore/purge, and external file-change paths. The common eligibility rule is Markdown/PDF only. Existing-source creation and lifecycle restoration reconcile from actual source bytes; retiring or deleting a source removes both its obligation and projection.
- Copy reads and fingerprints source bytes before the first target mutation, then creates target metadata and its prepared obligation in one SQLite transaction. Trash restore fingerprints every eligible file from the trash source and atomically prepares the subtree before relocation. Prepare failure aborts metadata mutation; filesystem or promotion failure leaves a durable prepared obligation for recovery.
- Immediately before publication, claim-aware reconciliation compares the full node ID, generation, `running` state, and claim ID tuple in one transaction. A matching B claim is removed when the source returns to published A; a different current C becomes a new pending generation. If a newer C/D generation arrived after the worker read the source, the stale B reconcile changes nothing.
- Search body/tag/PDF axes read processed projections only when the production index is present. Names and attachments remain current metadata. Results receive a final current servability and permission pass immediately before return.
- Added session-only superuser `GET /api/index-queue`. It returns current servable names, exact eligible counts, deterministic first 100 rows, and no body/path/token/claim fields. Non-superusers receive 404 and missing sessions receive 401.
- Added the read-only newspaper settings panel with auth identity/superuser context invalidation, stale-response rejection, in-flight deduplication, loading/error/empty/failed-job/100-row states, retry focus restoration, independent horizontal table scrolling, and no queue mutation controls.

## TDD RED preservation

Every behavior change began with a failing automated test. The preserved artifacts include initial repository/worker/API/UI/wiring/CSS failures and later prepared recovery, index persistence classification, final permission, ancestor servability, external file-change, auth-context/focus, final worker eligibility, save eligibility, and lifecycle hook failures.
- `red-api-ancestor-filter.txt`: `047cd7eb74a3445a6c5a8b4141b0ebf42f05e3e1c095f239262ea90800105e2c`
- `red-api-snapshot.txt`: `3a35f603dfdc9f04618b5322ef7998c1b5372ba8bab523f12f45c9f78ce23a0d`
- `red-backfill.txt`: `bf2cd98285d340366a8f7aafa1c6329388f38b04758b3bb4df3936e5b0f7823c`
- `red-create-hook.txt`: `0269e627138a816c3f2623ae2fc2efa8817afdf5e6db7cf43be249704d630d31`
- `red-css.txt`: `3b67283256ba18f9d53464f2d128fde13c9cf9dda3a7158c95ece211c43dc549`
- `red-external-change.txt`: `0e67c5889f81a570da778c954f0c20555e70707e39cfb5f581ed3502b789ca55`
- `red-final-permission.txt`: `f22ff3f8fdfb771e2786f6daa6e143a3903c5032f7815e752918af83ca3ef7da`
- `red-new-version.txt`: `9a30deb87ee05ec2f08585463b6217a9932acd073920ed63ba114c3063895e3e`
- `red-pdf.txt`: `c0b6be0dd8377d550bf65259e6493184bcf3d466f635ccbcf8477501bb5a4daf`
- `red-recovery-index-failure.txt`: `f232e47418d35ae087a9080c83feffd182b068230724fb4a69db06c04c163fc0`
- `red-server.txt`: `4dde20b6ca7f7a88a983d5047fe868b57b04887185f8dcfbe0b1e5a75650ef17`
- `red-web.txt`: `6aa0a36f4682d952342d85c48841c1eb4491891a5ad91acd2de8608e12b81524`
- `red-wiring.txt`: `5c238eb212e46c7faa9373831f615d2026daa00af1160eefcc63b588bab532ac`
- `red-worker.txt`: `b795747bdb384a9f4a2cdd5fcc260bce7522e713cb8618c7473475cc695844ae`
- `red-worker-loop.txt`: `e4e24bd3fa34ef48896c3432538623aef6e50a43d03d7928ccb4621b9a92ddbc`
- `red-review-auth-focus.txt`: `e12a9ea07de88175f04b106c245d379a97fab07cfa7e52d1113248f95bd17b72`
- `red-review-worker-eligibility.txt`: `4ba5ac147ade209ca999edbd83a548e32484359c63beeb55f641aaa6ab58e89d`
- `red-review-save-eligibility.txt`: `4332b913499a6f51a2a539b05ca159744dbd725dc82341f992e5bf9ae67c99b9`
- `red-review-lifecycle-hooks.txt`: `bdb20696d32506bf0125eb5f6820c5ae88a4e738b4dab58b77d076c69da712d1`
- `red-gate-copy-restore-claim.txt`: `a2db11ca6244c33017ad115f54d61e560d36503dfa6972bdbd97b8e99ed0829f`
- `red-gate-restore-crash.txt`: `132672a510d0b8ade13239f4e99e5173e6f9eef413a057595556da4c5f9a4830`
- `red-gate-claim-aware-worker.txt`: `335f0a651a33c6110986e757640c70f0c56b457a29efc8c902397f4201d55805`
## Verification

- Gate-focused server: 222/222 passed (`green-gate-claim-aware-focused.txt`), including worker-level A→B→A cleanup, B→C replacement, and concurrent D preservation. Web focused remains 7/7 passed. Server typecheck and build passed.
- Product Playwright and production builds passed (`playwright-review-final.txt`): 12 normal combinations at exact 1280×720, 1440×900, and 1920×1080 × light/dark × true browser zoom 100/200, plus six forced-colors viewport/zoom combinations. The isolated temporary extension asserted zoom 2 and final reset 1.
- The product checker used its own persistent Chromium/profile and exercised actual production session/API/settings wiring, non-superuser hiding/404, loading/disabled refresh, empty state, explicit refresh, query failure/retry, delayed-response identity loss, a visible long Korean row, and an actual production worker transition from pending to running to removal. It measured focus, keyboard operation, each of menu/body/table scrolling while the other two stayed fixed, overflow, and computed contrast. Measurements and screenshots are under `browser-matrix/`.
- Full server: 1499/1500 passed; only the unchanged install allowlist `/theme-bootstrap.js` 503 baseline failure remained. Full web remains 1096/1097 with only the unchanged token-panel happy-dom computed-style failure. Editor remains at the previously recorded 260 passed, 1 skipped, with the unchanged architecture oracle finding.
- SpecKiwi validation has zero errors and the existing `SRS-W072`; links retain the existing `IR-AUDIT-004 -> 32` warning; phase-1 has no stability blockers or warnings.

## Evidence boundaries

The browser automation validates Chromium composition-independent settings behavior; this panel adds no text field, so native IME is not claimed. The full-suite baseline failures are reported as failures rather than relabeled as passes. No commit, push, issue close, existing browser/CDP session, OS automation, or process-name bulk termination was used.
