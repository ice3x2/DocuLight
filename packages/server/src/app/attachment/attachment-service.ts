import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { permissionOf, type Actor } from '../acl/permission-service.js';
import { readSetting } from '../settings/instance-settings.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import { workspaceRootOf, type DocumentStores } from '../document/save-service.js';
import { permits } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type {
  AttachmentRecord,
  AttachmentRepository,
} from '../../domain/ports/attachment-repository.js';
import {
  extensionOf,
  RESOURCE_DIRECTORY,
  RESOURCE_INDEX,
  resourceHash,
  resourceLinkOf,
  resourcePathOf,
} from '../../domain/attachment/resource-layout.js';

/**
 * 첨부 폐기가 필요로 하는 것 **전부**.
 *
 * 좁게 잡는 이유는 영구 삭제를 소유한 휴지통이 이것을 받아야 하는데,
 * 넓게 잡으면 휴지통이 버전·시계까지 끌고 오게 되기 때문이다 — 그 둘은
 * 영구 삭제와 아무 관계가 없다.
 */
export interface AttachmentPurgeStores {
  attachments: AttachmentRepository;
  docsRoot: string;
}

export interface AttachmentStores extends DocumentStores, AttachmentPurgeStores {}

export type AttachRule = 'unknown-node' | 'forbidden' | 'too-large';

export type AttachOutcome =
  | { ok: true; hash: string; link: string }
  | { ok: false; rule: AttachRule };

export type OpenOutcome = { ok: true; bytes: Buffer } | { ok: false; rule: 'unknown-node' | 'forbidden' };

/** 설정된 업로드 상한 (`FR-ATTACH-006` AC-1). */
export function uploadLimitBytes(stores: { settings: SettingStore }): number {
  const stored = Number(readSetting(stores.settings, 'upload-size-limit-bytes'));
  return Number.isFinite(stored) && stored > 0 ? stored : 104857600;
}

const indexPathOf = (workspaceRoot: string) =>
  join(workspaceRoot, RESOURCE_DIRECTORY, RESOURCE_INDEX);

interface IndexEntry {
  /** 첫 소유자. 옛 형식과의 호환을 위해 남긴다. */
  ownerNodeId: string;
  /** 소유한 문서 전부 — 같은 바이트를 두 문서에 올릴 수 있다. */
  owners?: readonly string[];
  /**
   * 소유 문서마다의 원본 파일명 (`DR-ATTACH-002` AC-5 · `R149-g`).
   *
   * **해시 단위가 아니라 문서 단위다** — 같은 바이트를 두 사람이 각자의
   * 이름으로 올릴 수 있고, 해시 하나에 이름 하나만 두면 볼 수 없는 문서가
   * 붙인 이름이 볼 수 있는 문서 아래로 샌다.
   */
  originalNames?: Readonly<Record<string, string>>;
  extension: string;
  size: number;
  createdAt: string;
}

type IndexFile = Record<string, IndexEntry>;

async function readIndex(workspaceRoot: string): Promise<IndexFile> {
  try {
    return JSON.parse(await readFile(indexPathOf(workspaceRoot), 'utf8')) as IndexFile;
  } catch {
    // 없는 것과 깨진 것을 같이 다룬다 — 둘 다 「되세울 것이 없다」이고,
    // 여기서 갈라 봐야 호출자가 할 수 있는 일이 다르지 않다.
    return {};
  }
}

/**
 * 문서에 첨부를 올린다 (`FR-ATTACH-004` · `DR-ATTACH-001` · `DR-ATTACH-002`).
 *
 * 권한 판정 기준이 **그 문서**다(AC-3) — 디렉토리가 아니다. 어느 디렉토리에도
 * 편집 권한이 없지만 문서 하나에만 편집 권한을 받은 사용자가 그 문서를
 * 편집할 수 있어야 하고, 편집에는 이미지 붙여넣기가 든다.
 */
export async function attachToDocument(
  stores: AttachmentStores,
  actor: Actor,
  input: { nodeId: NodeId; fileName: string; bytes: Buffer },
): Promise<AttachOutcome> {
  const node = stores.nodes.findById(input.nodeId);
  if (node === undefined) return { ok: false, rule: 'unknown-node' };

  const level = permissionOf(stores, actor, input.nodeId);
  if (level === null || !permits(level, 'edit')) return { ok: false, rule: 'forbidden' };

  // 크기 검사가 **쓰기 전**에 온다 — 뒤에 두면 거부된 업로드가 디스크에
  // 실체를 남기고, 그 실체는 아무 소유도 갖지 않아 아무도 걷지 않는다.
  if (input.bytes.byteLength > uploadLimitBytes(stores)) return { ok: false, rule: 'too-large' };

  const root = workspaceRootOf(stores, node.workspaceId);
  const hash = resourceHash(input.bytes);
  const extension = extensionOf(input.fileName);
  const path = resourcePathOf(root, hash, extension);

  const record: AttachmentRecord = {
    hash,
    ownerNodeId: input.nodeId,
    workspaceId: node.workspaceId,
    extension,
    size: input.bytes.byteLength,
    createdAt: stores.clock().toISOString(),
    // 디스크 이름은 해시라(`R50`) 여기서 안 잡으면 되살릴 수 없다.
    originalName: input.fileName,
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.bytes);

  // 사이드카가 정본이므로 DB 보다 **먼저** 쓴다 — 뒤에 쓰면 DB 에만 있는
  // 첨부가 생기고, 그것은 재구성으로 사라진다.
  const index = await readIndex(root);
  const before = index[hash];
  const owners = new Set([...(before?.owners ?? (before ? [before.ownerNodeId] : [])), record.ownerNodeId]);
  index[hash] = {
    ownerNodeId: before?.ownerNodeId ?? record.ownerNodeId,
    owners: [...owners],
    originalNames: { ...before?.originalNames, [record.ownerNodeId]: record.originalName },
    extension: record.extension,
    size: record.size,
    createdAt: before?.createdAt ?? record.createdAt,
  };
  await writeFile(indexPathOf(root), JSON.stringify(index, null, 2), 'utf8');

  stores.attachments.add(record);
  return { ok: true, hash, link: resourceLinkOf(hash, extension) };
}

/**
 * 한 문서의 첨부를 다른 문서로 **복제한다** (`FR-ACL-001` AC-4 · AC-6).
 *
 * 공유하지 않고 복제하는 이유는 판정 기준이 **소유 문서**이기 때문이다
 * (`R66`) — 한 실체를 둘이 나눠 가지면 한쪽 문서의 권한 변경이 다른 쪽
 * 문서의 첨부 접근을 흔든다. 복제하면 원본과 복사본이 각자의 소유 행을
 * 갖고 각자의 문서로 판정된다.
 *
 * **본문은 건드리지 않는다.** 링크는 워크스페이스 기준 절대경로이고
 * (`DR-ATTACH-003`) 이름이 내용 해시라(`R50`) 같은 바이트가 대상
 * 워크스페이스의 **같은 상대 경로**에 놓인다 — 재작성할 것이 없다.
 * 그 재작성 경로를 두는 것은 `DR-ATTACH-003` 이 명시적으로 금지한다.
 *
 * 권한은 여기서 묻지 않는다 — 부르는 쪽(복사)이 이미 원본의 보기와
 * 목적지의 편집을 함께 검사했다. 여기서 다시 물으면 같은 판정이 두 곳에
 * 생긴다.
 */
export async function replicateAttachments(
  stores: AttachmentStores,
  from: NodeId,
  to: { nodeId: NodeId; workspaceId: string },
): Promise<void> {
  const records = stores.attachments.listOf(from);
  if (records.length === 0) return;

  const targetRoot = workspaceRootOf(stores, to.workspaceId);
  const index = await readIndex(targetRoot);

  for (const record of records) {
    const sourceRoot = workspaceRootOf(stores, record.workspaceId);
    const sourcePath = resourcePathOf(sourceRoot, record.hash, record.extension);
    const targetPath = resourcePathOf(targetRoot, record.hash, record.extension);

    // 같은 워크스페이스 안의 복사면 실체가 이미 그 자리에 있다. 다시
    // 쓰면 같은 바이트를 덮어쓰는 낭비이자, 읽기 실패가 복사 전체를
    // 무르게 만드는 자리가 하나 더 생기는 일이다.
    if (sourcePath !== targetPath) {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, await readFile(sourcePath));
    }

    const copied: AttachmentRecord = { ...record, ownerNodeId: to.nodeId, workspaceId: to.workspaceId };
    const before = index[record.hash];
    index[record.hash] = {
      ownerNodeId: before?.ownerNodeId ?? copied.ownerNodeId,
      owners: [...new Set([...(before?.owners ?? []), copied.ownerNodeId])],
      originalNames: { ...before?.originalNames, [copied.ownerNodeId]: copied.originalName },
      extension: copied.extension,
      size: copied.size,
      createdAt: before?.createdAt ?? copied.createdAt,
    };
    stores.attachments.add(copied);
  }

  // 사이드카가 정본이므로 한 번에 쓴다 — 항목마다 쓰면 중간에 멈췄을 때
  // 반쪽 사이드카가 남는다.
  await writeFile(indexPathOf(targetRoot), JSON.stringify(index, null, 2), 'utf8');
}

/**
 * 첨부를 연다 (`SEC-ATTACH-002` · `SEC-ATTACH-003`).
 *
 * 판정 기준이 **소유 문서**다 — 첨부의 저장 위치도, 그것을 참조하는
 * 문서도 아니다. 참조로 권한이 옮겨가면 누구든 링크 한 줄을 적어 남의
 * 첨부를 열 수 있다(AC-5).
 *
 * 매 요청 판정한다(`SEC-ATTACH-003` AC-1) — 해시 이름이 추측 불가라는
 * 사실을 통제 수단으로 쓰지 않는다. 링크는 복사되어 돌아다닌다.
 */
export async function openAttachment(
  stores: AttachmentStores,
  actor: Actor,
  input: { workspaceId: string; hash: string },
): Promise<OpenOutcome> {
  const owners = stores.attachments.ownersOf(input.workspaceId, input.hash);
  if (owners.length === 0) return { ok: false, rule: 'unknown-node' };

  // 소유가 여럿인 것은 같은 바이트를 두 문서에 올렸다는 뜻이다. **그중
  // 하나라도** 볼 수 있으면 연다 — 그 문서의 첨부는 그 문서를 볼 수 있는
  // 사람의 것이고, 다른 문서의 존재가 그것을 막을 이유가 없다.
  const mine = owners.find((record) => {
    const level = permissionOf(stores, actor, record.ownerNodeId);
    return level !== null && permits(level, 'view');
  });
  if (mine === undefined) return { ok: false, rule: 'unknown-node' };

  const path = resourcePathOf(workspaceRootOf(stores, mine.workspaceId), mine.hash, mine.extension);
  return { ok: true, bytes: await readFile(path) };
}

/**
 * 소유 문서가 **영구 삭제**될 때 그 첨부를 함께 걷는다 (`FR-ATTACH-005`).
 *
 * 휴지통으로 보내는 것으로는 발화하지 않는다(AC-3) — 복구할 수 있는
 * 상태에서 첨부를 지우면 복구된 문서가 깨져서 돌아온다.
 */
export async function purgeAttachmentsOf(
  stores: AttachmentPurgeStores,
  ownerNodeId: NodeId,
): Promise<void> {
  const owned = stores.attachments.listOf(ownerNodeId);
  if (owned.length === 0) return;

  stores.attachments.removeAllOf(ownerNodeId);

  for (const record of owned) {
    // **아직 소유한 문서가 남아 있으면 실체를 걷지 않는다.** 걷으면 살아
    // 있는 문서의 첨부가 영구히 사라지고, 사이드카가 정본이라 재구성으로도
    // 되살아나지 않는다.
    const remaining = stores.attachments.ownersOf(record.workspaceId, record.hash);
    const root = workspaceRootOf(stores, record.workspaceId);

    const index = await readIndex(root);
    if (remaining.length === 0) {
      await rm(resourcePathOf(root, record.hash, record.extension), { force: true });
      delete index[record.hash];
    } else {
      index[record.hash] = {
        ownerNodeId: remaining[0]!.ownerNodeId,
        owners: remaining.map((r) => r.ownerNodeId),
        originalNames: Object.fromEntries(
          remaining.map((r) => [r.ownerNodeId, r.originalName]),
        ),
        extension: remaining[0]!.extension,
        size: remaining[0]!.size,
        createdAt: remaining[0]!.createdAt,
      };
    }
    await writeFile(indexPathOf(root), JSON.stringify(index, null, 2), 'utf8');
  }
}

/** `.res/index.json` 만으로 소유 관계를 되세운다 (`REL-ATTACH-001` AC-2). */
export async function rebuildAttachmentIndex(
  stores: AttachmentStores,
  workspaceId: string,
): Promise<void> {
  const index = await readIndex(workspaceRootOf(stores, workspaceId));

  stores.attachments.replaceAllIn(
    workspaceId,
    Object.entries(index).flatMap(([hash, entry]) =>
      (entry.owners ?? [entry.ownerNodeId]).map((ownerNodeId) => ({
        hash,
        workspaceId,
        ownerNodeId,
        extension: entry.extension,
        size: entry.size,
        createdAt: entry.createdAt,
        // 옛 사이드카에는 이름이 없다. 되살릴 수 없으므로 비워 둔다 —
        // 지어내면 그것이 사실로 읽힌다.
        originalName: entry.originalNames?.[ownerNodeId] ?? '',
      })),
    ),
  );
}
