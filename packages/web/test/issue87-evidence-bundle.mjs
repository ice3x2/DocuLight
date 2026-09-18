import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_FILES = [
  'package.json', 'packages/web/package.json',
  'packages/server/test/http/retention-impact.test.ts',
  'packages/web/test/issue87-retention-impact.test.tsx',
  'packages/web/test/issue87-retention-impact-product-runner.mjs',
  'packages/web/test/issue87-retention-impact-product-check.mjs',
  'packages/web/test/issue87-red-evidence-runner.mjs',
  'packages/web/test/issue87-red-evidence-contract.mjs',
  'packages/web/test/issue87-evidence-bundle.mjs',
  'packages/web/test/issue87-owned-child-grace.mjs',
  'packages/web/test/issue87-red-runner-contract.test.mjs',
  'packages/web/test/issue87-red-allowlist.json',
];
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const sourceHashes = (root) => Object.fromEntries(SOURCE_FILES.map((file) => [file, sha256(fs.readFileSync(path.join(root, file)))]));

export function buildEvidenceDocument(manifest) {
  const sourceRows = Object.entries(manifest.sourceHashes).map(([file, hash]) => `- Source SHA-256 \`${hash}\`: \`${file}\``).join('\n');
  return `# Issue 87 TDD RED evidence

- Requirement: \`FR-CONFIRM-024\`
- Integration HEAD: \`${manifest.head}\`
- Raw result identities and exact structured failure contracts: \`red-evidence-manifest.json\` (SSOT)
${sourceRows}
- Capture command: \`npm run test:issue87:red-evidence\`
- Server RED: 61 failed, 5 passed, 66 total; every failed test ID, error type, and core message matches the checked-in allowlist.
- Web RED: 13 failed, 0 passed, 13 total; every failed test ID, error type, and core message matches the checked-in allowlist.
- Browser RED: server/web builds and isolated fixture completed, then the only failure was the 30,000 ms response timeout for \`POST /api/settings/retention-impact\`.
- All reports require exit code 1, null signal, no runner timeout, and zero secondary process, cleanup, or aggregate errors.
- IPC invariant failures preserve the original error, allow bounded natural Playwright cleanup, and terminate only the owned checker after grace expiry.
- Product source files remained unchanged while these RED tests and evidence were authored.
`;
}

export function verifyEvidenceBundle(evidenceUrl) {
  const evidenceRoot = fileURLToPath(evidenceUrl);
  const root = path.resolve(evidenceRoot, '../../../../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'red-evidence-manifest.json'), 'utf8'));
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (manifest.head !== currentHead) {
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', manifest.head, currentHead], { cwd: root });
    const allowed = new Set([
      ...Object.values(manifest.reports).map((report) => report.file),
      '.kiwi/sessions/newspaper-20260916/evidence/issue87/red-evidence-manifest.json',
      '.kiwi/sessions/newspaper-20260916/evidence/issue87/red-evidence.md',
    ]);
    const changed = execFileSync('git', ['diff', '--name-only', `${manifest.head}..${currentHead}`], { cwd: root, encoding: 'utf8' })
      .trim().split(/\r?\n/).filter(Boolean);
    if (ancestry.status !== 0 || changed.length === 0 || changed.some((file) => !allowed.has(file))) throw new Error('evidence HEAD mismatch');
  }
  if (JSON.stringify(manifest.sourceHashes) !== JSON.stringify(sourceHashes(root))) throw new Error('evidence source hash mismatch');
  for (const report of Object.values(manifest.reports)) {
    if (sha256(fs.readFileSync(path.join(root, report.file))) !== report.sha256) throw new Error(`raw report hash mismatch: ${report.file}`);
  }
  if (fs.readFileSync(path.join(evidenceRoot, 'red-evidence.md'), 'utf8') !== buildEvidenceDocument(manifest)) throw new Error('evidence markdown mismatch');
  return true;
}
