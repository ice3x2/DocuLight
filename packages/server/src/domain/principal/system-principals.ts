import type { PrincipalId } from './principal.js';

/**
 * 사람이 아닌 주체 (`DR-AUDIT-001`).
 *
 * **하위체계마다 자기 행을 갖는다.** 하나로 합치면 어느 하위체계가 한
 * 일인지 감사에서 갈리지 않고, 하위체계를 `operation` 값에 밀어 넣으면 그
 * 값의 distinct 집합이 하위체계 × 조작의 곱집합으로 부풀어 필터가 못 쓰게
 * 된다 (AC-7). 그래서 구분은 **행위자 쪽 접두**에 둔다.
 *
 * 예약 주체는 로그인·상태 전환·삭제가 불가능하다 (AC-3~AC-5) — 계정이
 * 아니라 감사 행의 행위자 자리를 채우는 이름이기 때문이다.
 */
export const SYSTEM_RECONCILER: PrincipalId = 'system:reconciler';

/** 보존 기간 만료가 일으킨 조작의 행위자 (`DR-AUDIT-001` AC-2). */
export const SYSTEM_RETENTION: PrincipalId = 'system:retention';

/**
 * 예약 주체 전량.
 *
 * 술어와 열거가 **같은 배열**을 본다 (AC-6) — 술어를 따로 구현하면 주체가
 * 하나 늘 때 열거만 늘고 술어는 안 늘어, 새 주체가 로그인 금지를 빠져나간다.
 */
export const RESERVED_ACTORS: readonly PrincipalId[] = [SYSTEM_RECONCILER, SYSTEM_RETENTION];

const RESERVED: ReadonlySet<PrincipalId> = new Set(RESERVED_ACTORS);

/**
 * 이 주체가 예약 주체인가 — **판정의 단일 지점** (`DR-AUDIT-001` AC-6).
 *
 * 접두만 보지 않는다. 그러면 아무나 `system:` 을 앞에 붙여 예약 주체
 * 행세를 하고, 그 행이 감사에서 하위체계의 것으로 읽힌다.
 */
export function isReservedActor(id: PrincipalId): boolean {
  return RESERVED.has(id);
}
