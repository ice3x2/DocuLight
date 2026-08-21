import type { Workspace, WorkspaceId } from '../workspace/workspace.js';

/**
 * 워크스페이스의 파일시스템 쪽 경계. 도메인이 소유한다.
 *
 * 응용 계층이 `docsRoot` 나 경로 조립을 알지 않게 하는 자리다 — 알면
 * 경로 규칙이 응용 계층에도 흩어져 `DR-WORKSPACE-001` 의 단일 루트가
 * 두 곳에서 정해진다.
 */
export interface WorkspaceFiles {
  /** 워크스페이스 디렉토리를 만든다. 이미 있으면 그대로 둔다. */
  createDirectory(id: WorkspaceId): Promise<void>;

  /** 사이드카를 **DB 값으로** 쓴다 (`R40-d` — 권위는 DB). */
  writeSidecar(workspace: Workspace): Promise<void>;

  /**
   * `docsRoot` 하위에서 발견한 사이드카 전부.
   *
   * 사이드카가 없는 디렉토리는 돌려주지 않는다 — 이름만 보고 등재하면
   * 사용자가 `docsRoot` 에 둔 아무 디렉토리나 워크스페이스가 된다.
   */
  readAllSidecars(): Promise<Workspace[]>;
}
