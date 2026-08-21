import * as ContextMenu from '@radix-ui/react-context-menu';
import { useState } from 'react';

import {
  CONTEXT_MENU_ITEMS,
  enabledMenuItems,
  type TreeNodeView,
  type WorkspaceTreeView,
} from './tree-contract.js';

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
function NodeMenu({ node, children }: { node: TreeNodeView; children: React.ReactNode }) {
  const enabled = new Set(enabledMenuItems(node).map((item) => item.id));

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content>
          {CONTEXT_MENU_ITEMS.filter((item) => item.filesOnly !== true || node.kind === 'file').map(
            (item) => (
              <ContextMenu.Item key={item.id} disabled={!enabled.has(item.id)}>
                {item.label}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** 트리 한 줄. 디렉토리면 펼치기 버튼을 함께 낸다. */
function TreeRow({ node, depth }: { node: TreeNodeView; depth: number }) {
  const [open, setOpen] = useState(false);
  const expandable = node.kind === 'directory' && node.children.length > 0;

  return (
    <li role="none">
      <NodeMenu node={node}>
        <div role="treeitem" aria-level={depth} aria-expanded={expandable ? open : undefined}>
          {expandable && (
            <button type="button" onClick={() => setOpen((was) => !was)}>
              {node.name} {open ? '접기' : '펼치기'}
            </button>
          )}
          <span>{node.name}</span>
        </div>
      </NodeMenu>

      {expandable && open && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 좌측 문서 트리 (`FR-WORKSPACE-003`).
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
export function DocumentTree({ workspaces }: { workspaces: readonly WorkspaceTreeView[] }) {
  const [openWorkspaces, setOpenWorkspaces] = useState<ReadonlySet<string>>(
    () => new Set(workspaces.map((entry) => entry.workspace.id)),
  );

  const toggle = (id: string) =>
    setOpenWorkspaces((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <button type="button">새 노트</button>

      <ul role="tree" aria-label="문서 트리">
        {workspaces.map((entry) => (
          <li key={entry.workspace.id} role="none">
            <div role="treeitem" aria-level={1} aria-expanded={openWorkspaces.has(entry.workspace.id)}>
              <button type="button" onClick={() => toggle(entry.workspace.id)}>
                {entry.workspace.name}
              </button>
            </div>

            {openWorkspaces.has(entry.workspace.id) && (
              <ul role="group">
                {entry.roots.map((node) => (
                  <TreeRow key={node.id} node={node} depth={2} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
