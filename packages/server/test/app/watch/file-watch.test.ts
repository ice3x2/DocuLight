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
    await watch.settle();

    expect(stores.nodes.findById(id)?.orphanedAt, '같은 파일인데 tombstone 이 됐다').toBeNull();
    expect(stores.nodes.pathOf(id)).toBe('보관/예산.md');
  });

  it('AC-6: UI/API 로 개명하면 이 경로를 타지 않는다', async () => {
    const { id } = await 문서('예산.md', '내용\n');
    // 창을 짧게 준다. **창 값 자체는 여기서 재지 않는다** — 그 값이 짧다는
    // 것은 `test/domain/watch/correlation.test.ts` 가 상한으로 붙들고, 이
    // 파일은 사건이 판정까지 이어지는지만 본다.
    watch = await startFileWatch(stores, docsRoot, { windowMs: 120 });
    await watch.ready();

    // 노드 ID 를 유지한 트랜잭션이다. 감시자가 이것을 상관 판정으로 읽으면
    // 정상 개명이 신규 노드가 되어 이력이 끊긴다.
    renameNode(stores, root, id, '예산-확정.md');
    await watch.settle();

    expect(stores.nodes.findById(id)?.orphanedAt, 'UI 개명이 tombstone 을 만들었다').toBeNull();
    expect(
      stores.queue.unresolved().filter((one) => one.type === FINDING_TYPE.correlationRejected),
      'UI 개명이 상관 실패 항목을 만들었다',
    ).toEqual([]);
  });
});
