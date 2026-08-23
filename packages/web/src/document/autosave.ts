/**
 * 자동 저장의 **상태 전이** (`FR-STORAGE-001`).
 *
 * 값으로 두는 이유는 이 전이들이 전부 요구이기 때문이다 — 특히 「충돌하면
 * 멈추고, 머지로 1회 해소하면 재개하며, 그 사이 입력은 버려지지 않는다」가
 * 그렇다. 타이머와 네트워크 뒤에 있으면 그것을 확인하려고 시계를 흉내
 * 내야 하고, 흉내 낸 시계는 진짜 규칙을 재지 못한다.
 *
 * **본문 문자열은 여기 들어 있지 않다** — `body` 는 저장 요청을 만들 때
 * CodeMirror 에서 꺼내 온 값을 잠시 담는 칸이고, 정본은 언제나 에디터다
 * (`CON-ARCH-006`).
 */

/**
 * 입력이 멈춘 뒤 이만큼 지나면 저장한다.
 *
 * 원장 `R75` 가 **~2초를 제품 상수로** 정했고 `R152` 가 그것을 개인 설정
 * 항목으로 열지 않기로 했다 — 열면 저장 볼륨과 `R75-a` 스냅샷 입도가
 * 개인 설정 하나에 종속된다. 이 값을 줄이면 「입력이 멈추면」이 사실상
 * 「타건마다」가 되어 세션당 1회 규칙이 막으려던 볼륨이 돌아온다.
 */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

export type AutosaveStatus =
  | 'idle'
  /** 고쳤고 아직 안 보냈다. */
  | 'dirty'
  /** 충돌로 멈췄다 — 머지로 1회 해소해야 풀린다 (AC-5 · AC-6). */
  | 'conflict'
  /** 서버가 거절했다 — 권한을 잃었거나 대상이 사라졌다. */
  | 'rejected';

export interface AutosaveState {
  status: AutosaveStatus;
  /** 마지막으로 꺼내 온 본문. 저장 요청이 실어 보낸다. */
  body: string;
  /** 저장 요청에 실을 기준 해시 (`FR-STORAGE-002` AC-1). */
  baseHash: string;
  /** 마지막 편집으로부터 흐른 시간을 재는 기준. 편집이 없으면 `null`. */
  dirtySince: number | null;
  /** 충돌 시 서버가 함께 준 현재 본문 — 머지 뷰가 이것 없이는 열리지 않는다. */
  serverBody: string | null;
}

export interface SaveIntent {
  save: boolean;
  body: string;
  /** Ctrl+S 로 왔는가 (`FR-STORAGE-001` AC-4). */
  forceSnapshot: boolean;
}

const NO_SAVE = (state: AutosaveState): SaveIntent => ({
  save: false,
  body: state.body,
  forceSnapshot: false,
});

export function initialAutosave(baseHash: string, body = ''): AutosaveState {
  return { status: 'idle', body, baseHash, dirtySince: 0, serverBody: null };
}

/**
 * 사용자가 고쳤다.
 *
 * **멈춘 상태에서도 본문을 받는다**(AC-7) — 받지 않으면 충돌 배너가 떠
 * 있는 동안 친 글자가 버려지고, 사용자는 그것을 되찾을 방법이 없다.
 * 상태는 그대로 두어 저장이 재개되지 않게 한다.
 */
export function edited(state: AutosaveState, body: string, at = 0): AutosaveState {
  const stuck = state.status === 'conflict' || state.status === 'rejected';
  return { ...state, body, dirtySince: at, status: stuck ? state.status : 'dirty' };
}

/** 디바운스가 지났으면 저장 요청을 만든다 (`FR-STORAGE-001` AC-1). */
export function idleAutosave(state: AutosaveState, elapsedMs: number): SaveIntent {
  // 멈춘 상태에서 계속 내보내면 서버가 매번 거절하고, 그 사이 사용자는
  // 자기 편집이 저장되고 있다고 믿는다.
  if (state.status !== 'dirty') return NO_SAVE(state);
  if (elapsedMs < AUTOSAVE_DEBOUNCE_MS) return NO_SAVE(state);

  return { save: true, body: state.body, forceSnapshot: false };
}

/**
 * Ctrl+S (`FR-STORAGE-001` AC-3 · AC-4).
 *
 * 디바운스를 건너뛰고 **스냅샷을 강제한다** — 세션당 1회 규칙과 별개로
 * 사용자가 「여기를 기억해 둬」라고 말한 지점이기 때문이다.
 */
export function forceSave(state: AutosaveState): SaveIntent {
  if (state.status === 'conflict' || state.status === 'rejected') return NO_SAVE(state);
  return { save: true, body: state.body, forceSnapshot: true };
}

/** 저장이 됐다. 다음 저장의 기준 해시를 갱신한다 — 안 하면 다음 저장이 거짓 충돌이 된다. */
export function saveSucceeded(state: AutosaveState, hash: string): AutosaveState {
  return { ...state, status: 'idle', baseHash: hash, dirtySince: null, serverBody: null };
}

/** 충돌 (`FR-STORAGE-001` AC-5). 서버의 현재 본문을 함께 쥔다. */
export function conflictDetected(state: AutosaveState, serverBody: string): AutosaveState {
  return { ...state, status: 'conflict', serverBody };
}

/** 서버가 거절했다. 충돌과 마찬가지로 멈추고 입력은 남긴다. */
export function saveRejected(state: AutosaveState): AutosaveState {
  return { ...state, status: 'rejected' };
}

/**
 * 머지 뷰에서 **1회** 해소했다 (`FR-STORAGE-001` AC-6).
 *
 * 합친 본문과 그 시점의 해시를 함께 받는다 — 해시 없이 재개하면 첫 저장이
 * 곧바로 다시 충돌하고, 사용자에게는 머지가 아무것도 하지 않은 것으로 보인다.
 *
 * 이전 상태에서 **아무것도 가져오지 않는다.** 남은 편집·서버 본문·더티
 * 표식이 하나라도 넘어오면 재개 직후에 그것이 다시 발화한다. 그래도
 * 인자로 받는 것은 이것이 전이라는 사실을 호출부에서 읽히게 하기 위해서다.
 */
export function resolvedOnce(
  _state: AutosaveState,
  merged: { body: string; hash: string },
): AutosaveState {
  return {
    status: 'idle',
    body: merged.body,
    baseHash: merged.hash,
    dirtySince: null,
    serverBody: null,
  };
}
