# Issue #51 independent re-review

Review base: `8e548b8d8d5df61107347769a029cc2303d7a3b3`

Verdict: **FAIL — 1 High, 2 Medium, 1 Low.** No Critical finding.

The previous report's query-state High and delayed-focus Medium are functionally corrected, and the screenshot coverage Low is corrected. The strict-TDD Medium is only partly corrected. Independent adversarial verification found one new mutation defect and two remaining contract/evidence gaps.

## Findings

### High — an in-flight inline naming mutation accepts repeated Enter and emits duplicate server requests

`DocumentTree.tsx:129-139` guards IME composition and empty input but has no pending-submit guard. `AppShell.tsx:734-744` awaits `onRename` or `onCreate` while leaving the same focused input enabled and connected. A second Enter during network latency calls the mutation again.

Independent Playwright reproduction used the real `AppShell` and `DocumentTree` modules with `onRename` resolving after 150 ms:

1. Open Rename from the real Radix tree menu.
2. Fill `Twice.md`.
3. Press Enter twice before the first promise settles.
4. Observed `{ calls: 2, invalid: "true", active: "INPUT" }`.

Both calls travel through the same `onNamed` path. The create path uses that path too, so key repeat can create two documents/directories rather than merely repeating an idempotent visual action. This violates the frozen request-count contract: composition Enter emits zero requests and one separate post-composition Enter emits exactly one. The current unit and browser tests press the confirming Enter once and cannot detect this.

The smallest correction needs a per-attempt pending guard before invoking the mutation, with stale completion protection so an older response cannot close or mark invalid a later naming session. The pending state should not introduce blur save/cancel or client-side server validation.

### Medium — invalid and loading state semantics are still incomplete

The new server-rejection path correctly keeps the input open, sets `aria-invalid=true`, connects the safe message through `aria-describedby`, and does not expose arbitrary thrown error text. Two required state branches remain absent:

- Empty input is the one client-owned invalid rule, but `NameField` only receives `invalid={namingError !== undefined}`. Independent Playwright filled three spaces and pressed Enter. It correctly emitted no rename, but observed `aria-invalid=null`, zero alerts, and a still-connected input. `astra-decision.md` §3 requires an invalid boundary, `aria-invalid`, and connected error copy; §7 says empty is the client-side condition to block.
- `astra-decision.md` §3 requires the list region to expose `aria-busy` during real loading. `AppShell` renders `LoadingState` for tree and favorites, but neither the tab panel/list region nor `LoadingState` has `aria-busy`. A repository search found no `aria-busy` in the affected shell/state/tree/favorites modules.

These do not recreate the previous High: initial tree/favorites errors are now distinct from loading and successful empty, use fixed safe copy, and retry only through the existing TanStack `refetch`. They are incomplete accessibility/state semantics within otherwise correct branches.

### Medium — the naming-state remediation still lacks a genuine relevant RED

The replay audit now honestly limits the initial browser RED to the first reached assertion and supplies removal REDs for row/control geometry, selected marker, long-name surface, menu geometry, favorites geometry, dynamic height, composition, and naming help. Timestamps support removal before RED and restoration afterward:

- geometry RED 03:46:57, favorites geometry RED 03:47:56, composition RED 03:48:24, dynamic-height RED 03:48:48, naming-help RED 03:50:23;
- final CSS 03:48:08 and `DocumentTree.tsx` 03:50:29, followed by replay GREEN 03:52:01.

The actual naming-error state does not have equivalent proof. `review-red-query-naming-states.txt` reports that test as RED, but it fails at `findByRole('menuitem', { name: '이름 변경' })` before opening the inline input or reaching any naming-error assertion. The test was then changed from direct `findByRole('menuitem')` to waiting for the menu and querying within it; its mtime is 03:39:30, immediately before GREEN at 03:39:52. There is no raw run after that timing fix and before the naming implementation showing failure at the safe-message, connected-input, or `aria-invalid` assertion.

The test change itself is a valid async wait and does not weaken the intended assertion. It means the cited raw failure does not prove test-first implementation of the naming error behavior. Strict remediation still requires removing that behavior, running the corrected test to a relevant assertion failure, then minimally restoring it and recording GREEN. The newly discovered duplicate-submit and empty-invalid branches also have no RED coverage.

The tracked `surface-gaps.test.tsx` change is not weakening. Replacing `getByRole` with `findByRole` waits for the same accessible New Note button now that the actual tree query resolves asynchronously; the subsequent server-call assertion remains unchanged.

### Low — the shipped Playwright matrix is deterministically racy after rename

`node packages/web/test/newspaper-tree-layout-check.cjs` failed independently twice at the same point. After `inspect()` submits rename and the async `onNamed` path removes the naming row, `matrix()` immediately uses the earlier `treeRows` locator and clicks item 2. Playwright resolves the upload-directory treeitem but reports `Element is not visible` while the virtualized tree is rebuilding.

This prevents the checked-in command from reaching the light/dark screenshots, delayed focus sequence, state scenarios, and genuine zoom in a clean run. It also explains unstable recorded tree heights across environments in `green-measurements.json` (for example 1440 light 696 versus dark 737 after the same sequence).

To separate test timing from product behavior, this review ran a temporary copy with one 200 ms settle plus `waitFor({ state: 'visible' })` before that screenshot click. The otherwise unchanged checker passed all six desktop cases, state scenarios, delayed focus checks, and genuine extension zoom. The product behavior is therefore sound at this point; the shipped reproducible command and recorded measurements are not reliable until the explicit UI wait is incorporated.

## Prior finding disposition

| Previous finding | Current result |
| --- | --- |
| High: tree/favorites loading/error and naming error disconnected | **Behaviorally resolved.** `App.tsx:167-171` and `225-229` separate ready/loading/error from actual TanStack state; retry calls only `refetch`. `AppShell` renders persistent shared state surfaces. Rename/create catch errors and pass safe naming text; raw errors are not dumped. Remaining `aria-busy` and empty-invalid details are the Medium above. |
| Medium: delayed favorite removal loses focus | **Resolved.** `pendingFocus` retains the removed node id and ignores intermediate rerenders until that id disappears. |
| Medium: final checker behaviors lacked RED | **Mostly resolved.** Explicit removal REDs cover geometry, favorite layout, dynamic height, composition, and help. Naming-error RED remains irrelevant as described above. |
| Low: screenshots only showed empty Favorites | **Resolved.** Current evidence includes populated favorites, selected/focused tree, empty favorites, tree/favorites loading and error, and naming error screenshots. |

## Independent focus and interaction verification

An independent Playwright delayed-update probe caused an unrelated render immediately and removed the selected favorite 100 ms later:

- remove middle of three: focus moved to the next remove button (`C 즐겨찾기 해제`);
- remove last of two: focus moved to the previous remove button (`A 즐겨찾기 해제`);
- remove final row: focus moved to the Favorites tab;
- every step had `activeElement !== BODY` and file-open leak count remained zero.

The real Radix menu retained its nine-item order, readonly permission states, 240 px width, 36 px items, ArrowDown movement, and Escape closure. Tree rows remain 40 px, expanders and favorite removal controls 36 px, favorites at least 52 px, and settings does not overlap the remaining tree viewport. External accepted-file drag marker cleanup on leave/drop and internal drag disable remain intact. Synthetic composition still produces zero submission during composition and one submission after composition ends when only one post-composition Enter is sent.

The robust matrix passed at 1280×720, 1440×900, and 1920×1080 in light and dark. Genuine 200% used isolated persistent Chromium with an extension calling `chrome.tabs.setZoom(tabId, 2)`; reported zoom was `2` and CSS viewport `394×406`. No CSS zoom, device-scale substitution, half viewport, or CDP emulation was used.

## Commands and results

- `npm exec --workspace @doculight/web vitest -- run test/newspaper-tree.test.tsx test/newspaper-tree-states.test.tsx test/surface-gaps.test.tsx` — 3 files, 19/19 passed.
- `npm test --workspace @doculight/web` — 65 files, 704/704 passed. The existing non-fatal Happy DOM `URL is not a constructor` console trace remained.
- `npm test --workspace @doculight/editor` — 21 files passed, 253 passed and 1 skipped.
- `npm run typecheck --workspace @doculight/web` — passed.
- `npm run build --workspace @doculight/web` — passed, 2,980 modules transformed; existing bundle-size warning only.
- `node packages/web/test/newspaper-tree-layout-check.cjs` — failed twice with `Element is not visible` at the post-rename screenshot click.
- temporary unchanged matrix plus explicit visible settle — passed six desktop cases, product-component states, delayed focus, and genuine zoom.
- `node packages/web/test/newspaper-shell-layout-check.cjs` — passed.
- `node test/theme-runtime-check.mjs` — 5 checks passed, 0 failed.
- `node test/newspaper-shared-ui-check.mjs` — first parallel run collided with Vite dependency optimization and failed `Missing help`; isolated rerun passed all 13 assertions including genuine zoom.
- `node test/editor-styles-check.mjs` — not runnable without the documented authenticated account and API session. No authenticated product-flow result is claimed.
- `git diff --check 8e548b8` — no whitespace errors; only line-ending warnings.

The state screenshots now match the component behavior they claim: populated and empty favorites are separate, selected/focused tree rows are visible, and tree/favorites loading/error plus naming rejection have named images. Those screenshots exercise real product components with fixture-supplied state props; the actual TanStack wiring is independently covered by the `App` tests and static product-path audit.

Actual Korean OS IME candidate-window input remains unverified. The Playwright composition events verify only the DOM/React event boundary. Authenticated editor product flow also remains unverified for the prerequisite reason above.
