import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignupApproval } from '../src/principal/SignupApproval.js';
import { UserRoster } from '../src/principal/UserRoster.js';

afterEach(cleanup);

const users = [
  { id: 'pending-1', name: '대기자', status: 'pending' as const },
  { id: 'rejected-1', name: '거절자', status: 'rejected' as const },
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const scope = (overrides: Partial<{ principalId: string; authGeneration: number; categoryGeneration: number; queryGeneration: number }> = {}) => ({
  principalId: 'super-1',
  authGeneration: 1,
  categoryGeneration: 1,
  queryGeneration: 1,
  ...overrides,
});

describe('IR-PRINCIPAL-002 — 사용자 관리 요청 수명', () => {
  it('AC-1: loading/error는 authoritative empty로 그리지 않고 roster GET만 다시 시도한다', async () => {
    const retry = vi.fn();
    const { rerender } = render(<UserRoster roster={{ state: 'loading' }} />);

    expect(screen.getByRole('status').textContent).toContain('사용자 목록을 불러오는 중');
    expect(screen.queryByText('표시할 사용자 항목이 없습니다.')).toBeNull();

    rerender(<UserRoster roster={{ state: 'error', onRetry: retry }} />);
    expect(screen.queryByRole('row', { name: /대기자/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '사용자 목록 다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('AC-3/4: same-tick 제출은 하나이고 실패는 raw 값을 보존하며 실제 ID 성공만 비운다', async () => {
    const first = deferred<{ ok: false; kind: 'rejected' }>();
    const register = vi.fn(() => first.promise);
    const user = userEvent.setup();
    const { rerender } = render(<UserRoster users={users} onRegister={register} />);
    const name = screen.getByLabelText('새 사용자 이름') as HTMLInputElement;
    const password = screen.getByLabelText('임시 비밀번호') as HTMLInputElement;

    await user.type(name, ' 원값 ');
    await user.type(password, ' masked secret ');
    const button = screen.getByRole('button', { name: '등록' });
    await Promise.all([user.click(button), user.keyboard('{Enter}')]);
    expect(register).toHaveBeenCalledTimes(1);
    expect(name.readOnly).toBe(true);
    expect(password.readOnly).toBe(true);

    first.resolve({ ok: false, kind: 'rejected' });
    expect((await screen.findByRole('alert')).textContent).toContain('사용자를 등록하지 못했습니다');
    expect(name.value).toBe(' 원값 ');
    expect(password.value).toBe(' masked secret ');

    const accepted = vi.fn(async () => ({ ok: true as const, id: 'actual-id', refreshFailed: true }));
    rerender(<UserRoster users={users} onRegister={accepted} />);
    await user.click(screen.getByRole('button', { name: '등록' }));
    expect(await screen.findByText('사용자를 등록했습니다.')).toBeDefined();
    expect(name.value).toBe('');
    expect(password.value).toBe('');
    expect(screen.getByText(/목록을 새로 불러오지 못했습니다/)).toBeDefined();
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it('AC-3/9: uncertain registration stays locked through loading/error and unlocks only on a newer ready snapshot', async () => {
    const retry = vi.fn();
    const register = vi.fn(async () => ({ ok: false as const, kind: 'uncertain' as const }));
    const user = userEvent.setup();
    const { rerender } = render(<UserRoster roster={{ state: 'ready', users, revision: 1, onRetry: retry }} onRegister={register} />);
    await user.type(screen.getByLabelText('새 사용자 이름'), 'raw');
    await user.type(screen.getByLabelText('임시 비밀번호'), 'secret');
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '사용자 목록 새로 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<UserRoster roster={{ state: 'loading', revision: 1 }} onRegister={register} />);
    expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<UserRoster roster={{ state: 'error', revision: 1, onRetry: retry }} onRegister={register} />);
    expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<UserRoster roster={{ state: 'ready', users: [...users], revision: 1, onRetry: retry }} onRegister={register} />);
    expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    rerender(<UserRoster roster={{ state: 'ready', users: [...users], revision: 2, onRetry: retry }} onRegister={register} />);
    await waitFor(() => expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(false));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('AC-8: stale registration completion cannot clear fields or publish a notice', async () => {
    const pending = deferred<{ ok: true; id: string; refreshFailed: false }>();
    const user = userEvent.setup();
    const { rerender } = render(<UserRoster users={users} requestContext={scope()} onRegister={() => pending.promise} />);
    const name = screen.getByLabelText('새 사용자 이름') as HTMLInputElement;
    const password = screen.getByLabelText('임시 비밀번호') as HTMLInputElement;
    await user.type(name, 'captured-name');
    await user.type(password, 'captured-password');
    await user.click(screen.getByRole('button', { name: '등록' }));

    rerender(<UserRoster users={users} requestContext={scope({ authGeneration: 2, queryGeneration: 2 })} onRegister={() => pending.promise} />);
    pending.resolve({ ok: true, id: 'created-id', refreshFailed: false });

    await waitFor(() => expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(false));
    expect(name.value).toBe('captured-name');
    expect(password.value).toBe('captured-password');
    expect(screen.queryByText('사용자를 등록했습니다.')).toBeNull();
  });
});

describe('IR-PRINCIPAL-002 — 가입 승인 요청 수명', () => {
  it('AC-1/2: roster와 mode 오류를 독립 표시하고 nonempty queue는 mode와 무관하다', async () => {
    const rosterRetry = vi.fn();
    const modeRetry = vi.fn();
    const { rerender } = render(
      <SignupApproval roster={{ state: 'ready', users }} signupModeQuery={{ state: 'error', onRetry: modeRetry }} />,
    );

    expect(screen.getByRole('tab', { name: '대기 중 (1)' })).toBeDefined();
    expect(screen.getByRole('row', { name: /대기자/ })).toBeDefined();
    expect(screen.getByText('가입 모드를 불러오지 못했습니다.')).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: '가입 모드 다시 불러오기' }));
    expect(modeRetry).toHaveBeenCalledTimes(1);

    rerender(<SignupApproval roster={{ state: 'error', onRetry: rosterRetry }} signupModeQuery={{ state: 'ready', mode: 'approval' }} />);
    expect(screen.queryByRole('row', { name: /대기자/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '가입 승인 목록 다시 불러오기' }));
    expect(rosterRetry).toHaveBeenCalledTimes(1);
  });

  it('AC-5/6/7: reject는 확인 없이 한 번 쓰고 fresh rejected snapshot 뒤 exact-ID undo만 연다', async () => {
    const reject = vi.fn(async () => ({ ok: true as const, refreshFailed: true }));
    const reopen = vi.fn(async () => ({ ok: true as const, refreshFailed: false }));
    const user = userEvent.setup();
    const { rerender } = render(<SignupApproval users={users} onStatus={reject} onReopen={reopen} />);

    await user.click(within(screen.getByRole('row', { name: /대기자/ })).getByRole('button', { name: '대기자 거절' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(reject).toHaveBeenCalledWith('pending-1', 'rejected');
    expect(reject).toHaveBeenCalledTimes(1);
    expect(screen.getByText('가입을 거절했습니다.')).toBeDefined();
    expect((screen.getByRole('button', { name: '실행취소' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/목록을 새로 불러와야 실행취소할 수 있습니다/)).toBeDefined();

    rerender(<SignupApproval users={[{ ...users[0]!, status: 'rejected' }, users[1]!]} onStatus={reject} onReopen={reopen} />);
    const undo = screen.getByRole('button', { name: '실행취소' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    await user.click(undo);
    await waitFor(() => expect(reopen).toHaveBeenCalledWith('pending-1'));
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('재심사 대상으로 되돌렸습니다.')).toBeDefined();
  });

  it('AC-7: accepted write 뒤 roster error에서도 성공 receipt와 GET retry를 함께 보존한다', async () => {
    const accepted = deferred<{ ok: true; refreshFailed: true }>();
    const retry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<SignupApproval users={users} onApprove={() => accepted.promise} />);
    await user.click(screen.getByRole('button', { name: '대기자 승인' }));

    rerender(<SignupApproval roster={{ state: 'error', onRetry: retry }} onApprove={() => accepted.promise} />);
    accepted.resolve({ ok: true, refreshFailed: true });

    expect(await screen.findByText('가입을 승인했습니다.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '가입 승인 목록 다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('AC-5: snapshot status와 ID별 동기 guard를 지키고 unrelated ID는 독립 실행한다', async () => {
    const one = deferred<{ ok: true; refreshFailed: false }>();
    const approve = vi.fn((id: string) => id === 'pending-1' ? one.promise : Promise.resolve({ ok: true as const, refreshFailed: false as const }));
    const user = userEvent.setup();
    render(<SignupApproval users={[...users, { id: 'pending-2', name: '둘째', status: 'pending' }]} onApprove={approve} onStatus={async () => ({ ok: true, refreshFailed: false })} />);

    const first = within(screen.getByRole('row', { name: /대기자/ })).getByRole('button', { name: '대기자 승인' });
    await Promise.all([user.click(first), user.click(first)]);
    expect((first as HTMLButtonElement).disabled).toBe(true);
    expect(first.textContent).toBe('승인 중');
    expect(first.getAttribute('aria-busy')).toBe('true');
    const siblingReject = within(screen.getByRole('row', { name: /대기자/ })).getByRole('button', { name: '대기자 거절' }) as HTMLButtonElement;
    expect(siblingReject.disabled).toBe(true);
    expect(siblingReject.getAttribute('aria-busy')).not.toBe('true');
    expect(siblingReject.textContent).toBe('거절');
    await user.click(within(screen.getByRole('row', { name: /둘째/ })).getByRole('button', { name: '둘째 승인' }));
    expect(approve.mock.calls).toEqual([['pending-1'], ['pending-2']]);
    one.resolve({ ok: true, refreshFailed: false });
  });

  it('AC-5: reject 실행 중 sibling approve는 disabled만 되고 busy 문구를 빌리지 않는다', async () => {
    const pending = deferred<{ ok: true; refreshFailed: false }>();
    const user = userEvent.setup();
    render(<SignupApproval users={users} onApprove={async () => ({ ok: true, refreshFailed: false })} onStatus={() => pending.promise} />);

    const row = screen.getByRole('row', { name: /대기자/ });
    const reject = within(row).getByRole('button', { name: '대기자 거절' }) as HTMLButtonElement;
    const approve = within(row).getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement;
    await user.click(reject);

    expect(reject.disabled).toBe(true);
    expect(reject.getAttribute('aria-busy')).toBe('true');
    expect(reject.textContent).toBe('처리 중');
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute('aria-busy')).not.toBe('true');
    expect(approve.textContent).toBe('승인');
    pending.resolve({ ok: true, refreshFailed: false });
  });

  it('AC-8/10: stale row completion cannot publish notice or move focus after request context changes', async () => {
    const pending = deferred<{ ok: true; refreshFailed: false }>();
    const user = userEvent.setup();
    const approve = vi.fn(() => pending.promise);
    const { rerender } = render(<SignupApproval users={users} requestContext={scope()} onApprove={approve} />);
    const trigger = screen.getByRole('button', { name: '대기자 승인' });
    trigger.focus();
    await user.click(trigger);

    rerender(<SignupApproval users={users} requestContext={scope({ categoryGeneration: 2 })} onApprove={approve} />);
    const safeFocus = screen.getByRole('tab', { name: /대기 중/ });
    safeFocus.focus();
    pending.resolve({ ok: true, refreshFailed: false });

    await waitFor(() => expect((screen.getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText('가입을 승인했습니다.')).toBeNull();
    expect(document.activeElement).toBe(safeFocus);
  });

  it('AC-7/9: uncertain row result blocks another write until an explicit roster reconciliation', async () => {
    const retry = vi.fn();
    const approve = vi.fn(async () => ({ ok: false as const, kind: 'uncertain' as const }));
    const user = userEvent.setup();
    const { rerender } = render(<SignupApproval roster={{ state: 'ready', users, onRetry: retry }} onApprove={approve} />);

    await user.click(screen.getByRole('button', { name: '대기자 승인' }));
    expect((screen.getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '목록 새로 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);

    rerender(<SignupApproval roster={{ state: 'ready', users: [...users], onRetry: retry }} onApprove={approve} />);
    await waitFor(() => expect((screen.getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('AC-10: 제거된 focused row만 stable order의 다음 action으로 초점을 복원한다', async () => {
    const pending = deferred<{ ok: true; refreshFailed: false }>();
    const approve = vi.fn(() => pending.promise);
    const initial = [
      { id: 'p1', name: '첫째', status: 'pending' as const },
      { id: 'p2', name: '둘째', status: 'pending' as const },
    ];
    const { rerender } = render(<SignupApproval users={initial} onApprove={approve} />);
    const first = screen.getByRole('button', { name: '첫째 승인' });
    first.focus();
    first.click();

    rerender(<SignupApproval users={[initial[1]!]} onApprove={approve} />);
    pending.resolve({ ok: true, refreshFailed: false });

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '둘째 승인' })));
  });

  it('AC-10: App callback이 authoritative refresh를 먼저 반영해도 다음 stable-ID action으로 복원한다', async () => {
    const initial = [
      { id: 'p1', name: '첫째', status: 'pending' as const },
      { id: 'p2', name: '둘째', status: 'pending' as const },
    ];
    const Flow = () => {
      const [current, setCurrent] = useState(initial);
      return <SignupApproval users={current} onApprove={async (id) => {
        setCurrent((rows) => rows.filter((row) => row.id !== id));
        await Promise.resolve();
        return { ok: true, refreshFailed: false } as const;
      }} />;
    };
    const user = userEvent.setup();
    render(<Flow />);
    const first = screen.getByRole('button', { name: '첫째 승인' });
    first.focus();
    await user.click(first);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '둘째 승인' })));
  });
});
