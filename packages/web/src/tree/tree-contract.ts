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
    if (item.parent !== undefined && !permits(node.level, item.parent)) return false;
    return true;
  });
}
