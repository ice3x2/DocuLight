# Issue #74 implementation evidence

Requirement: `IR-PRINCIPAL-001` (stable/planned), constrained by `FR-PRINCIPAL-003`, `CON-PRINCIPAL-004`, `FR-CONFIRM-009`, `FR-CONFIRM-023`, `SEC-AUTH-009`, and `SEC-AUTH-016`.

## Product result

- Only a superuser receives offboarding entry callbacks. A workspace administrator gets the safe 404, sees no entry, and issues no product offboarding GET.
- The parent-owned settings surface replaces the body with one four-stage flow. It preserves exact principal ID/name/status snapshots, separates mutation acceptance from refresh confirmation, retains accepted state across read failure, and offers refresh-only retry without repeating a write.
- Stage 1 avoids a POST for an already suspended principal and treats pending/rejected as inactive stage completion. Stage 3 compares normalized ID/name sets, freezes execution order, and persists ID-authoritative accepted/unconfirmed/not-run results with confirmed display names.
- Stage 4 hands the exact singleton subject to the existing #69 flow, preserves its source card, returns on cancel/complete with a reread, and does not rewrite rejected status. Each stage has explicit success, error, and retry focus behavior.

## TDD RED preservation
- red-back-focus-remount.txt: `05ac7beb54792cea75aea5d3a574b84a4609c1b5b1274b919877570dbf24b13a`
- red-entry-card.txt: `ed0472b3451f6ed1c5d6123153ff4e16b9bebf8a13cf4644a0f7816717855bce`
- red-exact-status.txt: `1a4a6cb64c06f26dcb4888a202f1724af0e9b00297a4c6a01e02a1ddeffed4fb`
- red-handoff-exact-status.txt: `37d3e726e7fd4adc80ba3ddb03c57b608dea688a96fc7513fc15f150e23be6f0`
- red-handoff-return.txt: `a7a2659f7b8f57e80360465d42bc41612ab6dadbb704f3a9f9df8383bebb086c`
- red-last-superuser-message.txt: `016c5b376b5d7745d39c67f146cf567657068e54955b85c741c1db784d7c8de7`
- red-layout-css.txt: `5c1cdc08e8837ca40412320c1d83dd1181ce061a95c16a0370ec96d0bba97d84`
- red-membership-plan.txt: `55c3a7d4b83a77d0ed7ec228c6b4467822da16686f7d27fae0baf2ab97d57f31`
- red-product-entry.txt: `1d62d18cb8608d6532194072e93802936cbc91dd54390ca5e6a8a4d2a7142d62`
- red-review-fixes.txt: `2f69139b0db2103c8da3a325ec6ecc85208ac2ccae64105a3ffed7b6c177189a`
- red-stage-focus.txt: `19d2054c3b859f007f7cb6e56c3b5a71639ec158fadded6e5a5e754418dbcb21`
- red-surface-refresh-preservation.txt: `529bd61b13b1b262d16ab6a9b00ccb2a684261e651a50abe7371b0fe84e9d492`

Every behavior-changing product edit was preceded by the matching failing automated test artifact above. Focused GREEN artifacts preserve the corresponding passing cycles.

## Verification

- Focused web review suite: 36/36 passed (`green-review-fixes-final.txt` plus focused follow-up artifacts). Focused server offboarding: 18/18 passed (`server-review-focused.txt`). Web typecheck and server/web product builds passed.
- Product Playwright (`playwright-review-final-stage3.txt`) passed 12 normal states: exact 1280×720, 1440×900, and 1920×1080 viewports × light/dark × true browser zoom 100/200. Six forced-colors viewport/zoom states passed. The temporary extension asserted `chrome.tabs.getZoom() === 2` for 200% and final reset `=== 1`.
- The product checker measured keyboard focus outlines and contrast, text contrast, card containment, independent settings scrolling, and forced-colors focus. It exercised both user and ACL entries, L2 Escape/cancel and focus restoration, exact singleton ACL handoff, back restoration, actual suspension, last-active-superuser floor rejection, and `principal.status` audit creation.
- Stage 3 used three ordinary groups including a long name. At true 200% it measured dialog containment and full scroll reachability, then dropped the second DELETE and verified persistent ordered results `accepted`, `unconfirmed`, `not-run` with only two attempts. Measurements and exact-state screenshots are in `browser-matrix/`.
- The frozen flow contains no editable text control, so composition/IME is inapplicable. Evidence records that boundary and makes no native IME claim.
- Full web regression: 1075/1076 passed; the sole token-panel happy-dom computed-style failure is unchanged. Full server: 1458/1459 passed; the sole install-asset 503 is unchanged. Full editor: 260 passed and 1 skipped; the remaining architecture-oracle report names only unchanged HEAD files.
- SpecKiwi validation retained zero errors and the existing `SRS-W072`; link checking retained the existing `IR-AUDIT-004 -> 32` warning.

## Environment and scope

The initially shared dependency junction created duplicate CodeMirror instances. After verifying targets, the worktree received its own `npm ci` install and the editor junction was removed; the 116 environment-induced editor failures disappeared. No commit, push, or issue close was performed.

## Final authority-loss review loop

- RED: `red-rereview-authority-guards.txt` captured six failing contracts for 401 invalidation, stage-3 preflight failure, authoritative naming, exact replacement, and separate subject typing. `red-rereview-stage3-guard.txt` captured two same-tick roster reads; `red-rereview-stage4-adapter.txt` captured the incorrectly available stage 4.
- GREEN: `green-rereview-authority-guards.txt` passed 29/29; the combined offboarding/ACL focused run `green-rereview-focused.txt` passed 66/66. Web typecheck passed.
- A 401 during an accepted-write refresh or stage-3 preflight now invalidates the request generation, removes the card, plan, outcomes, and actions, increments the App authentication generation, and refetches the session. A 500 preflight closes the old L2 consent and requires a fresh confirmation.
- Principal search retains the three-state `PrincipalStatus`; the rejected-capable handoff uses `OffboardingSubject`/`RevocationSubject`. Missing exact replacement support renders stage 4 unavailable and never appends a prior selection.
- Expanded product Playwright (`playwright-rereview-expanded-final.txt`) passed 12 exact normal viewport/theme/zoom states and 6 forced-colors states. It measured pending, hover, readonly-summary and keyboard-focus contrast; long L2 runtime resize and true zoom; L3 cancel, dropped POST partial, and accepted completion return with GET rereads; actual `acl.revoke` audit; and roster-401 stale card count zero.
- Final full regressions: web 1084/1085 with the unchanged token-panel happy-dom computed-style failure; server 1458/1459 with the unchanged install asset 503; editor 260 passed, 1 skipped, with the unchanged architecture oracle naming only HEAD files.
- The final checker rerun additionally asserted independent navigation/body scrolling and a product 500 read failure followed by refresh-only recovery.
- Final gate RED `red-final-gate-auth-mutation.txt` failed 5/35 for suspension POST 401, first/mid membership DELETE 401, and same-tick stage1/stage3 confirm duplication. GREEN `green-final-gate-auth-mutation.txt` passed 35/35; affected combined regression `green-final-gate-focused.txt` passed 71/71 and web typecheck passed.
- Mutation guards are keyed by principal ID, set before any awaited preflight/write, and conditionally cleared in `finally`. A 401 from suspension or any membership DELETE immediately invokes authority loss; no stage3 tail request or stale outcome survives.
- Final Playwright gate `playwright-final-gate.txt` passed 12 normal and 6 forced states. It calculates disabled and error contrast in both normal themes, asserts forced-colors control/predicate visibility and contrast, and verifies an actual `principal.member-remove` API audit row for the target.
