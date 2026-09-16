# Independent foundation implementation review

Date: 2026-09-17
Implementation scope: GitHub #43/#44; `IR-SHELL-006` AC-1, AC-3, AC-4, AC-7, AC-8; `CON-ARCH-004`; `IR-EDITOR-001`

## Final verdict

**PASS — no Critical, High, Medium, or Low findings remain for #43/#44.**

The reviewer did not author or fix product code or frozen tests.

## Resolved finding — actual `Field` error marker

The initial implementation connected the label, description, error text and `aria-invalid`, but omitted the required non-color error marker. The frozen browser fixture inserted its own marker, so that fixture could not prove the shipped `Field` behavior.

A separate test-first repair rendered the real `Field` and `Input`. Before the product change, its marker assertion failed with count 0 while value, description and focus assertions already passed. The product now renders one visible `!` marker with `aria-hidden="true"` outside the error message node referenced by `aria-describedby`.

Independent command: `node packages/web/test/newspaper-field-component-check.mjs --phase=independent-review`.

Independent result: **PASS 4/4**. The fixture imported the shipped components, preserved `Kept value`, found exactly one visible accessibility-hidden marker, read the exact help/error text without marker contamination, and reached the input by keyboard with a 2px outline and 2px separation. The four frozen foundation test hashes remained byte-identical.

## Verified facts that do not waive the finding

- All four frozen foundation test SHA-256 values matched `evidence/foundation-restart/frozen-test-hashes.json` during review.
- The fresh component suite passed 4/4; the frozen browser suite passed every assertion at 1280×720, 1440×900, 1920×1080, and its explicitly labelled 640×360 responsive applicability case.
- A clean production build passed, and the distribution test passed every assertion.
- `packages/web/dist` contains the complete license bytes for class-variance-authority, clsx, tailwind-merge, tailwindcss, `@tailwindcss/vite`, and shadcn. Independent SHA-256 comparisons matched each source file byte-for-byte. The human-readable notice is inside `dist`.
- The exact dependency pins match the frozen contract. Tailwind theme/utilities are imported without Preflight. Raw palette values are centralized in `palette.css`; component rules use semantic tokens.
- The product entry point imports the new shared stylesheet and preserves the shell/editor stylesheet imports.
- Web Vitest passed 59 files / 664 tests. Editor Vitest passed 253 tests with 1 skipped. Root typecheck and build passed.
- Actual Chromium 200% evidence is valid: `chrome.tabs.getZoom` changed 1→2, the outer window stayed 1441×901, the layout viewport changed 1440×814→720×407, DPR changed 1.25→2.5, CSS `zoom` remained 1/1, and the measured fixture had no horizontal page overflow. The automation used a temporary full-Chromium extension, not CSS zoom, viewport emulation, or device-scale emulation.
- The editor browser aggregate reached the pre-existing math geometry failure after Mermaid 12/12, table 4/4, drift 7/7, and tag 2/2. Math remained at the known 3/4 exponent-position failure; no editor product source was changed in this slice.

## Independent authenticated product check

The reviewer launched a fresh isolated server/database/docs fixture on port 3417 and the real web application on port 3399 with its API proxy pointed at that fixture. Generated credentials stayed in the temporary fixture metadata and were not printed.

Command: `npm run test:browser:styles --workspace @doculight/web`

Result: **PASS 3/3** on the authenticated product screen:

- tag chip computed background and radius;
- editor decoration, inline-preview and math style rules loaded through the product entry point;
- KaTeX font and the collapsed MathML copy geometry.

Raw output: `independent-auth-product-styles.log`.

Both temporary servers were stopped. Ports 3399 and 3417 were verified clear.

## Final identities

`independent-source-hashes.json` records SHA-256 for every #43/#44 product source, package/lock/config entry, and the added actual-component fixture at final review time. Key identities are:

- `packages/web/src/components/ui/field.tsx`: `41483675BBAD8E376B5EBD51EC17508DDFE42A3E21616C7426D65E49955E7D7F`
- `packages/web/test/newspaper-field-component-fixture.html`: `E9E161077A9ABA8FE0592281E1D8240D03F1D76A263F52C6C9EA939EFB534A80`
- `packages/web/test/newspaper-field-component-fixture.tsx`: `7B7E2496811A7DD747201982EF79267FD271CDA7B61A32479CADB970108EAB3C`
- `packages/web/test/newspaper-field-component-check.mjs`: `1CF725B4F9962DD34274EA181F8B1CEAABED21A51278EE65BF98878863EEDD56`

The independent actual-component run wrote `foundation-field-fix/independent-review-actual-field.log` and its screenshot. Together with the authenticated product 3/3 result, exact-byte distribution licenses, valid actual 200% Chromium evidence, frozen red-to-green tests, and passing regressions described above, this closes the #43/#44 implementation review gate.
