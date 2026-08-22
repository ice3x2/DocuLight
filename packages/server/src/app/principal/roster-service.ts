import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalId, PrincipalStatus } from '../../domain/principal/principal.js';
import { isSuperuser } from '../../domain/principal/subject.js';
import { isSystemGroup } from '../../domain/principal/system-groups.js';
import type { Actor } from '../acl/permission-service.js';

/**
 * 슈퍼유저 전용 명부 (`R163`).
 *
 * **주체 검색(`/principals`)과 다른 조작이다.** 그쪽은 부여할 대상을
 * 고르는 자리라 `rejected` 를 빼고 스무 건에서 자르지만, 이쪽은 슈퍼유저가
 * 계정 상태를 **직접 운영하는** 자리라 넷을 그대로 주고 상한이 없다
 * (`R112-d` · `FR-PRINCIPAL-009`). 두 규칙을 한 엔드포인트에 모드로 얹는
 * 길은 원리적으로 막혀 있다 — 같은 응답이 `rejected` 를 담으면서 담지
 * 않을 수는 없다.
 *
 * 상한이 없으므로 인가가 한 번 느슨해지면 `/principals` 보다 넓은 문이
 * 된다 (`R163-a`). 그래서 이 모듈의 모든 진입점이 **슈퍼유저 아니면
 * `null`** 을 돌려주고, 부르는 쪽은 그것을 「없는 것」과 같은 응답으로
 * 옮긴다.
 */
export interface RosterStores {
  readonly principals: PrincipalRepository;
  readonly acl: AclRepository;
}

export interface RosterUser {
  readonly id: PrincipalId;
  readonly name: string;
  /** 네 상태를 **그대로** 싣는다 — 뭉치면 계정 상태 게이트를 운영할 수 없다. */
  readonly status: PrincipalStatus;
}

export interface RosterGroup {
  readonly id: PrincipalId;
  readonly name: string;
  /** 시스템 그룹인가 — 지우려다 거절당하는 이유를 화면이 미리 알아야 한다. */
  readonly system: boolean;
  readonly members: readonly RosterUser[];
}

const superuser = (stores: RosterStores, actor: Actor): boolean =>
  isSuperuser(stores.principals.groupsOf(actor.id));

/** 등록된 사용자 전수 (`FR-PRINCIPAL-001` AC-1). 슈퍼유저가 아니면 `null`. */
export function userRoster(stores: RosterStores, actor: Actor): RosterUser[] | null {
  if (!superuser(stores, actor)) return null;

  return stores.principals
    .list('user')
    .map((record) => ({ id: record.id, name: record.name, status: record.status }));
}

/** 그룹과 그 멤버 (`FR-PRINCIPAL-001` AC-2). 슈퍼유저가 아니면 `null`. */
export function groupRoster(stores: RosterStores, actor: Actor): RosterGroup[] | null {
  if (!superuser(stores, actor)) return null;

  return stores.principals.list('group').map((group) => ({
    id: group.id,
    name: group.name,
    system: isSystemGroup(group.id),
    members: stores.principals
      .membersOf(group.id)
      .map((id) => stores.principals.findById(id))
      .filter((record): record is NonNullable<typeof record> => record !== undefined)
      .map((record) => ({ id: record.id, name: record.name, status: record.status })),
  }));
}

export type RosterRule = 'needs-superuser' | 'system-group-immutable' | 'unknown-principal' | 'not-a-group';
export type RosterOutcome = { ok: true } | { ok: false; rule: RosterRule };

/**
 * 그룹을 지운다 (`FR-PRINCIPAL-002`).
 *
 * 계정과 달리 그룹을 지울 수 있는 이유는 그룹이 감사 로그의 행위자가 될 수
 * 없어 이력이 끊기지 않기 때문이다. 반대로 그룹은 ACL 주체가 될 수
 * 있으므로, 지우기만 하고 항목을 남기면 **아무도 가리키지 않는 항목**이
 * 그 자리에 남는다.
 *
 * **그 회수를 여기서 다시 하지 않는다.** `acl_entry.principal_id` 가
 * `ON DELETE CASCADE` 로 선언돼 있어(`001_init.sql`) 삭제 한 문장이 곧
 * 항목 제거이고, 그래서 AC-3 의 「어느 한쪽만 반영된 상태」가 애초에
 * 표현되지 않는다. 앱 계층이 같은 일을 한 번 더 하면 **같은 책임을 두
 * 곳이 나눠 갖게** 되고, 스키마가 바뀔 때 한쪽만 고쳐진다. 스키마 쪽이
 * 정본인 이유는 저장소를 직접 만지는 경로에도 그것이 걸리기 때문이다.
 */
export function removeGroupWithGrants(
  stores: RosterStores,
  actor: Actor,
  groupId: PrincipalId,
): RosterOutcome {
  if (!superuser(stores, actor)) return { ok: false, rule: 'needs-superuser' };
  if (isSystemGroup(groupId)) return { ok: false, rule: 'system-group-immutable' };

  const group = stores.principals.findById(groupId);
  if (group === undefined) return { ok: false, rule: 'unknown-principal' };
  if (group.kind !== 'group') return { ok: false, rule: 'not-a-group' };

  stores.principals.removeGroup(groupId);
  return { ok: true };
}
