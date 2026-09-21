# Issue #84 implementation verification

- Requirement: `IR-PRINCIPAL-005`
- RED: server 3/3 failed and web 3/3 failed; raw output is preserved in `red-server-raw.txt` and `red-web-raw.txt`.
- Frozen RED hashes: `red-test-hashes.txt`.
- Server test correction after RED: the initial server test searched the localized system-group display names with the unrelated literal `system`. It was corrected to query each repository-owned display name. This did not weaken the expected capability values. Corrected server test SHA-256: `689e56017318522c164555a270b14ef3ca9620d7e6fa20c5d20e06b7caa2d650`.
- Focused green: server 43/43; web 73/73.
- Full green: server 145 files / 1608 tests; web 112 files / 1340 tests. Raw final summaries are in `full-server-final.txt` and `full-web-final.txt`.
- Root typecheck: PASS.
- Root build: PASS.
- Product browser: PASS with actual built App and seeded backend; workspace manager 200, node editor 404, ordinary user 404, unauthenticated 401. The selected row and the one L3 both displayed the authoritative bypass warning.
- Browser matrix: 12 light/dark × 1280×720/1440×900/1920×1080 × 100%/200%, plus 2 forced-colors captures. Zoom used `chrome.tabs.setZoom` and was verified with `chrome.tabs.getZoom`.
- Artifact handling: temporary server/database/profile/capture directories; images copied before `capture-manifest.json.tmp` was atomically renamed to `capture-manifest.json` last.
- Secret scan: PASS. `rg -n "설치 토큰:|Issue84-[A-Za-z]|password|installSession|Bearer |session=" .kiwi/sessions/newspaper-20260916/evidence/issue84 -g "*.txt" -g "*.json" -g "*.log"` returned no matches after discarding the superseded test run that printed temporary install tokens.
- SpecKiwi: `validate --json` errors 0; existing `SRS-W072` warning remains. `links check --json` reported the existing `IR-AUDIT-004` invalid issue reference and no new issue-84 link defect.
- SRS status/evidence promotion, commit, and GitHub mutation were intentionally not performed before independent review.
