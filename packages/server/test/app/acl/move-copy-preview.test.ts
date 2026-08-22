import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accessorsOf } from '../../../src/app/acl/accessor-service.js';
import { copyPreview, movePreview } from '../../../src/app/acl/relocation-preview-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 옮기기 전에 **접근 가능 인원이 어떻게 변하는지** 보여준다
 * (`FR-ACL-006`) — 그리고 복사는 **목적지 기준**으로 센다 (`FR-ACL-002`).
 *
 * 이동으로 부모가 바뀌면 상속 결과가 달라지는데 사용자는 그 사실을 모른다.
 * 폴더를 정리했을 뿐인데 접근자가 늘거나 줄어 있는 것이 이 프리뷰가 없을 때
 * 벌어지는 일이다.
 */

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';
const OTHER = 'ws-2';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-relocation-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [OTHER, '인사팀']);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mk = (
  name: string,
  parentId: string | null = null,
  kind: 'file' | 'directory' = 'file',
  workspaceId = WS,
) => stores.nodes.create({ workspaceId, parentId, kind, name });

let seq = 0;

const superuser = (): Actor => {
  const account = stores.principals.createUser(`설치자-${(seq += 1)}`);
  stores.principals.addMember(SUPERUSER_GROUP_ID, account.id);
  return actorFor(stores.principals, account.id);
};

const user = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

describe('FR-ACL-006 — 이동 전후의 접근 가능 인원', () => {
  it('AC-1: 이동 전 수치와 이동 후 수치를 함께 낸다', () => {
    const root = superuser();
    const 좁은곳 = mk('좁은곳', null, 'directory');
    const 넓은곳 = mk('넓은곳', null, 'directory');
    const doc = mk('회의록.md', 좁은곳);
    const 한범 = user('한범');
    const 지은 = user('지은');
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 한범.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 지은.id, level: 'view' });

    // 지금은 슈퍼유저만 닿는다. 넓은곳으로 옮기면 둘이 더 닿는다.
    expect(movePreview(stores, root, doc, 넓은곳)).toEqual({ before: 1, after: 3 });
  });

  it('AC-1: 좁아지는 이동도 같은 형식으로 낸다', () => {
    const root = superuser();
    const 넓은곳 = mk('넓은곳', null, 'directory');
    const 좁은곳 = mk('좁은곳', null, 'directory');
    const doc = mk('회의록.md', 넓은곳);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 한범.id, level: 'view' });

    expect(movePreview(stores, root, doc, 좁은곳)).toEqual({ before: 2, after: 1 });
  });

  it('AC-6: 수치가 변하지 않는 이동에서도 두 수치가 그대로 온다', () => {
    // 「변화 없음」을 빈 값이나 다른 모양으로 내면 화면이 그 자리에서만
    // 다른 분기를 갖게 되고, 그 분기가 곧 「무언가 특별하다」는 신호가 된다.
    const root = superuser();
    const 이쪽 = mk('이쪽', null, 'directory');
    const 저쪽 = mk('저쪽', null, 'directory');
    const doc = mk('회의록.md', 이쪽);

    expect(movePreview(stores, root, doc, 저쪽)).toEqual({ before: 1, after: 1 });
  });

  it('AC-2: 목적지를 바꾸면 이동 후 수치가 그 목적지 기준으로 갈린다', () => {
    const root = superuser();
    const 원래 = mk('원래', null, 'directory');
    const 넓은곳 = mk('넓은곳', null, 'directory');
    const 좁은곳 = mk('좁은곳', null, 'directory');
    const doc = mk('회의록.md', 원래);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 한범.id, level: 'view' });

    expect(movePreview(stores, root, doc, 넓은곳)?.after).toBe(2);
    expect(movePreview(stores, root, doc, 좁은곳)?.after).toBe(1);
  });

  it('상속을 끊은 노드는 옮겨도 새 부모의 항목을 받지 않는다', () => {
    // 끊긴 노드는 부모가 바뀌어도 상속하지 않는다. 그것을 프리뷰가
    // 반영하지 못하면 「옮기면 늘어난다」는 거짓 예고를 하게 된다.
    const root = superuser();
    const 넓은곳 = mk('넓은곳', null, 'directory');
    const doc = mk('격리문서.md');
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, doc);

    expect(movePreview(stores, root, doc, 넓은곳)).toEqual({ before: 1, after: 1 });
  });

  it('AC-3: 프리뷰에 명단을 담을 자리가 없다', () => {
    const root = superuser();
    const 저쪽 = mk('저쪽', null, 'directory');
    const doc = mk('회의록.md');

    // 수치 둘뿐이다. 명단을 실을 칸을 두면 그 칸이 곧 우회 경로가 된다.
    expect(Object.keys(movePreview(stores, root, doc, 저쪽) ?? {}).sort()).toEqual([
      'after',
      'before',
    ]);
  });

  it('대상에 편집이 없으면 프리뷰가 열리지 않는다', () => {
    const root = superuser();
    const 저쪽 = mk('저쪽', null, 'directory');
    const doc = mk('회의록.md');
    const 열람자 = user('열람자');
    grantPermission(stores, root, { nodeId: doc, principalId: 열람자.id, level: 'view' });

    expect(movePreview(stores, 열람자, doc, 저쪽)).toBeNull();
  });

  it('워크스페이스 루트로 옮기는 경우도 낸다', () => {
    const root = superuser();
    const 넓은곳 = mk('넓은곳', null, 'directory');
    const doc = mk('회의록.md', 넓은곳);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 넓은곳, principalId: 한범.id, level: 'view' });

    expect(movePreview(stores, root, doc, null)).toEqual({ before: 2, after: 1 });
  });
});

describe('FR-ACL-002 — 복사 프리뷰는 목적지로 판정한다', () => {
  it('AC-1: 목적지 기준으로 센다 — 원본 기준이 아니다', () => {
    const root = superuser();
    const 좁은원본 = mk('좁은원본', null, 'directory');
    const 넓은목적지 = mk('넓은목적지', null, 'directory');
    mk('회의록.md', 좁은원본);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 넓은목적지, principalId: 한범.id, level: 'view' });

    expect(copyPreview(stores, root, 넓은목적지)?.metrics.reachable).toBe(2);
  });

  it('AC-2 · AC-3: 원본에 보기만 가진 사람에게도 수치가 나온다', () => {
    // 원본 레벨로 판정하면 「복사하는 사람에게는 수치를 안 보여준다」는
    // 모순이 생긴다. 복사는 언제나 목적지 편집을 요구하므로 목적지
    // 기준이면 수치가 빠지는 경로가 없다.
    const root = superuser();
    const 원본 = mk('원본.md');
    const 목적지 = mk('목적지', null, 'directory');
    const 복사하는사람 = user('복사하는사람');
    grantPermission(stores, root, { nodeId: 원본, principalId: 복사하는사람.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 목적지, principalId: 복사하는사람.id, level: 'edit' });

    expect(copyPreview(stores, 복사하는사람, 목적지)?.metrics.reachable).toBe(2);
  });

  it('AC-4: 명단은 관리 보유자에게만 온다', () => {
    const root = superuser();
    const 목적지 = mk('목적지', null, 'directory');
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: 목적지, principalId: 편집자.id, level: 'edit' });

    expect(copyPreview(stores, root, 목적지)?.roster).not.toBeNull();
    expect(copyPreview(stores, 편집자, 목적지)?.roster).toBeNull();
  });

  it('워크스페이스 루트로 복사하는 경우도 수치를 낸다', () => {
    // 목적지가 루트인 복사 경로가 실제로 있다. 이 자리가 비면 AC-3 의
    // 「수치가 표시되지 않는 복사 경로가 없다」가 곧바로 깨진다.
    const root = superuser();
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: WS, principalId: 한범.id, level: 'view' });

    expect(copyPreview(stores, root, WS)?.metrics.reachable).toBe(2);
  });

  it('접근자 지표의 정본과 같은 값을 쓴다', () => {
    // 복사 프리뷰가 자기 셈을 따로 가지면 같은 목적지가 화면마다 다른
    // 수를 보여준다.
    const root = superuser();
    const 목적지 = mk('목적지', null, 'directory');
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 목적지, principalId: 한범.id, level: 'view' });

    // 복사 프리뷰는 접근자 보고서를 **그대로** 돌려준다 — 자기 셈을
    // 따로 가지면 같은 목적지가 화면마다 다른 수를 보여준다.
    expect(copyPreview(stores, root, 목적지)).toEqual(accessorsOf(stores, root, 목적지));
  });

  it('다른 워크스페이스로 복사하면 그쪽 기준으로 센다', () => {
    const root = superuser();
    const 남의곳 = mk('남의곳', null, 'directory', OTHER);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 남의곳, principalId: 한범.id, level: 'view' });

    expect(copyPreview(stores, root, 남의곳)?.metrics.reachable).toBe(2);
  });
});
