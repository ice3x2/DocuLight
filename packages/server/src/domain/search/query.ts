/**
 * 검색 질의의 문법 (`FR-SHELL-014` · 원장 `R149-b`·`R149-c`·`R149-f`).
 *
 * **저장 기술을 모른다.** 여기서 나오는 것은 묶음의 구조일 뿐이고 그것을
 * 어느 엔진의 질의로 옮길지는 바깥이 정한다 — 엔진이 아직 미결이기도 하고,
 * 정해진 뒤에도 문법의 정본이 엔진 문법에 끌려가면 안 된다.
 */

/** 최소 질의 길이 (`R149-c`). 주체 검색의 같은 값과 **다른 조항**이다. */
const MIN_TERM = 2;

/** 파이프가 묶음을 가른다. 앞뒤 공백은 뜻을 바꾸지 않는다 (`R149-f`). */
const GROUP_SEPARATOR = '|';

export type QueryRule = 'empty' | 'too-short';

export type ParsedQuery =
  /** 묶음들의 OR. 각 묶음은 항들의 AND 다 (`R149-f`). */
  | { ok: true; groups: readonly (readonly string[])[] }
  | { ok: false; rule: QueryRule };

/**
 * 질의를 묶음 구조로 읽는다.
 *
 * **AND 가 파이프보다 강하게 묶는다** (`R149-f`) — `가 나 | 다` 는
 * `(가 AND 나) OR 다` 다. 그래서 파이프로 먼저 가르고 각 조각을 공백으로
 * 가른다. 순서를 뒤집으면 결합이 반대가 된다.
 *
 * 예외가 아니라 값으로 답한다 — 너무 짧은 질의는 예외 상황이 아니라
 * **사용자가 아직 다 치지 않은 상태**이고, 그 갈래를 부르는 쪽이 화면
 * 문구로 옮긴다.
 */
export function parseQuery(text: string): ParsedQuery {
  const groups = text
    .split(GROUP_SEPARATOR)
    .map((chunk) => chunk.split(/\s+/u).filter((term) => term !== ''))
    // 빈 묶음을 남기지 않는다. 남기면 그것이 「아무거나」로 읽혀 질의
    // 하나가 코퍼스 전체가 된다.
    .filter((terms) => terms.length > 0);

  if (groups.length === 0) return { ok: false, rule: 'empty' };

  // **묶음마다 독립으로** 판정한다 (`R149-f`). 전체를 한 번에 보면
  // `회의 규정 | 일` 의 뒤 묶음이 앞 묶음에 묻어 통과하고, 그 순간
  // `R149-c` 가 막으려던 무제약 1자 가지가 열린다.
  if (!groups.every(covered)) return { ok: false, rule: 'too-short' };

  return { ok: true, groups };
}

/** 이 묶음에 2자 이상인 항이 하나라도 있는가 (`R149-f`). */
const covered = (terms: readonly string[]): boolean =>
  terms.some((term) => [...term].length >= MIN_TERM);
