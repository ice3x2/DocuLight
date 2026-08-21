import type { Workspace, WorkspaceId } from '../workspace/workspace.js';

/**
 * 워크스페이스의 파일시스템 쪽 경계. 도메인이 소유한다.
 *
 * 응용 계층이 `docsRoot` 나 경로 조립을 알지 않게 하는 자리다 — 알면
 * 경로 규칙이 응용 계층에도 흩어져 `DR-WORKSPACE-001` 의 단일 루트가
 * 두 곳에서 정해진다.
 */

/**
 * 발견한 사이드카 하나.
 *
 * `directory` 를 함께 싣는 이유는 **디렉토리명이 곧 ID** 라는 것이 물리
 * 레이아웃의 불변식이기 때문이다(`R40-a`). 어긋난 것을 그대로 복원하면
 * DB 에는 있는데 그 경로에는 아무것도 없는 워크스페이스가 생긴다.
 */
export interface FoundSidecar {
  /** `docsRoot` 바로 아래의 디렉토리 이름. */
  directory: string;
  workspace: Workspace;
}

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
  readAllSidecars(): Promise<FoundSidecar[]>;

  /**
   * 디렉토리를 격리 자리로 옮긴다 (`DR-WORKSPACE-002` AC-5).
   *
   * **지우지 않는다** — 사본과 원본을 자동으로 판별할 수 없으므로 사람이
   * 판단할 때까지 둘 다 남긴다.
   *
   * @returns 옮겨 간 자리의 절대 경로.
   */
  quarantine(directory: string): Promise<string>;
}
