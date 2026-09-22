# GitHub #52 third independent rereview

## Verdict

**FAIL — Critical 0, High 0, Medium 0, Low 1.**

The two findings from `independent-rereview.md` are resolved in the current diff. The actual AppShell now clears stale virtual keyboard focus when DOM focus leaves the search input or pointer interaction takes over, and restores it on the next input Arrow action. Same-source OR results are stable when branch order is reversed. The remaining Low finding is an independently reproduced race in the checked-in #51 browser regression checker. It is outside the #52 product diff, but it makes that required regression gate nondeterministic.

## Finding

### Low 1 — the #51 tree Playwright regression checker still has a visibility race

I ran `node packages/web/test/newspaper-tree-layout-check.cjs` in three separate fresh processes without changing the checker. The first process failed at `packages/web/test/newspaper-tree-layout-check.cjs:61`:

```text
locator.click: Element is not visible
getByRole('treeitem').nth(2)
```

That click is immediately preceded by `waitFor({ state: 'visible' })`, but the locator is resolved again for `click({ force: true })`; the fixture can rerender between those operations. The next two fresh processes passed. A 1/3 fresh-process failure is enough to show that the shipped regression checker cannot reliably distinguish a product regression from fixture timing.

The #52 diff does not modify the tree component, tree fixture, or this tree checker, and the search-specific CSS selectors do not apply to it. I therefore classify this as a Low verification-infrastructure defect rather than a #52 product defect.

Exact reproduction:

```powershell
node packages/web/test/newspaper-tree-layout-check.cjs  # FAIL: treeitem nth(2) not visible
node packages/web/test/newspaper-tree-layout-check.cjs  # PASS
node packages/web/test/newspaper-tree-layout-check.cjs  # PASS
```

## Prior-finding remediation

### Prior Medium 1: stale and clipped virtual focus — resolved

An independent Playwright probe against the actual `AppShell` produced this lifecycle in both themes:

| Action | `document.activeElement` | keyboard state | result outline |
| --- | --- | --- | --- |
| Input `ArrowDown`, then `Home` | search `INPUT` | `true` | solid 2px, offset 2px |
| `Tab` | search-target `BUTTON` | cleared | none |
| `Shift+Tab` | search `INPUT` | cleared | none |
| input `ArrowDown` again | search `INPUT` | `true` | solid 2px, offset 2px |
| click filter checkbox | checkbox `INPUT` | cleared | none |
| pointer movement over another result | pointer target | cleared | none |

Thus virtual focus follows the keyboard interaction mode rather than lingering after actual focus or input modality changes. Enter/open and synthetic IME composition behavior remained green in the checked-in checker and web tests.

The checked-in geometry calculation is correct: it uses `outlineWidth + outlineOffset` as the outward extent and derives the content viewport from the scroll host's `getBoundingClientRect()`, `clientLeft`, `clientTop`, `clientWidth`, and `clientHeight`. It checks all four edges for first, middle, and last representative rows at all 12 environments. The 4px region padding, scroll padding, and row scroll margin match the 2px outline plus 2px offset.

At genuine 200% zoom, I separately measured a long Korean/no-space row instead of relying on the concise representative rows. At a 1280x720 browser window the CSS viewport was 640x360, the row was 475px high, and the result viewport was 165px high. Its left and right outline edges stayed inside the client viewport. At the initial/top position the top edge was visible; after `scrollIntoView({ block: 'end' })`, `scrollTop` moved from 83 to 409.5 and the bottom edge was visible. The whole row cannot physically fit into a shorter viewport at once. Keeping concise rows at representative indexes for the four-edge assertion therefore isolates a geometrically satisfiable case; the fixture still contains 29 long rows, and the separate measurement did not reveal hidden horizontal clipping or unreachable vertical edges.

### Prior Low 1: OR representative depends on branch order — resolved

The service now retains internal source identity, match length, and stable source order. At one identity it chooses the longest matching term, then emits matches by source order. `alpha | alph` and `alph | alpha` return deeply equal documents and excerpts in both the service test and an actual Express HTTP request. The public `SearchExcerpt` shape is unchanged.

Separate offsets remain separate identities; name, attachment, tag, Markdown body, and PDF page identities remain distinct. Existing tests for cross-axis matching, PDF page preservation, permission filtering, result order, name-only zero body reads, rejected/zero-axis zero reads, and one extraction per document all pass. No new parser or per-branch document read was introduced.

## TDD chronology audit

The raw RED logs reach the intended final assertions before the corresponding implementation timestamps:

| Behavior | Raw RED | RED time | Final implementation time | Result |
| --- | --- | --- | --- | --- |
| OR branch-order stability | `rereview-red-or-order.txt` | 05:11:43 | service 05:12:51 | service and actual HTTP deep equality failed on the one-character excerpt difference |
| Four-edge outline containment | `rereview-red-outline-clipping.txt` | 05:11:52 | CSS 05:12:08 | first-row computed outline extent was outside the scroll client viewport |
| Clear stale virtual focus | `rereview-red-stale-virtual-focus.txt` | 05:12:15 | `SearchPanel` 05:12:21 | the post-Tab keyboard-navigation assertion observed `true` |

The permanent checker/server assertions existed at 05:11:34, before those implementations. Each RED failed at its behavior assertion rather than fixture startup, menu timing, or an unrelated exception. The final implementation is minimal: an input blur clears keyboard mode, scroll geometry reserves the required four pixels, and same-identity dedupe selects the longer match while preserving source order. The later fixture change at 05:13:55 replaced only the three all-edge representative rows with concise content after genuine 200% exposed the physical row/viewport height mismatch; it did not remove the long-content population or weaken the independent long-row reachability behavior. The chronology file matches the raw logs and filesystem timestamps.

No existing assertion was weakened to reach green. The search checker contains no fixed UI sleep; its only `setTimeout` polls fixture-server readiness. It uses event/state waits for interactions.

## Independent execution

- `node packages/web/test/newspaper-search-layout-check.cjs`: PASS. Six light/dark 100% cases at 1280x720, 1440x900, and 1920x1080 plus six genuine 200% cases. The zoom cases launch isolated persistent Chromium with an extension and call `chrome.tabs.setZoom(2)`. No CSS zoom, viewport halving, device-scale emulation, or CDP zoom was used.
- Independent actual-AppShell lifecycle probe: PASS for Arrow/Home, Tab, Shift+Tab, filter click, pointer reset, and Arrow restoration in light and dark.
- Independent genuine-200% long-row probe: PASS for horizontal outline containment and separately reachable top/bottom outline edges; measured row 475px, viewport 165px, `scrollTop` 83 to 409.5.
- Targeted web search/tag tests: 3 files, 30/30 PASS.
- Targeted parser/service/actual Express HTTP tests: 3 files, 46/46 PASS.
- Full web suite: 65 files, 711/711 PASS. The pre-existing nonfatal Happy DOM `URL is not a constructor` trace remains.
- Full server suite: 137/138 files and 1,435/1,436 tests PASS. The only failure is the previously reproduced clean-`7fe1b32` baseline `install-assembly.test.ts` `/theme-bootstrap.js` expected 200/actual 503; there are no new search failures.
- Editor suite: 21 files, 253 PASS, 1 skipped.
- Web typecheck: PASS.
- Web production build: PASS, 2,980 modules; only the existing chunk-size warning.
- `node packages/web/test/newspaper-shell-layout-check.cjs`: PASS.
- #51 tree checker in three fresh processes: FAIL, PASS, PASS, producing Low 1 above.
- `git diff --check 7fe1b32`: PASS with line-ending conversion warnings only; no whitespace errors.

No test process was terminated by image/name; no broad `node.exe` kill was used.

## Requirement mapping and limits

The current #52 implementation continues to satisfy FR-SHELL-013/014 and IR-SHELL-009 AC3 for the reviewed search layout, state separation, filter popover, result hierarchy, keyboard behavior, query semantics, permissions, cost bounds, and genuine zoom geometry. The two rereview fixes preserve the frozen Astra decision and do not add new query policy, result fields, or screen scope.

The Playwright fixture renders the shipped `AppShell` and `SearchPanel`, but it uses controlled search callbacks rather than an authenticated live backend. Service behavior is separately exercised through actual Express HTTP tests. IME coverage dispatches synthetic composition events; it is not evidence from a real Korean OS IME candidate window. These are genuine evidence limits, not additional findings.
