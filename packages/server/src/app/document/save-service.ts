import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { permissionOf, type AclStores, type Actor } from '../acl/permission-service.js';
import { reachedByGateOnly } from '../acl/accessor-service.js';
import type { Clock } from '../auth/login-service.js';
import { contentHash } from '../../domain/document/content-hash.js';
import { permits } from '../../domain/acl/level.js';
import { isServable } from '../../domain/serving/servable.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { VersionRepository } from '../../domain/ports/version-repository.js';
import type { VectorIndex } from '../../domain/ports/vector-index.js';
import { indexNode } from '../search/index-node.js';
import { snapshotIfFirstSave } from './version-service.js';

export interface DocumentStores extends AclStores {
  versions: VersionRepository;
  clock: Clock;
  /** 워크스페이스들이 사는 루트. 본문의 SSOT 는 이 아래 파일들이다. */
  docsRoot: string;
  /**
   * 벡터 색인 (`FR-ARCH-001` AC-4). 저장이 이것을 따라온다.
   *
   * **선택으로 둔다.** 색인이 없는 조립(이행 도구·좁은 시험)이 실재하고,
   * 그 자리에 빈 구현을 억지로 끼우면 색인이 도는지 아닌지가 호출자마다
   * 갈린다 — 없으면 없는 대로 저장은 성립한다.
   */
  vectors?: VectorIndex;
}

export type SaveRule = 'unknown-node' | 'forbidden' | 'conflict';

export type ReadOutcome = { ok: true; body: string; hash: string } | { ok: false; rule: SaveRule };

export type SaveOutcome =
  | { ok: true; hash: string }
  /** 충돌은 **서버의 현재 본문을 함께 준다** — 그것 없이는 머지 뷰가 열리지 않는다. */
  | { ok: false; rule: 'conflict'; current: string }
  | { ok: false; rule: Exclude<SaveRule, 'conflict'> };

export interface SaveInput {
  nodeId: NodeId;
  body: string;
  /** 클라이언트가 이 문서를 **읽은 시점**의 내용 해시 (`FR-STORAGE-002` AC-1). */
  baseHash: string;
  /** 편집 세션. 주면 그 세션의 첫 저장에 스냅샷이 하나 생긴다. */
  session?: string;
  /**
   * 세션당 1회 규칙과 **무관하게** 스냅샷을 남긴다 (`FR-STORAGE-001` AC-4).
   *
   * Ctrl+S 가 이것을 켠다 — 사용자가 명시로 「여기」라고 짚은 지점이라
   * 자동 저장의 볼륨 규칙에 묶이지 않는다.
   */
  forceSnapshot?: boolean;
}

/** 워크스페이스 루트 기준 실체 경로. `docsRoot` 하나만 있으면 된다. */
export function workspaceRootOf(stores: { docsRoot: string }, workspaceId: string): string {
  return join(stores.docsRoot, workspaceId);
}

/**
 * 상방 게이트로만 닿은 열람 (`OBS-AUDIT-003` AC-3).
 *
 * 어느 게이트인지를 이 값에 섞지 않는다 — 섞으면 조작 값의 distinct 집합이
 * 게이트 종류만큼 부풀어 필터가 못 쓰게 된다 (`DR-AUDIT-001` AC-7).
 */
export const GATED_READ = 'node.gated-read';

function locate(
  stores: DocumentStores,
  nodeId: NodeId,
): { workspaceId: string; path: string } | undefined {
  const chain = stores.nodes.chainOf(nodeId);
  if (chain.length === 0 || !isServable(chain)) return undefined;

  const node = chain[0]!;
  return { workspaceId: node.workspaceId, path: join(workspaceRootOf(stores, node.workspaceId), stores.nodes.pathOf(nodeId)) };
}

/**
 * 본문과 그 해시를 함께 읽는다 (`FR-STORAGE-002` AC-1).
 *
 * 해시를 **읽을 때** 주는 것이 이 설계의 요점이다 — 클라이언트가 스스로
 * 계산하면 정규화 방식이 서버와 갈리는 순간 아무도 저장하지 못하거나
 * 아무 충돌도 잡히지 않는다.
 *
 * 권한이 없는 문서와 없는 문서에 **같은 답**을 준다 — 다르면 그 차이가
 * 문서의 존재를 알린다(`SEC-ACL-006`).
 */
export async function readDocument(
  stores: DocumentStores,
  actor: Actor,
  nodeId: NodeId,
): Promise<ReadOutcome> {
  const found = locate(stores, nodeId);
  if (found === undefined) return { ok: false, rule: 'unknown-node' };

  // 열람·저장은 조작 표의 항목이 아니라 그 노드의 유효 권한 자체다 —
  // 닫힌 조작 열거에 항목을 더하면 그 표가 요구가 정한 목록이 아니게 된다.
  const level = permissionOf(stores, actor, nodeId);
  if (level === null || !permits(level, 'view')) return { ok: false, rule: 'unknown-node' };

  // **상방 게이트로만 닿은 열람은 기록한다** (`OBS-AUDIT-003` AC-3).
  // 순수 읽기는 기록 대상이 아니지만(AC-4), 판정을 우회해 도달한 읽기는
  // 그 자체가 기준 ③ 이다 — 완전 숨김 아래에서 관리자가 남의 문서를 여는
  // 유일한 경로이므로, 그 사용을 되짚을 수단이 없으면 게이트가 감사 없는
  // 만능 키가 된다.
  if (reachedByGateOnly(stores, actor, nodeId)) {
    stores.audit.append({
      operation: GATED_READ,
      actor: actor.id,
      nodeId,
      workspaceId: found.workspaceId,
    });
  }

  const body = await readFile(found.path, 'utf8');
  return { ok: true, body, hash: contentHash(body) };
}

/**
 * 저장 (`FR-STORAGE-001` · `FR-STORAGE-002`).
 *
 * 충돌 판정이 **디스크의 현재 내용**을 읽어 이뤄진다. 캐시된 해시를 쓰면
 * 서버에서 사람이 셸로 고친 변경(AC-4)이 지나가고, 그것은 파일시스템을
 * 본문의 SSOT 로 삼은 전제를 무너뜨린다.
 */
export async function saveDocument(
  stores: DocumentStores,
  actor: Actor,
  input: SaveInput,
): Promise<SaveOutcome> {
  const found = locate(stores, input.nodeId);
  if (found === undefined) return { ok: false, rule: 'unknown-node' };

  const level = permissionOf(stores, actor, input.nodeId);
  if (level === null || !permits(level, 'edit')) return { ok: false, rule: 'forbidden' };

  const current = await readFile(found.path, 'utf8');
  if (contentHash(current) !== input.baseHash) {
    // 거절만 하고 파일을 건드리면 거절이 무의미해진다 — 여기서 아무것도
    // 쓰지 않는 것이 AC-3 의 내용이다.
    return { ok: false, rule: 'conflict', current };
  }

  await snapshotIfFirstSave(stores, actor, {
    nodeId: input.nodeId,
    workspaceId: found.workspaceId,
    previousBody: current,
    session: input.session,
    ...(input.forceSnapshot === true ? { force: true } : {}),
  });

  await writeFile(found.path, input.body, 'utf8');

  // **쓴 뒤에 색인한다** (`FR-ARCH-001` AC-4). 거절된 저장은 여기까지 오지
  // 못하므로 색인이 실제 문서에 없는 문장을 가리키는 일이 없다.
  //
  // 색인은 파일을 다시 읽으므로 방금 쓴 내용을 본다 — 본문을 인자로
  // 넘기지 않는 이유는 그러면 「디스크가 SSOT」라는 전제가 이 경로에서만
  // 깨지기 때문이다.
  if (stores.vectors !== undefined) {
    await indexNode({ ...stores, vectors: stores.vectors }, input.nodeId);
  }

  return { ok: true, hash: contentHash(input.body) };
}
