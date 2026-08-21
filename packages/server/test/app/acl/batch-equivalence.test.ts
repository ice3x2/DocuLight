import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  actorFor,
  permissionBatch,
  permissionOf,
  type Actor,
} from '../../../src/app/acl/permission-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { suspendUser } from '../../../src/app/principal/principal-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-batcheq-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mk = (name: string, parentId: string | null, kind: 'file' | 'directory' = 'file') =>
  stores.nodes.create({ workspaceId: WS, parentId, kind, name });

let counter = 0;
const superuser = (): Actor => {
  const u = stores.principals.createUser(`설치자-${(counter += 1)}`);
  stores.principals.addMember(SUPERUSER_GROUP_ID, u.id);
  return actorFor(stores.principals, u.id);
};

/**
 * 배치 판정과 단일 판정은 **같은 답을 내야 한다.**
 *
 * 둘이 갈리면 트리에 보이는 것과 실제로 열리는 것이 달라진다 — 배치는
 * 트리 목록이 쓰고 단일은 열기가 쓰기 때문이다. 질의를 줄이려고 배치를
 * 들인 것이므로, 그 최적화가 판정을 바꾸지 않는다는 사실이 곧 그것을
 * 들여도 되는 근거다.
 */
describe('permissionBatch ↔ permissionOf 동치', () => {
  it('모든 배치 조합에서 두 결과가 같다', () => {
    const root = superuser();
    const hq = mk('본부', null, 'directory');
    const plan = mk('기획팀', hq, 'directory');
    const hr = mk('인사팀', hq, 'directory');
    const minutes = mk('회의록.md', plan);
    const payroll = mk('급여.md', hr);
    const loose = mk('무소속.md', null);
    const all = [hq, plan, hr, minutes, payroll, loose];

    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    const team = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(team.id, me.id);

    grantPermission(stores, root, { nodeId: WS, principalId: me.id, level: 'view' });
    grantPermission(stores, root, { nodeId: plan, principalId: team.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: payroll, principalId: me.id, level: 'view' });
    breakInheritance(stores, root, hr);
    breakInheritance(stores, root, minutes);

    const fresh = actorFor(stores.principals, me.id);

    // 부분집합 전수 — 배치의 구성이 결과를 바꾸면 여기서 드러난다.
    for (let mask = 1; mask < 1 << all.length; mask += 1) {
      const subset = all.filter((_, i) => (mask & (1 << i)) !== 0);
      const levelOf = permissionBatch(stores, fresh, subset, WS);

      for (const id of subset) {
        expect(levelOf(id), `배치 [${subset.length}건] 에서 ${id} 가 갈렸다`).toBe(
          permissionOf(stores, fresh, id),
        );
      }
    }
  });

  it('배치가 조상을 담지 않아도 권한을 넓히지 않는다', () => {
    const root = superuser();
    const hq = mk('본부', null, 'directory');
    const plan = mk('기획팀', hq, 'directory');
    const doc = mk('회의록.md', plan);

    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: hq, principalId: me.id, level: 'edit' });
    breakInheritance(stores, root, plan);

    const fresh = actorFor(stores.principals, me.id);

    // 잎만 담은 배치 — 조상 사슬은 chainsOf 가 함께 끌어온다.
    expect(permissionBatch(stores, fresh, [doc], WS)(doc)).toBe(permissionOf(stores, fresh, doc));
    expect(permissionOf(stores, fresh, doc)).toBeNull();
  });

  it('슈퍼유저와 정지 계정에서도 같다', () => {
    const root = superuser();
    const doc = mk('회의록.md', null);
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    expect(permissionBatch(stores, root, [doc], WS)(doc)).toBe(permissionOf(stores, root, doc));

    suspendUser(stores.principals, me.id);
    const suspended = actorFor(stores.principals, me.id);
    expect(permissionBatch(stores, suspended, [doc], WS)(doc)).toBe(
      permissionOf(stores, suspended, doc),
    );
    expect(permissionOf(stores, suspended, doc)).toBeNull();
  });

  it('실재하지 않는 ID 에서도 같다', () => {
    const root = superuser();
    expect(permissionBatch(stores, root, ['no-such'], WS)('no-such')).toBe(
      permissionOf(stores, root, 'no-such'),
    );
  });
});
