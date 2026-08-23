import { describe, expect, it } from 'vitest';

import { compareNames } from '../../../src/domain/naming/name-order.js';

/**
 * 이름순 비교의 **공용 한 자리** (`FR-SHELL-011` AC-5).
 *
 * 목록마다 자체 비교식을 두면 같은 두 이름이 화면마다 다른 순서로 서고,
 * 그 어긋남은 두 목록을 나란히 놓고 보기 전까지 드러나지 않는다.
 */
describe('FR-SHELL-011 — 이름순 비교', () => {
  const 정렬 = (names: string[]) => [...names].sort(compareNames);

  it('AC-2: 숫자를 인식해 `2` 가 `10` 보다 앞에 온다', () => {
    // 사전식이면 `10` 이 `2` 보다 앞에 온다 — 사람이 읽는 순서가 아니다.
    expect(정렬(['회의10', '회의2', '회의1'])).toEqual(['회의1', '회의2', '회의10']);
  });

  it('AC-3: 대소문자를 무시한다', () => {
    expect(compareNames('apple', 'Apple')).toBe(0);
    expect(정렬(['Banana', 'apple'])).toEqual(['apple', 'Banana']);
  });

  it('AC-3: 악센트를 무시한다', () => {
    expect(compareNames('resume', 'résumé')).toBe(0);
  });

  it('AC-4: 로케일이 `ko` 로 고정된다 — 호스트 로케일이 달라도 선후가 그대로다', () => {
    const 앞뒤 = 정렬(['하나', 'apple', '가나다', 'Banana']);

    // 값 자체를 고정한다. 로케일이 호스트를 따라가면 이 줄이 환경마다
    // 갈린다. `ko` 는 한글을 라틴 문자보다 앞에 둔다 — 어느 쪽이 앞인지가
    // 아니라 **환경과 무관하게 같은지**가 이 AC 의 내용이다.
    expect(앞뒤).toEqual(['가나다', '하나', 'apple', 'Banana']);
  });

  it('같은 이름은 0 이다 — 정렬이 안정적이려면 동률이 동률이어야 한다', () => {
    expect(compareNames('회의', '회의')).toBe(0);
  });
});
