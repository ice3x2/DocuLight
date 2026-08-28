import type { WorkspaceId } from '../workspace/workspace.js';

/**
 * 1.0 이 남긴 콘텐츠를 워크스페이스 안으로 들이는 경계. 도메인이 소유한다.
 *
 * **기존 포트로는 안 된다.** `DocumentStore` 는 본문을 `string` 으로만
 * 다루므로(`write(id, path, body: string)`) 이미지·PDF 를 통과시키면 바이트가
 * 인코딩을 거치며 깨진다 — `MIG-AUTH-001` AC-4 가 요구하는 것이 바로 비-md
 * 파일의 보존이다. `WorkspaceFiles` 는 디렉토리와 사이드카의 축이라 외부
 * 콘텐츠 반입이 그 책임이 아니다.
 *
 * 경로 조립이 이 뒤에 있는 것이 핵심이다. 응용 계층이
 * `docsRoot/<워크스페이스 ID>` 를 직접 만들면 그 규칙이 두 곳에서 정해진다
 * (`DR-WORKSPACE-001`).
 */
export interface LegacyContentImporter {
  /**
   * `sourceDirectory` 아래 전부를 워크스페이스 디렉토리로 복사한다.
   *
   * 마크다운만 고르지 않는다 (`MIG-AUTH-001` AC-4). 옵시디언 볼트는 첨부와
   * 본문이 상대 경로로 엮여 있어, 비-md 를 빼면 남은 문서의 링크가 통째로
   * 끊긴다.
   *
   * @returns 복사한 파일 수.
   */
  importInto(workspaceId: WorkspaceId, sourceDirectory: string): Promise<number>;
}
