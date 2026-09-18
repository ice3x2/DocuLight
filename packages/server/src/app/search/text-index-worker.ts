import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { contentHash } from '../../domain/document/content-hash.js';
import { findTags } from '../../domain/document/tag.js';
import type { NodeRepository } from '../../domain/ports/node-repository.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import type { StrictPdfTextExtractor } from '../../domain/ports/pdf-text.js';
import { pdfjsStrictTextExtractor } from '../../infra/pdf/pdfjs-text.js';
import type { SqliteTextIndexRepository, TextIndexClaim } from '../../infra/sqlite/text-index-repository.js';
import { eligibleTextNode, textIndexFingerprint } from './text-index-source.js';

export interface TextIndexWorkerStores {
  nodes: NodeRepository;
  docsRoot: string;
  textIndex: SqliteTextIndexRepository;
  workspaces: WorkspaceRepository;
  pdf?: StrictPdfTextExtractor;
}

export class TextIndexWorker {
  private readonly runId = crypto.randomUUID();
  constructor(private readonly stores: TextIndexWorkerStores) {}

  async processOne(): Promise<boolean> {
    const claim = this.stores.textIndex.claimNext(`${this.runId}:${crypto.randomUUID()}`);
    if (claim === undefined) return false;
    const node = eligibleTextNode(this.stores.nodes, claim.nodeId);
    if (node === undefined) {
      this.stores.textIndex.remove(claim.nodeId);
      return true;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(join(this.stores.docsRoot, node.workspaceId, this.stores.nodes.pathOf(node.id)));
    } catch {
      this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'read_failed');
      return true;
    }
    try {
      const pdf = node.name.toLowerCase().endsWith('.pdf');
      const fingerprint = pdf ? createHash('sha256').update(bytes).digest('hex') : contentHash(bytes.toString('utf8'));
      if (fingerprint !== claim.expectedFingerprint) {
        this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'read_failed');
        return true;
      }
      if (pdf) {
        const extracted = await (this.stores.pdf ?? pdfjsStrictTextExtractor).extractStrict(new Uint8Array(bytes));
        if (!extracted.ok) { this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, extracted.errorCode); return true; }
        if (!await this.currentBeforePublish(claim)) return true;
        try {
          this.stores.textIndex.complete(claim, { body: '', tags: [], pages: extracted.pages });
        } catch {
          this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'index_failed');
        }
      } else {
        const body = bytes.toString('utf8');
        if (!await this.currentBeforePublish(claim)) return true;
        try {
          this.stores.textIndex.complete(claim, { body, tags: findTags(body), pages: [] });
        } catch {
          this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'index_failed');
        }
      }
    } catch {
      this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'read_failed');
    }
    return true;
  }

  private async currentBeforePublish(claim: TextIndexClaim): Promise<boolean> {
    const node = eligibleTextNode(this.stores.nodes, claim.nodeId);
    if (node === undefined) {
      this.stores.textIndex.remove(claim.nodeId);
      return false;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(join(this.stores.docsRoot, node.workspaceId, this.stores.nodes.pathOf(node.id)));
    } catch {
      this.stores.textIndex.fail(node.id, claim.generation, claim.claimId, 'read_failed');
      return false;
    }
    const actual = textIndexFingerprint(node.name, bytes);
    if (actual === claim.expectedFingerprint) return true;
    this.stores.textIndex.reconcileClaim(claim, actual);
    return false;
  }
}

export interface TextIndexWorkerLoop { stop(): Promise<void>; }

export function startTextIndexWorker(stores: TextIndexWorkerStores, options: { intervalMs?: number } = {}): TextIndexWorkerLoop {
  stores.textIndex.recover();
  const worker = new TextIndexWorker(stores);
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interval = options.intervalMs ?? 100;
  let backfilled = false;
  const backfill = async () => {
    if (backfilled) return;
    backfilled = true;
    for (const obligation of stores.textIndex.prepared()) {
      const node = stores.nodes.findById(obligation.nodeId);
      if (node === undefined || node.kind !== 'file' || node.trashedAt !== null || node.orphanedAt !== null || !/\.(md|pdf)$/i.test(node.name)) {
        stores.textIndex.remove(obligation.nodeId);
        continue;
      }
      try {
        const bytes = await readFile(join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(node.id)));
        const actual = node.name.toLowerCase().endsWith('.pdf') ? createHash('sha256').update(bytes).digest('hex') : contentHash(bytes.toString('utf8'));
        if (actual === obligation.expectedFingerprint) {
          stores.textIndex.ready(node.id, obligation.generation, actual);
        } else {
          const current = stores.textIndex.prepare(node.id, actual);
          stores.textIndex.ready(node.id, current.generation, actual);
        }
      } catch {
        stores.textIndex.remove(node.id);
      }
    }
    for (const workspace of stores.workspaces.list()) for (const node of stores.nodes.allIn(workspace.id)) {
      if (node.kind !== 'file' || node.trashedAt !== null || node.orphanedAt !== null || !/\.(md|pdf)$/i.test(node.name)) continue;
      try {
        const bytes = await readFile(join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(node.id)));
        const fingerprint = node.name.toLowerCase().endsWith('.pdf') ? createHash('sha256').update(bytes).digest('hex') : contentHash(bytes.toString('utf8'));
        if (stores.textIndex.isCurrentOrQueued(node.id, fingerprint)) continue;
        const prepared = stores.textIndex.prepare(node.id, fingerprint);
        stores.textIndex.ready(node.id, prepared.generation, fingerprint);
      } catch { /* reconciliation owns missing source identity */ }
    }
  };
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = (async () => { await backfill(); while (!stopped && await worker.processOne()) { /* drain */ } })()
        .finally(schedule);
    }, interval);
    timer.unref?.();
  };
  schedule();
  return { async stop() { stopped = true; if (timer !== undefined) clearTimeout(timer); await running; } };
}
