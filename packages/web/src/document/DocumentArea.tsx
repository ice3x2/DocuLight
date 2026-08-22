import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { useEffect, useState } from 'react';

import { DocumentSurface } from './DocumentSurface.js';
import { DOCUMENT_MENU_ITEMS } from './document-menu.js';
import { activeTab, closeTab, type SaveState, type TabState } from './tab-state.js';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: '저장됨',
  saving: '저장 중',
  conflict: '충돌 — 자동 저장 중단',
  rejected: '저장 거부됨',
};

/**
 * 문서 헤더 — 브레드크럼 · 저장 상태 · `⋯` 메뉴 (`IR-SHELL-003` AC-2 · AC-4).
 *
 * 탭 스트립과 **다른 행**에 선다(AC-1). 합치면 탭이 늘어날수록 브레드크럼과
 * 저장 상태가 밀려 잘리는데(AC-3), 그 둘은 지금 무엇을 편집하고 있고 그것이
 * 저장됐는지를 알려 주는 자리라 잘리면 안 된다.
 *
 * `⋯` 메뉴의 대상은 언제나 **활성 문서**다 — 탭 스트립 쪽에 두면 어느 탭을
 * 가리키는지가 마우스 위치에 달리게 된다.
 */
function DocumentHeader({ state }: { state: TabState }) {
  const tab = activeTab(state);
  if (tab === undefined) return null;

  return (
    <header aria-label="문서 헤더">
      <nav aria-label="브레드크럼">{tab.breadcrumb.join(' / ')}</nav>
      <span role="status">{SAVE_LABEL[tab.save]}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label={`${tab.name} 문서 메뉴`}>⋯</DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            {DOCUMENT_MENU_ITEMS.map((item) => (
              <DropdownMenu.Item key={item.id}>{item.label}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}

/**
 * 본문 영역 — 탭 스트립 위, 문서 헤더 아래, 그 아래 본문.
 *
 * 상태를 여기서 들고 있는 것은 wave-4 범위가 셸 골격까지이기 때문이다.
 * 에디터가 붙는 자리(`Tabs.Content` 안)는 wave-5 가 채운다.
 */
export function DocumentArea({
  initial,
  bodies = {},
  hashes = {},
}: {
  initial: TabState;
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. 저장 요청이 이것을 싣는다. */
  hashes?: Readonly<Record<string, string>>;
}) {
  const [state, setState] = useState<TabState>(initial);
  // 탭 목록은 바깥이 소유한다 — 안에서만 들면 트리 클릭으로 연 문서가
  // 여기 반영되지 않는다.
  useEffect(() => setState(initial), [initial]);

  if (state.tabs.length === 0) return <div data-empty="documents" />;

  return (
    <div>
      <Tabs.Root
        value={state.activeId ?? undefined}
        onValueChange={(activeId) => setState((was) => ({ ...was, activeId }))}
      >
        <Tabs.List aria-label="열린 문서">
          {state.tabs.map((tab) => (
            <Tabs.Trigger key={tab.nodeId} value={tab.nodeId}>
              {tab.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <DocumentHeader state={state} />

        {state.tabs.map((tab) => (
          <Tabs.Content key={tab.nodeId} value={tab.nodeId}>
            <button type="button" onClick={() => setState((was) => closeTab(was, tab.nodeId))}>
              {tab.name} 닫기
            </button>
            <DocumentSurface
              file={{ nodeId: tab.nodeId, name: tab.name, level: tab.level ?? null }}
              save={tab.save}
              serverBody={tab.serverBody ?? null}
              {...(bodies[tab.nodeId] === undefined ? {} : { body: bodies[tab.nodeId] })}
              {...(hashes[tab.nodeId] === undefined ? {} : { baseHash: hashes[tab.nodeId] })}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
