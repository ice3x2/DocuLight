import type { LegacyContentImporter } from '../../domain/ports/legacy-content.js';
import type { WorkspaceId } from '../../domain/workspace/workspace.js';
import { reconcile, type ReconciliationStores } from '../reconciliation/reconcile.js';
import { indexNode } from '../search/index-node.js';
import type { SemanticStores } from '../search/semantic-search.js';

export type ContentMigrationStores = ReconciliationStores &
  SemanticStores & { legacy: LegacyContentImporter };

export interface ContentMigrated {
  /** 워크스페이스 디렉토리에 놓인 파일 수. */
  copied: number;
  /** 이 이행이 새로 세운 노드 수. */
  created: number;
  /** 벡터 인덱스를 다시 세운 문서 수. */
  indexed: number;
}

/**
 * 색인 대상 확장자.
 *
 * 마크다운만 색인한다 — `indexNode` 는 본문을 utf8 로 읽으므로 이미지를
 * 넘기면 깨진 문자열이 조각으로 들어가고, 그 조각이 검색 결과의 발췌로
 * 나온다. 복사는 전부 하되(AC-4) 색인은 읽을 수 있는 것만 하는 것이
 * 두 조항이 함께 성립하는 방식이다.
 */
const INDEXABLE = /\.md$/i;

/**
 * 1.0 콘텐츠를 기본 워크스페이스로 옮기고 벡터 인덱스를 다시 세운다
 * (`MIG-AUTH-001` AC-3 · AC-4 · AC-5).
 *
 * **일회성 도구다** (AC-3). 제품 조립에 상시로 걸지 않으므로 이 함수를 부르는
 * 자리는 이행 진입점 `src/migrate.ts` 하나뿐이며, 그 도달은 조립 방벽의
 * 별도 항이 잰다.
 *
 * 노드를 여기서 세우지 않는다. 파일에서 노드 트리를 파생하는 일은 재조정이
 * 이미 소유하고(`REL-STORAGE-001`) 중간 디렉토리까지 세운다 — 다시 구현하면
 * 같은 책임을 두 곳이 나눠 갖게 되어 한쪽만 고쳐진다.
 *
 * 벡터 인덱스는 **옮기지 않는다** (AC-5). 1.0 은 HNSWLib 파일로 자기 인덱스를
 * 갖지만 2.0 의 임베딩이 신규 작성물이라(`R21-a`) 그 벡터는 이 공간의 값이
 * 아니다 — 옮기면 좌표계가 다른 수를 같은 축에서 재게 된다. 그래서 이 함수는
 * 1.0 의 인덱스 자리를 인자로 **받지도 않는다**.
 */
export async function migrateContent(
  stores: ContentMigrationStores,
  input: { legacyDocsRoot: string; workspaceId: WorkspaceId },
): Promise<ContentMigrated> {
  const copied = await stores.legacy.importInto(input.workspaceId, input.legacyDocsRoot);

  const { created } = await reconcile(stores);

  let indexed = 0;
  for (const nodeId of created) {
    if (!INDEXABLE.test(stores.nodes.pathOf(nodeId))) continue;
    await indexNode(stores, nodeId);
    indexed += 1;
  }

  return { copied, created: created.length, indexed };
}
