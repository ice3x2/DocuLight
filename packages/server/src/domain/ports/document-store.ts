/**
 * 문서 본문 저장소의 경계 (`DR-STORAGE-001` · 원장 `R4`).
 *
 * **본문의 SSOT 는 파일시스템이다.** 이 포트 뒤에 무엇이 있든 도메인은
 * 「워크스페이스 안의 상대 경로에 마크다운 원문을 읽고 쓴다」만 안다.
 *
 * 메타데이터는 여기 오지 않는다 — 그쪽은 `MetadataStore` 다(`R20`).
 * 두 축을 한 포트에 담으면 `R4` 와 `R20` 이 같은 자리를 두고 다툰다.
 */
export interface DocumentStore {
  /**
   * 마크다운 원문을 **변형 없이** 쓴다. 정규화·개행 변환·트리밍을 하지 않는다
   * — 옵시디언 볼트를 그대로 넣는 것이 요구이므로(`R4`) 바이트가 바뀌면 안 된다.
   */
  write(workspaceId: string, relativePath: string, body: string): Promise<void>;

  /** 파일의 바이트를 그대로 돌려준다. */
  read(workspaceId: string, relativePath: string): Promise<string>;

  /** 파일이 있는가. 존재 판정을 예외로 하지 않기 위해 별도로 둔다. */
  exists(workspaceId: string, relativePath: string): Promise<boolean>;

  /**
   * 워크스페이스 안의 모든 파일을 워크스페이스 루트 기준 상대 경로로
   * 돌려준다. 재조정이 DB 와 맞대는 쪽이다 (`REL-STORAGE-001`).
   *
   * 디렉토리는 돌려주지 않는다 — 노드 트리의 디렉토리는 파일 경로에서
   * 파생되므로, 둘 다 돌려주면 같은 사실을 두 번 세게 된다.
   */
  list(workspaceId: string): Promise<string[]>;
}
