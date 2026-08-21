import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 자격증명 토큰의 발급과 저장 — 세션 토큰과 PAT 가 **같은 규칙**을 쓴다.
 *
 * 둘을 한 자리에 둔 이유는 지켜야 할 성질이 같기 때문이다: 추측 불가능할
 * 것, 저장소에 평문으로 남지 않을 것, 대조가 시간으로 새지 않을 것.
 * 자리를 나누면 한쪽만 고쳐진다.
 *
 * **비밀번호와는 다른 규칙을 쓴다.** 비밀번호는 사람이 고른 값이라 후보
 * 공간이 좁고 그래서 bcrypt 의 의도적 느림이 필요하다. 토큰은 128비트
 * 무작위라 사전 공격의 대상이 아니며, 매 요청 검증되므로 느리면 그 비용을
 * 요청마다 낸다.
 */
const TOKEN_BYTES = 32;

/** 새 토큰의 평문. **이 값은 여기서 나가면 다시 만들 수 없다.** */
export function newSecretToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** 저장·조회에 쓰는 형태. 평문을 저장소에 두지 않는다. */
export function hashSecretToken(plain: string): string {
  return createHash('sha256').update(plain).digest('base64');
}

/**
 * 두 해시가 같은가. **길이가 같을 때 상수 시간으로 비교한다.**
 *
 * 조회는 해시를 키로 하므로 대개 이 함수를 지나지 않지만, 목록을 훑어
 * 맞대는 경로(설치 토큰)가 있고 그 자리에서 `===` 를 쓰면 일치하는
 * 접두의 길이가 응답 시간으로 샌다.
 */
export function secretTokenEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
