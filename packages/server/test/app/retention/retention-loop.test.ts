import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RETENTION_INTERVAL_MS,
  startRetentionLoop,
  type RetentionLoop,
} from '../../../src/app/retention/retention-loop.js';

/**
 * 보존 기간 일소의 주기 작업 (`R84-a` · `REL-AUDIT-003` · `FR-STORAGE-006`).
 *
 * 감사 일소(`sweepExpiredAudit`)와 휴지통 일소(`sweepExpiredTrash`) 둘 다
 * 함수는 있었으나 **그것을 도는 자리가 없었다** — 조립 방벽이 감사 쪽을
 * 「아직 배선되지 않음」 허용목록에 담고 있었고, 휴지통 쪽은 모듈이 다른
 * export 로 도달해 그 방벽이 잡지 못했다. 보존 기간을 설정할 수는 있는데
 * 그 기간이 지나도 아무 일도 일어나지 않는 상태였다.
 *
 * **둘을 한 주기 작업으로 묶는다.** 같은 성질의 조작이고(사람의 조작이 아니며
 * 권한 판정도 감사 기록도 없다) 같은 주기로 충분하다 — 나누면 타이머가 둘이
 * 되고, 한쪽만 배선이 빠져도 드러나지 않는다.
 */
let loop: RetentionLoop | undefined;
let 감사일소: number;
let 휴지통일소: number;

const 스토어 = () => ({
  sweepAudit: () => {
    감사일소 += 1;
    return { purged: 1 };
  },
  sweepTrash: async () => {
    휴지통일소 += 1;
    return { purged: 2 };
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  감사일소 = 0;
  휴지통일소 = 0;
});

afterEach(async () => {
  await loop?.stop();
  loop = undefined;
  vi.useRealTimers();
});

describe('R84-a · FR-STORAGE-006 — 보존 기간 일소가 주기로 돈다', () => {
  it('둘 다 기동 직후 한 번 돈다', async () => {
    loop = startRetentionLoop(스토어());

    await vi.advanceTimersByTimeAsync(0);

    // 한쪽만 배선하면 보존 기간이 반쪽만 성립한다 — 그 반쪽은 설정 화면에
    // 드러나지 않아 사용자는 둘 다 도는 줄 안다.
    expect([감사일소, 휴지통일소]).toEqual([1, 1]);
  });

  it('간격이 지나면 다시 돈다', async () => {
    loop = startRetentionLoop(스토어());
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS);

    expect([감사일소, 휴지통일소]).toEqual([2, 2]);
  });

  it('운영 기본 간격이 실제로 배선된다 — 간격을 주지 않아도 돈다', async () => {
    loop = startRetentionLoop(스토어());
    await vi.advanceTimersByTimeAsync(0);

    // 기본값을 상수로만 두고 배선에서 다른 값을 쓰면 이 항이 잡는다.
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS - 1);
    expect(감사일소).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(감사일소).toBe(2);
  });

  it('멈춘 뒤에는 더 돌지 않는다', async () => {
    loop = startRetentionLoop(스토어());
    await vi.advanceTimersByTimeAsync(0);

    await loop.stop();
    loop = undefined;
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS * 3);

    // 멈추지 않으면 종료 절차가 닫은 DB 를 다음 회차가 건드린다.
    expect([감사일소, 휴지통일소]).toEqual([1, 1]);
  });

  it('한쪽이 터져도 다른 쪽은 돈다 — 그리고 다음 회차가 계속된다', async () => {
    const 터지는쪽 = {
      sweepAudit: () => {
        감사일소 += 1;
        throw new Error('감사 일소가 터졌다');
      },
      sweepTrash: async () => {
        휴지통일소 += 1;
        return { purged: 0 };
      },
    };
    loop = startRetentionLoop(터지는쪽);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS);

    // 한쪽 실패가 루프를 죽이면 그 뒤로 보존이 통째로 멈추고, 멈춘 사실은
    // 아무 데도 드러나지 않는다.
    expect(휴지통일소).toBe(2);
    expect(감사일소).toBe(2);
  });
});
