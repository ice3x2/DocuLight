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

  it('프론트매터에 `#` 이 붙은 태그가 있어도 찾지 않는다', () => {
    // `tags: [회의]` 처럼 `#` 이 없는 예시로는 이 조항을 잴 수 없다 —
    // 프론트매터 제외를 통째로 지워도 통과하기 때문이다. `#` 을 실제로
    // 넣어야 두 판정이 갈린다.
    const withHash = ['---', 'tags: #회의', '---', '', '본문의 #실제태그'].join('\n');

    expect(names(withHash)).toEqual(['실제태그']);
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

describe('FR-EDITOR-007 AC-10 — 태그로 잡으면 안 되는 것들', () => {
  it('코드 펜스 안의 `#` 은 태그가 아니다', () => {
    // C 코드를 문서에 넣으면 `#include` 가 전부 칩이 된다 — 코드블록은
    // 원문을 그대로 보여 주는 자리다.
    expect(names('```c\n#include <stdio.h>\n#define N 10\n```')).toEqual([]);
  });

  it('코드 펜스 밖의 태그는 그대로 잡는다 — 펜스가 문서 전체를 삼키면 안 된다', () => {
    expect(names('```c\n#include\n```\n\n본문의 #회의')).toEqual(['회의']);
  });

  it('닫히지 않은 펜스는 그 뒤를 삼키지 않는다', () => {
    // 삼키면 펜스를 잘못 연 문서의 태그가 전부 사라진다.
    expect(names('```\n코드\n\n#회의')).toEqual(['회의']);
  });

  it('물결 펜스도 같다', () => {
    expect(names('~~~\n#해시\n~~~')).toEqual([]);
  });

  it('이스케이프한 `\\#` 은 태그가 아니다', () => {
    // 사용자가 일부러 뺀 것을 다시 잡으면 뺄 방법이 없어진다.
    expect(names('\\#태그가아님')).toEqual([]);
    // 이스케이프하지 않은 같은 글자는 그대로 태그다 — 대조군이 없으면
    // 위 단언이 「아무것도 안 잡는다」로도 통과한다.
    expect(names('#태그가아님')).toEqual(['태그가아님']);
  });

  it('연속한 `#` 은 태그가 아니다', () => {
    expect(names('##겹침')).toEqual([]);
  });

  it('들여쓴 펜스 안도 마찬가지다', () => {
    expect(names('- 목록\n  ```\n  #해시\n  ```')).toEqual([]);
  });
});

describe('FR-EDITOR-007 AC-10 — 검증자 탐침이 짚은 축', () => {
  it('URL 의 fragment 는 태그가 아니다', () => {
    expect(names('see http://x/#y here')).toEqual([]);
    expect(names('see http://x.com#y here')).toEqual([]);
  });

  it('16진수처럼 보이는 것도 태그다 — 옵시디언과 같게 둔다', () => {
    // 검증자가 `color: #fff` 를 오탐으로 짚었지만, 옵시디언은 그것을
    // 태그로 본다. 요구가 옵시디언 동일성을 말하므로 여기서 갈라서면
    // 그 요구를 어긴다 — 그리고 CSS 는 대개 코드블록 안에 있고 그 자리는
    // 이미 원문으로 남는다.
    expect(names('color: #fff;')).toEqual(['fff']);
    expect(names('#abc')).toEqual(['abc']);
  });

  it('닫는 `---` 이 있어도 그 앞이 프론트매터가 아니면 본문이다', () => {
    // `---\nhello #a\n---\nworld #b` 는 첫 줄이 `---` 이므로 프론트매터로
    // 읽히고, 그 안의 `#a` 는 빠진다. 이것이 의도다.
    expect(names('---\nhello #a\n---\nworld #b')).toEqual(['b']);
  });

  it('닫히지 않은 프론트매터는 본문이다', () => {
    expect(names('---\nhello #a')).toEqual(['a']);
  });

  it('`#Title` 은 태그다 — 헤딩은 뒤에 공백이 온다', () => {
    expect(names('#Title')).toEqual(['Title']);
    expect(names('# Title')).toEqual([]);
    expect(names('## Title')).toEqual([]);
  });

  it('`#C 언어` 처럼 한 글자 태그도 잡는다', () => {
    expect(names('#C 언어')).toEqual(['C']);
  });
});
