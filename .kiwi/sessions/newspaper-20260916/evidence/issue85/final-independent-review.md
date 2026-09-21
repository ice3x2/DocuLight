# GitHub #85 final independent review

Reviewed: 2026-09-22  
Requirement: `IR-ACL-005` — 상속 복원 영향 미리보기  
Related preservation scope: GitHub #83 and #84

## Verdict

**PASS — CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0.**

The reviewed implementation satisfies the live GitHub #85 contract, `IR-ACL-005`, its related confirmation and ACL requirements, and the accepted Astra decision. I found no remaining correctness, security, privacy, transactionality, race, outcome-reporting, accessibility, focus-management, or product-evidence defect.

## Reviewed state

- Worktree: `C:\Work\git\DocuLight2.0-wt-issue85`
- Branch: `kiwi/orch/newspaper-20260916/issue85`
- HEAD: `48e5beeab00e97976346076a1e598f0a2a5855bf`
- Tracked binary diff SHA-256: `2a1e489b8a1b4ac06c5d47ad67aa02bd584e983208df884469b42f6128d8efc8`
- Reviewed changed-path count before adding this review: 43 (8 tracked modifications and 35 untracked implementation, test, and evidence files)
- Deterministic reviewed working-state SHA-256: `0f128faafb0c97e6e1ed8b37016ed04970ea6bd8449e8911fa487f7ea2a5ecc6`

The working-state digest is SHA-256 over UTF-8 lines sorted ordinally as `git-status-code<TAB>path<TAB>file-sha256<LF>` for every path returned by `git status --porcelain=v1 --untracked-files=all`. It intentionally excludes this review file, which did not exist in the reviewed product state.

The tracked diff at that state contained 224 insertions and 17 deletions across eight tracked files. The review also included the untracked restore service, server and web tests, product runner/checker, RED logs, and browser matrix.

## Contracts and implementation reviewed

- `AGENTS.md`, `docs/spec/00.index.md`, live GitHub #85, and `IR-ACL-005` in `docs/spec/10.access-control.srs.md`.
- Related `FR-ACL-005`, `FR-CONFIRM-004`, `FR-CONFIRM-011`, `FR-CONFIRM-012`, and `SEC-CONFIRM-003` contracts.
- `.kiwi/sessions/newspaper-20260916/evidence/issue85/astra-decision.md` and `decision-review.md`.
- Server preview projection, HMAC revision format, canonical snapshot coverage, authorization/privacy gates, stale detection, transaction boundary, mutation/audit rollback, and HTTP outcome mapping.
- Web API outcomes, L2 confirmation, fresh re-read, cancellation, duplicate-submit prevention, uncertain transport handling, refresh separation, authentication-generation ownership, result announcements, and focus fallback.
- Product browser runner, isolated server/database/docs root and Chromium profile, genuine browser zoom, forced-colors coverage, computed styles, geometry, contrast, focus, role boundaries, server state, direct ACL preservation, and restore audit evidence.

## Review findings and fixes verified

During independent review I identified and then re-reviewed fixes for:

1. Rebuilding the current actor and authorization inside the same SQLite transaction as the final snapshot comparison, inheritance mutation, and audit append.
2. Rejecting non-canonical base64url encodings whose unused pad bits decode to the expected digest.
3. Dropping fulfilled and rejected asynchronous results from an earlier authentication generation.
4. Binding visible preview content to its synchronous render generation so an old account's ACL context cannot render after an account/role change.
5. Preserving a focusable section heading when the restored row was the last row.
6. Adding product assertions and manifest evidence for computed styles, geometry, contrast, and the removed-row focus fallback.

All six corrections are present in the reviewed state, and their focused regression tests pass.

## Independent command results

Commands rerun by the independent reviewer:

```text
npm test --workspace @doculight/server -- --run test/http/issue85-inheritance-restore.test.ts test/http/issue84-revocation-bypass.test.ts test/http/acl-admin-routes.test.ts
=> 3 files passed; 50 tests passed

npm test --workspace @doculight/web -- --run test/issue85-inheritance-restore.test.tsx test/issue83-managed-workspaces.test.tsx test/issue84-revocation-bypass.test.tsx
=> 3 files passed; 26 tests passed

npm run typecheck --workspace @doculight/server
=> PASS

npm run typecheck --workspace @doculight/web
=> PASS
```

Latest full-suite evidence in the reviewed state:

- Server: 146 files, 1,615 tests passed. Raw SHA-256: `fc4b4cb76a74ed991341dd61f094c1c5d8ddaf578fee3c962caaf47925820d85`.
- Web: 115 files, 1,364 tests passed. Raw SHA-256: `a4e92e6d6090b515aab60ba23c06dcc98c9e29ab96ccb59b5b1913c690eee163`.

The focused #83 and #84 tests passed alongside #85, and the reviewed diff preserves their managed-workspace scope and server-owned superuser-bypass metadata behavior.

## RED and product evidence audit

- Audited eight `*-raw.txt` / `*-sha256.txt` RED pairs. Every raw file's computed SHA-256 matched its sidecar.
- Audited `browser-matrix/capture-manifest.json`: 14 observations and 14 PNG files; every PNG SHA-256 matched the manifest.
- Browser manifest SHA-256: `a3f0e7c52f5bc34a8eff69b7caeeca0baf9d63a0e78d2253f54814de878658f2`.
- The matrix covers 1280×720, 1440×900, and 1920×1080; light/dark; 100%/200% genuine `chrome.tabs.setZoom` values; and forced colors at 100%/200%.
- Normal-color observations record passing text, action-boundary, and focus-boundary contrast. Forced-color observations retain a visible focus outline.
- The latest actual-product Playwright log ends in PASS and has SHA-256 `6dca6fb843506386f55686094efe9339ce2e8421308755297b92eeba43ef629c`.
- The product flow verifies unauthenticated 401, ordinary-user neutral 404/no privileged UI, superuser preview and L2 flow, missing-revision 428, stale-impact blocking without POST, successful restore, direct ACL retention, exactly one restore audit event, cancel focus restoration, and last-row focus fallback to the section heading.
- The browser artifact set contains no tested account-name or password secret matches.

## Final assessment

`IR-ACL-005` is correctly implemented for the reviewed state. The server binds consent to a complete, actor/session-specific snapshot and revalidates it transactionally at mutation time. The UI exposes exactly one L2 confirmation, distinguishes rejection from uncertain transport and refresh failure, prevents stale or cross-context execution, and preserves accessible focus behavior. Product evidence is internally consistent and hash-verifiable. GitHub #83 and #84 behavior remains green.
