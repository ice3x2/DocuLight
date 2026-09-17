const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const outputFlag = process.argv.indexOf('--output');
if (outputFlag < 0 || !process.argv[outputFlag + 1]) throw new Error('--output is required');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required');
const commands = [
  ['npm test -- --run', ['test', '--', '--run']],
  ['npm run typecheck', ['run', 'typecheck']],
];
const chunks = [`ISSUE67_VALIDATION_STARTED_AT_UTC=${new Date().toISOString()}\nWORKDIR=${webRoot}\n`];
let failed = false;
for (const [display, args] of commands) {
  chunks.push(`\nCOMMAND_STARTED_AT_UTC=${new Date().toISOString()}\nCOMMAND=${display}\n`);
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: webRoot, encoding: 'utf8', env: process.env, windowsHide: true });
  chunks.push(result.stdout ?? '', result.stderr ?? '', result.error ? `${result.error.stack ?? result.error.message}\n` : '');
  chunks.push(`COMMAND_FINISHED_AT_UTC=${new Date().toISOString()}\nEXIT_CODE=${result.status ?? 1}\n`);
  if (result.status !== 0) failed = true;
}
chunks.push(`\nISSUE67_VALIDATION_FINISHED_AT_UTC=${new Date().toISOString()}\nRESULT=${failed ? 'FAIL' : 'PASS'}\n`);
const outputPath = path.resolve(root, process.argv[outputFlag + 1]);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, chunks.join(''), 'utf8');
process.stdout.write(chunks.join(''));
process.exitCode = failed ? 1 : 0;
