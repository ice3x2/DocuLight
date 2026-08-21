import bcrypt from 'bcryptjs';

import type { PasswordHasher } from '../../domain/ports/password-hasher.js';

/**
 * bcrypt 비용 인자.
 *
 * 10 은 널리 쓰이는 기본값이고, 요구는 알고리즘만 정하고 이 값을 정하지
 * 않았다. 낮추면 무차별 대입이 싸지고 올리면 로그인이 느려진다 — 그
 * 균형점을 여기 한 자리에 둔다.
 */
const COST = 10;

/**
 * bcrypt 어댑터 (`SEC-AUTH-001`).
 *
 * `bcryptjs` 를 쓴다. 네이티브 `bcrypt` 와 **같은 형식의 해시**($2b$)를
 * 내지만 빌드 도구 사슬을 요구하지 않는다 — 요구가 정한 것은 알고리즘이지
 * 패키지가 아니고, 네이티브 확장은 설치 환경마다 다르게 실패한다.
 *
 * 솔트는 해시 값 안에 들어간다. 그래서 계정마다 다른 솔트를 따로 저장할
 * 칸이 필요 없고, 같은 비밀번호가 매번 다른 해시가 된다.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, COST);
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    // 손상된 해시에 대해 bcrypt 는 던진다. 그것을 밖으로 흘리면 호출자가
    // 검증 실패를 `catch` 로 분기하게 되므로 여기서 값으로 바꾼다.
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }
}
