/** 첨부 한 건 (`DR-ATTACH-002`). 실체는 `.res` 의 파일이고 이것은 소유 관계다. */
export interface AttachmentRecord {
  hash: string;
  /** 이 첨부를 **삽입한 문서**. 참조하는 문서가 아니다 (`SEC-ATTACH-002`). */
  ownerNodeId: string;
  workspaceId: string;
  extension: string;
  size: number;
  createdAt: string;
  /**
   * 올린 사람이 준 이름 (`DR-ATTACH-002` AC-4 · `R149-g`).
   *
   * 디스크 이름은 해시라(`R50`) 이 값을 업로드 시점에 잡지 않으면 **되살릴
   * 수 없다.** 소유 문서마다 다를 수 있다 — 같은 바이트를 두 사람이 각자의
   * 이름으로 올린 경우다.
   */
  originalName: string;
}

export interface AttachmentRepository {
  add(record: AttachmentRecord): void;
  /**
   * 이 해시를 소유한 **모든** 문서의 행.
   *
   * 여럿인 이유는 같은 바이트를 두 문서에 올릴 수 있기 때문이다. 실체는
   * 하나지만 소유는 문서마다다 — 하나로 접으면 마지막 업로더가 앞 문서의
   * 소유를 덮어써서 그 문서에서 첨부가 열리지 않게 된다.
   */
  ownersOf(workspaceId: string, hash: string): AttachmentRecord[];
  listOf(ownerNodeId: string): AttachmentRecord[];
  removeAllOf(ownerNodeId: string): void;
  /** 캐시 재구성 — `.res/index.json` 이 정본이므로 통째로 갈아 끼우는 경로가 있다. */
  replaceAllIn(workspaceId: string, records: readonly AttachmentRecord[]): void;
}
