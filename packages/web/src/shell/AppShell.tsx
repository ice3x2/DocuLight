import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useId, useState } from 'react';

import { LEFT_TABS, RIGHT_TABS, SETTINGS_CATEGORIES, type ShellTab } from './shell-contract.js';

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
function SettingsModal() {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>설정</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-labelledby={titleId}>
          <Dialog.Title id={titleId}>설정</Dialog.Title>

          {/* 좌측 카테고리 — 관리 기능이 전부 이 목록 안에 든다(AC-2). */}
          <Tabs.Root defaultValue={SETTINGS_CATEGORIES[0]!.id} orientation="vertical">
            <Tabs.List aria-label="설정 카테고리">
              {SETTINGS_CATEGORIES.map((category) => (
                <Tabs.Trigger key={category.id} value={category.id}>
                  {category.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {SETTINGS_CATEGORIES.map((category) => (
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
export function AppShell() {
  return (
    <div data-shell="root">
      <Sidebar label="좌측 사이드바" tabs={LEFT_TABS} side="left" />

      <main>
        <SettingsModal />
      </main>

      <Sidebar label="우측 사이드바" tabs={RIGHT_TABS} side="right" />
    </div>
  );
}
