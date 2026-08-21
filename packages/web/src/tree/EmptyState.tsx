/**
 * 접근 가능한 것이 하나도 없는 사용자에게 보이는 안내 (`FR-AUTH-005`).
 *
 * 빈 트리를 그대로 보여 주지 않는다 — 아무 말 없는 빈 화면은 사용자에게
 * 「권한이 없다」가 아니라 「고장났다」로 읽히고, 그 차이가 곧 관리자에게
 * 갈지 말지를 가른다.
 *
 * 그래서 문구가 두 조각이다: **지금 어떤 상황인가**와 **누구에게 가야
 * 하는가**. 둘 중 하나만 있으면 사용자가 다음에 할 일을 모른다.
 */
export const EMPTY_STATE = {
  situation: '접근할 수 있는 문서가 아직 없습니다.',
  contact: '워크스페이스 관리자에게 권한을 요청하세요.',
} as const;

export function EmptyState() {
  return (
    <div role="note" aria-label="빈 상태 안내">
      <p>{EMPTY_STATE.situation}</p>
      <p>{EMPTY_STATE.contact}</p>
    </div>
  );
}
