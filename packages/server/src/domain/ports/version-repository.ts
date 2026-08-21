/** 버전 인덱스 한 행. 실체는 파일이고 이것은 그 캐시다 (`DR-STORAGE-005`). */
export interface VersionRecord {
  nodeId: string;
  seq: number;
  createdAt: string;
  /** 이 버전을 만든 주체 (`G28` 판정 · `DR-STORAGE-005` AC-5). */
  author: string;
}

/** 편집 세션 하나 (`FR-STORAGE-003` AC-1 · AC-2). */
export interface EditSessionRecord {
  id: string;
  nodeId: string;
  actorId: string;
  startedAt: string;
  /** 이 세션이 이미 찍은 스냅샷의 순번. 아직 안 찍었으면 `null`. */
  snapshotSeq: number | null;
}

export interface VersionRepository {
  add(record: VersionRecord): void;
  listOf(nodeId: string): VersionRecord[];
  remove(nodeId: string, seq: number): void;
  /** 다음 순번. 폐기된 것을 다시 쓰지 않으므로 최대값 + 1 이다. */
  nextSeq(nodeId: string): number;
  /** 캐시 재구성 — 사이드카가 정본이므로 통째로 갈아 끼우는 경로가 있다. */
  replaceAllOf(nodeId: string, records: readonly VersionRecord[]): void;

  openSession(record: EditSessionRecord): void;
  findSession(id: string): EditSessionRecord | undefined;
  markSnapshot(id: string, seq: number): void;
}
