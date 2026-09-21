import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue79-evidence-stage-'));
const destination = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue79/product-evidence');
const manifestPath = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue79/product-evidence-manifest.json');
const sourceFiles = [
  'docs/spec/00.index.md',
  'docs/spec/08.app-shell.srs.md',
  'packages/web/package.json',
  'packages/web/src/App.tsx',
  'packages/web/src/api/client.ts',
  'packages/web/src/shell/AppShell.tsx',
  'packages/web/src/shell/RelocationDialog.tsx',
  'packages/web/src/tree/DocumentTree.tsx',
  'packages/web/src/tree/tree-contract.ts',
  'packages/web/test/api-client.test.ts',
  'packages/web/test/screen-wiring.test.tsx',
  'packages/web/test/issue79-relocation-integration.test.tsx',
  'packages/web/test/issue79-relocation-transport.test.ts',
  'packages/web/test/issue79-relocation-product-check.mjs',
  'packages/web/test/issue79-relocation-product-runner.mjs',
  'packages/web/test/issue79-green-evidence-capture.mjs',
  '.kiwi/sessions/newspaper-20260916/evidence/issue79/astra-post-reconciliation-authorization.md',
  '.kiwi/sessions/newspaper-20260916/evidence/issue79/review-red-allowlist.json',
  '.kiwi/sessions/newspaper-20260916/evidence/issue79/review-red-raw.txt',
  '.kiwi/sessions/newspaper-20260916/evidence/issue79/final-independent-review.md',
];
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
  const manifestOnly = process.argv.includes('--manifest-only');
  if (!manifestOnly) {
    const result = spawnSync(process.execPath, [npmCli, 'run', 'test:browser:relocation79-product', '--workspace', '@doculight/web'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DOCULIGHT_ISSUE79_OUTPUT_DIR: staging },
    });
    if (result.status !== 0) throw new Error(`issue79 product evidence run exited ${result.status}`);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    for (const file of fs.readdirSync(staging)) fs.copyFileSync(path.join(staging, file), path.join(destination, file));
  }
  const files = fs.readdirSync(destination).sort();
  if (!files.includes('browser-observation.json') || !files.includes('persistence.json')) throw new Error('issue79 evidence incomplete');
  const matrix = JSON.parse(fs.readFileSync(path.join(destination, 'browser-observation.json'), 'utf8'));
  if (matrix.matrixCount !== 12 || matrix.forcedColorsCount !== 2) throw new Error('staged issue79 browser matrix incomplete');
  const manifest = {
    requirementId: 'IR-SHELL-011',
    capturedAt: new Date().toISOString(),
    files: files.map((file) => ({
      path: `product-evidence/${file}`,
      sha256: sha256(path.join(destination, file)),
    })),
    sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha256(path.join(root, file))])),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
