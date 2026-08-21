import type { TrashEntry } from '../trash/trash-entry.js';

/**
 * 휴지통 인덱스의 경계. 도메인이 소유한다.
 *
 * **이것은 캐시다** (`DR-STORAGE-004`). 정본은 파일시스템의 사이드카이며,
 * 이 저장소는 목록을 빠르게 훑기 위한 사본일 뿐이다. 그래서 `replaceAll`
 * 이 있다 — 사이드카에서 통째로 되세우는 것이 정상 경로다.
 */
export interface TrashRepository {
  add(entry: TrashEntry): void;

  find(nodeId: string): TrashEntry | undefined;

  listIn(workspaceId: string): TrashEntry[];

  /** 전 워크스페이스의 항목. 보존 기간 청소가 훑는 쪽이다. */
  listAll(): TrashEntry[];

  remove(nodeId: string): void;

  /**
   * 한 워크스페이스의 인덱스를 사이드카에서 읽은 것으로 **통째로** 바꾼다.
   *
   * 부분 갱신을 두지 않는 이유는 이것이 캐시 재구성이기 때문이다 — 남은
   * 행을 골라 지우는 방식이면 사이드카에 없는 행이 조용히 살아남는다.
   */
  replaceAll(workspaceId: string, entries: readonly TrashEntry[]): void;
}
