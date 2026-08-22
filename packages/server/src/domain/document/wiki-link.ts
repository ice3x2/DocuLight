/**
 * 본문이 가리키는 문서들 (`CON-EDITOR-002` AC-1 · AC-3).
 *
 * **파싱의 주인은 여기 하나다.** 화면도 같은 일을 하면 백링크와 아웃고잉이
 * 서로 다른 규칙으로 세어지는데, 그 어긋남은 두 목록을 나란히 놓고 보기
 * 전까지 드러나지 않는다.
 *
 * 순수 함수다 — 저장소도 시계도 보지 않는다. 그래서 이 규칙을 재는 시험이
 * 파일시스템을 세우지 않아도 된다.
 */

/** 코드블록과 인라인 코드. 그 안은 원문이지 문법이 아니다. */
const VERBATIM = /```[\s\S]*?```|`[^`\n]*`/g;

/** `[[대상]]` 또는 `[[대상|보이는 글자]]`. 줄을 넘지 않는다. */
const LINK = /\[\[([^[\]|\n]*)(?:\|[^[\]\n]*)?\]\]/g;

/**
 * 본문이 가리키는 문서 이름들. **중복은 한 번만**, 나온 순서대로.
 *
 * 이름을 돌려주고 노드를 찾지 않는 이유는 이것이 도메인이기 때문이다 —
 * 저장소를 알면 이 규칙을 재는 데 저장소가 필요해진다.
 */
export function findWikiLinks(text: string): string[] {
  // 코드 자리를 같은 길이의 공백으로 덮는다. 지우면 뒤 오프셋이 밀리고,
  // 남겨 두면 예시로 적은 문법이 링크로 잡힌다.
  const masked = text.replace(VERBATIM, (found) => ' '.repeat(found.length));

  const names: string[] = [];
  for (const [, target] of masked.matchAll(LINK)) {
    const name = target!.trim();
    // 빈 이름은 가리키는 것이 없다 — 목록에 넣으면 아무 문서도 아닌 줄이 선다.
    if (name !== '' && !names.includes(name)) names.push(name);
  }
  return names;
}
