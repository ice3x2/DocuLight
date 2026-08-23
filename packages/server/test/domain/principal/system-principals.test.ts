import { describe, expect, it } from 'vitest';

import {
  RESERVED_ACTORS,
  SYSTEM_RECONCILER,
  SYSTEM_RETENTION,
  isReservedActor,
} from '../../../src/domain/principal/system-principals.js';

describe('DR-AUDIT-001 — 사람이 아닌 주체는 하위체계별 예약 주체다', () => {
  it('AC-1 · AC-2: 하위체계마다 자기 주체 행을 갖는다', () => {
    expect(SYSTEM_RECONCILER).toBe('system:reconciler');
    expect(SYSTEM_RETENTION).toBe('system:retention');
    // 둘이 같으면 어느 하위체계가 한 일인지 감사에서 갈리지 않는다.
    expect(SYSTEM_RECONCILER).not.toBe(SYSTEM_RETENTION);
  });

  it('AC-6: 판정이 단일 지점이고 열거와 술어가 같은 집합을 본다', () => {
    // 술어를 따로 구현하면 주체가 하나 늘 때 열거만 늘고 술어가 안 는다.
    // 열거가 비면 이 루프가 0회 돌아 통과하므로 분모를 먼저 고정한다.
    expect(RESERVED_ACTORS.length).toBeGreaterThan(0);
    for (const actor of RESERVED_ACTORS) expect(isReservedActor(actor)).toBe(true);
    expect(RESERVED_ACTORS.length).toBe(new Set(RESERVED_ACTORS).size);
  });

  it('AC-7: 하위체계 구분이 접두에 있고 조작 값에 섞이지 않는다', () => {
    // `operation` 에 밀어 넣으면 그 값의 distinct 집합이 하위체계 × 조작의
    // 곱집합으로 부풀어 필터가 못 쓰게 된다.
    for (const actor of RESERVED_ACTORS) expect(actor.startsWith('system:')).toBe(true);
  });

  it('사람 주체는 예약이 아니다 — 전부 참을 주면 술어가 아무것도 안 가른다', () => {
    expect(isReservedActor('u-1')).toBe(false);
    expect(isReservedActor('system-superuser')).toBe(false);
    // 접두만 보면 아무나 `system:` 을 앞에 붙여 예약 주체 행세를 한다.
    expect(isReservedActor('system:없는것')).toBe(false);
  });
});
