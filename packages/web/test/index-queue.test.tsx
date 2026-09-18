import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { IndexQueuePanel, IndexQueueSurface, type IndexQueueState, type IndexQueueSnapshot } from '../src/settings/IndexQueuePanel.js';
import { AppShell } from '../src/shell/AppShell.js';

const snapshot = {
  counts: { pending: 1, running: 1, failed: 1 }, total: 3, limit: 100 as const,
  items: [
    { nodeId: 'a', name: '긴 문서 이름.md', workspaceName: '신문 편집국', status: 'pending' as const, requestedAt: '2026-09-18T00:00:00.000Z' },
    { nodeId: 'b', name: 'PDF.pdf', workspaceName: '자료실', status: 'failed' as const, requestedAt: '2026-09-18T00:01:00.000Z', errorCode: 'parse_failed' as const },
  ],
};

describe('FR-STORAGE-010 AC-6 — 색인 대기열 설정 본문', () => {
  it('loading/empty/error를 구별하며 오류 재시도는 이 GET만 다시 부른다', async () => {
    const retry = vi.fn();
    const { rerender } = render(<IndexQueuePanel state={{ state: 'loading' }} onRefresh={retry} />);
    expect(screen.getByText('색인 상태를 불러오는 중입니다.')).toBeTruthy();
    expect(screen.queryByText('대기 0')).toBeNull();

    rerender(<IndexQueuePanel state={{ state: 'ready', snapshot: { counts: { pending: 0, running: 0, failed: 0 }, total: 0, limit: 100, items: [] } }} onRefresh={retry} />);
    expect(screen.getByText('현재 대기 중인 색인 작업이 없습니다.')).toBeTruthy();

    rerender(<IndexQueuePanel state={{ state: 'error' }} onRefresh={retry} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('정확한 요약/표를 읽기 전용으로 표시하고 행 조작을 만들지 않는다', () => {
    render(<IndexQueuePanel state={{ state: 'ready', snapshot }} onRefresh={() => undefined} />);
    for (const label of ['대기 1', '처리 중 1', '실패 1']) expect(screen.getByText(label)).toBeTruthy();
    const table = screen.getByRole('table', { name: '색인 작업 목록' });
    for (const heading of ['이름', '워크스페이스', '상태', '요청 시각', '오류']) expect(within(table).getByRole('columnheader', { name: heading })).toBeTruthy();
    expect(within(table).getByText('텍스트 추출 실패')).toBeTruthy();
    expect(screen.getByText('실패한 작업은 해당 노드가 변경되거나 서버가 다시 시작될 때 다시 처리됩니다.')).toBeTruthy();
    expect(within(table).queryByRole('button')).toBeNull();
  });

  it('refresh pending에는 과거 수치/행을 숨기고 새로고침만 비활성화한다', () => {
    const state: IndexQueueState = { state: 'loading' };
    render(<IndexQueuePanel state={state} onRefresh={() => undefined} />);
    expect((screen.getByRole('button', { name: '새로고침' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('긴 문서 이름.md')).toBeNull();
  });

  it('인증 주체/슈퍼유저 context key가 바뀌면 이전 snapshot을 즉시 지우고 늦은 응답을 무시한다', async () => {
    let resolveOld!: (value: IndexQueueSnapshot) => void;
    let resolveNew!: (value: IndexQueueSnapshot) => void;
    const old = new Promise<IndexQueueSnapshot>((resolve) => { resolveOld = resolve; });
    const next = new Promise<IndexQueueSnapshot>((resolve) => { resolveNew = resolve; });
    const load = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(next);
    const view = render(<IndexQueueSurface load={load} contextKey="user-a:1:super" />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    view.rerender(<IndexQueueSurface load={load} contextKey="user-b:2:super" />);
    expect(screen.getByText('색인 상태를 불러오는 중입니다.')).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    resolveOld(snapshot);
    await Promise.resolve();
    expect(screen.queryByText('긴 문서 이름.md')).toBeNull();
    resolveNew({ counts: { pending: 0, running: 0, failed: 0 }, total: 0, limit: 100, items: [] });
    expect(await screen.findByText('현재 대기 중인 색인 작업이 없습니다.')).toBeTruthy();
  });

  it('오류 retry 성공은 새로고침, 재실패는 새 retry에 논리 초점을 복원한다', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce({ counts: { pending: 0, running: 0, failed: 0 }, total: 0, limit: 100, items: [] })
      .mockRejectedValueOnce(new Error('again'));
    render(<IndexQueueSurface load={load} contextKey="user-a:1:super" />);
    const retry = await screen.findByRole('button', { name: '다시 불러오기' });
    retry.focus();
    await userEvent.setup().click(retry);
    await screen.findByText('현재 대기 중인 색인 작업이 없습니다.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새로고침' }));
    await userEvent.setup().click(screen.getByRole('button', { name: '새로고침' }));
    const retryAgain = await screen.findByRole('button', { name: '다시 불러오기' });
    expect(document.activeElement).toBe(retryAgain);
  });
});

describe('FR-STORAGE-010 AC-6 — 설정 진입 연결', () => {
  it('슈퍼유저가 색인 대기열에 진입할 때만 GET하고 재진입하면 다시 읽는다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ counts: { pending: 0, running: 0, failed: 0 }, total: 0, limit: 100, items: [] });
    render(<AppShell viewer={{ superuser: true, workspaceCount: 0, adminWorkspaceCount: 0 }} fetchIndexQueue={fetcher} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(fetcher).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('tab', { name: '색인 대기열' }));
    expect(await screen.findByText('현재 대기 중인 색인 작업이 없습니다.')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('tab', { name: '에디터' }));
    await user.click(screen.getByRole('tab', { name: '색인 대기열' }));
    expect(await screen.findByText('현재 대기 중인 색인 작업이 없습니다.')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

it('신문지 설정 본문의 수치 계약이 제품 CSS에 조립된다', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/shell.css'), 'utf8');
  expect(css).toMatch(/\[data-index-queue\].*font-size:\s*14px/s);
  expect(css).toMatch(/data-index-queue-table-region.*overflow-x:\s*auto/s);
  expect(css).toMatch(/data-index-queue-summary.*gap:\s*8px/s);
});
