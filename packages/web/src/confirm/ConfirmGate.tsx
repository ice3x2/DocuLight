import { useEffect, useId, useState } from 'react';

/** 확인 등급 (`FR-CONFIRM-001`). 체계는 이 셋 하나뿐이다. */
export type Grade = 'L1' | 'L2' | 'L3';

/**
 * 확인 다이얼로그가 보여 줄 수치 (`FR-CONFIRM-004` · `FR-CONFIRM-012`).
 *
 * **여는 시점에 재조회한 값이다.** 미리 받아 둔 값을 그리면 그 사이에
 * 대상이 늘거나 준 것을 실행자가 모른 채 승인한다.
 */
export interface ConfirmCounts {
  /** 적용 하위 노드 수. 컨테이너 부여에만 있다. */
  readonly reached?: number;
  /** 영향 건수. 보존 기간 축소에만 있다. */
  readonly affected?: number;
}

/**
 * 확인 관문 — **세 등급을 이 부품 하나가 그린다** (`FR-CONFIRM-001`).
 *
 * 화면마다 자기 확인을 만들면 같은 등급 이름에 다른 절차가 붙고, 그때 두
 * 화면을 오가며 구현하면 확인 단계가 통째로 사라질 수 있다.
 *
 * - `L1` 확인 없이 실행하고 되돌리기 토스트를 띄운다.
 * - `L2` 실행 전에 다이얼로그를 받는다.
 * - `L3` 실행 전에 토큰을 타이핑해야 한다.
 *
 * **입력 폼은 관문이 아니다** (`FR-CONFIRM-005`). 목적지를 고르고 입력을
 * 마친 **뒤에** 이 부품이 선다 — 드래그앤드롭으로 목적지가 미리 채워져도
 * 마찬가지다. 그래서 이 부품은 실행 직전에만 놓인다.
 */
export function ConfirmGate({
  open,
  grade,
  title,
  token,
  counts,
  delayedEffect = false,
  onRecount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  grade: Grade;
  title: string;
  /** `L3` 이 요구하는 타이핑 값. 수치가 바뀌면 이 값도 함께 바뀐다 (AC-4). */
  token?: string | null;
  counts?: ConfirmCounts;
  /**
   * 지금은 아무 일도 일어나지 않는 조작인가 (`FR-CONFIRM-008`).
   *
   * 등급과 **무관하게** 고지가 붙는다 — `L1` 이라도 효과가 지연되면
   * 사용자는 결과를 확인할 수 없다.
   */
  delayedEffect?: boolean;
  /** 열 때 수치를 다시 받아 온다 (`FR-CONFIRM-004` AC-1). */
  onRecount?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [typed, setTyped] = useState('');
  const [seen, setSeen] = useState<string | null>(null);

  const 지금 = JSON.stringify(counts ?? {});

  useEffect(() => {
    if (!open) {
      setSeen(null);
      setTyped('');
      return;
    }
    onRecount?.();
    // 처음 열릴 때의 값을 기준으로 삼는다. 그 뒤 값이 달라지면 잠근다.
    setSeen((was) => was ?? 지금);
  }, [open, onRecount, 지금]);

  if (!open) return null;

  // 재조회한 값이 직전 값과 다르면 실행을 잠근다 (AC-2). 같으면 잠그지
  // 않는다 (AC-3) — 열 때마다 잠그면 사용자가 잠금을 무시하게 된다.
  const locked = seen !== null && seen !== 지금;
  // 잠긴 뒤에는 **갱신된 수치**를 쳐야 한다 (AC-4 · AC-5). 이전 수치를
  // 그대로 두면 사용자가 바뀐 것을 못 본 채 통과한다.
  const 요구토큰 = token ?? null;
  const 칠수있음 = grade !== 'L3' || typed === 요구토큰;

  return (
    <div role="alertdialog" aria-labelledby={titleId} data-grade={grade}>
      <h2 id={titleId}>{title}</h2>

      {counts?.reached === undefined ? null : (
        // 사람 수를 세는 접근자 지표와 라벨을 공유하지 않는다 — 공유하면
        // 어느 것이 사람이고 어느 것이 노드인지 화면에서 갈리지 않는다.
        <p data-testid="reached-count">적용 하위 노드 {counts.reached}개</p>
      )}

      {counts?.affected === undefined ? null : (
        <p data-testid="affected-count">영향 {counts.affected}건</p>
      )}

      {delayedEffect ? (
        <p data-testid="delayed-notice">
          지금은 아무 일도 일어나지 않습니다. 다음 정리 시점에 한꺼번에 적용됩니다.
        </p>
      ) : null}

      {locked ? <p data-testid="confirm-locked">수치가 바뀌었습니다. 갱신된 값을 확인하세요.</p> : null}

      {grade === 'L3' && 요구토큰 !== null ? (
        <>
          <label htmlFor={`${titleId}-token`}>{요구토큰} 를 입력하세요</label>
          <input id={`${titleId}-token`} value={typed} onChange={(event) => setTyped(event.target.value)} />
        </>
      ) : null}

      <button type="button" onClick={onCancel}>
        취소
      </button>
      <button type="button" disabled={locked || !칠수있음} onClick={onConfirm}>
        실행
      </button>
    </div>
  );
}
