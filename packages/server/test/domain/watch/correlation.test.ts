import { describe, expect, it } from 'vitest';

import {
  CORRELATION_WINDOW_MS,
  correlate,
  REJECTION,
  type AddEvent,
  type UnlinkEvent,
} from '../../../src/domain/watch/correlation.js';

/**
 * 서버에서 직접 옮긴 파일의 노드 상관 판정 (`REL-STORAGE-002`).
 *
 * 판정을 순수 함수로 둔 덕에 파일시스템도 시계도 없이 잰다 — 그 둘이
 * 있어야만 재는 규칙이었다면 이 조항의 fail-closed 성질을 확인하는 데
 * 매번 실제 감시자를 띄워야 한다.
 */

const 사라짐 = (over: Partial<UnlinkEvent> = {}): UnlinkEvent => ({
  path: '기획/예산.md',
  nodeId: 'node-1',
  contentHash: 'aaa',
  at: 1_000,
  ...over,
});

const 나타남 = (over: Partial<AddEvent> = {}): AddEvent => ({
  path: '보관/예산.md',
  contentHash: 'aaa',
  at: 1_100,
  ...over,
});

describe('unlink 와 add 의 상관 판정은 fail-closed 다', () => {
  it('AC-1: 해시가 같고 시간 창 안이면 같은 노드로 인정한다', () => {
    const 판정 = correlate([사라짐()], [나타남()]);

    expect(판정.moved).toHaveLength(1);
    expect(판정.moved[0]!.unlink.nodeId).toBe('node-1');
    expect(판정.moved[0]!.add.path).toBe('보관/예산.md');
    expect(판정.orphaned).toEqual([]);
    expect(판정.appeared).toEqual([]);
    expect(판정.rejected).toEqual([]);
  });

  it('AC-2: 내용 해시가 다르면 인정하지 않는다', () => {
    const 판정 = correlate([사라짐()], [나타남({ contentHash: 'bbb' })]);

    expect(판정.moved).toEqual([]);
    expect(판정.rejected).toHaveLength(1);
    expect(판정.rejected[0]!.reason).toBe(REJECTION.contentDiffers);
  });

  it('AC-3: 시간 창을 벗어나면 해시가 같아도 인정하지 않는다', () => {
    const 늦게 = 나타남({ at: 1_000 + CORRELATION_WINDOW_MS + 1 });

    const 판정 = correlate([사라짐()], [늦게]);

    expect(판정.moved, '창을 벗어난 쌍이 인정됐다').toEqual([]);
    expect(판정.rejected).toHaveLength(1);
    expect(판정.rejected[0]!.reason).toBe(REJECTION.outsideWindow);
  });

  it('경계 자리 — 창의 끝에 정확히 닿으면 아직 창 안이다', () => {
    const 끝자리 = 나타남({ at: 1_000 + CORRELATION_WINDOW_MS });

    expect(correlate([사라짐()], [끝자리]).moved).toHaveLength(1);
  });

  /**
   * **창이 짧다는 성질 자체를 잰다** (AC-3 · `R77-a`).
   *
   * 위 두 항은 창 값을 상수에서 읽어 상대적으로 자리를 잡는다. 경계가
   * 어디서 갈리는지를 재기에는 그것이 옳지만, 그 방식만으로는 창을 한 시간으로
   * 넓혀도 시험이 함께 넓어져 전부 통과한다 — 상호검증이 되돌림으로 실측했다.
   * 조항이 요구하는 것은 창이 있다는 것만이 아니라 그 창이 **짧다**는 것이고,
   * 넓힐수록 ACL 오이식 위험이 커지므로 상한을 여기서 못박는다.
   */
  it('AC-3: 시간 창은 짧다 — 사람이 파일을 옮기는 동안이지 한나절이 아니다', () => {
    expect(CORRELATION_WINDOW_MS).toBeGreaterThan(0);
    expect(
      CORRELATION_WINDOW_MS,
      '창이 5초를 넘으면 무관한 삭제와 생성이 같은 노드로 인정될 여지가 생긴다',
    ).toBeLessThanOrEqual(5_000);
  });

  it('AC-3: 한 시간 떨어진 쌍은 해시가 같아도 인정하지 않는다', () => {
    // 창 값을 참조하지 않고 절대 간격으로 잰다 — 위 항이 상한을 못박고
    // 이 항이 그 상한 밖의 실제 사례를 든다.
    const 한시간뒤 = 나타남({ at: 1_000 + 60 * 60 * 1_000 });

    const 판정 = correlate([사라짐()], [한시간뒤]);

    expect(판정.moved).toEqual([]);
    expect(판정.rejected[0]!.reason).toBe(REJECTION.outsideWindow);
  });

  it('AC-4: 인정되지 않은 쌍은 양쪽이 각각 제 갈 길을 간다', () => {
    const 판정 = correlate([사라짐()], [나타남({ contentHash: 'bbb' })]);

    // 인정되지 않았으므로 unlink 는 tombstone 대상, add 는 신규 노드 대상이다.
    // 그 둘이 rejected 안에 함께 들어 있어야 대기열이 한 항목으로 묶는다.
    expect(판정.rejected[0]!.unlink.nodeId).toBe('node-1');
    expect(판정.rejected[0]!.add.path).toBe('보관/예산.md');
  });

  it('짝이 아예 없으면 각각 홀로 남는다', () => {
    const 사라짐만 = correlate([사라짐()], []);
    expect(사라짐만.orphaned).toHaveLength(1);
    expect(사라짐만.rejected).toEqual([]);

    const 나타남만 = correlate([], [나타남()]);
    expect(나타남만.appeared).toHaveLength(1);
    expect(나타남만.rejected).toEqual([]);
  });

  it('한 unlink 가 여러 add 와 겹치면 해시가 같은 쪽을 고른다', () => {
    const 판정 = correlate(
      [사라짐()],
      [나타남({ path: '엉뚱/다른것.md', contentHash: 'zzz' }), 나타남({ path: '보관/예산.md' })],
    );

    expect(판정.moved).toHaveLength(1);
    expect(판정.moved[0]!.add.path).toBe('보관/예산.md');
    // 남은 하나는 짝이 없는 신규 파일이다 — 해시가 다르다는 이유로 거절된
    // 쌍으로 세면, 같은 add 가 이미 다른 unlink 와 짝지어졌는데도 대기열에
    // 미해소 항목이 하나 더 생긴다.
    expect(판정.appeared).toHaveLength(1);
    expect(판정.rejected).toEqual([]);
  });

  it('한 add 를 두 unlink 가 다투면 하나만 가져간다', () => {
    const 판정 = correlate(
      [사라짐({ nodeId: 'node-1' }), 사라짐({ nodeId: 'node-2', path: '기획/사본.md' })],
      [나타남()],
    );

    expect(판정.moved, '같은 파일이 두 노드로 인정됐다').toHaveLength(1);
    expect(판정.orphaned, '짝을 뺏긴 쪽이 tombstone 으로 가지 않았다').toHaveLength(1);
  });
});
