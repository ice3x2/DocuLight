import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RelocationDialog,
  type RelocationPreviewResult,
  type RelocationWriteResult,
} from '../src/shell/RelocationDialog.js';
import { DocumentTree } from '../src/tree/DocumentTree.js';
import type { WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const destinations = [
  { id: 'ws-source', path: '기획팀' },
  { id: 'directory-a', path: '기획팀 / 설계' },
  { id: 'ws-other', path: '연구팀' },
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const open = (over: Record<string, unknown> = {}) => render(
  <RelocationDialog
    kind="move"
    open
    sourceName="회의록.md"
    sourceLevel="edit"
    destinationsState={{ state: 'ready', destinations }}
    contextKey="actor-a:1:modal-1:source-a"
    {...over}
  />,
);

describe('IR-SHELL-011 — authoritative relocation lifecycle', () => {
  // @req IR-SHELL-011 AC-1 AC-2 AC-4
  it('binds selection to its preview and requires a new action when execute refresh changes impact', async () => {
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValueOnce({ kind: 'move', before: 2, after: 4, grade: 'L2' })
      .mockResolvedValueOnce({ kind: 'move', before: 2, after: 2, grade: 'L1' });
    const write = vi.fn<() => Promise<RelocationWriteResult>>();
    const user = userEvent.setup();
    open({ loadPreview, onExecute: write });

    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    expect((await screen.findByTestId('relocation-preview')).textContent).toContain('4명');
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));

    expect((await screen.findByTestId('relocation-stale')).textContent).toBe('접근 가능 인원이 바뀌었습니다. 확인한 뒤 다시 실행하십시오.');
    expect(screen.getByTestId('relocation-preview').textContent).toContain('2명');
    expect(write).not.toHaveBeenCalled();
    expect(loadPreview).toHaveBeenCalledTimes(2);
  });

  // @req IR-SHELL-011 AC-3 AC-4 AC-5 AC-13
  it('never converts an open L2 into L1 execution and latches duplicate acceptance', async () => {
    const pending = deferred<RelocationWriteResult>();
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 3, grade: 'L2' })
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 3, grade: 'L2' })
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const write = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    open({ loadPreview, onExecute: write });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    const execute = screen.getByRole('button', { name: '이동', exact: true });
    await user.click(execute);
    const confirmation = await screen.findByRole('alertdialog');
    await user.dblClick(within(confirmation).getByRole('button', { name: '실행' }));

    expect(await within(confirmation).findByTestId('relocation-confirmation-stale')).toBeDefined();
    expect(write).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole('button', { name: '취소' }));
    expect(document.activeElement).toBe(execute);
  });

  // @req IR-SHELL-011 AC-1 AC-3 AC-4
  it('uses the accepted L2 mismatch as the next form baseline after cancellation', async () => {
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 3, grade: 'L2' })
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 3, grade: 'L2' })
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 1, grade: 'L1' })
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const write = vi.fn<() => Promise<RelocationWriteResult>>()
      .mockResolvedValue({ kind: 'move', name: '회의록.md' });
    const user = userEvent.setup();
    open({ loadPreview, onExecute: write });

    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(within(confirmation).getByRole('button', { name: '실행' }));
    await within(confirmation).findByTestId('relocation-confirmation-stale');
    await user.click(within(confirmation).getByRole('button', { name: '취소' }));
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  // @req IR-SHELL-011 AC-1 AC-4
  it('ignores an obsolete execute refresh failure after owner replacement', async () => {
    const refresh = deferred<RelocationPreviewResult>();
    const oldPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValueOnce({ kind: 'move', before: 1, after: 1, grade: 'L1' })
      .mockImplementationOnce(() => refresh.promise);
    const user = userEvent.setup();
    const view = open({ loadPreview: oldPreview, onExecute: vi.fn() });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));

    view.rerender(<RelocationDialog kind="move" open sourceName="다른 문서.md" sourceLevel="view" contextKey="actor-b:2:modal-2:source-b" destinationsState={{ state: 'ready', generation: 2, destinations } as never} loadPreview={() => Promise.resolve({ kind: 'move', before: 2, after: 2, grade: 'L1' })} />);
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await waitFor(() => expect(screen.getByTestId('relocation-preview').textContent).toContain('2명'));
    await act(async () => {
      refresh.reject(new Error('obsolete failure'));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('relocation-preview').textContent).toContain('2명'));

    expect(screen.queryByText('영향 정보를 불러오지 못했습니다.')).toBeNull();
  });

  // @req IR-SHELL-011 AC-5 AC-6
  it('retains selection and focuses a safe error after an uncertain write', async () => {
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'copy', reachable: 2, grade: 'L2' });
    const write = vi.fn(() => Promise.reject(new TypeError('raw network secret')));
    const user = userEvent.setup();
    open({ kind: 'copy', loadPreview, onExecute: write });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '복사', exact: true }));
    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(2));
    const confirmation = await screen.findByRole('alertdialog');
    await waitFor(() => expect(document.activeElement).toBe(within(confirmation).getByRole('button', { name: '취소' })));
    await user.click(within(confirmation).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(3));
    expect(within(confirmation).queryByTestId('relocation-confirmation-stale')).toBeNull();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const error = await screen.findByTestId('relocation-write-error');
    expect(error.textContent).toContain('결과를 확인할 수 없습니다');
    expect(error.textContent).not.toContain('raw network secret');
    expect((screen.getByLabelText('목적지') as HTMLSelectElement).value).toBe('directory-a');
    expect(document.activeElement).toBe(error);
    expect(write).toHaveBeenCalledTimes(1);
  });

  // @req IR-SHELL-011 AC-1 AC-11
  it('distinguishes destination loading, error, retry, and ready-empty from preview state', async () => {
    const retry = vi.fn();
    const view = open({ destinationsState: { state: 'loading' } });
    expect(screen.getByText('목적지를 불러오는 중입니다.')).toBeDefined();
    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="a" destinationsState={{ state: 'error', onRetry: retry }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '목적지 다시 불러오기' }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="a" destinationsState={{ state: 'ready', destinations: [] }} />);
    expect(screen.getByText('제공된 목적지가 없습니다.')).toBeDefined();
    expect(screen.queryByText('영향 정보를 불러오는 중입니다.')).toBeNull();
  });

  // @req IR-SHELL-011 AC-1 AC-12
  it('drops obsolete preview responses and derives administrator guidance only from source level', async () => {
    const old = deferred<RelocationPreviewResult>();
    const loadPreview = vi.fn(() => old.promise);
    const view = open({ loadPreview, sourceLevel: 'admin' });
    await userEvent.setup().selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    expect(screen.getByText('영향 정보를 불러오는 중입니다.')).toBeDefined();
    view.rerender(<RelocationDialog kind="move" open sourceName="다른 문서.md" sourceLevel="view" contextKey="actor-b:2:modal-2:source-b" destinationsState={{ state: 'ready', destinations }} loadPreview={loadPreview} />);
    old.resolve({ kind: 'move', before: 1, after: 99, grade: 'L2' });
    await Promise.resolve();
    expect(screen.queryByText('99명')).toBeNull();
    expect(screen.queryByTestId('roster-elsewhere')).toBeNull();
  });

  // @req IR-SHELL-011 AC-2 AC-12
  it('renders a non-admin preview without administrator guidance', async () => {
    const user = userEvent.setup();
    open({
      kind: 'copy',
      sourceLevel: 'edit',
      loadPreview: () => Promise.resolve({ kind: 'copy', reachable: 3, grade: 'L2' }),
    });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    expect((await screen.findByTestId('relocation-preview')).textContent).toContain('3명');
    expect(screen.queryByTestId('roster-elsewhere')).toBeNull();
  });

  // @req IR-SHELL-011 AC-1 AC-5 AC-11
  it('invalidates an actionable preview while destinations reload or remove the selected id', async () => {
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const write = vi.fn<() => Promise<RelocationWriteResult>>();
    const user = userEvent.setup();
    const view = open({ loadPreview, onExecute: write });

    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    expect(screen.getByRole('button', { name: '이동', exact: true })).toHaveProperty('disabled', false);

    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="actor-a:1:modal-1:source-a" destinationsState={{ state: 'loading' }} loadPreview={loadPreview} onExecute={write} />);
    expect(screen.getByRole('button', { name: '이동', exact: true })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: '이동', exact: true }));
    expect(write).not.toHaveBeenCalled();

    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="actor-a:1:modal-1:source-a" destinationsState={{ state: 'ready', destinations: destinations.filter((one) => one.id !== 'directory-a') }} loadPreview={loadPreview} onExecute={write} />);
    expect((screen.getByLabelText('목적지') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('relocation-preview')).toBeNull();
  });

  // @req IR-SHELL-011 AC-1 AC-11
  it('invalidates an actionable preview when the authoritative tree generation changes with the same ids', async () => {
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const write = vi.fn<() => Promise<RelocationWriteResult>>();
    const user = userEvent.setup();
    const view = open({ destinationsState: { state: 'ready', generation: 1, destinations } as never, loadPreview, onExecute: write });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');

    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="actor-a:1:modal-1:source-a" destinationsState={{ state: 'ready', generation: 2, destinations } as never} loadPreview={loadPreview} onExecute={write} />);

    expect(screen.getByRole('button', { name: '이동', exact: true })).toHaveProperty('disabled', true);
    expect(screen.queryByTestId('relocation-preview')).toBeNull();
    expect((screen.getByLabelText('목적지') as HTMLSelectElement).value).toBe('directory-a');
  });

  // @req IR-SHELL-011 AC-1 AC-7 AC-13
  it('does not close or move focus when an accepted write belongs to an obsolete owner', async () => {
    const pending = deferred<RelocationWriteResult>();
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const accepted = vi.fn();
    const user = userEvent.setup();
    const view = open({ loadPreview, onExecute: () => pending.promise, onAccepted: accepted });

    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true'));

    view.rerender(<RelocationDialog kind="move" open sourceName="다른 문서.md" sourceLevel="view" contextKey="actor-b:2:modal-2:source-b" destinationsState={{ state: 'ready', destinations }} loadPreview={loadPreview} onExecute={() => pending.promise} onAccepted={accepted} />);
    pending.resolve({ kind: 'move', name: '회의록.md' });
    await Promise.resolve();
    await Promise.resolve();

    expect(accepted).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  // @req IR-SHELL-011 AC-5 AC-7 AC-8 AC-11
  it('keeps an accepted write owner while its authoritative post-write tree refresh changes query state', async () => {
    const pending = deferred<RelocationWriteResult>();
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'move', before: 1, after: 1, grade: 'L1' });
    const accepted = vi.fn();
    const user = userEvent.setup();
    const view = open({ destinationsState: { state: 'ready', generation: 1, destinations } as never, loadPreview, onExecute: () => pending.promise, onAccepted: accepted });
    await user.selectOptions(screen.getByLabelText('목적지'), 'directory-a');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '이동', exact: true }));
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true'));

    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="actor-a:1:modal-1:source-a" destinationsState={{ state: 'loading' }} loadPreview={loadPreview} onExecute={() => pending.promise} onAccepted={accepted} />);
    view.rerender(<RelocationDialog kind="move" open sourceName="회의록.md" sourceLevel="edit" contextKey="actor-a:1:modal-1:source-a" destinationsState={{ state: 'ready', generation: 2, destinations } as never} loadPreview={loadPreview} onExecute={() => pending.promise} onAccepted={accepted} />);
    await act(async () => { pending.resolve({ kind: 'move', name: '회의록.md' }); await Promise.resolve(); });

    expect(accepted).toHaveBeenCalledTimes(1);
  });

  // @req IR-SHELL-011 AC-7 AC-9
  it('closes only after a validated result and reports exact server values without a hidden-count denominator', async () => {
    const accepted = vi.fn();
    const loadPreview = vi.fn<() => Promise<RelocationPreviewResult>>()
      .mockResolvedValue({ kind: 'copy', reachable: 4, grade: 'L2' });
    const write = vi.fn<() => Promise<RelocationWriteResult>>()
      .mockResolvedValue({ kind: 'copy', id: 'copy-1', name: '회의록 (2).md', copied: 3 });
    const user = userEvent.setup();
    open({ kind: 'copy', loadPreview, onExecute: write, onAccepted: accepted });
    await user.selectOptions(screen.getByLabelText('목적지'), 'ws-other');
    await screen.findByTestId('relocation-preview');
    await user.click(screen.getByRole('button', { name: '복사', exact: true }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledWith({ kind: 'copy', id: 'copy-1', name: '회의록 (2).md', copied: 3 }));
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('IR-SHELL-011 — post-refresh focus restoration', () => {
  // @req IR-SHELL-011 AC-13
  it('retries the captured workspace fallback when the refreshed tree mounts after the first focus frame', async () => {
    const workspace = (roots: WorkspaceTreeView['roots']): WorkspaceTreeView[] => [{
      workspace: { id: 'workspace-1', name: '기획팀' }, visibility: 'full', roots,
    }];
    const next = { id: 'next', name: '다음.md', kind: 'file' as const, visibility: 'full' as const, level: 'edit' as const, parentLevel: 'edit' as const, children: [] };
    const request = { nodeId: 'removed', fallbackIds: ['next', 'workspace-1'], sequence: 1 } as const;
    const view = render(<DocumentTree workspaces={[]} focusRequest={request} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tree', { name: '문서 트리' })));
    view.rerender(<DocumentTree workspaces={workspace([next])} focusRequest={request} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /기획팀/ })));
  });
});
