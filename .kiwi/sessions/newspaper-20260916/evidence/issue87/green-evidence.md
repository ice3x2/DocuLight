# Issue 87 implementation GREEN evidence

- Requirement: `FR-CONFIRM-024`
- Integration base: `f8ad7e3`; implementation HEAD before working-tree changes: `d5778906b1b4a37a50f34a1f9e0aea14dd1dfdd1`
- Detached evidence manifest: `green-evidence-manifest.json`
- Source and browser-artifact aggregate SHA-256: `d40555d90bd1d6fb81c1875e3185e72c9e914e9b1cca747d0a7dc7e2711ecb08`
- Server raw report SHA-256 `704678de6aa8358513fc98af2806c05e209029ea20b8431e632789a0140370a1`: 82 passed, 0 failed.
- Web raw report SHA-256 `3cd00490860ecca825d9f95a42d4e8751767456c4553505688f5392625635233`: 13 passed, 0 failed.
- Product-browser raw report SHA-256 `0c3b5929d384b394737896b4e4bc8907b0400b3cb24f26b1716c3a7370264a20`: exit 0.
- Ordinary `npm run test:browser:issue87-product` writes browser output only below its run-owned temporary root; `npm run test:issue87:product-isolation` verifies that the fixed artifact, report, and manifest identities remain unchanged. Only `npm run test:issue87:capture-evidence` stages and validates source hashes, artifacts, and reports before publishing the manifest last.
- The product run used built server and web output, isolated SQLite/vault storage, two authenticated accounts in two browser contexts, real GET/preview/PUT traffic, stale receipt rejection and re-review, exact-token submission, and outer-OWS UI rejection.
- IME automation covered synthetic `compositionstart`/`compositionend` with composing Enter and verified zero PUT requests. Native Windows/OS IME candidate-window behavior was not performed and is not claimed.
- Browser artifacts contain the complete 12-case light/dark matrix across 1280x720, 1440x900, and 1920x1080 at true 100%/200% zoom, plus two forced-colors captures. The checker waits until the requested runtime theme is applied before measuring or capturing.
- Focused workspace API regression: 197 passed, 0 failed. Combined issue 71/87 web regression: 39 passed, 0 failed. Root typecheck and build passed.
- Full server command `npm run test --workspace @doculight/server -- --run` exited 1 with 1601 passed and 1 failed; stdout/stderr raw SHA-256 is `e34aedba7f23e6d7d0ddeeeaa5e0f5859b3a315923d3d3483c9c18145480fc0d`. The exact isolated command `npm run test --workspace @doculight/server -- --run test/http/install-assembly.test.ts` exited 1 with 11 passed and the same one `/theme-bootstrap.js` 503 failure; raw SHA-256 is `7492d810245726732c35df97ba1a0e9ed5b23d2b521a5a6e3d37489a1240242c`.
- Full web command `npm run test --workspace @doculight/web -- --run` exited 1 with 1128 passed and 1 failed; stdout/stderr raw SHA-256 is `4ab2ab8dfad54a35101f91357c240d48e5d39d49d165c9b6d12cfc5bb7836b6c`. The exact isolated command `npm run test --workspace @doculight/web -- --run test/token-panel.test.tsx` exited 1 with 22 passed and the same one empty computed inline color failure; raw SHA-256 is `92f505d1ea0afa2ec7253ef3878fd8f417b1f2c542d625344c0462b449dc402a`.
- FR-CONFIRM-024 AC-1 through AC-5 are checked and Status is verified after the independent final review reported C0/H0/M0/L0; Stability remains stable. Native Windows/OS IME candidate-window behavior remains explicitly outside the verified evidence scope.
