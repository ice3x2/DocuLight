import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ShareRow } from '../src/api/client.js';
import { WorkspaceAdminRevokeDialog } from '../src/workspace/WorkspaceAdminRevokeDialog.js';
import { WorkspaceManagementPanel } from '../src/workspace/WorkspaceList.js';

const workspace = { id: 'ws-1', name: '긴 기획 워크스페이스' };
const administrator: ShareRow = {
  entryId: 'entry-direct-admin',
  principalId: 'user-admin',
  principalName: '김 관리자',
  principalKind: 'user',
  level: 'admin',
  inherited: false,
  source: null,
};
const rows = [{ ...workspace, adminless: false }];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

describe('IR-WORKSPACE-001 AC-3 workspace administrator revoke', () => {
  it('loads fresh warnings by direct entry ID and permits the last administrator in one L2', async () => {
    const warnings = vi.fn().mockResolvedValue(['last-administrator']);
    const revoke = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(<WorkspaceAdminRevokeDialog open workspace={workspace} administrator={administrator}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={close} />);

    expect(screen.getByText('회수 영향을 확인하는 중입니다.')).toBeTruthy();
    expect(await screen.findByText(/마지막 관리 권한자/)).toBeTruthy();
    expect(warnings).toHaveBeenCalledWith('entry-direct-admin');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '관리 권한 회수' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('ws-1', 'entry-direct-admin'));
    expect(close).toHaveBeenCalledWith({ workspaceId: 'ws-1', entryId: 'entry-direct-admin' });
  });

  it('cancels without mutation and restores the row action focus', async () => {
    const restore = createRef<HTMLButtonElement>();
    const revoke = vi.fn();
    render(<><button ref={restore}>김 관리자 회수 열기</button>
      <WorkspaceAdminRevokeDialog open workspace={workspace} administrator={administrator}
        restoreFocusRef={restore} onLoadWarnings={vi.fn().mockResolvedValue([])}
        onRevoke={revoke} onClose={vi.fn()} /></>);

    await screen.findByText(/직접 지정된 관리 권한/);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(restore.current));
    expect(revoke).not.toHaveBeenCalled();
  });

  it('ignores late warning and mutation completions after target generation changes', async () => {
    const oldWarnings = deferred<readonly []>();
    const mutation = deferred<void>();
    const warnings = vi.fn().mockImplementationOnce(() => oldWarnings.promise).mockResolvedValue([]);
    const revoke = vi.fn(() => mutation.promise);
    const close = vi.fn();
    const view = render(<WorkspaceAdminRevokeDialog open workspace={workspace} administrator={administrator}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={close} />);
    const other = { ...administrator, entryId: 'entry-other', principalId: 'user-other', principalName: '다른 관리자' };
    view.rerender(<WorkspaceAdminRevokeDialog open workspace={workspace} administrator={other}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={close} />);
    expect(await screen.findByText(/다른 관리자/)).toBeTruthy();
    await act(async () => oldWarnings.resolve([]));
    fireEvent.click(screen.getByRole('button', { name: '관리 권한 회수' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '회수 중…' }));
    view.rerender(<WorkspaceAdminRevokeDialog open workspace={{ id: 'ws-2', name: '다른 공간' }} administrator={administrator}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={close} />);
    await act(async () => mutation.resolve());
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps revoke locked on warning failure and retries GET without DELETE', async () => {
    const warnings = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const revoke = vi.fn();
    render(<WorkspaceAdminRevokeDialog open workspace={workspace} administrator={administrator}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={vi.fn()} />);
    expect(await screen.findByText('회수 영향을 확인하지 못했습니다.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '관리 권한 회수' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    await screen.findByText(/직접 지정된 관리 권한/);
    expect(warnings).toHaveBeenCalledTimes(2);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revalidates warnings before DELETE and requires explicit review when last-admin state changed', async () => {
    const warnings = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['last-administrator'])
      .mockResolvedValueOnce(['last-administrator']);
    const revoke = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceAdminRevokeDialog open workspace={workspace} administrator={administrator}
      onLoadWarnings={warnings} onRevoke={revoke} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '관리 권한 회수' }));

    expect(await screen.findByText('경고 내용이 바뀌었습니다. 새 내용을 확인하세요.')).toBeTruthy();
    expect(screen.getByText(/마지막 관리 권한자/)).toBeTruthy();
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '새 내용 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '관리 권한 회수' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    expect(warnings).toHaveBeenCalledTimes(3);
  });

  it('opens revoke from the direct administrator row and separates cancel from accepted refresh', async () => {
    const loadWarnings = vi.fn().mockResolvedValue([]);
    const revoke = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [administrator] }}
      onLoadAdminRevokeWarnings={loadWarnings} onRevokeAdministrator={revoke}
      onAdministratorsRefresh={refresh} />);
    const section = screen.getByRole('region', { name: '워크스페이스 관리자' });
    fireEvent.click(within(section).getByRole('button', { name: '김 관리자 관리 권한 회수' }));
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    expect(revoke).not.toHaveBeenCalled();

    fireEvent.click(within(section).getByRole('button', { name: '김 관리자 관리 권한 회수' }));
    fireEvent.click(await screen.findByRole('button', { name: '관리 권한 회수' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(revoke).toHaveBeenCalledWith('ws-1', 'entry-direct-admin');
  });

  it('preserves accepted DELETE when refresh fails and retries GET without replaying DELETE', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockRejectedValueOnce(new Error('read')).mockResolvedValueOnce(undefined);
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [administrator] }}
      onLoadAdminRevokeWarnings={vi.fn().mockResolvedValue([])}
      onRevokeAdministrator={revoke} onAdministratorsRefresh={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: '김 관리자 관리 권한 회수' }));
    fireEvent.click(await screen.findByRole('button', { name: '관리 권한 회수' }));
    expect(await screen.findByText(/회수했지만 목록을 새로 불러오지 못했습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('keeps parent-owned accepted status after self-revoke removes the selected detail and focuses it', async () => {
    const { rerender } = render(<WorkspaceManagementPanel mode="managed"
      query={{ state: 'ready', rows }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [administrator] }}
      administratorMutationStatus={{ kind: 'success', message: '관리 권한을 회수했습니다.' }} />);
    rerender(<WorkspaceManagementPanel mode="managed"
      query={{ state: 'ready', rows: [] }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [] }}
      administratorMutationStatus={{ kind: 'success', message: '관리 권한을 회수했습니다.' }} />);

    const status = screen.getByText('관리 권한을 회수했습니다.').closest('[data-workspace-admin-mutation-status]');
    expect(status).toBeTruthy();
    expect(screen.queryByLabelText('표시 이름')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(status));
  });

  it('clears the protected dialog and reports authentication loss on DELETE 401', async () => {
    const lost = vi.fn();
    const restore = createRef<HTMLButtonElement>();
    render(<><button ref={restore}>회수 열기</button><WorkspaceAdminRevokeDialog open workspace={workspace}
      administrator={administrator} restoreFocusRef={restore}
      onLoadWarnings={vi.fn().mockResolvedValue([])}
      onRevoke={vi.fn().mockRejectedValue(new ApiError(401))}
      onAuthenticationLoss={lost} onClose={vi.fn()} /></>);
    fireEvent.click(await screen.findByRole('button', { name: '관리 권한 회수' }));
    await waitFor(() => expect(lost).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(restore.current));
  });
});
