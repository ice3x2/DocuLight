import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue76');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');

const digest = (target) => {
  const hash = createHash('sha256');
  const visit = (current) => {
    const relative = path.relative(root, current).replaceAll('\\', '/');
    if (fs.statSync(current).isDirectory()) {
      for (const child of fs.readdirSync(current).sort()) visit(path.join(current, child));
      return;
    }
    hash.update(relative).update('\0').update(fs.readFileSync(current)).update('\n');
  };
  visit(target);
  return hash.digest('hex');
};

const fixed = [
  path.join(evidenceRoot, 'browser-matrix'),
  path.join(evidenceRoot, 'playwright-review7.txt'),
  path.join(evidenceRoot, 'final-review-manifest.json'),
].filter(fs.existsSync);
const before = Object.fromEntries(fixed.map((target) => [target, digest(target)]));
const product = spawnSync(process.execPath, [npmCli, 'run', 'test:browser:issue76-product', '--workspace', '@doculight/web'], {
  cwd: root,
  stdio: 'inherit',
});
if (product.status !== 0) process.exit(product.status ?? 1);
const after = Object.fromEntries(fixed.map((target) => [target, digest(target)]));
if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('ordinary product run changed fixed evidence identity');
console.log('issue76 ordinary product run preserved fixed evidence identity');
