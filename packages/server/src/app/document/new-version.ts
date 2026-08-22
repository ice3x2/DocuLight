import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { permissionOf, type Actor } from '../acl/permission-service.js';
import { uploadLimitBytes } from '../attachment/attachment-service.js';
import { permits } from '../../domain/acl/level.js';
import { isVersioned } from '../../domain/document/version-layout.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';
import { beginEditSession, snapshotIfFirstSave } from './version-service.js';
import { workspaceRootOf, type DocumentStores } from './save-service.js';

export type NewVersionRule = 'unknown-node' | 'forbidden' | 'not-a-file' | 'too-large';

export type NewVersionOutcome = { ok: true } | { ok: false; rule: NewVersionRule };

/**
 * 새 버전을 올리면 이전 것을 되찾을 수 없는가 (`FR-SHELL-008` AC-5).
 *
 * 버전 보관 대상이 md 뿐이므로(`FR-STORAGE-003` AC-5) 그 밖은 전부
 * 되돌릴 수 없다. **두 사실을 한 판정으로 묶는** 이유는 갈리면 경고가
 * 사실과 어긋나기 때문이다 — 어긋난 경고를 한 번 본 사용자는 다음
 * 경고도 믿지 않는다.
 */
export function warnsIrreversible(name: string): boolean {
  return !isVersioned(name);
}

/**
 * 기존 파일을 골라 덮어쓴다 (`FR-SHELL-008`).
 *
 * **덮어쓰기의 유일한 경로다.** 생성·업로드 흐름에는 덮어쓰기 선택지가
 * 없다(AC-1) — 이름이 겹치면 접미사를 붙일 뿐이다(`SEC-SHELL-002`).
 * 덮어쓰기를 별도 조작으로 떼어 놓으면 사용자가 그것을 고의로 고를 때만
 * 일어난다.
 *
 * 매번 **새 편집 세션**이다. 세션당 1회 규칙이 여기서는 「올릴 때마다 1회」로
 * 읽히는데, 그것이 이 조작의 뜻과 맞는다 — 한 번 올리는 것이 한 번의 편집이다.
 */
export async function uploadNewVersion(
  stores: DocumentStores,
  actor: Actor,
  input: { nodeId: NodeId; bytes: Buffer },
): Promise<NewVersionOutcome> {
  const chain = stores.nodes.chainOf(input.nodeId);
  if (chain.length === 0 || !isServable(chain)) return { ok: false, rule: 'unknown-node' };

  const node = chain[0]!;
  const level = permissionOf(stores, actor, input.nodeId);

  // 판정이 두 단계다. **볼 수도 없는** 요청자에게는 없는 노드와 같은 답을
  // 준다 — 다르면 그 차이가 그 파일의 존재를 알린다(`SEC-ACL-006`).
  if (level === null || !permits(level, 'view')) return { ok: false, rule: 'unknown-node' };
  // 볼 수는 있으나 못 고치는 요청자에게는 거절이 정직한 답이다. 그는 그
  // 파일이 있다는 것을 이미 알고 있으므로 숨길 것이 없다.
  if (!permits(level, 'edit')) return { ok: false, rule: 'forbidden' };

  if (node.kind !== 'file') return { ok: false, rule: 'not-a-file' };

  // **쓰기 전에** 재고 거절한다. 뒤로 미루면 거절된 파일이 이미 원본을
  // 덮은 뒤가 되고, 그 원본은 되돌릴 수 없다.
  //
  // 판정을 라우트가 아니라 여기서 하는 이유 — 라우트마다 손으로 적으면
  // 새 경로를 낼 때 빠뜨리게 되고, 빠뜨린 그 경로에서만 제한이 없다.
  if (input.bytes.byteLength > uploadLimitBytes(stores)) return { ok: false, rule: 'too-large' };

  const root = workspaceRootOf(stores, node.workspaceId);
  const path = join(root, stores.nodes.pathOf(input.nodeId));

  // 덮기 **전에** 스냅샷을 찍는다. md 가 아니면 스냅샷이 생기지 않고,
  // 그 사실이 `warnsIrreversible` 의 경고를 참으로 만든다.
  const previous = isVersioned(node.name) ? await readIfPresent(path) : null;
  if (previous !== null) {
    await snapshotIfFirstSave(stores, actor, {
      nodeId: input.nodeId,
      workspaceId: node.workspaceId,
      previousBody: previous,
      session: beginEditSession(stores, actor, input.nodeId),
    });
  }

  await writeFile(path, input.bytes);
  return { ok: true };
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    // 실체가 없는 노드에 새 버전을 올리는 것은 재조정이 아직 안 닿은
    // 상태다 — 보관할 이전 본문이 없을 뿐 조작 자체는 성립한다.
    return null;
  }
}
