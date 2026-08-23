import type { PrincipalId } from '../../domain/principal/principal.js';
import { DEFAULT_GROUP_ID } from '../../domain/principal/system-groups.js';
import { ACL_GRANT } from '../acl/grant-service.js';
import type { Workspace } from '../../domain/workspace/workspace.js';
import type { AclStores, Actor } from '../acl/permission-service.js';
import type { WorkspaceStores } from './restore-from-sidecar.js';

/**
 * 워크스페이스를 만든다 (`FR-WORKSPACE-001` · `DR-WORKSPACE-002` AC-1).
 *
 * **부모를 받지 않는다.** 워크스페이스의 부모는 언제나 루트다 — 인자가
 * 없으면 어떤 호출자도 중첩을 만들 수 없다(`FR-WORKSPACE-001` AC-2).
 *
 * 레코드·디렉토리·사이드카 셋을 여기서 함께 만든다. 나누면 레코드만 있고
 * 사이드카가 없는 워크스페이스가 생기고, 그것은 DB 가 손상되는 순간
 * 복원할 수 없는 해시 폴더가 된다.
 *
 * 노드 이름 검증 규칙을 여기 걸지 않는다. 물리 디렉토리명이 해시라
 * 예약어·금지 문자·경로 길이가 이 계층에는 닿지 않기 때문이다(`R40-a`).
 * 그 방어선이 필요한 곳은 실명을 그대로 쓰는 문서·디렉토리 계층이다.
 */
export async function createWorkspace(
  { workspaces, files }: WorkspaceStores,
  name: string,
): Promise<Workspace> {
  const workspace = workspaces.create(name);
  await files.createDirectory(workspace.id);
  await files.writeSidecar(workspace);
  return workspace;
}

export type WorkspaceRule = 'needs-superuser' | 'unknown-administrator';

/**
 * 워크스페이스가 생겼다 (`OBS-AUDIT-005` AC-8).
 *
 * 어느 워크스페이스에도 귀속되지 않는 사건이 아니다 — **그 자신**에
 * 귀속되므로 그 워크스페이스의 관리자가 자기 로그에서 생성 사실을 본다.
 */
export const WORKSPACE_CREATE = 'workspace.create';

export type WorkspaceCreated =
  | { ok: true; workspace: Workspace }
  | { ok: false; rule: WorkspaceRule };

/**
 * 관리자를 지정해 워크스페이스를 만든다
 * (`SEC-WORKSPACE-001` AC-4 · AC-5 · `SEC-PRINCIPAL-001` AC-2).
 *
 * 관리자 지정을 **인자로 받고 검사한 뒤에야** 레코드를 만드는 이유가 AC-5 다
 * — 만들고 나서 지정하게 하면 관리자 없는 워크스페이스가 그 사이에 존재하고,
 * 그 상태에서 실패하면 아무도 손댈 수 없는 워크스페이스가 영구히 남는다.
 * 워크스페이스는 상속 체인의 루트라 위에서 구해 줄 주체가 없다
 * (`SEC-WORKSPACE-001` AC-1).
 *
 * 슈퍼유저만 실행한다 — 워크스페이스는 권한 경계 자체이므로 그것을 만드는
 * 권능은 경계 안쪽에서 나올 수 없다.
 */
export async function createWorkspaceAs(
  stores: AclStores & WorkspaceStores,
  actor: Actor,
  input: {
    name: string;
    administratorId: PrincipalId;
    /**
     * `default` 그룹의 초기 권한 (`FR-PRINCIPAL-007` AC-2).
     *
     * **기본값이 `없음` 이다.** 빠뜨린 호출이 전원에게 권한을 주지
     * 않도록 안전한 쪽을 기본으로 둔다 — 반대로 두면 「깜빡한 것」과
     * 「전원 공개로 정한 것」이 같은 코드가 된다.
     */
    defaultGroupLevel?: 'none' | 'view' | 'edit';
  },
): Promise<WorkspaceCreated> {
  if (!actor.requester.superuser) {
    return { ok: false, rule: 'needs-superuser' };
  }

  const administrator = stores.principals.findById(input.administratorId);
  if (administrator === undefined) {
    return { ok: false, rule: 'unknown-administrator' };
  }

  const workspace = await createWorkspace(stores, input.name);

  // `grantedBy` 를 `null` 로 두는 것이 이 항목을 시스템의 것으로 만든다 —
  // 생성자 자동 부여와 같은 이유다.
  stores.audit.append({
    operation: WORKSPACE_CREATE,
    actor: actor.id,
    workspaceId: workspace.id,
    afterValue: workspace.name,
  });

  stores.acl.grant({
    nodeId: workspace.id,
    principalId: administrator.id,
    level: 'admin',
    grantedBy: null,
  });
  // 생성 시점의 두 부여가 **각각** 행을 남긴다 (`OBS-AUDIT-005` AC-9).
  // 묶어서 1행으로 남기면 어느 주체가 무엇을 받았는지 담을 수 없다.
  stores.audit.append({
    operation: ACL_GRANT,
    actor: actor.id,
    workspaceId: workspace.id,
    subjectId: administrator.id,
    level: 'admin',
  });

  // `없음` 이면 항목 자체를 만들지 않는다 (`FR-PRINCIPAL-007` AC-3).
  // 레벨 없는 항목을 두면 그것이 「부여됐으나 아무것도 못 한다」는 네
  // 번째 레벨이 되어 `DR-ACL-001` 의 세 값과 어긋난다.
  const level = input.defaultGroupLevel ?? 'none';
  if (level !== 'none') {
    stores.acl.grant({
      nodeId: workspace.id,
      principalId: DEFAULT_GROUP_ID,
      level,
      grantedBy: null,
    });
    stores.audit.append({
      operation: ACL_GRANT,
      actor: actor.id,
      workspaceId: workspace.id,
      subjectId: DEFAULT_GROUP_ID,
      level,
    });
  }

  return { ok: true, workspace };
}
