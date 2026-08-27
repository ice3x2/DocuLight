import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { createNode, renameNode } from '../../../src/app/node/node-service.js';
import { startFileWatch, type FileWatch } from '../../../src/app/watch/file-watch.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FINDING_TYPE } from '../../../src/domain/reconciliation/vocabulary.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 파일 감시가 상관 판정을 실제로 돌린다 (`REL-STORAGE-002`).
 *
 * 판정 규칙과 그 반영은 각각 다른 파일이 잰다. 여기서는 **실제 파일을
 * 옮겨** 그 사슬이 끝까지 이어지는지만 본다 — 감시자가 사건을 줍지 않으면
 * 앞의 둘이 아무리 옳아도 제품에서는 아무 일도 일어나지 않는다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let ws: string;
let watch: FileWatch | undefined;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 노드와 실제 파일을 함께 만든다. */
const 문서 = async (name: string, body: string) => {
  const id = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name }));
  const at = join(docsRoot, ws, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, body, 'utf8');
  return { id, at };
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'filewatch-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(':memory:');
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  await watch?.stop();
  watch = undefined;
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('파일 감시가 상관 판정을 돌린다', () => {
  it('AC-1: 서버에서 직접 옮긴 파일이 같은 노드로 인정된다', async () => {
    const { id, at } = await 문서('예산.md', '내용이 같다\n');
    // 창을 짧게 준다. **창 값 자체는 여기서 재지 않는다** — 그 값이 짧다는
    // 것은 `test/domain/watch/correlation.test.ts` 가 상한으로 붙들고, 이
    // 파일은 사건이 판정까지 이어지는지만 본다.
    watch = await startFileWatch(stores, docsRoot, { windowMs: 120 });
    await watch.ready();

    const 새자리 = join(docsRoot, ws, '보관', '예산.md');
    await mkdir(dirname(새자리), { recursive: true });
    await rename(at, 새자리);
    // 사건 둘(옛 자리의 unlink · 새 자리의 add)이 도착할 때까지 기다린다.
    // 기다리지 않으면 판정이 돌기 전에 단언이 실행된다.
    await watch.seen(2);
    await watch.settle();

    expect(stores.nodes.findById(id)?.orphanedAt, '같은 파일인데 tombstone 이 됐다').toBeNull();
    expect(stores.nodes.pathOf(id)).toBe('보관/예산.md');
  });

  /**
   * **감시자가 그 사건을 보고 걸렀다는 것까지 잰다** (AC-6).
   *
   * 처음 쓴 이 항은 개명 직후 곧바로 단언해, 감시자가 아직 아무 사건도
   * 받지 못한 상태에서 「tombstone 이 없다」를 확인했다 — 감시자를 통째로
   * 지워도 통과하는 항이었다. 상호검증이 계수기를 넣어 그 시점의 사건이
   * `unlink 0 · add 0` 임을 실측했고, 사건을 기다리게 하자 곧바로 제품
   * 결함이 드러났다: 개명이 파일을 먼저 옮기고 DB 를 나중에 갱신하는 사이에
   * `add` 가 끼어들어 신규 노드가 하나 더 섰다.
   */
  it('AC-6: UI/API 로 개명하면 감시자가 그 사건을 보고 거른다', async () => {
    const { id } = await 문서('예산.md', '내용\n');
    // 창을 짧게 준다. **창 값 자체는 여기서 재지 않는다** — 그 값이 짧다는
    // 것은 `test/domain/watch/correlation.test.ts` 가 상한으로 붙들고, 이
    // 파일은 사건이 판정까지 이어지는지만 본다.
    watch = await startFileWatch(stores, docsRoot, { windowMs: 120 });
    await watch.ready();

    // 노드 ID 를 유지한 트랜잭션이다. 감시자가 이것을 상관 판정으로 읽으면
    // 정상 개명이 신규 노드가 되어 이력이 끊긴다.
    renameNode(stores, root, id, '예산-확정.md');

    // 개명이 파일을 옮기므로 사건 둘(옛 자리의 unlink · 새 자리의 add)이
    // 온다. 그것을 기다리지 않고 단언하면 아무것도 재지 못한다.
    await watch.seen(1);
    await watch.settle();

    // **조항의 문면을 그대로 잰다** — 「이 상관 판정 경로가 실행되지 않는다」.
    // 걸러진 개수로 재지 않는 이유는 플랫폼마다 개명이 만드는 사건의 수가
    // 달라 그 값이 흔들리기 때문이다.
    expect(watch.stats().seen, '감시자가 사건을 하나도 받지 않았다').toBeGreaterThan(0);
    expect(watch.stats().correlated, 'UI 개명이 상관 판정에 들어갔다').toBe(0);
    // 노드가 늘지 않아야 한다. 이 단언이 없으면 걸러진 개수만 맞고 신규
    // 노드가 선 상태를 놓친다.
    expect(stores.nodes.allIn(ws).filter((n) => n.kind === 'file'), '개명이 노드를 늘렸다').toHaveLength(1);
    expect(stores.nodes.findById(id)?.orphanedAt, 'UI 개명이 tombstone 을 만들었다').toBeNull();
    expect(
      stores.queue.unresolved().filter((one) => one.type === FINDING_TYPE.correlationRejected),
      'UI 개명이 상관 실패 항목을 만들었다',
    ).toEqual([]);
  });
});
