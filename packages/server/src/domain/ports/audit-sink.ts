/**
 * 감사 기록의 경계. 도메인이 소유한다.
 *
 * **행위자 예약값의 정의는 여기 없다** (`DR-AUDIT-001` AC-6). 판정이 단일
 * 지점에 있어야 하므로 `system-principals.ts` 가 소유하고 이 파일은 그것을
 * 다시 내보내기만 한다 — 두 곳에 적으면 주체가 하나 늘 때 한쪽만 는다.
 */
export { SYSTEM_RECONCILER, SYSTEM_RETENTION } from '../principal/system-principals.js';

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

  /**
   * 그 필드가 바뀌기 **전** 값 (`DR-AUDIT-002`). 없던 것이 생기면 빈다.
   *
   * **이 사건의 주체**를 여기 넣지 않는다 — 그 축은 `subjectId` 가 갖는다.
   * 한 칸이 그 축을 나눠 가지면 「주체로 필터」가 조작별 파싱이 된다.
   *
   * ACL 회수 행이 여기에 **부여자**를 담는 것은 그 규칙과 어긋나지 않는다
   * (`OBS-AUDIT-008` AC-3 · 원장 `R164-d`) — 부여자는 이 사건의 주체가
   * 아니라 사라지는 항목이 갖고 있던 값이고, 그것이 이 칸의 뜻이다.
   */
  beforeValue?: string;

  /** 바뀐 **뒤** 값. 사라지는 조작이면 빈다. */
  afterValue?: string;

  /**
   * 2-노드 조작의 상대편 (`DR-AUDIT-003`). **복사 하나뿐이다.**
   *
   * 이동·삭제·휴지통 복구는 노드 ID 를 보존하므로 1-노드 조작이고, 위치
   * 변화는 이전값·이후값이 담는다. 목적지 부모는 노드 수 판정에 세지 않는다.
   */
  counterpartNodeId?: string;

  /**
   * **이 행의 대상**이 원본인지 사본인지 (`DR-AUDIT-002` AC-4).
   *
   * 상대편의 역할이 아니다. 상대 노드가 비면 함께 빈다 (AC-5).
   */
  targetRole?: 'origin' | 'copy';

  /**
   * 이 행이 **어느 조작에서 나왔는가** (`IR-AUDIT-003` AC-8 · AC-9).
   *
   * 뷰어가 낱행을 한 줄로 접는 경계이며, 그래서 시각에서 파생하지 않는다 —
   * 파생하면 같은 순간의 서로 다른 두 조작이 한 줄로 접힌다.
   *
   * **비워 두는 것이 안전한 기본값이다.** 비우면 저장 시점에 그 행만의 값이
   * 붙어 낱행 하나짜리 묶음이 된다. 여러 행을 남기는 조작만
   * `newCorrelation()` 으로 값을 하나 얻어 그 행들에 함께 싣는다 — 빠뜨리면
   * 덜 접힐 뿐이고, 서로 다른 조작이 잘못 합쳐지지는 않는다.
   *
   * **조회 응답에 실리지 않는다** (같은 요구 AC-5·AC-6) — 그래서
   * `DR-AUDIT-002` AC-7 의 의미 칸 열하나에도 세지 않는다.
   */
  correlationId?: string;
}

/**
 * 기록된 감사 행 하나.
 *
 * `AuditEntry` 와 나눠 두는 이유는 **읽는 쪽이 더 많이 알기 때문**이다 —
 * id 와 시각은 저장소가 붙이고, 쓰는 쪽은 그것을 정하지 않는다.
 */
export interface AuditRow extends AuditEntry {
  readonly id: string;
  readonly occurredAt: string;
}

/**
 * 감사 로그를 읽는 경계 (`IR-AUDIT-001` · `SEC-AUDIT-010`).
 *
 * 쓰기 경계와 나눠 둔다 — 합치면 「추가만 있다」는 성질이 인터페이스에서
 * 드러나지 않고, 읽기를 붙이려다 수정 메서드가 함께 들어오기 쉽다.
 */
export interface AuditQuery {
  /**
   * 워크스페이스 스코프의 행들. `null` 은 **인스턴스 스코프**다 — 어느
   * 워크스페이스에도 귀속되지 않는 행이며 슈퍼유저만 읽는다
   * (`SEC-AUDIT-010` AC-3~AC-5).
   */
  inScope(
    workspaceIds: readonly string[],
    options?: {
      includeInstance?: boolean;
      /**
       * 그 조작의 행만 (`IR-AUDIT-001`). 없으면 전부다.
       *
       * 거르는 자리를 **여기 하나**로 둔다 — 받아 놓고 화면에서 거르면
       * 거르기 전의 행이 이미 브라우저에 와 있게 되고, 그것은 스코프
       * 판정이 아니다.
       */
      operation?: string;
    },
  ): AuditRow[];

  /**
   * 실제로 기록된 조작 값의 distinct 집합 (`IR-AUDIT-001`).
   *
   * 고정 목록을 두지 않는다 — 새 조작이 처음 기록되면 별도 배포 없이
   * 필터에 나타나야 하고, 고정 목록은 그때마다 갱신을 요구한다.
   */
  operationsInScope(workspaceIds: readonly string[], options?: { includeInstance?: boolean }): string[];

  /**
   * 그 ID 들의 행. 재조정 대기열이 스코프를 파생할 때 쓴다
   * (`SEC-AUDIT-007` AC-1).
   *
   * 스코프 필터를 걸지 않는다 — 파생의 입력이지 열람이 아니고, 여기서
   * 거르면 경계를 넘는 항목이 스코프를 잃어 판정 자체가 불가능해진다.
   */
  byIds(ids: readonly string[]): AuditRow[];
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

  /**
   * 한 조작이 여러 행을 남길 때 그 행들을 잇는 새 값 (`IR-AUDIT-003` AC-9).
   *
   * 부르는 쪽이 값을 지어내지 않게 여기 둔다 — 지어내면 형식이 자리마다
   * 갈리고, 갈린 값 중 하나가 우연히 겹치면 서로 다른 조작이 합쳐진다.
   */
  newCorrelation(): string;
}
