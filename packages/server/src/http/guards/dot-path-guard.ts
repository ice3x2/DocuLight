import { isHiddenName } from '../../domain/naming/hidden-name-rule.js';

/**
 * 점으로 시작하는 경로에 대한 직접 접근을 거부한다 (`SEC-STORAGE-004` ·
 * `R64` · `R64-a`).
 *
 * 표시 계층에서 숨기는 것만으로는 부족하다 — 원문 raw 읽기로 그대로
 * 뚫리기 때문에 API 계층의 거부를 함께 둔다.
 */

/**
 * 예외로 **열릴 수 있는** 엔드포인트의 종류. 여기 있다고 열리는 것이
 * 아니라, `EXEMPT_ENDPOINTS` 에 등록돼야 열린다.
 */
export const DOT_PATH_EXEMPTIONS = ['attachment-download', 'trash-or-version-api'] as const;

export type DotPathExemption = (typeof DOT_PATH_EXEMPTIONS)[number];

/**
 * 실제로 등록된 예외 — **허용 목록**이다.
 *
 * wave-1 은 한 건도 등록하지 않는다. 첨부 다운로드 전용 엔드포인트와
 * 휴지통·버전 전용 API 가 각자의 wave 에서 스스로를 여기 등록한다.
 *
 * 차단 목록으로 만들지 않는 이유 — 그러면 새 엔드포인트가 기본 허용이
 * 되어 목록에 적는 것을 잊는 순간 fail-open 이 된다.
 */
export const EXEMPT_ENDPOINTS: readonly DotPathExemption[] = [];

/**
 * 경로에 점으로 시작하는 **세그먼트**가 있는가 (`AC-6`).
 *
 * 역슬래시도 구분자로 본다. 슬래시만 보면 Windows 에서 온
 * `기획\.trash\x.md` 가 세그먼트 하나로 읽혀 그대로 통과한다.
 */
export function hasDotSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some(isHiddenName);
}

export type GuardVerdict = { allowed: true } | { allowed: false; reason: 'hidden-path' };

const ALLOWED: GuardVerdict = { allowed: true };
const DENIED: GuardVerdict = { allowed: false, reason: 'hidden-path' };

/**
 * 읽기든 쓰기든 **같은 판정**을 쓴다. 판정이 둘이면 한쪽만 고쳐진다.
 *
 * @param exemption 호출하는 엔드포인트가 자기가 예외라고 **주장**하는 값.
 *   주장만으로는 열리지 않고 `EXEMPT_ENDPOINTS` 에 등록돼야 열린다.
 */
export function guardDotPath(relativePath: string, exemption?: DotPathExemption): GuardVerdict {
  if (!hasDotSegment(relativePath)) {
    return ALLOWED;
  }
  return exemption !== undefined && EXEMPT_ENDPOINTS.includes(exemption) ? ALLOWED : DENIED;
}
