import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidenceDirectory, '../../../../..');
const gitResult = (...args) => {
  const result = spawnSync('git', args, { cwd: root });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
};
const gitText = (...args) => gitResult(...args).toString('utf8').trim();
const manifestPath = '.kiwi/sessions/newspaper-20260916/evidence/issue89/final-review-manifest.json';
const comparePaths = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const paths = gitText('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  .split(/\r?\n/).filter(Boolean).filter((entry) => entry !== manifestPath).sort(comparePaths);
const files = paths.map((entry) => ({
  path: entry,
  sha256: createHash('sha256').update(gitResult('show', `:${entry}`)).digest('hex'),
}));
const aggregateSha256 = createHash('sha256')
  .update(files.map(({ path: entry, sha256 }) => `${sha256}  ${entry}\n`).join(''))
  .digest('hex');
const manifest = {
  schema: 'doculight-review-manifest-v1',
  source: 'git-index',
  baseCommit: gitText('merge-base', 'HEAD', 'kiwi/orch/newspaper-20260916/integration'),
  branch: gitText('branch', '--show-current'),
  fileCount: files.length,
  aggregateSha256,
  files,
};
writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
