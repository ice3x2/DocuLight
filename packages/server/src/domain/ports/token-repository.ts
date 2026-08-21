import type { PrincipalId } from '../principal/principal.js';
import type { TokenScope } from '../auth/token-scope.js';

/**
 * 개인 액세스 토큰 하나. **평문이 없다.**
 *
 * 이 레코드는 목록 화면으로 그대로 나간다 — 평문 칸이 있으면 「발급 시
 * 1회만 노출」(`SEC-AUTH-006` AC-2)이 그 자리에서 무너진다.
 */
export interface TokenRecord {
  id: string;
  userId: PrincipalId;
  name: string;
  scope: TokenScope;
  createdAt: string;
  expiresAt: string;
  /** 아직 쓴 적 없으면 `null` (`SEC-AUTH-006` AC-5). */
  lastUsedAt: string | null;
  /** 폐기되지 않았으면 `null`. 행을 지우지 않는 이유는 감사가 가리키기 때문이다. */
  revokedAt: string | null;
}

/**
 * PAT 저장소의 경계. 도메인이 소유한다.
 *
 * **평문을 돌려주는 메서드가 없다.** 조회는 해시로만 하고, 평문은 발급
 * 응답에 한 번 실린 뒤 어디에도 남지 않는다.
 */
export interface TokenRepository {
  /** 해시로 저장한다. 평문은 호출자가 갖고 여기로 넘어오지 않는다. */
  issue(tokenHash: string, token: Omit<TokenRecord, 'lastUsedAt' | 'revokedAt'>): void;

  /** 해시로 찾는다. 없으면 `undefined` — 만료·폐기 판정은 호출자가 한다. */
  findByHash(tokenHash: string): TokenRecord | undefined;

  findById(id: string): TokenRecord | undefined;

  /** 한 사용자의 토큰 전부. 폐기된 것도 포함한다 — 목록이 이력을 보여준다. */
  listFor(userId: PrincipalId): TokenRecord[];

  /** 마지막 사용 시각을 갱신한다 (`SEC-AUTH-006` AC-5). */
  touch(id: string, at: string): void;

  /** 폐기 시각을 남긴다. **행을 지우지 않는다** — 감사가 가리키는 대상이다. */
  revoke(id: string, at: string): void;
}
