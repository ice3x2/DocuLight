import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import {
  INSTANCE_SETTING_FIELDS,
  PERSONAL_SETTING_FIELDS,
  personalFieldsOf,
} from '../src/shell/shell-contract.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const viewer = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

const openCategory = async (name: string) => {
  const user = userEvent.setup();
  render(<AppShell viewer={viewer} />);
  await user.click(screen.getByRole('button', { name: '설정' }));
  await user.click(
    within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name }),
  );
  return user;
};

describe('IR-SHELL-004 — 두 카테고리가 담는 개인 설정 세 항목', () => {
  it('AC-1: 에디터 카테고리가 두 항목을 담는다', () => {
    expect(personalFieldsOf('editor').map((field) => field.key)).toEqual([
      'default-view-mode',
      'default-edit-subview',
    ]);
  });

  it('AC-2: 외모(테마) 카테고리가 테마 한 항목을 담는다', () => {
    expect(personalFieldsOf('appearance').map((field) => field.key)).toEqual(['theme']);
  });

  it('AC-3: 기본 열람 모드는 둘만 허용하고 기본값이 보기 다', () => {
    const field = PERSONAL_SETTING_FIELDS.find((one) => one.key === 'default-view-mode')!;

    expect(field.options.map((option) => option.value)).toEqual(['view', 'edit']);
    expect(field.fallback).toBe('view');
  });

  it('AC-4: 편집 하위 뷰는 둘만 허용하고 기본값이 라이브 프리뷰 다', () => {
    const field = PERSONAL_SETTING_FIELDS.find((one) => one.key === 'default-edit-subview')!;

    expect(field.options.map((option) => option.value)).toEqual(['live-preview', 'source']);
    expect(field.fallback).toBe('live-preview');
  });

  it('AC-5: 테마는 셋만 허용하고 기본값이 시스템 이다', () => {
    const field = PERSONAL_SETTING_FIELDS.find((one) => one.key === 'theme')!;

    expect(field.options.map((option) => option.value)).toEqual(['light', 'dark', 'system']);
    expect(field.fallback).toBe('system');
  });

  it('AC-6: 두 카테고리를 합쳐 항목은 셋뿐이다', () => {
    expect(PERSONAL_SETTING_FIELDS).toHaveLength(3);

    // 요구가 이름을 대어 뺀 것들이다 — 「없다」를 재지 않으면 나중에
    // 조용히 들어와도 아무도 모른다.
    for (const forbidden of ['autosave-delay-ms', 'font-family', 'font-size']) {
      expect(PERSONAL_SETTING_FIELDS.some((field) => field.key === forbidden)).toBe(false);
    }
  });

  it('AC-7: 세 항목이 인스턴스 설정 다섯에 들어가지 않는다', () => {
    const instance = INSTANCE_SETTING_FIELDS.map((field) => field.key);

    expect(instance).toHaveLength(5);
    for (const field of PERSONAL_SETTING_FIELDS) expect(instance).not.toContain(field.key);
  });

  it('AC-1: 에디터 카테고리를 열면 두 항목이 화면에 선다', async () => {
    await openCategory('에디터');

    expect(screen.getByLabelText('기본 열람 모드')).toBeDefined();
    expect(screen.getByLabelText('편집 모드 기본 하위 뷰')).toBeDefined();
  });

  it('AC-2: 외모 카테고리를 열면 테마가 선다', async () => {
    await openCategory('외모(테마)');

    expect(screen.getByLabelText('테마')).toBeDefined();
  });

  it('AC-1: 값을 고르면 바깥으로 그 키와 값이 나간다', async () => {
    const picked: { key: string; value: string }[] = [];
    const user = userEvent.setup();
    render(<AppShell viewer={viewer} onPersonalSetting={(key, value) => picked.push({ key, value })} />);
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name: '에디터' }),
    );

    await user.selectOptions(screen.getByLabelText('기본 열람 모드'), 'edit');

    expect(picked).toEqual([{ key: 'default-view-mode', value: 'edit' }]);
  });

  it('AC-3: 값을 준 적 없으면 기본값이 골라져 있다', async () => {
    await openCategory('에디터');

    expect(screen.getByLabelText('기본 열람 모드')).toHaveProperty('value', 'view');
  });
});
