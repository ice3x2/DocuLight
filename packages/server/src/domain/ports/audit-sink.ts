/**
 * 감사 기록의 경계. 도메인이 소유한다.
 *
 * **행위자 예약값** — 사람이 아닌 주체는 하위체계별 예약 주체 행을 쓴다
 * (`R139-b`). 재조정은 `system:reconciler` 다. 하위체계를 `operation` 값에
 * 밀어 넣으면 그 값의 distinct 집합이 하위체계 × 조작의 곱집합으로 부풀어
 * 필터가 못 쓰게 된다.
 */
export const SYSTEM_RECONCILER = 'system:reconciler' as const;

export interface AuditEntry {
  operation: string;
  actor: string;
  /** 대상 노드. 워크스페이스 단위 사건에는 없다. */
  nodeId?: string;
  /**
   * 대상 워크스페이스. 노드 칸과 나눠 두는 이유는 한 칸이 두 사실을 담으면
   * 읽는 쪽이 어느 쪽인지 판정할 수 없기 때문이다.
   */
  workspaceId?: string;

  /**
   * 이 사건이 **누구에게** 일어났는가 — 부여·회수의 상대 (`SEC-ACL-010` AC-3).
   *
   * `actor` 와 나눠 둔다. 부여는 두 주체가 걸린 사건이고, 한 칸으로 합치면
   * 「누가 줬나」와 「누가 받았나」가 구별되지 않는다.
   */
  subjectId?: string;

  /** 무엇을 줬는가. 한 조작이 만든 여러 부여를 가르는 축이다. */
  level?: string;
}

export interface AuditSink {
  /**
   * 감사 행을 추가하고 그 id 를 돌려준다.
   *
   * **수정·삭제 메서드를 두지 않는다** — 행의 불변성(`R84-a`)을 스키마가 아니라
   * 접근 경로가 지킨다. 해소는 기존 행을 고치는 것이 아니라 **새 행을 더하는**
   * 방식으로만 이뤄진다(`R139-c`).
   */
  append(entry: AuditEntry): string;
}
