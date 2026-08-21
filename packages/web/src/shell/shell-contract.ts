/**
 * 셸의 **고정 열거들.**
 *
 * 화면 코드가 아니라 여기 두는 이유는 이 값들이 요구사항이기 때문이다 —
 * 좌측 세 탭(`FR-SHELL-001` AC-1)·우측 세 탭(`FR-SHELL-004` AC-1)·설정
 * 모달의 카테고리(`CON-SHELL-001` AC-2)가 그것이다. 컴포넌트 안에 흩어
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
 * 설정 모달의 좌측 카테고리 (`CON-SHELL-001` AC-2).
 *
 * **공유가 여기 없다** (AC-3). 문서 하나를 고르는 자리를 인스턴스 설정과
 * 섞으면 수명도 대상도 다른 둘이 한 화면에 앉는다 — 공유는 별도 모달이다.
 *
 * 개인 구역과 인스턴스 구역을 나누는 것은 그 둘의 **권한 조건**이 다르기
 * 때문이다. 인스턴스 구역은 슈퍼유저만 본다.
 */
export const SETTINGS_CATEGORIES: readonly ShellTab[] = [
  { id: 'account', label: '계정' },
  { id: 'appearance', label: '표시' },
  { id: 'users', label: '사용자 관리' },
  { id: 'instance', label: '인스턴스' },
];
