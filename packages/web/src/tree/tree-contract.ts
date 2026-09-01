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
  /**
   * 부모(또는 워크스페이스)에 대한 유효 권한 — **파일에서 고른** 만들기가
   * 이것을 본다. 디렉토리에서 고른 만들기는 그 디렉토리 안에 담기므로
   * `level` 을 본다(`담길자리의권한`).
   */
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
  /**
   * 새 노드가 **담길 자리**에 필요한 레벨 — 만들기가 쓴다.
   *
   * 그 자리는 노드 종류에 따라 갈린다: 디렉토리에서 고르면 그 디렉토리
   * 자신이고, 파일에서 고르면 그 파일이 담긴 자리다. `containerFor` 가
   * 고르는 자리와 같으며, 서버도 같은 자리를 본다.
   */
  container?: Exclude<Level, null>;
}

const RANK = { view: 1, edit: 2, admin: 3 } as const;

const permits = (held: Level, required: Exclude<Level, null>) =>
  held !== null && RANK[held] >= RANK[required];

/**
 * 이 노드에서 고른 만들기가 담길 자리의 권한.
 *
 * **디렉토리는 자기 안이고 파일은 자기가 담긴 자리다.** 이 한 문장이
 * `containerFor` 가 자리의 **id** 를 고르는 규칙과 같아야 한다 — 두 곳이
 * 갈리면 활성 판정과 실제 결과가 다른 자리를 가리키고, 열려 보이던 항목이
 * 서버에서 거절된다.
 */
const 담길자리의권한 = (node: TreeNodeView): Level =>
  node.kind === 'directory' ? node.level : node.parentLevel;

/**
 * 즐겨찾기 항목의 두 문면 (`FR-SHELL-003` AC-7).
 *
 * **같은 자리에서 라벨만 갈린다.** 항목을 하나 더 두면 메뉴가 노드마다
 * 다른 모양이 되어 사용자가 자리를 외우지 못하고, 두 항목이 동시에 서면
 * 어느 쪽이 지금 상태인지 화면이 답하지 못한다.
 */
export const FAVORITE_LABELS = { add: '즐겨찾기에 추가', remove: '즐겨찾기 해제' } as const;

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
  { id: 'new-file', label: '새 문서', container: 'edit' },
  { id: 'new-directory', label: '새 디렉토리', container: 'edit' },
  { id: 'rename', label: '이름 변경', target: 'edit' },
  { id: 'move', label: '이동', target: 'edit' },
  { id: 'copy', label: '복사', target: 'view' },
  { id: 'delete', label: '삭제', target: 'edit' },
  { id: 'share', label: '공유', target: 'edit' },
  { id: 'favorite', label: FAVORITE_LABELS.add, target: 'view' },
  { id: 'new-version', label: '새 버전 올리기', filesOnly: true, target: 'edit' },
];

/**
 * 만들기 자리의 문구와 기본 이름 (`FR-SHELL-016` AC-3 · AC-7).
 *
 * 기본 이름은 **서버가 받아 주는 값**이다 — 금지 문자도 예약 장치명도 아니고,
 * 겹치면 서버가 접미사를 붙여 준다. 화면이 그 규칙을 다시 적지 않는 대신
 * 안전한 값 하나를 골라 둔다.
 *
 * 트리 상단 `새 노트` 버튼도 이 이름을 쓴다 — 그 버튼은 이름을 묻지 않을 뿐
 * 만드는 것은 같은 문서이고, 두 곳에 따로 적으면 한쪽만 바뀐다.
 */
export const CREATE_DEFAULTS = {
  file: { title: '새 문서 만들기', fieldLabel: '새 문서 이름', name: '제목 없음.md' },
  directory: { title: '새 디렉토리 만들기', fieldLabel: '새 디렉토리 이름', name: '새 디렉토리' },
} as const;

/**
 * 이 노드에서 **열리는** 항목들.
 *
 * 열리지 않는 항목은 목록에서 빠지는 것이 아니라 **비활성**으로 그려진다
 * (AC-3) — 사라지면 그 조작이 존재하지 않는 것으로 읽혀, 권한을 얻은
 * 뒤에도 찾지 못한다. 이 함수는 「열리는가」만 답하고 그리는 방식은
 * 컴포넌트가 정한다.
 */
export function enabledMenuItems(node: TreeNodeView, favorited = false): ContextMenuItem[] {
  return menuItemsFor(node, favorited).filter((item) => {
    if (item.target !== undefined && !permits(node.level, item.target)) return false;
    // 만들기는 **담길 자리**에 쓰는 조작이라 그 자리의 권한을 본다. 그 자리는
    // `containerFor` 가 고르는 자리와 같아야 한다 — 판정과 결과가 다른 자리를
    // 가리키면 열려 보이던 항목이 서버에서 거절되고, 사용자에게는 고장으로
    // 보인다. 서버도 같은 자리를 본다(`node-service.ts` 의 `parentTarget` 은
    // `parentId ?? workspaceId` 이며, 그 `parentId` 를 화면이 여기서 정한다).
    if (item.container !== undefined && !permits(담길자리의권한(node), item.container)) return false;
    return true;
  });
}

/**
 * 이 노드의 컨텍스트 메뉴에 **그릴** 항목들.
 *
 * `enabledMenuItems` 가 「열리는가」를 답한다면 이 함수는 「무엇이 보이는가」를
 * 답한다. 둘이 갈리는 자리가 둘 있다 — 파일 전용 항목은 다른 노드에서 아예
 * 빠지고(AC-4 · AC-5), 즐겨찾기 항목의 라벨은 지금 상태에 따라 `추가` 와
 * `해제` 로 갈린다(AC-7). 두 규칙을 화면이 다시 적지 않도록 여기서 답한다.
 */
export function menuItemsFor(
  node: TreeNodeView,
  favorited = false,
): readonly ContextMenuItem[] {
  const 목록 = CONTEXT_MENU_ITEMS.filter(
    (item) => item.filesOnly !== true || node.kind === 'file',
  );
  if (!favorited) return 목록;
  return 목록.map((item) =>
    item.id === 'favorite' ? { ...item, label: FAVORITE_LABELS.remove } : item,
  );
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
 * 워크스페이스들을 가로질러 그 노드를 찾는다.
 *
 * **뿌리만 훑지 않는다.** 목록에서 고른 것(즐겨찾기·검색 결과)은 트리 어디에나
 * 있을 수 있는데, 뿌리만 보면 깊은 자리의 문서는 골라도 열리지 않는다 — 그리고
 * 화면은 아무 말도 하지 않으므로 사용자에게는 클릭이 먹지 않는 것으로 보인다.
 */
export function nodeById(
  workspaces: readonly WorkspaceTreeView[],
  nodeId: string,
): TreeNodeView | undefined {
  for (const entry of workspaces) {
    const 찾은것 = 찾는다(entry.roots, nodeId);
    if (찾은것 !== undefined) return 찾은것;
  }
  return undefined;
}

function 찾는다(nodes: readonly TreeNodeView[], id: string): TreeNodeView | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const 아래 = 찾는다(node.children, id);
    if (아래 !== undefined) return 아래;
  }
  return undefined;
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

/**
 * 새 노드가 담길 자리. `parentId` 가 `null` 이면 그 워크스페이스의 루트다 —
 * 서버의 `POST /nodes` 가 부모를 그렇게 받는다.
 */
export interface Container {
  workspaceId: string;
  parentId: string | null;
}

/**
 * 이 노드에서 만들기를 고르면 어디에 담기는가 (`FR-SHELL-016` AC-1 · AC-2).
 *
 * **디렉토리는 자기 아래가, 파일은 자기가 담긴 자리가 답이다.** 같은 규칙을
 * `담길자리의권한` 이 활성 판정 쪽에서 쓴다 — 두 곳이 갈리면 열려 보이던
 * 항목이 서버에서 거절된다. 파일 자신 아래에 만들려 하면 파일 밑에 노드를
 * 두는 셈이 되고, 서버가 그것을 받지 않는다.
 *
 * 규칙을 화면 부품이 아니라 여기 두는 이유는 `destinationsFor` 와 같다 —
 * 같은 메뉴를 다른 자리에서 그릴 때 규칙이 갈리지 않게 하기 위해서다.
 *
 * 워크스페이스 id 를 함께 돌려주는 이유는 부르는 쪽이 그것을 다시 찾으면
 * 같은 순회가 두 곳에 생기기 때문이다.
 */
export function containerFor(
  workspaces: readonly WorkspaceTreeView[],
  nodeId: string,
): Container | undefined {
  for (const entry of workspaces) {
    const 담을곳 = 담을자리(entry.roots, nodeId, null);
    if (담을곳 !== undefined) return { workspaceId: entry.workspace.id, parentId: 담을곳.parentId };
  }
  return undefined;
}

/**
 * 가지를 훑어 그 노드가 담길 자리를 찾는다.
 *
 * 찾지 못한 것과 부모가 없는 것을 객체로 갈라 돌려준다 — 둘 다 `null` 로
 * 표현하면 트리에 없는 노드가 첫 워크스페이스의 루트로 읽힌다.
 */
function 담을자리(
  nodes: readonly TreeNodeView[],
  nodeId: string,
  부모: string | null,
): { parentId: string | null } | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return { parentId: node.kind === 'directory' ? node.id : 부모 };

    const 아래 = 담을자리(node.children, nodeId, node.id);
    if (아래 !== undefined) return 아래;
  }
  return undefined;
}
