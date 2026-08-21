/**
 * 재조정 대기열의 경계 (`REL-AUDIT-001` · `R139` 계열).
 *
 * **이름** — `재조정 대기열` 이다(`R139-g`). 한정어 없는 `감사 목록` 을
 * 지시어로 쓰지 않는다 — 그 이름은 `상속 끊김 노드 감사 목록`(`R43-3`)·
 * `감사 로그`(`R84`)와 충돌한다.
 */

/** 항목이 갖는 것은 셋뿐이다 — 유형 · 참조 · 해소. */
export interface Finding {
  id: string;
  type: string;
  /** 비어 있음이 곧 미해소다. 별도 상태 칸은 없다. */
  resolutionAuditId: string | null;
}

export interface OpenFinding {
  type: string;
  /**
   * 참조 감사 행. **1건 이상이어야 한다** — 시각·대상 노드·행위자의 유일한
   * 출처이므로 비우면 그 셋이 사라진다(`R139`).
   */
  auditRefs: readonly string[];
}

export interface FindingQueue {
  /** 항목을 연다. `auditRefs` 가 비면 거부한다. */
  open(finding: OpenFinding): string;

  /** 해소 감사 행을 붙인다. 기존 감사 행은 고치지 않는다(`R139-c`). */
  resolve(findingId: string, resolutionAuditId: string): void;

  /** 해소 감사 행이 비어 있는 항목들. */
  unresolved(): Finding[];

  /** 그 항목이 가리키는 감사 행들을 순서대로. */
  auditRefsOf(findingId: string): string[];
}
