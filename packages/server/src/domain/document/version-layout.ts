import { basename, dirname, join } from 'node:path';

/**
 * 버전 보관 디렉토리 (`FR-STORAGE-003` AC-4).
 *
 * 워크스페이스 루트 아래 한 곳이고 이름이 점으로 시작한다 — 그래야
 * 서빙에서 빠지고(`SEC-STORAGE-006`), 사용자의 트리에 보이지 않는다.
 */
export const VERSION_DIRECTORY = '.versions';

/** 버전 관리 대상인가 (`FR-STORAGE-003` AC-5). md 문서만이다. */
export function isVersioned(name: string): boolean {
  // 바이너리를 버전으로 쌓으면 보관 디렉토리가 그 파일 크기만큼 곱해지고,
  // 그 비용은 되돌릴 일이 거의 없는 파일에 든다.
  return name.toLowerCase().endsWith('.md');
}

/** 이 문서의 버전들이 사는 자리. 경로가 아니라 **노드 ID** 로 가른다. */
export function versionDirectoryOf(workspaceRoot: string, nodeId: string): string {
  // 경로로 가르면 문서를 옮기는 순간 그 문서의 버전이 사라진 것처럼 된다.
  return join(workspaceRoot, VERSION_DIRECTORY, nodeId);
}

/** 순번 하나의 실체 파일. */
export function versionPathOf(workspaceRoot: string, nodeId: string, seq: number): string {
  return join(versionDirectoryOf(workspaceRoot, nodeId), `${seq}.md`);
}

/**
 * 그 실체 옆에 놓이는 사이드카 (`DR-STORAGE-005`).
 *
 * 실체와 **같은 디렉토리에 이름만 다르게** 둔다 — 따로 두면 하나가
 * 지워질 때 다른 하나가 남아 인덱스를 되세울 때 유령이 섞인다.
 */
export function versionSidecarName(versionPath: string): string {
  return join(dirname(versionPath), `${basename(versionPath)}.json`);
}
