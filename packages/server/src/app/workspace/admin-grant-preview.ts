import { randomUUID } from 'node:crypto';

import { grantPermission } from '../acl/grant-service.js';
import { actorFor, permissionBatch, permissionOf, type AclStores, type Actor } from '../acl/permission-service.js';
import { isSystemGroup } from '../../domain/principal/system-groups.js';
import { isServable } from '../../domain/serving/servable.js';
import { canAuthenticate } from '../../domain/auth/account-gate.js';
import type { SessionRepository } from '../../domain/ports/session-repository.js';
import type { Clock } from '../auth/login-service.js';

type Warning = 'suspended-subject';

export interface AdminGrantPreviewBody {
  workspace: { id: string; name: string };
  principal: { id: string; name: string; kind: 'user' | 'group'; status: 'active' | 'pending' | 'suspended'; system: boolean };
  level: 'admin';
  grade: 'L2';
  coverage: 'workspace-admin-gate';
  visibleDescendantCount: number;
  warnings: Warning[];
  alreadyAssigned: boolean;
  previewToken: string;
  expiresAt: string;
}

interface Snapshot {
  workspaceId: string;
  principalId: string;
  actorId: string;
  material: string;
}

interface StoredPreview extends Snapshot {
  authContext: string;
  expiresAt: number;
  receipt?: { entryId: string; workspaceId: string; principalId: string; level: 'admin' };
}

export type PreviewResult = { ok: true; body: AdminGrantPreviewBody } | { ok: false; rule: 'not-found' };
export type GrantResult =
  | { ok: true; receipt: { entryId: string; workspaceId: string; principalId: string; level: 'admin' } }
  | { ok: false; rule: 'not-found' | 'preview-stale' | 'unavailable' | 'unauthenticated' };

const FIVE_MINUTES = 5 * 60 * 1_000;
const MAX_PREVIEWS = 512;

function snapshotOf(stores: AclStores, actor: Actor, workspaceId: string, principalId: string): Snapshot | undefined {
  const workspace = stores.workspaces.findById(workspaceId);
  if (workspace === undefined || permissionOf(stores, actor, workspaceId) !== 'admin') return undefined;
  const principal = stores.principals.findById(principalId);
  if (principal === undefined || principal.status === 'rejected') return undefined;

  const nodes = stores.nodes.allIn(workspaceId);
  const levelOf = permissionBatch(stores, actor, nodes.map((node) => node.id), workspaceId);
  const visible = nodes
    .filter((node) => isServable(stores.nodes.chainOf(node.id)) && levelOf(node.id) !== null)
    .map((node) => ({ id: node.id, parentId: node.parentId, name: node.name, kind: node.kind, inheritsAcl: node.inheritsAcl }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const alreadyAssigned = stores.acl.entriesOn(workspaceId)
    .some((entry) => entry.principalId === principalId && entry.level === 'admin');
  return {
    workspaceId,
    principalId,
    actorId: actor.id,
    material: JSON.stringify({
      workspace: { id: workspace.id, name: workspace.name },
      principal,
      requester: { subjectIds: [...actor.requester.subjectIds].sort(), superuser: actor.requester.superuser },
      alreadyAssigned,
      visible,
    }),
  };
}

export class AdminGrantPreviews {
  private readonly previews = new Map<string, StoredPreview>();

  constructor(private readonly stores: AclStores & { sessions: SessionRepository; clock: Clock; transaction?: <T>(fn: () => T) => T }) {}

  private evictExpired(now: number): void {
    for (const [token, preview] of this.previews) {
      if (preview.expiresAt <= now) this.previews.delete(token);
    }
    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.previews.delete(oldest);
    }
  }

  preview(actor: Actor, authContext: string, workspaceId: string, principalId: string): PreviewResult {
    const snapshot = snapshotOf(this.stores, actor, workspaceId, principalId);
    if (snapshot === undefined) return { ok: false, rule: 'not-found' };
    const workspace = this.stores.workspaces.findById(workspaceId)!;
    const principal = this.stores.principals.findById(principalId)!;
    const parsed = JSON.parse(snapshot.material) as { alreadyAssigned: boolean; visible: unknown[] };
    const now = Date.now();
    this.evictExpired(now);
    const previewToken = randomUUID();
    const expiresAt = now + FIVE_MINUTES;
    this.previews.set(previewToken, { ...snapshot, authContext, expiresAt });
    return {
      ok: true,
      body: {
        workspace: { id: workspace.id, name: workspace.name },
        principal: {
          id: principal.id, name: principal.name, kind: principal.kind,
          status: principal.status as 'active' | 'pending' | 'suspended',
          system: principal.kind === 'group' && isSystemGroup(principal.id),
        },
        level: 'admin', grade: 'L2', coverage: 'workspace-admin-gate',
        visibleDescendantCount: parsed.visible.length,
        warnings: principal.status === 'suspended' ? ['suspended-subject'] : [],
        alreadyAssigned: parsed.alreadyAssigned,
        previewToken,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  }

  grant(suppliedActor: Actor, authContext: string, workspaceId: string, principalId: string, previewToken: string): GrantResult {
    if (this.stores.transaction === undefined) return { ok: false, rule: 'unavailable' };
    const result: GrantResult = this.stores.transaction((): GrantResult => {
      if (!authContext.startsWith('session:v1:')) return { ok: false, rule: 'unauthenticated' };
      const session = this.stores.sessions.find(authContext.slice('session:v1:'.length));
      if (session === undefined || new Date(session.expiresAt).getTime() <= this.stores.clock().getTime()) {
        return { ok: false, rule: 'unauthenticated' };
      }
      const account = this.stores.principals.findById(session.userId);
      if (account === undefined || !canAuthenticate(account.status) || session.userId !== suppliedActor.id) {
        return { ok: false, rule: 'unauthenticated' };
      }
      const actor = actorFor(this.stores.principals, suppliedActor.id);
      const current = snapshotOf(this.stores, actor, workspaceId, principalId);
      if (current === undefined) return { ok: false, rule: 'not-found' };
      const stored = this.previews.get(previewToken);
      if (stored === undefined || stored.workspaceId !== workspaceId || stored.principalId !== principalId || stored.actorId !== actor.id || stored.authContext !== authContext) {
        return { ok: false, rule: 'preview-stale' };
      }
      if (stored.receipt !== undefined) {
        const stillAssigned = this.stores.acl.entriesOn(workspaceId)
          .some((entry) => entry.id === stored.receipt!.entryId && entry.principalId === principalId && entry.level === 'admin');
        return stillAssigned ? { ok: true, receipt: stored.receipt } : { ok: false, rule: 'preview-stale' };
      }
      if (stored.expiresAt <= Date.now() || stored.material !== current.material) return { ok: false, rule: 'preview-stale' };
      const parsed = JSON.parse(stored.material) as { alreadyAssigned: boolean };
      if (parsed.alreadyAssigned) return { ok: false, rule: 'preview-stale' };
      const granted = grantPermission(this.stores, actor, { nodeId: workspaceId, principalId, level: 'admin' });
      if (!granted.ok) return { ok: false, rule: 'not-found' };
      const receipt = { entryId: granted.entryId, workspaceId, principalId, level: 'admin' as const };
      return { ok: true, receipt };
    });
    if (result.ok) {
      const stored = this.previews.get(previewToken);
      if (stored !== undefined) stored.receipt = result.receipt;
    }
    return result;
  }
}
