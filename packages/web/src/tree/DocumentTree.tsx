import * as ContextMenu from '@radix-ui/react-context-menu';
import { useMemo } from 'react';
import { Tree, type NodeApi, type NodeRendererProps, type RowRendererProps } from 'react-arborist';

import { acceptedDrop, type UploadRequest } from '../attachment/upload-contract.js';
import {
  CONTEXT_MENU_ITEMS,
  enabledMenuItems,
  type TreeNodeView,
  type WorkspaceTreeView,
} from './tree-contract.js';

/**
 * 트리 한 줄이 담는 값.
 *
 * 워크스페이스도 여기 든다 — 트리의 최상위가 워크스페이스이고
 * (`FR-WORKSPACE-003` AC-1), 하나의 모델로 다루지 않으면 최상위만
 * 가상화에서 빠져 큰 인스턴스에서 그 줄들이 통째로 렌더된다.
 */
interface Row {
  id: string;
  name: string;
  /** 워크스페이스 줄에는 없다 — 컨텍스트 메뉴가 서지 않는 자리다. */
  node?: TreeNodeView;
  children?: Row[];
}

const ROW_HEIGHT = 28;
const TREE_HEIGHT = 640;

/**
 * 한 노드의 컨텍스트 메뉴 (`FR-SHELL-003` AC-2 · AC-3).
 *
 * **아홉 항목을 언제나 그린다.** 열리지 않는 것은 빼는 것이 아니라
 * 비활성으로 남긴다 — 사라지면 그 조작이 존재하지 않는 것으로 읽히고,
 * 권한을 얻은 뒤에도 사용자가 그것을 찾지 못한다.
 *
 * 예외는 `새 버전 올리기` 하나다(AC-4 · AC-5) — 디렉토리에 「파일에만
 * 있는 조작」을 비활성으로 보여 주면 그것이 언젠가 열릴 수 있는 것처럼
 * 읽힌다. 열릴 수 없는 것과 지금 못 하는 것은 다르다.
 */
function NodeMenu({
  node,
  children,
  onSelect,
}: {
  node: TreeNodeView;
  children: React.ReactNode;
  onSelect?: (itemId: string, node: TreeNodeView) => void;
}) {
  const enabled = new Set(enabledMenuItems(node).map((item) => item.id));

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content>
          {CONTEXT_MENU_ITEMS.filter((item) => item.filesOnly !== true || node.kind === 'file').map(
            (item) => (
              <ContextMenu.Item
                key={item.id}
                disabled={!enabled.has(item.id)}
                onSelect={() => onSelect?.(item.id, node)}
              >
                {item.label}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * 트리 한 줄.
 *
 * `role="treeitem"` 과 `aria-level`·`aria-expanded` 는 **arborist 가**
 * 바깥 래퍼에 이미 붙인다. 여기서 또 붙이면 같은 줄에 `treeitem` 이 둘이
 * 되고, 접근성 트리가 실제 줄 수의 두 배를 보고한다.
 */
function TreeRow({
  row,
  api,
  onOpen,
}: {
  row: Row;
  api: NodeApi<Row>;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
}) {
  const node = row.node;
  const expandable = !api.isLeaf;

  return (
    <div>
      {expandable && (
        <button type="button" onClick={() => api.toggle()}>
          {row.name} {api.isOpen ? '접기' : '펼치기'}
        </button>
      )}

      {node?.kind === 'file' ? (
        // 클릭은 활성 탭을 교체하고 `Ctrl`+클릭이 새 탭이다
        // (`FR-SHELL-012` AC-1 · AC-2).
        <button type="button" onClick={(event) => onOpen?.(node, event.ctrlKey || event.metaKey)}>
          {row.name}
        </button>
      ) : (
        <span>{row.name}</span>
      )}
    </div>
  );
}

/**
 * 행 래퍼 — 컨텍스트 메뉴와 드롭이 여기 붙는다.
 *
 * 줄 안쪽이 아니라 **행 전체**를 감싸는 이유는 사용자가 줄 어디를 우클릭하거나
 * 어디에 떨궈도 동작해야 하기 때문이다. 안쪽에 붙이면 이름 글자 위에서만
 * 열리고, 빈 여백을 눌렀을 때 아무 일도 안 일어난다.
 *
 * 워크스페이스 줄에는 컨텍스트 메뉴가 서지 않는다 — 그 아홉 항목은 노드에
 * 대한 조작이고, 워크스페이스는 노드가 아니다.
 */
function TreeRowWrapper(
  { node, innerRef, attrs, children }: RowRendererProps<Row>,
  onUpload?: (request: UploadRequest) => void,
  onMenu?: (itemId: string, node: TreeNodeView) => void,
) {
  const view = node.data.node;

  const line = (
    <div
      ref={innerRef}
      {...attrs}
      // 업로드는 **현재 화면에서 완결된다** (`FR-ATTACH-001` AC-3) —
      // 별도 업로드 화면·모드로 보내지 않는다.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (view === undefined) return;
        const accepted = acceptedDrop(view, [...event.dataTransfer.files]);
        if (accepted.ok) onUpload?.(accepted.request);
      }}
    >
      {children}
    </div>
  );

  return view === undefined ? (
    line
  ) : (
    <NodeMenu node={view} onSelect={onMenu}>
      {line}
    </NodeMenu>
  );
}

const toRow = (node: TreeNodeView): Row => ({
  id: node.id,
  name: node.name,
  node,
  // 파일은 자식을 갖지 않는다. `undefined` 로 두어야 arborist 가 잎으로
  // 보고 펼치기 버튼을 만들지 않는다.
  ...(node.kind === 'directory' ? { children: node.children.map(toRow) } : {}),
});

/**
 * 좌측 문서 트리 (`FR-WORKSPACE-003` · `CON-ARCH-004` AC-1).
 *
 * 접근 가능한 워크스페이스가 **동시에** 최상위로 선다(AC-1). 「현재
 * 워크스페이스」를 고르는 자리를 두지 않는다(AC-3) — 그 상태가 생기면
 * 두 워크스페이스에 걸친 링크를 탔을 때 어느 쪽을 열어야 하는지가
 * 사용자의 조작에 달리게 되고, 그것이 `FR-WORKSPACE-003` AC-5 가 막으려는
 * 상황이다.
 *
 * 트리 목록 자체는 서버가 이미 걸러 준 것이다 — 여기서 다시 거르지
 * 않는다. 두 곳이 거르면 한쪽만 규칙이 바뀐다.
 */
export function DocumentTree({
  workspaces,
  onUpload,
  onOpen,
  onCreateNote,
  onFavorite,
  onDelete,
  onRename,
  onNewVersion,
}: {
  workspaces: readonly WorkspaceTreeView[];
  onUpload?: (request: UploadRequest) => void;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
  onCreateNote?: () => void;
  /** 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4). 문서와 디렉토리를 가리지 않는다. */
  onFavorite?: (nodeId: string) => void;
  /** 삭제 — 휴지통으로 보낸다 (`IR-SHELL-005` AC-1). */
  onDelete?: (nodeId: string) => void;
  /** 이름 변경 — 이름을 고를 자리를 연다 (`FR-SHELL-015` AC-1). */
  onRename?: (node: TreeNodeView) => void;
  /** 그 파일을 덮어쓰겠다 (`FR-SHELL-008` AC-2). 확인과 파일 고르기는 바깥이 한다. */
  onNewVersion?: (node: TreeNodeView) => void;
}) {
  const rows = useMemo<Row[]>(
    () =>
      workspaces.map((entry) => ({
        id: entry.workspace.id,
        name: entry.workspace.name,
        children: entry.roots.map(toRow),
      })),
    [workspaces],
  );

  // 워크스페이스만 펼친 채로 시작한다 — 접근 가능한 것이 **동시에**
  // 보여야 하고(`FR-WORKSPACE-003` AC-1), 그 아래까지 전부 펼치면 큰
  // 인스턴스에서 첫 화면이 수천 줄이 된다.
  const initialOpenState = useMemo(
    () => Object.fromEntries(workspaces.map((entry) => [entry.workspace.id, true])),
    [workspaces],
  );

  return (
    <div>
      <button type="button" onClick={() => onCreateNote?.()}>
        새 노트
      </button>

      <div role="tree" aria-label="문서 트리">
        <Tree<Row>
          data={rows}
          idAccessor="id"
          openByDefault={false}
          initialOpenState={initialOpenState}
          height={TREE_HEIGHT}
          rowHeight={ROW_HEIGHT}
          // 화면 밖 줄을 그리지 않는 것이 이 패키지를 쓰는 이유다. 시험
          // 환경은 높이를 못 재므로 넉넉히 잡아 전부 그리게 둔다 — 0 으로
          // 접히면 목록이 통째로 사라지고, 그것은 「비어 있다」와 구별되지
          // 않는다.
          overscanCount={rows.length + 64}
          disableDrag
          disableDrop
          renderRow={(props: RowRendererProps<Row>) =>
            TreeRowWrapper(props, onUpload, (itemId, node) => {
              if (itemId === 'favorite') onFavorite?.(node.id);
              if (itemId === 'delete') onDelete?.(node.id);
              if (itemId === 'rename') onRename?.(node);
              if (itemId === 'new-version') onNewVersion?.(node);
            })
          }
        >
          {({ node, style }: NodeRendererProps<Row>) => (
            <div style={style}>
              <TreeRow row={node.data} api={node} onOpen={onOpen} />
            </div>
          )}
        </Tree>
      </div>
    </div>
  );
}
