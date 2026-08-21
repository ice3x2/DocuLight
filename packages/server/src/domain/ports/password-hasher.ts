/**
 * 비밀번호 해시의 경계. 도메인이 소유한다.
 *
 * **평문을 돌려주는 메서드가 없다.** 해시는 되돌릴 수 없다는 것이 그것을
 * 쓰는 이유이고, 되돌리는 자리를 열어 두면 그 이유가 사라진다.
 *
 * 비동기인 이유는 bcrypt 의 비용 인자가 의도적으로 느리기 때문이다 —
 * 동기로 두면 그 느림이 요청 처리 스레드를 그대로 막는다.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;

  /**
   * 저장된 해시와 대조한다 (`SEC-AUTH-001` AC-1).
   *
   * **던지지 않는다.** 손상된 해시나 빈 값을 만나도 `false` 다 — 검증
   * 실패는 예외 상황이 아니라 로그인 화면이 상시 도달하는 분기이며,
   * 예외로 흘리면 호출자가 그것을 `catch` 로 분기하게 된다.
   */
  verify(plain: string, stored: string): Promise<boolean>;
}
