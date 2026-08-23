/**
 * 본문이 다는 태그들 (`FR-SHELL-009`).
 *
 * **파싱의 주인은 여기 하나다** — `wiki-link.ts` 와 같은 이유다. 화면도
 * 같은 일을 하면 태그 탭의 수치와 검색 결과가 서로 다른 규칙으로 세어지고,
 * 그 어긋남은 두 목록을 나란히 놓고 보기 전까지 드러나지 않는다.
 *
 * 순수 함수다 — 저장소도 시계도 보지 않는다.
 */

/** 코드블록과 인라인 코드. 그 안은 원문이지 문법이 아니다. */
const VERBATIM = /```[\s\S]*?```|`[^`\n]*`/g;

/**
 * `#이름`.
 *
 * 앞이 줄머리이거나 공백이어야 한다 — 낱말 가운데의 `#` 을 잡으면 색상
 * 코드(`fff#000`)와 URL 조각(`url#anchor`)이 태그가 된다.
 *
 * 이름은 **숫자만으로 이뤄질 수 없다.** `#1` 을 태그로 잡으면 각주·번호
 * 표기와 갈리지 않는다. 슬래시는 이름의 일부다 — 중첩 태그가 그 형태다.
 */
const TAG = /(^|\s)#(?![0-9]+(?:\s|$))([\p{L}\p{N}_/-]*[\p{L}_-][\p{L}\p{N}_/-]*)/gu;

/**
 * 본문이 단 태그 이름들. **중복은 한 번만**, 나온 순서대로.
 *
 * 중복을 접는 것이 `FR-SHELL-009` AC-5 의 내용이다 — 한 문서에 같은 태그가
 * 여러 번 나와도 그 문서는 수치에 1 이다.
 */
export function findTags(text: string): string[] {
  // 코드 자리를 같은 길이의 공백으로 덮는다. 지우면 뒤 오프셋이 밀리고,
  // 남겨 두면 예시로 적은 문법이 태그로 잡힌다.
  const masked = text.replace(VERBATIM, (found) => ' '.repeat(found.length));

  const names: string[] = [];
  for (const [, , name] of masked.matchAll(TAG)) {
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}
