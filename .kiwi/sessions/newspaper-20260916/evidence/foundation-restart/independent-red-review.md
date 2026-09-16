# Independent RED test review

Date: 2026-09-16
Baseline: `25cd20d512183230451fed63e9ecaca756d1fbdb` (product foundation remains absent)
Scope: issues #43/#44; `IR-SHELL-006` AC-1, AC-3, AC-4, AC-7, AC-8; `CON-ARCH-004`; `IR-EDITOR-001`

## Verdict

**PASS — the corrected tests are suitable as the frozen implementation gate.**

The reviewer did not author or modify these tests. The implementation worker is separate from both the test author and this reviewer.

## Discard boundary

- The four tracked product files named by the restart decision were byte-identical to the pre-foundation baseline after discard.
- Every rejected foundation product path was absent.
- The new browser fixture rendered native controls successfully, so its red came from computed style, geometry, focus, and state mismatches rather than a missing stylesheet/module abort.
- The production build succeeded before the distribution test failed, so missing dependency pins, licenses, notice material, and connected newspaper CSS are genuine artifact failures.

## Corrected findings

The first review found two test defects. Both are resolved without weakening the contract:

1. The fixture now separates a normal input from an `aria-invalid` input. It requires the normal `#7A7B71` boundary and the invalid `#963F38` danger boundary. It also checks the error description link, corrective text, and a visible non-color `!` indicator. Contrast and composition checks retain the invalid danger state.
2. The shadcn assertion freezes the complete 1,063-byte official `shadcn@4.21.0` MIT license and its SHA-256 (`1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f`). It requires exact distributed bytes plus `shadcn@4.21.0` and `MIT` provenance in the notice. An empty or arbitrary license file cannot pass.

## Objective RED results

- Component command: `cd packages/web && npx vitest run test/newspaper-foundation.test.tsx` — exit 1 at the missing public component barrel. The existing component contract remains genuinely red.
- Browser command: `cd packages/web && node test/newspaper-foundation-styles.mjs` — exit 1 with 23 failed assertions across the three required unzoomed viewports and the explicitly labelled 640×360 applicability simulation. Normal/invalid boundaries, colors, geometry, contrast, hover, focus, and IME-state styling are red. Long-Korean overflow and basic activation prove the fixture is usable.
- Build command: `npm run build --workspace @doculight/web` — exit 0.
- Artifact command: `cd packages/web && node test/newspaper-foundation-dist.mjs` — exit 1 with 17 failed assertions. The build output lacks the exact pins, complete licenses/notices, shadcn provenance, and connected foundation CSS.

The 640×360 case is responsive applicability coverage only. It is not accepted as actual desktop-browser 200% zoom proof; real zoom remains a green-stage acceptance obligation.

## Frozen test identities

These values match `frozen-test-hashes.json` at review time:

| Path | SHA-256 |
| --- | --- |
| `packages/web/test/newspaper-foundation.test.tsx` | `51EDCABD7D55D57D1D39333987D22898E7FEEC612C123D3C654A9949B43F825A` |
| `packages/web/test/newspaper-foundation-fixture.html` | `CEF6D9E43D1FB6FBA7C59176E38833A11990A7DFB3940B0AB7F4AD2696EB4442` |
| `packages/web/test/newspaper-foundation-styles.mjs` | `6D9864FA6EEB54A7A1A65055FDBF3D052461E7133CB4C0A485D89C080DBF5CF3` |
| `packages/web/test/newspaper-foundation-dist.mjs` | `367A794B2F26873E7972F297D9002DE38BBA099FE02C26A344BDEA13AAA89FC7` |

Any later hash change requires a fresh independent test review before those tests can serve as the #43/#44 gate.
