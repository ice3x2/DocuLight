import type { Workspace, WorkspaceId } from '../workspace/workspace.js';

/**
 * 워크스페이스 저장소의 경계. 도메인이 소유한다.
 *
 * **부모를 받는 자리가 없다.** 워크스페이스의 부모는 언제나 루트이고
 * 중첩은 불가능하다(`FR-WORKSPACE-001` AC-2) — 인자를 두지 않는 것이
 * 그 규칙을 구조로 못박는 방법이다.
 */
export interface WorkspaceRepository {
  /** 새 워크스페이스를 만들고 그 레코드를 돌려준다. */
  create(name: string): Workspace;

  /**
   * 사이드카에서 읽은 워크스페이스를 **있던 그대로** 되살린다
   * (`DR-WORKSPACE-002` AC-4).
   *
   * `create` 와 나눈 이유는 이쪽이 ID 와 생성 시각을 발급하지 않고
   * 받아쓰기 때문이다. 한 메서드로 합치면 새로 만드는 호출자가 실수로
   * ID 를 지어 넣을 자리가 생긴다.
   */
  restore(workspace: Workspace): void;

  /** 없으면 `undefined`. */
  findById(id: WorkspaceId): Workspace | undefined;

  /** 표시 이름만 바꾼다 — 물리 경로는 ID 로 정해지므로 그대로다 (`R40-a`). */
  rename(id: WorkspaceId, name: string): void;

  list(): Workspace[];
}
