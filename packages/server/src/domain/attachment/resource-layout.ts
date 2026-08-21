import { createHash } from 'node:crypto';

/**
 * 첨부 저장 자리 (`DR-ATTACH-001`).
 *
 * **워크스페이스 루트 아래 한 곳이다.** 소유 문서와 같은 디렉토리에 두면
 * 문서를 옮길 때 첨부도 따라 움직여야 하고, 그러면 본문에 적힌 링크가
 * 전부 낡는다 — 낡은 사실은 문서를 열 때까지 드러나지 않는다.
 */
export const RESOURCE_DIRECTORY = '.res';

/** 해시 → 소유 문서 매핑 사이드카 (`REL-ATTACH-001`). */
export const RESOURCE_INDEX = 'index.json';

/** 앞 2글자를 서브디렉토리로 쓰는 이유 — 한 디렉토리에 수만 개가 쌓이면 그 자체로 느려진다. */
const FANOUT = 2;

/** 내용 해시. 같은 내용은 같은 자리를 쓴다 — 그것이 「해시가 이름」의 뜻이다. */
export function resourceHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `.res/a3/f9c2….png`. 원본 파일명은 남기지 않는다 — 목록만으로 내용이 짐작된다. */
export function resourcePathOf(workspaceRoot: string, hash: string, extension: string): string {
  const suffix = extension === '' ? '' : `.${extension}`;
  // POSIX 구분자로 만든다 — 이 값이 본문 링크의 뼈대이기도 해서, 플랫폼별
  // 구분자가 섞이면 같은 첨부가 두 링크로 적힌다.
  return `${workspaceRoot}/${RESOURCE_DIRECTORY}/${hash.slice(0, FANOUT)}/${hash}${suffix}`;
}

/** 본문에 삽입할 링크 — **워크스페이스 기준 절대경로** (`DR-ATTACH-003`). */
export function resourceLinkOf(hash: string, extension: string): string {
  const suffix = extension === '' ? '' : `.${extension}`;
  // 상대경로면 문서를 옮기는 순간 본문의 링크가 전부 낡는다.
  return `/${RESOURCE_DIRECTORY}/${hash.slice(0, FANOUT)}/${hash}${suffix}`;
}

/** 파일명에서 확장자만. 없으면 빈 문자열. */
export function extensionOf(fileName: string): string {
  const at = fileName.lastIndexOf('.');
  return at <= 0 ? '' : fileName.slice(at + 1).toLowerCase();
}
