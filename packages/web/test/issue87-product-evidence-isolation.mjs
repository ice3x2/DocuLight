import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue87');
const fixedPaths = ['browser-matrix', 'browser-green.txt', 'green-evidence-manifest.json'];

function identity(relative) {
  const target = path.join(evidenceRoot, relative);
  const result = {};
  const visit = (current, name) => {
    const info = fs.lstatSync(current);
    if (info.isDirectory()) {
      result[`${name}/`] = 'directory';
      for (const child of fs.readdirSync(current).sort()) visit(path.join(current, child), `${name}/${child}`);
      return;
    }
    result[name] = createHash('sha256').update(fs.readFileSync(current)).digest('hex');
  };
  visit(target, relative);
  return result;
}

const before = Object.fromEntries(fixedPaths.map((entry) => [entry, identity(entry)]));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const product = spawnSync(process.execPath, [npmCli, 'run', 'test:browser:issue87-product'], {
  cwd: root,
  encoding: 'utf8',
});
if (product.status !== 0) {
  process.stdout.write(product.stdout);
  process.stderr.write(product.stderr);
  throw new Error(`product run exited ${product.status}`);
}
const after = Object.fromEntries(fixedPaths.map((entry) => [entry, identity(entry)]));
if (JSON.stringify(after) !== JSON.stringify(before)) {
  const changed = fixedPaths.filter((entry) => JSON.stringify(after[entry]) !== JSON.stringify(before[entry]));
  throw new Error(`ordinary product run changed fixed evidence: ${changed.join(', ')}`);
}
console.log('issue87 ordinary product run preserved fixed evidence identity');
