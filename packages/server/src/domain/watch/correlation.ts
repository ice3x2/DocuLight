import type { NodeId } from '../node/node-id.js';

/**
 * 서버에서 직접 옮긴 파일의 노드 상관 판정 (`REL-STORAGE-002` · `R20-a` ·
 * `R77-a`).
 *
 * 파일 감시가 관측하는 것은 `unlink` 와 `add` 두 사건뿐이고 「같은 파일이
 * 옮겨졌다」는 사실 자체는 관측되지 않는다. 그래서 판정은 언제나 추측이며,
 * 추측이 틀리는 두 방향 중 **ACL 오이식은 권한 상승**이고 이식 실패는 이력
 * 단절이다. 뒤의 것만 사람이 사후에 고칠 수 있으므로 이 판정은 fail-closed
 * 다 — 확신이 서는 쌍만 인정하고 나머지는 전부 거절한다.
 *
 * 순수 함수로 둔다. 파일시스템도 시계도 들이지 않으므로 규칙 자체를 값으로
 * 재고, 감시자를 띄우지 않고도 fail-closed 성질을 확인할 수 있다.
 */

/**
 * 같은 노드로 인정하는 시간 창.
 *
 * 원장은 「짧은 시간 창」이라고만 하고 값을 정하지 않았다. **넓힐수록
 * 오이식 위험이 커지므로** 짧게 잡는다 — 사람이 파일 탐색기에서 끌어다
 * 놓는 이동은 두 사건이 같은 순간에 나고, 이보다 오래 걸리는 것은 이동이
 * 아니라 지우고 나중에 비슷한 것을 만든 것에 가깝다.
 */
export const CORRELATION_WINDOW_MS = 2_000;

/** 파일이 사라진 사건. */
export interface UnlinkEvent {
  readonly path: string;
  /** 그 경로가 갖고 있던 노드. ACL 이 따라갈지 말지의 대상이다. */
  readonly nodeId: NodeId;
  /** 사라지기 직전에 알려져 있던 내용 해시. */
  readonly contentHash: string;
  readonly at: number;
}

/** 파일이 나타난 사건. */
export interface AddEvent {
  readonly path: string;
  readonly contentHash: string;
  readonly at: number;
}

/** 거절 사유. 대기열을 보는 사람이 무엇 때문에 끊겼는지 알아야 한다. */
export const REJECTION = {
  /** 내용이 달라 같은 파일이라 볼 수 없다 (AC-2). */
  contentDiffers: 'content-differs',
  /** 내용은 같으나 너무 멀리 떨어져 일어났다 (AC-3). */
  outsideWindow: 'outside-window',
} as const;

export type Rejection = (typeof REJECTION)[keyof typeof REJECTION];

/** 같은 노드로 인정된 쌍 — ACL 이 새 경로를 따라간다 (AC-1). */
export interface Moved {
  readonly unlink: UnlinkEvent;
  readonly add: AddEvent;
}

/**
 * 짝은 있었으나 인정되지 않은 쌍 (AC-4 · AC-5).
 *
 * 양쪽을 함께 든다 — 대기열이 이 둘을 **한 항목**으로 묶어야 하기 때문이다
 * (`R139-a`). 따로 열면 사람이 그 둘이 관련 있다는 것을 알 방법이 없다.
 */
export interface Rejected {
  readonly unlink: UnlinkEvent;
  readonly add: AddEvent;
  readonly reason: Rejection;
}

export interface CorrelationVerdict {
  readonly moved: readonly Moved[];
  /** 짝이 아예 없던 unlink. tombstone 이 된다. */
  readonly orphaned: readonly UnlinkEvent[];
  /** 짝이 아예 없던 add. 신규 노드가 된다. */
  readonly appeared: readonly AddEvent[];
  readonly rejected: readonly Rejected[];
}

/**
 * 무엇을 **후보**로 볼 것인가 — 해시가 같거나 시간 창 안에 있으면 후보다.
 *
 * 둘 중 하나만으로 후보를 좁히지 않는 이유는 조항이 둘을 **각각** 거절
 * 사유로 들기 때문이다. 시간 창만으로 좁히면 해시 불일치(AC-2)를 판정할
 * 자리가 사라지고, 해시만으로 좁히면 창 이탈(AC-3)을 판정할 자리가 사라진다.
 * 인정은 여전히 둘을 모두 만족해야 한다 — 후보를 넓게 잡는 것과 인정을
 * 넓게 하는 것은 다른 축이고, fail-closed 는 뒤쪽에 걸린다.
 */
export function correlate(
  unlinks: readonly UnlinkEvent[],
  adds: readonly AddEvent[],
): CorrelationVerdict {
  const moved: Moved[] = [];
  const rejected: Rejected[] = [];
  const orphaned: UnlinkEvent[] = [];
  const takenAdds = new Set<AddEvent>();

  for (const unlink of unlinks) {
    const free = adds.filter((add) => !takenAdds.has(add));

    // **인정할 수 있는 쪽을 먼저 본다.** 거절 후보를 먼저 집으면, 인정
    // 가능한 짝이 뒤에 있어도 그 unlink 는 이미 거절로 닫힌다.
    const match = free.find(
      (add) =>
        add.contentHash === unlink.contentHash &&
        Math.abs(add.at - unlink.at) <= CORRELATION_WINDOW_MS,
    );
    if (match !== undefined) {
      takenAdds.add(match);
      moved.push({ unlink, add: match });
      continue;
    }

    const near = free.find(
      (add) =>
        add.contentHash === unlink.contentHash ||
        Math.abs(add.at - unlink.at) <= CORRELATION_WINDOW_MS,
    );
    if (near === undefined) {
      orphaned.push(unlink);
      continue;
    }

    takenAdds.add(near);
    rejected.push({
      unlink,
      add: near,
      reason:
        near.contentHash === unlink.contentHash
          ? REJECTION.outsideWindow
          : REJECTION.contentDiffers,
    });
  }

  return {
    moved,
    orphaned,
    appeared: adds.filter((add) => !takenAdds.has(add)),
    rejected,
  };
}
