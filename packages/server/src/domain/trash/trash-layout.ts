/**
 * 휴지통 디렉토리 이름 (`DR-STORAGE-006` AC-1).
 *
 * 워크스페이스 디렉토리 **안**에 둔다 — 그래야 워크스페이스를 통째로
 * 옮기면 그 휴지통도 함께 따라간다(AC-5). 루트 한 곳에 모으면 워크스페이스
 * 이동이 두 곳을 함께 옮기는 일이 되고, 한쪽만 옮겨지면 삭제 항목이
 * 주인 없이 남는다.
 *
 * 점으로 시작하므로 예약 네임스페이스 규칙(`SEC-STORAGE-005`)이 이 이름의
 * 노드 생성을 이미 막는다 — 사용자가 같은 이름을 쓸 자리가 없다.
 */
export const TRASH_DIRECTORY = '.trash';

/** 사이드카 파일 이름. 원본 이름과 겹치지 않도록 점으로 시작한다. */
export const TRASH_SIDECAR = '.trash.json';

/**
 * 휴지통 안에서의 상대 경로 — `.trash/<노드ID>/<원본이름>`
 * (`FR-STORAGE-005` AC-1 · AC-2).
 *
 * 노드 ID 로 한 겹 감싸는 것이 AC-4 의 전부다: 이름이 같은 둘을 차례로
 * 지워도 서로 다른 디렉토리에 들어가므로 덮어쓸 수 없다. 이름 뒤에
 * 접미사를 붙이는 방식이었다면 그 접미사가 복구 때 원본 이름을 흐린다.
 */
export function trashPathOf(nodeId: string, originalName: string): string {
  return `${TRASH_DIRECTORY}/${nodeId}/${originalName}`;
}

export function trashDirectoryOf(nodeId: string): string {
  return `${TRASH_DIRECTORY}/${nodeId}`;
}
