# Issue #79 final independent implementation review

Reviewer: Codex  
Date: 2026-09-21  
Primary requirement: `IR-SHELL-011`  
Scope: live issue #79, linked requirements, Astra decisions, implementation diff, tests, and evidence

## Verdict

**PASS — Critical 0 / High 0 / Medium 0 / Low 0.**

No findings remain. The review found no vacuous assertions in the issue #79 coverage. No code, SRS requirement, requirement status, acceptance-criteria checkbox, or commit was changed by this review.

## Review coverage

The review read repository `AGENTS.md`, `docs/spec/00.index.md`, live GitHub issue #79, `IR-SHELL-011`, its linked requirements, the Astra decision and post-reconciliation authorization, the complete working-tree diff, RED provenance, product evidence, and evidence manifest.

The final pass rechecked the previously raised C0/H6/M2/L1 areas:

- generation guards for successful and failed preview, write, refresh, and focus outcomes;
- authoritative destination/tree state from `isFetching`, `isError`, and `dataUpdatedAt`;
- accepted-write refresh completion before dialog close and stable-ID focus fallback after tree remount;
- owner/authentication guards around post-write refresh results;
- actual 1440×900 forced-colors screenshot dimensions;
- truthful RED raw output and hash allowlist provenance;
- the `previewRef` L2 mismatch baseline after cancellation;
- real Playwright keyboard input, focus restoration, and last-option reachability;
- ordinary-user identity, multi-file visible-only privacy, and non-vacuous non-admin guidance coverage;
- directory-only destination transport and exact workspace-root move/copy transport.

## Fresh verification

All commands ran in `C:\Work\git\DocuLight2.0-wt-issue79` unless a working directory is stated explicitly.

| Check | Command | Result |
| --- | --- | --- |
| Focused web | From `packages/web`: `npx vitest run test/issue79-relocation-transport.test.ts test/issue79-relocation-integration.test.tsx test/api-client.test.ts test/screen-wiring.test.tsx` | PASS — 4 files, 110 tests |
| Web typecheck | `npm run typecheck --workspace @doculight/web` | PASS |
| Product isolation | `npm run test:browser:relocation79-product --workspace @doculight/web` | PASS |
| Focused server | From `packages/server`: `npx vitest run test/app/acl/move-copy-preview.test.ts test/app/acl/permission-service.test.ts test/http/workspace-api.test.ts` | PASS — 3 files, 150 tests |
| Server typecheck | `npm run typecheck --workspace @doculight/server` | PASS |
| Full web | `npm test --workspace @doculight/web` | Baseline-identical — 92/93 files and 1155/1156 tests passed |

The full-web run's sole failure was `test/token-panel.test.tsx` (`만료된 행은 산 행보다 흐리다`) because happy-dom returned empty computed color strings. The issue #79 diff does not touch that test or TokenPanel implementation. The same single failure is documented in prior baseline evidence, including issue #75 and issue #87. It is therefore an unchanged baseline limitation, not an issue #79 regression and not a passing-full-suite claim.

## Product evidence identity

The isolated product run used a fresh Playwright-owned persistent Chromium context and disposable server data. It authenticated as the explicitly non-superuser `issue79-ordinary`, performed the real App/server copy flow, persisted the visible directory plus one visible child (`copied=2`), and confirmed the hidden broken-inheritance child was absent. It also exercised real keyboard End/Enter/Escape behavior, L2 cancel focus restoration, the last destination option, the 12 light/dark viewport-and-zoom environments, and two forced-colors environments.

The stored manifest is valid JSON, was produced after the evidence files, and all 16 listed file hashes match their current contents.

| Artifact | SHA-256 |
| --- | --- |
| `product-evidence-manifest.json` | `306E45B7FD5B15CE8AE330C3E274B703E7D74F5EAB9F9FCD62DF3CED376C25E2` |
| `product-evidence/browser-observation.json` | `77FFB0B69F7C7B161025FDA52B61C7AF15956D2FA07E7AD83E79B07AF8E9D91B` |
| `product-evidence/persistence.json` | `E75A1E811F0D4C21FB0A7177278226E03B4042241FB3BC990FADAAB4D5E53AFA` |

## Final severity count

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

