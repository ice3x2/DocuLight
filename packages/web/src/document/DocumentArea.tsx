import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';

import { DocumentSurface } from './DocumentSurface.js';
import { ShareModal } from './ShareModal.js';
import { VersionHistory } from './VersionHistory.js';
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
function DocumentHeader({
  state,
  onSelect,
}: {
  state: TabState;
  onSelect?: (id: string) => void;
}) {
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
              <DropdownMenu.Item key={item.id} onSelect={() => onSelect?.(item.id)}>
                {item.label}
              </DropdownMenu.Item>
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
  state,
  onState,
  bodies = {},
  hashes = {},
  onSaveState,
  onSaved,
  onTagClick,
  onOpenWikiLink,
  missing = false,
}: {
  /**
   * 열린 탭들. **바깥이 소유한다.**
   *
   * 여기서 복사해 들면 정본이 둘이 된다 — 탭을 닫거나 바꾼 사실이 바깥에
   * 닿지 않아, 닫은 문서를 계속 다시 받고 우측 링크 패널이 앞 문서 것을
   * 보인다. 그 어긋남은 두 탭을 오가 보기 전까지 드러나지 않는다.
   */
  state: TabState;
  onState: (next: TabState) => void;
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. 저장 요청이 이것을 싣는다. */
  hashes?: Readonly<Record<string, string>>;
  onSaveState?: (nodeId: string, state: SaveState) => void;
  /** 본문 태그를 눌렀다 (`FR-EDITOR-007` AC-11). 받는 쪽은 좌측 검색 탭이다. */
  onTagClick?: (name: string) => void;
  /** 그 문서의 이 본문이 서버에 올라갔다. 서버 상태 캐시를 맞추는 자리가 쓴다. */
  onSaved?: (nodeId: string, body: string, hash: string) => void;
  /** 위키링크를 눌렀다 (`CON-EDITOR-002` AC-1). 그 문서를 여는 일은 셸이 한다. */
  onOpenWikiLink?: (target: string) => void;
  /**
   * 주소가 가리킨 문서에 닿지 못했다 (`SEC-ACL-006` AC-6).
   *
   * **왜 닿지 못했는지는 받지 않는다.** 없는 문서와 권한 없는 문서를
   * 구별하는 값이 이 경계를 넘는 순간, 그 값을 쓰지 않더라도 구별이
   * 가능해진 것이고 언젠가 누가 쓴다.
   */
  missing?: boolean;
}) {
  /**
   * 헤더 메뉴가 연 자리.
   *
   * 문서마다 따로 들지 않는다 — 활성 문서 하나에 대해서만 열리기 때문이다
   * (`IR-SHELL-003` AC-4).
   */
  const [panel, setPanel] = useState<string | null>(null);

  if (state.tabs.length === 0) {
    // 삭제된 문서와 권한을 잃은 문서에 **같은 문구**를 준다 (`R94`). 화면
    // 설계(`03` §3.9.4)가 이 문면을 정했고 「권한이 없습니다」라고 쓰지
    // 않으며 요청 버튼도 두지 않는다(`R103-a`) — 버튼의 존재 자체가 그
    // 자리에 대상이 있다는 사실을 드러낸다.
    if (missing) return <div data-empty="documents">문서를 찾을 수 없습니다</div>;
    return <div data-empty="documents" />;
  }

  return (
    <div>
      <Tabs.Root
        value={state.activeId ?? undefined}
        onValueChange={(activeId) => onState({ ...state, activeId })}
      >
        <Tabs.List aria-label="열린 문서">
          {state.tabs.map((tab) => (
            <Tabs.Trigger key={tab.nodeId} value={tab.nodeId}>
              {tab.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <DocumentHeader state={state} onSelect={setPanel} />

        {state.tabs.map((tab) => (
          <Tabs.Content key={tab.nodeId} value={tab.nodeId}>
            <button type="button" onClick={() => onState(closeTab(state, tab.nodeId))}>
              {tab.name} 닫기
            </button>
            {panel === 'versions' && (
              <VersionHistory
                nodeId={tab.nodeId}
                currentBody={bodies[tab.nodeId] ?? ''}
                onRestored={() => setPanel(null)}
              />
            )}
            <ShareModal
              name={tab.name}
              open={panel === 'share'}
              onOpenChange={(next) => setPanel(next ? 'share' : null)}
            />
            <DocumentSurface
              file={{ nodeId: tab.nodeId, name: tab.name, level: tab.level ?? null }}
              save={tab.save}
              serverBody={tab.serverBody ?? null}
              {...(bodies[tab.nodeId] === undefined ? {} : { body: bodies[tab.nodeId] })}
              {...(hashes[tab.nodeId] === undefined ? {} : { baseHash: hashes[tab.nodeId] })}
              onSaveState={(next) => onSaveState?.(tab.nodeId, next)}
              onSaved={(body, hash) => onSaved?.(tab.nodeId, body, hash)}
              {...(onTagClick === undefined ? {} : { onTagClick })}
              {...(onOpenWikiLink === undefined ? {} : { onOpenWikiLink })}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
