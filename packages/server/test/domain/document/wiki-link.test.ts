import { describe, expect, it } from 'vitest';

import { findWikiLinks } from '../../../src/domain/document/wiki-link.js';

describe('위키링크 훑기 (`CON-EDITOR-002` AC-1 · AC-3)', () => {
  it('본문의 `[[이름]]` 을 찾는다', () => {
    expect(findWikiLinks('앞은 [[회의록]] 이고 뒤는 [[설계]] 다')).toEqual(['회의록', '설계']);
  });

  it('별칭이 붙으면 대상만 취한다 — `|` 뒤는 보이는 글자일 뿐이다', () => {
    expect(findWikiLinks('[[회의록|지난 회의]]')).toEqual(['회의록']);
  });

  it('앞뒤 공백을 버린다 — 사람이 친 것이라 붙었다 떨어졌다 한다', () => {
    expect(findWikiLinks('[[  회의록  ]]')).toEqual(['회의록']);
  });

  it('같은 문서를 두 번 가리켜도 한 번만 센다 — 목록이 같은 줄로 채워진다', () => {
    expect(findWikiLinks('[[회의록]] 과 [[회의록]]')).toEqual(['회의록']);
  });

  it('빈 것은 링크가 아니다', () => {
    expect(findWikiLinks('[[]] 과 [[   ]]')).toEqual([]);
  });

  it('코드블록 안은 원문이다 — 거기 적힌 것은 링크가 아니라 예시다', () => {
    expect(findWikiLinks('```\n[[회의록]]\n```\n[[설계]]')).toEqual(['설계']);
  });

  it('인라인 코드 안도 마찬가지다', () => {
    expect(findWikiLinks('`[[회의록]]` 은 링크 문법이다')).toEqual([]);
  });

  it('줄을 넘어가면 링크가 아니다 — 닫히지 않은 괄호가 다음 줄을 삼킨다', () => {
    expect(findWikiLinks('[[회의\n록]]')).toEqual([]);
  });
});
