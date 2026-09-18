import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { contentHash } from '../../domain/document/content-hash.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import { isServable } from '../../domain/serving/servable.js';
import type { SqliteTextIndexRepository } from '../../infra/sqlite/text-index-repository.js';

export const isTextIndexName = (name: string): boolean => /\.(md|pdf)$/i.test(name);

export function eligibleTextNode(nodes: NodeRepository, nodeId: string): NodeRecord | undefined {
  const node = nodes.findById(nodeId);
  return node?.kind === 'file' && isTextIndexName(node.name) && isServable(nodes.chainOf(node.id)) ? node : undefined;
}

export function textIndexFingerprint(name: string, bytes: Uint8Array): string {
  return name.toLowerCase().endsWith('.pdf')
    ? createHash('sha256').update(bytes).digest('hex')
    : contentHash(Buffer.from(bytes).toString('utf8'));
}

export async function enqueueCurrentTextSource(stores: { nodes: NodeRepository; docsRoot: string; textIndex?: SqliteTextIndexRepository }, nodeId: string): Promise<boolean> {
  if (stores.textIndex === undefined) return false;
  const node = eligibleTextNode(stores.nodes, nodeId);
  if (node === undefined) {
    stores.textIndex.remove(nodeId);
    return false;
  }
  const bytes = await readFile(join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(node.id)));
  const fingerprint = textIndexFingerprint(node.name, bytes);
  const prepared = stores.textIndex.prepared().find((job) => job.nodeId === node.id && job.expectedFingerprint === fingerprint);
  if (prepared !== undefined) {
    stores.textIndex.ready(node.id, prepared.generation, fingerprint);
    return true;
  }
  if (stores.textIndex.isCurrentOrQueued(node.id, fingerprint)) return true;
  const next = stores.textIndex.prepare(node.id, fingerprint);
  stores.textIndex.ready(node.id, next.generation, fingerprint);
  return true;
}
