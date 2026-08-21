/**
 * 메타데이터 저장소의 경계. **도메인이 이 인터페이스를 소유한다** — 바깥이
 * 정의한 타입을 안쪽이 받아쓰면 경계가 사라진다(C-14).
 *
 * 그래서 여기에는 SQLite 도, `better-sqlite3` 도 나타나지 않는다. 상위 계층은
 * 이 포트만 알고, 어댑터를 갈아 끼워도 도메인이 바뀌지 않는다.
 */
export interface MetadataStore {
  /** 결과를 돌려주지 않는 문장. */
  run(sql: string, params?: readonly unknown[]): void;

  /** 행 배열을 돌려주는 질의. */
  all<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T[];

  /** 한 행 또는 없음. */
  get<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): T | undefined;

  /**
   * 하나의 트랜잭션으로 묶는다. `fn` 이 던지면 **어느 것도 반영되지 않는다**
   * — `DR-STORAGE-002` AC-2 가 요구하는 성질이다.
   *
   * 반환값은 `fn` 의 반환값을 그대로 통과시킨다.
   */
  transaction<T>(fn: () => T): T;
}
