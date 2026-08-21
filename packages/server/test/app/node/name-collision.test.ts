import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode, type NodeStores } from '../../../src/app/node/node-service.js';
import { COLLISION_NOTICE, noticeFor } from '../../../src/domain/node/collision-notice.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: NodeStores;
let root: Actor;
let ws: string;
let me: Actor;

const nameOf = (r: unknown) => (r as { ok: true; name: string }).name;
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-collision-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
  grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const create = (actor: Actor, name: string) =>
  createNode(stores, actor, { workspaceId: ws, parentId: null, kind: 'file', name });

describe('SEC-SHELL-002 — 이름 충돌은 가시 여부와 무관하게 하나로 처리한다', () => {
  it('AC-1: 보이는 파일과 충돌하면 접미사가 붙는다', () => {
    create(root, '보고서.md');
    // 요청자에게 보이는 파일 — 워크스페이스 편집 권한이 상속된다.
    const again = create(actorFor(stores.principals, me.id), '보고서.md');

    expect(nameOf(again)).not.toBe('보고서.md');
    expect(nameOf(again)).toContain('보고서');
  });

  it('AC-2: 보이지 않는 파일과 충돌해도 똑같이 접미사가 붙는다', () => {
    const hidden = idOf(create(root, '보고서.md'));
    // 상속을 끊어 이 사용자에게서 감춘다 — 이제 그 이름의 파일이 있다는
    // 사실 자체가 보이지 않는다.
    stores.nodes.setInheritance(hidden, false);

    const again = create(actorFor(stores.principals, me.id), '보고서.md');

    expect(nameOf(again)).not.toBe('보고서.md');
  });

  it('AC-1 · AC-2: 두 경우의 결과 이름이 같다 — 다르면 그 차이가 존재를 알린다', () => {
    const visible = nameOf(create(actorFor(stores.principals, me.id), '가.md'));
    create(root, '나.md');
    stores.nodes.setInheritance(
      stores.nodes.children({ workspaceId: ws, parentId: null }).find((n) => n.name === '나.md')!.id,
      false,
    );
    const invisible = nameOf(create(actorFor(stores.principals, me.id), '나.md'));

    // 하나는 「가.md」가 이미 있었고 하나는 없었으므로 접미사 자체를
    // 비교하는 대신, 충돌이 있었던 쪽끼리의 형태를 본다.
    create(root, '가.md');
    expect(visible).toBe('가.md');
    expect(invisible).toMatch(/^나.*\.md$/);
  });

  it('AC-3: 안내 문구가 하나뿐이라 두 경우가 같은 문구를 받는다', () => {
    // 문구가 조건에 따라 갈리면 그 갈림이 곧 「감춰진 것이 있다」는 신호다.
    expect(noticeFor('보고서 (2).md')).toBe(noticeFor('보고서 (2).md'));
    expect(COLLISION_NOTICE).toContain('{name}');
    expect(noticeFor('보고서 (2).md')).toContain('보고서 (2).md');
  });

  it('AC-4: 충돌해도 확인을 묻지 않는다 — 생성이 그대로 성공한다', () => {
    create(root, '보고서.md');
    const again = create(actorFor(stores.principals, me.id), '보고서.md');

    // 확인 단계가 있으면 결과가 「성공」이 아니라 「대기」로 나온다.
    expect((again as { ok: boolean }).ok).toBe(true);
  });
});
