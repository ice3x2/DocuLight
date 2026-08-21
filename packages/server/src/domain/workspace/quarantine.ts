/**
 * 중복 사이드카 격리의 어휘 (`DR-WORKSPACE-002` AC-5 · AC-6 · `R40-d`).
 *
 * 응용 계층과 파일시스템 어댑터가 **둘 다** 이 값을 쓴다. 어느 한쪽에 두면
 * 다른 쪽이 그것을 가리키느라 의존 방향이 뒤집히므로 도메인에 둔다.
 */

/**
 * 격리 자리의 디렉토리 이름.
 *
 * **`.archive` 를 재사용하지 않는다** — 그 자리는 아카이브 전용이고,
 * 서빙 제외 규칙(`R55-b`)과의 관계가 아직 정해지지 않았다.
 *
 * `docsRoot` **안**의 점 디렉토리에 두는 이유는 두 가지다.
 * ① 점으로 시작하는 자리는 이미 세 규칙이 함께 막는다 — 트리 목록에서
 *    빠지고(`SEC-STORAGE-004` AC-1), API 직접 접근이 거부되며(AC-2),
 *    재조정이 노드로 등재하지 않는다.
 * ② `docsRoot` 밖에 두면 두 번째 루트가 생겨 백업과 재조정 스캔이 그
 *    자리를 놓친다 — 사람이 나중에 판단해야 하는 사본이 백업에서 빠지는
 *    것은 격리의 목적과 반대다(`DR-WORKSPACE-001` AC-1 이 여러 루트를
 *    금지한 것과 같은 이유다).
 *
 * **원장이 이 자리를 정하지 않았다.** 조항 신설이 필요한지는 사용자 판단이다.
 */
export const QUARANTINE_DIRECTORY = '.quarantine';

/** 격리 사실의 감사 조작명. */
export const QUARANTINE_OPERATION = 'quarantine';

/** 그 사실을 가리키는 대기열 항목의 유형. */
export const DUPLICATE_SIDECAR_FINDING = 'duplicate-workspace-sidecar';
