/**
 * 예약 네임스페이스를 지키는 규칙 (`SEC-STORAGE-005` · `R64-b`).
 *
 * 점으로 시작하는 이름은 `.workspace.json`·`.trash` 처럼 제품이 자기 것으로
 * 쓰는 자리다. 읽기 쪽 숨김만 걸고 쓰기를 열어 두면 사용자가 그 자리에
 * 데이터를 만들어 두 체계가 같은 이름을 다투게 된다.
 *
 * **권한이 아니라 이름 규칙이다** — 관리자에게도 같은 거부가 걸린다.
 * 그래서 이 함수는 요청자를 인자로 받지 않는다. 받지 않으면 어떤 권한
 * 레벨도 결과를 바꿀 수 없다.
 */
export const HIDDEN_NAME_PREFIX = '.';

export function isHiddenName(name: string): boolean {
  return name.startsWith(HIDDEN_NAME_PREFIX);
}


/**
 * 경로에 점으로 시작하는 **세그먼트**가 있는가.
 *
 * 역슬래시도 구분자로 본다. 슬래시만 보면 Windows 에서 온
 * `기획\.trash\x.md` 가 세그먼트 하나로 읽혀 그대로 통과한다.
 *
 * API 거부(`SEC-STORAGE-004`)와 재조정 등재 제외가 같은 판정을 쓴다 —
 * 갈리면 거부되는 경로가 노드로는 등재되는 상태가 생긴다.
 */
export function hasDotSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some(isHiddenName);
}
