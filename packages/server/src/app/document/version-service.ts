import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { permissionOf, type Actor } from '../acl/permission-service.js';
import { readSetting } from '../settings/instance-settings.js';
import { permits } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { VersionRecord } from '../../domain/ports/version-repository.js';
import {
  isVersioned,
  versionDirectoryOf,
  versionPathOf,
  versionSidecarName,
} from '../../domain/document/version-layout.js';
import { readDocument, saveDocument, workspaceRootOf, type DocumentStores } from './save-service.js';

/** 설정된 보관 개수. 없거나 숫자가 아니면 레지스트리의 기본값. */
export function retainedVersionCount(stores: DocumentStores): number {
  const stored = Number(readSetting(stores.settings, 'retained-version-count'));
  return Number.isFinite(stored) && stored > 0 ? stored : 20;
}

/**
 * 편집 세션을 연다 (`FR-STORAGE-003` AC-1 · AC-2).
 *
 * 세션을 **DB 에 적는** 이유는 「이 세션이 이미 찍었는가」가 재기동을
 * 넘어 살아야 하기 때문이다 — 프로세스 메모리에 두면 재기동 뒤 같은
 * 편집이 스냅샷을 하나 더 찍는다.
 */
export function beginEditSession(stores: DocumentStores, actor: Actor, nodeId: NodeId): string {
  const id = randomUUID();
  stores.versions.openSession({
    id,
    nodeId,
    actorId: actor.id,
    startedAt: stores.clock().toISOString(),
    snapshotSeq: null,
  });
  return id;
}

export interface VersionView extends VersionRecord {
  /** 실체 파일의 절대 경로. */
  path: string;
}

/** 이 문서의 버전들. 순번 순. */
export function listVersions(stores: DocumentStores, _actor: Actor, nodeId: NodeId): VersionView[] {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined) return [];

  const root = workspaceRootOf(stores, node.workspaceId);
  return stores.versions
    .listOf(nodeId)
    .map((record) => ({ ...record, path: versionPathOf(root, nodeId, record.seq) }));
}

interface SnapshotInput {
  nodeId: NodeId;
  workspaceId: string;
  /** 저장 **이전**의 본문 — 되돌릴 대상이 그것이다 (`FR-STORAGE-003` AC-3). */
  previousBody: string;
  session?: string;
  /**
   * 세션당 1회 규칙을 **건너뛴다** (`FR-STORAGE-001` AC-4).
   *
   * Ctrl+S 는 사용자가 「여기를 기억해 둬」라고 말한 지점이다 — 두 번
   * 말했으면 두 지점이 남아야 한다.
   */
  force?: boolean;
}

/**
 * 그 세션의 첫 저장이면 스냅샷을 하나 찍는다 (`FR-STORAGE-003`).
 *
 * 세션이 주어지지 않은 저장은 **찍지 않는다** — 세션 없는 저장까지 찍으면
 * 「세션당 1회」가 「저장마다 1회」가 되고, 그것이 이 요구가 막으려는 것이다.
 */
export async function snapshotIfFirstSave(
  stores: DocumentStores,
  actor: Actor,
  input: SnapshotInput,
): Promise<void> {
  if (input.session === undefined) return;

  const node = stores.nodes.findById(input.nodeId);
  if (node === undefined || !isVersioned(node.name)) return;

  const session = stores.versions.findSession(input.session);
  if (session === undefined) return;
  // 강제가 아니면 그 세션이 이미 찍었는지 본다.
  if (input.force !== true && session.snapshotSeq !== null) return;

  const seq = stores.versions.nextSeq(input.nodeId);
  const root = workspaceRootOf(stores, input.workspaceId);
  const path = versionPathOf(root, input.nodeId, seq);
  const record: VersionRecord = {
    nodeId: input.nodeId,
    seq,
    createdAt: stores.clock().toISOString(),
    author: actor.id,
  };

  await mkdir(versionDirectoryOf(root, input.nodeId), { recursive: true });
  await writeFile(path, input.previousBody, 'utf8');
  // 사이드카를 실체 **뒤에** 쓴다 — 앞에 쓰면 실체 없는 사이드카가 남아
  // 인덱스를 되세울 때 유령이 섞인다.
  await writeFile(versionSidecarName(path), JSON.stringify(record, null, 2), 'utf8');

  stores.versions.add(record);
  stores.versions.markSnapshot(session.id, seq);

  await prune(stores, input.nodeId, root);
}

/** 보관 개수를 넘긴 만큼 **가장 오래된 것부터** 걷는다 (`FR-STORAGE-004`). */
async function prune(stores: DocumentStores, nodeId: NodeId, root: string): Promise<void> {
  const kept = retainedVersionCount(stores);
  const all = stores.versions.listOf(nodeId);
  if (all.length <= kept) return;

  for (const doomed of all.slice(0, all.length - kept)) {
    const path = versionPathOf(root, nodeId, doomed.seq);
    // 실체·사이드카·인덱스를 함께 걷는다 — 하나만 남으면 목록과 디스크가
    // 어긋나고, 사이드카가 정본이라 그 어긋남이 재구성으로 되살아난다.
    await rm(path, { force: true });
    await rm(versionSidecarName(path), { force: true });
    stores.versions.remove(nodeId, doomed.seq);
  }
}

export type RestoreOutcome = { ok: true } | { ok: false; rule: 'unknown-node' | 'unknown-version' | 'forbidden' };

/**
 * 그 버전으로 되돌린다 (`IR-STORAGE-001` AC-2 · AC-4).
 *
 * **저장 경로를 그대로 탄다.** 그래서 복원 자체가 버전으로 남고, 노드 ID
 * 도 바뀌지 않는다 — 복원을 되돌릴 길이 없으면 잘못 고른 복원이 최종이
 * 되고, ID 가 바뀌면 그 문서를 가리키던 딥링크·ACL·첨부 소유가 끊긴다.
 */
export async function restoreVersion(
  stores: DocumentStores,
  actor: Actor,
  input: { nodeId: NodeId; seq: number },
): Promise<RestoreOutcome> {
  const node = stores.nodes.findById(input.nodeId);
  if (node === undefined) return { ok: false, rule: 'unknown-node' };

  const level = permissionOf(stores, actor, input.nodeId);
  if (level === null || !permits(level, 'edit')) return { ok: false, rule: 'forbidden' };

  const found = listVersions(stores, actor, input.nodeId).find((v) => v.seq === input.seq);
  if (found === undefined) return { ok: false, rule: 'unknown-version' };

  const body = await readFile(found.path, 'utf8');
  const session = beginEditSession(stores, actor, input.nodeId);
  const read = await readDocument(stores, actor, input.nodeId);
  if (!read.ok) return { ok: false, rule: 'unknown-node' };

  const saved = await saveDocument(stores, actor, {
    nodeId: input.nodeId,
    body,
    baseHash: read.hash,
    session,
  });

  return saved.ok ? { ok: true } : { ok: false, rule: 'forbidden' };
}

/**
 * 사이드카만으로 버전 인덱스를 되세운다 (`DR-STORAGE-005` AC-2 · AC-3).
 *
 * **사이드카가 정본이고 DB 는 그 캐시다.** 둘이 어긋나면 사이드카가 이긴다 —
 * DB 가 손상돼도 파일시스템만으로 목록을 되세울 수 있어야 하기 때문이며,
 * 그 성질은 되세우는 경로가 실제로 있을 때만 참이다.
 *
 * **실체 없는 사이드카는 건너뛴다.** 남겨 두면 목록에 유령이 섞이고,
 * 사용자가 그것을 고르면 열리지 않는 버전이 된다.
 */
export async function rebuildVersionIndex(stores: DocumentStores, nodeId: NodeId): Promise<void> {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined) return;

  const root = workspaceRootOf(stores, node.workspaceId);
  const home = versionDirectoryOf(root, nodeId);

  let names: string[];
  try {
    names = await readdir(home);
  } catch {
    // 디렉토리가 없다는 것은 버전이 하나도 없다는 뜻이다.
    stores.versions.replaceAllOf(nodeId, []);
    return;
  }

  const found: VersionRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;

    const sidecarPath = join(home, name);
    const bodyPath = sidecarPath.slice(0, -'.json'.length);
    if (!(await exists(bodyPath))) continue;

    try {
      const record = JSON.parse(await readFile(sidecarPath, 'utf8')) as VersionRecord;
      // 파일 이름이 아니라 사이드카가 적은 값을 믿는다 — 이름은 바뀔 수
      // 있지만 사이드카는 그 자체가 정본이다.
      if (record.nodeId === nodeId) found.push(record);
    } catch {
      // 깨진 사이드카는 없는 것과 같이 다룬다 — 반쪽만 읽어 목록에 넣으면
      // 그 항목이 나중에 어디서 터질지 알 수 없다.
    }
  }

  stores.versions.replaceAllOf(
    nodeId,
    found.sort((a, b) => a.seq - b.seq),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
