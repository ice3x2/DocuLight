import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { WorkspaceManagementPanel, type WorkspaceRowView } from '../src/workspace/WorkspaceList.js';

afterEach(cleanup);

describe('IR-WORKSPACE-001 — 생성 surface의 parent-owned 완료 전환', () => {
  it('201 뒤 목록으로 돌아가 반환 ID 행의 관리 동작에 초점을 둔다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { id: 'u1', name: '한범', kind: 'user', status: 'active' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))));

    function Owner() {
      const [rows, setRows] = useState<readonly WorkspaceRowView[]>([{ id: 'w1', name: '기존 공간', adminless: false }]);
      const [selectedId, setSelectedId] = useState('w1');
      return <WorkspaceManagementPanel mode="all" query={{ state: 'ready', rows }} selectedId={selectedId}
        onSelect={setSelectedId} onLoadCreationWarnings={vi.fn().mockResolvedValue([])}
        onCreate={async () => {
          const workspace = { id: 'w2', name: '새 공간', createdAt: '2026-09-18' };
          setRows((current) => [...current, { id: workspace.id, name: workspace.name, adminless: false }]);
          setSelectedId(workspace.id);
          return { workspace };
        }} />;
    }

    render(<Owner />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '새 워크스페이스' }));
    await user.type(screen.getByLabelText('이름 (필수)'), '새 공간');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
    await user.click(await screen.findByText('한범'));
    await user.click(screen.getByRole('button', { name: '만들기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    const action = await screen.findByRole('button', { name: '새 공간' });
    await waitFor(() => expect(document.activeElement).toBe(action));
    expect(screen.queryByRole('form', { name: '새 워크스페이스' })).toBeNull();
  });

  it('accepted 201 뒤 all-list refetch 실패도 accepted 상태·재시도·fallback 초점을 보존한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { id: 'u1', name: '한범', kind: 'user', status: 'active' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))));
    const retry = vi.fn();
    const posted = vi.fn();
    function Owner() {
      const [failed, setFailed] = useState(false);
      const [status, setStatus] = useState<{ kind: 'refresh-error'; message: string }>();
      return <WorkspaceManagementPanel mode="all"
        query={failed ? { state: 'error', onRetry: retry } : { state: 'ready', rows: [{ id: 'w1', name: '기존 공간', adminless: false }] }}
        onLoadCreationWarnings={vi.fn().mockResolvedValue([])} creationStatus={status}
        onRetryCreationRefresh={retry} onCreate={async () => {
          posted();
          setTimeout(() => {
            setStatus({ kind: 'refresh-error', message: '워크스페이스를 만들었습니다. 목록을 새로 불러오지 못했습니다.' });
            setFailed(true);
          }, 0);
          return { workspace: { id: 'w2', name: '새 공간', createdAt: '2026-09-18' } };
        }} />;
    }
    render(<Owner />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '새 워크스페이스' }));
    await user.type(screen.getByLabelText('이름 (필수)'), '새 공간');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
    await user.click(await screen.findByText('한범'));
    await user.click(screen.getByRole('button', { name: '만들기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    const retryRefresh = await screen.findByRole('button', { name: '목록 다시 불러오기' });
    expect(screen.getByText(/워크스페이스를 만들었습니다.*목록을 새로/)).toBeTruthy();
    expect(screen.getByText('워크스페이스를 불러오지 못했습니다.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(retryRefresh));
    expect(posted).toHaveBeenCalledOnce();
    await user.click(retryRefresh);
    expect(retry).toHaveBeenCalledOnce();
    expect(posted).toHaveBeenCalledOnce();
  });

  it('accepted ID 행이 없거나 유일 static 행이면 생성 상태로 초점을 대체한다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { id: 'u1', name: '한범', kind: 'user', status: 'active' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))));
    function Owner() {
      const [accepted, setAccepted] = useState(false);
      return <WorkspaceManagementPanel mode="all" selectedId={accepted ? 'w2' : undefined}
        query={{ state: 'ready', rows: accepted ? [{ id: 'w2', name: '새 공간', adminless: false }] : [{ id: 'w1', name: '기존 공간', adminless: false }] }}
        creationStatus={accepted ? { kind: 'success', message: '워크스페이스를 만들었습니다.' } : undefined}
        onLoadCreationWarnings={vi.fn().mockResolvedValue([])} onCreate={async () => {
          setAccepted(true);
          return { workspace: { id: 'w2', name: '새 공간', createdAt: '2026-09-18' } };
        }} />;
    }
    render(<Owner />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '새 워크스페이스' }));
    await user.type(screen.getByLabelText('이름 (필수)'), '새 공간');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
    await user.click(await screen.findByText('한범'));
    await user.click(screen.getByRole('button', { name: '만들기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    const status = await screen.findByRole('status', { name: '워크스페이스 생성 결과' });
    await waitFor(() => expect(document.activeElement).toBe(status));
  });
});
