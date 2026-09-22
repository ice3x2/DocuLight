# Issue #83 review2 TDD chronology

Requirement: `IR-WORKSPACE-002`.

1. RED — `2026-09-21T16:29:14.3012360Z`
   - Raw: `review2-red-raw.txt`
   - SHA-256: `61af366e4e1dbb8d247460edb542eec75992c2d8463cdf239c920187c7d5248f`
   - Expected failures: same-anchor managed-set replacement retained stale picker state; contextual revocation key was not refetched; failed refetch resolved silently.
   - Source hashes: `review2-red-source-hashes.json`.
2. GREEN — `2026-09-21T16:36:31.8814716Z`
   - Raw: `review2-green-web-final-raw.txt`
   - SHA-256: `8837b9dc327d2295275add576a35cecaaf9437726a2047fddc952a1c74029d06`
   - Result: issue #83 focused suite 12/12 passed.
   - Final source hashes: `review2-green-source-hashes.json`.
3. Built-product isolation — `2026-09-21T16:36:54.8753756Z`
   - Raw: `review2-product-isolation-raw.txt`
   - SHA-256: `cb912ae8b1d8d365855a68dd0f35fc00382a89090abce4a714bd2484c8f36d66`
   - Result: isolated persistent Chromium product matrix passed; `capture-manifest.json` was atomically written after the exact artifact set.

The malformed response cases were present in the RED source snapshot. They passed there because the existing decoder already rejected malformed rows; the same run still failed on the three review findings above, before their implementation changed.
