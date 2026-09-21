# Issue 76 review 8 failure ledger

This ledger distinguishes failed attempts from the later green evidence. A failed attempt is never presented as a pass.

## Review 6 attempts 1–15

| Attempt | Observed failure | Classification |
| ---: | --- | --- |
| 1 | Exact-count assertion reported `2 !== 1` at the malformed-identity editor cell. | Harness request-window race; background query traffic entered a semantic count. |
| 2 | Exact-count assertion reported `0 !== 1` in the auth outcome matrix. | Harness request-window race; the expected refetch had not been explicitly awaited. |
| 3 | Timed out waiting for the uncertainty retry button. | Auth-cell sequencing nondeterminism. |
| 4 | Timed out waiting for the uncertainty retry button. | Auth-cell sequencing nondeterminism. |
| 5 | Timed out waiting for the Settings trigger. | Fresh-page/bootstrap navigation nondeterminism. |
| 6 | Timed out waiting for the uncertainty retry button. | Auth-cell sequencing nondeterminism. |
| 7 | The malformed-identity boundary was present but the retry-button count was `0 !== 1`. | Auth-cell state-settlement race. |
| 8 | A dialog overlay intercepted the next click until timeout. | Test interaction/overlay cleanup race. |
| 9 | Timed out waiting for the uncertainty boundary. | Auth-cell state-settlement race. |
| 10 | Different-account recovery notice count was `1 !== 0`. | Cross-account transition timing failure; product-safety assertion failed. |
| 11 | Timed out waiting for `[data-local-recovery]`. | Original-owner recovery transition timing failure. |
| 12 | Timed out waiting for `[data-shell="root"]`. | Different-account login/bootstrap timing failure. |
| 13 | Same-owner recovery assertion reported `0 !== 1` while the recovery body was visible. | Locator/state-settlement race around the recovery surface. |
| 14 | Timed out waiting for `[data-local-recovery]`. | Original-owner recovery transition timing failure. |
| 15 | Cross-owner frame monitor recorded the old draft (`1 !== 0`). | Product-safety assertion failed; old draft was observable during the different-account transition. |

`playwright-review6-green.txt` is not final green evidence: despite its filename it exited nonzero. `playwright-review6.txt` is the later successful review-6 capture and is kept as historical evidence only.

## Review 8 independent reruns before final capture

| Run | Observed result | Classification |
| --- | --- | --- |
| 1 | `page.goto` failed with `net::ERR_ABORTED` in `runAuthCookieCell`, invoked by the `logout-unknown-me-500` cell. | Independent Chromium navigation nondeterminism; no product assertion ran. |
| 2 | Confirmed-204 `logout-confirmed204-session200` observed identity count `1 !== 0`. | Validated the review finding: the earlier count window did not explicitly own/await the post-terminal refetch. The harness was corrected to await that exact refetch and retain strict equality. |
| 3 | Timed out waiting for the forced-matrix application-error alert at checker line 927. | Independent route/navigation nondeterminism after the auth matrix; separate from the confirmed-cell count fix. |

Final review-7 artifacts are published only after focused/full/typecheck/build, product isolation, product 12+6, SpecKiwi checks, and source-identity checks all pass. The manifest is written last and is the authority for the final green artifact set.
