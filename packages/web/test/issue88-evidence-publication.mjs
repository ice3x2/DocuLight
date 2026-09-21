import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const UTF8_BYTEWISE_ORDER = Object.freeze({
  algorithm: 'utf8-bytewise-ascending',
  fields: ['sources[].path', 'artifacts[].name'],
});

export function compareUtf8Bytewise(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function publishCapture(source, destination) {
  const manifestName = 'capture-manifest.json';
  const sourceManifest = path.join(source, manifestName);
  if (!fs.existsSync(sourceManifest)) throw new Error('completion manifest missing from staged capture');

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source).sort(compareUtf8Bytewise)) {
    if (entry === manifestName) continue;
    fs.cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
  }

  const temporaryManifest = path.join(destination, `.${manifestName}.tmp-${randomUUID()}`);
  try {
    fs.writeFileSync(temporaryManifest, fs.readFileSync(sourceManifest), { flag: 'wx' });
    fs.renameSync(temporaryManifest, path.join(destination, manifestName));
  } catch (error) {
    fs.rmSync(temporaryManifest, { force: true });
    throw error;
  }
}
