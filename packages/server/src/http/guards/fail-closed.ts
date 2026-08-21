import { hasDotSegment } from '../../domain/naming/hidden-name-rule.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import { ARCHIVE_DIRECTORY } from '../../domain/workspace/archive.js';

/**
 * fail-closed 서빙 가드 (`SEC-STORAGE-006` · `R55-b`).
 *
 * 권한 판정은 전부 DB 의 노드 레코드 위에서 이뤄진다. 레코드가 없는 경로를
 * 만나면 **판정할 근거가 없고**, 그 상태를 「무제한 허용」으로 읽을 여지를
 * 여기서 닫는다.
 *
 * **레코드 부재를 허용으로 해석하는 분기를 만들지 않는다** (`AC-2`) —
 * 이 함수는 통과 조건을 모두 만족했을 때만 노드를 돌려주고, 그 밖의
 * 모든 경우에 `undefined` 를 돌려준다.
 */
export function resolveServableNode(
  nodes: NodeRepository,
  workspaceId: string,
  relativePath: string,
): NodeRecord | undefined {
  // ① 아카이브는 서빙 루트에서 빠진다 (`AC-4`). 레코드 조회보다 **앞에**
  //    둔다 — 뒤에 두면 아카이브 안의 노드가 등재되는 순간 서빙된다.
  const segments = relativePath.split('/').filter((segment) => segment !== '');
  if (segments.includes(ARCHIVE_DIRECTORY)) {
    return undefined;
  }

  // ② 점으로 시작하는 자리는 직접 접근이 거부된다 (`SEC-STORAGE-004`).
  if (relativePath === '' || hasDotSegment(relativePath)) {
    return undefined;
  }

  // ③ 레코드가 있어야 한다. 경로로 조회하는 메서드를 두지 않았으므로
  //    (`DR-STORAGE-003` — 경로는 파생일 뿐이다) 워크스페이스의 노드에서
  //    파생 경로가 일치하는 것을 찾는다.
  const wanted = segments.join('/');
  const node = nodes
    .allIn(workspaceId)
    .find((candidate) => candidate.kind === 'file' && nodes.pathOf(candidate.id) === wanted);

  if (node === undefined) {
    return undefined;
  }

  // ④ tombstone 은 레코드가 남아 있을 뿐 대응 파일이 없다. 열면 사라진
  //    파일을 읽으려다 터진다 (`REL-STORAGE-001` AC-2).
  return node.orphanedAt === null ? node : undefined;
}
