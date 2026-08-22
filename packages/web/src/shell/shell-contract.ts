/**
 * 셸의 **고정 열거들.**
 *
 * 화면 코드가 아니라 여기 두는 이유는 이 값들이 요구사항이기 때문이다 —
 * 좌측 세 탭(`FR-SHELL-001` AC-1)·우측 세 탭(`FR-SHELL-004` AC-1)·설정
 * 모달의 카테고리(`IR-SHELL-002`)가 그것이다. 컴포넌트 안에 흩어
 * 두면 그 컴포넌트를 다시 만들 때 목록이 갈리고, 갈린 사실을 아무도
 * 알아채지 못한다.
 */

export interface ShellTab {
  id: string;
  label: string;
}

/** 좌측 사이드바 뷰 전환 탭 (`FR-SHELL-001` AC-1). 옵시디언의 배치를 따른다. */
export const LEFT_TABS: readonly ShellTab[] = [
  { id: 'tree', label: '문서 트리' },
  { id: 'search', label: '검색' },
  { id: 'favorites', label: '즐겨찾기' },
];

/** 우측 사이드바 탭 (`FR-SHELL-004` AC-1). */
export const RIGHT_TABS: readonly ShellTab[] = [
  { id: 'backlinks', label: '백링크' },
  { id: 'outgoing', label: '아웃고잉 링크' },
  { id: 'tags', label: '태그' },
];

/**
 * 설정 카테고리가 누구에게 보이는지를 정하는 조건.
 *
 * 세 구역은 조건이 서로 다르다 — 개인은 무조건, 워크스페이스 관리는
 * 관리 권한이 있는 워크스페이스가 하나라도 있을 때, 인스턴스는 슈퍼유저.
 * 휴지통만 네 번째 조건(접근 가능한 워크스페이스 ≥1)을 쓴다.
 */
export type CategoryGate = 'everyone' | 'has-workspace' | 'workspace-admin' | 'superuser';

export interface SettingsCategory extends ShellTab {
  section: 'personal' | 'workspace' | 'instance';
  gate: CategoryGate;
  /** 그 카테고리가 담기로 확정된 조작들. 비면 아직 목록이 확정되지 않은 것이다. */
  actions?: readonly string[];
}

/** 표시 조건 판정에 필요한 요청자의 사실들. 권한 판정 자체는 서버가 이미 했다. */
export interface Viewer {
  superuser: boolean;
  /** 접근 가능한 워크스페이스 수. */
  workspaceCount: number;
  /** 그중 `관리` 권한을 가진 워크스페이스 수. */
  adminWorkspaceCount: number;
}

/**
 * 설정 모달의 카테고리 **전량 목록** (`IR-SHELL-002`).
 *
 * 요구가 이 목록을 전량으로 못 박았다(AC-8) — 화면이 하나를 더 만들면
 * 그것은 요구에 없는 관리 진입점이 되고, `CON-SHELL-001` 이 진입점을
 * 하나로 묶어 둔 이유가 무너진다.
 *
 * **공유가 여기 없다** (`CON-SHELL-001` AC-3). 문서 하나를 고르는 자리를
 * 인스턴스 설정과 섞으면 수명도 대상도 다른 둘이 한 화면에 앉는다.
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: 'editor', label: '에디터', section: 'personal', gate: 'everyone' },
  { id: 'appearance', label: '외모(테마)', section: 'personal', gate: 'everyone' },
  { id: 'tokens', label: '액세스 토큰', section: 'personal', gate: 'everyone' },
  {
    id: 'account',
    label: '계정',
    section: 'personal',
    gate: 'everyone',
    actions: ['비밀번호 변경', '로그아웃'],
  },
  // 휴지통만 개인 구역에서 조건이 붙는다 — 전 워크스페이스 통합 목록이라
  // 워크스페이스가 하나도 없으면 열어도 볼 것이 없다 (`FR-SHELL-007` AC-2).
  { id: 'trash', label: '휴지통', section: 'personal', gate: 'has-workspace' },

  { id: 'workspace', label: '워크스페이스', section: 'workspace', gate: 'workspace-admin' },
  { id: 'acl-audit', label: '권한 감사', section: 'workspace', gate: 'workspace-admin' },
  { id: 'audit-log', label: '감사 로그', section: 'workspace', gate: 'workspace-admin' },

  { id: 'users', label: '사용자 관리', section: 'instance', gate: 'superuser' },
  { id: 'groups', label: '그룹 관리', section: 'instance', gate: 'superuser' },
  { id: 'signup-approval', label: '가입 승인', section: 'instance', gate: 'superuser' },
  { id: 'all-workspaces', label: '전체 워크스페이스', section: 'instance', gate: 'superuser' },
  { id: 'instance', label: '인스턴스 설정', section: 'instance', gate: 'superuser' },
];

/**
 * `인스턴스 설정` 카테고리가 담는 다섯 설정 (`IR-SHELL-002` AC-7).
 *
 * **라벨과 저장 키를 함께 든다.** 따로 적으면 하나를 고쳤을 때 다른 하나가
 * 남아 바꾼 값이 엉뚱한 자리에 저장되고, 그 어긋남은 저장해 본 사람만
 * 알아챈다.
 */
export interface InstanceSettingField {
  key: string;
  label: string;
}

export const INSTANCE_SETTING_FIELDS: readonly InstanceSettingField[] = [
  { key: 'signup-mode', label: '가입 모드' },
  { key: 'upload-size-limit-bytes', label: '업로드 크기 제한' },
  { key: 'retained-version-count', label: '보관 버전 개수' },
  { key: 'trash-retention-days', label: '휴지통 보존 일수' },
  { key: 'audit-retention-days', label: '감사 로그 보존 기간' },
];

/** 그 라벨들만. 목록을 확인하는 자리가 쓴다. */
export const INSTANCE_SETTINGS: readonly string[] = INSTANCE_SETTING_FIELDS.map(
  (field) => field.label,
);

/**
 * 이 요청자에게 보이는 카테고리들.
 *
 * 슈퍼유저 우회를 여기서 넓히지 않는다 — 휴지통의 조건은 「접근 가능한
 * 워크스페이스 ≥1」이지 권한 등급이 아니다. 우회가 거기까지 번지면
 * 슈퍼유저에게만 언제나 빈 휴지통이 열린다.
 */
export function visibleCategories(viewer: Viewer): SettingsCategory[] {
  return SETTINGS_CATEGORIES.filter((category) => {
    switch (category.gate) {
      case 'everyone':
        return true;
      case 'has-workspace':
        return viewer.workspaceCount > 0;
      case 'workspace-admin':
        return viewer.adminWorkspaceCount > 0;
      case 'superuser':
        return viewer.superuser;
    }
  });
}
