import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RETENTION_INTERVAL_MS,
  startRetentionLoop,
  type RetentionLoop,
} from '../../../src/app/retention/retention-loop.js';

/**
 * 보존 기간 일소의 주기 작업 (`R84-a` · `REL-AUDIT-003` · `FR-STORAGE-007`).
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
let 알림: string[];

/** 운영자 콘솔의 자리 — 제품에서는 `stores.announce` 가 들어온다. */
const 적는다 = (line: string) => {
  알림.push(line);
};
const 적힌것 = () => 알림.join('\n');

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
  알림 = [];
});

afterEach(async () => {
  await loop?.stop();
  loop = undefined;
  vi.useRealTimers();
});

describe('R84-a · FR-STORAGE-007 — 보존 기간 일소가 주기로 돈다', () => {
  it('둘 다 기동 직후 한 번 돈다', async () => {
    loop = startRetentionLoop(스토어(), { announce: 적는다 });

    await vi.advanceTimersByTimeAsync(0);

    // 한쪽만 배선하면 보존 기간이 반쪽만 성립한다 — 그 반쪽은 설정 화면에
    // 드러나지 않아 사용자는 둘 다 도는 줄 안다.
    expect([감사일소, 휴지통일소]).toEqual([1, 1]);
  });

  it('간격이 지나면 다시 돈다', async () => {
    loop = startRetentionLoop(스토어(), { announce: 적는다 });
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS);

    expect([감사일소, 휴지통일소]).toEqual([2, 2]);
  });

  it('운영 기본 간격이 실제로 배선된다 — 간격을 주지 않아도 돈다', async () => {
    loop = startRetentionLoop(스토어(), { announce: 적는다 });
    await vi.advanceTimersByTimeAsync(0);

    // 기본값을 상수로만 두고 배선에서 다른 값을 쓰면 이 항이 잡는다.
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS - 1);
    expect(감사일소).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(감사일소).toBe(2);
  });

  it('멈춘 뒤에는 더 돌지 않는다', async () => {
    loop = startRetentionLoop(스토어(), { announce: 적는다 });
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
    loop = startRetentionLoop(터지는쪽, { announce: 적는다 });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS);

    // 한쪽 실패가 루프를 죽이면 그 뒤로 보존이 통째로 멈추고, 멈춘 사실은
    // 아무 데도 드러나지 않는다.
    expect(휴지통일소).toBe(2);
    expect(감사일소).toBe(2);
  });
});

/**
 * **실패가 드러나는가** (이슈 #28 · `REL-AUDIT-003` · `FR-STORAGE-007`).
 *
 * 보존 기간이 지난 항목의 자동 영구 삭제는 `FR-STORAGE-007`(「휴지통 보존
 * 기간은 기본 30일이고 경과분은 자동 영구 삭제한다」)이고, `FR-STORAGE-006`
 * 은 복구가 원본 편집 권한을 요구한다는 다른 요구다. 위 블록과 이 모듈
 * 머리말이 오래 `FR-STORAGE-006` 을 인용하던 것을 2026-09-02 에 정정했다 —
 * 코드 넷과 SRS 를 한 번에 고쳤으므로 두 자리의 번호가 지금은 일치한다.
 * 복구 쪽을 가리키는 `FR-STORAGE-006` 인용(`trash-service.ts` · `trash.test.ts`)
 * 은 오기가 아니므로 그대로 두었다.
 *
 * 위의 「한쪽이 터져도 다른 쪽은 돈다」는 루프가 **살아남는 것**만 재고,
 * 터졌다는 사실이 어디에 남는지는 재지 않았다. 그래서 감사 일소가 한 건도
 * 지우지 못하는 전면 장애(이슈 #27)가 **한 배포 주기 동안** 로그 한 줄
 * 남기지 않고 가려져 있었다.
 *
 * **삼키는 것 자체는 옳다.** 이 조작에는 보고할 사용자가 없고, 감사 기록을
 * 남기면 그 행이 다시 만료 대상이 되어 끝없이 자기를 참조한다
 * (`sweepExpiredAudit` 의 AC-4). 그래서 「던진다」가 아니라 **「삼키되
 * 남긴다」**를 잰다. 남기는 자리는 설치 토큰이 이미 쓰는 출력처인 운영자
 * 콘솔(`stores.announce` · `SEC-AUTH-012` AC-1)이며, 새 관측 축이 아니다.
 */
describe('REL-AUDIT-003 · FR-STORAGE-007 — 일소가 실패하면 그 사실이 남는다', () => {
  it('감사 일소가 터지면 그 사실과 사유가 운영자에게 나간다', async () => {
    loop = startRetentionLoop(
      {
        sweepAudit: () => {
          throw new Error('만료 행을 참조가 붙들고 있다');
        },
        sweepTrash: async () => ({ purged: 0 }),
      },
      { announce: 적는다 },
    );

    await vi.advanceTimersByTimeAsync(0);

    // 어느 쪽이 죽었는지와 **왜** 죽었는지가 함께 있어야 한다 — 「일소가
    // 실패했다」만으로는 운영자가 다음에 무엇을 볼지 알 수 없다.
    expect(적힌것()).toMatch(/감사/);
    expect(적힌것()).toContain('만료 행을 참조가 붙들고 있다');
  });

  it('휴지통 일소가 터져도 같은 자리에 남는다', async () => {
    loop = startRetentionLoop(
      {
        sweepAudit: () => ({ purged: 0 }),
        sweepTrash: async () => {
          throw new Error('파일을 지우지 못했다');
        },
      },
      { announce: 적는다 },
    );

    await vi.advanceTimersByTimeAsync(0);

    // 두 catch 는 각각이다 — 한쪽만 남기면 다른 쪽이 같은 방식으로 묻힌다.
    expect(적힌것()).toMatch(/휴지통/);
    expect(적힌것()).toContain('파일을 지우지 못했다');
  });

  it('둘 다 성공하면 그 자리가 조용하다 — 회차마다 쌓이면 신호가 묻힌다', async () => {
    loop = startRetentionLoop(스토어(), { announce: 적는다 });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS * 3);

    expect([감사일소, 휴지통일소]).toEqual([4, 4]);
    expect(알림).toEqual([]);
  });

  it('남겼다고 루프가 멈추지 않는다 — 다음 회차가 정상으로 돌아오고 다시 조용해진다', async () => {
    const 결과: Array<{ audit?: number; trash?: number }> = [];
    loop = startRetentionLoop(
      {
        sweepAudit: () => {
          감사일소 += 1;
          if (감사일소 === 1) throw new Error('첫 회차만 터진다');
          return { purged: 3 };
        },
        sweepTrash: async () => ({ purged: 0 }),
      },
      { announce: 적는다, onRun: (one) => 결과.push(one) },
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RETENTION_INTERVAL_MS);

    // 남기는 일이 루프를 죽이면 첫 실패가 마지막 실패가 되고, 그 뒤로는
    // 보존이 통째로 멈춘 채 아무것도 나오지 않는다.
    expect(결과.map((one) => one.audit)).toEqual([undefined, 3]);
    // 회복한 뒤에도 계속 떠들면 다음 실패가 그 소음에 묻힌다.
    expect(알림).toHaveLength(1);
  });
});
