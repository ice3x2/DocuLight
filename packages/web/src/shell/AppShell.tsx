import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useId, useState } from 'react';

import { DocumentArea } from '../document/DocumentArea.js';
import { FavoritesView, type Favorite } from '../favorites/FavoritesView.js';
import type { TabState } from '../document/tab-state.js';
import { DocumentTree } from '../tree/DocumentTree.js';
import { EmptyState } from '../tree/EmptyState.js';
import type { TreeNodeView, WorkspaceTreeView } from '../tree/tree-contract.js';
import {
  LEFT_TABS,
  RIGHT_TABS,
  visibleCategories,
  type ShellTab,
  type Viewer,
} from './shell-contract.js';

/**
 * 사이드바 하나 — 탭 줄과 그 아래 본문.
 *
 * 좌우가 **같은 부품**을 쓴다. 옵시디언과 같은 구조라는 것이 요구이고
 * (`FR-SHELL-001` · `FR-SHELL-004`), 둘을 따로 만들면 한쪽에만 손이 가서
 * 구조가 갈린다. 다른 것은 탭 목록과 이름표뿐이다.
 *
 * Radix 를 쓰는 이유는 `CON-ARCH-004` AC-2 가 그것을 지목하기 때문이며,
 * 부수 효과로 탭의 키보드 이동과 `role`·`aria-*` 배선이 함께 온다 —
 * 직접 만들면 그것들이 빠진 채로 「동작은 한다」가 된다.
 */
function Sidebar({
  label,
  tabs,
  side,
  children,
}: {
  label: string;
  tabs: readonly ShellTab[];
  side: 'left' | 'right';
  children?: (tab: ShellTab) => React.ReactNode;
}) {
  const first = tabs[0]!;

  return (
    <aside aria-label={label} data-side={side}>
      <Tabs.Root defaultValue={first.id} orientation="horizontal">
        <Tabs.List aria-label={label}>
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {tabs.map((tab) => (
          // 고른 탭의 본문만 DOM 에 남긴다 — 전부 렌더해 두고 숨기면
          // 「교체된다」(AC-2)가 화면에서만 참이고 접근성 트리에서는 거짓이다.
          <Tabs.Content key={tab.id} value={tab.id}>
            {children?.(tab) ?? <p>{tab.label}</p>}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </aside>
  );
}

/**
 * 설정 모달 (`CON-SHELL-001`).
 *
 * 관리 기능으로 가는 **유일한** 진입점이다(AC-1) — 「관리자 화면」 버튼을
 * 따로 두면 그것이 두 번째 진입점이 되고, 두 진입점은 곧 서로 다른 것을
 * 보여 주게 된다.
 */
function SettingsModal({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  // 보이지 않는 카테고리는 **그리지 않는다.** 트리 컨텍스트 메뉴는 반대로
  // 비활성으로 남기는데(`FR-SHELL-003` AC-3), 그것은 권한을 얻으면 열리는
  // 조작이기 때문이다. 여기 감춰지는 것들은 권한 자체를 못 얻는 자리다 —
  // 비활성으로 보여 주면 그것이 언젠가 열릴 것처럼 읽힌다.
  const categories = visibleCategories(viewer);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* 좌하단 기어가 자리다 (`IR-SHELL-002` AC-1) — 어디에 있어도 되는
          버튼이면 사용자가 매번 찾아야 한다. */}
      <div data-shell="settings-corner">
        <Dialog.Trigger aria-label="설정">⚙</Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-labelledby={titleId}>
          <Dialog.Title id={titleId}>설정</Dialog.Title>

          {/* 좌측 카테고리 — 관리 기능이 전부 이 목록 안에 든다(AC-2). */}
          <Tabs.Root defaultValue={categories[0]!.id} orientation="vertical">
            <Tabs.List aria-label="설정 카테고리">
              {categories.map((category) => (
                <Tabs.Trigger key={category.id} value={category.id}>
                  {category.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {categories.map((category) => (
              <Tabs.Content key={category.id} value={category.id}>
                <p>{category.label}</p>
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * 로그인 후 화면의 골격 — 좌측 사이드바 · 본문 · 우측 사이드바.
 *
 * 이 컴포넌트는 **자리만 잡는다.** 각 자리의 내용(트리·검색·백링크…)은
 * 그것을 소유한 요구가 서는 자리에서 채워진다 — 여기서 함께 만들면 셸의
 * 구조와 그 안의 기능이 한 파일에서 얽혀 어느 쪽을 고쳐도 다른 쪽이 흔들린다.
 */
export function AppShell({
  viewer,
  workspaces = [],
  documents = { tabs: [], activeId: null },
  favorites = [],
  bodies = {},
  hashes = {},
  onOpen,
}: {
  viewer: Viewer;
  workspaces?: readonly WorkspaceTreeView[];
  documents?: TabState;
  favorites?: readonly Favorite[];
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. */
  hashes?: Readonly<Record<string, string>>;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
}) {
  return (
    <div data-shell="root">
      <Sidebar
        label="좌측 사이드바"
        tabs={LEFT_TABS}
        side="left"
        // 트리만 내용을 갖는다. 검색·즐겨찾기는 그것을 소유한 요구가 서는
        // 자리에서 채워진다 — 여기서 함께 만들면 셸 구조와 그 안의 기능이
        // 한 파일에서 얽힌다.
      >
        {(tab) => {
          // 접근 가능한 것이 없으면 빈 트리가 아니라 안내를 세운다
          // (`FR-AUTH-005` AC-1) — 아무 말 없는 빈 화면은 「권한이 없다」가
          // 아니라 「고장났다」로 읽힌다.
          if (tab.id === 'tree')
            return workspaces.length === 0 ? (
              <EmptyState />
            ) : (
              <DocumentTree workspaces={workspaces} onOpen={onOpen} />
            );
          if (tab.id === 'favorites') return <FavoritesView favorites={favorites} />;
          return <p>{tab.label}</p>;
        }}
      </Sidebar>

      <main>
        <SettingsModal viewer={viewer} />
        <DocumentArea initial={documents} bodies={bodies} hashes={hashes} />
      </main>

      <Sidebar label="우측 사이드바" tabs={RIGHT_TABS} side="right" />
    </div>
  );
}
