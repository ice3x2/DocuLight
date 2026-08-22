import { permissionOf, type AclStores, type Actor } from '../acl/permission-service.js';
import { permits } from '../../domain/acl/level.js';
import { isSuperuser } from '../../domain/principal/subject.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import type { NodeId } from '../../domain/node/node-id.js';

/**
 * 주체를 찾아 **무엇에 부여하려는가** (`R162`).
 *
 * 판별 합집합인 이유는 셋의 요구 레벨이 서로 다르기 때문이다 — 하나의
 * 문자열 ID 로 받으면 어느 종류인지 값에서 읽을 수 없고, 읽지 못하면
 * 판정이 호출자 재량이 된다.
 */
export type SearchScope =
  | { readonly kind: 'node'; readonly nodeId: NodeId }
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'group'; readonly groupId: PrincipalId };

/**
 * `종류:식별자` 를 스코프로 읽는다. 읽히지 않으면 `null`.
 *
 * **기본값이 없다.** 빠진 스코프를 「전역 검색」으로 채우면 안전한 쪽이
 * 명시적 선택이 되고, 빠뜨린 호출 하나가 명부를 연다 (`R162`).
 */
export function parseScope(raw: string | undefined): SearchScope | null {
  const at = raw?.indexOf(':') ?? -1;
  if (raw === undefined || at <= 0) return null;

  const id = raw.slice(at + 1);
  if (id === '') return null;

  switch (raw.slice(0, at)) {
    case 'node':
      return { kind: 'node', nodeId: id };
    case 'workspace':
      return { kind: 'workspace', workspaceId: id };
    case 'group':
      return { kind: 'group', groupId: id };
    default:
      return null;
  }
}

/**
 * 이 요청자가 그 대상을 두고 주체를 찾을 수 있는가 (`R162`).
 *
 * **새 권한 축을 만들지 않는다.** 「검색할 수 있는가」를 독립 정책으로
 * 세우면 `R70-a` 가 `편집` 에게 연 부여와 갈리고, 갈리는 순간 정당한
 * 부여자가 대상을 찾지 못한다. 그래서 셋 다 이미 있는 조작 자격을 그대로
 * 읽는다 — 노드는 `편집`(`R70-a`), 워크스페이스 관리자 지정은 `관리`
 * (`R24-a`), 그룹 멤버 추가는 슈퍼유저(`FR-PRINCIPAL-001` AC-3).
 *
 * 그래서 Phase 2 에서 위임이 계층적으로 깊어져도 **이 함수가 바뀌지
 * 않는다** — 위임받은 사람이 갖는 것은 그 서브트리의 `편집` 이고 그것은
 * 상속으로 이미 아래로 내려간다.
 *
 * 없는 대상과 권한 없는 대상이 **같은 답**을 받는다 (`R162-a`) — 갈리면
 * 이 자리가 존재 오라클이 된다.
 */
export function maySearchFor(stores: AclStores, actor: Actor, scope: SearchScope): boolean {
  switch (scope.kind) {
    case 'node': {
      const level = permissionOf(stores, actor, scope.nodeId);
      return level !== null && permits(level, 'edit');
    }
    case 'workspace': {
      const level = permissionOf(stores, actor, scope.workspaceId);
      return level !== null && permits(level, 'admin');
    }
    case 'group': {
      // 그룹의 실재를 함께 본다 — 없는 그룹에 열어 두면 슈퍼유저에게는
      // 스코프가 사실상 없는 것과 같아진다.
      const group = stores.principals.findById(scope.groupId);
      return group?.kind === 'group' && isSuperuser(stores.principals.groupsOf(actor.id));
    }
  }
}
