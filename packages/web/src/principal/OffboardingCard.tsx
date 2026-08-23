import type { OffboardingCardBody } from '../api/client.js';

/**
 * 오프보딩 카드 — **코드베이스에 이것 하나뿐이다** (`CON-PRINCIPAL-004` AC-1).
 *
 * 사용자 관리 화면과 주체 일괄 회수 화면이 같은 부품으로 진입한다 (AC-2).
 * 두 화면이 각자 그리면 같은 흐름이 두 벌이 되고, 한쪽만 고쳐지면 나머지가
 * 조용히 어긋난다.
 *
 * **진행 상태를 여기서 들지 않는다** (AC-3 · AC-4). 완료 표시는 서버가
 * 계정 상태·멤버십·`acl_entry` 를 조회해 파생한 값이며, 그래서 4단계를
 * 다른 화면에서 처리해도 이 카드가 자동으로 맞는다. 상태를 들면 중단된
 * 오프보딩이 화면 안에 유령으로 남는다.
 *
 * 용어는 **오프보딩**이다 (`FR-PRINCIPAL-003` AC-7).
 */
const 단계문구 = {
  suspend: '계정 비활성화',
  tokens: '액세스 토큰 무효화',
  memberships: '그룹 멤버십 제거',
  acl: '권한 일괄 회수',
} as const;

export function OffboardingCard({
  card,
  onSuspend,
  onRevokeAll,
}: {
  /** 서버가 파생해 준 것. 아직 안 왔으면 `undefined`. */
  card?: OffboardingCardBody;
  onSuspend?: (principalId: string) => void;
  /** 주체 일괄 회수 화면으로 보낸다 — 여기서 실행하지 않는다 (AC-5). */
  onRevokeAll?: (principalId: string) => void;
}) {
  if (card === undefined) return null;

  const 단계 = new Map(card.steps.map((step) => [step.id, step]));
  const acl = 단계.get('acl');

  return (
    <section aria-label={`${card.principalName} 오프보딩`}>
      <ol>
        {card.steps.map((step) => (
          <li key={step.id} data-testid="offboarding-step" data-done={step.done ? 'true' : 'false'}>
            {단계문구[step.id]}
          </li>
        ))}
      </ol>

      {단계.get('suspend')?.done === true ? null : (
        <button type="button" onClick={() => onSuspend?.(card.principalId)}>
          계정 비활성화
        </button>
      )}

      {/* 진입 버튼과 완료 표시만 갖는다 (AC-5). 영향 범위 표는 그 화면에
          이미 있으므로 여기서 다시 그리면 중복 구현이 된다 (AC-6). */}
      {acl?.done === true ? (
        <p data-testid="offboarding-acl-done">권한 회수 완료</p>
      ) : (
        <button type="button" onClick={() => onRevokeAll?.(card.principalId)}>
          권한 일괄 회수 ({acl?.remaining ?? 0}건)
        </button>
      )}
    </section>
  );
}
