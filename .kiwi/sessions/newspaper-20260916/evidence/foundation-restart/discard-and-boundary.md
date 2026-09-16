# Exact discard and boundary record

All resolved targets were checked under `C:\Work\git\DocuLight2.0` before mutation. `git cat-file -e d8a9603:<path>` confirmed every removed file below was absent at the baseline. No directory was recursively deleted.

Restored from `d8a960360e18b9483c727d6ff37290d113338a5b`:

- `package-lock.json`
- `packages/web/package.json`
- `packages/web/vite.config.ts`
- `packages/web/src/main.tsx`

Post-restore check:

```text
git diff --exit-code d8a960360e18b9483c727d6ff37290d113338a5b -- package-lock.json packages/web/package.json packages/web/vite.config.ts packages/web/src/main.tsx
exit 0
```

Removed as exact literal files after baseline-absence checks:

- `packages/web/THIRD_PARTY_NOTICES.md`
- `packages/web/components.json`
- `packages/web/src/lib/utils.ts`
- `packages/web/src/components/ui/index.ts`
- `packages/web/src/components/ui/button.tsx`
- `packages/web/src/components/ui/input.tsx`
- `packages/web/src/components/ui/textarea.tsx`
- `packages/web/src/components/ui/select.tsx`
- `packages/web/src/components/ui/field.tsx`
- `packages/web/src/styles/base.css`
- `packages/web/src/styles/components.css`
- `packages/web/src/styles/index.css`
- `packages/web/src/styles/palette.css`
- `packages/web/src/styles/tokens.css`
- `packages/web/src/styles/themes/newspaper-light.css`
- `packages/web/test/newspaper-foundation-fixture.html` (rejected artifact; later replaced by a fresh contract fixture)
- `packages/web/test/newspaper-foundation-fixture.tsx`
- `packages/web/test/newspaper-foundation-styles.mjs` (rejected artifact; later replaced by a fresh contract test)

Preserved:

- `packages/web/test/newspaper-foundation.test.tsx`, then extended without weakening its three existing assertions.
- all `docs/spec/**`, `docs/decision/**`, old evidence, dark artifacts/evidence, unrelated source/test changes, and `.kiwi/sessions/newspaper-20260916/state.json`.

Final boundary check reported `False` for every discarded product implementation path and exit 0 for the four tracked baseline comparisons.
