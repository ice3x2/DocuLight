import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalKind, PrincipalStatus } from '../../domain/principal/principal.js';

/**
 * 검색 결과 한 줄.
 *
 * 상태를 함께 싣는 이유는 화면이 배지를 붙여야 하기 때문이다
 * (`SEC-PRINCIPAL-002` AC-4). 상태를 빼고 주면 화면이 다른 경로로 다시
 * 물어야 하고, 그 경로가 곧 상태 필터를 우회하는 두 번째 문이 된다.
 */
export interface PrincipalHit {
  readonly id: string;
  readonly name: string;
  readonly kind: PrincipalKind;
  readonly status: PrincipalStatus;
}

/**
 * 최소 질의 길이 (`SEC-PRINCIPAL-003` AC-1).
 *
 * `FR-SHELL-014` 의 좌측 검색 탭에도 같은 값이 있으나 **다른 조항**
 * (`R149-c`)이다. 값이 같다는 이유로 한 상수로 묶지 마라 — 한쪽이 바뀌면
 * 다른 쪽이 조용히 따라간다.
 */
export const MINIMUM_QUERY = 2;

/** 결과 건수 상한 (`SEC-PRINCIPAL-003` AC-3). 잘라 내는 규칙이지 페이지네이션이 아니다. */
export const RESULT_LIMIT = 20;

/**
 * 사용자·그룹을 이름으로 찾는다 (`SEC-PRINCIPAL-002` · `SEC-PRINCIPAL-003`).
 *
 * **두 값을 인자로 받지 않는다** (`SEC-PRINCIPAL-003` AC-4). 받는 순간
 * 화면마다 다른 값을 줄 수 있게 되고, 갈리는 순간 열거 표면을 제한한다는
 * 목적 자체가 무너진다.
 *
 * 짧은 질의에 빈 목록을 주는 것은 「걸리는 게 없다」와 같은 모양이다 —
 * 그래야 한 글자로 명부를 훑는 경로가 아무 정보도 흘리지 않는다.
 *
 * `rejected` 만 뺀다 (`SEC-PRINCIPAL-002` AC-3). 검색에서 흔적 없이
 * 사라진 계정은 「오타인가, 계정이 없는가」를 가를 수 없어 문의를 만들고,
 * `pending` 을 빼면 입사 전 사전 세팅이라는 실제 수요가 막힌다.
 */
export function searchPrincipals(principals: PrincipalRepository, query: string): PrincipalHit[] {
  const wanted = query.trim().toLowerCase();
  if (wanted.length < MINIMUM_QUERY) return [];

  const matching = (kind: PrincipalKind): PrincipalHit[] =>
    principals
      .list(kind)
      .filter((record) => record.status !== 'rejected')
      .filter((record) => record.name.toLowerCase().includes(wanted))
      .map((record) => ({
        id: record.id,
        name: record.name,
        kind,
        status: record.status,
      }));

  // 종류마다 자르지 않고 **합친 뒤에** 자른다 — 종류마다 상한을 걸면 한
  // 질의로 상한의 두 배가 나간다.
  return [...matching('user'), ...matching('group')].slice(0, RESULT_LIMIT);
}
