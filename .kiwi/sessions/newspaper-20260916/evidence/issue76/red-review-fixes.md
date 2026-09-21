# Issue 76 independent-review fix RED record

Requirements: `IR-SHELL-009` and `FR-EDITOR-005`.

This record preserves the failure observations from the interactive Vitest RED runs made before each review fix. The console output for these runs was not redirected to a file, so the observations below are summaries rather than reconstructed raw logs. The unchanged final test output is retained in `focused-green.txt`.

| Review item | Test added before implementation | Observed RED |
| --- | --- | --- |
| H1 exact authentication attempt | `issue76-auth-boundary.test.ts` | The new old-attempt/new-login case could not compile because `isCurrentAttempt` did not exist; the focused run reported 1 failed test and 16 passing tests. |
| H2 guarded version continuations | `issue76-version-owner.test.tsx` | All three new list/load/restore cases failed because late results still reached UI callbacks after owner or authentication phase changed. |
| H3 one frozen-surface gate | `issue76-frozen-surface.test.tsx` | The mode-change case failed because the frozen document still accepted a mode transition; the handoff assertions also exposed a non-inert protected shell and missing unload protection. |
| M1 synchronous requested-target retry | requested-target cases in `issue76-app-states.test.tsx` | A second click could dispatch another retry before React committed pending state; the button was not synchronously disabled/busy. |
| M2 predictable control flow | `issue76-control-flow.test.ts` | The source contract failed on synthetic rejected promises used for predictable blocked and no-target branches. |
| H4 requested-route replacement | requested-target cases in `issue76-app-states.test.tsx` | Root/newer navigation did not invalidate every older generation. The confirmation case then failed because requested-target loading unmounted the rejected editor and its exact local bytes before the user decided. |
| H5 real App authentication outcomes | parametrized cases in `issue76-app-states.test.tsx` | The behavior cases were authored before the App changes. Early execution also exposed test-selector defects; those selector failures are not treated as product RED evidence. |
| M3 unresolved handoff recovery | logout handoff case in `issue76-app-states.test.tsx` | The open handoff lacked unload protection, and cancel did not yet prove that the guard was removed while the exact editor bytes remained mounted. |

First-cycle corresponding GREEN was 151/151 focused tests; the final expanded result is recorded below. Full regression, typecheck, build, and product-browser results are retained in the sibling `*-latest` evidence files.

## Second independent-review cycle

- `red-review2-malformed-app.txt` is retained only as a superseded audit artifact. Removing that implementation also broke valid initial identity mapping, so the three cases failed during bootstrap before an editor and its bytes were mounted. It is not accepted as evidence for the malformed established-owner transition.
- `red-review2-contracts.txt` is the raw 18-failure contract RED for the retained hidden/inert editor host, exact root no-selection pane, VersionHistory authorization phase/epoch resume, owner-generation-attempt lock, and explicit identity/authentication results.
- `green-review2-focused.txt` records the immediate 88/88 GREEN for the second-cycle files. The expanded final issue set is `focused-green.txt` at 170/170.

## Third independent-review cycle

- `red-review3-malformed-transition.txt` is the authoritative implementation-removal RED. Initial identity remained valid, and all three cases mounted an editor, preserved exact source bytes, and completed exactly one logout/password POST before the assertions failed because the removed malformed transition branch produced same-owner continuation instead of frozen uncertainty. No bootstrap or selector failure is counted.
- `red-review3-established-identity.txt` is the raw H1 RED: established-owner malformed and HTTP 500 responses unmounted the editor, the network path lost its source surface, and a different-owner retry lacked the uncertainty action. The already-correct 401 terminal case passed in that run.
- `green-review3-identity.txt` records the immediate 8/8 GREEN for established-owner uncertainty, same-owner resume, 401 termination, different-owner isolation, and the three corrected malformed transition cells. The expanded final issue set is `focused-green.txt` at 175/175.
