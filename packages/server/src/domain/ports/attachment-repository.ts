/** 첨부 한 건 (`DR-ATTACH-002`). 실체는 `.res` 의 파일이고 이것은 소유 관계다. */
export interface AttachmentRecord {
  hash: string;
  /** 이 첨부를 **삽입한 문서**. 참조하는 문서가 아니다 (`SEC-ATTACH-002`). */
  ownerNodeId: string;
  workspaceId: string;
  extension: string;
  size: number;
  createdAt: string;
}

export interface AttachmentRepository {
  add(record: AttachmentRecord): void;
  find(workspaceId: string, hash: string): AttachmentRecord | undefined;
  listOf(ownerNodeId: string): AttachmentRecord[];
  removeAllOf(ownerNodeId: string): void;
  /** 캐시 재구성 — `.res/index.json` 이 정본이므로 통째로 갈아 끼우는 경로가 있다. */
  replaceAllIn(workspaceId: string, records: readonly AttachmentRecord[]): void;
}
