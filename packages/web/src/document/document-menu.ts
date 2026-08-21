/**
 * 문서 헤더의 `⋯` 메뉴 항목 (`FR-SHELL-002`).
 *
 * **문서 단위로 작용하는 기능은 전부 여기 온다** — 설정 모달이 아니다.
 * 설정 모달은 사용자·워크스페이스·인스턴스에 매인 것을 담는 자리라,
 * 문서 하나를 고르는 조작이 섞이면 그 화면의 대상이 무엇인지 갈린다.
 *
 * 이 열거는 `IR-SHELL-002` 의 카테고리 목록과 달리 **전량 목록이 아니다**
 * — 요구가 규범으로 정한 것은 배치 규칙이고, 이 목록은 그 규칙을 적용한
 * 현재 상태다.
 */
export interface DocumentMenuItem {
  id: string;
  label: string;
}

export const DOCUMENT_MENU_ITEMS: readonly DocumentMenuItem[] = [
  { id: 'share', label: '공유' },
  { id: 'versions', label: '버전 기록' },
];
