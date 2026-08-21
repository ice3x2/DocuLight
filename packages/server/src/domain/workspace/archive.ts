/**
 * 아카이브 디렉토리 (`R55` · `R55-a` · `R55-b`).
 *
 * 아카이브 **조작 자체**는 Phase 2 다. wave-1 이 지금 정하는 것은 그
 * 디렉토리가 **서빙 루트에서 빠진다**는 사실 하나뿐이며(`SEC-STORAGE-006`
 * AC-4), 그 규칙은 조작이 서기 전까지 적용 대상이 없어 무발화일 뿐
 * 미뤄진 것이 아니다.
 */
export const ARCHIVE_DIRECTORY = '.archive';

/**
 * 아카이브 루트 (`DR-STORAGE-006` AC-3).
 *
 * **docsRoot 아래 한 곳이다.** 워크스페이스마다 두면 아카이브한
 * 워크스페이스가 자기 자신 안에 들어가야 하고, 그 자리는 워크스페이스를
 * 지우면 함께 사라진다.
 */
export function archiveRootOf(docsRoot: string): string {
  return `${docsRoot}/${ARCHIVE_DIRECTORY}`;
}

/**
 * 아카이브된 워크스페이스가 놓이는 자리 (`DR-STORAGE-006` AC-4).
 *
 * 이름이 아니라 **ID** 로 놓는다 — 개명이 자리를 옮기면 아카이브 이전에
 * 적힌 어떤 참조도 그 자리를 못 찾는다.
 */
export function archivePathOf(docsRoot: string, workspaceId: string): string {
  return `${archiveRootOf(docsRoot)}/${workspaceId}`;
}
