import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORY_IDS, REQUIRED_ENVIRONMENTS, ROLE_EXPECTATIONS, validateRoleCategoryEvidence } from './issue77-role-category-validator.mjs';

test('current authority has eight exact role tuples and fourteen category IDs', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(ROLE_EXPECTATIONS).map(([role, categories]) => [role, categories.length])), {
    anonymous: 0,
    'ordinary-zero': 4,
    viewer: 5,
    editor: 5,
    manager: 8,
    'superuser-zero': 11,
    'superuser-viewer': 12,
    'superuser-manager': 14,
  });
  assert.equal(CATEGORY_IDS.length, 14);
  assert.equal(ROLE_EXPECTATIONS['superuser-zero'].includes('trash'), false);
  assert.equal(ROLE_EXPECTATIONS['superuser-zero'].includes('audit-log'), true);
  assert.equal(ROLE_EXPECTATIONS['superuser-viewer'].includes('workspace'), false);
  assert.equal(ROLE_EXPECTATIONS['superuser-viewer'].includes('acl-audit'), false);
});

test('environment authority is exact twelve normal rows plus two labelled forced-colors rows', () => {
  const normal = REQUIRED_ENVIRONMENTS.filter((entry) => entry.forcedColors === 'none');
  const forced = REQUIRED_ENVIRONMENTS.filter((entry) => entry.forcedColors === 'active');
  assert.equal(normal.length, 12);
  assert.equal(forced.length, 2);
  assert.deepEqual(new Set(normal.map((entry) => `${entry.width}x${entry.height}`)), new Set(['1280x720', '1440x900', '1920x1080']));
  assert.deepEqual(new Set(normal.map((entry) => entry.theme)), new Set(['light', 'dark']));
  assert.deepEqual(new Set(normal.map((entry) => entry.zoom)), new Set([100, 200]));
});

test('strict validator rejects incomplete evidence before accepting any closure evidence', () => {
  assert.throws(() => validateRoleCategoryEvidence({
    schemaVersion: 1,
    revision: '0'.repeat(40),
    nativeForcedColors: 'not exercised; Playwright forced-colors emulation only',
    categoryAuthority: CATEGORY_IDS,
    rows: Array.from({ length: 112 }, () => ({ role: 'superuser-zero', categoryCount: 10 })),
  }), /anonymous must have the exact 12 normal plus two forced-colors rows/);
});
