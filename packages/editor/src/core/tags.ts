/**
 * 본문 태그 (`FR-EDITOR-007` AC-10~12 · 원장 `R151`).
 *
 * 태그가 라이브 프리뷰의 열 번째 대상이라는 것이 `G31` 판정이다. 여기서는
 * **찾는 일만** 한다 — 칠하는 일은 CodeMirror 확장이 하고, 클릭했을 때
 * 무엇이 열리는지는 셸이 정한다. 셋을 한 파일에 두면 찾는 규칙을 확인하려고
 * 에디터를 띄워야 한다.
 */

export interface TagMatch {
  /** `#` 를 뺀 이름. */
  name: string;
  /** `#` 를 포함한 시작 위치. */
  from: number;
  to: number;
}

/**
 * 태그 이름에 쓸 수 있는 글자.
 *
 * 슬래시가 드는 이유는 옵시디언이 `#기획/2026` 같은 계층 태그를 쓰기
 * 때문이다. 공백·구두점은 들지 않는다 — 들면 문장 끝의 마침표까지 이름에
 * 딸려 들어가 같은 태그가 두 개로 갈린다.
 */
const NAME = /[\p{L}\p{N}_\-/]/u;

/** 숫자만으로 된 것은 태그가 아니다 — `#1` 은 대개 이슈 번호다. */
const DIGITS_ONLY = /^\p{N}+$/u;

/**
 * 이 자리가 프론트매터 안인가 (`FR-EDITOR-007` AC-12).
 *
 * 프론트매터는 **첫 줄이 `---` 이고 뒤에 닫는 `---` 이 있을 때만** 성립한다.
 * 닫힘을 요구하지 않으면 구분선 하나짜리 문서에서 본문 전체가 프론트매터로
 * 읽히고, 그 문서의 태그가 전부 사라진다.
 */
export function isFrontmatterRange(text: string, at: number): boolean {
  const end = frontmatterEnd(text);
  return end !== null && at < end;
}

/** 프론트매터가 끝나는 자리. 프론트매터가 없으면 `null`. */
function frontmatterEnd(text: string): number | null {
  if (!text.startsWith('---\n') && text !== '---') return null;

  const closing = text.indexOf('\n---', 3);
  if (closing === -1) return null;

  return closing + '\n---'.length;
}

/** 코드 스팬(백틱) 안인가. 원문을 그대로 보여 주는 자리라 칠하지 않는다. */
function insideCodeSpan(line: string, at: number): boolean {
  let ticks = 0;
  for (let i = 0; i < at; i += 1) if (line[i] === '`') ticks += 1;
  return ticks % 2 === 1;
}

/**
 * 본문의 태그들 (`FR-EDITOR-007` AC-10).
 *
 * 헤딩과 가르는 기준은 **`#` 바로 뒤에 이름 글자가 오는가** 하나다 —
 * 헤딩은 `# ` 처럼 공백이 따라오므로 자동으로 빠진다. 이 하나를 놓치면
 * 문서의 모든 헤딩이 태그로 칠해진다.
 */
export function findTags(text: string): TagMatch[] {
  const skipUntil = frontmatterEnd(text) ?? 0;
  const found: TagMatch[] = [];

  let lineStart = 0;
  for (const line of text.split('\n')) {
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] !== '#') continue;

      const from = lineStart + i;
      if (from < skipUntil) continue;
      // 단어 가운데의 `#` 은 태그가 아니다 — `C#` 을 태그로 잡으면 코드
      // 이야기가 전부 칠해진다.
      if (i > 0 && NAME.test(line[i - 1]!)) continue;
      if (insideCodeSpan(line, i)) continue;

      let end = i + 1;
      while (end < line.length && NAME.test(line[end]!)) end += 1;

      const name = line.slice(i + 1, end);
      if (name === '' || DIGITS_ONLY.test(name)) continue;

      found.push({ name, from, to: lineStart + end });
      i = end - 1;
    }
    lineStart += line.length + 1;
  }

  return found;
}
