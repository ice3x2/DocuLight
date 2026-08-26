import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';

import { contentHash } from '../../domain/document/content-hash.js';
import {
  CORRELATION_WINDOW_MS,
  correlate,
  type AddEvent,
  type UnlinkEvent,
} from '../../domain/watch/correlation.js';
import { applyRelocation, type RelocationStores } from './relocation-service.js';

/**
 * 서버 파일시스템을 감시해 직접 옮겨진 파일을 상관 판정에 넘긴다
 * (`REL-STORAGE-002`).
 *
 * 감시자가 하는 일은 **모으는 것과 거르는 것**뿐이다. 무엇을 같은 노드로
 * 볼지는 `domain/watch/correlation.ts` 가, 그 판정이 무엇을 바꿀지는
 * `relocation-service.ts` 가 소유한다.
 */

export interface FileWatch {
  /** 첫 스캔이 끝나 감시가 실제로 걸린 시점. */
  ready(): Promise<void>;
  /** 모인 사건이 전부 판정을 거칠 때까지. 시험이 쓴다. */
  settle(): Promise<void>;
  stop(): Promise<void>;
}

export interface FileWatchStores extends RelocationStores {
  nodes: RelocationStores['nodes'];
}

/** 감시 경로를 워크스페이스와 그 안의 상대 경로로 가른다. */
function split(docsRoot: string, absolute: string): { workspaceId: string; path: string } | null {
  const rel = relative(docsRoot, absolute);
  if (rel === '' || rel.startsWith('..')) return null;
  const segments = rel.split(sep);
  if (segments.length < 2) return null;
  return { workspaceId: segments[0]!, path: segments.slice(1).join('/') };
}

/** 그 경로를 갖고 있는 살아 있는 노드. */
function nodeAt(
  stores: FileWatchStores,
  workspaceId: string,
  path: string,
): { id: string } | undefined {
  return stores.nodes
    .allIn(workspaceId)
    .find(
      (one) =>
        one.kind === 'file' && one.orphanedAt === null && stores.nodes.pathOf(one.id) === path,
    );
}

export async function startFileWatch(
  stores: FileWatchStores,
  docsRoot: string,
  options: { windowMs?: number } = {},
): Promise<FileWatch> {
  const { watch } = await import('chokidar');
  const windowMs = options.windowMs ?? CORRELATION_WINDOW_MS;

  /** 마지막으로 본 내용 해시. `unlink` 는 파일이 이미 없어 여기서 읽는다. */
  const hashes = new Map<string, string>();
  const unlinks: UnlinkEvent[] = [];
  const adds: AddEvent[] = [];
  let timer: NodeJS.Timeout | undefined;
  /** 아직 해시를 읽고 있는 `add` 의 수. 0 이 되어야 사건이 다 모인 것이다. */
  let inflight = 0;

  const flush = () => {
    if (unlinks.length === 0 && adds.length === 0) return;
    const takenUnlinks = unlinks.splice(0);
    const takenAdds = adds.splice(0);

    // 워크스페이스마다 따로 판정한다 — 경계를 넘는 상관을 인정하면 한
    // 워크스페이스의 ACL 이 다른 워크스페이스로 건너간다.
    const workspaces = new Set([
      ...takenUnlinks.map((one) => byWorkspace.get(one)!),
      ...takenAdds.map((one) => byWorkspace.get(one)!),
    ]);
    for (const workspaceId of workspaces) {
      applyRelocation(
        stores,
        workspaceId,
        correlate(
          takenUnlinks.filter((one) => byWorkspace.get(one) === workspaceId),
          takenAdds.filter((one) => byWorkspace.get(one) === workspaceId),
        ),
      );
    }
  };

  const byWorkspace = new WeakMap<UnlinkEvent | AddEvent, string>();

  // 마지막 사건에서 창만큼 더 기다렸다가 한 번에 판정한다. 사건마다 즉시
  // 판정하면 `unlink` 와 `add` 가 서로를 보지 못해 모든 이동이 상관 실패가
  // 된다 — 두 사건은 언제나 따로 도착한다.
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, windowMs);
  };

  const watcher = watch(docsRoot, { ignoreInitial: false, awaitWriteFinish: false });

  let scanning = true;

  watcher.on('add', (absolute: string) => {
    const at = split(docsRoot, absolute);
    if (at === null) return;

    inflight += 1;
    void (async () => {
      const hash = await hashOf(absolute);
      hashes.set(absolute, hash);
      // 첫 스캔에서는 이미 있는 파일을 전부 본다 — 그것은 사건이 아니라
      // 현황이므로 해시만 채우고 넘어간다.
      if (scanning) {
        inflight -= 1;
        return;
      }
      // **노드가 이미 그 경로를 갖고 있으면 우리가 옮긴 것이다** (AC-6).
      // UI·API 이동은 노드 ID 를 유지한 트랜잭션이라 파일이 도착하기 전에
      // 이미 그 경로가 노드에 적혀 있다. 그것을 상관 판정에 넣으면 정상
      // 개명이 신규 노드가 되어 이력이 끊긴다.
      if (nodeAt(stores, at.workspaceId, at.path) !== undefined) {
        inflight -= 1;
        return;
      }

      const event: AddEvent = { path: at.path, contentHash: hash, at: Date.now() };
      byWorkspace.set(event, at.workspaceId);
      adds.push(event);
      inflight -= 1;
      schedule();
    })();
  });

  watcher.on('unlink', (absolute: string) => {
    const at = split(docsRoot, absolute);
    if (at === null) return;
    const hash = hashes.get(absolute) ?? '';
    hashes.delete(absolute);

    // **그 경로에 노드가 없으면 이미 우리가 처리한 것이다** (AC-6). UI 개명
    // 뒤의 옛 경로가 그렇다 — 노드는 새 이름을 갖고 살아 있다.
    const node = nodeAt(stores, at.workspaceId, at.path);
    if (node === undefined) return;

    const event: UnlinkEvent = {
      path: at.path,
      nodeId: node.id,
      contentHash: hash,
      at: Date.now(),
    };
    byWorkspace.set(event, at.workspaceId);
    unlinks.push(event);
    schedule();
  });

  await new Promise<void>((done) => watcher.once('ready', () => done()));
  scanning = false;

  return {
    async ready() {
      // 첫 스캔의 해시 채우기가 비동기라 한 틱 더 준다.
      await new Promise((done) => setTimeout(done, 50));
    },
    /**
     * 모인 사건이 전부 판정을 거칠 때까지.
     *
     * 프로미스 하나를 붙들고 기다리지 않고 **상태가 잦아들 때까지 본다** —
     * 사건이 둘 이상이면 뒤의 것이 앞의 예약을 지우므로, 앞의 프로미스를
     * 붙들고 있던 쪽은 영영 풀리지 않는다.
     */
    async settle() {
      const deadline = Date.now() + windowMs * 20 + 1_000;
      while (Date.now() < deadline) {
        if (inflight === 0 && timer === undefined) return;
        await new Promise((done) => setTimeout(done, 10));
      }
    },
    async stop() {
      if (timer !== undefined) clearTimeout(timer);
      await watcher.close();
    },
  };
}

async function hashOf(absolute: string): Promise<string> {
  try {
    return contentHash(await readFile(absolute, 'utf8'));
  } catch {
    return '';
  }
}
