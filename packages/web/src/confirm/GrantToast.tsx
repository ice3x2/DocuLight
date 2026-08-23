import { WIDENING_UNDO_LABEL, WIDENING_UNDO_NOTICE } from './notices.js';

/**
 * 넓히기 `L1` 의 되돌리기 토스트 (`FR-CONFIRM-014`).
 *
 * 라벨이 `실행취소` 가 아닌 이유는, 부여가 원래 상태로 돌아가는 조작이
 * 아니기 때문이다 — 권한 항목을 지워도 이미 열람된 내용은 되돌아오지
 * 않는다. `실행취소` 라 적으면 그 거짓 약속을 화면이 하게 된다.
 */
export function GrantToast({
  subjectName,
  entryId,
  onRevoke,
}: {
  subjectName: string;
  entryId?: string;
  onRevoke?: (entryId: string) => void;
}) {
  return (
    <div role="status">
      <span>{subjectName} 에게 권한을 부여했습니다.</span>
      <span>{WIDENING_UNDO_NOTICE}</span>
      <button
        type="button"
        onClick={() => (entryId === undefined ? undefined : onRevoke?.(entryId))}
      >
        {WIDENING_UNDO_LABEL}
      </button>
    </div>
  );
}
