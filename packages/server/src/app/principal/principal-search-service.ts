import { isSystemGroup } from '../../domain/principal/system-groups.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type {
  PrincipalKind,
  PrincipalRecord,
  PrincipalStatus,
} from '../../domain/principal/principal.js';

/**
 * 검색 결과 한 줄.
 *
 * 상태를 함께 싣는 이유는 화면이 배지를 붙여야 하기 때문이다
 * (`SEC-PRINCIPAL-002` AC-4). 상태를 빼고 주면 화면이 다른 경로로 다시
 * 물어야 하고, 그 경로가 곧 상태 필터를 우회하는 두 번째 문이 된다.
 */
export type VisibleStatus = Exclude<PrincipalStatus, 'rejected'>;

export interface PrincipalHit {
  readonly id: string;
  readonly name: string;
  readonly kind: PrincipalKind;
  /**
   * `rejected` 가 **타입에서 빠져 있다** (`SEC-PRINCIPAL-002` AC-3).
   *
   * 런타임 `filter` 한 줄만으로 지키면 그 줄이 바뀔 때 아무것도 알려
   * 주지 않는다. 여기서 좁혀 두면 거르기를 빼는 순간 컴파일이 깨진다.
   */
  readonly status: VisibleStatus;
  /**
   * 시스템 그룹인가 (`FR-PRINCIPAL-010` AC-1 · `CON-PRINCIPAL-002`).
   *
   * 후보에서 빼지 않되 그 사실은 알린다 — 화면이 ID 로 판정하면 시스템
   * 그룹의 정의가 두 곳에 살게 되고, 그룹이 하나 늘 때 한쪽만 바뀐다.
   * 사용자에게는 언제나 거짓이다: 시스템 사용자라는 개념이 없다.
   */
  readonly system: boolean;
}

/** `rejected` 를 걸러 내면서 그 사실을 타입으로 옮긴다. */
const visible = (record: PrincipalRecord): record is PrincipalRecord & { status: VisibleStatus } =>
  record.status !== 'rejected';

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
 *
 * **어느 조항도 정하지 않은 축이 셋 있다** — 질의의 앞뒤 공백을 길이에
 * 세는가, 대소문자를 무시하는가, 상한에 걸릴 때 무엇이 먼저 잘리는가.
 * 여기서 각각 「세지 않는다 · 무시한다 · 그룹이 먼저 잘린다」로 정했고
 * 시험이 그 관측 거동을 고정한다. 정하는 조항이 생기면 그 시험이 먼저
 * 깨진다 — 규칙을 지어내는 대신 지금 무엇을 하고 있는지를 못박은 것이다.
 */
export function searchPrincipals(principals: PrincipalRepository, query: string): PrincipalHit[] {
  const wanted = query.trim().toLowerCase();
  if (wanted.length < MINIMUM_QUERY) return [];

  const matching = (kind: PrincipalKind): PrincipalHit[] =>
    principals
      .list(kind)
      .filter(visible)
      .filter((record) => record.name.toLowerCase().includes(wanted))
      .map((record) => ({
        id: record.id,
        name: record.name,
        kind,
        status: record.status,
        // 후보에서 빼지 않되 그 사실은 알린다 (`FR-PRINCIPAL-010` AC-1).
        system: kind === 'group' && isSystemGroup(record.id),
      }));

  // 종류마다 자르지 않고 **합친 뒤에** 자른다 — 종류마다 상한을 걸면 한
  // 질의로 상한의 두 배가 나간다. 사용자를 앞에 두므로 상한에 걸리면
  // 그룹이 먼저 잘려 나간다.
  return [...matching('user'), ...matching('group')].slice(0, RESULT_LIMIT);
}
