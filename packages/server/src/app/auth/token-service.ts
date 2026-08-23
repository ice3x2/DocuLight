import { canAuthenticate } from '../../domain/auth/account-gate.js';
import { hashSecretToken, newSecretToken } from '../../domain/auth/secret-token.js';
import type { TokenScope } from '../../domain/auth/token-scope.js';
import { newOpaqueId } from '../../domain/identity/opaque-id.js';
import type { AuditSink } from '../../domain/ports/audit-sink.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { TokenRecord, TokenRepository } from '../../domain/ports/token-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import type { Clock } from './login-service.js';

export const PAT_ISSUE = 'pat.issue';
export const PAT_REVOKE = 'pat.revoke';

export interface TokenStores {
  principals: PrincipalRepository;
  tokens: TokenRepository;
  audit: AuditSink;
  clock: Clock;
}

export type TokenRule = 'self-only' | 'unknown-token' | 'account-not-active';

export type TokenIssued =
  | { ok: true; id: string; token: string }
  | { ok: false; rule: TokenRule };

export type TokenOutcome = { ok: true } | { ok: false; rule: TokenRule };

export type TokenList = { ok: true; tokens: TokenRecord[] } | { ok: false; rule: TokenRule };

/**
 * 발급·폐기·조회를 가르는 **단 하나의 규칙** (`SEC-AUTH-007`).
 *
 * 슈퍼유저 예외를 두지 않는다. 그것이 이 요구의 내용이다 — 관리자가 남의
 * 토큰을 만들 수 있으면 그 토큰으로 한 일이 누구의 일인지 갈리고, 감사
 * 로그의 행위자가 사실과 어긋난다.
 *
 * 목록도 같은 규칙을 받는다. 목록이 열리면 폐기 대상 ID 가 새어 나가
 * 폐기 금지가 우회된다.
 */
const isSelf = (actor: PrincipalId, owner: PrincipalId) => actor === owner;

/**
 * 토큰을 발급한다. **평문은 이 반환값에만 실린다** (`SEC-AUTH-006` AC-2).
 */
export function issueToken(
  stores: TokenStores,
  actor: PrincipalId,
  input: { owner: PrincipalId; name: string; scope: TokenScope; expiresInDays: number },
): TokenIssued {
  if (!isSelf(actor, input.owner)) return { ok: false, rule: 'self-only' };

  const account = stores.principals.findById(actor);
  if (account === undefined || !canAuthenticate(account.status)) {
    return { ok: false, rule: 'account-not-active' };
  }

  const plain = newSecretToken();
  const id = newOpaqueId();
  const now = stores.clock();

  stores.tokens.issue(hashSecretToken(plain), {
    id,
    userId: input.owner,
    name: input.name,
    scope: input.scope,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
  });

  // 스코프는 **이후값**이다 — `level` 칸은 ACL 레벨만 담는다
  // (`DR-AUDIT-002` AC-8 · 원장 `R164-b`). 발급은 없던 것이 생기는
  // 조작이라 이전값이 비고, 회수가 그 반대 방향으로 같은 값을 남긴다.
  stores.audit.append({
    operation: PAT_ISSUE,
    actor,
    subjectId: input.owner,
    afterValue: input.scope,
  });

  return { ok: true, id, token: plain };
}

export function revokeToken(
  stores: TokenStores,
  actor: PrincipalId,
  tokenId: string,
): TokenOutcome {
  const token = stores.tokens.findById(tokenId);
  if (token === undefined) return { ok: false, rule: 'unknown-token' };
  if (!isSelf(actor, token.userId)) return { ok: false, rule: 'self-only' };

  stores.tokens.revoke(tokenId, stores.clock().toISOString());
  stores.audit.append({
    operation: PAT_REVOKE,
    actor,
    subjectId: token.userId,
    beforeValue: token.scope,
  });

  return { ok: true };
}

/** 자기 토큰 목록. **평문은 여기 없다** — 레코드에 그 칸이 없다. */
export function listTokens(
  stores: TokenStores,
  actor: PrincipalId,
  owner: PrincipalId,
): TokenList {
  if (!isSelf(actor, owner)) return { ok: false, rule: 'self-only' };

  return { ok: true, tokens: stores.tokens.listFor(owner) };
}

/**
 * 토큰으로 주체를 세운다. 안 되면 `undefined`.
 *
 * 네 관문을 **전부** 지난다: 그런 토큰이 있는가 · 폐기되지 않았는가
 * (`SEC-AUTH-006` AC-6) · 만료되지 않았는가(AC-4) · 계정이 열려 있는가
 * (`SEC-AUTH-009`).
 *
 * 마지막 관문이 **요청 시점 조회**라는 것이 `SEC-AUTH-009` AC-4 다 —
 * 토큰에 상태를 담아 두면 계정을 정지시켜도 이미 발급된 토큰이 살아
 * 남고, 그것을 막으려면 토큰을 하나씩 폐기해야 한다(AC-3 위반).
 */
export function authenticateToken(
  stores: TokenStores,
  plain: string,
): { userId: PrincipalId; scope: TokenScope } | undefined {
  if (plain.length === 0) return undefined;

  const token = stores.tokens.findByHash(hashSecretToken(plain));
  if (token === undefined || token.revokedAt !== null) return undefined;

  const now = stores.clock();
  if (new Date(token.expiresAt).getTime() <= now.getTime()) return undefined;

  const account = stores.principals.findById(token.userId);
  if (account === undefined || !canAuthenticate(account.status)) return undefined;

  // 성공했을 때만 자국을 남긴다 — 실패한 시도까지 적으면 「마지막 사용」이
  // 「마지막 시도」가 되어 다른 사실을 담게 된다.
  stores.tokens.touch(token.id, now.toISOString());

  return { userId: token.userId, scope: token.scope };
}
