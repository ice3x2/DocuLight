import type { Actor } from '../acl/permission-service.js';
import { actorFor, permissionOf, type AclStores } from '../acl/permission-service.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { Workspace, WorkspaceId } from '../../domain/workspace/workspace.js';

export type WorkspaceNameValidation = { ok: true; name: string } | { ok: false; rule: 'invalid-name' };
export type RenameWorkspaceResult =
  | { ok: false; rule: 'not-found' | 'forbidden' | 'invalid-name' }
  | { ok: true; workspace: Workspace; sidecarSync: 'synced' | 'pending' };

const renameTails = new Map<string, Promise<void>>();

// @req IR-WORKSPACE-001
export function validateWorkspaceName(raw: unknown): WorkspaceNameValidation {
  if (typeof raw !== 'string') return { ok: false, rule: 'invalid-name' };
  const name = raw.normalize('NFC').trim();
  const length = [...name].length;
  if (length < 1 || length > 120 || /[\u0000-\u001f\u007f]/u.test(name)) {
    return { ok: false, rule: 'invalid-name' };
  }
  return { ok: true, name };
}

// @req IR-WORKSPACE-001
export async function renameWorkspace(
  stores: AclStores & { files: WorkspaceFiles },
  actor: Actor,
  id: WorkspaceId,
  rawName: unknown,
): Promise<RenameWorkspaceResult> {
  const before = stores.workspaces.findById(id);
  if (before === undefined) return { ok: false, rule: 'not-found' };
  if (permissionOf(stores, actor, id) !== 'admin') return { ok: false, rule: 'forbidden' };
  const valid = validateWorkspaceName(rawName);
  if (!valid.ok) return valid;

  const predecessor = renameTails.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = predecessor.then(() => gate);
  renameTails.set(id, queued);
  await predecessor;
  try {
    const current = stores.workspaces.findById(id);
    if (current === undefined) return { ok: false, rule: 'not-found' };
    if (permissionOf(stores, actorFor(stores.principals, actor.id), id) !== 'admin') return { ok: false, rule: 'forbidden' };
    if (current.name !== valid.name) stores.workspaces.rename(id, valid.name);
    const committed = stores.workspaces.findById(id)!;
    try {
      await stores.files.writeSidecar(committed);
      return { ok: true, workspace: committed, sidecarSync: 'synced' };
    } catch {
      return { ok: true, workspace: committed, sidecarSync: 'pending' };
    }
  } finally {
    release();
    if (renameTails.get(id) === queued) renameTails.delete(id);
  }
}
