import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { WorkspaceId } from '../../domain/workspace/workspace.js';

/**
 * 워크스페이스의 물리 자리 (`DR-WORKSPACE-001` · `R40`).
 *
 * **경로를 계산하는 자리는 저장소에 여기 하나다.** 두 곳이 각자 계산하면
 * 한쪽만 바뀌었을 때 쓰는 자리와 읽는 자리가 조용히 갈린다.
 */

/**
 * `docsRoot/<워크스페이스 ID>` 절대 경로.
 *
 * **워크스페이스별 경로를 받는 인자가 없다.** 받으면 백업과 재조정 스캔의
 * 대상이 여러 루트로 흩어져 두 조작 모두 루트 목록에 종속된다.
 *
 * 경로가 ID 로만 정해지므로 표시 이름을 바꿔도 여기 결과가 바뀌지 않는다
 * (`AC-4`) — 첨부 URL 과 백업 경로가 개명에 살아남는 이유다(`AC-5`).
 */
export function workspaceDirectory(docsRoot: string, id: WorkspaceId): string {
  return resolve(join(docsRoot, id));
}

/** 디렉토리를 만들고 그 절대 경로를 돌려준다. 이미 있으면 그대로 둔다. */
export async function createWorkspaceDirectory(
  docsRoot: string,
  id: WorkspaceId,
): Promise<string> {
  const at = workspaceDirectory(docsRoot, id);
  await mkdir(at, { recursive: true });
  return at;
}
