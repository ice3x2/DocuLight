import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error Test utility is an ESM JavaScript module used by the product runner.
import { compareUtf8Bytewise, publishCapture, UTF8_BYTEWISE_ORDER } from './issue88-evidence-publication.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('IR-SHELL-013 evidence publication', () => {
  it('publishes the completion manifest atomically after every other artifact', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue88-publication-test-'));
    roots.push(root);
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'a.txt'), 'artifact-a');
    fs.writeFileSync(path.join(source, 'z.txt'), 'artifact-z');
    fs.writeFileSync(path.join(source, 'capture-manifest.json'), '{"complete":true}');

    const renameSync = fs.renameSync.bind(fs);
    let visibilityAtCompletionRename: string[] = [];
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      visibilityAtCompletionRename = fs.readdirSync(destination).sort(compareUtf8Bytewise);
      renameSync(from, to);
    });

    publishCapture(source, destination);
    rename.mockRestore();

    const entries = fs.readdirSync(destination);
    expect(visibilityAtCompletionRename).toEqual(expect.arrayContaining(['a.txt', 'z.txt']));
    expect(visibilityAtCompletionRename).not.toContain('capture-manifest.json');
    expect(entries).toEqual(expect.arrayContaining(['a.txt', 'z.txt', 'capture-manifest.json']));
    expect(entries.some((name) => name.includes('.tmp-'))).toBe(false);
    const completionTime = fs.statSync(path.join(destination, 'capture-manifest.json')).mtimeMs;
    expect(completionTime).toBeGreaterThanOrEqual(fs.statSync(path.join(destination, 'a.txt')).mtimeMs);
    expect(completionTime).toBeGreaterThanOrEqual(fs.statSync(path.join(destination, 'z.txt')).mtimeMs);
  });

  it('defines and independently applies UTF-8 bytewise ascending aggregate order', () => {
    const names = ['z.txt', 'ä.txt', 'a.txt', 'Z.txt'];
    expect(UTF8_BYTEWISE_ORDER).toEqual({
      algorithm: 'utf8-bytewise-ascending',
      fields: ['sources[].path', 'artifacts[].name'],
    });
    expect([...names].sort(compareUtf8Bytewise)).toEqual(['Z.txt', 'a.txt', 'z.txt', 'ä.txt']);
  });
});
