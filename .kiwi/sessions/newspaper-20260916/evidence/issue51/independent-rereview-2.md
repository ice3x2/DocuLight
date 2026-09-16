# GitHub #51 third independent rereview

## Result

**PASS — no Critical, High, Medium, or Low findings.**

This review independently compared the current working tree with base commit `8e548b8` against GitHub issue #51, the Astra decision, `FR-SHELL-001`, `FR-SHELL-003`, `FR-SHELL-015`, `FR-SHELL-016`, and `IR-SHELL-009` AC-3. The requirement Stability gates remain compatible with this work. I did not use the implementer's conclusions as evidence.

All findings from the first two independent reviews are resolved in the current diff:

- The actual `AppShell` now renders distinct tree and favorites loading, error, and ready branches. Retry uses the existing query `refetch`, and an error is not presented as empty or loading state.
- Naming mutation failures are converted to safe user-facing text and retained by the naming UI with `aria-invalid` and a visible, associated alert.
- Delayed favorites invalidation/refetch preserves focus across next, previous, and favorites-tab transitions without moving focus to `BODY` or leaking an open action.
- Rename and create accept only one Enter submission while pending. The input is disabled and `aria-busy=true`, and an older request result cannot close or overwrite a newer naming attempt.
- A whitespace-only name sends zero requests, marks the input invalid, exposes the linked visible alert, and clears the error as the user edits.
- Loading `aria-busy` is confined to the relevant tree or favorites tabpanel; the outer sidebar is not spuriously busy.
- The checked-in Playwright checker now waits for the old textbox to detach and the replacement tree row to become visible. It passed unchanged twice consecutively, so the former detached-element/visibility race is not reproducible.
- The earlier TDD evidence defect is superseded by relevant pre-implementation REDs. In particular, the server naming-error replay fails at the `aria-invalid` assertion rather than during menu timing.

## Product behavior and geometry

The Playwright tests exercised the real exported `AppShell`, `DocumentTree`, sidebar tabs, and menu components through the repository fixture. The fixture injects deterministic query and mutation behavior, but does not replace the product components under review.

The unchanged tree layout checker passed at 1280x720, 1440x900, and 1920x1080 in light and dark themes. It also passed genuine 200% browser zoom through an isolated persistent Chromium context and `chrome.tabs.setZoom(2)`; no CSS zoom, DPR substitution, half-sized viewport, or CDP emulation was used. Measurements retained 40px tree rows, 36px row controls, matching virtualization row height, internal tree overflow, the non-overlapping 52px favorites section, and the independent settings row. The former fixed 640px tree height is absent.

The same runs verified default, hover, focus, selected, disabled, readonly, invalid, loading, empty, and error behavior where each state applies. There are no product props for invented server tree-loading names or synthetic load-error branches; the implementation uses the existing query state. Long tree names retain accessible text without relying on a `title` tooltip. Radix menu placement, keyboard operation, action order, and permission filtering passed. External upload drag markers clear after drop/leave and internal tree dragging remains disabled. Favorites wrap, remove focus safely, and do not leak an open action. Inline naming focus, selection, Enter, Escape, empty input, and composition request counts passed.

## Naming and asynchronous focus challenges

The dedicated naming-state Playwright checker passed against `AppShell`. Rename and create each issued exactly one mutation under repeated Enter, exposed a disabled and busy input during the request, and ignored a stale response. A separate independent stale-response probe started a delayed rename, opened a different rename attempt, then waited past the first response. The newer input remained connected and unchanged:

```json
{"before":"업로드 디렉토리","after":"업로드 디렉토리","connected":true,"invalid":null}
```

Whitespace-only submission produced zero mutation requests, `aria-invalid=true`, and the visible linked alert `이름을 입력하십시오.`. Editing cleared that state. Server failure remained in the editor as a safe alert rather than being rendered as loading or empty.

The delayed favorites scenario reproduced next-action focus, previous-action focus, and favorites-tab focus across invalidation and rerender. Focus never became `BODY`, and the open count stayed zero. The matrix and targeted replay also reconfirmed tree geometry, permissions, drop cleanup, and synthetic IME composition behavior.

The checker contains a 160ms delay that creates its deliberate delayed-removal fixture state and a 400ms stabilization after genuine browser zoom. The formerly flaky rename transition itself uses explicit DOM state waits (`detached` then `visible`), with no arbitrary sleep. Two unchanged consecutive runs passed.

## TDD chronology audit

The current chronology correctly labels the old server naming-error RED as irrelevant and superseded. I inspected the raw logs rather than accepting that statement alone:

- `rereview-red-pending-empty-playwright.txt` at 04:05:07 fails because the real AppShell rename count is 2 rather than 1.
- `rereview-red-aria-busy.txt` at 04:05:09 fails because the expected busy state is absent.
- `rereview-red-empty-invalid-playwright.txt` at 04:05:29 fails because `aria-invalid` is absent.
- `rereview-red-create-pending-playwright.txt` at 04:08:06 fails because create count is 2 rather than 1.
- `rereview-red-server-naming-error.txt` at 04:08:21 reaches the relevant `newspaper-tree-states.test.tsx` `aria-invalid` assertion and receives `null`; it does not fail on menu timing.

Those RED artifacts precede restoration of the affected production files (`AppShell` 04:09:54 and `DocumentTree` 04:10:18) and the final checker at 04:10:26. The replay procedure removed the relevant implementation before each RED and minimally restored it for GREEN. The later state-test timestamp reflects added busy assertions and line movement; the raw server-error RED still identifies the corresponding invalid-state assertion. I found no final checker behavior without a genuine pre-implementation RED or pre-existing test, and no weakened existing assertion.

The `surface-gaps.test.tsx` change uses `findByRole` to await the real asynchronous UI. It does not remove or loosen the prior behavioral assertion.

## Independent commands and results

- `node packages/web/test/newspaper-tree-layout-check.cjs` twice consecutively: PASS both runs, including six light/dark viewport cases, product states, delayed favorites, keyboard/menu/drop/composition checks, and genuine 200% zoom.
- `node packages/web/test/newspaper-tree-naming-state-check.cjs`: PASS.
- Independent Playwright stale-attempt probe against the naming fixture: PASS; newer attempt survived the older response.
- `npm exec --workspace @doculight/web vitest -- run test/newspaper-tree.test.tsx test/newspaper-tree-states.test.tsx test/surface-gaps.test.tsx`: 3 files, 20 tests passed.
- Full web Vitest suite: 65 files, 705 tests passed.
- Editor Vitest suite: 21 files, 253 passed, 1 skipped.
- Web typecheck: PASS.
- Web production build: PASS, 2,980 modules transformed. The existing bundle-size warning remains informational.
- `node packages/web/test/newspaper-shell-layout-check.cjs`: PASS.
- Shared UI Playwright regression: 13 assertions passed, including genuine zoom.
- Theme runtime regression: 5 tests passed.
- `git diff --check 8e548b8`: no whitespace errors; only checkout line-ending warnings.

Happy DOM emitted the pre-existing nonfatal `URL is not a constructor` trace during Vitest. It did not fail or mask any test.

## Remaining verification limits

Synthetic composition events verify the product's IME guard and request count, but they do not constitute an actual Korean OS IME session. The authenticated backend/editor browser check could not be executed without credentials and a live authenticated API. The reviewed fixture therefore proves component integration and request semantics under controlled query/mutation behavior, while production authentication and network integration remain outside this local evidence. Neither limitation exposes a defect in the current diff.
