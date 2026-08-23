/**
 * 이름순 비교의 **공용 한 자리** (`FR-SHELL-011` AC-5).
 *
 * 목록마다 자체 비교식을 두면 같은 두 이름이 화면마다 다른 순서로 서고,
 * 그 어긋남은 두 목록을 나란히 놓고 보기 전까지 드러나지 않는다.
 */

/**
 * 로케일을 **`ko` 로 고정한다** (`FR-SHELL-011` AC-4).
 *
 * 기본 로케일을 쓰면 서버 호스트 설정에 따라 한글과 영문의 선후가 바뀌고,
 * 같은 목록이 배포 환경마다 다른 순서로 선다.
 *
 * `numeric` 은 `2` 가 `10` 보다 앞에 오게 하고(AC-2), `sensitivity: 'base'`
 * 는 대소문자와 악센트를 무시한다(AC-3).
 */
const COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 두 이름의 선후. `Array.prototype.sort` 에 그대로 넘긴다. */
export function compareNames(a: string, b: string): number {
  return COLLATOR.compare(a, b);
}
