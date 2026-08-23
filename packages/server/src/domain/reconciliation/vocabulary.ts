/**
 * 재조정이 남기는 **말**의 정의 지점 (`R139` 계열 · `CON-ARCH-008`).
 *
 * 감사 조작명과 대기열 유형명은 저장소·화면·운영 문서가 함께 읽는 값이다.
 * 인라인 문자열로 두면 정의 지점이 0곳이 되고, 같은 개념이 코드·테스트·
 * 런북 여러 자리에 리터럴로 흩어져 한 곳만 고쳐진다.
 *
 * 전체 감사 스키마와 조작명 체계는 `R84` 계열이 소유한다 — 여기 있는 것은
 * **재조정이 실제로 쓰는 것**뿐이고, 그 wave 가 서면 이 목록이 그쪽 열거에
 * 흡수될 자리다.
 */

/** 재조정이 감사 로그에 남기는 조작. */
export const RECONCILE_OPERATION = {
  /**
   * 미등록 파일을 노드로 세웠다.
   *
   * 값이 사람이 만든 노드의 조작명과 **같다** (`DR-AUDIT-001` AC-8) —
   * 갈리면 「생성」 필터가 둘 중 하나만 잡고, 어느 쪽을 놓쳤는지는 필터를
   * 두 번 걸어 본 사람만 안다. 하위체계 구분은 행위자 칸이 든다(AC-7).
   */
  create: 'node.create',
  /** 대응 파일이 사라져 tombstone 으로 표시했다. */
  orphan: 'orphan',
  /** 사라졌던 파일이 돌아와 tombstone 을 풀었다. */
  restore: 'restore',
  /** 자기 자리에 있지 않은 워크스페이스 디렉토리를 격리했다. */
  quarantine: 'quarantine',
} as const;

export type ReconcileOperation = (typeof RECONCILE_OPERATION)[keyof typeof RECONCILE_OPERATION];

/**
 * 재조정 대기열 항목의 유형.
 *
 * 유형이 갈려 있어야 대기열을 보는 사람이 무엇이 일어났는지 구별한다 —
 * 하나로 뭉치면 목록이 「무언가 어긋났다」의 나열이 된다.
 */
export const FINDING_TYPE = {
  /** 디스크에만 있던 파일을 등재했다. */
  unregisteredFile: 'unregistered-file',
  /** 노드는 있는데 대응 파일이 없다. */
  missingFile: 'missing-file',
  /** 같은 `id` 를 가진 사이드카가 둘 이상이라 나중 것을 격리했다. */
  duplicateWorkspaceSidecar: 'duplicate-workspace-sidecar',
} as const;

export type FindingType = (typeof FINDING_TYPE)[keyof typeof FINDING_TYPE];

/**
 * 대기열 항목을 **해소하는** 행위가 감사 로그에 남기는 조작
 * (`REL-AUDIT-002`).
 *
 * 위 `RECONCILE_OPERATION` 과 나눠 둔다 — 그쪽은 재조정이 관측한 **사실**
 * 이고 이쪽은 사람이 그 사실에 대해 **한 일**이다. 한 열거에 섞으면
 * 행위자가 언제나 `system:reconciler` 라는 성질이 그 열거에서 사라진다.
 */
export const RESOLUTION_OPERATION = {
  /** 사람이 두 사실을 손으로 이었다 (`R77-a` 수동 연결). */
  manualLink: 'reconcile.manual-link',
} as const;

export type ResolutionOperation =
  (typeof RESOLUTION_OPERATION)[keyof typeof RESOLUTION_OPERATION];
