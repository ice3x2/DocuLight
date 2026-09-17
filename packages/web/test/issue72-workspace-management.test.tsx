import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceManagementPanel } from '../src/workspace/WorkspaceList.js';

const rows = [
  { id: 'workspace-aaaaaaaa', name: '중복 이름', adminless: false },
  { id: 'workspace-bbbbbbbb', name: '중복 이름', adminless: true },
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

describe('워크스페이스 관리 화면 (`IR-WORKSPACE-001` AC-1 · AC-2 · AC-3 · AC-6 · AC-7)', () => {
  it('조회 중, 실패, 빈 목록을 서로 다른 실제 상태로 그린다', () => {
    const { rerender } = render(<WorkspaceManagementPanel mode="managed" query={{ state: 'loading' }} />);
    expect(screen.getByRole('status').textContent).toContain('관리 워크스페이스를 불러오는 중입니다.');

    const retry = vi.fn();
    rerender(<WorkspaceManagementPanel mode="managed" query={{ state: 'error', onRetry: retry }} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: [] }} />);
    expect(screen.getByText('관리 권한이 있는 워크스페이스가 없습니다.')).toBeTruthy();
  });

  it('중복 이름도 ID로 선택하고 서버 adminless 배지를 목록과 선택기에 유지한다', () => {
    const pick = vi.fn();
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[1]!.id} onSelect={pick} />);

    const list = screen.getByRole('list', { name: '관리 워크스페이스' });
    expect(within(list).getAllByText('중복 이름')).toHaveLength(2);
    expect(within(list).getByText('workspace-b')).toBeTruthy();
    expect(within(list).getByText('관리자 없음')).toBeTruthy();
    expect(within(list).getByText('관리자 없음').getAttribute('role')).toBeNull();
    fireEvent.click(within(list).getAllByRole('button')[0]!);
    expect(pick).toHaveBeenCalledWith(rows[0]!.id);
  });

  it('선택한 상세에서 표시 이름을 검증하고 조합 중 Enter 제출을 막는다', () => {
    const rename = vi.fn().mockResolvedValue({ workspace: { id: rows[0]!.id, name: '바뀐 이름', createdAt: '2026-01-01' }, sidecarSync: 'pending' });
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id} onRename={rename} />);

    const input = screen.getByLabelText('표시 이름');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(screen.getByText('표시 이름을 입력하세요.')).toBeTruthy();
    expect(rename).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '새 이름' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(rename).not.toHaveBeenCalled();
  });

  it('선택지가 하나뿐이면 선택 컨트롤 대신 읽기 전용 행으로 표시한다', () => {
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: [rows[0]!] }} selectedId={rows[0]!.id} />);

    const list = screen.getByRole('list', { name: '관리 워크스페이스' });
    expect(within(list).queryByRole('button')).toBeNull();
    expect(within(list).getByText(rows[0]!.name)).toBeTruthy();
    expect(within(list).getByText(rows[0]!.name).parentElement?.getAttribute('aria-current')).toBe('true');
  });

  it('직접 지정된 워크스페이스 관리자와 범위가 고정된 주체 검색을 표시한다', () => {
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id}
      administrators={{ state: 'ready', rows: [{ entryId: 'entry-1', principalId: 'user-1', principalName: '김관리', principalKind: 'user', level: 'admin', inherited: false, source: null }] }} />);

    expect(screen.getByText('김관리')).toBeTruthy();
    expect(screen.getByLabelText('사용자·그룹 검색')).toBeTruthy();
    expect(screen.getByText(/권위 있는 영향 범위 확인/)).toBeTruthy();
  });

  it('긴 공통 접두사의 중복 이름 ID를 고유해질 때까지 늘려 표시한다', () => {
    const samePrefix = [
      { id: 'workspace-shared-prefix-aaaa', name: '같은 이름', adminless: false },
      { id: 'workspace-shared-prefix-bbbb', name: '같은 이름', adminless: false },
    ];
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: samePrefix }} selectedId={samePrefix[0]!.id} />);

    expect(screen.getByText('workspace-shared-prefix-a')).toBeTruthy();
    expect(screen.getByText('workspace-shared-prefix-b')).toBeTruthy();
  });

  it('A 개명 응답이 늦게 와도 B의 초안·상태를 바꾸지 않는다', async () => {
    const gate = deferred<{ workspace: { id: string; name: string; createdAt: string }; sidecarSync: 'pending' }>();
    const rename = vi.fn(() => gate.promise);
    const { rerender } = render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id} onRename={rename} />);
    fireEvent.change(screen.getByLabelText('표시 이름'), { target: { value: 'A 새 이름' } });
    fireEvent.submit(screen.getByRole('form', { name: /표시 이름 변경/ }));

    rerender(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[1]!.id} onRename={rename} />);
    expect((screen.getByLabelText('표시 이름') as HTMLInputElement).value).toBe(rows[1]!.name);
    await act(async () => gate.resolve({ workspace: { id: rows[0]!.id, name: 'A 새 이름', createdAt: '2026-01-01' }, sidecarSync: 'pending' }));

    expect((screen.getByLabelText('표시 이름') as HTMLInputElement).value).toBe(rows[1]!.name);
    expect(screen.queryByText(/재구성 사본 갱신이 대기/)).toBeNull();
  });

  it('같은 ID의 서버 이름이 바뀌면 더러운 초안을 보존하고 검토를 요구한다', () => {
    const { rerender } = render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id} onRename={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('표시 이름'), { target: { value: '내 초안' } });
    const changed = [{ ...rows[0]!, name: '서버에서 변경됨' }, rows[1]!];
    rerender(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: changed }} selectedId={rows[0]!.id} onRename={vi.fn()} />);

    expect((screen.getByLabelText('표시 이름') as HTMLInputElement).value).toBe('내 초안');
    expect(screen.getByRole('alert').textContent).toContain('서버에서 변경됨');
    expect((screen.getByRole('button', { name: '변경' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '현재 초안 계속 사용' }));
    expect((screen.getByRole('button', { name: '변경' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('선택 권한이 사라지면 다른 행으로 바꾸지 않고 중립 안내에 초점을 둔다', async () => {
    const pick = vi.fn();
    const { rerender } = render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id} onSelect={pick} />);
    rerender(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows: [rows[1]!] }} selectedId={rows[0]!.id} onSelect={pick} />);

    const notice = screen.getByText('선택한 워크스페이스를 더 이상 관리할 수 없습니다.');
    await waitFor(() => expect(document.activeElement).toBe(notice));
    expect(screen.queryByLabelText('표시 이름')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(rows[1]!.name) }));
    expect(pick).toHaveBeenCalledWith(rows[1]!.id);
  });

  it('도움말과 검증 오류를 표시 이름 필드에 직접 연결한다', () => {
    render(<WorkspaceManagementPanel mode="managed" query={{ state: 'ready', rows }} selectedId={rows[0]!.id} onRename={vi.fn()} />);
    const input = screen.getByLabelText('표시 이름');
    fireEvent.change(input, { target: { value: ' ' } });
    fireEvent.blur(input);
    const help = screen.getByText(/저장 위치는 바뀌지 않습니다/);
    const error = screen.getByText('표시 이름을 입력하세요.');
    expect(help.id).not.toBe('');
    expect(error.id).not.toBe('');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toContain(help.id);
    expect(described).toContain(error.id);
  });
});
