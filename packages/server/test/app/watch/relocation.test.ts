import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { applyRelocation } from '../../../src/app/watch/relocation-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { correlate, type AddEvent, type UnlinkEvent } from '../../../src/domain/watch/correlation.js';
import { FINDING_TYPE, RECONCILE_OPERATION } from '../../../src/domain/reconciliation/vocabulary.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 상관 판정을 노드·ACL·재조정 대기열에 반영한다 (`REL-STORAGE-002`).
 *
 * 판정 규칙 자체는 `test/domain/watch/correlation.test.ts` 가 값으로 재고,
 * 여기서는 그 판정이 **무엇을 바꾸는가**를 잰다 — 특히 ACL 이 따라가는
 * 자리와 따라가지 않는 자리가 갈리는지를.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let ws: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 문서 = (name: string) =>
  idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name }));

const 사라짐 = (nodeId: string, over: Partial<UnlinkEvent> = {}): UnlinkEvent => ({
  path: '예산.md',
  nodeId,
  contentHash: 'aaa',
  at: 1_000,
  ...over,
});

const 나타남 = (over: Partial<AddEvent> = {}): AddEvent => ({
  path: '보관/예산.md',
  contentHash: 'aaa',
  at: 1_100,
  ...over,
});

const 미해소 = () => stores.queue.unresolved();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'relocation-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(':memory:');
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('상관 판정을 반영한다', () => {
  it('AC-1: 인정된 이동은 같은 노드가 새 경로를 갖고 ACL 이 따라간다', () => {
    const 노드 = 문서('예산.md');
    const 한범 = stores.principals.createUser('한범');
    breakInheritance(stores, root, 노드);
    grantPermission(stores, root, { nodeId: 노드, principalId: 한범.id, level: 'edit' });

    applyRelocation(stores, ws, correlate([사라짐(노드)], [나타남()]));

    // 같은 노드가 살아 있고 경로만 바뀐다 — 새 노드로 대신하면 그 앞으로
    // 부여된 권한과 이력이 통째로 끊긴다.
    expect(stores.nodes.findById(노드)?.orphanedAt, '인정된 이동인데 tombstone 이 됐다').toBeNull();
    expect(stores.nodes.pathOf(노드)).toBe('보관/예산.md');
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 노드)).toBe('edit');
  });

  it('AC-4: 인정되지 않으면 새 노드가 서고 옛 노드는 tombstone 이 되며 권한이 이식되지 않는다', () => {
    const 노드 = 문서('예산.md');
    const 한범 = stores.principals.createUser('한범');
    breakInheritance(stores, root, 노드);
    grantPermission(stores, root, { nodeId: 노드, principalId: 한범.id, level: 'edit' });

    const 결과 = applyRelocation(
      stores,
      ws,
      correlate([사라짐(노드)], [나타남({ contentHash: 'bbb' })]),
    );

    expect(stores.nodes.findById(노드)?.orphanedAt, '옛 노드가 tombstone 이 되지 않았다').not.toBeNull();
    expect(결과.created, '새 노드가 서지 않았다').toHaveLength(1);

    const 새노드 = 결과.created[0]!;
    expect(새노드).not.toBe(노드);
    // **여기가 이 조항의 핵심이다.** 옛 노드의 권한이 새 노드로 넘어가면
    // 그것이 곧 권한 상승이다.
    expect(
      permissionOf(stores, actorFor(stores.principals, 한범.id), 새노드),
      '거절된 쌍인데 권한이 새 노드로 이식됐다',
    ).not.toBe('edit');
  });

  it('AC-5: 거절된 쌍은 대기열에 미해소 항목 하나로 서고 감사 행 둘을 참조한다', () => {
    const 노드 = 문서('예산.md');

    applyRelocation(stores, ws, correlate([사라짐(노드)], [나타남({ contentHash: 'bbb' })]));

    const 항목들 = 미해소().filter((one) => one.type === FINDING_TYPE.correlationRejected);
    expect(항목들, '거절된 쌍이 대기열에 서지 않았다').toHaveLength(1);
    // 두 사실을 **한 항목**으로 묶는다 — 따로 열면 사람이 그 둘이 관련
    // 있다는 것을 알 방법이 없다.
    expect(stores.queue.auditRefsOf(항목들[0]!.id), '감사 행 둘이 한 항목에 묶이지 않았다').toHaveLength(2);
  });

  it('인정된 이동도 감사 행을 남긴다 — 추측이었다는 사실이 보존돼야 한다', () => {
    const 노드 = 문서('예산.md');

    applyRelocation(stores, ws, correlate([사라짐(노드)], [나타남()]));

    const 행들 = db.all<{ operation: string }>('SELECT operation FROM audit_log ORDER BY rowid');
    expect(행들.some((r) => r.operation === RECONCILE_OPERATION.relocate)).toBe(true);
  });

  it('짝 없는 사라짐은 tombstone 이 되고 짝 없는 나타남은 신규 노드가 된다', () => {
    const 노드 = 문서('예산.md');

    const 결과 = applyRelocation(stores, ws, correlate([사라짐(노드)], []));
    expect(stores.nodes.findById(노드)?.orphanedAt).not.toBeNull();
    expect(결과.created).toEqual([]);

    const 둘째 = applyRelocation(stores, ws, correlate([], [나타남({ path: '새것.md' })]));
    expect(둘째.created).toHaveLength(1);
  });
});
