import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORY_IDS = [
  'editor', 'appearance', 'tokens', 'account', 'trash',
  'workspace', 'acl-audit', 'audit-log',
  'users', 'groups', 'signup-approval', 'all-workspaces', 'instance', 'index-queue',
];

const PERSONAL = CATEGORY_IDS.slice(0, 4);
const INSTANCE = CATEGORY_IDS.slice(8);
export const ROLE_EXPECTATIONS = {
  anonymous: [],
  'ordinary-zero': PERSONAL,
  viewer: [...PERSONAL, 'trash'],
  editor: [...PERSONAL, 'trash'],
  manager: [...PERSONAL, 'trash', 'workspace', 'acl-audit', 'audit-log'],
  'superuser-zero': [...PERSONAL, 'audit-log', ...INSTANCE],
  'superuser-viewer': [...PERSONAL, 'trash', 'audit-log', ...INSTANCE],
  'superuser-manager': CATEGORY_IDS,
};

export const REQUIRED_ENVIRONMENTS = [
  ...[[1280, 720], [1440, 900], [1920, 1080]].flatMap(([width, height]) =>
    ['light', 'dark'].flatMap((theme) => [100, 200].map((zoom) => ({ width, height, theme, zoom, forcedColors: 'none' })))),
  { width: 1280, height: 720, theme: 'light', zoom: 100, forcedColors: 'active' },
  { width: 1280, height: 720, theme: 'light', zoom: 200, forcedColors: 'active' },
];

const canonical = (value) => JSON.stringify(value);
const envKey = (value) => `${value.width}x${value.height}:${value.theme}:${value.zoom}:${value.forcedColors}`;

export function validateRoleCategoryEvidence(evidence) {
  assert.equal(evidence.schemaVersion, 1);
  assert.match(evidence.revision, /^[0-9a-f]{40}$/);
  assert.equal(evidence.nativeForcedColors, 'not exercised; Playwright forced-colors emulation only');
  assert.deepEqual(evidence.categoryAuthority, CATEGORY_IDS);
  assert.equal(evidence.rows.length, Object.keys(ROLE_EXPECTATIONS).length * REQUIRED_ENVIRONMENTS.length);

  const expectedEnvironments = new Set(REQUIRED_ENVIRONMENTS.map(envKey));
  const rowKeys = new Set();
  for (const [role, expectedCategories] of Object.entries(ROLE_EXPECTATIONS)) {
    const rows = evidence.rows.filter((row) => row.role === role);
    assert.equal(rows.length, REQUIRED_ENVIRONMENTS.length, `${role} must have the exact 12 normal plus two forced-colors rows`);
    assert.deepEqual(new Set(rows.map((row) => envKey(row.environment))), expectedEnvironments);
    for (const row of rows) {
      const key = `${role}:${envKey(row.environment)}`;
      assert.equal(rowKeys.has(key), false, `duplicate row ${key}`);
      rowKeys.add(key);
      assert.deepEqual(row.categoryIds, expectedCategories, `${key} exact ordered category IDs`);
      assert.equal(row.categoryCount, expectedCategories.length, `${key} exact category count`);
      assert.deepEqual(row.categoryLabels, evidence.categoryLabels.filter((entry) => expectedCategories.includes(entry.id)).map((entry) => entry.label));
      const componentOnly = role === 'superuser-viewer';
      assert.equal(row.evidenceClass, componentOnly ? 'production-component' : 'product');
      assert.equal(row.sessionProvenance, role === 'anonymous' ? 'built-product-pre-auth' : componentOnly ? 'controlled-production-AppShell-viewer-props' : 'owned-server-authenticated-session');
      assert.equal(row.settingsShellVisible, role !== 'anonymous');
      assert.equal(row.screenshot.startsWith('screenshots/'), true);
      assert.equal(path.isAbsolute(row.screenshot), false);
      assert.match(row.screenshotSha256, /^[0-9a-f]{64}$/);
      assert.equal(row.focus.activeCategory, role === 'anonymous' ? null : 'editor');
      assert.equal(row.focus.openFocusInside, role === 'anonymous' ? false : true);
      assert.equal(row.focus.closeRestoredToGear, role === 'anonymous' ? false : true);
      assert.equal(row.geometry.horizontalClipping, false);
      assert.equal(row.geometry.navigationReachable, role === 'anonymous' ? null : true);
      assert.equal(typeof row.ariaSnapshot, 'string', `${key} accessibility tree snapshot`);
      assert.ok(row.ariaSnapshot.length > 0, `${key} accessibility tree snapshot is nonempty`);
      if (role !== 'anonymous') for (const label of row.categoryLabels) assert.ok(row.ariaSnapshot.includes(label), `${key} accessibility tree contains ${label}`);
      assert.ok(row.browserVersion.length > 0);
      assert.ok(row.viewportCss.width > 0 && row.viewportCss.height > 0 && row.viewportCss.dpr > 0);
      const expectedZoom = row.environment.zoom / 100;
      assert.deepEqual(row.zoomTrace.map(({ operation, value, result }) => ({ operation, value, result })), [
        { operation: 'setZoom', value: expectedZoom, result: 'resolved' },
        { operation: 'getZoom', value: null, result: expectedZoom },
      ]);
    }
  }

  assert.deepEqual(evidence.transitions.map((entry) => entry.role), Object.keys(ROLE_EXPECTATIONS));
  for (const transition of evidence.transitions) {
    assert.equal(transition.previousSessionCleared, true);
    assert.equal(transition.authenticated, !['anonymous', 'superuser-viewer'].includes(transition.role));
    if (transition.role !== 'anonymous') {
      assert.equal(transition.focus.openedOn, 'editor');
      assert.equal(transition.focus.closedOn, 'settings-gear');
    }
  }

  assert.deepEqual(evidence.systemThemeChecks.map((entry) => entry.role), Object.keys(ROLE_EXPECTATIONS));
  for (const entry of evidence.systemThemeChecks) {
    assert.equal(entry.media, 'prefers-color-scheme: dark');
    assert.equal(entry.method, 'Playwright emulateMedia; no native OS preference UI');
    if (entry.role === 'superuser-viewer') {
      assert.equal(entry.verdict, 'N-A');
      assert.match(entry.reason, /component fixture does not own theme resolution/);
    } else {
      assert.equal(entry.verdict, 'PASS');
      assert.equal(entry.resolvedTheme, 'dark');
    }
  }

  const requiredDenials = [
    ['anonymous', '/api/audit-log', 401],
    ['ordinary-zero', '/api/audit-log', 404],
    ['viewer', '/api/audit-log', 404],
    ['editor', '/api/audit-log', 404],
    ['ordinary-zero', '/api/reconciliation-queue', 404],
    ['viewer', '/api/reconciliation-queue', 404],
    ['editor', '/api/reconciliation-queue', 404],
  ];
  const denialSet = new Set(evidence.endpointDenials.map((entry) => canonical([entry.role, entry.path, entry.status])));
  for (const denial of requiredDenials) assert.equal(denialSet.has(canonical(denial)), true, `missing direct endpoint denial ${canonical(denial)}`);

  const resetPairs = evidence.resetChecks.map((entry) => [entry.role, entry.trace.map(({ operation, value, result }) => ({ operation, value, result }))]);
  assert.deepEqual(resetPairs.map(([role]) => role), Object.keys(ROLE_EXPECTATIONS));
  for (const [, trace] of resetPairs) assert.deepEqual(trace, [
    { operation: 'setZoom', value: 1, result: 'resolved' },
    { operation: 'getZoom', value: null, result: 1 },
  ]);
  return true;
}

function main() {
  const target = process.argv[2] ?? process.env.DOCULIGHT_ISSUE77_ROLE_OUTPUT;
  if (!target || !path.isAbsolute(target)) throw new Error('absolute evidence file or DOCULIGHT_ISSUE77_ROLE_OUTPUT is required');
  const evidenceFile = fs.statSync(target).isDirectory() ? path.join(target, 'role-category-matrix.json') : target;
  validateRoleCategoryEvidence(JSON.parse(fs.readFileSync(evidenceFile, 'utf8')));
  console.log(`PASS strict role/category evidence validator: ${evidenceFile}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
