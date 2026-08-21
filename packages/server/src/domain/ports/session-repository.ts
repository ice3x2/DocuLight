import type { PrincipalId } from '../principal/principal.js';

/**
 * 세션 하나. **누구인가와 언제까지인가만 담는다.**
 *
 * 권한을 담는 칸이 없다 (`SEC-AUTH-002` AC-1) — 담으면 그것이 스냅샷이
 * 되어 권한 회수가 다음 요청에 반영되지 않는다.
 */
export interface SessionRecord {
  userId: PrincipalId;
  createdAt: string;
  expiresAt: string;
}

/**
 * 세션 저장소의 경계. 도메인이 소유한다.
 *
 * **평문 토큰을 돌려주는 메서드가 없다.** 저장소는 해시만 알고, 평문은
 * 발급 응답에 한 번 실린 뒤 어디에도 남지 않는다.
 */
export interface SessionRepository {
  /** 해시로 저장한다. 평문은 호출자가 갖고 여기로 넘어오지 않는다. */
  create(tokenHash: string, session: SessionRecord): void;

  /** 없거나 만료됐으면 `undefined` — 만료 판정은 호출자의 시계로 한다. */
  find(tokenHash: string): SessionRecord | undefined;

  remove(tokenHash: string): void;

  /** 한 사용자의 세션 전부를 끊는다. 계정 정지가 쓴다. */
  removeAllFor(userId: PrincipalId): void;
}
