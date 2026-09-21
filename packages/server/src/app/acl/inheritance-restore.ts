import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { PermissionLevel } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';
import { chainIndex, pathIndex } from '../node/node-paths.js';
import { permissionOf, type AclStores, type Actor } from './permission-service.js';
import { ACL_RESTORE_INHERITANCE } from './grant-service.js';

export interface RestoreAclRow {
  readonly principalId: string;
  readonly principalName: string;
  readonly principalKind: 'user' | 'group';
  readonly level: PermissionLevel;
  readonly source: string | null;
}

export interface RestorePreview {
  readonly nodeId: string;
  readonly workspace: { id: string; name: string };
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly retainedDirectAcl: readonly RestoreAclRow[];
  readonly incomingParentAcl: readonly RestoreAclRow[];
  readonly applicableDescendants: number | null;
  readonly revision: string;
}

interface Snapshot {
  readonly public: Omit<RestorePreview, 'revision'>;
  readonly canonical: string;
}

type RestoreStores = AclStores & { transaction?: <T>(fn: () => T) => T };
export type RestoreResult = { ok: true } | { ok: false; rule: 'not-found' | 'precondition' | 'stale' | 'unavailable' };

const order = <T extends { principalId: string; level: string; source: string | null }>(rows: T[]): T[] =>
  rows.sort((a, b) => JSON.stringify([a.source, a.principalId, a.level]).localeCompare(JSON.stringify([b.source, b.principalId, b.level])));

function snapshotOf(stores: RestoreStores, actor: Actor, authContext: string, nodeId: NodeId): Snapshot | undefined {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined || node.workspaceId === undefined || node.inheritsAcl) return undefined;
  const workspace = stores.workspaces.findById(node.workspaceId);
  const chain = stores.nodes.chainOf(nodeId);
  if (workspace === undefined || !isServable(chain) || permissionOf(stores, actor, nodeId) !== 'admin') return undefined;

  const all = stores.nodes.allIn(workspace.id);
  const pathOf = pathIndex(all);
  const chainOf = chainIndex(all);
  const path = pathOf(nodeId);
  if (path === null) return undefined;

  const principalRow = (entry: { principalId: string; level: PermissionLevel }, source: string | null): RestoreAclRow | undefined => {
    const principal = stores.principals.findById(entry.principalId);
    return principal === undefined ? undefined : {
      principalId: principal.id,
      principalName: principal.name,
      principalKind: principal.kind,
      level: entry.level,
      source,
    };
  };
  const directEntries = stores.acl.entriesOn(nodeId);
  const retainedDirectAcl = order(directEntries.map((entry) => principalRow(entry, null)).filter((row): row is RestoreAclRow => row !== undefined));
  if (retainedDirectAcl.length !== directEntries.length) return undefined;

  const ancestorNodes = chain.slice(1);
  const reachedNodes: typeof ancestorNodes = [];
  for (const ancestor of ancestorNodes) {
    reachedNodes.push(ancestor);
    if (!ancestor.inheritsAcl) break;
  }
  const reachesWorkspace = ancestorNodes.every((ancestor) => ancestor.inheritsAcl);
  const incomingSources = [...reachedNodes.map((ancestor) => ancestor.id), ...(reachesWorkspace ? [workspace.id] : [])];
  const incomingEntries = stores.acl.entriesOnAny(incomingSources)
    .filter((entry) => !(entry.nodeId === workspace.id && entry.level === 'admin'));
  const incomingParentAcl = order(incomingEntries.map((entry) => {
    const source = entry.nodeId === workspace.id ? workspace.name : pathOf(entry.nodeId);
    return source === null ? undefined : principalRow(entry, source);
  }).filter((row): row is RestoreAclRow => row !== undefined));
  if (incomingParentAcl.length !== incomingEntries.length) return undefined;

  const descendants = all.filter((candidate) => candidate.id !== nodeId && chainOf(candidate.id).some((one) => one.id === nodeId));
  const applicable = descendants.filter((candidate) => {
    const relative = chainOf(candidate.id);
    const targetAt = relative.findIndex((one) => one.id === nodeId);
    if (targetAt < 0 || !isServable(relative)) return false;
    return relative.slice(0, targetAt).every((one) => one.inheritsAcl);
  });
  const publicPreview = {
    nodeId,
    workspace: { id: workspace.id, name: workspace.name },
    path,
    kind: node.kind,
    retainedDirectAcl,
    incomingParentAcl,
    applicableDescendants: node.kind === 'directory' ? applicable.length : null,
  } satisfies Omit<RestorePreview, 'revision'>;

  const relevantPrincipals = [...new Set([...directEntries, ...incomingEntries].map((entry) => entry.principalId))]
    .map((id) => stores.principals.findById(id))
    .sort((a, b) => (a?.id ?? '').localeCompare(b?.id ?? ''));
  const material = {
    domain: 'restore-inheritance', version: 1,
    actor: { id: actor.id, authContext, subjectIds: [...actor.requester.subjectIds].sort(), superuser: actor.requester.superuser, record: stores.principals.findById(actor.id) ?? null },
    target: { ...node, path }, workspace,
    ancestors: chain.slice(1).map((one) => ({ ...one, path: pathOf(one.id) })),
    directEntries: [...directEntries].sort((a, b) => a.id.localeCompare(b.id)),
    incomingEntries: [...incomingEntries].sort((a, b) => a.id.localeCompare(b.id)),
    descendants: applicable.map((one) => ({ ...one, path: pathOf(one.id) })).sort((a, b) => a.id.localeCompare(b.id)),
    principals: relevantPrincipals,
    publicPreview,
  };
  return { public: publicPreview, canonical: JSON.stringify(material) };
}

export class InheritanceRestorePreviews {
  private secret = randomBytes(32);

  constructor(private readonly stores: RestoreStores) {}

  rotateKey(): void { this.secret = randomBytes(32); }

  private revision(canonical: string): string {
    return `v1.${createHmac('sha256', this.secret).update(canonical, 'utf8').digest('base64url')}`;
  }

  preview(actor: Actor, authContext: string, nodeId: NodeId): RestorePreview | undefined {
    const snapshot = snapshotOf(this.stores, actor, authContext, nodeId);
    return snapshot === undefined ? undefined : { ...snapshot.public, revision: this.revision(snapshot.canonical) };
  }

  restore(reauthorize: () => Actor | undefined, authContext: string, nodeId: NodeId, revision: unknown): RestoreResult {
    if (this.stores.transaction === undefined) return { ok: false, rule: 'unavailable' };
    return this.stores.transaction((): RestoreResult => {
      const actor = reauthorize();
      if (actor === undefined) return { ok: false, rule: 'not-found' };
      const snapshot = snapshotOf(this.stores, actor, authContext, nodeId);
      if (snapshot === undefined) {
        const node = this.stores.nodes.findById(nodeId);
        const authorized = node !== undefined && isServable(this.stores.nodes.chainOf(nodeId)) && permissionOf(this.stores, actor, nodeId) === 'admin';
        return authorized && node.inheritsAcl ? { ok: false, rule: 'stale' } : { ok: false, rule: 'not-found' };
      }
      if (typeof revision !== 'string' || revision.length === 0) return { ok: false, rule: 'precondition' };
      const match = /^v1\.([A-Za-z0-9_-]{43})$/.exec(revision);
      if (match === null) return { ok: false, rule: 'stale' };
      const supplied = Buffer.from(match[1]!, 'base64url');
      const expected = createHmac('sha256', this.secret).update(snapshot.canonical, 'utf8').digest();
      if (supplied.length !== expected.length || supplied.toString('base64url') !== match[1] || !timingSafeEqual(supplied, expected)) return { ok: false, rule: 'stale' };
      const node = this.stores.nodes.findById(nodeId)!;
      this.stores.nodes.setInheritance(nodeId, true);
      this.stores.audit.append({ operation: ACL_RESTORE_INHERITANCE, actor: actor.id, nodeId, workspaceId: node.workspaceId });
      return { ok: true };
    });
  }
}
