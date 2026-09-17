# Issue 61 implementation evidence

Requirements: IR-SHELL-001, IR-SHELL-002, IR-SHELL-008 AC-1/AC-2 and shell portions of AC-4/AC-6.

- Strict RED: `red-vitest.txt` — 9 tests, 3 expected failures before product implementation (grouping, header/close, permission revocation).
- GREEN: `green-vitest.txt` — 9/9.
- Full web regression: `full-web-tests-final.txt` — 71 files, 807/807.
- Typecheck/build: `typecheck.txt`, `build.txt` — PASS.
- Playwright browser matrix: `browser-run.txt`, `browser-matrix.json`, `settings-matrix/` — 12/12 environments. Every browser is Playwright-launched and isolated. Six 200% cases use disposable persistent profiles and an extension calling `chrome.tabs.setZoom(2)`; `getZoom===2` and before/after CSS viewport/DPR are recorded. Additional 899/900/901 breakpoint checks pass.
- Disposable installed-product path: `product-run-final.txt` — build server/web, isolated temporary DB/docs, install superuser/workspace, Playwright login, settings open/category grouping/close focus 4/4 PASS; owned server/runtime/profile/data cleanup only.
- No native input injection, existing browser attachment, `connectOverCDP`, or broad Node process termination is used.

Known scope boundary: nested settings forms/PAT migrations remain their owning issues and IR-SHELL-008 AC-5; this change does not claim them.

Independent-review fixes are recorded in `strict-rebuild-red.md` and
`review-fix-evidence.md`. The rebuilt RED covers all 15 normal, breakpoint, and
actual-200% paths with the geometry CSS absent. The final checker adds real
InstanceSettings input/action reachability, the complete required keyboard set,
contrast and focus-extent assertions, and 12 screenshots taken while the dialog
is open.
