import type { Workspace } from '../../domain/workspace/workspace.js';
import type { WorkspaceStores } from './restore-from-sidecar.js';

/**
 * 워크스페이스를 만든다 (`FR-WORKSPACE-001` · `DR-WORKSPACE-002` AC-1).
 *
 * **부모를 받지 않는다.** 워크스페이스의 부모는 언제나 루트다 — 인자가
 * 없으면 어떤 호출자도 중첩을 만들 수 없다(`FR-WORKSPACE-001` AC-2).
 *
 * 레코드·디렉토리·사이드카 셋을 여기서 함께 만든다. 나누면 레코드만 있고
 * 사이드카가 없는 워크스페이스가 생기고, 그것은 DB 가 손상되는 순간
 * 복원할 수 없는 해시 폴더가 된다.
 *
 * 노드 이름 검증 규칙을 여기 걸지 않는다. 물리 디렉토리명이 해시라
 * 예약어·금지 문자·경로 길이가 이 계층에는 닿지 않기 때문이다(`R40-a`).
 * 그 방어선이 필요한 곳은 실명을 그대로 쓰는 문서·디렉토리 계층이다.
 */
export async function createWorkspace(
  { workspaces, files }: WorkspaceStores,
  name: string,
): Promise<Workspace> {
  const workspace = workspaces.create(name);
  await files.createDirectory(workspace.id);
  await files.writeSidecar(workspace);
  return workspace;
}
