import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPOSITION_MATRIX,
  REQUIRED_CELL_FIELDS,
  REQUIRED_CONSUMERS,
  validateCompositionEvidence,
} from './issue77-composition-matrix-check.mjs';

test('issue77 composition matrix defines the eight required actual-product cells', () => {
  assert.deepEqual(COMPOSITION_MATRIX, [
    { mode: 'live-preview', theme: 'light', zoom: 1 },
    { mode: 'live-preview', theme: 'light', zoom: 2 },
    { mode: 'live-preview', theme: 'dark', zoom: 1 },
    { mode: 'live-preview', theme: 'dark', zoom: 2 },
    { mode: 'source', theme: 'light', zoom: 1 },
    { mode: 'source', theme: 'light', zoom: 2 },
    { mode: 'source', theme: 'dark', zoom: 1 },
    { mode: 'source', theme: 'dark', zoom: 2 },
  ]);
});

test('issue77 composition evidence rejects incomplete or synthetic-only claims', () => {
  assert.deepEqual(REQUIRED_CELL_FIELDS, [
    'productEntry', 'mountedIdentity', 'preState', 'events', 'composingEnter',
    'cancellationCorrection', 'exactResult', 'undo', 'autosave', 'ctrlSReadback',
    'themeTransition', 'zoomTransition', 'resizeTransition', 'nativeLimitation',
  ]);
  assert.deepEqual(REQUIRED_CONSUMERS, ['form', 'principalPicker', 'l2', 'l3']);
  assert.throws(
    () => validateCompositionEvidence({ schemaVersion: 1, cells: [], consumers: {} }),
    /exactly 8 cells/,
  );
});
