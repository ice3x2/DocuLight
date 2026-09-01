import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { hasDotSegment } from '../../domain/naming/hidden-name-rule.js';
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

/** 감시자가 지금까지 무엇을 보고 어떻게 처리했는가. */
export interface WatchStats {
  /** 첫 스캔 이후 받은 사건의 수. */
  readonly seen: number;
  /**
   * **상관 판정에 실제로 들어간 사건의 수** (AC-6).
   *
   * 조항의 문면이 「이 상관 판정 경로가 실행되지 않는다」이므로, 그것을
   * 값으로 재는 자리가 이 칸이다. 걸러진 개수를 세는 것만으로는 부족하다 —
   * 플랫폼마다 개명이 만드는 사건의 수가 달라 그 값은 흔들린다.
   */
  readonly correlated: number;
  /**
   * 상관 판정에 넣지 않고 흘려보낸 사건의 수 (AC-6).
   *
   * 이 값이 없으면 「UI 개명은 이 경로를 타지 않는다」를 재는 항이 **감시자가
   * 사건을 받기도 전에** 통과한다 — 아무 일도 일어나지 않은 것과 걸러 낸
   * 것이 밖에서 같아 보이기 때문이다.
   */
  readonly ignored: number;
}

export interface FileWatch {
  /** 첫 스캔이 끝나 감시가 실제로 걸린 시점. */
  ready(): Promise<void>;
  /** 사건을 그 수만큼 받을 때까지. 받지 못하면 상한에서 그대로 돌아온다. */
  seen(count: number): Promise<void>;
  /** 지금까지의 관측. */
  stats(): WatchStats;
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
  const path = segments.slice(1).join('/');
  // **점으로 시작하는 이름은 문서가 아니다.** 재조정이 같은 규칙으로 거르며
  // (`app/reconciliation/reconcile.ts`), 이 자리에서 빠뜨리면 워크스페이스
  // 사이드카 `.workspace.json` 과 휴지통 `.trash/` 아래 파일이 상관 판정에
  // 들어가 문서 노드로 등재된다 — 상호검증이 그것을 실측했다.
  if (hasDotSegment(path)) return null;
  return { workspaceId: segments[0]!, path };
}

/** 그 경로를 갖고 있는 살아 있는 노드. */
function nodeAt(
  stores: FileWatchStores,
  workspaceId: string,
  path: string,
): { id: string } | undefined {
  // 경로를 한 번에 판다 — 후보마다 `pathOf` 를 부르면 사건 하나에
  // 노드 수만큼 재귀 질의가 난다 (`CON-ACL-001` AC-4).
  const paths = stores.nodes.pathsIn(workspaceId);
  return stores.nodes
    .allIn(workspaceId)
    .find(
      (one) => one.kind === 'file' && one.orphanedAt === null && paths.get(one.id) === path,
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
  let seen = 0;
  let ignored = 0;
  let correlated = 0;
  /**
   * `stop()` 이 불렸는가.
   *
   * 떠 있는 해시 읽기가 풀릴 때 저장소로 가는 것을 막는 자리다. 감시자를
   * 닫는 것만으로는 부족하다 — 닫기는 새 사건을 끊을 뿐이고, 이미 시작된
   * 읽기는 그것과 무관하게 풀린다.
   */
  let stopped = false;

  const flush = () => {
    if (unlinks.length === 0 && adds.length === 0) return;

    // **판정이 도는 시점에 그 자리에 파일이 있으면 사라진 것이 아니다**
    // (`REL-STORAGE-003` AC-1). 창을 기다리는 동안 되돌아온 것이며, 휴지통에
    // 넣었다 곧 되살리는 왕복이 정확히 그 모양이다 — 파일이 `.trash/` 로
    // 갔다가 원래 자리로 돌아온다.
    //
    // 돌아온 자리의 `add` 는 그 경로를 가진 노드가 있어 위에서 걸러지므로
    // (서버가 옮긴 것이라 옳다), 거르지 않으면 `unlink` 만 짝 없이 남아
    // 노드가 고아가 된다. 복구는 휴지통 표시만 지우므로 그 고아 표시가
    // 그대로 남고, 되살린 문서가 트리에는 서는데 열리지 않는다.
    //
    // **사라짐을 늦게 처리하는 모든 경우를 함께 덮는다** — 판정이 창 뒤에
    // 도는 이상, 그 사이에 무엇이 파일을 되돌렸는지는 이 자리의 관심이
    // 아니다. 지금 있으면 없어진 것이 아니다.
    const takenUnlinks = unlinks.splice(0).filter((one) => {
      if (!existsSync(join(docsRoot, byWorkspace.get(one)!, one.path))) return true;
      ignored += 1;
      return false;
    });
    const takenAdds = adds.splice(0);
    correlated += takenUnlinks.length + takenAdds.length;
    if (takenUnlinks.length === 0 && takenAdds.length === 0) return;

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
      //
      // `stopped` 를 여기서 함께 보는 이유는 이 자리가 **읽기가 풀린 뒤**라서다.
      // 첫 스캔이 띄운 읽기가 풀릴 무렵에는 `scanning` 이 이미 거짓이므로,
      // 그 사이에 `stop()` 이 불렸다면 이것은 사건이 아니라 잔여다. 그것을
      // 저장소로 보내면 제품의 종료 순서상 이미 닫힌 연결에 도착한다.
      if (scanning || stopped) {
        inflight -= 1;
        return;
      }
      seen += 1;
      // **노드가 이미 그 경로를 갖고 있으면 우리가 옮긴 것이다** (AC-6).
      // UI·API 이동은 노드 ID 를 유지한 트랜잭션이라 파일이 도착하기 전에
      // 이미 그 경로가 노드에 적혀 있다. 그것을 상관 판정에 넣으면 정상
      // 개명이 신규 노드가 되어 이력이 끊긴다.
      if (nodeAt(stores, at.workspaceId, at.path) !== undefined) {
        ignored += 1;
        inflight -= 1;
        return;
      }

      const event: AddEvent = { path: at.path, contentHash: hash, at: Date.now() };
      byWorkspace.set(event, at.workspaceId);
      adds.push(event);
      // **예약을 먼저 건다.** `inflight` 가 0 이 되는 순간과 타이머가 걸리는
      // 순간 사이에 `settle()` 이 검사하면 둘 다 만족해 판정 전에 돌아간다.
      schedule();
      inflight -= 1;
    })();
  });

  watcher.on('unlink', (absolute: string) => {
    if (stopped) return;
    const at = split(docsRoot, absolute);
    if (at === null) return;
    seen += 1;
    const hash = hashes.get(absolute) ?? '';
    hashes.delete(absolute);

    // **그 경로에 노드가 없으면 이미 우리가 처리한 것이다** (AC-6). UI 개명
    // 뒤의 옛 경로가 그렇다 — 노드는 새 이름을 갖고 살아 있다.
    const node = nodeAt(stores, at.workspaceId, at.path);
    if (node === undefined) {
      ignored += 1;
      return;
    }

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
    stats() {
      return { seen, ignored, correlated };
    },
    async seen(count: number) {
      const deadline = Date.now() + windowMs * 20 + 2_000;
      while (Date.now() < deadline && seen < count) {
        await new Promise((done) => setTimeout(done, 10));
      }
    },
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
      // 닫기보다 먼저 표시한다 — 닫기는 await 이라 그동안 풀린 읽기가 표시를
      // 보지 못하면 저장소로 간다. **다만 그 순서는 실측되지 않았다**: 표시를
      // 닫기 뒤로 옮기는 탐침에도 아래 항이 죽지 않았다. 창이 수 밀리초라
      // 걸리지 않을 뿐이므로 이른 표시를 유지하되, 재고 있는 것은 순서가
      // 아니라 「stop() 이 돌아온 뒤에는 읽지 않는다」임을 적어 둔다.
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
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
