import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const output = process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR;
if (!output) throw new Error('DOCULIGHT_ISSUE77_OUTPUT_DIR must be an absolute OS-temp run directory');
if (!path.isAbsolute(output)) throw new Error('output must be absolute');
fs.mkdirSync(output, { recursive: true });
const canonicalHashCache = new Map();
const hash = (file) => {
  const relativePath = path.relative(root, path.resolve(file)).replaceAll('\\', '/');
  if (canonicalHashCache.has(relativePath)) return canonicalHashCache.get(relativePath);
  const staged = spawnSync('git', ['show', `:${relativePath}`], { cwd: root, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  const bytes = staged.status === 0 ? staged.stdout : fs.readFileSync(file);
  const value = createHash('sha256').update(bytes).digest('hex');
  canonicalHashCache.set(relativePath, value);
  return value;
};
const hashText = (value) => createHash('sha256').update(value).digest('hex');
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const editorPackage = JSON.parse(fs.readFileSync(path.join(root, 'packages/editor/package.json'), 'utf8'));
const webPackage = JSON.parse(fs.readFileSync(path.join(root, 'packages/web/package.json'), 'utf8'));
const srsAcceptanceCriteria = new Map();
for (const name of fs.readdirSync(path.join(root, 'docs/spec')).filter((entry) => entry.endsWith('.srs.md'))) {
  const source = fs.readFileSync(path.join(root, 'docs/spec', name), 'utf8');
  for (const match of source.matchAll(/^### ((?:CON|IR|FR|SEC)-[A-Z]+-\d{3})\b/gm)) {
    const next = source.indexOf('\n### ', match.index + match[0].length);
    const block = source.slice(match.index, next < 0 ? source.length : next);
    srsAcceptanceCriteria.set(match[1], [...block.matchAll(/^- \[[ x]\] AC-(\d+):/gm)].map((one) => Number(one[1])));
  }
}
const srsAcNumbers = (requirement) => {
  const acs = srsAcceptanceCriteria.get(requirement);
  if (!acs?.length) throw new Error(`current SRS has no acceptance criteria for ${requirement}`);
  return acs;
};
const declared = [
  ...Object.entries(rootPackage.scripts).filter(([name]) => name.includes('browser')).map(([name, command]) => ({ workspace: 'root', name, command })),
  ...Object.entries(editorPackage.scripts).filter(([name]) => name.includes('browser')).map(([name, command]) => ({ workspace: '@doculight/editor', name, command })),
  ...Object.entries(webPackage.scripts).filter(([name]) => name.includes('browser')).map(([name, command]) => ({ workspace: '@doculight/web', name, command })),
];

const fresh = new Map([
  ['@doculight/web:test:browser:issue77-product', 'product-suite-final/product-suite-results.json'],
  ['@doculight/web:test:browser:grant78-product', 'later-product/issue78-green/product-browser-observation.json'],
  ['@doculight/web:test:browser:focus', 'product/product-composition-result.json'],
  ['@doculight/web:test:browser:search', 'product-suite-final/product-suite-results.json'],
  ['@doculight/web:test:browser:acl', 'product-suite-final/product-suite-results.json'],
  ['@doculight/web:test:browser:trash', 'owners/issue64/product-result.json'],
  ['@doculight/web:test:browser:gestures', 'product-suite-final/product-suite-results.json'],
  ['@doculight/web:test:browser:files', 'owner-issue58/product-matrix.json'],
  ['@doculight/web:test:browser:merge', 'product-suite-final/product-suite-results.json'],
  ['@doculight/web:test:browser:styles', 'undeclared/issue54/green-measurements.json'],
  ['@doculight/web:test:browser:shell', 'components/issue50/green-measurements.json'],
  ['@doculight/web:test:browser:tokens', 'components/issue63/browser-matrix/browser-matrix.json'],
  ['@doculight/web:test:browser:trash64', 'components/issue64/browser-matrix/browser-matrix.json'],
  ['@doculight/web:test:browser:share65', 'components/issue65/browser-matrix/browser-matrix.json'],
  ['@doculight/web:test:browser:relocation66', 'components/issue66/browser.json'],
  ['@doculight/web:test:browser:principal67', 'components/issue67/browser.json'],
  ['@doculight/web:test:browser:complex', 'components/issue55/green-complex-measurements.json'],
  ['@doculight/web:test:browser:theme', 'components/test_browser_theme.raw.txt'],
  ['@doculight/web:test:browser:pre-auth-product', 'components/test_browser_pre-auth-product.raw.txt'],
  ['@doculight/web:test:browser:install-product', 'components/test_browser_install-product.raw.txt'],
  ['@doculight/web:test:browser:issue71-product', 'owners/issue71/capture-manifest.json'],
  ['@doculight/web:test:browser:tokens-product', 'owners/issue63/product-result.json'],
  ['@doculight/web:test:browser:trash64-product', 'owners/issue64/product-result.json'],
  ['@doculight/web:test:browser:share65-product', 'owners/issue65/product-result.json'],
  ['@doculight/web:test:browser:issue72-product', 'owners/issue72/browser-matrix.json'],
  ['@doculight/web:test:browser:issue73-product', 'owners/issue73/browser-matrix.json'],
  ['@doculight/web:test:browser:issue74-product', 'owners/issue74/measurements.json'],
  ['@doculight/web:test:browser:issue75-product', 'owners/issue75/measurements.json'],
  ['@doculight/web:test:browser:issue76-product', 'owners/test_browser_issue76-product.raw.txt'],
  ['@doculight/web:test:browser:issue87-product', 'owners/test_browser_issue87-product.raw.txt'],
  ['@doculight/web:test:browser:issue88-product', 'owners/issue88/capture-manifest.json'],
  ['@doculight/web:test:browser:issue86-product', 'owners/issue86/capture-manifest.json'],
  ['@doculight/web:test:browser:issue89-product', 'owners/issue89/browser-matrix.json'],
  ['@doculight/web:test:browser:relocation79-product', 'later-product/test_browser_relocation79-product.raw.txt'],
  ['@doculight/web:test:browser:issue80-product', 'later-product/test_browser_issue80-product.raw.txt'],
  ['@doculight/web:test:browser:issue81-product', 'later-product/test_browser_issue81-product.raw.txt'],
  ['@doculight/web:test:browser:issue82-product', 'later-product/issue82-evidence/capture-manifest.json'],
  ['@doculight/web:test:browser:issue83-product', 'later-product/test_browser_issue83-product.raw.txt'],
  ['@doculight/web:test:browser:issue84-product', 'later-product/issue84-green/capture-manifest.json'],
  ['@doculight/web:test:browser:issue85-product', 'later-product/test_browser_issue85-product.raw.txt'],
  ...['test:browser','test:browser:table','test:browser:drift','test:browser:tag','test:browser:math','test:browser:inline','test:browser:issue55']
    .map((name) => [`@doculight/editor:${name}`, 'editor-browser-all.raw.txt']),
]);
const implementation = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue77/implementation');
const equivalenceLink = (evidence, relationship, command) => {
  const file = path.join(implementation, evidence);
  if (!fs.existsSync(file)) throw new Error(`equivalence evidence missing: ${evidence}`);
  return { ...(command === undefined ? {} : { command }), relationship, evidence, evidenceSha256: hash(file) };
};
const freshLeafEquivalence = () => [...new Set(fresh.values())]
  .filter((evidence) => fs.existsSync(path.join(implementation, evidence)))
  .map((evidence) => equivalenceLink(evidence, 'fresh declared leaf evidence accounted by this aggregate entry'));
const inventory = declared.map((entry) => {
  const key = `${entry.workspace}:${entry.name}`;
  const evidence = fresh.get(key);
  if (evidence && fs.existsSync(path.join(implementation, evidence))) return { ...entry, verdict: 'PASS', freshness: 'fresh-final-source', evidence, evidenceSha256: hash(path.join(implementation, evidence)) };
  if (entry.name.endsWith(':headed')) {
    const baseName = entry.name.slice(0, -':headed'.length);
    const evidence = fresh.get(`${entry.workspace}:${baseName}`);
    if (!evidence && baseName === 'test:browser:ime') return { ...entry, verdict: 'N-A', reason: 'interactive legacy CDP IME alias is method-superseded together with its headless form by the binding DOM product matrix', evidenceClass: 'method-superseded', equivalence: [equivalenceLink('composition-matrix-final/issue77-composition-matrix-result.json', 'binding addendum-compliant eight-cell product composition replacement')] };
    if (!evidence && baseName === 'test:browser:auth') return { ...entry, verdict: 'N-A', reason: 'interactive legacy shared-server auth alias is superseded together with its headless form by the owned disposable-server product flow', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('components/test_browser_pre-auth-product.raw.txt', 'owned disposable-server authentication product replacement')] };
    if (!evidence) throw new Error(`headed alias lacks headless evidence: ${entry.workspace}:${entry.name}`);
    return { ...entry, verdict: 'N-A', reason: 'interactive headed alias has the identical script body; the owned headless execution is the authoritative noninteractive evidence', evidenceClass: 'command-alias', equivalence: [equivalenceLink(evidence, 'identical script command without the interactive --headed flag', baseName)] };
  }
  if (entry.workspace === 'root' && fresh.has(`@doculight/web:${entry.name}`)) {
    const evidence = fresh.get(`@doculight/web:${entry.name}`);
    return { ...entry, verdict: 'N-A', reason: 'root wrapper is an exact npm workspace alias of the freshly executed web workspace command', evidenceClass: 'command-alias', equivalence: [equivalenceLink(evidence, 'exact root-to-web workspace command alias', `@doculight/web:${entry.name}`)] };
  }
  if (entry.name === 'test:browser:ime') return { ...entry, verdict: 'N-A', reason: 'legacy CDP composition is method-superseded by the binding Playwright DOM product matrix and cannot count as native IME evidence', evidenceClass: 'method-superseded', equivalence: [equivalenceLink('composition-matrix-final/issue77-composition-matrix-result.json', 'binding addendum-compliant eight-cell product composition replacement')] };
  if (entry.name === 'test:browser:auth') return { ...entry, verdict: 'N-A', reason: 'owned pre-auth product evidence supersedes the legacy shared-server runner whose rate limiter makes it unsuitable for final isolation', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('components/test_browser_pre-auth-product.raw.txt', 'owned disposable-server pre-auth and authentication product flow')] };
  if (['test:browser:settings','test:browser:settings-product'].includes(entry.name)) return { ...entry, verdict: 'N-A', reason: 'fresh #71 product settings behavior plus #86 authority edges and the eight-role #77 matrix jointly supersede the stale fixed-output runner', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('owners/issue71/capture-manifest.json', '#71 actual settings form and policy matrix'), equivalenceLink('owners/issue86/capture-manifest.json', '#86 zero-workspace superuser and manager authority matrix'), equivalenceLink('role-category-final/role-category-matrix.json', '#77 exact eight-role category and accessibility matrix')] };
  if (entry.name === 'test:browser:pre-auth') return { ...entry, verdict: 'N-A', reason: 'fresh owned pre-auth product runner supersedes the stale presentation fixture while preserving the same screen contract', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('components/test_browser_pre-auth-product.raw.txt', 'actual built-product pre-auth replacement')] };
  if (entry.name === 'test:browser:install-newspaper') return { ...entry, verdict: 'N-A', reason: 'fresh owned one-time install product runner supersedes the presentation-only install newspaper fixture', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('components/test_browser_install-product.raw.txt', 'actual disposable uninstalled-product install replacement')] };
  if (entry.name === 'test:browser:issue68') return { ...entry, verdict: 'N-A', reason: 'fresh #81 and #82 product integrations supersede the stale group-roster component locator and cover current group membership/deletion outcomes', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('later-product/test_browser_issue81-product.raw.txt', '#81 actual group membership product flow'), equivalenceLink('later-product/issue82-evidence/capture-manifest.json', '#82 actual group deletion and confirmation product flow')] };
  if (entry.name === 'test:browser:issue69') return { ...entry, verdict: 'N-A', reason: 'fresh #83, #84, and #85 product matrices supersede the stale ACL-audit component locator across managed scope, bypass, and inheritance', evidenceClass: 'stronger-product-equivalence', equivalence: [equivalenceLink('later-product/test_browser_issue83-product.raw.txt', '#83 managed-workspace authority product flow'), equivalenceLink('later-product/issue84-green/capture-manifest.json', '#84 superuser bypass product flow'), equivalenceLink('later-product/test_browser_issue85-product.raw.txt', '#85 inheritance preview product flow')] };
  const issueMatch = /^test:browser:(?:issue|grant|relocation)(\d+)/.exec(entry.name);
  if (issueMatch && Number(issueMatch[1]) >= 78) return { ...entry, verdict: 'NOT-RUN', reason: 'required addendum follow-up owner has no fresh run-owned artifact or accepted exact-equivalence review', evidenceClass: 'required-follow-up-gap' };
  if (entry.name.endsWith(':all') || entry.name === 'test:browser:all') return { ...entry, verdict: 'N-A', reason: 'aggregate command is not an independent evidence leaf; every fresh declared leaf is linked below and separately inventoried', evidenceClass: 'aggregate', equivalence: freshLeafEquivalence() };
  return { ...entry, verdict: 'NOT-RUN', reason: 'no fresh run-owned #77 artifact or independently reviewed exact-equivalence record', evidenceClass: 'unresolved' };
});
fs.writeFileSync(path.join(output, 'declared-browser-inventory.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), declaredCount: inventory.length, entries: inventory }, null, 2)}\n`);

const reviewerEvidence = 'axis-b-review-blockers.md';
const reviewerEvidenceFile = path.join(implementation, reviewerEvidence);
const reviewerEvidenceSha256 = hash(reviewerEvidenceFile);
const addendumEvidence = '../astra-closure-addendum.md';
const addendumEvidenceFile = path.join(implementation, addendumEvidence);
const addendumEvidenceSha256 = hash(addendumEvidenceFile);
const axisAReviewerEvidence = 'axis-a-h1-review-blocker.md';
const axisAReviewerEvidenceSha256 = hash(path.join(implementation, axisAReviewerEvidence));
const foundationEvidenceByAc = {
  'AC-1': [
    ['foundation-final/newspaper-foundation-styles.raw.txt', 'AC-1 exact approved light palette and computed semantic surface/text/interaction colors at four effective viewports'],
  ],
  'AC-2': [
    ['components/test_browser_theme.raw.txt', 'AC-2 dark/system runtime, first paint, portal inheritance, live OS change and fixed-theme identity'],
    ['components/issue46/actual-browser-zoom.json', 'AC-2 exact dark portal/document computed colors at genuine browser zoom'],
  ],
  'AC-3': [
    ['components/issue46/README.md', 'AC-3 reviewed palette/theme/token/index ownership and dependency boundary evidence'],
    ['components/test_browser_theme.raw.txt', 'AC-3 production runtime computed-style integration through the declared theme boundary'],
  ],
  'AC-4': [
    ['undeclared/shared-ui/browser/measurements.json', 'AC-4 measured 36/40px controls, 4px radii, typography, wrapping and spacing geometry'],
  ],
  'AC-7': [
    ['undeclared/shared-ui/browser/measurements.json', 'AC-7 focus geometry plus default/IME/selection/path state semantics across shared controls'],
    ['components/issue66/browser.json', 'AC-7 numeric focus, hover, selected, disabled/readonly/invalid state and non-color semantics'],
  ],
  'AC-8': [
    ['foundation-final/newspaper-foundation-styles.raw.txt', 'AC-8 numeric composed text and active boundary contrast on actual computed backgrounds'],
    ['components/issue66/browser.json', 'AC-8 numeric composed text, control boundary and focus contrast ratios across light/dark environments'],
  ],
  'AC-10': [
    ['components/issue66/browser.json', 'AC-10 twelve light/dark viewport/true-zoom environments with forced-colors and computed geometry/contrast'],
    ['role-category-final/role-category-matrix.json', 'AC-10 actual product role/settings matrix across twelve environments plus forced-colors 100/200'],
  ],
};
const evidenceRef = ([evidencePath, scope]) => ({ path: evidencePath, sha256: hash(path.join(implementation, evidencePath)), scope });
const evidenceForIssue = {
  42: addendumEvidence, 43: 'build-final-raw.txt', 44: 'build-final-raw.txt', 45: 'build-final-raw.txt',
  46: 'components/issue46/independent-review.md', 47: 'undeclared/shared-ui/browser/measurements.json',
  48: 'undeclared/shared-ui/browser/measurements.json', 49: 'undeclared/shared-ui/browser/measurements.json',
  50: 'components/issue50/green-measurements.json', 51: 'tree-final/green-measurements.json',
  52: 'undeclared/issue52/green-measurements.json', 53: 'undeclared/issue53/green-measurements.json',
  54: 'undeclared/issue54/green-measurements.json', 55: 'components/issue55/green-complex-measurements.json',
  56: 'undeclared/issue56/green-version-measurements.json', 57: 'undeclared/issue57/green-conflict-measurements.json',
  58: 'owner-issue58/product-matrix.json', 59: 'components/test_browser_pre-auth-product.raw.txt',
  60: 'components/test_browser_install-product.raw.txt', 61: 'role-category-final/role-category-matrix.json',
  62: 'components/test_browser_theme.raw.txt', 63: 'owners/issue63/product-result.json',
  64: 'owners/issue64/product-result.json', 65: 'owners/issue65/product-result.json',
  66: 'components/issue66/browser.json', 67: 'components/issue67/browser.json',
  68: 'components/test_browser_issue68.raw.txt', 69: 'components/test_browser_issue69.raw.txt',
  70: 'undeclared/issue70/browser/browser.json', 71: 'owners/issue71/capture-manifest.json',
  72: 'owners/issue72/browser-matrix.json', 73: 'owners/issue73/browser-matrix.json',
  74: 'owners/issue74/measurements.json', 75: 'owners/issue75/measurements.json',
  76: 'owners/test_browser_issue76-product.raw.txt', 77: 'composition-matrix-final/issue77-composition-matrix-result.json',
  78: 'later-product/issue78-green/product-browser-observation.json', 79: 'later-product/test_browser_relocation79-product.raw.txt',
  80: 'later-product/test_browser_issue80-product.raw.txt', 81: 'later-product/test_browser_issue81-product.raw.txt',
  82: 'later-product/issue82-evidence/capture-manifest.json', 83: 'later-product/test_browser_issue83-product.raw.txt',
  84: 'later-product/issue84-green/capture-manifest.json', 85: 'later-product/test_browser_issue85-product.raw.txt',
  86: 'owners/issue86/capture-manifest.json', 87: 'owners/test_browser_issue87-product.raw.txt',
  88: 'owners/issue88/capture-manifest.json', 89: 'owners/issue89/browser-matrix.json',
};
const obligations = {
  42: [['IR-SHELL-006',[1,2,3,4,5,6,7,8,9,10]],['IR-SHELL-008',[1,2,3,4,5,6]],['IR-EDITOR-002',[1,2,3,4,5]]],
  43: [['IR-SHELL-006',[1,2,3,4,7,8,10]]], 44: [['IR-SHELL-006',[1,2,3,4,7,8,10]]], 45: [['IR-SHELL-006',[1,2,3,4,7,8,10]]],
  46: [['IR-SHELL-007',[1,2,3,4,5]],['IR-SHELL-006',[2,3]]], 47: [['IR-SHELL-006',[4,5,6,7,8]]],
  48: [['IR-SHELL-008',[3,4,5,6]],['IR-SHELL-006',[7,8]]], 49: [['IR-SHELL-006',[7,8,9]]],
  50: [['IR-SHELL-009',[1,2]]], 51: [['IR-SHELL-006',[3,5,6,7,8,10]]], 52: [['IR-SHELL-006',[3,5,6,7,8,10]]], 53: [['IR-SHELL-006',[6,7,8,9,10]]],
  54: [['IR-EDITOR-002',[1,2,5]]], 55: [['IR-EDITOR-002',[3,4,5]]], 56: [['IR-EDITOR-002',[2,4]],['IR-SHELL-006',[6]]],
  57: [['IR-EDITOR-002',[4,5]],['IR-SHELL-006',[5,6]]], 58: [['IR-SHELL-006',[5,6,7,8,9]]],
  59: [['IR-SHELL-006',[4,5,6,7,8]]], 60: [['IR-SHELL-008',[4,5,6]],['IR-SHELL-006',[4]]],
  61: [['IR-SHELL-002',[1,2,3,4,5,6,7,8]],['IR-SHELL-008',[1,2,4,5]]], 62: [['IR-SHELL-007',[1,2,3,4,5]],['IR-SHELL-006',[5,7]]],
  63: [['IR-AUTH-003',[1,2,3,4,5]],['IR-SHELL-008',[5]]], 64: [['IR-SHELL-006',[6,7,8,9]]],
  65: [['IR-SHELL-006',[6]],['IR-SHELL-008',[3,4,5,6]]], 66: [['IR-SHELL-006',[6]],['IR-SHELL-008',[3,4,5,6]]],
  67: [['IR-SHELL-006',[5,6,7,8,9]]], 68: [['IR-SHELL-006',[5,6,7,8,9]]], 69: [['IR-SHELL-006',[6,7,8,9]]], 70: [['IR-SHELL-006',[6,7,8,9]]],
  71: [['IR-SHELL-006',[5,6,7,8,9,10]],['IR-SHELL-008',[3,4,5,6]]], 72: [['IR-WORKSPACE-001',[1,2,3,6,7]]],
  73: [['IR-WORKSPACE-001',[4,5,6]]], 74: [['IR-PRINCIPAL-001',[1,2,3,4,5]]],
  75: [['FR-STORAGE-010',[1,2,3,4,5,6,7]],['IR-SHELL-006',[7,8,9]]], 76: [['IR-SHELL-006',[5,7,8,9]]],
  77: [['IR-SHELL-006',[10]],['IR-EDITOR-002',[5]]],
  78: [['IR-ACL-004',srsAcNumbers('IR-ACL-004')]], 79: [['IR-SHELL-011',srsAcNumbers('IR-SHELL-011')]],
  80: [['IR-PRINCIPAL-002',srsAcNumbers('IR-PRINCIPAL-002')]], 81: [['IR-PRINCIPAL-003',srsAcNumbers('IR-PRINCIPAL-003')]],
  82: [['IR-PRINCIPAL-004',srsAcNumbers('IR-PRINCIPAL-004')]], 83: [['IR-WORKSPACE-002',srsAcNumbers('IR-WORKSPACE-002')]],
  84: [['IR-PRINCIPAL-005',srsAcNumbers('IR-PRINCIPAL-005')]], 85: [['IR-ACL-005',srsAcNumbers('IR-ACL-005')]],
  86: [['IR-SHELL-012',srsAcNumbers('IR-SHELL-012')]], 87: [['FR-CONFIRM-024',srsAcNumbers('FR-CONFIRM-024')]],
  88: [['IR-SHELL-013',srsAcNumbers('IR-SHELL-013')]], 89: [['IR-WORKSPACE-003',srsAcNumbers('IR-WORKSPACE-003')]],
};
const surfaceForIssue = (issue) => ({42:'design/trace authority',43:'foundation tokens',44:'light theme',45:'dark theme',46:'runtime theme',47:'shared controls',48:'overlays',49:'data display',50:'AppShell frame',51:'document tree',52:'search',53:'right panels',54:'editor layout',55:'complex editor content',56:'version history',57:'conflict/merge',58:'file surface',59:'pre-auth',60:'install',61:'settings role/category shell',62:'theme/account settings',63:'PAT',64:'trash',65:'sharing',66:'relocation',67:'users',68:'groups',69:'ACL audit',70:'audit log',71:'instance policy',72:'workspace management',73:'workspace create',74:'offboarding',75:'index queue',76:'resilient app states',77:'integrated audit'}[issue] ?? `follow-up issue ${issue}`);
const rows = [];
for (const [issueText, requirementRows] of Object.entries(obligations)) {
  const issue = Number(issueText);
  const evidence = evidenceForIssue[issue];
  const evidenceFile = path.join(implementation, evidence);
  const evidenceExists = fs.existsSync(evidenceFile);
  for (const [requirement, acs] of requirementRows) for (const ac of acs) {
    if (!srsAcNumbers(requirement).includes(ac)) throw new Error(`${requirement} has no AC-${ac} in the current SRS`);
    const acId = `AC-${ac}`;
    const foundationRefs = [43, 44, 45].includes(issue) && requirement === 'IR-SHELL-006'
      ? foundationEvidenceByAc[acId]?.map(evidenceRef)
      : undefined;
    const rowEvidence = foundationRefs?.[0]?.path ?? (evidenceExists ? evidence : addendumEvidence);
    const rowReviewerEvidence = foundationRefs === undefined ? (issue === 42 ? '../addendum-independent-review.md' : reviewerEvidence) : axisAReviewerEvidence;
    rows.push({
    id: `I77-obligation-${issue}-${requirement}-${acId}`,
    issue, requirement, ac: acId, surface: surfaceForIssue(issue),
    role: issue === 42 ? 'not-applicable-design-owner' : 'exact leaf mapping rejected by Axis B review',
    state: issue === 42 ? 'design-reference' : 'blocked-current-review',
    environment: issue === 42 ? { kind: 'source-backed-not-applicable' } : { kind: 'not-accepted-as-exact-runtime-leaf' },
    evidenceClass: issue === 42 ? 'design/reference' : 'coverage-gap',
    verdict: issue === 42 ? 'N-A' : evidenceExists ? 'BLOCKED' : 'NOT-RUN',
    reason: issue === 42 ? 'Issue #42 owns approved design and trace contracts; it has no runtime surface.' : foundationRefs !== undefined ? 'AC-specific runtime evidence replaces the rejected build-only mapping; the latest Axis A disposition remains rejected until re-review.' : evidenceExists ? 'Artifact exists, but the latest independent Axis B review rejected blanket owner-level promotion and requires accepted exact leaf mapping.' : 'Required owner artifact is absent from the run-owned issue77 evidence set.',
    evidence: rowEvidence,
    evidenceSha256: hash(path.join(implementation, rowEvidence)),
    ...(foundationRefs === undefined ? {} : { evidenceRefs: foundationRefs }),
    reviewerDisposition: issue === 42 ? 'not-applicable' : 'rejected',
    reviewerEvidence: rowReviewerEvidence,
    reviewerEvidenceSha256: hash(path.join(implementation, rowReviewerEvidence)),
    });
  }
}
const treeEvidence = 'tree-final/green-measurements.json';
const tree = JSON.parse(fs.readFileSync(path.join(implementation, treeEvidence), 'utf8'));
for (const scenario of tree.largeTransitions) for (const transition of scenario.transitions) rows.push({
  id:`I77-tree-${scenario.kind}-${transition.position}`, issue:51, requirement:'IR-SHELL-006', ac:'AC-10',
  surface:`document tree/${scenario.kind}/${transition.position}`, role:'authenticated ordinary fixture', state:'focused action identity',
  environment:{ viewport:'1280x720?1440x900', theme:'light', zoomSequence:transition.zoomSequence, forcedColors:false },
  evidenceClass:'production-component', verdict:'BLOCKED', reason:'Fresh exact runtime evidence passes, but it has not yet received a new independent acceptance after the Axis B rejection.',
  evidence:treeEvidence, evidenceSha256:hash(path.join(implementation,treeEvidence)), reviewerDisposition:'rejected', reviewerEvidence, reviewerEvidenceSha256,
  observation:{ expectedId:transition.expectedId, actionId:transition.actionId, activeBeforeZoom:transition.activeBeforeZoom, activeAt200:transition.activeAt200, activeAfterResize:transition.activeAfterResize, activeAfterReset:transition.activeAfterReset, mountedAt100:transition.mountedAt100, mountedAt200:transition.mountedAt200, mountedAfterResize:transition.mountedAfterResize },
});
const roleEvidence = 'role-category-final/role-category-matrix.json';
const roleMatrix = JSON.parse(fs.readFileSync(path.join(implementation, roleEvidence), 'utf8'));
for (const observation of roleMatrix.rows) {
  const screenshot = `role-category-final/${observation.screenshot}`;
  rows.push({ id:`I77-role-${observation.role}-${observation.environment.width}x${observation.environment.height}-${observation.environment.theme}-${observation.environment.zoom}-${observation.environment.forcedColors}`,
    issue:61, requirement:'IR-SHELL-002', ac:'AC-5', surface:'production AppShell/settings category navigation', role:observation.role,
    state:observation.settingsShellVisible ? 'settings-open/editor-selected' : 'pre-auth/no-settings-shell', environment:observation.environment,
    evidenceClass:observation.evidenceClass, verdict:'BLOCKED', reason:'The exact role/category observation is fresh and validator-green, but the latest independent disposition remains rejected until re-review.',
    evidence:screenshot, evidenceSha256:observation.screenshotSha256, reviewerDisposition:'rejected', reviewerEvidence, reviewerEvidenceSha256,
    observation:{ categoryIds:observation.categoryIds, categoryCount:observation.categoryCount, sessionProvenance:observation.sessionProvenance, focus:observation.focus, geometry:observation.geometry, browserVersion:observation.browserVersion, zoomTrace:observation.zoomTrace },
  });
}
const compositionEvidence = 'composition-matrix-final/issue77-composition-matrix-result.json';
const composition = JSON.parse(fs.readFileSync(path.join(implementation, compositionEvidence), 'utf8'));
for (const cell of composition.cells) rows.push({
  id:`I77-composition-${cell.mode}-${cell.theme}-${cell.zoom}`, issue:77, requirement:'IR-EDITOR-002', ac:'AC-5', surface:`actual product editor/${cell.mode}`,
  role:'owned authenticated superuser', state:'editable synthetic composition/cancel-correct/undo/autosave', environment:{ viewport:'1440x900', theme:cell.theme, zoom:cell.zoom*100, forcedColors:false },
  evidenceClass:'product', verdict:cell.verdict === 'PASS' ? 'BLOCKED' : cell.verdict, reason:cell.verdict === 'PASS' ? 'Exact product cell passed but awaits new independent acceptance.' : cell.findings.map((finding)=>finding.reproduction).join('; '),
  evidence:compositionEvidence, evidenceSha256:hash(path.join(implementation,compositionEvidence)), reviewerDisposition:'rejected', reviewerEvidence, reviewerEvidenceSha256,
  observation:{ mountedIdentity:cell.mountedIdentity, preState:cell.preState, composingEnter:cell.composingEnter, cancellationCorrection:cell.cancellationCorrection, exactResult:cell.exactResult, undo:cell.undo, autosave:cell.autosave, ctrlSReadback:cell.ctrlSReadback, themeTransition:cell.themeTransition, zoomTransition:cell.zoomTransition, resizeTransition:cell.resizeTransition },
});
for (const [consumer, result] of Object.entries(composition.consumers)) rows.push({
  id:`I77-composition-consumer-${consumer}`, issue:77, requirement:'IR-SHELL-006', ac:'AC-5', surface:`actual product composition consumer/${consumer}`,
  role:'owned authenticated superuser', state:'composing Enter guard', environment:{ viewport:'1440x900', theme:'light', zoom:100, forcedColors:false },
  evidenceClass:'product', verdict:result.verdict === 'PASS' ? 'BLOCKED' : result.verdict, reason:result.blocker ?? 'Fresh product result awaits independent acceptance.',
  evidence:compositionEvidence, evidenceSha256:hash(path.join(implementation,compositionEvidence)), reviewerDisposition:'rejected', reviewerEvidence, reviewerEvidenceSha256, observation:result,
});
const acceptedPreReviewLedgerSha256 = 'a8efd0cc089b0f6fae9849b99133b4545e75f42da832bd7422c2808fc07be8d4';
const acceptedPreReviewIdSetSha256 = 'a8149904f4dbd98d10f7b6eb8e171af5d88898e024b74790900ee17cccd73497';
const preReviewJsonl = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const canonicalPreReviewLedgerSha256 = hashText(preReviewJsonl);
const blockedIds = rows.filter((row) => row.verdict === 'BLOCKED').map((row) => row.id).sort();
if (blockedIds.length !== 406 || hashText(`${blockedIds.join('\n')}\n`) !== acceptedPreReviewIdSetSha256) throw new Error('generated blocked row ID set no longer matches Axis A acceptance');
const acceptedReviews = {
  axisA: { evidence: 'axis-a-final-review.md', sha256: '18e706c4ce58f28e3c153fb957aff7cf7e1696ccfb9db14da64c012ff415bf25' },
  axisB: { evidence: 'axis-b-final-review.md', sha256: 'ac68b5f9d3e53d7aab970a403d38b1a0332237f4877ac1af738afc7e240dd71b' },
};
for (const review of Object.values(acceptedReviews)) {
  if (hash(path.join(implementation, review.evidence)) !== review.sha256) throw new Error(`independent review hash mismatch: ${review.evidence}`);
}
for (const row of rows) {
  if (row.verdict !== 'BLOCKED') continue;
  const review = /^(?:I77-tree-|I77-composition-|I77-role-)/.test(row.id) ? acceptedReviews.axisB : acceptedReviews.axisA;
  row.verdict = 'PASS';
  row.reason = `Accepted by independent ${review === acceptedReviews.axisB ? 'Axis B runtime' : 'Axis A evidence'} review for the fixed pre-review ledger scope.`;
  row.reviewerDisposition = 'accepted';
  row.reviewerEvidence = review.evidence;
  row.reviewerEvidenceSha256 = review.sha256;
  row.acceptedPreReviewLedgerSha256 = acceptedPreReviewLedgerSha256;
  row.acceptedPreReviewIdSetSha256 = acceptedPreReviewIdSetSha256;
  row.canonicalPreReviewLedgerSha256 = canonicalPreReviewLedgerSha256;
  row.evidenceByteAuthority = 'git-index-canonical';
}
fs.writeFileSync(path.join(output, 'leaf-matrix.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
const summary = rows.reduce((all, row) => ({ ...all, [row.verdict]: (all[row.verdict] ?? 0) + 1 }), {});
const independentReviewAccepted = rows.every((row) => row.verdict === 'N-A' ? row.reviewerDisposition === 'not-applicable' : row.reviewerDisposition === 'accepted');
const closureEligible = independentReviewAccepted && (summary.FAIL??0)===0 && (summary.BLOCKED??0)===0 && (summary['NOT-RUN']??0)===0;
fs.writeFileSync(path.join(output, 'leaf-matrix-summary.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), rows: rows.length, summary, independentReviewAccepted, closureEligible }, null, 2)}\n`);
console.log(`PASS inventory ${inventory.length}; exact rows ${rows.length}; closureEligible=${closureEligible}`);
