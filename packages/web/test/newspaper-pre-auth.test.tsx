import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { PreAuthScreen } from '../src/auth/PreAuthScreen.js';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

describe('IR-SHELL-009 AC-4 — 로그인·가입 신문지 전체 화면', () => {
  it('제품명, 제목과 브라우저 기하 검증용 인증 열을 제공한다', () => {
    render(<PreAuthScreen screen="login" onLogin={async () => undefined} onScreen={() => undefined} />);

    const main = screen.getByRole('main', { name: '로그인' });
    expect(main.getAttribute('data-pre-auth')).toBe('login');
    expect(main.querySelector('[data-pre-auth-column]')).not.toBeNull();
    expect(screen.getByText('DocuLight').getAttribute('data-pre-auth-product')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '로그인' })).toBeDefined();
    expect(screen.getByLabelText('이름').getAttribute('data-slot')).toBe('input');
    expect(screen.getByLabelText('비밀번호').getAttribute('data-slot')).toBe('input');
    expect(screen.getByRole('button', { name: '로그인' }).getAttribute('data-slot')).toBe('button');
    expect(screen.getByRole('button', { name: '가입 신청하기' }).getAttribute('type')).toBe('button');
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
    expect(document.querySelector('[data-shell="settings-corner"]')).toBeNull();
  });

  it('대체 화면 조작은 submit 없이 양방향 onScreen을 호출한다', async () => {
    const destinations: string[] = [];
    let submissions = 0;
    const user = userEvent.setup();
    const { rerender } = render(
      <PreAuthScreen
        screen="login"
        onLogin={async () => void (submissions += 1)}
        onScreen={(screenId) => destinations.push(screenId)}
      />,
    );

    await user.click(screen.getByRole('button', { name: '가입 신청하기' }));
    expect(destinations).toEqual(['signup']);
    expect(submissions).toBe(0);

    rerender(
      <PreAuthScreen
        screen="signup"
        onSignup={async () => void (submissions += 1)}
        onScreen={(screenId) => destinations.push(screenId)}
      />,
    );
    await user.click(screen.getByRole('button', { name: '로그인하기' }));
    expect(destinations).toEqual(['signup', 'login']);
    expect(submissions).toBe(0);
  });

  it('화면마다 안정적인 필드 계약과 분리된 폼 identity를 제공한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PreAuthScreen screen="login" onLogin={async () => undefined} onScreen={() => undefined} />,
    );

    const loginName = screen.getByLabelText('이름');
    const loginPassword = screen.getByLabelText('비밀번호');
    expect(loginName.getAttribute('id')).toBe('login-name');
    expect(loginName.getAttribute('name')).toBe('name');
    expect(loginName.getAttribute('autocomplete')).toBe('username');
    expect(loginName.getAttribute('spellcheck')).toBe('false');
    expect(loginName.getAttribute('autocapitalize')).toBe('none');
    expect(loginPassword.getAttribute('id')).toBe('login-password');
    expect(loginPassword.getAttribute('name')).toBe('password');
    expect(loginPassword.getAttribute('type')).toBe('password');
    expect(loginPassword.getAttribute('autocomplete')).toBe('current-password');
    expect(document.activeElement).toBe(loginName);

    await user.type(loginPassword, 'departed-secret');
    rerender(
      <PreAuthScreen screen="signup" onSignup={async () => undefined} onScreen={() => undefined} />,
    );

    const signupName = screen.getByLabelText('이름');
    const signupPassword = screen.getByLabelText('비밀번호');
    expect(signupName.getAttribute('id')).toBe('signup-name');
    expect(signupPassword.getAttribute('id')).toBe('signup-password');
    expect(signupPassword.getAttribute('autocomplete')).toBe('new-password');
    expect((signupPassword as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(signupName);
    expect(signupName.hasAttribute('required')).toBe(false);
    expect(signupPassword.hasAttribute('required')).toBe(false);
    expect(signupPassword.hasAttribute('minlength')).toBe(false);
    expect(signupPassword.hasAttribute('pattern')).toBe(false);
  });
});

describe('IR-SHELL-006 AC-5..7 — 인증 폼 상태와 제출', () => {
  it('콜백이 없으면 성공을 꾸미지 않고 제출을 막는다', () => {
    render(<PreAuthScreen screen="login" onScreen={() => undefined} />);

    expect((screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('지금은 요청을 보낼 수 없습니다.');
  });

  it('pending 동안 한 번만 보내고 편집 뒤 돌아온 예전 결과는 표시하지 않는다', async () => {
    const request = deferred<string>();
    const calls: Array<{ name: string; password: string }> = [];
    const user = userEvent.setup();
    render(
      <PreAuthScreen
        screen="login"
        onLogin={(input) => {
          calls.push(input);
          return request.promise;
        }}
        onScreen={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('이름'), '신문 독자');
    await user.type(screen.getByLabelText('비밀번호'), '비밀 값');
    const form = screen.getByLabelText('이름').closest('form')!;
    act(() => {
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    });

    expect(calls).toEqual([{ name: '신문 독자', password: '비밀 값' }]);
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect((screen.getByRole('button', { name: '로그인 중…' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('이름') as HTMLInputElement).disabled).toBe(false);
    await user.type(screen.getByLabelText('이름'), ' 수정');

    request.resolve('수정 전 값에 대한 거절입니다.');
    await waitFor(() => expect(form.hasAttribute('aria-busy')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('신문 독자 수정');
  });

  it('안전한 거절문은 그대로 보이고 입력 수정 시 사라진다', async () => {
    const user = userEvent.setup();
    render(
      <PreAuthScreen
        screen="login"
        onLogin={async () => '승인 대기 중 — 슈퍼유저의 승인을 기다리십시오.'}
        onScreen={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('이름'), '대기자');
    await user.type(screen.getByLabelText('비밀번호'), 'secret');
    await user.click(screen.getByRole('button', { name: '로그인' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('승인 대기 중 — 슈퍼유저의 승인을 기다리십시오.');
    expect(alert.getAttribute('data-slot')).toBe('inline-notice');
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('대기자');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('secret');
    await user.type(screen.getByLabelText('이름'), '1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('throw/reject는 내부 문구를 숨기고 재시도를 연다', async () => {
    let attempts = 0;
    const user = userEvent.setup();
    render(
      <PreAuthScreen
        screen="login"
        onLogin={() => {
          attempts += 1;
          return Promise.reject(new Error('secret transport detail'));
        }}
        onScreen={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('이름'), '재시도 사용자');
    await user.type(screen.getByLabelText('비밀번호'), 'retry-password');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('요청을 처리하지 못했습니다. 잠시 후 다시 시도하십시오.');
    expect(alert.textContent).not.toContain('secret transport detail');
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('재시도 사용자');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('retry-password');
    expect((screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(attempts).toBe(2));
  });

  it('동기 throw도 내부 문구를 숨기고 guard를 해제한다', async () => {
    let attempts = 0;
    const user = userEvent.setup();
    render(
      <PreAuthScreen
        screen="login"
        onLogin={() => {
          attempts += 1;
          throw new Error('synchronous secret detail');
        }}
        onScreen={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      '요청을 처리하지 못했습니다. 잠시 후 다시 시도하십시오.',
    );
    expect(document.body.textContent).not.toContain('synchronous secret detail');
    expect((screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(attempts).toBe(2);
  });

  it.each([
    '승인 대기 중',
    '계정이 정지됨',
    '가입이 거절됨',
    '이름 또는 비밀번호가 올바르지 않습니다',
  ])('서버 안전 문구를 합치거나 바꾸지 않는다: %s', async (message) => {
    const user = userEvent.setup();
    render(
      <PreAuthScreen screen="login" onLogin={async () => message} onScreen={() => undefined} />,
    );
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
  });

  it('서버 문구는 HTML로 해석하지 않고 문자 그대로 표시한다', async () => {
    const supplied = '<img src=x onerror=alert(1)> 가입 거절';
    const user = userEvent.setup();
    render(
      <PreAuthScreen screen="login" onLogin={async () => supplied} onScreen={() => undefined} />,
    );
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect((await screen.findByRole('alert')).textContent).toContain(supplied);
    expect(document.querySelector('img')).toBeNull();
  });

  it('React 상태가 아닌 제출 시점의 native input 값을 그대로 보낸다', () => {
    const calls: Array<{ name: string; password: string }> = [];
    render(
      <PreAuthScreen
        screen="login"
        onLogin={async (input) => void calls.push(input)}
        onScreen={() => undefined}
      />,
    );

    const name = screen.getByLabelText('이름') as HTMLInputElement;
    const password = screen.getByLabelText('비밀번호') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(name, '  한글 사용자  ');
    setter.call(password, '  암호🔒  ');
    fireEvent.submit(name.form!);

    expect(calls).toEqual([{ name: '  한글 사용자  ', password: '  암호🔒  ' }]);
  });

  it('조합 중 Enter와 조합 종료 Enter는 막고 다음 Enter만 제출한다', () => {
    const calls: Array<{ name: string; password: string }> = [];
    render(
      <PreAuthScreen
        screen="login"
        onLogin={async (input) => void calls.push(input)}
        onScreen={() => undefined}
      />,
    );

    const name = screen.getByLabelText('이름');
    fireEvent.compositionStart(name);
    const composingEnter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composingEnter, 'isComposing', { value: true });
    Object.defineProperty(composingEnter, 'keyCode', { value: 229 });
    name.dispatchEvent(composingEnter);
    expect(composingEnter.defaultPrevented).toBe(true);
    fireEvent.compositionEnd(name, { data: '한' });
    const endingEnter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    name.dispatchEvent(endingEnter);
    expect(endingEnter.defaultPrevented).toBe(true);
    expect(calls).toHaveLength(0);

    const deliberateEnter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    name.dispatchEvent(deliberateEnter);
    expect(deliberateEnter.defaultPrevented).toBe(false);
    fireEvent.submit((name as HTMLInputElement).form!);
    expect(calls).toHaveLength(1);
  });

  it('떠난 화면의 늦은 완료가 새 화면에 상태나 자격증명을 칠하지 않는다', async () => {
    const request = deferred<string>();
    const { rerender } = render(
      <PreAuthScreen screen="signup" onSignup={() => request.promise} onScreen={() => undefined} />,
    );
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '떠난 가입자' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'departed-password' } });
    fireEvent.submit((screen.getByLabelText('이름') as HTMLInputElement).form!);

    rerender(<PreAuthScreen screen="login" onLogin={async () => undefined} onScreen={() => undefined} />);
    await act(async () => {
      request.resolve('떠난 화면의 거절');
      await request.promise;
      await Promise.resolve();
    });

    expect(screen.queryByText(/떠난 화면의 거절/)).toBeNull();
    expect(screen.queryByText(/가입 신청을 접수했습니다/)).toBeNull();
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('');
  });

  it('가입 성공은 모드를 단정하지 않는 지속 상태를 표시한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PreAuthScreen screen="signup" onSignup={async () => undefined} onScreen={() => undefined} />,
    );

    await user.type(screen.getByLabelText('이름'), '가입자');
    await user.type(screen.getByLabelText('비밀번호'), 'signup-password');
    await user.click(screen.getByRole('button', { name: '가입 신청' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      '가입 신청을 접수했습니다. 승인이 필요한 경우 슈퍼유저의 승인 후 로그인할 수 있습니다.',
    );
    rerender(<PreAuthScreen screen="signup" onSignup={async () => undefined} onScreen={() => undefined} />);
    expect(screen.getByRole('status').textContent).toContain('가입 신청을 접수했습니다.');
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('가입자');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('signup-password');
  });

  it('composition keyup 뒤 첫 deliberate Enter를 허용한다', () => {
    render(
      <PreAuthScreen screen="login" onLogin={async () => undefined} onScreen={() => undefined} />,
    );
    const name = screen.getByLabelText('이름');
    fireEvent.compositionStart(name);
    const composingEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composingEnter, 'isComposing', { value: true });
    Object.defineProperty(composingEnter, 'keyCode', { value: 229 });
    name.dispatchEvent(composingEnter);
    fireEvent.compositionEnd(name, { data: '한' });
    fireEvent.keyUp(name, { key: 'Enter' });
    const deliberateEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    name.dispatchEvent(deliberateEnter);
    expect(deliberateEnter.defaultPrevented).toBe(false);
  });

  it.each([{ label: 'candidate commit', data: '한' }, { label: 'cancel', data: '' }])(
    '$label 뒤의 첫 deliberate Enter를 허용한다',
    async ({ data }) => {
      render(<PreAuthScreen screen="login" onLogin={async () => undefined} onScreen={() => undefined} />);
      const name = screen.getByLabelText('이름');
      fireEvent.compositionStart(name);
      fireEvent.compositionEnd(name, { data });
      await Promise.resolve();
      const deliberateEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      name.dispatchEvent(deliberateEnter);
      expect(deliberateEnter.defaultPrevented).toBe(false);
    },
  );
});
