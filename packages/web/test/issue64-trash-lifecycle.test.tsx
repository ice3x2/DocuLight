import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TrashPanel,
  type TrashActionResult,
  type TrashRowView,
} from '../src/trash/TrashPanel.js';

afterEach(cleanup);

const row = (index = 0, canPurge = true): TrashRowView => ({
  nodeId: `node-${index}`,
  workspaceId: `workspace-${index % 3}`,
  workspaceName: `긴 워크스페이스 이름 ${index % 3}`,
  originalPath: `기획/분기-${index}/아주 긴 한글 경로가 줄바꿈되어야 하는 문서-${index}.md`,
  deletedAt: '2026-09-17T01:02:03.000Z',
  deletedBy: `삭제자-${index}`,
  canPurge,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

describe('issue #64 — authoritative query phases and list contract', () => {
  it('distinguishes loading, error retry, ready empty, and the complete ordered columns', async () => {
    const retry = vi.fn();
    const { rerender } = render(<TrashPanel rows={[]} query={{ state: 'loading' }} />);
    expect(screen.getByRole('status').textContent).toContain('휴지통을 불러오는 중입니다.');
    expect(screen.queryByText('표시할 휴지통 항목이 없습니다.')).toBeNull();

    rerender(<TrashPanel rows={[row()]} query={{ state: 'error', onRetry: retry }} />);
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('휴지통을 불러오지 못했습니다.'))).toBe(true);
    expect(screen.queryByText(row().originalPath)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<TrashPanel rows={[]} query={{ state: 'ready' }} />);
    expect(screen.getByText('표시할 휴지통 항목이 없습니다.')).toBeDefined();

    rerender(<TrashPanel rows={[row()]} query={{ state: 'ready' }} />);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '경로', '워크스페이스', '삭제자', '삭제 시각', '조작',
    ]);
    expect(screen.getByText('삭제자-0')).toBeDefined();
    expect(screen.getByRole('time').getAttribute('dateTime')).toBe(row().deletedAt);
  });

  it('preserves workspace and scope independently and exposes the current scope', async () => {
    const onLens = vi.fn();
    const { rerender } = render(
      <TrashPanel rows={[]} query={{ state: 'ready' }} canWidenScope lens={{ scope: 'all', workspaceId: 'workspace-1' }} workspaces={[{ id: 'workspace-1', name: '매우 긴 워크스페이스 이름' }, { id: 'workspace-2', name: '다른 곳' }]} onLens={onLens} />,
    );
    expect(screen.getByText('현재 범위: 전체')).toBeDefined();
    await userEvent.setup().selectOptions(screen.getByLabelText('워크스페이스 필터'), 'workspace-2');
    expect(onLens).toHaveBeenLastCalledWith({ scope: 'all', workspaceId: 'workspace-2' });

    rerender(<TrashPanel rows={[]} query={{ state: 'ready' }} canWidenScope lens={{ scope: 'mine', workspaceId: 'workspace-1' }} workspaces={[{ id: 'workspace-1', name: '매우 긴 워크스페이스 이름' }]} onLens={onLens} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '전체 보기' }));
    expect(onLens).toHaveBeenLastCalledWith({ scope: 'all', workspaceId: 'workspace-1' });
    expect(screen.getByText('현재 범위: 본인분')).toBeDefined();
  });
});

describe('issue #64 — awaited independent row mutations and L2 purge', () => {
  it('awaits restore, blocks the same row, reports failure safely, and permits retry', async () => {
    const first = deferred<TrashActionResult>();
    const restore = vi.fn(() => first.promise);
    const user = userEvent.setup();
    const { rerender } = render(<TrashPanel rows={[row()]} query={{ state: 'ready' }} onRestore={restore} onPurge={async () => ({ ok: true })} />);

    await user.click(screen.getByRole('button', { name: `${row().originalPath} 복구` }));
    const pendingRestore = screen.getByRole('button', { name: `${row().originalPath} 복구` }) as HTMLButtonElement;
    expect(pendingRestore.textContent).toBe('복구 중…');
    expect(pendingRestore.disabled).toBe(true);
    expect((screen.getByRole('button', { name: `${row().originalPath} 영구 삭제` }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(pendingRestore);
    expect(restore).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve({ ok: false }); await first.promise; });
    expect((await screen.findByRole('alert')).textContent).toContain('항목을 복구하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.');
    expect(screen.getByText(row().originalPath)).toBeDefined();

    const success = vi.fn(async () => ({ ok: true as const }));
    rerender(<TrashPanel rows={[row()]} query={{ state: 'ready' }} onRestore={success} onPurge={async () => ({ ok: true })} />);
    await user.click(screen.getByRole('button', { name: `${row().originalPath} 복구` }));
    expect((await screen.findByRole('status')).textContent).toContain('항목을 복구했습니다.');
    expect(success).toHaveBeenCalledWith(row().nodeId);
  });

  it('requires L2, invokes purge once after acceptance, and separates failure from query refresh', async () => {
    const pending = deferred<TrashActionResult>();
    const purge = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(<TrashPanel rows={[row()]} query={{ state: 'ready' }} onPurge={purge} onRestore={async () => ({ ok: true })} />);

    const action = screen.getByRole('button', { name: `${row().originalPath} 영구 삭제` });
    await user.click(action);
    expect(purge).not.toHaveBeenCalled();
    let gate = await screen.findByRole('alertdialog');
    expect(gate.getAttribute('data-grade')).toBe('L2');
    expect(within(gate).getByText(row().originalPath)).toBeDefined();
    expect(within(gate).getByText(row().workspaceName)).toBeDefined();
    await user.keyboard('{Escape}');
    expect(purge).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(action);

    await user.click(action);
    gate = await screen.findByRole('alertdialog');
    await user.click(within(gate).getByRole('button', { name: '영구 삭제' }));
    expect(purge).toHaveBeenCalledTimes(1);
    const pendingPurge = within(gate).getByRole('button', { name: '영구 삭제 중…' }) as HTMLButtonElement;
    expect(pendingPurge.disabled).toBe(true);
    await user.click(pendingPurge);
    expect(purge).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ ok: false }); await pending.promise; });
    expect((await screen.findByRole('alert')).textContent).toContain('항목을 영구 삭제하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.');
    expect(screen.getByText(row().originalPath)).toBeDefined();

    rerender(<TrashPanel rows={[row()]} query={{ state: 'error', onRetry: vi.fn() }} onPurge={purge} onRestore={async () => ({ ok: true })} />);
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('휴지통을 불러오지 못했습니다.'))).toBe(true);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('rejects an L2 target whose current row lost purge permission before acceptance', async () => {
    const purge = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    const { rerender } = render(<TrashPanel rows={[row()]} query={{ state: 'ready' }} onPurge={purge} />);
    await user.click(screen.getByRole('button', { name: `${row().originalPath} 영구 삭제` }));
    rerender(<TrashPanel rows={[row(0, false)]} query={{ state: 'ready' }} onPurge={purge} />);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '영구 삭제' }));
    expect(purge).not.toHaveBeenCalled();
    expect((await screen.findByRole('status')).textContent).toContain('항목 상태가 변경되었습니다. 목록을 다시 불러오십시오.');
  });
});

describe('issue #64 — measured bounded virtualization', () => {
  it('renders a bounded window for 1,000 authorized rows with stable logical indices', async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => row(index, index % 2 === 0));
    render(<TrashPanel rows={rows} query={{ state: 'ready' }} />);

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    const rendered = screen.getAllByRole('row');
    expect(rendered.length).toBeLessThan(80);
    const bodyRows = rendered.slice(1);
    expect(bodyRows[0]?.getAttribute('aria-rowindex')).toBe('2');
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('1001');
    expect(screen.getByTestId('trash-virtual-spacer').getAttribute('data-total-size')).toBe('40000');
  });
});

describe('issue #64 — stable virtual focus and contextual results', () => {
  it('keeps independent row outcomes and ignores an obsolete lens completion', async () => {
    const oldResult = deferred<TrashActionResult>();
    const secondResult = deferred<TrashActionResult>();
    const restore = vi.fn((id: string) => id === row(0).nodeId ? oldResult.promise : secondResult.promise);
    const user = userEvent.setup();
    const { rerender } = render(<TrashPanel contextKey="owner:1:mine" rows={[row(0), row(1)]} query={{ state: 'ready' }} onRestore={restore} />);

    await user.click(screen.getByRole('button', { name: `${row(0).originalPath} 복구` }));
    await user.click(screen.getByRole('button', { name: `${row(1).originalPath} 복구` }));
    await act(async () => { secondResult.resolve({ ok: false }); await secondResult.promise; });
    expect(screen.getByTestId(`trash-result-${row(1).nodeId}`).getAttribute('role')).toBe('alert');

    rerender(<TrashPanel contextKey="owner:1:all" rows={[row(0), row(1)]} query={{ state: 'ready' }} onRestore={restore} />);
    await act(async () => { oldResult.resolve({ ok: true }); await oldResult.promise; });
    expect(screen.queryByTestId(`trash-result-${row(0).nodeId}`)).toBeNull();
    expect(screen.queryByTestId(`trash-result-${row(1).nodeId}`)).toBeNull();
  });

  it('moves focus to next, previous, then heading after a successful focused removal', async () => {
    const user = userEvent.setup();
    let current = [row(0), row(1), row(2)];
    let rerender!: ReturnType<typeof render>['rerender'];
    const restore = vi.fn(async (id: string) => {
      current = current.filter((item) => item.nodeId !== id);
      rerender(<TrashPanel contextKey="owner:1:mine" rows={current} query={{ state: 'ready' }} onRestore={restore} />);
      return { ok: true as const };
    });
    ({ rerender } = render(<TrashPanel contextKey="owner:1:mine" rows={current} query={{ state: 'ready' }} onRestore={restore} />));

    await user.click(screen.getByRole('button', { name: `${row(1).originalPath} 복구` }));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-trash-node-id')).toBe(row(2).nodeId));
    await user.click(screen.getByRole('button', { name: `${row(2).originalPath} 복구` }));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-trash-node-id')).toBe(row(0).nodeId));
    await user.click(screen.getByRole('button', { name: `${row(0).originalPath} 복구` }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '휴지통' })));
  });

  it('moves focus to next, previous, then heading after accepting successful L2 purge', async () => {
    const user = userEvent.setup();
    let current = [row(0), row(1), row(2)];
    let rerender!: ReturnType<typeof render>['rerender'];
    const purge = vi.fn(async (id: string) => {
      current = current.filter((item) => item.nodeId !== id);
      rerender(<TrashPanel contextKey="owner:1:mine" rows={current} query={{ state: 'ready' }} onPurge={purge} />);
      return { ok: true as const };
    });
    ({ rerender } = render(<TrashPanel contextKey="owner:1:mine" rows={current} query={{ state: 'ready' }} onPurge={purge} />));

    const acceptPurge = async (target: TrashRowView) => {
      await user.click(screen.getByRole('button', { name: `${target.originalPath} 영구 삭제` }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '영구 삭제' }));
    };

    await acceptPurge(row(1));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-trash-node-id')).toBe(row(2).nodeId));
    await acceptPurge(row(2));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-trash-node-id')).toBe(row(0).nodeId));
    await acceptPurge(row(0));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '휴지통' })));
  });
});

describe('issue #64 — scoped visual contract', () => {
  it('keeps trash layout, wrapping, scroll, targets, and focus styling panel-scoped', async () => {
    const css = await readFile('src/styles/shell.css', 'utf8');
    expect(css).toContain('[data-panel="trash"]');
    expect(css).toContain('[data-trash-results]');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('max-height: 480px');
    expect(css).toContain('outline: 2px solid');
    expect(css).toContain('outline-offset: 2px');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
