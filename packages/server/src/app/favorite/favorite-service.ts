import { permissionOf, type Actor, type AclStores } from '../acl/permission-service.js';
import { permits } from '../../domain/acl/level.js';
import type { FavoriteRepository } from '../../domain/ports/favorite-repository.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';

export interface FavoriteStores extends AclStores {
  favorites: FavoriteRepository;
}

/** 즐겨찾기 한 줄이 화면에 보이는 모습. 화면은 여기 온 것을 그대로 그린다. */
export interface FavoriteView {
  nodeId: NodeId;
  name: string;
  kind: 'file' | 'directory';
  /** 어느 워크스페이스의 것인지 — 목록이 전 워크스페이스를 가로지른다. */
  workspaceName: string;
}

export type FavoriteOutcome = { ok: true } | { ok: false; rule: 'unknown-node' };

/**
 * 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4).
 *
 * **문서와 디렉토리를 가리지 않는다.** 트리 비대화의 대응으로 디렉토리
 * 자체가 대상에 든 것이 이 요구의 결정이다.
 *
 * 필요 권한은 `보기` 다 — 더하기는 그 노드를 바꾸지 않는다. 볼 수 없는
 * 요청자에게는 없는 노드와 같은 답을 준다(`SEC-ACL-006`): 다른 답을
 * 주면 그 차이가 그 문서의 존재를 알린다.
 */
export function addFavorite(
  stores: FavoriteStores,
  actor: Actor,
  nodeId: NodeId,
): FavoriteOutcome {
  if (!canSee(stores, actor, nodeId)) return { ok: false, rule: 'unknown-node' };

  stores.favorites.add(actor.id, nodeId);
  return { ok: true };
}

/**
 * 뺀다.
 *
 * 권한을 묻지 않는다 — **자기 목록에서 지우는 일**이고, 볼 수 없게 된
 * 노드일수록 오히려 지울 수 있어야 한다. 권한을 걸면 권한을 잃은 즐겨찾기가
 * 목록에 영영 남는다.
 */
export function removeFavorite(stores: FavoriteStores, actor: Actor, nodeId: NodeId): void {
  stores.favorites.remove(actor.id, nodeId);
}

/**
 * 그 사람의 즐겨찾기 목록.
 *
 * **볼 수 없게 된 것은 빠진다.** 더할 때의 판정만 믿으면 권한을 잃은 뒤에도
 * 이름이 목록에 남고, 그 이름 자체가 그 문서의 존재를 알린다. 줄을 지우지는
 * 않는 이유는 권한이 돌아올 수 있기 때문이다 — 지우면 돌아와도 목록이 비어
 * 있고, 사용자는 자기가 지운 적 없는 것이 사라졌다고 읽는다.
 */
export function listFavorites(stores: FavoriteStores, actor: Actor): FavoriteView[] {
  const views: FavoriteView[] = [];

  for (const nodeId of stores.favorites.listOf(actor.id)) {
    if (!canSee(stores, actor, nodeId)) continue;

    const node = stores.nodes.chainOf(nodeId)[0]!;
    const workspace = stores.workspaces.findById(node.workspaceId);
    if (workspace === undefined) continue;

    views.push({
      nodeId,
      name: node.name,
      kind: node.kind,
      workspaceName: workspace.name,
    });
  }

  return views;
}

/** 지금 이 요청자에게 이 노드가 보이는가. 더하기와 목록이 같은 판정을 쓴다. */
function canSee(stores: FavoriteStores, actor: Actor, nodeId: NodeId): boolean {
  const chain = stores.nodes.chainOf(nodeId);
  if (chain.length === 0 || !isServable(chain)) return false;

  const level = permissionOf(stores, actor, nodeId);
  return level !== null && permits(level, 'view');
}
