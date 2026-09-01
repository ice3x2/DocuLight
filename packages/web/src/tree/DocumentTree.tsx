import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Tree,
  type NodeApi,
  type NodeRendererProps,
  type RowRendererProps,
  type TreeApi,
} from 'react-arborist';

import { acceptedDrop, type UploadRequest } from '../attachment/upload-contract.js';
import {
  CREATE_DEFAULTS,
  enabledMenuItems,
  menuItemsFor,
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
 * 아직 없는 노드의 자리 — 만들기가 이름을 정하는 동안만 선다.
 *
 * 실재하는 노드 ID 와 부딪히지 않는 값이어야 한다. UUID 가 아닌 문자열이므로
 * 서버가 준 어떤 id 와도 같지 않다.
 */
const NAMING_ROW = '__naming__';

/**
 * 지금 이름을 정하는 자리 (`FR-SHELL-015` AC-1 · `FR-SHELL-016` AC-3).
 *
 * **트리 안에서 정한다** — 설계서 §2.2.4 가 「이름 입력은 트리 안 인라인
 * 편집」을, §6.1 상태 표가 「해당 행이 입력 필드로 전환 · Enter 확정 ·
 * Esc 취소」를 적는다. 모달로 띄우면 어느 노드를 고치는지와 어디에 만드는지가
 * 화면에서 사라지고, 형제들의 이름을 보며 지을 수 없다.
 */
export type Naming =
  | { kind: 'rename'; node: TreeNodeView }
  | {
      kind: 'create';
      workspaceId: string;
      /** `null` 이면 그 워크스페이스의 루트다. */
      parentId: string | null;
      makes: 'file' | 'directory';
    };

/** 그 자리에서 쓸 입력 이름표와 처음 채울 값. */
const namingLabel = (naming: Naming): { label: string; initial: string } =>
  naming.kind === 'rename'
    ? { label: `${naming.node.name} 새 이름`, initial: naming.node.name }
    : {
        label: CREATE_DEFAULTS[naming.makes].fieldLabel,
        initial: CREATE_DEFAULTS[naming.makes].name,
      };

/**
 * 트리 안에서 이름 한 줄을 받는다.
 *
 * **이름 규칙을 여기서 판정하지 않는다.** 금지 문자와 길이 상한과 이름 충돌은
 * 전부 서버가 소유하며(`validateNodeName` · `resolveNameCollision`), 화면이
 * 그것을 다시 적으면 두 곳이 조용히 갈린다. 여기서 막는 것은 「입력이 비어
 * 있다」 하나이고 그것은 판정이 아니라 부재다.
 *
 * 설계서 §2.2.4 는 클라이언트 1차 검증도 함께 요구하는데 그 축은 아직 열려
 * 있다(§11-35) — 넣을 때 이 자리에 넣고, 입력 아래에 안내를 세운다.
 */
function NameField({
  label,
  initial,
  onConfirm,
  onCancel,
}: {
  label: string;
  initial: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);

  // 열리면 초점을 옮기고 지금 값을 골라 둔다 — 옮기지 않으면 키보드
  // 사용자는 방금 무엇이 열렸는지 모르고, 고르지 않으면 다르게 지으려는
  // 사람이 먼저 지워야 한다.
  useEffect(() => {
    const 잡는다 = () => {
      input.current?.focus();
      input.current?.select();
    };
    잡는다();
    // **트리가 행에 초점을 준 뒤에 한 번 더 잡는다.** arborist 는 키보드
    // 이동을 위해 행 자체에 초점을 두는데 그것이 같은 틱에 일어나 이 입력의
    // 초점을 덮는다 — 사용자는 메뉴를 고르고 바로 치기 시작하는데 그 글자가
    // 아무 데도 들어가지 않는다.
    const timer = setTimeout(잡는다, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <input
      ref={input}
      type="text"
      aria-label={label}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const 다듬은 = name.trim();
          if (다듬은 !== '') onConfirm(다듬은);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

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
  favorited = false,
  children,
  onSelect,
}: {
  node: TreeNodeView;
  /** 이 노드가 이미 즐겨찾기에 있는가 (`FR-SHELL-003` AC-7). */
  favorited?: boolean;
  children: React.ReactNode;
  onSelect?: (itemId: string, node: TreeNodeView) => void;
}) {
  const enabled = new Set(enabledMenuItems(node, favorited).map((item) => item.id));

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        {/* **닫히면서 포커스를 되돌리지 않는다.** Radix 는 기본으로 트리거에
            포커스를 돌려주는데, 고른 조작이 이름 입력을 세우는 경우 그 복원이
            방금 초점을 잡은 입력에서 초점을 뺏는다 — 사용자는 메뉴를 고르고
            바로 치기 시작하는데 그 글자가 아무 데도 들어가지 않는다. */}
        <ContextMenu.Content onCloseAutoFocus={(event) => event.preventDefault()}>
          {menuItemsFor(node, favorited).map((item) => (
            <ContextMenu.Item
              key={item.id}
              disabled={!enabled.has(item.id)}
              onSelect={() => onSelect?.(item.id, node)}
            >
              {item.label}
            </ContextMenu.Item>
          ))}
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
  naming,
  onNamed,
  onNamingCancel,
}: {
  row: Row;
  api: NodeApi<Row>;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
  naming?: Naming;
  onNamed?: (name: string) => void;
  onNamingCancel?: () => void;
}) {
  const node = row.node;
  const expandable = !api.isLeaf;

  // 이 줄이 지금 이름을 정하는 자리인가. 개명은 그 노드의 줄이고, 만들기는
  // 담을 자리 아래에 선 임시 줄이다.
  const 이름짓는중 =
    naming !== undefined &&
    (naming.kind === 'rename' ? naming.node.id === row.id : row.id === NAMING_ROW);

  if (이름짓는중) {
    const { label, initial } = namingLabel(naming);
    return (
      <div>
        <NameField
          label={label}
          initial={initial}
          onConfirm={(name) => onNamed?.(name)}
          onCancel={() => onNamingCancel?.()}
        />
      </div>
    );
  }

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
  favorited: ReadonlySet<string>,
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
    <NodeMenu node={view} favorited={favorited.has(view.id)} onSelect={onMenu}>
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
  onCreate,
  favorites,
  onFavorite,
  onUnfavorite,
  onDelete,
  onRename,
  onRelocate,
  onShare,
  onNewVersion,
  naming,
  onNamed,
  onNamingCancel,
}: {
  workspaces: readonly WorkspaceTreeView[];
  onUpload?: (request: UploadRequest) => void;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
  onCreateNote?: () => void;
  /**
   * 그 노드가 담긴 자리에 새 노드를 만든다 (`FR-SHELL-016` AC-1 · AC-2).
   * 담길 자리를 고르는 일과 이름을 묻는 일은 바깥이 한다.
   */
  onCreate?: (node: TreeNodeView, kind: 'file' | 'directory') => void;
  /**
   * 이미 즐겨찾기에 있는 노드들 (`FR-SHELL-003` AC-7).
   *
   * 트리가 이 집합으로 메뉴 문면을 정하고, 고른 것이 추가인지 해제인지도
   * 여기서 갈린다 — 바깥은 「무엇을 하라」만 받는다.
   */
  favorites?: ReadonlySet<string>;
  /** 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4). 문서와 디렉토리를 가리지 않는다. */
  onFavorite?: (nodeId: string) => void;
  /** 즐겨찾기에서 뺀다 (`FR-SHELL-001` AC-5). */
  onUnfavorite?: (nodeId: string) => void;
  /** 삭제 — 휴지통으로 보낸다 (`IR-SHELL-005` AC-1). */
  onDelete?: (nodeId: string) => void;
  /** 이름 변경 — 이름을 고를 자리를 연다 (`FR-SHELL-015` AC-1). */
  onRename?: (node: TreeNodeView) => void;
  /** 이동·복사 — 목적지를 고를 자리를 연다 (`FR-SHELL-015` AC-2 · AC-4). */
  onRelocate?: (node: TreeNodeView, kind: 'move' | 'copy') => void;
  /** 공유 — 권한을 주고 거두는 자리를 연다 (`IR-ACL-002` · `IR-ACL-003`). */
  onShare?: (node: TreeNodeView) => void;
  /** 그 파일을 덮어쓰겠다 (`FR-SHELL-008` AC-2). 확인과 파일 고르기는 바깥이 한다. */
  onNewVersion?: (node: TreeNodeView) => void;
  /** 지금 이름을 정하는 자리. 없으면 트리는 평소대로 선다. */
  naming?: Naming;
  /** 이름이 정해졌다. 그 이름으로 무엇을 할지는 바깥이 안다. */
  onNamed?: (name: string) => void;
  onNamingCancel?: () => void;
}) {
  // 없으면 빈 집합이다 — 아직 못 받았을 뿐 「하나도 아니다」와 같게 다룬다.
  const 즐겨찾기 = favorites ?? new Set<string>();

  const tree = useRef<TreeApi<Row> | null>(null);

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = workspaces.map((entry) => ({
      id: entry.workspace.id,
      name: entry.workspace.name,
      children: entry.roots.map(toRow),
    }));
    if (naming?.kind !== 'create') return base;

    // **담을 자리 아래에 임시 줄 하나를 끼운다** (설계서 §7.2 1단계).
    // 그 줄이 곧 입력 필드가 되며, 사용자는 형제들의 이름을 보면서 짓는다.
    const 자리: Row = { id: NAMING_ROW, name: '' };
    const 끼운다 = (rows: readonly Row[]): boolean =>
      rows.some((row) => {
        if (row.id === naming.parentId) {
          row.children = [...(row.children ?? []), 자리];
          return true;
        }
        return row.children !== undefined && 끼운다(row.children);
      });

    if (naming.parentId === null) {
      const 워크스페이스 = base.find((one) => one.id === naming.workspaceId);
      if (워크스페이스 !== undefined) 워크스페이스.children = [...(워크스페이스.children ?? []), 자리];
    } else {
      끼운다(base);
    }
    return base;
  }, [workspaces, naming]);

  // 워크스페이스만 펼친 채로 시작한다 — 접근 가능한 것이 **동시에**
  // 보여야 하고(`FR-WORKSPACE-003` AC-1), 그 아래까지 전부 펼치면 큰
  // 인스턴스에서 첫 화면이 수천 줄이 된다.
  //
  // **만들 자리는 함께 펼친다** — 접힌 채로 두면 입력 줄이 화면에 없고,
  // 사용자에게는 아무 일도 일어나지 않은 것으로 보인다.
  const initialOpenState = useMemo(
    () =>
      Object.fromEntries([
        ...workspaces.map((entry) => [entry.workspace.id, true] as const),
        ...(naming?.kind === 'create' && naming.parentId !== null
          ? [[naming.parentId, true] as const]
          : []),
      ]),
    [workspaces, naming],
  );

  // **만들 자리를 펼친다.** `initialOpenState` 는 이름 그대로 처음 한 번이라,
  // 이미 서 있는 트리에서 만들기를 고르면 접힌 디렉토리 아래의 입력 줄이
  // 화면에 오지 않는다 — 사용자에게는 아무 일도 일어나지 않은 것으로 보인다.
  useEffect(() => {
    if (naming?.kind === 'create' && naming.parentId !== null) {
      tree.current?.open(naming.parentId);
    }
  }, [naming]);

  return (
    <div>
      <button type="button" onClick={() => onCreateNote?.()}>
        새 노트
      </button>

      <div role="tree" aria-label="문서 트리">
        <Tree<Row>
          ref={tree}
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
            TreeRowWrapper(props, 즐겨찾기, onUpload, (itemId, node) => {
              if (itemId === 'new-file') onCreate?.(node, 'file');
              if (itemId === 'new-directory') onCreate?.(node, 'directory');
              if (itemId === 'favorite') {
                if (즐겨찾기.has(node.id)) onUnfavorite?.(node.id);
                else onFavorite?.(node.id);
              }
              if (itemId === 'delete') onDelete?.(node.id);
              if (itemId === 'rename') onRename?.(node);
              if (itemId === 'move') onRelocate?.(node, 'move');
              if (itemId === 'copy') onRelocate?.(node, 'copy');
              if (itemId === 'share') onShare?.(node);
              if (itemId === 'new-version') onNewVersion?.(node);
            })
          }
        >
          {({ node, style }: NodeRendererProps<Row>) => (
            <div style={style}>
              <TreeRow
                row={node.data}
                api={node}
                onOpen={onOpen}
                {...(naming === undefined ? {} : { naming })}
                {...(onNamed === undefined ? {} : { onNamed })}
                {...(onNamingCancel === undefined ? {} : { onNamingCancel })}
              />
            </div>
          )}
        </Tree>
      </div>
    </div>
  );
}
