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
