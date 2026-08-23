import { isVersioned } from '../document/version-layout.js';

/**
 * 확인 등급 — **체계는 이 셋 하나뿐이다** (`FR-CONFIRM-001`).
 *
 * `L1` 확인 없이 즉시 실행 + 되돌리기 토스트 · `L2` 확인 다이얼로그 ·
 * `L3` 타이핑 확인. 화면이나 문서에 따라 같은 이름에 다른 절차를 부여하지
 * 않는다 — 두 설계서가 같은 이름에 다른 뜻을 준 적이 있고, 그때 두 문서를
 * 오가며 구현하면 확인 단계가 통째로 사라질 수 있었다.
 */
export type Grade = 'L1' | 'L2' | 'L3';

/**
 * 등급을 배정하는 두 축 (`FR-CONFIRM-002`).
 *
 * **성질로 규정한다.** 「확인이 필요한 조작」으로 정의하면 순환이 되어
 * (AC-5) 새 조작을 만났을 때 어느 등급인지 도출할 수 없다.
 */
export interface Traits {
  /** 되돌릴 수 있는가. 넓히기는 언제나 거짓이다 (`SEC-CONFIRM-002`). */
  readonly reversible: boolean;
  /** 효과가 지금 드러나는가. 잠재·지연이면 거짓이다. */
  readonly immediate: boolean;
  /** 영향이 다건·서브트리·인스턴스 전역인가. */
  readonly broad: boolean;
}

/**
 * 성질에서 등급을 도출한다.
 *
 * **광범위 하나만으로는 `L3` 이 되지 않는다.** 가역이고 즉시한 다건
 * 조작까지 타이핑을 요구하면 사용자가 토큰을 기계적으로 치게 되고, 그
 * 순간 `L3` 이 막으려던 것이 사라진다.
 */
export function derivedGrade({ reversible, immediate, broad }: Traits): Grade {
  const needsDialog = !reversible || !immediate;
  if (!needsDialog) return 'L1';
  return broad ? 'L3' : 'L2';
}

/**
 * 등급이 **직접 지정된** 조작들 (`FR-CONFIRM-006`).
 *
 * 이 표가 열거한 조작의 등급값 정본이다. 열거에 없는 조작은 도출로
 * 떨어지므로, 새 요구가 등급을 직접 지정할 때 여기에 한 줄을 더하는 것이
 * 그 지정을 유효하게 만드는 전부다 (`FR-CONFIRM-003` AC-2).
 *
 * `purge-many` 는 Phase 1 에 도입하지 않는 조작이지만 배정은 여기 둔다 —
 * 도입 시점에 발효하며, 그때 값을 다시 정하지 않게 하려는 것이다.
 */
export const ASSIGNED_GRADES = {
  /** 휴지통으로 옮긴다 — 가역이고 효과가 즉시 드러난다. */
  trash: 'L1',
  'purge-one': 'L2',
  'purge-many': 'L3',
  /** 비활성 계정 부여 — 가역이지만 재활성화 시점에 되살아나는 잠재 효과다. */
  'grant-suspended': 'L2',
  'revoke-default-group': 'L3',
  'delete-group': 'L3',
  /** 비가역 — 되살릴 수 없고 재발급뿐이다. */
  'revoke-pat': 'L2',
  'revoke-node-entry': 'L1',
  'remove-group-member': 'L1',
  'reject-signup': 'L1',
} as const satisfies Record<string, Grade>;

export type Operation = keyof typeof ASSIGNED_GRADES;

/**
 * 그 조작의 등급. **직접 지정이 도출을 이긴다** (`FR-CONFIRM-003` AC-1).
 *
 * 열거에 없으면 성질로 도출한다 — 그래서 사례의 개수를 근거로 다른
 * 요구의 직접 지정을 거부할 자리가 없다 (AC-3).
 */
export function gradeFor(operation: Operation, traits?: Traits): Grade {
  const assigned = ASSIGNED_GRADES[operation] as Grade | undefined;
  if (assigned !== undefined) return assigned;
  if (traits === undefined) {
    throw new Error(`배정도 성질도 없는 조작: ${operation}`);
  }
  return derivedGrade(traits);
}

/**
 * 넓히기의 등급 (`FR-CONFIRM-011`).
 *
 * 가역성 축의 값이 **언제나 비가역**이다 (`SEC-CONFIRM-002`) — 권한 항목을
 * 지워도 이미 열람된 내용은 회수할 수 없다. 그래서 최저가 `L1` 이 되는
 * 것은 주체가 명시적 단건이고 대상이 문서일 때뿐이다.
 *
 * **`L3` 을 배정하지 않는다** (AC-6). 부여는 아무것도 지우지 않으므로
 * 광범위 축이 서지 않고, 타이핑을 요구하면 흔한 조작에 마찰만 는다.
 */
export function wideningGrade(input: {
  /** 주체를 지목했는가. 복사·상속 되돌리기·부모 권한 가져오기는 언제나 `set` 이다 (AC-4). */
  readonly subject: 'single' | 'set';
  readonly target: 'file' | 'container';
}): Grade {
  return input.subject === 'single' && input.target === 'file' ? 'L1' : 'L2';
}

/**
 * 보존 기간 축소의 등급 (`FR-CONFIRM-007`).
 *
 * **토큰이 영향 건수 그 자체다.** 임의 문구를 치게 하면 그 수를 읽지 않고
 * 칠 수 있는데, 이 조작에서 사용자가 확인해야 하는 것이 정확히 그 수다.
 */
export function retentionGrade(affected: number): { grade: Grade; token: string | null } {
  return affected > 0 ? { grade: 'L3', token: String(affected) } : { grade: 'L2', token: null };
}

/**
 * 새 버전 올리기의 등급 (`FR-CONFIRM-010`).
 *
 * 마크다운은 이전 본문이 버전으로 남아 되찾을 수 있어 가역이다. 그 판정을
 * 여기서 새로 만들지 않고 보관 규칙과 **같은 함수**를 쓴다 — 두 곳이
 * 판정하면 보관 규칙이 바뀔 때 확인만 옛 규칙을 따른다.
 */
export function newVersionGrade(fileName: string): Grade {
  return isVersioned(fileName) ? 'L1' : 'L2';
}
