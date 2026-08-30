/**
 * 트리 화면이 서버와 나누는 값들과, 컨텍스트 메뉴의 활성 규칙.
 *
 * 규칙을 컴포넌트가 아니라 여기 두는 이유는 그것이 요구사항이기 때문이다 —
 * 아홉 항목의 목록(`FR-SHELL-003` AC-2)과 각 항목의 필요 권한(AC-3·AC-6)이
 * 그것이다. 컴포넌트 안에 흩어 두면 다른 화면이 같은 메뉴를 그릴 때 규칙이
 * 갈린다.
 */

/** 서버의 `PermissionLevel` 과 같은 값. 없으면 `null` 이다. */
export type Level = 'view' | 'edit' | 'admin' | null;

/** 서버의 `Visibility` 중 트리에 그려지는 둘. */
export type Visibility = 'full' | 'pass-through';

export interface TreeNodeView {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  visibility: Visibility;
  /** 이 노드에 대한 요청자의 유효 권한. pass-through 면 `null` 이다. */
  level: Level;
  /** 부모(또는 워크스페이스)에 대한 유효 권한 — 만들기가 이것을 본다. */
  parentLevel: Level;
  /**
   * 새 버전을 올리면 되돌릴 수 없는가 (`FR-SHELL-008` AC-5).
   *
   * **서버가 판정해 보낸다.** 화면이 확장자를 다시 보면 버전 보관 규칙이
   * 바뀔 때 경고만 옛 규칙을 따르고, 어긋난 경고를 한 번 본 사용자는 다음
   * 경고도 믿지 않는다. 디렉토리에는 오지 않는다 — 올릴 수 없는 자리다.
   */
  overwriteIrreversible?: boolean;
  children: TreeNodeView[];
}

export interface WorkspaceTreeView {
  workspace: { id: string; name: string };
  visibility: Visibility;
  roots: TreeNodeView[];
}

/** 한 메뉴 항목이 열리려면 무엇이 필요한가. */
export interface ContextMenuItem {
  id: string;
  label: string;
  /** 파일에만 나타나는가 (`FR-SHELL-003` AC-4 · AC-5). */
  filesOnly?: boolean;
  /** 이 노드에 필요한 레벨. `null` 이면 이 축을 보지 않는다. */
  target?: Exclude<Level, null>;
  /** 부모에 필요한 레벨 — 만들기가 쓴다. */
  parent?: Exclude<Level, null>;
}

const RANK = { view: 1, edit: 2, admin: 3 } as const;

const permits = (held: Level, required: Exclude<Level, null>) =>
  held !== null && RANK[held] >= RANK[required];

/**
 * 컨텍스트 메뉴 아홉 항목 (`FR-SHELL-003` AC-2).
 *
 * 각 항목의 필요 권한은 서버의 조작별 권한 표와 **같은 값**이다
 * (`SEC-ACL-012`). 화면이 다른 값을 쓰면 열려 보이는 항목이 서버에서
 * 거절되거나, 그 반대가 된다 — 둘 다 사용자에게는 고장으로 보인다.
 *
 * `복사` 가 `보기` 인 것이 AC-6 이고, 그 근거는 복사가 원본을 건드리지
 * 않기 때문이다(`SEC-ACL-014` AC-3).
 */
export const CONTEXT_MENU_ITEMS: readonly ContextMenuItem[] = [
  { id: 'new-file', label: '새 문서', parent: 'edit' },
  { id: 'new-directory', label: '새 디렉토리', parent: 'edit' },
  { id: 'rename', label: '이름 변경', target: 'edit' },
  { id: 'move', label: '이동', target: 'edit' },
  { id: 'copy', label: '복사', target: 'view' },
  { id: 'delete', label: '삭제', target: 'edit' },
  { id: 'share', label: '공유', target: 'edit' },
  { id: 'favorite', label: '즐겨찾기', target: 'view' },
  { id: 'new-version', label: '새 버전 올리기', filesOnly: true, target: 'edit' },
];

/**
 * 이 노드에서 **열리는** 항목들.
 *
 * 열리지 않는 항목은 목록에서 빠지는 것이 아니라 **비활성**으로 그려진다
 * (AC-3) — 사라지면 그 조작이 존재하지 않는 것으로 읽혀, 권한을 얻은
 * 뒤에도 찾지 못한다. 이 함수는 「열리는가」만 답하고 그리는 방식은
 * 컴포넌트가 정한다.
 */
export function enabledMenuItems(node: TreeNodeView): ContextMenuItem[] {
  return CONTEXT_MENU_ITEMS.filter((item) => {
    if (item.filesOnly === true && node.kind !== 'file') return false;
    if (item.target !== undefined && !permits(node.level, item.target)) return false;
    // 만들기는 **담을 자리**에 쓰는 조작이라 그 자리의 권한을 본다. 노드
    // 자신의 권한으로 판정하면 서버가 거절할 항목이 열려 보이고, 사용자에게는
    // 고장으로 보인다 — 그리고 서버가 채워 보내는 `parentLevel` 은 아무도
    // 읽지 않는 칸이 된다.
    if (item.parent !== undefined && !permits(node.parentLevel, item.parent)) return false;
    return true;
  });
}

/** 옮기거나 복사할 수 있는 자리 하나. `path` 는 사람이 읽는 조상 사슬이다. */
export interface Destination {
  id: string;
  path: string;
}

/**
 * 옮기거나 복사할 자리들 (`FR-SHELL-015` AC-2 · AC-4).
 *
 * **목적지에는 편집이 필요하다** — 서버의 조작별 권한 표와 같은 값이다
 * (`SEC-ACL-012`). 화면이 넓게 보이면 사용자는 눌러 본 뒤에야 거절을 만나고,
 * 그 거절이 잦으면 메뉴를 믿지 않게 된다.
 *
 * **이동은 같은 워크스페이스 안에서만** 성립한다(`SEC-ACL-014` AC-1) —
 * 경계를 넘는 수요는 복사가 받는다. 원본을 옮기면 목적지의 권한 경계로
 * 끌려가지만 복사는 새 노드를 만들 뿐이라 그 문제가 없다.
 *
 * **자기 자신과 자기 자손은 뺀다.** 그 아래로 가면 부모 사슬에 고리가 생겨
 * 루트에서 도달할 수 없게 되고, 경로를 파생하는 모든 호출이 그 고리를 돈다.
 * 서버도 같은 판정을 하지만(`move-into-descendant`) 고를 수 있게 두면 그
 * 거절을 사용자가 실수로 읽는다.
 *
 * 워크스페이스 자신도 목적지다 — 그 루트로 옮기거나 복사하는 자리이며,
 * 부르는 쪽이 그 id 를 보고 이동이면 `parentId: null` 로, 복사면
 * `{ workspaceId }` 로 옮긴다.
 *
 * **워크스페이스 루트에는 권한 판정을 걸지 못한다.** `WorkspaceTreeView` 가
 * 그 자리의 유효 권한을 담고 있지 않기 때문이다(`visibility` 만 있다). 그래서
 * 편집 권한이 없는 워크스페이스의 루트도 목록에 서고, 골라서 실행하면 서버가
 * 403 으로 거절한다 — fail-closed 이므로 안전하지만 사용자에게는 헛걸음이다.
 * 트리 응답이 워크스페이스의 유효 권한을 함께 실으면 그때 이 자리도 걸러진다.
 */
export function destinationsFor(
  workspaces: readonly WorkspaceTreeView[],
  kind: 'move' | 'copy',
  sourceId: string,
): Destination[] {
  const 원본워크스페이스 = workspaces.find((entry) => 안에있다(entry.roots, sourceId));
  const 자리들: Destination[] = [];

  for (const entry of workspaces) {
    if (kind === 'move' && entry.workspace.id !== 원본워크스페이스?.workspace.id) continue;

    자리들.push({ id: entry.workspace.id, path: entry.workspace.name });
    모은다(entry.roots, entry.workspace.name, sourceId, 자리들);
  }

  return 자리들;
}

/** 이 가지 안에 그 노드가 있는가. */
function 안에있다(nodes: readonly TreeNodeView[], id: string): boolean {
  return nodes.some((node) => node.id === id || 안에있다(node.children, id));
}

/**
 * 디렉토리를 훑어 목적지로 모은다.
 *
 * 원본을 만나면 그 가지 전체를 건너뛴다 — 자손도 함께 빠지므로 고리를 만드는
 * 선택지가 목록에 서지 않는다.
 */
function 모은다(
  nodes: readonly TreeNodeView[],
  조상경로: string,
  sourceId: string,
  모을곳: Destination[],
): void {
  for (const node of nodes) {
    if (node.id === sourceId) continue;
    if (node.kind !== 'directory') continue;

    const 경로 = `${조상경로} / ${node.name}`;
    // 권한이 모자란 디렉토리 **자신**은 목적지가 아니지만, 그 아래에 권한이
    // 있는 자리가 있을 수 있으므로 가지는 계속 훑는다.
    if (node.level === 'edit' || node.level === 'admin') {
      모을곳.push({ id: node.id, path: 경로 });
    }
    모은다(node.children, 경로, sourceId, 모을곳);
  }
}
