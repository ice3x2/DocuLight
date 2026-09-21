# Issue 88 RED evidence

- Requirement: `IR-SHELL-013`
- Baseline implementation revision: `4f1ae41`
- Test: `packages/web/test/issue88-settings-leave-guard.test.tsx`
- Command: `npm test --workspace @doculight/web -- --run test/issue88-settings-leave-guard.test.tsx`
- Meaningful RED: exit 1, 4 failed / 2 passed. Category departure, header close, Escape, and first-intent mediation could not find the required `저장하지 않은 변경` alert dialog.
- Follow-up race RED after the first implementation: exit 1, 2 failed / 5 passed. A dirty-count update while the prompt was open invalidated the pending registration epoch, and the original category intent did not execute. The other failure was a happy-dom synthetic outside-pointer limitation and was moved to the owned Chromium product check.
- The original implementation-session claim about an initial six-test RED is historical and is not independently reconstructible from the retained files. It is therefore limited to the two observed statements above and is not used as review-fix provenance.
- Review-fix RED provenance is `review-fix-red-source.json` plus `review-fix-red-raw.txt`: at HEAD `4f1ae41a03337449e45feb1a7dd689a5086ec19d`, 15 tests produced 5 failures. Two failures were the missing run-owned staging/publication and product measurement contracts. Three lifecycle failures in that first raw file came from damaged Korean test literals; `review-fix-lifecycle-red-raw.txt` records the corrected direct lifecycle tests at 12/12 GREEN and they did not require product changes.
- The two genuine audit-contract failures were made GREEN without weakening their assertions; `review-fix-green-raw.txt` records 15/15.

This file records the observed command results from the implementation session. It does not reconstruct a new RED run against modified product code.

## 2026-09-21 independent re-audit

The binding Astra findings were reproduced again before each corresponding production change. The exact concise console captures are in `astra-rered-raw.txt`.

- Missing lifecycle primitive: test SHA-256 `44064C60EC5B3802DED5BD1324E1B213921453BDB490749AA9A7FBC3DB5ED0E4`; 15 focused tests produced 14 pass / 1 fail with `nextSettingsLeaveGuard is not a function`.
- Callback containment and category focus: test SHA-256 `D38082963B2A5F42FF57D3B3C703997CBEC2A19BFFD7FEB220C8130FDCB3F29A`; 21 tests produced 19 pass / 2 fail.
- Product focus ring: the retained `focusOutlineWidth >= 2` assertion observed `1.6px` at the host's fractional device scale.
- Product header-close focus: the actual browser asserted false before explicit settings-trigger restoration was added.

No test assertion was weakened to obtain GREEN.
