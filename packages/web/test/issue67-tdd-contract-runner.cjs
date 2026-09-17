const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const outputFlag = process.argv.indexOf('--output');
if (outputFlag < 0 || !process.argv[outputFlag + 1]) throw new Error('--output is required');
const outputPath = path.resolve(root, process.argv[outputFlag + 1]);
const evidenceRoot = path.dirname(outputPath);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required');
const commands = [
  ['npm test -- --run test/user-roster-register.test.tsx test/signup-approval.test.tsx test/roster.test.tsx test/settings-categories.test.tsx', ['test', '--', '--run', 'test/user-roster-register.test.tsx', 'test/signup-approval.test.tsx', 'test/roster.test.tsx', 'test/settings-categories.test.tsx']],
  ['npm run test:browser:principal67', ['run', 'test:browser:principal67']],
];
const startedAt = new Date().toISOString();
const contractFiles = [
  'test/issue67-tdd-contract-runner.cjs',
  'test/issue67-principal-browser-check.cjs',
  'test/issue67-principal-fixture.tsx',
  'test/issue67-principal-fixture.html',
  'test/user-roster-register.test.tsx',
  'test/signup-approval.test.tsx',
  'test/roster.test.tsx',
  'test/settings-categories.test.tsx',
];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(webRoot, file))).digest('hex');
const productDiff = spawnSync('git', ['diff', '--numstat', '--', 'packages/web/src/principal/UserRoster.tsx', 'packages/web/src/principal/SignupApproval.tsx', 'packages/web/src/styles/index.css'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (productDiff.status !== 0) throw productDiff.error ?? new Error(productDiff.stderr);
const chunks = [
  `ISSUE67_TDD_STARTED_AT_UTC=${startedAt}\nWORKDIR=${webRoot}\n`,
  `PRODUCT_TRACKED_DIFF_NUMSTAT_BEGIN\n${productDiff.stdout}PRODUCT_TRACKED_DIFF_NUMSTAT_END\n`,
  `PRINCIPAL_CSS_EXISTS=${fs.existsSync(path.join(webRoot, 'src/styles/principal.css'))}\n`,
  'CONTRACT_SHA256_BEGIN\n',
  ...contractFiles.map((file) => `${sha256(file)}  ${file}\n`),
  'CONTRACT_SHA256_END\n',
];
let failed = false;
for (const [display, args] of commands) {
  const commandStartedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: webRoot, encoding: 'utf8', env: process.env, windowsHide: true });
  chunks.push(`\nCOMMAND_STARTED_AT_UTC=${commandStartedAt}\nCOMMAND=${display}\n`);
  chunks.push(result.stdout ?? '', result.stderr ?? '', result.error ? `${result.error.stack ?? result.error.message}\n` : '');
  chunks.push(`COMMAND_FINISHED_AT_UTC=${new Date().toISOString()}\nEXIT_CODE=${result.status ?? 1}\n`);
  if (result.status !== 0) failed = true;
}
const runtimePassword = (salt) => Array.from(
  { length: 16 },
  (_, index) => String.fromCharCode(65 + ((index * 7 + salt) % 26)),
).join('');
const generatedPasswords = [1, 2, 3, 4, 5].flatMap((salt) => [runtimePassword(salt), ` ${runtimePassword(salt)} `]);
const legacyFixturePasswords = [
  ['sec', 'ret'].join(''),
  [' fixture', ' secret '].join(''),
  ['masked', ' fixture'].join(''),
  ['persistence', ' fixture'].join(''),
  [' raw', ' password '].join(''),
];
const evidenceFiles = [];
const collectFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(target);
    else if (path.resolve(target) !== outputPath) evidenceFiles.push(target);
  }
};
collectFiles(evidenceRoot);
const buffers = [...evidenceFiles.map((file) => fs.readFileSync(file)), Buffer.from(chunks.join(''), 'utf8')];
const countMatches = (values) => buffers.reduce(
  (total, buffer) => total + values.reduce((count, value) => count + (buffer.includes(Buffer.from(value, 'utf8')) ? 1 : 0), 0),
  0,
);
chunks.push(`\nPRIVACY_SCAN_FILES=${evidenceFiles.length}\n`);
chunks.push(`PRIVACY_GENERATED_PASSWORD_MATCHES=${countMatches(generatedPasswords)}\n`);
chunks.push(`PRIVACY_LEGACY_LITERAL_MATCHES=${countMatches(legacyFixturePasswords)}\n`);
chunks.push(`\nISSUE67_TDD_FINISHED_AT_UTC=${new Date().toISOString()}\nRESULT=${failed ? 'FAIL' : 'PASS'}\n`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, chunks.join(''), 'utf8');
process.stdout.write(chunks.join(''));
process.exitCode = failed ? 1 : 0;
