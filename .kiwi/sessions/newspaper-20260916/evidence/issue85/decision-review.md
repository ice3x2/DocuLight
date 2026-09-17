# Issue #85 Astra decision independent re-review

Reviewed 2026-09-18 against live #85/#69, `IR-ACL-005`, `FR-ACL-005`, `FR-CONFIRM-004/011/012`, `SEC-CONFIRM-003`, the #69/#61 decisions, current inheritance/permission/reach/HTTP/SQLite/client/confirmation contracts, and the revised Astra decision. This review changes no product code, SRS, GitHub state, or Astra decision.

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

## Findings

### CRITICAL — none

### HIGH — none

### MEDIUM — none

### LOW — none

## Accepted correction

The revised decision fully specifies revision integrity: versioned and domain-separated deterministic canonical serialization; `HMAC-SHA-256` with an in-memory cryptographically random 32-byte server key; unpadded full-length base64url digest; strict version/encoding/length rejection; equal-length byte comparison through a cryptographic constant-time primitive; and no plain hash, unsigned snapshot, client-generated digest, downgrade, secret/snapshot logging, or mismatch oracle.

The canonical snapshot binds server-owned actor/auth context, authorization-relevant principal state, target/workspace/parent/ancestor identity, displayed path/name facts, inheritance and serving state, ordered direct/incoming ACL entry identities and projection facts, and ordered hidden identities/topology behind the descendant count. It excludes a frontend generation and timestamp. Restart/rotation behavior is deterministic and safe: atomic replacement, current key only, old revisions become 409 stale, and the user obtains a new preview/L2. Tests now cover altered version/encoding/length/digest, cross-actor use, rotation/restart recovery, canonical ordering, same-count replacement, and leakage; code review verifies constant-time comparison rather than unreliable timing tests.

The rest remains feasible. Existing synchronous SQLite transaction support can contain reauthorization, snapshot recomputation/comparison, inheritance update, and audit append without an `await`, rolling back both writes on failure. Preview completeness/privacy, exactly one L2, typed 204/rejection/unconfirmed outcomes, refresh separation, focus/generation guards, strict red-first order, and seeded built-product Playwright evidence cover the governing requirements and material races.
