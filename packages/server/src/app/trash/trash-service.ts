import { basename } from 'node:path';

import { permissionBatch, permissionOf, type AclStores, type Actor } from '../acl/permission-service.js';
import type { Clock } from '../auth/login-service.js';
import { purgeAttachmentsOf, type AttachmentPurgeStores } from '../attachment/attachment-service.js';
import { readSetting } from '../settings/instance-settings.js';
import { resolveNameCollision } from '../../domain/naming/collision.js';
import { permits } from '../../domain/acl/level.js';
import { requirementFor, satisfies } from '../../domain/acl/operation-policy.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { TrashFiles } from '../../domain/ports/trash-files.js';
import type { TrashRepository } from '../../domain/ports/trash-repository.js';
import { isExpired, type TrashEntry } from '../../domain/trash/trash-entry.js';

/** 보존 기간의 기본값 (`FR-STORAGE-007` AC-1). */
export const DEFAULT_RETENTION_DAYS = 30;

/** 설정 키. 두 곳에 적으면 한쪽 오타가 조용히 기본값을 쓴다. */

export interface TrashStores extends AclStores, AttachmentPurgeStores {
  trash: TrashRepository;
  trashFiles: TrashFiles;
  clock: Clock;
}

export type TrashRule = 'unknown-node' | 'forbidden' | 'not-in-trash' | 'parent-gone';

export type TrashOutcome = { ok: true } | { ok: false; rule: TrashRule };
export type RestoreOutcome = { ok: true; name: string } | { ok: false; rule: TrashRule };
export type TrashList = { ok: true; entries: TrashEntry[] } | { ok: false; rule: TrashRule };

/**
 * 이 노드가 휴지통에 있는가.
 *
 * 트리와 서빙이 이것을 보고 거른다 — 노드 행은 남아 있으므로
 * (`FR-STORAGE-005` AC-5) 걸러 주지 않으면 지운 문서가 그대로 열린다.
 */
export function isTrashed(stores: TrashStores, nodeId: NodeId): boolean {
  return stores.trash.find(nodeId) !== undefined;
}

/**
 * 이 서브트리에 요청자가 볼 수 없는 노드가 있는가 (`SEC-ACL-013`).
 *
 * 삭제도 이동과 **같은 판정**을 쓴다. wave-2 가 `hasHiddenDescendant` 를
 * 이동에만 물려 뒀는데, 그때 남긴 이월 잔여가 정확히 이것이었다 — 삭제를
 * 붙일 때 함께 물리지 않으면 그 AC 가 조용히 빠진다.
 */
function hasHiddenDescendant(stores: TrashStores, actor: Actor, nodeId: NodeId): boolean {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined || node.kind !== 'directory') return false;

  const descendants = stores.nodes
    .allIn(node.workspaceId)
    .filter((candidate) => candidate.id !== nodeId)
    .filter((candidate) => stores.nodes.chainOf(candidate.id).some((link) => link.id === nodeId))
    .map((candidate) => candidate.id);

  if (descendants.length === 0) return false;

  const levelOf = permissionBatch(stores, actor, descendants, node.workspaceId);
  return descendants.some((id) => levelOf(id) === null);
}

/**
 * 삭제 — 파일을 지우지 않고 휴지통으로 옮긴다 (`FR-STORAGE-005`).
 *
 * 노드 행·ACL·이력을 남긴다(AC-5). 그것들이 사라지면 복구해도 「누가 볼 수
 * 있었는가」가 돌아오지 않는다.
 */
export async function moveToTrash(
  stores: TrashStores,
  actor: Actor,
  nodeId: NodeId,
): Promise<TrashOutcome> {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined || isTrashed(stores, nodeId)) return { ok: false, rule: 'unknown-node' };

  const requirement = requirementFor('delete', {
    hasHiddenDescendant: hasHiddenDescendant(stores, actor, nodeId),
  });
  const held = {
    parent: null,
    target: permissionOf(stores, actor, nodeId),
    destination: null,
    workspace: permissionOf(stores, actor, node.workspaceId),
  };
  if (!satisfies(requirement, held)) return { ok: false, rule: 'forbidden' };

  const entry: TrashEntry = {
    nodeId,
    workspaceId: node.workspaceId,
    originalPath: stores.nodes.pathOf(nodeId),
    deletedAt: stores.clock().toISOString(),
    deletedBy: actor.id,
  };

  await stores.trashFiles.moveIn(entry, node.name);
  stores.trash.add(entry);

  return { ok: true };
}

/**
 * 휴지통 목록 (`SEC-STORAGE-002`).
 *
 * 범위가 **요청마다 현재 권한으로** 정해진다(AC-4). 목록을 만들 때 한 번
 * 정해 두면 관리 권한을 잃은 사용자가 그 목록을 계속 본다.
 *
 * 남의 항목은 **건수로도 드러나지 않는다**(AC-2) — 걸러진 목록을 돌려줄 뿐
 * 「몇 건이 더 있다」를 함께 주지 않는다.
 */
export function listTrash(stores: TrashStores, actor: Actor, workspaceId: string): TrashList {
  const level = permissionOf(stores, actor, workspaceId);
  const all = stores.trash.listIn(workspaceId);

  const seesEverything = level !== null && permits(level, 'admin');

  return {
    ok: true,
    entries: seesEverything ? all : all.filter((entry) => entry.deletedBy === actor.id),
  };
}

/**
 * 복구 (`FR-STORAGE-006`).
 *
 * 권한 판정을 **원본 부모 체인 기준**으로 한다 — 휴지통 안의 자리가 아니라
 * 돌아갈 자리의 권한이 그 조작의 근거이기 때문이다.
 *
 * 부모 체인이 사라졌으면 fail-closed 다(AC-4) — 어디로 돌아갈지 모르는
 * 항목을 아무 데나 두면 그것이 곧 권한 경계 밖으로 새는 길이 된다.
 * 관리 권한 보유자가 **대체 위치를 명시**해야 열린다(AC-5).
 */
export async function restoreFromTrash(
  stores: TrashStores,
  actor: Actor,
  nodeId: NodeId,
  options: { into?: NodeId | null } = {},
): Promise<RestoreOutcome> {
  const entry = stores.trash.find(nodeId);
  const node = stores.nodes.findById(nodeId);
  if (entry === undefined || node === undefined) return { ok: false, rule: 'not-in-trash' };

  // 부모 체인이 **쓸 수 있는가**. 사라진 것과 휴지통에 든 것을 같이 본다 —
  // 휴지통에 든 부모 아래로 되돌리면 그 항목은 트리에 나타나지 않은 채
  // 「복구됐다」고 보고되고, 아무도 찾지 못한다.
  const parentAlive =
    node.parentId === null ||
    stores.nodes
      .chainOf(node.parentId)
      .every((link) => link.trashedAt === null) &&
      stores.nodes.findById(node.parentId) !== undefined;
  const workspaceLevel = permissionOf(stores, actor, entry.workspaceId);
  const isWorkspaceAdmin = workspaceLevel !== null && permits(workspaceLevel, 'admin');

  if (!parentAlive) {
    // 대체 위치를 **명시**해야 한다. 관리 권한만으로 열면 「어디로 갔는지
    // 모르는 복구」가 생기고, 그 항목은 아무도 찾지 못한다.
    if (!isWorkspaceAdmin || options.into === undefined) return { ok: false, rule: 'parent-gone' };
  }

  const parentId = parentAlive ? node.parentId : (options.into ?? null);

  // 돌아갈 자리의 편집 권한. 부모가 루트면 워크스페이스가 그 자리다.
  const destination = permissionOf(stores, actor, parentId ?? entry.workspaceId);
  if (destination === null || !permits(destination, 'edit')) return { ok: false, rule: 'forbidden' };

  // 같은 이름이 이미 있으면 접미사를 붙인다 (AC-6) — 덮어쓰면 그 자리에
  // 있던 문서가 아무 흔적 없이 사라진다.
  const name = resolveNameCollision(
    basename(entry.originalPath),
    stores.nodes
      .children({ workspaceId: entry.workspaceId, parentId, except: nodeId })
      .filter((sibling) => !isTrashed(stores, sibling.id))
      .map((sibling) => sibling.name),
  );

  stores.nodes.relocate(nodeId, { parentId, name });
  await stores.trashFiles.moveOut(entry, basename(entry.originalPath), stores.nodes.pathOf(nodeId));
  stores.trash.remove(nodeId);

  return { ok: true, name };
}

/**
 * 영구 삭제 (`SEC-STORAGE-003`).
 *
 * 워크스페이스 **관리** 권한을 요구한다 — 본인이 지운 것이라도 마찬가지다
 * (AC-3). 되돌릴 수 없는 조작이라 「내 것이니 내가 지운다」로 열면 실수
 * 하나가 복구 불가능해진다.
 *
 * 판정 기준은 **그 항목이 속한 워크스페이스**다(AC-5) — 한 워크스페이스의
 * 관리자가 다른 워크스페이스의 항목을 지우지 못한다.
 */
export async function purgeFromTrash(
  stores: TrashStores,
  actor: Actor,
  nodeId: NodeId,
): Promise<TrashOutcome> {
  const entry = stores.trash.find(nodeId);
  if (entry === undefined) return { ok: false, rule: 'not-in-trash' };

  if (!canPurge(stores, actor, entry)) return { ok: false, rule: 'forbidden' };

  await hardDelete(stores, entry);
  return { ok: true };
}

/**
 * 이 요청자가 이 항목을 영구 삭제할 수 있는가 (`SEC-STORAGE-003` AC-5 · `SEC-SHELL-001`).
 *
 * 화면의 버튼 표시와 서버의 거절이 **같은 판정을 쓴다.** 둘로 나누면
 * 열려 보이는 버튼이 눌렀을 때 거절되거나 그 반대가 되고, 사용자에게는
 * 양쪽 다 고장으로 보인다.
 */
export function canPurge(stores: TrashStores, actor: Actor, entry: TrashEntry): boolean {
  const level = permissionOf(stores, actor, entry.workspaceId);
  return satisfies(requirementFor('purge'), {
    parent: null,
    target: null,
    destination: null,
    workspace: level,
  });
}

/** 실체·사이드카·인덱스·노드·ACL 을 함께 걷는다 (`SEC-STORAGE-003` AC-4). */
async function hardDelete(stores: TrashStores, entry: TrashEntry): Promise<void> {
  await stores.trashFiles.purge(entry);
  // 첨부를 **여기서** 걷는다 (`FR-ATTACH-005`). 휴지통으로 보내는 경로에는
  // 걸지 않는다(AC-3) — 복구할 수 있는 상태에서 첨부를 지우면 복구된
  // 문서가 깨져서 돌아온다.
  await purgeAttachmentsOf(stores, entry.nodeId);
  stores.trash.remove(entry.nodeId);
  // 노드 제거가 그 서브트리의 ACL 도 함께 걷는다 — 복구할 수 없다는 것이
  // 이 조작의 내용이다.
  stores.nodes.remove(entry.nodeId);
}

/** 설정된 보존 일수. 없거나 숫자가 아니면 기본값 (`FR-STORAGE-007` AC-1 · AC-3). */
export function retentionDays(stores: TrashStores): number {
  const stored = Number(readSetting(stores.settings, 'trash-retention-days'));
  return Number.isFinite(stored) && stored >= 0 ? stored : DEFAULT_RETENTION_DAYS;
}

/**
 * 보존 기간이 지난 항목을 자동으로 영구 삭제한다 (`FR-STORAGE-007` AC-2).
 *
 * **사람의 조작이 없다.** 그래서 권한 판정도 없다 — 판정할 주체가 없는
 * 조작이고, 그 사실이 이 함수가 요청 경로에서 불리면 안 되는 이유다.
 */
export async function sweepExpiredTrash(stores: TrashStores): Promise<{ purged: number }> {
  const days = retentionDays(stores);
  const now = stores.clock();

  let purged = 0;
  for (const entry of stores.trash.listAll()) {
    if (!isExpired(entry, days, now)) continue;
    await hardDelete(stores, entry);
    purged += 1;
  }
  return { purged };
}

/**
 * 사이드카에서 인덱스를 되세운다 (`DR-STORAGE-004` AC-2 · AC-3).
 *
 * DB 가 손상돼도 파일시스템만으로 목록이 돌아온다는 것이 이 함수의 존재
 * 이유이며, 어긋난 값에서 사이드카가 이기는 것도 여기서 성립한다 — 읽는
 * 쪽이 사이드카뿐이기 때문이다.
 */
export async function rebuildTrashIndex(stores: TrashStores, workspaceId: string): Promise<void> {
  stores.trash.replaceAll(workspaceId, await stores.trashFiles.readSidecars(workspaceId));
}
