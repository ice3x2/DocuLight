import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { readSetting } from '../settings/instance-settings.js';

export interface AdminPresenceStores {
  readonly acl: AclRepository;
  readonly workspaces: WorkspaceRepository;
  readonly principals: PrincipalRepository;
  readonly settings: SettingStore;
}

/**
 * 이 항목을 걷으면 그 워크스페이스의 관리 권한자가 0명이 되는가
 * (`FR-PRINCIPAL-005` AC-2).
 *
 * **서버가 판정한다.** 화면이 스스로 세면 서버가 아는 것과 갈리고, 갈리면
 * 경고가 뜨지 않는 회수가 생긴다.
 *
 * 관리 항목이 아니면 언제나 거짓이다 — 보기·편집을 걷는 것은 이 경고의
 * 대상이 아닌데, 대상으로 두면 경고가 흔해져 아무도 읽지 않게 된다.
 */
export function isLastAdministrator(stores: AdminPresenceStores, entryId: string): boolean {
  const entry = stores.acl.findEntry(entryId);
  if (entry === undefined || entry.level !== 'admin') return false;
  if (stores.workspaces.findById(entry.nodeId) === undefined) return false;

  return administratorsOf(stores, entry.nodeId).length === 1;
}

/**
 * 관리 권한자가 0명인 워크스페이스 (`FR-PRINCIPAL-006` AC-1).
 *
 * **슈퍼유저를 세지 않는다.** 슈퍼유저는 상방 게이트로 어느 워크스페이스에도
 * 닿지만 그것은 *지정된 관리자*가 아니다 — 세면 배지가 영영 뜨지 않고,
 * 그러면 관리자가 빠진 워크스페이스를 아무도 알아채지 못한다.
 */
export function adminlessWorkspaceIds(stores: AdminPresenceStores): string[] {
  return stores.workspaces
    .list()
    .filter((workspace) => administratorsOf(stores, workspace.id).length === 0)
    .map((workspace) => workspace.id);
}

const administratorsOf = (stores: AdminPresenceStores, workspaceId: string): PrincipalId[] =>
  stores.acl
    .entriesOn(workspaceId)
    .filter((entry) => entry.level === 'admin')
    .map((entry) => entry.principalId);

/**
 * 부여 전에 사용자에게 물어야 하는 것들.
 *
 * **경고이지 거부가 아니다** — 둘 다 실행할 수 있는 조작이고, 다만 그
 * 결과가 실행자의 의도와 다를 가능성이 높은 자리다.
 *
 * 문구가 아니라 **사유 코드**를 준다. 문구를 서버가 만들면 화면마다 같은
 * 상황에 다른 말이 나가고, 그 차이는 번역이나 맥락 조정이 필요할 때
 * 드러난다 — 다만 사유가 무엇인지는 한 곳에서 정해야 갈리지 않는다.
 */
export type GrantWarning = 'suspended-subject' | 'open-signup-edit';

export function grantWarnings(
  stores: AdminPresenceStores,
  input: { principalId?: PrincipalId; defaultGroupLevel?: 'none' | 'view' | 'edit' },
): GrantWarning[] {
  const warnings: GrantWarning[] = [];

  // 정지 계정에 주는 것은 가역이지만 **효과가 잠재**한다 —
  // 재활성화 시점에 되살아나므로 지금 아무 일도 일어나지 않는다
  // (`FR-PRINCIPAL-008` AC-1). `pending` 은 다르다: 입사 전 사전 세팅이
  // 실제 수요이고 그 부여는 `active` 전환 시점에 의도대로 유효해진다.
  if (input.principalId !== undefined) {
    const subject = stores.principals.findById(input.principalId);
    if (subject?.status === 'suspended') warnings.push('suspended-subject');
  }

  // 자유 가입이면 아무나 계정을 만들 수 있고 그 계정이 곧 `default` 다 —
  // 초기 권한이 `편집` 이면 그 워크스페이스가 사실상 공개 쓰기가 된다
  // (`FR-PRINCIPAL-007` AC-5).
  if (input.defaultGroupLevel === 'edit' && readSetting(stores.settings, 'signup-mode') === 'open') {
    warnings.push('open-signup-edit');
  }

  return warnings;
}
