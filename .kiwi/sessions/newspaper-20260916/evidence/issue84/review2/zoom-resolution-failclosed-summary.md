# Issue #84 resolution convergence fail-closed fix

Requirement: `IR-PRINCIPAL-005`.

## TDD chronology

1. RED — `2026-09-21T18:14:02.2500706Z`
   - Raw: `zoom-resolution-red-raw.txt`
   - SHA-256: `1494ed3344b4168265759d6f9f39814917929d2121097d74e6df8ebdf57e5c5b`
   - Missing and `null` `resolutionMatches` samples both resolved successfully; explicit `false` already failed closed.
   - Frozen sources: `zoom-resolution-red-source-hashes.json`.
2. GREEN — `2026-09-21T18:14:38.2085145Z`
   - Raw: `zoom-resolution-green-raw.txt`
   - SHA-256: `3d9fdb6da0ae93f3f3eef8ccb8e9902df9b74f798918859d131f09ccfaecd9cf`
   - Five convergence tests passed. Settled fixtures explicitly carry `resolutionMatches: true`; missing, `null`, and `false` all time out.
3. Objective product rerun — `2026-09-21T18:15:10.2664363Z`
   - Raw: `zoom-resolution-product-final-raw.txt`
   - SHA-256: `c4f9d0eef8f624c4a635965a2cab007f322c52088bb72f9163338d22ec2673fd`
   - Three complete 12+2 matrices passed: 36 normal and 6 forced-colors captures.

## Final source hashes

- Convergence test: `aa05976d0ddcf4fbf892273f4fcbbf9fda1961c2bfe6196165358691d939f0a6`
- Convergence helper: `129535e711b984fb7ef2eb1ef307dd6ae0808ef9aa7da31a126237b21e43e601`
- Product probe: `29f82230b93fc81f93733d612d1aa156a99cd5def2965f9d413074d8acd0c61a`

The product probe normalizes the media-query result to a boolean on every sample. The manifest contains 42 observations; every convergence record has `resolutionMatches: true`. Its 42-image artifact set is exact, all source hashes are current, no secret patterns were found, and the manifest is newer than every image.
