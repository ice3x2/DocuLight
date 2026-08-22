/**
 * 보존 기간의 규칙 (`R154`).
 *
 * 휴지통과 감사 로그가 **같은 술어**를 쓴다. 각자 쓰면 `0` 의 뜻이 한쪽에서만
 * 바뀌는 날이 오고, 그날 두 설정은 같은 화면에서 정반대로 동작한다.
 */

/** `0` 은 「기간이 0일」이 아니라 「기간을 두지 않는다」다. */
export const UNLIMITED = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 그 시각에 생긴 것이 보존 기간을 넘겼는가.
 *
 * 무제한이면 언제나 아니다 — 그래서 `0` 을 넣은 인스턴스에서는 이 함수가
 * 시각을 읽지도 않는다.
 */
export function isPastRetention(at: string, retentionDays: number, now: Date): boolean {
  const cutoff = cutoffOf(retentionDays, now);
  return cutoff !== null && new Date(at).getTime() <= cutoff.getTime();
}

/**
 * 이 기간의 **경계 시각** — 이보다 앞선 것이 만료다. 무제한이면 `null`.
 *
 * 낱개를 훑는 쪽(`isPastRetention`)과 집합을 한 번에 지우는 쪽이 각자
 * `0` 을 판정하면 그 뜻이 한쪽에서만 바뀌는 날이 온다. 두 길이 여기서
 * 갈라지도록 경계 계산을 이 함수 하나에 둔다.
 */
export function cutoffOf(retentionDays: number, now: Date): Date | null {
  if (retentionDays <= UNLIMITED) return null;

  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * 첫째 기간이 둘째 기간을 **덮는가** — 무제한을 무한으로 놓고 비교한다.
 *
 * 감사 보존이 휴지통 보존을 덮어야 한다는 것이 `R154` 다. 덮지 못하면
 * 지워진 문서는 아직 복구할 수 있는데 누가 지웠는지는 이미 모르는 상태가
 * 된다. 휴지통이 무제한인데 감사가 유한한 것이 그 극단이다.
 */
export function covers(days: number, other: number): boolean {
  if (days <= UNLIMITED) return true;
  if (other <= UNLIMITED) return false;
  return days >= other;
}
