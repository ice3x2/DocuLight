/**
 * 감사 기록 대상의 판정 (`OBS-AUDIT-003`).
 *
 * **열거가 아니라 기준이다.** 조작 목록으로 정하면 새 조작을 만들 때마다
 * 그 목록을 갱신해야 하고, 갱신을 빠뜨린 조작은 조용히 기록되지 않는다 —
 * 빠졌다는 사실이 감사 로그에는 드러나지 않으므로 아무도 눈치채지 못한다.
 *
 * 그래서 이 파일에는 **조작 이름이 하나도 없다.** 판정의 입력은 그 조작이
 * 무엇을 하는가이지 그 조작이 무엇으로 불리는가가 아니다 (AC-4·AC-5).
 */

/** 기록을 부르는 세 기준. 하나라도 참이면 기록한다. */
export type Criterion =
  /** ① 노드의 존재·위치·본문이 바뀐다. */
  | 'node-changed'
  /** ② 누가 그 노드에 도달하는가가 바뀐다. */
  | 'reach-changed'
  /** ③ 상방 게이트로 판정을 우회해 접근한다. */
  | 'gate-bypass';

/**
 * 그 조작이 실제로 한 일.
 *
 * 세 축이 서로 독립이다 — 이동은 ①만, 부여는 ②만, 관리자의 숨은 노드
 * 열람은 ③만 걸린다. 논리합으로 판정하므로 축을 합치면 걸리는 자리가 준다.
 */
export interface Effect {
  /** 노드의 존재·위치·본문이 바뀌었는가. */
  readonly changesNode?: boolean;
  /** 그 노드에 누가 도달하는가가 바뀌었는가. */
  readonly changesReach?: boolean;
  /** 상방 게이트로 판정을 우회해 접근했는가. */
  readonly usesUpwardGate?: boolean;
  /**
   * 제품의 **다른 화면**이 이 조작의 행위자와 시각까지 **영구히** 재현하는가
   * (`OBS-AUDIT-004`).
   *
   * 참이면 기준에 걸려도 기록하지 않는다 — 같은 사실이 두 곳에 살면 한쪽만
   * 지워지거나 갱신되어 어느 쪽이 옳은지 판정할 수 없게 된다.
   *
   * **기간 한정 재현은 재현이 아니다** (AC-3). 보존 기간이 있는 재현처는
   * 그 기간이 지나면 사실을 잃으므로 제외 근거가 되지 못한다.
   */
  readonly permanentlyReproduced?: boolean;
}

/**
 * 이 효과가 걸리는 기준들. 하나도 없으면 순수 읽기다 (AC-4).
 *
 * 목록을 돌려주는 이유는 「어느 기준에 걸렸는가」가 판정의 근거로 남아야
 * 하기 때문이다 — 참·거짓만 돌려주면 새 조작을 만든 사람이 자기 조작이
 * 왜 기록되는지(혹은 왜 안 되는지) 알 수 없다.
 */
export function criteriaMet(effect: Effect): Criterion[] {
  return [
    ...(effect.changesNode === true ? (['node-changed'] as const) : []),
    ...(effect.changesReach === true ? (['reach-changed'] as const) : []),
    ...(effect.usesUpwardGate === true ? (['gate-bypass'] as const) : []),
  ];
}

/**
 * 기록해야 하는가.
 *
 * 제외축이 기준보다 **뒤에** 온다 — 앞에 두면 「재현되므로 기준을 보지
 * 않는다」가 되어, 재현처가 사라졌을 때 그 조작이 어느 기준에 걸렸는지
 * 아무도 되짚을 수 없다.
 */
export function shouldRecord(effect: Effect): boolean {
  return criteriaMet(effect).length > 0 && effect.permanentlyReproduced !== true;
}
