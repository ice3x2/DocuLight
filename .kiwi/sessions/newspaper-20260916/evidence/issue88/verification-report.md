# Issue 88 implementation verification — review 3 fixes

Requirement `IR-SHELL-013` remains `planned` / `stable`. No SRS status, acceptance criterion, verification evidence, or completed-work mutation was performed.

## Review findings addressed

- The rendered settings leave coordinator now revalidates a requested category against the current permission-derived category list before invoking the child's discard callback. The integration fixture revokes the requested workspace category while the L2 dialog is open and proves callback count zero, the same mounted form node, exact draft retention, unchanged generation, and safe guidance.
- A thrown child discard callback is exercised through the rendered coordinator. The form and draft remain mounted and the coordinator reports the safe failure message.
- The removed Enter test no longer combines a key event with a manual click. Product Chromium focuses the active Radix tab and uses `ArrowDown`; the Radix request is mediated while the requested tab remains unselected.
- Product capture publication copies every non-manifest artifact first, writes a destination-local temporary manifest, and atomically renames it to `capture-manifest.json` last. A filesystem test checks destination timestamps and absence of temporary files.
- Capture aggregates declare `utf8-bytewise-ascending` ordering for `sources[].path` and `artifacts[].name`; production code uses `Buffer.compare(Buffer.from(..., 'utf8'))`, and an independent non-ASCII fixture verifies the order.

## Verification results

- New RED: expected failures for revoked-target callback invocation and missing publication helper. Raw SHA-256 `D49015751B65C22145A0F52B3F39E8F5C8AF8681E3F6A7BAFB9D2C5AEFAEDEDD`.
- Focused final: 4 files, 32/32 passed. The publication test observes both artifacts and no completion manifest at the atomic rename boundary. Raw SHA-256 `E470D1B6E6C2A4CB5671892BDE3042FEDDFC16B5727FEC802616CBB045571260`.
- Cross-feature final (#63, #71, #87, #88): 7 files, 92/92 passed. Raw SHA-256 `579252C2EE1B9E7692EB9DDD99A5E12B898F4D5E774A2E48973D2496EAA6C019`.
- Product pass 1: PASS, 12 light/dark viewport/zoom environments plus 2 forced-colors environments. Raw SHA-256 `FC88065502032A203771E7BF7D971D52771FF9C97492C73E55FCCE5340861EA6`.
- Product pass 2: PASS, the same 12+2 matrix. Raw SHA-256 `D3304758B39D53FB1A37C911F3A1CB2065372914A32813E81E5D60B925EB3999`.
- Publication isolation: sentinel SHA-256 unchanged, manifest timestamp later than every other destination file, zero temporary files. Raw SHA-256 `3F393A2713249B6C07EC210BA2EDD0022C2E363598A99F54562426DF15614C7E`.
- Root typecheck: PASS. Raw SHA-256 `1AC950828E0F8A1676D399D62534ECB8961AB620FCB08487CAC2EFF0600A022B`.
- Root build: PASS. Raw SHA-256 `1576940F5708EF8F53464D3F8B2D8818B326196CF2750DBED8E2C737C6982C93`.

## Fresh full regression counts

- Web: 1160 passed / 1 failed, 1161 total across 95 files. Every issue-88 test passed. The unrelated failure is the existing happy-dom computed-color assertion in `token-panel.test.tsx`. Raw SHA-256 `C45BBDBA5F63B02ADBC300C5EED1E4C9B7B8113E841F98E455D076A127A35F44`.
- Root editor: 260 passed / 1 failed / 1 skipped. The unrelated architecture scan still reports existing web workspace form files.
- Root server: 1601 passed / 1 failed. The unrelated install assembly check still receives 503 for `/theme-bootstrap.js`.
- Root web: 1160 passed / 1 failed. The same unrelated token computed-style baseline failed. Root raw SHA-256 `E34DBAFDC3F57A4F1C3C41614EDCE10EE2BB456B2094E42A0AB41FB402243D0A`.

## SpecKiwi diagnostics

- `speckiwi validate --json`: zero errors; existing `SRS-W072` warning. SHA-256 `8F07100716DC09C08526023DCBA96700E979FCFA46A3CF59EE1416D2C77BAF25`.
- `speckiwi summary --target phase-1 --json`: no stability blockers, no missing evidence. SHA-256 `168CFD43AEC1CEC09203E59C66B5AD7FB307747071903ECCC3B40A347AB428C4`.
- `speckiwi links check --json`: existing unrelated `IR-AUDIT-004` reference `32`; no new error. SHA-256 `8338C04A039CB29A1859F20CFAC2B671AC3CA285E859BD636D269EC525591256`.

## Published capture

`.kiwi/sessions/newspaper-20260916/evidence/issue88/browser-matrix/capture-manifest.json` is the physical completion marker. It records three source hashes, 16 artifact hashes, `environmentCount: 12`, `forcedCount: 2`, and explicit UTF-8 bytewise aggregate ordering.

Final independent review passed with CRITICAL/HIGH/MEDIUM/LOW all zero; its SHA-256 is
`E936738916E066836008A3D8818A52F7AC2A3EA13B8BA9444870B2528FC11A50`.
Closeout checked AC-1 through AC-6, recorded VE-1 through VE-3, and promoted only
`IR-SHELL-013` through the allowed transitions to `verified`. This report remains
pre-commit evidence; the commit is created only after the aggregate manifest is
refreshed and verified.
