import { describe, expect, it } from 'vitest';

import { parseQuery } from '../../../src/domain/search/query.js';

/**
 * 검색 질의 문법 (`FR-SHELL-014` · 원장 `R149-b`·`R149-c`·`R149-f`).
 *
 * 이 파일은 AC 아홉을 그대로 옮긴 것이다 — 조항이 이미 수용 조건을
 * 문장으로 갖고 있어 번역이 필요 없다.
 */

/** 수용된 질의의 그룹 구조. 거부면 `null`. */
const groups = (text: string): string[][] | null => {
  const parsed = parseQuery(text);
  return parsed.ok ? parsed.groups.map((group) => [...group]) : null;
};

const accepts = (text: string) => parseQuery(text).ok;

describe('FR-SHELL-014 AC-1 · AC-2 — 공백은 AND 이고 파이프는 OR 다', () => {
  it('AC-1: 공백으로 나뉜 두 낱말은 한 묶음에 든다 — 둘 다 일치해야 한다', () => {
    expect(groups('회의 규정')).toEqual([['회의', '규정']]);
  });

  it('AC-2: 파이프로 나뉜 두 낱말은 서로 다른 묶음이 된다 — 어느 하나면 된다', () => {
    expect(groups('회의 | 규정')).toEqual([['회의'], ['규정']]);
  });

  it('파이프 앞뒤의 공백은 뜻을 바꾸지 않는다', () => {
    expect(groups('회의|규정')).toEqual(groups('회의 | 규정'));
  });
});

describe('FR-SHELL-014 AC-3 ~ AC-6 — 최소 질의 길이', () => {
  it('AC-3: 항이 하나면 2자 이상일 때만 수용된다', () => {
    expect(accepts('회의')).toBe(true);
    expect(accepts('회')).toBe(false);
  });

  it('AC-4: AND 는 2자 이상 항이 하나라도 있으면 1자를 함께 담아도 수용된다', () => {
    expect(accepts('회 규정')).toBe(true);
  });

  it('AC-5: 모든 항이 1자인 AND 는 수용되지 않는다', () => {
    expect(accepts('회 규')).toBe(false);
  });

  it('AC-6: OR 는 항 하나라도 1자이면 수용되지 않는다', () => {
    expect(accepts('회 | 규정')).toBe(false);
    expect(accepts('회의 | 규')).toBe(false);
    expect(accepts('회의 | 규정')).toBe(true);
  });
});

describe('FR-SHELL-014 AC-7 ~ AC-9 — 혼용과 괄호 (`R149-f`)', () => {
  it('AC-7: AND 가 파이프보다 강하게 묶인다', () => {
    // `(회의 AND 규정) OR 일정` 이다. 반대로 읽으면
    // `회의 AND (규정 OR 일정)` 이 되어 「회의」를 안 가진 문서가 빠진다.
    expect(groups('회의 규정 | 일정')).toEqual([
      ['회의', '규정'],
      ['일정'],
    ]);
  });

  it('AC-8: 최소 길이는 묶음마다 독립으로 판정된다', () => {
    // 앞 묶음은 `규정` 이 통과시키고 뒤 묶음은 `일정` 이 통과시킨다.
    expect(accepts('회 규정 | 일정')).toBe(true);
    // 뒤 묶음이 1자 하나뿐이라 그 묶음이 실패한다 — `R149-c` 가 막으려던
    // 무제약 1자 가지가 이 규칙 아래에서 열리지 않는다.
    expect(accepts('회의 규정 | 일')).toBe(false);
    // 앞 묶음이 전부 1자다.
    expect(accepts('회 규 | 일정')).toBe(false);
  });

  it('AC-9: 괄호는 연산자가 아니라 항의 일부다', () => {
    expect(groups('회의록(2026)')).toEqual([['회의록(2026)']]);
    // 괄호만으로는 묶음이 갈리지 않는다.
    expect(groups('(회의 규정)')).toEqual([['(회의', '규정)']]);
  });
});

describe('FR-SHELL-014 — 조항이 정하지 않은 자리의 처분', () => {
  it('빈 질의는 수용되지 않는다', () => {
    expect(accepts('')).toBe(false);
    expect(accepts('   ')).toBe(false);
  });

  it('앞뒤와 연속 파이프는 빈 묶음을 만들지 않는다', () => {
    // `R149-f` 가 미결로 남긴 자리다. 빈 묶음을 남기면 그것이 「아무거나」로
    // 읽혀 질의 전체가 코퍼스가 된다 — 어느 쪽으로 정하든 그것만은 안 된다.
    expect(groups('| 회의 |')).toEqual([['회의']]);
    expect(groups('회의 || 규정')).toEqual([['회의'], ['규정']]);
  });

  it('항이 하나도 남지 않으면 거부한다', () => {
    expect(accepts('|')).toBe(false);
    expect(accepts('| |')).toBe(false);
  });

  it('탭과 여러 칸 공백도 낱말을 가른다', () => {
    expect(groups('회의\t\t규정')).toEqual([['회의', '규정']]);
  });
});
