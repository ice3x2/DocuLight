import { permits, type PermissionLevel } from './level.js';

/**
 * 권한 판정을 거치는 파일 조작 (`SEC-ACL-012`).
 *
 * **열거가 닫혀 있다.** 조작을 더하면 여기에 이름이 오르고, 이름이 오르면
 * 아래 표가 그 조작의 필요 권한을 반드시 갖게 된다 — 「판정 없이 수행되는
 * 파일 조작 경로를 두지 않는다」를 구조로 지키는 방법이다.
 */
export type NodeOperation =
  | 'create'
  | 'upload'
  | 'rename'
  | 'delete'
  | 'move'
  | 'copy'
  | 'purge';

/**
 * 한 조작이 요구하는 것. 네 축뿐이고 각 축은 레벨 하나 또는 요구 없음이다.
 *
 * 숨은 하위의 **개수·이름·경로를 담지 않는다** (`SEC-ACL-013` AC-4) — 값이
 * 실려 있으면 거부 안내를 만드는 쪽이 언젠가 그것을 찍는다.
 */
export interface OperationRequirement {
  /** 부모 디렉토리에 필요한 레벨. */
  readonly parent: PermissionLevel | null;
  /** 대상 노드에 필요한 레벨. */
  readonly target: PermissionLevel | null;
  /** 목적지 디렉토리에 필요한 레벨. */
  readonly destination: PermissionLevel | null;
  /** 워크스페이스에 필요한 레벨. */
  readonly workspace: PermissionLevel | null;
}

/** 실행자가 실제로 가진 것. 축이 요구 쪽과 같아야 짝이 어긋나지 않는다. */
export interface Held {
  readonly parent: PermissionLevel | null;
  readonly target: PermissionLevel | null;
  readonly destination: PermissionLevel | null;
  readonly workspace: PermissionLevel | null;
}

const NOTHING: OperationRequirement = {
  parent: null,
  target: null,
  destination: null,
  workspace: null,
};

/** 생성이 요구하는 것. 업로드가 같은 값을 쓴다 (`SEC-ACL-012` AC-2). */
const CREATE: OperationRequirement = { ...NOTHING, parent: 'edit' };

const REQUIREMENTS: Readonly<Record<NodeOperation, OperationRequirement>> = {
  // AC-1: 생성은 부모 디렉토리의 편집.
  create: CREATE,
  // AC-2: 업로드도 생성과 **같은 값**이다. 베끼지 않고 가리키는 이유는
  // 두 자리에 적으면 한쪽만 바뀌기 때문이다.
  upload: CREATE,
  // AC-3 · AC-4: 개명과 삭제는 대상의 편집.
  rename: { ...NOTHING, target: 'edit' },
  delete: { ...NOTHING, target: 'edit' },
  // AC-5: 이동은 대상과 목적지 **둘 다**.
  move: { ...NOTHING, target: 'edit', destination: 'edit' },
  // `SEC-ACL-014` AC-3: 복사는 원본의 보기와 대상 디렉토리의 편집.
  // 이동과 달리 원본을 건드리지 않으므로 원본에는 보기면 족하다.
  copy: { ...NOTHING, target: 'view', destination: 'edit' },
  // AC-6: 휴지통 영구 삭제는 워크스페이스 관리.
  purge: { ...NOTHING, workspace: 'admin' },
};

/**
 * 조작이 요구하는 레벨.
 *
 * 숨은 하위가 있는 디렉토리의 이동·삭제는 워크스페이스 관리로 올라간다
 * (`SEC-ACL-013`). 대상·목적지 요구를 **지우지 않고 더한다** — 관리는
 * 그 워크스페이스 안에서 편집을 포함하므로 자동으로 함께 충족된다.
 */
export function requirementFor(
  operation: NodeOperation,
  context: { hasHiddenDescendant?: boolean } = {},
): OperationRequirement {
  const base = REQUIREMENTS[operation];

  const escalates =
    context.hasHiddenDescendant === true && (operation === 'move' || operation === 'delete');

  return escalates ? { ...base, workspace: 'admin' } : base;
}

/** 가진 것이 요구를 전부 채우는가. 한 축이라도 모자라면 거짓이다. */
export function satisfies(requirement: OperationRequirement, held: Held): boolean {
  for (const axis of ['parent', 'target', 'destination', 'workspace'] as const) {
    const required = requirement[axis];
    if (required === null) continue;

    const actual = held[axis];
    if (actual === null || !permits(actual, required)) return false;
  }
  return true;
}
