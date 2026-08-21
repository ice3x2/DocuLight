/**
 * 열린 문서 탭의 **상태 전이**만 담는다 (`FR-SHELL-005` · `FR-SHELL-012`).
 *
 * 컴포넌트 밖에 두는 이유는 이 전이들이 요구사항이고, React 상태 훅
 * 안에 있으면 그것을 확인하려면 화면을 띄워야 하기 때문이다. 여기 있으면
 * 값으로 확인된다.
 */

/** 저장 상태. 뒤의 둘은 사용자가 잃을 것이 있는 상태다. */
export type SaveState = 'saved' | 'saving' | 'conflict' | 'rejected';

export interface OpenTab {
  nodeId: string;
  name: string;
  /** 워크스페이스부터 이 문서까지. 헤더가 그대로 그린다 (`IR-SHELL-003` AC-2). */
  breadcrumb: readonly string[];
  save: SaveState;
}

export interface TabState {
  tabs: readonly OpenTab[];
  activeId: string | null;
}

/**
 * 교체 전에 확인을 받아야 하는가 (`FR-SHELL-012` AC-3 · AC-4).
 *
 * 기준은 **되찾을 수 없는 것이 남아 있는가** 하나다. `saving` 은 서버로
 * 가는 중이므로 사용자가 잃을 것이 없고, `conflict` · `rejected` 는 그
 * 탭에만 있는 내용이 저장되지 못한 상태다.
 */
export function needsConfirmBeforeReplace(tab: OpenTab): boolean {
  return tab.save === 'conflict' || tab.save === 'rejected';
}

/** 새 탭으로 연다 (`FR-SHELL-012` AC-2). 이미 열린 문서면 그 탭을 활성으로 만든다. */
export function openInNewTab(state: TabState, tab: OpenTab): TabState {
  // 같은 문서가 탭 두 개로 열리면 어느 쪽이 진짜 편집 대상인지 갈리고,
  // 한쪽에만 저장된 내용이 다른 쪽 자동 저장에 덮인다.
  if (state.tabs.some((open) => open.nodeId === tab.nodeId)) {
    return { ...state, activeId: tab.nodeId };
  }
  return { tabs: [...state.tabs, tab], activeId: tab.nodeId };
}

/** 활성 탭을 이 문서로 바꾼다 (`FR-SHELL-012` AC-1). 열린 탭이 없으면 새로 만든다. */
export function openInActiveTab(state: TabState, tab: OpenTab): TabState {
  if (state.activeId === null) return openInNewTab(state, tab);
  if (state.tabs.some((open) => open.nodeId === tab.nodeId)) {
    return { ...state, activeId: tab.nodeId };
  }

  return {
    tabs: state.tabs.map((open) => (open.nodeId === state.activeId ? tab : open)),
    activeId: tab.nodeId,
  };
}

/**
 * 탭을 닫는다 (`FR-SHELL-005` AC-3).
 *
 * 활성 탭을 닫으면 활성을 **남은 이웃**으로 옮긴다 — 없는 문서를 활성으로
 * 두면 본문이 그릴 것이 없는데도 헤더가 서고, 그 헤더는 유령을 가리킨다.
 */
export function closeTab(state: TabState, nodeId: string): TabState {
  const at = state.tabs.findIndex((open) => open.nodeId === nodeId);
  if (at === -1) return state;

  const tabs = state.tabs.filter((open) => open.nodeId !== nodeId);
  if (state.activeId !== nodeId) return { ...state, activeId: state.activeId };

  const next = tabs[at] ?? tabs[at - 1];
  return { tabs, activeId: next?.nodeId ?? null };
}

/** 활성 탭. 없으면 `undefined`. */
export function activeTab(state: TabState): OpenTab | undefined {
  return state.tabs.find((open) => open.nodeId === state.activeId);
}
