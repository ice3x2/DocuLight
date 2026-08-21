/**
 * 문서 이동 이력 (`FR-SHELL-006` AC-4).
 *
 * 브라우저의 뒤로·앞으로가 이 값을 따라 움직인다. 값으로 두는 이유는
 * 이력의 규칙 — 특히 **갈라졌을 때 앞쪽을 자른다** — 이 요구이기 때문이며,
 * `window.history` 뒤에 있으면 그 규칙을 확인하려고 브라우저를 띄워야 한다.
 */
export interface History {
  entries: readonly string[];
  /** 지금 서 있는 자리. */
  at: number;
}

/**
 * 새 문서로 간다.
 *
 * 되돌아간 자리에서 새로 가면 **앞쪽 이력을 자른다** — 자르지 않으면
 * 「앞으로」가 사용자가 가지 않은 갈래로 데려간다.
 */
export function visit(history: History, url: string): History {
  const kept = history.entries.slice(0, history.at + 1);
  return { entries: [...kept, url], at: kept.length };
}

/** 뒤로. 처음이면 그대로. */
export function back(history: History): History {
  return history.at === 0 ? history : { ...history, at: history.at - 1 };
}

/** 앞으로. 끝이면 그대로. */
export function forward(history: History): History {
  return history.at >= history.entries.length - 1 ? history : { ...history, at: history.at + 1 };
}
