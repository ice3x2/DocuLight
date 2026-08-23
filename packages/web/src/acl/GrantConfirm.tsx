/**
 * 부여·회수 전에 한 번 묻는 자리 (`FR-PRINCIPAL-005` · `FR-PRINCIPAL-008`).
 *
 * **사유는 서버가 준다.** 화면이 스스로 「마지막 관리자인가」나 「정지된
 * 계정인가」를 세면 서버가 아는 것과 갈리고, 갈리면 경고가 뜨지 않는
 * 조작이 생긴다. 여기서 하는 일은 그 사유를 문구로 옮기는 것뿐이다.
 *
 * **차단이 아니라 확인이다** — `FR-PRINCIPAL-005` AC-1 이 마지막 관리
 * 권한자 회수를 거부하지 말라고 정한다. 막으면 오프보딩이 그 자리에서
 * 멈추고, 그 계정은 권한을 쥔 채 남는다.
 */
export type GrantWarning = 'suspended-subject' | 'open-signup-edit' | 'last-administrator';

const 문구: Record<GrantWarning, string> = {
  // 가역이지만 **효과가 잠재**한다 — 재활성화 시점에 되살아난다.
  'suspended-subject': '비활성 계정입니다. 지금은 아무 효과가 없고 계정이 다시 활성화되면 이 권한이 살아납니다.',
  'open-signup-edit': '자유 가입 인스턴스입니다. 누구나 계정을 만들 수 있으므로 이 워크스페이스가 사실상 공개 쓰기가 됩니다.',
  'last-administrator': '이 워크스페이스의 마지막 관리 권한자입니다. 회수하면 관리자가 없는 워크스페이스가 됩니다.',
};

export function GrantConfirm({
  warnings,
  onConfirm,
  onCancel,
}: {
  /** 서버가 준 사유들. 비어 있으면 이 부품은 그리지 않는다. */
  warnings: readonly GrantWarning[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (warnings.length === 0) return null;

  return (
    // `alertdialog` 인 이유는 결과가 실행자의 의도와 다를 수 있다는 사실을
    // 먼저 알려야 하기 때문이다.
    <div role="alertdialog" aria-label="확인">
      <ul>
        {warnings.map((warning) => (
          <li key={warning} data-testid="grant-warning">
            {문구[warning]}
          </li>
        ))}
      </ul>

      {/* 그만둘 수 있어야 한다 — 없으면 잘못 연 사용자가 진행하게 된다
          (`FR-PRINCIPAL-005` AC-3 · `FR-PRINCIPAL-008` AC-2). */}
      <button type="button" onClick={onCancel}>
        취소
      </button>
      <button type="button" onClick={onConfirm}>
        계속
      </button>
    </div>
  );
}
