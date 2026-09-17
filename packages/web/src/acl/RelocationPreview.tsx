/**
 * 옮기거나 복사하면 몇 명이 되는가 (`FR-ACL-006` · `FR-ACL-002`).
 *
 * **두 조작이 한 부품이다.** 지표명이 갈리는 것을 막기 위해서다 — 이동
 * 화면이 「접근 가능」 을 쓰고 복사 화면이 「접근 가능자」 를 쓰면 같은
 * 지표가 화면마다 다른 이름으로 불린다 (`FR-ACL-006` AC-5).
 *
 * 이동은 전후 둘, 복사는 목적지 하나다 — 복사본의 접근자는 목적지 상속에서
 * 파생되므로 「복사 전」 이라는 자리가 성립하지 않는다.
 */
export type Relocation =
  | { readonly kind: 'move'; readonly before: number; readonly after: number }
  | { readonly kind: 'copy'; readonly reachable: number };

/** 이 지표의 이름. 한 곳에만 둔다 — 두 곳에 두면 한쪽만 바뀐다. */
const LABEL = '접근 가능';

export function RelocationPreview({
  relocation,
  level,
}: {
  relocation: Relocation;
  /** 요청자의 레벨. 명단을 볼 수 있는 사람에게만 다음 자리를 알려준다. */
  level?: 'view' | 'edit' | 'admin';
}) {
  // 명단을 담을 소품이 **없다** (`FR-ACL-006` AC-3 · `SEC-ACL-015` AC-4).
  // 칸을 두면 그 칸이 곧 누출 경로가 되고, 이니셜·부분 목록 같은 축소
  // 표시도 같은 칸에서 나온다.
  const accessibleLabel = relocation.kind === 'move'
    ? `이동 전 ${LABEL} ${relocation.before}명, 이동 후 ${LABEL} ${relocation.after}명`
    : `${LABEL} ${relocation.reachable}명`;
  const trend = relocation.kind !== 'move' || relocation.before === relocation.after
    ? null
    : relocation.after > relocation.before
      ? '볼 수 있는 사람이 늘어납니다.'
      : '볼 수 있는 사람이 줄어듭니다.';

  return (
    <div data-testid="relocation-preview" data-relocation-preview="">
      <p aria-label={accessibleLabel}>
        <span aria-hidden="true">
          {LABEL}{' '}
          {relocation.kind === 'move' ? (
            <>
              <span data-testid="relocation-count">{relocation.before}명</span>
              {' → '}
              <span data-testid="relocation-count">{relocation.after}명</span>
            </>
          ) : (
            <span data-testid="relocation-count">{relocation.reachable}명</span>
          )}
        </span>
      </p>

      {trend === null ? null : <p data-relocation-trend="">{trend}</p>}

      {level === 'admin' ? (
        // 명단이 필요하면 여기가 아니라 저기다 (`FR-ACL-006` AC-4). 이
        // 화면에 명단을 얹지 않는 대신 갈 곳을 알려준다.
        <p data-testid="roster-elsewhere">누가 접근하는지는 시뮬레이션 화면에서 확인합니다.</p>
      ) : null}
    </div>
  );
}
