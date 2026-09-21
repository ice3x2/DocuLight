# IR-PRINCIPAL-002 TDD chronology

- RED: four focused review tests failed before implementation: reconciliation lock, stale registration completion, per-ID pending UI, stale row completion.
- GREEN: generation-bound completions, authoritative reconciliation revision, typed action results, and stateful per-ID pending controls implemented.
- Review 2 RED: App accepted-read races and sibling pending semantics failed in four exact assertions before the fix.
- Re-review evidence RED: raw server logs exposed two install-token bearer values. The capture now deterministically redacts known credential forms before hashing and fail-closed scans source, artifact, report, and raw evidence.
- Integration baseline comparison: isolated clean detached `b2b126c3ee04602e1ace3e256d2816b32aefc930` independently reproduces the exact token-panel computed-style failure and, after a recorded clean web build, the install-assembly `/theme-bootstrap.js` 503 failure.
- Final runs were captured after all source hashes below were frozen. Browser artifacts were staged, verified, and published before the manifest.

| Run | Exit | Classification | SHA-256 |
| --- | ---: | --- | --- |
| red-review-findings-raw.txt | 1 | expected-red-four-review-findings | edfbc9513db44842a948d0b934712cd5c7a3b6588f74dd42119ea55ff34e9697 |
| red-review2-raw.txt | 1 | expected-red-review2-h1-m1-four-failures | 2b21d676ea2a51efa8453df37cb8f4687d2c9a3e7382a805d872975e5fcf99a1 |
| red-evidence-secret-scanner-raw.txt | 1 | expected-red-missing-secret-scanner | 4050a4e523956e4ff74da2d7259c9165997d98908010e7dfec46338a69495dba |
| baseline-b2b126c-identity-raw.txt | 0 | baseline-b2b126c-exact-ref-clean-porcelain | c6ee1505d43bb7e28dceeb87c2e0ef963813d55cfde8f6a229cefd16ae210f5d |
| baseline-b2b126c-web-full-raw.txt | 1 | baseline-b2b126c-web-token-panel-one-failure | 3a0c0235f2a1e81bf596ec368b915e2ec5f02f89feecf1feacba0c663ec40e86 |
| baseline-b2b126c-build-raw.txt | 0 | baseline-b2b126c-web-build-passed | 80c61aa8a3bd0c14d95769773c7eec02d0cf52ec931140138dabd894a565e6df |
| baseline-b2b126c-server-full-raw.txt | 1 | baseline-b2b126c-server-theme-bootstrap-one-failure | c5c0186e4be838cba6dc81cb824197c5eb5e58d1d1c81940ddce7531c188466e |
| final-secret-scanner-test-raw.txt | 0 | passed-4 | 7b867bbf20df93453620a82c764a130359b0da99bb406ddeef3cf67c1b2a9c21 |
| final-focused-raw.txt | 0 | passed-173-after-integration | d98bed84707264a22c4f4dde7140fc42eb3a7f6bc8038a094d33b41b7a8c85e5 |
| final-web-full-raw.txt | 0 | passed | 67ce6314dc0537dbf90b1a3aa518a0746af4ab92b0b3476f4deb6d35d3ae3567 |
| final-typecheck-raw.txt | 0 | passed | a6a1f9af533f7723956a181958be601c413d1c1ea9a4c12e1c99ba63995d44ef |
| final-build-raw.txt | 0 | passed | 141eb2ff770e6f55292fde35f34181aabfba6f247e8a24e1bd7ffe4f2cb1024d |
| final-server-full-raw.txt | 0 | passed | 19e7a8c330c862944a385336805a9ebc1331e59e76d4a9bc62c321e0b4183bf5 |
| final-speckiwi-raw.txt | 0 | passed-with-known-SRS-W072-warning | f0a52bb43445f10826aa743ae399db5fa17414d44665820d9ec6344d88449d44 |
| final-product-raw.txt | 0 | passed-12-plus-2-with-24-role-denials | 9328582fc684e6320471d6fc480941f3c146ec614221b0ecb0b40337ab6dabbd |
| final-secret-scan-raw.txt | 0 | passed-fail-closed-secret-scan | 8a7b10cc669ae32e4fb6727c1733bd0c12c364f4634a729c843cc9579e88ff97 |
