import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../src/app/node/node-service.js';
import type { DocumentStores } from '../../src/app/document/save-service.js';
import type { TrashStores } from '../../src/app/trash/trash-service.js';
import { SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { SqliteAclRepository } from '../../src/infra/sqlite/acl-repository.js';
import { SqliteAuditLog } from '../../src/infra/sqlite/audit-log-repository.js';
import { SqliteSettingStore } from '../../src/infra/sqlite/setting-store.js';
import type { Database } from '../../src/infra/sqlite/database.js';
import { FsTrashFiles } from '../../src/infra/fs/trash-files.js';
import { SqliteNodeRepository } from '../../src/infra/sqlite/node-repository.js';
import { SqliteTrashRepository } from '../../src/infra/sqlite/trash-repository.js';
import { SqliteVersionRepository } from '../../src/infra/sqlite/version-repository.js';
import { SqlitePrincipalRepository } from '../../src/infra/sqlite/principal-repository.js';
import { SqliteWorkspaceRepository } from '../../src/infra/sqlite/workspace-repository.js';

/**
 * 노드 조작에 필요한 저장소 넷을 한 번에 세운다.
 *
 * 조작마다 권한 판정이 걸리므로(`SEC-ACL-012`) 이름 규칙만 재는 시험도 이
 * 넷을 갖춰야 한다. 넷을 각 시험이 따로 조립하면 하나가 빠졌을 때 그
 * 시험만 다른 경로를 타게 된다.
 */
export function nodeStores(db: Database): NodeStores {
  return {
    nodes: new SqliteNodeRepository(db),
    workspaces: new SqliteWorkspaceRepository(db),
    acl: new SqliteAclRepository(db),
    principals: new SqlitePrincipalRepository(db),
    audit: new SqliteAuditLog(db),
    settings: new SqliteSettingStore(db),
  };
}

/**
 * ACL 을 우회하는 실행자 (`SEC-ACL-008` AC-1).
 *
 * 권한이 관심사가 아닌 시험 — 이름 규칙·경로 길이·충돌 접미사 — 이 쓴다.
 * 판정을 **끄는** 것이 아니라 통과하는 주체를 세우는 것이며, 그래서 판정
 * 경로 자체는 그 시험들에서도 그대로 실행된다.
 */
export function superuserActor(stores: NodeStores, name = '설치자'): Actor {
  const user = stores.principals.createUser(name);
  stores.principals.addMember(SUPERUSER_GROUP_ID, user.id);
  return actorFor(stores.principals, user.id);
}

/**
 * 휴지통 조작에 필요한 저장소까지 세운다.
 *
 * `nodeStores` 를 감싸는 이유는 휴지통이 노드 조작 위에 서기 때문이다 —
 * 둘을 나란히 조립하면 한쪽 시험만 저장소 하나를 빠뜨린 채로 돌게 된다.
 */
export function trashStores(
  db: Database,
  docsRoot: string,
  clock: () => Date = () => new Date(),
): TrashStores {
  return {
    ...nodeStores(db),
    trash: new SqliteTrashRepository(db),
    trashFiles: new FsTrashFiles(docsRoot),
    clock,
  };
}

/**
 * 문서 본문 조작에 필요한 저장소까지 세운다.
 *
 * `docsRoot` 가 여기 드는 이유는 본문의 SSOT 가 파일시스템이기 때문이다 —
 * 저장 서비스가 그 경로 없이는 아무것도 읽지 못한다.
 */
export function documentStores(
  db: Database,
  docsRoot: string,
  clock: () => Date = () => new Date(),
): DocumentStores {
  return {
    ...nodeStores(db),
    versions: new SqliteVersionRepository(db),
    clock,
    docsRoot,
  };
}
