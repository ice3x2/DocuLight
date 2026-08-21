import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_STATES,
  blockedReason,
  canAuthenticate,
} from '../../../src/domain/auth/account-gate.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';

const hasher = new BcryptPasswordHasher();

describe('SEC-AUTH-001 — 비밀번호는 bcrypt 해시로 저장하고 그 해시와 대조한다', () => {
  it('AC-1: 저장되는 값이 평문이 아니라 bcrypt 해시다', async () => {
    const plain = '올바른-말-네-개';
    const stored = await hasher.hash(plain);

    // 평문이 그대로 남으면 DB 유출이 곧 전 계정 유출이다.
    expect(stored).not.toBe(plain);
    expect(stored).not.toContain(plain);
    // bcrypt 해시의 형태 — 알고리즘·비용·솔트가 값 안에 들어 있다.
    expect(stored).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('AC-1: 검증은 평문 비교가 아니라 해시 대조로 수행된다', async () => {
    const stored = await hasher.hash('올바른-말-네-개');

    expect(await hasher.verify('올바른-말-네-개', stored)).toBe(true);
    expect(await hasher.verify('틀린-말', stored)).toBe(false);
  });

  it('같은 비밀번호가 매번 다른 해시가 된다 — 솔트가 값마다 다르다', async () => {
    const a = await hasher.hash('같은비밀번호');
    const b = await hasher.hash('같은비밀번호');

    // 같으면 레인보우 테이블 하나로 전 계정이 열린다.
    expect(a).not.toBe(b);
    expect(await hasher.verify('같은비밀번호', a)).toBe(true);
    expect(await hasher.verify('같은비밀번호', b)).toBe(true);
  });

  it('저장된 해시가 손상돼도 예외가 아니라 거짓으로 답한다', async () => {
    // 검증 실패는 예외 상황이 아니라 상시 도달하는 분기다.
    expect(await hasher.verify('아무거나', 'not-a-hash')).toBe(false);
    expect(await hasher.verify('아무거나', '')).toBe(false);
  });
});

describe('SEC-AUTH-003 — 계정 상태 게이트', () => {
  it('AC-1: 계정 상태는 넷이며 그중 정확히 하나다', () => {
    expect([...ACCOUNT_STATES].sort()).toEqual(['active', 'pending', 'rejected', 'suspended']);
  });

  it('AC-2 · AC-3: active 가 아니면 로그인도 토큰 인증도 통과하지 못한다', () => {
    expect(canAuthenticate('active')).toBe(true);

    for (const state of ['pending', 'suspended', 'rejected'] as const) {
      expect(canAuthenticate(state), `${state} 가 인증을 통과한다`).toBe(false);
    }
  });

  it('AC-4: rejected 와 suspended 가 서로 다른 값이라 이력이 보존된다', () => {
    // 한 값으로 합치면 「거절됐다」와 「정지됐다」가 구별되지 않아
    // 재심사(FR-AUTH-002)의 대상을 고를 수 없다.
    expect(blockedReason('rejected')).not.toBe(blockedReason('suspended'));
  });
});

describe('FR-AUTH-001 — 상태별 로그인 안내 문구', () => {
  it('AC-1 · AC-2 · AC-3: 세 상태가 각자의 안내를 갖는다', () => {
    expect(blockedReason('pending')).toBe('승인 대기 중');
    expect(blockedReason('suspended')).toBe('계정이 정지됨');
    expect(blockedReason('rejected')).toBe('가입이 거절됨');
  });

  it('AC-4: 세 문구가 서로 다르며 하나로 통합되지 않는다', () => {
    const reasons = (['pending', 'suspended', 'rejected'] as const).map(blockedReason);

    expect(new Set(reasons).size).toBe(3);
  });

  it('active 에는 차단 사유가 없다 — 사유는 차단됐을 때만 있는 값이다', () => {
    expect(blockedReason('active')).toBeNull();
  });
});
