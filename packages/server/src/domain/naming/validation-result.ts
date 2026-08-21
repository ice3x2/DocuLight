/**
 * 이름 검증의 결과 타입.
 *
 * **위반은 예외가 아니라 값이다** (C-13). 사용자가 친 이름이 규칙을 어기는
 * 것은 예외 상황이 아니라 예측 가능한 분기이고, 그것을 던지면 호출자가
 * `try`/`catch` 로 분기하게 되며 hot path 에서 스택트레이스 비용을 반복
 * 부담한다.
 */

/** 어긴 규칙의 식별자. 문구를 파싱해야 알 수 있으면 클라이언트가 문구에 묶인다. */
export type NameRule =
  | 'empty-name'
  /** 점으로 시작하는 이름 — 제품이 자기 것으로 쓰는 자리다 (`SEC-STORAGE-005`). */
  | 'reserved-namespace'
  | 'reserved-device-name'
  | 'forbidden-character'
  | 'control-character'
  | 'trailing-space-or-dot'
  | 'name-too-long'
  | 'path-too-long';

export interface NameViolation {
  rule: NameRule;
  /** 사용자가 읽고 다시 입력할 수 있는 문장 (`AC-7`). */
  message: string;
  /** 길이 규칙에서만 채운다. 한계가 **바이트**임을 드러내는 자리다. */
  limitBytes?: number;
  actualBytes?: number;
}

export type NameValidation = { ok: true } | { ok: false; violations: NameViolation[] };

export const valid: NameValidation = { ok: true };

export function invalid(violations: NameViolation[]): NameValidation {
  return { ok: false, violations };
}
