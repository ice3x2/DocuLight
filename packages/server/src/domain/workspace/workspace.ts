import { randomBytes } from 'node:crypto';

/**
 * 워크스페이스 — 루트 바로 아래의 한 계층이며 권한 경계를 담는 자리다
 * (`FR-WORKSPACE-001` · `R35`).
 *
 * **명칭은 `워크스페이스` 다.** 옵시디언의 볼트에 해당하는 개념이지만 제품
 * 전반에서 이 이름 하나만 쓴다 — 두 이름이 돌면 화면과 API 가 갈린다.
 */

/**
 * 물리 디렉토리명이 되는 값 (`R40-a`).
 *
 * `R40-a` 가 「해시 ID」라 부르는 것은 **표시 이름과 무관한 고정 길이의
 * 불투명 토큰**을 뜻한다. 표시 이름에서 유도하면 개명이 물리 경로를 바꿔
 * `DR-WORKSPACE-001` AC-4 가 깨지므로, 이름과 아무 관계 없는 값을 뽑는다.
 *
 * 이 값은 경로와 URL 에 그대로 실린다. 순차값이면 훑는 것만으로 워크스페이스
 * 존재를 재는 열거 오라클이 되므로 노드 ID 와 같은 이유로 랜덤이다(`R76-b`).
 */
export type WorkspaceId = string;

export interface Workspace {
  id: WorkspaceId;
  /** 표시 이름. 권위는 DB 다 (`R40-d`). */
  name: string;
}

export function newWorkspaceId(): WorkspaceId {
  return randomBytes(16).toString('hex');
}
