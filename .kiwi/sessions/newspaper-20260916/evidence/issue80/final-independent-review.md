# IR-PRINCIPAL-002 final independent review

Date: 2026-09-22  
Scope: GitHub issue #80, `IR-PRINCIPAL-002`, fix2 plus secret-evidence remediation  
Verdict: **C0 / H0 / M0 / L0**

## Findings

No remaining findings.

## Independent verification

- Worktree recovery integrity: zero deleted tracked files; the implementation diff retains the expected 12 modified tracked files and nine issue-specific package source/test additions. Recovery proof paths were retained.
- Accepted-read lifetime: App derives the principal read generation from accepted roster and signup-mode query `dataUpdateCount` values, binds it to principal/auth ownership, rejects late results after an independently accepted newer roster or mode snapshot, and accepts the action-owned post-write roster refresh through the returned accepted generation.
- Completion ownership: principal, auth, category, query, action, form, and stable account ID guards remain in place. Privileged caches are removed when ownership changes.
- Pending controls: pending state is keyed by `{account ID, action}`. The executing approve, reject, reopen, or undo control alone receives its busy text and `aria-busy`; same-account sibling controls are disabled without borrowing that state.
- Reconciliation: ambiguous registration and row outcomes remain locked through loading/error and clear only after a newer authoritative ready roster.
- Baseline provenance: `baseline-b2b126c-identity-raw.txt` records exact HEAD `b2b126c3ee04602e1ace3e256d2816b32aefc930` and an empty `git status --porcelain=v1`. Raw baseline and current logs reproduce the same token-panel assertion and install-assembly `/theme-bootstrap.js` 503 failure; the baseline web build prerequisite passed.
- Secret evidence: both previously exposed install-token values are absent from decoded UTF-8 and UTF-16LE evidence. The fail-closed scanner covers install tokens, Authorization Bearer values, Cookie and Set-Cookie headers, CSRF headers, and credential query parameters. It scans the 21 hashed source files, staged artifacts/report/raw files, the entire published evidence root, and the manifest. Its four automated tests pass; additional independent CSRF and credential-query probes rejected 5/5 inputs.
- Evidence integrity: manifest SHA-256 is `90c47b2fe8d1fe47720781401e788a491af414f9c97d5685d8dda1079afe4e14`. It records 21 source files, 14 artifacts, one report, and 17 raw records; all recorded hashes match. At inspection time no captured artifact postdated the atomically published manifest.
- Browser evidence: 12 main environments plus two forced-colors environments; ordinary and workspace-manager absence/direct denial checks total 24, with 24 denied requests for each of register, approve, reject, and reopen. No credential value is present in the published evidence.

## Fresh commands

- Focused web verification: 11 files, 172 tests passed.
- Root workspace typecheck: editor, server, and web passed.
- Secret-scanner tests: 4 tests passed.
- Fresh isolated product runner from the preceding fix2 review passed; its source hash and captured product evidence remain unchanged in the final manifest.

No SRS, issue, commit, or product implementation was changed by this independent review.
