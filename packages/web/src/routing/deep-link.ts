/**
 * 문서 딥링크 (`FR-SHELL-006`).
 *
 * URL 에 **노드 ID 만** 담는다. 경로나 이름을 담으면 개명·이동이 기존
 * 링크를 끊는데(AC-3), 링크는 대개 다른 문서 안에 적혀 있어서 끊긴 사실이
 * 한참 뒤에야 드러난다.
 *
 * 권한 없는 노드의 404 통일은 `SEC-ACL-006` 이 소유한다 — 여기서 다시
 * 판정하지 않는다.
 */
const PREFIX = '/d/';

/** 그 문서의 주소. */
export function urlForNode(nodeId: string): string {
  // ID 는 서버가 발급하지만 그대로 이어붙이면 언젠가 한 문서 링크가 다른
  // 경로로 읽힌다 — 인코딩은 신뢰가 아니라 형태의 문제다.
  return PREFIX + encodeURIComponent(nodeId);
}

/** 그 주소가 가리키는 문서. 문서 주소가 아니면 `null`. */
export function nodeIdOf(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;

  const raw = pathname.slice(PREFIX.length);
  if (raw === '') return null;

  return decodeURIComponent(raw);
}
