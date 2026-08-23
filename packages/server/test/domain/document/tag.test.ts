import { describe, expect, it } from 'vitest';

import { findTags } from '../../../src/domain/document/tag.js';

/**
 * 본문에서 태그를 훑는 규칙 (`FR-SHELL-009`).
 *
 * **파싱의 주인은 여기 하나다** — 위키링크와 같은 이유다. 화면과 서버가
 * 각자 훑으면 목록의 수치와 검색 결과가 서로 다른 규칙으로 세어지고, 그
 * 어긋남은 둘을 나란히 놓고 보기 전까지 드러나지 않는다.
 */
describe('FR-SHELL-009 — 본문의 태그를 훑는다', () => {
  it('`#이름` 을 찾는다', () => {
    expect(findTags('오늘 #회의 를 했다')).toEqual(['회의']);
  });

  it('AC-5: 같은 태그가 여러 번 나와도 한 번만 센다', () => {
    // 이 문서가 수치에 1 로 계산된다는 뜻이 여기서 나온다.
    expect(findTags('#회의 #회의 #회의')).toEqual(['회의']);
  });

  it('여럿이면 나온 순서대로 담는다', () => {
    expect(findTags('#가 그리고 #나')).toEqual(['가', '나']);
  });

  it('코드블록 안은 원문이다 — 거기 적힌 것은 태그가 아니라 예시다', () => {
    expect(findTags('```\n#회의\n```\n')).toEqual([]);
  });

  it('인라인 코드 안도 마찬가지다', () => {
    expect(findTags('`#회의` 라고 적는다')).toEqual([]);
  });

  it('머리말은 태그가 아니다 — `#` 뒤에 공백이 오면 제목이다', () => {
    expect(findTags('# 제목\n## 부제\n')).toEqual([]);
  });

  it('낱말 가운데의 `#` 은 태그가 아니다 — 색상 코드가 태그로 잡힌다', () => {
    expect(findTags('색은 fff#000 이고 url#anchor 도 있다')).toEqual([]);
  });

  it('숫자만으로 이뤄진 것은 태그가 아니다 — 마크다운 각주·번호와 갈리지 않는다', () => {
    expect(findTags('#1 #2')).toEqual([]);
  });

  it('중첩 태그의 슬래시를 이름의 일부로 본다', () => {
    expect(findTags('#기획/회의록')).toEqual(['기획/회의록']);
  });

  it('구두점에서 끊는다', () => {
    expect(findTags('#회의, #설계.')).toEqual(['회의', '설계']);
  });

  it('빈 본문에는 태그가 없다', () => {
    expect(findTags('')).toEqual([]);
  });
});
