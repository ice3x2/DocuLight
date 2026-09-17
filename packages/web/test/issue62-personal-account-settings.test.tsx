import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordChangeForm } from '../src/auth/PasswordChangeForm.js';
import { PersonalSettings } from '../src/settings/PersonalSettings.js';

afterEach(() => cleanup());

describe('IR-SHELL-004 editor parent state', () => {
  it('renders loading, retry, per-field outcomes, and auth-ended disablement', async () => {
    const retryLoad = vi.fn();
    const retrySave = vi.fn();
    const view = render(<PersonalSettings category="editor" editorLoadState={{ state: 'loading' }} />);
    expect(screen.getAllByRole('combobox').every((select) => (select as HTMLSelectElement).disabled)).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('불러오는 중');
    view.rerender(<PersonalSettings category="editor" editorSaveStates={{ 'default-view-mode': { state: 'error', outcome: 'auth-ended' }, 'default-edit-subview': { state: 'error', outcome: 'auth-ended' } }} />);
    expect(screen.getAllByText(/로그인이 필요합니다/)).toHaveLength(1);

    view.rerender(<PersonalSettings category="editor" editorLoadState={{ state: 'error', onRetry: retryLoad }} />);
    await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retryLoad).toHaveBeenCalledOnce();

    view.rerender(<PersonalSettings category="editor" editorSaveStates={{
      'default-view-mode': { state: 'error', outcome: 'rejected', onRetry: retrySave },
      'default-edit-subview': { state: 'saving' },
    }} />);
    expect(screen.getByText(/마지막 확인값으로 복원했습니다/)).toBeTruthy();
    expect(screen.getAllByRole('combobox')[1]?.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /저장 다시 시도/ }));
    expect(retrySave).toHaveBeenCalledOnce();

    view.rerender(<PersonalSettings category="editor" />);
    const focused = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    focused.focus();
    fireEvent.change(focused, { target: { value: 'source' } });
    view.rerender(<PersonalSettings category="editor" editorSaveStates={{ 'default-edit-subview': { state: 'saving' } }} />);
    expect(document.activeElement).toBe(screen.getByText('저장 중…'));
    view.rerender(<PersonalSettings category="editor" editorSaveStates={{ 'default-edit-subview': { state: 'saved' } }} />);
    expect(document.activeElement).toBe(screen.getAllByRole('combobox')[1]);

    view.rerender(<PersonalSettings category="editor" editorSaveStates={{
      'default-view-mode': { state: 'error', outcome: 'unknown', onRetry: retrySave },
      'default-edit-subview': { state: 'error', outcome: 'auth-ended' },
    }} />);
    expect(screen.getByText(/저장 여부를 확인하지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/로그인이 필요합니다/)).toBeTruthy();
    expect(screen.getAllByRole('combobox').every((select) => (select as HTMLSelectElement).disabled)).toBe(true);
  });
});

describe('IR-SHELL-004 · DR-SHELL-002 — #62 개인 설정 표현', () => {
  it('계약의 세 항목만 공용 필드와 네이티브 select로 그린다', () => {
    const editor = render(<PersonalSettings category="editor" />);
    const editorSelects = screen.getAllByRole('combobox');
    expect(editorSelects).toHaveLength(2);
    expect(editorSelects.map((select) => select.getAttribute('data-slot'))).toEqual(['select', 'select']);
    expect(screen.getByLabelText('기본 열람 모드')).toHaveProperty('value', 'view');
    expect(screen.getByLabelText('편집 모드 기본 하위 뷰')).toHaveProperty('value', 'live-preview');
    expect(screen.queryByText(/글꼴|글자 크기|자동 저장/)).toBeNull();
    editor.unmount();

    render(<PersonalSettings category="appearance" />);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByLabelText('테마')).toHaveProperty('value', 'system');
    expect(screen.getByTestId('personal-settings').getAttribute('data-category')).toBe('appearance');
  });

  it('테마의 실제 로드·저장 상태와 재시도를 연결한다', async () => {
    const retry = vi.fn();
    const view = render(
      <PersonalSettings category="appearance" themeLoadState={{ state: 'loading' }} />,
    );
    expect(screen.getByLabelText('테마')).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toContain('테마 설정을 불러오는 중…');

    view.rerender(
      <PersonalSettings
        category="appearance"
        themeLoadState={{ state: 'ready' }}
        themeSaveState={{ state: 'error', onRetry: retry }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('마지막 저장값으로 복원했습니다');
    await userEvent.click(screen.getByRole('button', { name: '테마 저장 다시 시도' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('SEC-AUTH-018 — #62 비밀번호 변경 폼', () => {
  it('공용 필드, 정확한 native 속성, 영향 경고와 명시 제출을 제공한다', () => {
    render(<PasswordChangeForm onSubmit={vi.fn()} />);
    const form = screen.getByTestId('password-change-form');
    const current = screen.getByLabelText('현재 비밀번호');
    const next = screen.getByLabelText('새 비밀번호');

    expect(within(form).getByRole('status').textContent).toContain('모든 세션과 모든 액세스 토큰');
    expect(current).toMatchObject({ type: 'password', name: 'current', autocomplete: 'current-password' });
    expect(next).toMatchObject({ type: 'password', name: 'next', autocomplete: 'new-password' });
    expect(current.getAttribute('data-slot')).toBe('input');
    expect(next.getAttribute('data-slot')).toBe('input');
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' }).getAttribute('data-slot')).toBe('button');
  });

  it('같은 tick 재진입을 막고 Promise 동안 pending 상태를 유지한다', async () => {
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<PasswordChangeForm onSubmit={submit} />);
    const form = screen.getByTestId('password-change-form');

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(submit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '변경 중…' })).toHaveProperty('disabled', true);
    expect(form.getAttribute('aria-busy')).toBe('true');
    finish();
    await waitFor(() => expect(form.getAttribute('aria-busy')).toBeNull());
  });

  it.each([
    ['rejected request', () => Promise.reject(new Error('secret stack'))],
    ['unknown returned rule', () => Promise.resolve('future-rule')],
    ['missing callback', undefined],
  ])('%s는 안전한 일반 오류만 보인다', async (_name, onSubmit) => {
    render(<PasswordChangeForm {...(onSubmit === undefined ? {} : { onSubmit })} />);
    fireEvent.submit(screen.getByTestId('password-change-form'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하십시오.');
    expect(alert.textContent).not.toMatch(/future-rule|secret stack|계정을 찾을 수 없습니다/);
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toHaveProperty('disabled', false);
  });

  it('알려진 필드 오류를 입력과 연결하고 수정하면 오래된 오류를 지운다', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm onSubmit={vi.fn().mockResolvedValue('wrong-password')} />);
    const current = screen.getByLabelText('현재 비밀번호');
    await user.type(current, '틀린 값');
    await user.type(screen.getByLabelText('새 비밀번호'), '새 값');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    const alert = await screen.findByRole('alert');
    expect(current.getAttribute('aria-invalid')).toBe('true');
    const described = document.getElementById(current.getAttribute('aria-describedby')!);
    expect(described?.contains(alert)).toBe(true);
    expect(document.activeElement).toBe(current);

    await user.type(current, '수정');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(current.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('React 이벤트 없는 DOM 자동완성 값도 제출 순간 그대로 보낸다', async () => {
    const submit = vi.fn().mockResolvedValue('wrong-password');
    render(<PasswordChangeForm onSubmit={submit} />);
    const current = screen.getByLabelText('현재 비밀번호') as HTMLInputElement;
    const next = screen.getByLabelText('새 비밀번호') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

    setter.call(current, '자동완성-현재');
    setter.call(next, '자동완성-새값');
    fireEvent.submit(screen.getByTestId('password-change-form'));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      current: '자동완성-현재',
      next: '자동완성-새값',
    }));
  });

  it('조합 확정 Enter는 제출하지 않고 뒤의 의도한 제출만 한 번 보낸다', async () => {
    const submit = vi.fn().mockResolvedValue('wrong-password');
    render(<PasswordChangeForm onSubmit={submit} />);
    const current = screen.getByLabelText('현재 비밀번호');

    fireEvent.compositionStart(current, { data: 'ㅎ' });
    const allowed = fireEvent.keyDown(current, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    expect(allowed).toBe(false);
    fireEvent.compositionEnd(current, { data: '한' });
    expect(submit).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByTestId('password-change-form'));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  });
});
