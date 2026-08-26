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
  /**
   * 서버에서 직접 옮겨진 파일을 같은 노드로 인정해 경로를 따라가게 했다
   * (`REL-STORAGE-002` AC-1).
   *
   * `node.move` 와 갈라 둔다 — 그쪽은 사람이 UI 로 옮긴 것이고 이쪽은
   * 관측된 두 사건에서 **추측한** 것이다. 한 이름으로 뭉치면 나중에
   * 오이식을 조사할 때 어느 쪽이 추측이었는지 가릴 수 없다.
   */
  relocate: 'reconcile.relocate',
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
  /**
   * 사라진 파일과 나타난 파일이 짝으로 보였으나 같은 노드로 인정하지
   * 못했다 (`REL-STORAGE-002` AC-5).
   *
   * 위 둘과 나눠 두는 이유는 사람이 할 일이 다르기 때문이다 — 미등록
   * 파일은 그대로 두면 되고 없는 파일은 복구하면 되지만, 이것은 **두
   * 사실을 이을지 말지**를 사람이 판정해야 한다(`R77-a` 수동 연결).
   * 한 항목이 감사 행 둘을 참조하는 유일한 유형이다(`R139-a`).
   */
  correlationRejected: 'correlation-rejected',
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
