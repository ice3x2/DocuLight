# Issue 71 TDD chronology

## RED

- Baseline product HEAD: `75f0ada23331608f512f340707a58670b24fe4d5`
- Test file: `packages/web/test/issue71-instance-settings.test.tsx`
- Final test SHA-256: `469E519E3039E98630625B7B0838F602577E678B744DBDFD387A0A98940681BC`
- Command: `npm run test --workspace @doculight/web -- --run test/issue71-instance-settings.test.tsx`
- Exit code: `1`
- Strict replay timestamp (UTC): `2026-09-17T21:40:34.1163791Z`.
- Result: `26 tests | 25 failed | 1 passed`.
- Product diff check immediately before RED: zero changed product files across `InstanceSettings.tsx`, `shell-contract.ts`, and `shell.css`.
- Raw output: `red-head-raw.txt`; run metadata: `red-head-metadata.txt`.
- Representative failures: no signup combobox or numeric spinbuttons; no load retry alert; no validation; no reset/dirty state; no retention-reduction block; no accepted-write/readback distinction; no uncertain-save reconciliation.

The one passing test was the negative composition assertion: the old form did not submit on the synthetic keydown alone. It does not cover the required form state or save behavior. The strict replay used the same final test SHA later recorded by GREEN.

## Edge-case RED

- Added a focused regression for edits made after a transport-uncertain PUT.
- Command: `npm run test --workspace @doculight/web -- --run test/issue71-instance-settings.test.tsx`
- Exit code: `1`
- Result: `9 tests | 1 failed | 8 passed`
- Failure: clicking Save after editing could attempt a second save without first reconciling the uncertain result.

## GREEN

- The form now reconciles an unresolved PUT with a GET before permitting another save, including after further edits.
- Focused result: `9 tests | 9 passed`.
- Full web result before the focused edge fix: `82 files | 1004 tests passed`; the focused suite covers the subsequent two-line reconciliation guard.
- Relevant server result: `8 files | 216 tests passed`.
- Root `typecheck` and `build`: passed.
- Actual-product Playwright: AppShell plus settings GET/PUT/readback passed across 3 viewports, light/dark, 100%/200% zoom, and forced-colors 100%/200%.

## Independent-review RED and GREEN

- Independent review identified untested save edges before their implementation: invalid/unknown retention baselines, coupled-key preflight changes, HTTP rejection versus transport uncertainty, and reconciliation with newer local or unrelated remote edits.
- Expanded focused command result before the fixes: `20 tests | 13 failed | 7 passed`.
- A separate accepted-write/readback retry test then failed `1 of 22` before its draft-merge fix.
- Later review REDs covered stale accepted-readback reset, truthful status with newer edits, unknown signup values, shared retention error descriptions, and blur focus stealing. Each failed before its corresponding product fix.
- Parent-review RED added a stale-baseline case (opened at 30, authoritative remote 10, local 20) and deferred phase assertions. Before the fixes, `2 of 26` failed: the stale apparent reduction was blocked too early and the PUT/readback phases lacked truthful visible status.
- The semantic reduction decision now runs only after authoritative preflight. A true reduction against that fresh baseline remains blocked; the stale apparent reduction first surfaces the conflict, then a deliberate second save performs GET, one PUT, and readback.
- Deferred tests observe preflight, PUT, and accepted-readback wording in sequence.
- Final focused result: `26 tests | 26 passed`; with settings-panel: `38 tests | 38 passed`.
- Current GREEN timestamp (UTC): `2026-09-17T21:41:04.5373414Z`; matching test SHA: `469E519E3039E98630625B7B0838F602577E678B744DBDFD387A0A98940681BC`; raw output and product hashes are in `green-current-raw.txt` and `green-current-metadata.txt`.
- Final full web result: `82 files | 1022 tests passed`.
- Final actual-product Playwright result: PASS for real AppShell/settings API, pending lock, transport-uncertain reconciliation, load-error retry, role-loss stop, 12 genuine-zoom environments, and forced-colors invalid-state assertions.
