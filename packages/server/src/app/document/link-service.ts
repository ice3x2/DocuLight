import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { permissionOf, visibleWorkspacesOf, type Actor } from '../acl/permission-service.js';
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

  const visible = await visibleDocuments(stores, actor);
  const me = visible.find((one) => one.node.id === nodeId);

  return {
    outgoing: outgoingOf(me?.body ?? '', visible, nodeId),
    backlinks: visible
      .filter((one) => one.node.id !== nodeId && linksTo(one.body, chain[0]!.name))
      .map((one) => row(one)),
  };
}

interface VisibleDocument {
  node: { id: NodeId; name: string; workspaceId: string };
  workspaceName: string;
  body: string;
}

const row = (one: VisibleDocument): LinkRow => ({
  nodeId: one.node.id,
  name: one.node.name,
  workspaceName: one.workspaceName,
  resolved: true,
});

/** 확장자를 뗀 이름 — 사람은 `[[회의록]]` 이라 적지 `[[회의록.md]]` 라 적지 않는다. */
const stem = (name: string) => name.replace(/\.[^.]+$/, '');

const linksTo = (body: string, name: string) =>
  findWikiLinks(body).some((target) => target === stem(name) || target === name);

function outgoingOf(
  body: string,
  visible: readonly VisibleDocument[],
  self: NodeId,
): LinkRow[] {
  return findWikiLinks(body).map((target) => {
    const found = visible.find(
      (one) => one.node.id !== self && (stem(one.node.name) === target || one.node.name === target),
    );
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
  const found: WikiTarget[] = [];

  for (const entry of visibleWorkspacesOf(stores, actor)) {
    for (const node of stores.nodes.allIn(entry.workspace.id)) {
      if (node.kind !== 'file' || !isVersioned(node.name)) continue;

      const target = stem(node.name);
      if (wanted !== '' && !target.toLowerCase().includes(wanted)) continue;

      const level = permissionOf(stores, actor, node.id);
      if (level === null || !permits(level, 'view')) continue;

      found.push({ target, label: node.name, detail: entry.workspace.name });
    }
  }

  return found;
}

/**
 * 요청자가 볼 수 있는 md 문서와 그 본문 전부.
 *
 * md 만 읽는 이유는 링크 문법이 md 안에만 있기 때문이다 — 바이너리를
 * 문자열로 읽으면 우연히 `[[` 가 나올 뿐 아니라 파일 크기만큼 메모리를 쓴다.
 */
async function visibleDocuments(
  stores: DocumentStores,
  actor: Actor,
): Promise<VisibleDocument[]> {
  const found: VisibleDocument[] = [];

  for (const entry of visibleWorkspacesOf(stores, actor)) {
    const root = workspaceRootOf(stores, entry.workspace.id);

    for (const node of stores.nodes.allIn(entry.workspace.id)) {
      if (node.kind !== 'file' || !isVersioned(node.name)) continue;

      const level = permissionOf(stores, actor, node.id);
      if (level === null || !permits(level, 'view')) continue;

      const body = await readIfPresent(join(root, stores.nodes.pathOf(node.id)));
      // 실체가 아직 없는 노드는 링크를 갖지 못한다 — 재조정이 안 닿았을 뿐
      // 조작이 잘못된 것은 아니므로 건너뛴다.
      if (body === null) continue;

      found.push({ node, workspaceName: entry.workspace.name, body });
    }
  }

  return found;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
