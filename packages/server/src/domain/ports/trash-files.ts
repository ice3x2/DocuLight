import type { TrashEntry } from '../trash/trash-entry.js';

/**
 * 휴지통의 파일시스템 경계. 도메인이 소유한다.
 *
 * 여기가 **정본**이다 (`DR-STORAGE-004`) — DB 인덱스는 이 사이드카들의
 * 캐시이고, 둘이 어긋나면 여기서 읽은 값이 이긴다.
 */
export interface TrashFiles {
  /**
   * 원본 자리에서 휴지통으로 옮기고 사이드카를 함께 쓴다.
   *
   * 두 일을 한 메서드로 묶은 이유는 그 둘이 함께 일어나야 하기 때문이다 —
   * 파일만 옮기고 사이드카가 없으면 그 항목은 어디서 왔는지 모르는 채
   * 휴지통에 남고, 사이드카만 있으면 실체 없는 행이 목록에 뜬다.
   */
  moveIn(entry: TrashEntry, originalName: string): Promise<void>;

  /** 휴지통에서 원본 루트의 지정 경로로 되돌린다. 사이드카는 함께 지운다. */
  moveOut(entry: TrashEntry, originalName: string, restoreTo: string): Promise<void>;

  /** 실체와 사이드카를 함께 지운다 (`SEC-STORAGE-003` AC-4). */
  purge(entry: TrashEntry): Promise<void>;

  /** 사이드카를 전부 읽는다 — 인덱스 재구성의 입력이다 (`DR-STORAGE-004` AC-2). */
  readSidecars(workspaceId: string): Promise<TrashEntry[]>;
}
