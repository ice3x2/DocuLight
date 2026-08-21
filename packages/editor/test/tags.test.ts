import { describe, expect, it } from 'vitest';

import { findTags, isFrontmatterRange, type TagMatch } from '../src/core/tags';

const at = (text: string): TagMatch[] => findTags(text);
const names = (text: string) => at(text).map((t) => t.name);

describe('FR-EDITOR-007 AC-10 — 본문 태그를 찾는다', () => {
  it('본문의 #태그 를 찾는다', () => {
    expect(names('오늘 #회의 를 했다')).toEqual(['회의']);
  });

  it('여러 개를 모두 찾고 각각의 자리를 준다', () => {
    const found = at('#가 그리고 #나');

    expect(found.map((t) => t.name)).toEqual(['가', '나']);
    expect(found[0]!.from).toBe(0);
    expect(found[0]!.to).toBe(2);
  });

  it('한글·영문·숫자·밑줄·하이픈·슬래시를 담는다 — 옵시디언의 태그 문법이다', () => {
    expect(names('#기획/2026-q1_초안 #a1')).toEqual(['기획/2026-q1_초안', 'a1']);
  });

  it('`#` 뒤가 비면 태그가 아니다 — 그냥 샵 문자다', () => {
    expect(names('# 헤딩이다')).toEqual([]);
    expect(names('끝에 #')).toEqual([]);
  });

  it('헤딩은 태그가 아니다 — 줄머리의 `#` 뒤에는 공백이 온다', () => {
    // 이걸 가르지 않으면 모든 헤딩이 태그로 칠해진다.
    expect(names('## 2장')).toEqual([]);
  });

  it('숫자만으로 된 것은 태그가 아니다 — `#1` 은 대개 이슈 번호다', () => {
    expect(names('이슈 #123 참고')).toEqual([]);
  });

  it('단어 가운데의 `#` 은 태그가 아니다', () => {
    // `C#` 이나 `a#b` 를 태그로 잡으면 코드 이야기가 전부 칠해진다.
    expect(names('C#은 언어다')).toEqual([]);
  });

  it('코드 스팬 안의 `#태그` 는 태그가 아니다 — 원문을 보여 주는 자리다', () => {
    expect(names('`#회의` 라고 쓴다')).toEqual([]);
  });
});

describe('FR-EDITOR-007 AC-12 — 프론트매터의 태그는 본문 데코레이션 대상이 아니다', () => {
  const DOC = ['---', 'tags: [회의, 기획]', '---', '', '본문의 #실제태그'].join('\n');

  it('프론트매터 구간을 알아본다', () => {
    expect(isFrontmatterRange(DOC, 0)).toBe(true);
    expect(isFrontmatterRange(DOC, DOC.indexOf('tags:'))).toBe(true);
    expect(isFrontmatterRange(DOC, DOC.indexOf('본문의'))).toBe(false);
  });

  it('프론트매터 안의 것은 찾지 않고 본문의 것만 찾는다', () => {
    expect(names(DOC)).toEqual(['실제태그']);
  });

  it('프론트매터가 없으면 첫 줄도 본문이다', () => {
    expect(isFrontmatterRange('# 제목\n\n#태그', 0)).toBe(false);
    expect(names('# 제목\n\n#태그')).toEqual(['태그']);
  });

  it('닫히지 않은 `---` 는 프론트매터가 아니다 — 문서 전체가 삼켜지면 안 된다', () => {
    // 구분선 하나만 있는 문서에서 본문 전체가 프론트매터로 읽히면 그
    // 문서의 태그가 전부 사라진다.
    expect(names('---\n\n본문 #태그')).toEqual(['태그']);
  });
});
