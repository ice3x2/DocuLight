import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useId, useState } from 'react';

import { DocumentArea } from '../document/DocumentArea.js';
import { FavoritesView, type Favorite } from '../favorites/FavoritesView.js';
import { LinkPanel, type LinkRowView } from '../links/LinkPanel.js';
import { SearchPanel, type SearchHit } from '../search/SearchPanel.js';
import type { SaveState, TabState } from '../document/tab-state.js';
import { DocumentTree } from '../tree/DocumentTree.js';
import type { UploadRequest } from '../attachment/upload-contract.js';
import { EmptyState } from '../tree/EmptyState.js';
import { NewVersionPrompt } from '../tree/NewVersionPrompt.js';
import { InstanceSettings } from '../settings/InstanceSettings.js';
import { TrashPanel, type TrashLens, type TrashRowView } from '../trash/TrashPanel.js';
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
  active,
  onActivate,
  children,
}: {
  label: string;
  tabs: readonly ShellTab[];
  side: 'left' | 'right';
  /**
   * 지금 열린 탭. 주어지면 **바깥이 소유한다.**
   *
   * 좌측이 그렇다 — 본문의 태그를 눌러도 검색 탭이 열려야 하므로
   * (`FR-EDITOR-007` AC-11), 탭 상태가 이 안에만 있으면 그 경로가 닿지
   * 못한다. 우측은 아직 밖에서 여는 자리가 없어 안에서 든다.
   */
  active?: string;
  onActivate?: (tabId: string) => void;
  children?: (tab: ShellTab) => React.ReactNode;
}) {
  const first = tabs[0]!;

  return (
    <aside aria-label={label} data-side={side}>
      <Tabs.Root
        {...(active === undefined ? { defaultValue: first.id } : { value: active })}
        onValueChange={onActivate}
        orientation="horizontal"
      >
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
function SettingsModal({
  viewer,
  trash = [],
  workspaces = [],
  trashLens,
  onTrashLens,
}: {
  viewer: Viewer;
  trash?: readonly TrashRowView[];
  workspaces?: readonly { id: string; name: string }[];
  trashLens?: TrashLens;
  onTrashLens?: (lens: TrashLens) => void;
}) {
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
                {/* 휴지통만 내용을 갖는다 — 나머지 카테고리는 그것을
                    소유한 요구가 서는 자리에서 채워진다. */}
                {category.id === 'trash' ? (
                  <TrashPanel
                    rows={trash}
                    workspaces={workspaces}
                    // 관리 권한이 어디에도 없으면 범위 토글이 서지 않는다
                    // (`FR-SHELL-007` AC-5) — 눌러도 결과가 그대로다.
                    canWidenScope={viewer.adminWorkspaceCount > 0}
                    {...(trashLens === undefined ? {} : { lens: trashLens })}
                    {...(onTrashLens === undefined ? {} : { onLens: onTrashLens })}
                  />
                ) : category.id === 'instance' ? (
                  <InstanceSettings />
                ) : category.id === 'account' ? (
                  // 계정 카테고리가 담기로 확정된 두 조작 (`IR-SHELL-002` AC-3).
                  <>
                    <button type="button">비밀번호 변경</button>
                    <button type="button">로그아웃</button>
                  </>
                ) : (
                  <p>{category.label}</p>
                )}
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
  links = { outgoing: [], backlinks: [] },
  notice,
  bodies = {},
  hashes = {},
  hits = [],
  trash = [],
  trashLens,
  onTrashLens,
  query = '',
  onQuery,
  onOpen,
  onUpload,
  onCreateNote,
  onFavorite,
  onNewVersion,
  confirmReplace,
  onSaveState,
}: {
  viewer: Viewer;
  workspaces?: readonly WorkspaceTreeView[];
  documents?: TabState;
  favorites?: readonly Favorite[];
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. */
  hashes?: Readonly<Record<string, string>>;
  /** 검색 결과. 서버가 이미 걸러 준 것이다. */
  hits?: readonly SearchHit[];
  /** 활성 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3). */
  links?: { outgoing: readonly LinkRowView[]; backlinks: readonly LinkRowView[] };
  /** 휴지통 행. 서버가 행마다 권한을 붙여 준다. */
  trash?: readonly TrashRowView[];
  /**
   * 방금 조작에 대한 서버의 안내 (`SEC-SHELL-002` AC-3).
   *
   * **문구를 서버가 준다.** 화면이 지으면 보이는 충돌과 보이지 않는 충돌의
   * 문구가 갈리고, 그 차이 자체가 존재 오라클이 된다.
   */
  notice?: string;
  /** 휴지통 목록을 좁혀 보는 조건 (`FR-SHELL-007` AC-4 · AC-5). */
  trashLens?: TrashLens;
  onTrashLens?: (lens: TrashLens) => void;
  /** 좌측 검색 탭의 질의. 태그 클릭도 이 값을 채운다. */
  query?: string;
  onQuery?: (query: string) => void;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
  onUpload?: (request: UploadRequest) => void;
  onCreateNote?: () => void;
  /** 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4). */
  onFavorite?: (nodeId: string) => void;
  /** 그 파일에 새 버전을 올린다 (`FR-SHELL-008` AC-2). */
  onNewVersion?: (node: TreeNodeView, file: File) => void;
  /**
   * 활성 탭을 교체하기 전에 받아야 할 확인 (`FR-SHELL-012` AC-3 · AC-4).
   *
   * 값이 있으면 대화상자가 선다 — 없으면 안 선다. 상태를 바깥이 들고
   * 있는 이유는 무엇을 열려 했는지도 바깥이 알기 때문이다.
   */
  confirmReplace?: { name: string; accept: () => void; cancel: () => void };
  onSaveState?: (nodeId: string, state: SaveState) => void;
}) {
  /**
   * 좌측에서 열린 탭.
   *
   * 여기서 드는 이유는 이 탭을 여는 자리가 **둘**이기 때문이다 — 탭을
   * 직접 누르는 것과 본문 태그를 누르는 것(`FR-EDITOR-007` AC-11).
   */
  const [leftTab, setLeftTab] = useState<string>(LEFT_TABS[0]!.id);
  /** 새 버전을 올릴 대상. 골라 둔 뒤 확인과 파일 고르기가 이어진다. */
  const [overwriting, setOverwriting] = useState<TreeNodeView | null>(null);

  const searchFor = (text: string) => {
    setLeftTab('search');
    onQuery?.(text);
  };

  return (
    <div data-shell="root">
      <Sidebar
        label="좌측 사이드바"
        tabs={LEFT_TABS}
        side="left"
        active={leftTab}
        onActivate={setLeftTab}
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
              <DocumentTree
                workspaces={workspaces}
                onOpen={onOpen}
                onUpload={onUpload}
                onCreateNote={onCreateNote}
                onFavorite={onFavorite}
                onNewVersion={setOverwriting}
              />
            );
          if (tab.id === 'search')
            return (
              <SearchPanel
                hits={hits}
                query={query}
                {...(onQuery === undefined ? {} : { onQuery })}
                onOpen={(nodeId) => {
                  const found = workspaces
                    .flatMap((entry) => entry.roots)
                    .find((node) => node.id === nodeId);
                  if (found !== undefined) onOpen?.(found, false);
                }}
              />
            );
          if (tab.id === 'favorites') return <FavoritesView favorites={favorites} />;
          return <p>{tab.label}</p>;
        }}
      </Sidebar>

      <main>
        <SettingsModal
          viewer={viewer}
          trash={trash}
          workspaces={workspaces.map((entry) => entry.workspace)}
          {...(trashLens === undefined ? {} : { trashLens })}
          {...(onTrashLens === undefined ? {} : { onTrashLens })}
        />
        {notice !== undefined && (
          // `status` 인 이유는 이것이 사용자의 조작을 막지 않기 때문이다 —
          // 알림은 이미 끝난 일을 알리는 것이고, 대화상자로 세우면 확인
          // 단계가 하나 생겨 `SEC-SHELL-002` AC-4 가 깨진다.
          <p role="status" aria-label="알림">
            {notice}
          </p>
        )}
        <DocumentArea
          initial={documents}
          bodies={bodies}
          hashes={hashes}
          {...(onSaveState === undefined ? {} : { onSaveState })}
          onTagClick={searchFor}
        />
      </main>

      <Sidebar label="우측 사이드바" tabs={RIGHT_TABS} side="right">
        {(tab) => {
          // 링크 줄을 누르면 그 문서를 연다 — 목록이 열 수 없는 이름의
          // 나열이면 그 탭은 읽을거리일 뿐 이동 수단이 되지 못한다.
          const openById = (nodeId: string) => {
            const found = workspaces
              .flatMap((entry) => entry.roots)
              .find((node) => node.id === nodeId);
            if (found !== undefined) onOpen?.(found, false);
          };

          if (tab.id === 'backlinks')
            return <LinkPanel label="백링크" rows={links.backlinks} onOpen={openById} />;
          if (tab.id === 'outgoing')
            return <LinkPanel label="아웃고잉 링크" rows={links.outgoing} onOpen={openById} />;
          return <p>{tab.label}</p>;
        }}
      </Sidebar>

      {overwriting !== null && (
        <NewVersionPrompt
          node={overwriting}
          onPick={(file) => {
            onNewVersion?.(overwriting, file);
            setOverwriting(null);
          }}
          onCancel={() => setOverwriting(null)}
        />
      )}

      {confirmReplace !== undefined && (
        // `alertdialog` 인 이유는 잃을 것이 있다는 사실을 먼저 알려야 하기
        // 때문이다 — 보통 대화상자는 읽지 않고 지나칠 수 있다.
        <div role="alertdialog" aria-label="편집 중인 문서">
          <p>
            지금 문서에 저장되지 않은 편집이 남아 있습니다. {confirmReplace.name} 을(를) 열면
            그 편집이 사라집니다.
          </p>
          <button type="button" onClick={confirmReplace.accept}>
            그래도 열기
          </button>
          <button type="button" onClick={confirmReplace.cancel}>
            머무르기
          </button>
        </div>
      )}
    </div>
  );
}
