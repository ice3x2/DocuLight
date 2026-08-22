import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  permissionBatch,
  permissionOf,
  visibleWorkspacesOf,
  type Actor,
} from '../acl/permission-service.js';
import { permits } from '../../domain/acl/level.js';
import { isVersioned } from '../../domain/document/version-layout.js';
import { findWikiLinks } from '../../domain/document/wiki-link.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';
import { workspaceRootOf, type DocumentStores } from './save-service.js';

/**
 * 링크 목록의 한 줄.
 *
 * **풀리지 않은 링크도 줄을 갖는다.** 지워 버리면 사용자는 자기가 적은
 * 링크가 사라졌다고 읽는데, 실은 아직 그 이름의 문서가 없을 뿐이다.
 */
export interface LinkRow {
  /** 풀렸으면 그 노드, 아니면 `null`. */
  nodeId: NodeId | null;
  /** 풀렸으면 노드 이름, 아니면 본문에 적힌 이름 그대로. */
  name: string;
  workspaceName: string | null;
  resolved: boolean;
}

export interface DocumentLinks {
  /** 이 문서가 가리키는 것들 (`CON-EDITOR-002` AC-3). */
  outgoing: LinkRow[];
  /** 이 문서를 가리키는 것들 (`CON-EDITOR-002` AC-2). */
  backlinks: LinkRow[];
}

/**
 * 이 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3).
 *
 * 볼 수 없는 문서에는 `null` — 없는 문서와 같은 답이다(`SEC-ACL-006`).
 *
 * **양쪽 다 요청자가 볼 수 있는 것만 담는다.** 아웃고잉에서 볼 수 없는
 * 대상은 「아직 없는 문서」와 같은 모양으로 내려간다: 다른 모양을 주면
 * 그 차이가 그 문서의 존재를 알린다. 백링크에서는 아예 빠진다 — 그쪽은
 * 요청자가 적은 것이 아니라 남이 적은 것이라 이름조차 새 정보다.
 *
 * 훑는 범위는 **접근 가능한 워크스페이스 전부**다. 큰 인스턴스에서는 이것이
 * 비싸므로 색인이 필요해지겠지만, 색인을 두면 그것과 본문이 어긋날 자리가
 * 생긴다 — 지금은 본문이 유일한 정본이다.
 */
export async function linksOf(
  stores: DocumentStores,
  actor: Actor,
  nodeId: NodeId,
): Promise<DocumentLinks | null> {
  const chain = stores.nodes.chainOf(nodeId);
  if (chain.length === 0 || !isServable(chain)) return null;

  const level = permissionOf(stores, actor, nodeId);
  if (level === null || !permits(level, 'view')) return null;

  const visible = visibleMarkdown(stores, actor);
  const names = await linkNamesOf(stores, visible);
  const mine = chain[0]!;

  return {
    outgoing: outgoingOf(names.get(nodeId) ?? [], visible, nodeId, mine.workspaceId),
    backlinks: visible
      .filter((one) => one.node.id !== nodeId && linksTo(names.get(one.node.id) ?? [], mine.name))
      .map((one) => row(one)),
  };
}

interface VisibleDocument {
  node: { id: NodeId; name: string; workspaceId: string };
  workspaceName: string;
  /**
   * 워크스페이스 루트 기준 경로.
   *
   * 여기서 들고 다니는 이유는 `pathOf` 가 노드마다 사슬을 다시 **질의**하기
   * 때문이다 — 문서 수만큼 질의가 붙어 `CON-ACL-001` AC-4 의 예산이 깨진다.
   * 그 워크스페이스의 노드를 이미 전부 들고 있으므로 메모리에서 엮는다.
   */
  path: string;
}

const row = (one: VisibleDocument): LinkRow => ({
  nodeId: one.node.id,
  name: one.node.name,
  workspaceName: one.workspaceName,
  resolved: true,
});

/** 확장자를 뗀 이름 — 사람은 `[[회의록]]` 이라 적지 `[[회의록.md]]` 라 적지 않는다. */
const stem = (name: string) => name.replace(/\.[^.]+$/, '');

const linksTo = (targets: readonly string[], name: string) =>
  targets.some((target) => target === stem(name) || target === name);

/**
 * 본문이 가리키는 것들.
 *
 * 이름이 겹치면 **같은 워크스페이스의 것을 고른다.** 본문에 적히는 것은
 * 이름뿐이라 어느 워크스페이스인지를 표현할 문법이 없는데, 순회 순서로
 * 고르면 남의 워크스페이스 문서를 가리키는 링크가 조용히 생긴다 — 그리고
 * 그 어긋남은 두 워크스페이스에 같은 이름이 생기기 전까지 드러나지 않는다.
 */
function outgoingOf(
  targets: readonly string[],
  visible: readonly VisibleDocument[],
  self: NodeId,
  workspaceId: string,
): LinkRow[] {
  return targets.map((target) => {
    const named = visible.filter(
      (one) => one.node.id !== self && (stem(one.node.name) === target || one.node.name === target),
    );
    // 같은 워크스페이스에 없으면 다른 곳의 것이라도 푼다 — 못 풀면 링크가
    // 죽고, 워크스페이스를 가로지르는 참조 자체는 막을 이유가 없다.
    const found = named.find((one) => one.node.workspaceId === workspaceId) ?? named[0];
    return found === undefined
      ? { nodeId: null, name: target, workspaceName: null, resolved: false }
      : row(found);
  });
}

/** 위키링크 자동완성이 고를 후보 하나 (`CON-EDITOR-002` AC-1). */
export interface WikiTarget {
  /** 본문에 적히는 이름 — 확장자가 없다. */
  target: string;
  /** 목록에 보이는 이름. */
  label: string;
  /** 어느 워크스페이스의 것인지 — 이름이 겹치면 이것이 가른다. */
  detail: string;
}

/**
 * `[[` 를 친 자리에 세울 후보들 (`CON-EDITOR-002` AC-1).
 *
 * **본문을 읽지 않는다.** 이름만 필요한데 본문까지 읽으면 `[[` 를 칠 때마다
 * 워크스페이스 전체를 디스크에서 읽게 된다.
 *
 * 거르는 일은 여기서 한다 — 화면이 전부 받아 거르면 볼 수 있는 문서의
 * 이름 전부가 이미 브라우저에 와 있게 된다.
 */
export function wikiTargets(
  stores: DocumentStores,
  actor: Actor,
  query: string,
): WikiTarget[] {
  const wanted = query.trim().toLowerCase();

  // 이름으로 **먼저** 걸러 낸 뒤 판정한다 — 판정이 먼저면 이름이 안 맞는
  // 문서까지 권한을 재게 되고, `[[` 를 친 직후처럼 질의가 빈 순간에는
  // 그 비용이 워크스페이스 전체가 된다.
  return visibleMarkdown(stores, actor)
    .filter((one) => wanted === '' || stem(one.node.name).toLowerCase().includes(wanted))
    .map((one) => ({
      target: stem(one.node.name),
      label: one.node.name,
      detail: one.workspaceName,
    }));
}

/**
 * 요청자가 볼 수 있는 md 문서들 — 워크스페이스마다 **질의 두 번**.
 *
 * 노드마다 `permissionOf` 를 부르면 O(N) 이 메모리가 아니라 질의 쪽으로
 * 옮겨 붙어 `CON-ACL-001` AC-4 의 예산이 깨진다. 그 조항이 `permissionBatch`
 * 를 둔 이유가 정확히 이것이다.
 *
 * 경로도 함께 받아 둔다 — 뒤에서 `pathOf` 를 다시 부르면 그것이 사슬을
 * 또 읽어 노드마다 질의가 하나씩 더 붙는다.
 */
function visibleMarkdown(stores: DocumentStores, actor: Actor): VisibleDocument[] {
  const found: VisibleDocument[] = [];

  for (const entry of visibleWorkspacesOf(stores, actor)) {
    const all = stores.nodes.allIn(entry.workspace.id);
    const byId = new Map(all.map((node) => [node.id, node]));

    // 조상까지 이어 붙인 사슬. `chainOf` 를 부르면 노드마다 질의가 하나씩
    // 더 붙어 `CON-ACL-001` AC-4 의 예산이 깨지므로 메모리에서 엮는다.
    const chainOf = (id: NodeId) => {
      const chain = [];
      for (let cursor: NodeId | null = id; cursor !== null; ) {
        const node = byId.get(cursor);
        if (node === undefined) break;
        chain.push(node);
        cursor = node.parentId;
      }
      return chain;
    };

    // **관문이 권한보다 먼저 선다** (`SEC-WORKSPACE-004` AC-2). 「내보내도
    // 되는가」는 두 질문의 곱인데 여기서 권한만 보면 휴지통에 든 문서와
    // `.obsidian` 아래 문서가 자동완성 후보와 백링크로 그대로 나간다 —
    // 그 셋은 이름·상태 축이라 **슈퍼유저에게도** 거부되어야 한다.
    const candidates = all.filter(
      (node) => node.kind === 'file' && isVersioned(node.name) && isServable(chainOf(node.id)),
    );
    if (candidates.length === 0) continue;

    const permits_ = permissionBatch(
      stores,
      actor,
      candidates.map((node) => node.id),
      entry.workspace.id,
    );

    // 경로도 같은 사슬에서 나온다 — 규칙은 `pathOf` 와 같다: 이름을
    // 루트부터 이어 붙인다.
    const pathOf = (id: NodeId): string =>
      chainOf(id)
        .map((node) => node.name)
        .reverse()
        .join('/');

    for (const node of candidates) {
      const level = permits_(node.id);
      if (level === null || !permits(level, 'view')) continue;
      found.push({ node, workspaceName: entry.workspace.name, path: pathOf(node.id) });
    }
  }

  return found;
}

/**
 * 그 문서들이 가리키는 이름들 — 본문을 **붙들지 않는다.**
 *
 * 링크 판정에 필요한 것은 `findWikiLinks` 의 결과뿐인데 본문을 배열에
 * 쌓아 두면 요청 하나가 워크스페이스 전체 크기만큼 메모리를 잡고, 동시
 * 요청 수만큼 곱해진다.
 */
async function linkNamesOf(
  stores: DocumentStores,
  documents: readonly VisibleDocument[],
): Promise<Map<NodeId, readonly string[]>> {
  const names = new Map<NodeId, readonly string[]>();

  for (const one of documents) {
    const root = workspaceRootOf(stores, one.node.workspaceId);
    const body = await readIfPresent(join(root, one.path));
    // 실체가 아직 없는 노드는 링크를 갖지 못한다 — 재조정이 안 닿았을 뿐
    // 조작이 잘못된 것은 아니므로 건너뛴다.
    if (body === null) continue;
    names.set(one.node.id, findWikiLinks(body));
  }

  return names;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
