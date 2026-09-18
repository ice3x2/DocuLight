import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type PrincipalRow, type WorkspaceAdminGrantPreview } from '../src/api/client.js';
import { WorkspaceAdminGrantDialog } from '../src/workspace/WorkspaceAdminGrantDialog.js';
import { WorkspaceManagementPanel } from '../src/workspace/WorkspaceList.js';

vi.mock('../src/principal/PrincipalPicker.js', () => ({
  PrincipalPicker: ({ onPick }: { onPick?: (row: PrincipalRow) => void }) => <button type="button" onClick={() => onPick?.(principal)}>김 관리자 선택</button>,
}));

const principal: PrincipalRow = { id: 'user-2', name: '김 관리자', kind: 'user', status: 'active', system: false };
const preview = (token = 'token-1', count = 7): WorkspaceAdminGrantPreview => ({
  workspace: { id: 'ws-1', name: '아주 긴 기획 워크스페이스' },
  principal,
  level: 'admin', grade: 'L2', coverage: 'workspace-admin-gate', visibleDescendantCount: count,
  warnings: [], alreadyAssigned: false, previewToken: token, expiresAt: new Date(Date.now() + 300_000).toISOString(),
});
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };

describe('워크스페이스 관리자 부여 L2 (`IR-WORKSPACE-003`)', () => {
  it('기존 관리자 섹션에서 선택한 주체를 권위 있는 미리보기와 지정 동작에 연결한다', async () => {
    const load = vi.fn().mockResolvedValue(preview());
    const grant = vi.fn().mockResolvedValue({ entryId: 'entry-1', workspaceId: 'ws-1', principalId: principal.id, level: 'admin' });
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: [{ id: 'ws-1', name: '기획', adminless: true }] }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [] }} {...({ onLoadAdminGrantPreview: load, onGrantAdministrator: grant, onAdministratorsRefresh: refresh } as object)} />);
    fireEvent.click(screen.getByRole('button', { name: '김 관리자 선택' }));
    const add = screen.getByRole('button', { name: '관리자로 지정' });
    fireEvent.click(add);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '관리자 지정' }).at(-1)!);
    await waitFor(() => expect(grant).toHaveBeenCalledOnce());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(await screen.findByText('관리자로 지정했습니다.')).toBeTruthy();
  });

  it('열 때 새 미리보기를 읽고 로딩 중에는 취소만 허용하며 취소 초점을 복원한다', async () => {
    const pending = deferred<WorkspaceAdminGrantPreview>();
    const load = vi.fn(() => pending.promise);
    const grant = vi.fn();
    const restore = createRef<HTMLButtonElement>();
    render(<><button ref={restore}>관리자 추가</button><WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={principal} restoreFocusRef={restore} onLoad={load} onGrant={grant} onClose={vi.fn()} /></>);

    expect(screen.getByText('영향 범위를 확인하는 중입니다.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '관리자 지정' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '취소' }) as HTMLButtonElement).disabled).toBe(false);
    expect(load).toHaveBeenCalledWith('ws-1', 'user-2');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(restore.current));
    expect(grant).not.toHaveBeenCalled();
  });

  it('권위 있는 정체성·고정 관리·범위를 표시하고 한 번만 제출한다', async () => {
    const grant = vi.fn().mockResolvedValue({ entryId: 'entry-1', workspaceId: 'ws-1', principalId: 'user-2', level: 'admin' });
    render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={principal} onLoad={vi.fn().mockResolvedValue(preview())} onGrant={grant} onClose={vi.fn()} />);
    expect(await screen.findByText('현재 표시 가능한 적용 하위 노드 7개')).toBeTruthy();
    expect(screen.getByText(/상속이 끊긴 하위 항목에도 적용/)).toBeTruthy();
    expect(screen.getByText(/앞으로 추가되는 항목에도 관리 권한/)).toBeTruthy();
    expect(screen.getByText(/김 관리자/)).toBeTruthy();
    expect(screen.getByText('user-2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '관리자 지정' }));
    fireEvent.click(screen.getByRole('button', { name: /지정 중|관리자 지정/ }));
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    expect(grant).toHaveBeenCalledWith('ws-1', 'user-2', 'token-1');
  });

  it('미리보기 실패의 재시도는 읽기만 하고 409 뒤 새 결과를 명시적으로 확인해야 한다', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(preview('token-2', 8)).mockResolvedValueOnce(preview('token-3', 9));
    const grant = vi.fn().mockRejectedValueOnce(new ApiError(409, undefined, { rule: 'preview-stale' })).mockResolvedValue({ entryId: 'e', workspaceId: 'ws-1', principalId: 'user-2', level: 'admin' });
    render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={principal} onLoad={load} onGrant={grant} onClose={vi.fn()} />);
    expect(await screen.findByText('영향 범위를 확인하지 못했습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(await screen.findByText('현재 표시 가능한 적용 하위 노드 8개')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '관리자 지정' }));
    expect(await screen.findByText('정보가 바뀌었습니다. 갱신된 내용을 확인하세요.')).toBeTruthy();
    expect(await screen.findByText('현재 표시 가능한 적용 하위 노드 9개')).toBeTruthy();
    expect(grant).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '갱신된 내용 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '관리자 지정' }));
    await waitFor(() => expect(grant).toHaveBeenCalledTimes(2));
  });

  it('대상이 바뀌면 늦은 이전 미리보기 응답을 버린다', async () => {
    const old = deferred<WorkspaceAdminGrantPreview>();
    const load = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(preview('fresh', 2));
    const view = render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={principal} onLoad={load} onGrant={vi.fn()} onClose={vi.fn()} />);
    const next = { ...principal, id: 'user-3', name: '새 대상' };
    view.rerender(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={next} onLoad={load} onGrant={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('현재 표시 가능한 적용 하위 노드 2개')).toBeTruthy();
    await act(async () => old.resolve(preview('old', 99)));
    expect(screen.queryByText('현재 표시 가능한 적용 하위 노드 99개')).toBeNull();
  });

  it('표시 뒤 만료된 미리보기는 콜백 가드가 제출하지 않는다', async () => {
    const grant = vi.fn();
    const expiring = { ...preview(), expiresAt: new Date(Date.now() + 20).toISOString() };
    render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '기획' }} principal={principal} onLoad={vi.fn().mockResolvedValue(expiring)} onGrant={grant} onClose={vi.fn()} />);
    const action = await screen.findByRole('button', { name: '관리자 지정' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    fireEvent.click(action);
    expect(grant).not.toHaveBeenCalled();
  });

  it('성공한 미리보기의 권위 있는 현재 이름과 상태를 표시한다', async () => {
    const authoritative = { ...preview(), workspace: { id: 'ws-1', name: '서버에서 바뀐 이름' }, principal: { ...principal, name: '서버 현재 대상', status: 'suspended' as const }, warnings: ['suspended-subject' as const] };
    render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: '오래된 이름' }} principal={principal} onLoad={vi.fn().mockResolvedValue(authoritative)} onGrant={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/서버에서 바뀐 이름/)).toBeTruthy();
    expect(screen.getByText(/서버 현재 대상/)).toBeTruthy();
    expect(screen.getByText(/suspended/)).toBeTruthy();
  });
  it('ignores a late A mutation after A to B to A context cycling', async () => {
    const mutation = deferred<{ entryId: string; workspaceId: string; principalId: string; level: 'admin' }>();
    const close = vi.fn();
    const load = vi.fn().mockImplementation((_workspaceId: string, principalId: string) => Promise.resolve({ ...preview(`token-${principalId}`), principal: { ...principal, id: principalId } }));
    const view = render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: 'planning' }} principal={principal} onLoad={load} onGrant={() => mutation.promise} onClose={close} />);
    fireEvent.click(await screen.findByRole('button', { name: '관리자 지정' }));
    const other = { ...principal, id: 'user-3', name: 'other' };
    view.rerender(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: 'planning' }} principal={other} onLoad={load} onGrant={() => mutation.promise} onClose={close} />);
    view.rerender(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: 'planning' }} principal={principal} onLoad={load} onGrant={() => mutation.promise} onClose={close} />);
    await act(async () => mutation.resolve({ entryId: 'late', workspaceId: 'ws-1', principalId: principal.id, level: 'admin' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps committed success when refresh fails and retries reads without replaying POST', async () => {
    const grant = vi.fn().mockResolvedValue({ entryId: 'entry-1', workspaceId: 'ws-1', principalId: principal.id, level: 'admin' });
    const refresh = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce(undefined);
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: [{ id: 'ws-1', name: 'planning', adminless: true }] }} selectedId="ws-1"
      administrators={{ state: 'ready', rows: [] }} {...({ onLoadAdminGrantPreview: vi.fn().mockResolvedValue(preview()), onGrantAdministrator: grant, onAdministratorsRefresh: refresh } as object)} />);
    fireEvent.click(screen.getByRole('button', { name: '김 관리자 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '관리자로 지정' }));
    fireEvent.click(await screen.findByRole('button', { name: '관리자 지정' }));
    expect(await screen.findByText(/목록을 새로 불러오지 못했습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it('locks an expired displayed preview on its timer and offers a fresh preview', async () => {
      const load = vi.fn().mockResolvedValueOnce({ ...preview('short'), expiresAt: new Date(Date.now() + 20).toISOString() }).mockResolvedValueOnce(preview('fresh'));
      render(<WorkspaceAdminGrantDialog open workspace={{ id: 'ws-1', name: 'planning' }} principal={principal} onLoad={load} onGrant={vi.fn()} onClose={vi.fn()} />);
      await screen.findByText(/7개/);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
      expect((screen.getByRole('button', { name: '관리자 지정' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('미리보기 유효 시간이 끝났습니다. 다시 확인하세요.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
