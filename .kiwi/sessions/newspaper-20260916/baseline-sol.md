# Independent baseline verification (Sol medium)

- Captured: 2026-09-16T22:55:56+09:00
- Branch: `kiwi/orch/newspaper-20260916/integration`
- Revision at deterministic baseline start: `313616dab36cd393290c8d353cd1b2c5e9241857`
- Existing DocuLight listeners before launch: none on 3399, 3400, 3401, or 3440
- Full command logs: `%TEMP%\doculight-sol-baseline-20260916\`

## Deterministic checks

- `npm run typecheck`: exit 0. Editor, server, and web TypeScript checks passed.
- `npm test`: exit 0.
  - editor: 21 files, 253 passed, 1 skipped
  - server: 138 files, 1429 passed
  - web: 58 files, 660 passed
  - total: 217 files, 2342 passed, 1 skipped
- The web run printed a `TypeError: URL is not a constructor` stack from happy-dom while exercising `DocumentSurface.downloadBody`; Vitest nevertheless reported all web files/tests passing and returned exit 0.

## Authentic browser checks

The editor demo was launched only for this check at `http://localhost:3401/` with:

`npm run dev --workspace @doculight/editor -- --port 3401 --strictPort`

Then:

`EDITOR_URL=http://localhost:3401/ npm run test:browser:all --workspace @doculight/editor`

Result: exit 1. Earlier groups passed before fail-fast stopped the suite:

- Mermaid/browser: 12/12 passed
- table reveal: 4/4 passed (one non-gating observation did not reproduce)
- heightmap drift: 7/7 passed
- tag chip: 2/2 passed
- math: 3/4 passed
- inline preview: not run because the aggregate script stops at first failure

Failure, reproduced by an isolated rerun of `test:browser:math`:

- `AC-3 위첨자가 기준선 위로 쌓인다`
- measured exponent top 163 and baseline glyph top 163; expected exponent above baseline glyph

The temporary editor server was stopped and left no listener on 3401. The editor check writes a screenshot at an ignored test path; it produced no Git status entry.

The full web browser suite is authentic Chromium coverage, but it is stateful by design: its harness logs in, creates test documents, updates documents, and cleans them up; individual auth/ACL/trash checks also create users, change passwords/signup mode, alter ACLs, or exercise trash. It should run against an isolated `DOCULIGHT_DATA_DIR` and dedicated test credentials, never a personal or production dataset. No web browser suite was run in this baseline because no isolated server fixture had yet been provisioned.

## Browser-control and independent verifier capability

- The supported in-app browser connection was retried once and rejected before any browser operation because the runtime request metadata lacked required `sandboxPolicy`. No in-app visual inspection was possible through that surface.
- Repository Playwright/Chromium scripts remain available and ran successfully as described above.
- Codex CLI 0.154.0 accepts `--model gpt-5.6-sol -c model_reasoning_effort='medium'` in noninteractive mode. A minimal ephemeral, read-only smoke returned `SOL_SMOKE_OK` with model `gpt-5.6-sol`, reasoning effort `medium`, approval `never`, sandbox `read-only`. This is suitable for an independent verifier when collaboration slots are exhausted.
