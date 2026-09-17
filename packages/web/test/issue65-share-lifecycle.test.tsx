import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PrincipalRow, ShareViewBody } from '../src/api/client.js';
import { PrincipalPicker } from '../src/principal/PrincipalPicker.js';
import { ShareModal, type ShareActionResult, type ShareQueryState } from '../src/acl/ShareModal.js';

const fetchPrincipals = vi.fn();
vi.mock('../src/api/client.js', async (load) => ({
  ...(await load<typeof import('../src/api/client.js')>()),
  fetchPrincipals: (...args: unknown[]) => fetchPrincipals(...args),
}));

afterEach(() => {
  cleanup();
  fetchPrincipals.mockReset();
});

const principal = (overrides: Partial<PrincipalRow> = {}): PrincipalRow => ({
  id: 'person-1',
  name: '같은 이름',
  kind: 'user',
  status: 'active',
  system: false,
  ...overrides,
});

const view = (overrides: Partial<ShareViewBody> = {}): ShareViewBody => ({
  metrics: { reachable: 7, viaAcl: 3 },
  rows: [
    { entryId: 'entry-1', principalId: 'person-1', principalName: '직접 사용자', principalKind: 'user', level: 'view', inherited: false, source: null },
    { entryId: null, principalId: 'group-1', principalName: '상속 그룹', principalKind: 'group', level: 'edit', inherited: true, source: '설계 / 상위' },
  ],
  level: 'admin',
  nodeKind: 'file',
  inheritsAcl: true,
  reached: 12,
  ...overrides,
});

const ready = (nodeId = 'n1', body = view()): ShareQueryState => ({ state: 'ready', nodeId, view: body });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('issue #65 — truthful node-bound sharing state', () => {
  it('never renders a false zero or stale node data for loading/error/unavailable states', async () => {
    const retry = vi.fn();
    const { rerender } = render(<ShareModal nodeId="n1" nodeName="비밀 문서" open query={{ state: 'loading', nodeId: 'n1' }} />);
    expect(screen.getByRole('status').textContent).toContain('공유 정보를 불러오는 중');
    expect(screen.queryByText(/접근 가능 0명/)).toBeNull();
    expect(screen.queryByRole('button', { name: '추가' })).toBeNull();

    rerender(<ShareModal nodeId="n1" nodeName="비밀 문서" open query={{ state: 'error', nodeId: 'n1', onRetry: retry }} />);
    expect(screen.getByRole('alert').textContent).toContain('공유 정보를 불러오지 못했습니다');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('직접 사용자')).toBeNull();

    rerender(<ShareModal nodeId="n2" nodeName="다른 문서" open query={ready('n1')} />);
    expect(screen.getByRole('status').textContent).toContain('공유 정보를 불러오는 중');
    expect(screen.queryByText('직접 사용자')).toBeNull();
  });

  it('uses only reachable metrics and hides manager names and inheritance actions from an editor', () => {
    render(<ShareModal nodeId="n1" nodeName="긴 문서 이름" open query={ready('n1', view({ level: 'edit', rows: null }))} />);
    expect(screen.getByTestId('share-metrics').textContent).toBe('접근 가능 7명');
    expect(screen.queryByText(/ACL 접근자/)).toBeNull();
    expect(screen.queryByText('직접 사용자')).toBeNull();
    expect(screen.queryByTestId('break-inheritance')).toBeNull();
    expect(screen.queryByTestId('inherit-from-parent')).toBeNull();
    expect((screen.getByRole('button', { name: '추가' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeTruthy();
  });
});

describe('issue #65 — principal search state, churn, and selection', () => {
  it('distinguishes threshold, pending, error/retry, zero, and caps results at twenty', async () => {
    const pending = deferred<readonly PrincipalRow[]>();
    fetchPrincipals.mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<PrincipalPicker scope="node:n1" />);
    const input = screen.getByRole('combobox', { name: '사용자·그룹 검색' });
    expect(screen.getByText('두 글자 이상 입력하세요.')).toBeDefined();
    await user.type(input, '가');
    expect(fetchPrincipals).not.toHaveBeenCalled();
    await user.type(input, '나');
    expect(await screen.findByText('검색 중…')).toBeDefined();
    await act(async () => { pending.reject(new Error('offline')); });
    expect((await screen.findByRole('alert')).textContent).toContain('검색하지 못했습니다.');
    fetchPrincipals.mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: '검색 다시 시도' }));
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeDefined();
    expect(fetchPrincipals).toHaveBeenLastCalledWith('가나', 'node:n1');

    fetchPrincipals.mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => principal({ id: `p-${index}`, name: `후보 ${index}` })));
    await user.type(input, '다');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  });

  it('drops old-query results and selection across query or scope changes and ignores late completions', async () => {
    const old = deferred<readonly PrincipalRow[]>();
    fetchPrincipals.mockImplementation((query: string) => query === '이전' ? old.promise : Promise.resolve([principal({ id: 'new', name: '새 후보' })]));
    const picked = vi.fn();
    const invalidated = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PrincipalPicker scope="node:n1" onPick={picked} onSelectionInvalidated={invalidated} />);
    const input = screen.getByRole('combobox', { name: '사용자·그룹 검색' });
    await user.type(input, '이전');
    await user.clear(input);
    await user.type(input, '새값');
    await user.click(await screen.findByRole('option', { name: /새 후보/ }));
    expect(picked).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'new' }));
    await act(async () => { old.resolve([principal({ id: 'old', name: '오래된 후보' })]); });
    expect(screen.queryByText('오래된 후보')).toBeNull();

    rerender(<PrincipalPicker scope="node:n2" onPick={picked} onSelectionInvalidated={invalidated} />);
    expect(invalidated).toHaveBeenCalled();
    expect(screen.queryByText('새 후보')).toBeNull();
  });
});

describe('issue #65 — awaited grants and exact confirmation grades', () => {
  it('invalidates a grant when the picker query changes while warnings are pending', async () => {
    fetchPrincipals.mockResolvedValue([principal()]);
    const warnings = deferred<readonly []>();
    const onGrant = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="race.md" open query={ready()} onGrant={onGrant} onWarnings={() => warnings.promise} />);
    const input = document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!;
    await user.type(input, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(screen.getByRole('button', { name: '추가' }));
    await user.type(input, ' 새 검색');
    await act(async () => { warnings.resolve([]); await warnings.promise; });
    expect(onGrant).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('invalidates preflight on level change and prevents duplicate grant starts', async () => {
    fetchPrincipals.mockResolvedValue([principal()]);
    const warnings = deferred<readonly []>();
    const onGrant = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="level.md" open query={ready()} onGrant={onGrant} onWarnings={() => warnings.promise} />);
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    const add = screen.getByRole('button', { name: '추가' });
    await user.dblClick(add);
    expect(add).toHaveProperty('disabled', true);
    await user.selectOptions(screen.getByLabelText('권한'), 'edit');
    await act(async () => { warnings.resolve([]); await warnings.promise; });
    expect(onGrant).not.toHaveBeenCalled();
  });

  it('lets a failed automatic file revoke be retried from the same row', async () => {
    const onRevoke = vi.fn()
      .mockResolvedValueOnce({ ok: false as const })
      .mockResolvedValueOnce({ ok: true as const });
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="retry-revoke.md" open query={ready()} onRevoke={onRevoke} onWarnings={async () => []} />);
    const rowButton = screen.getByRole('button', { name: /직접 사용자 회수/ });
    await user.click(rowButton);
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
    await user.click(rowButton);
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(2));
  });

  it('uses the refreshed authoritative entry ID for admin toast revoke and warns before last-admin revoke', async () => {
    fetchPrincipals.mockResolvedValue([principal({ id: 'person-new' })]);
    const onRevoke = vi.fn(async () => ({ ok: true as const }));
    const refreshView = vi.fn(async () => view({ rows: [
      ...view().rows!,
      { entryId: 'authoritative-new', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
    ] }));
    const warnings = vi.fn(async (input: { principalId?: string; entryId?: string }) => input.entryId === 'entry-1' ? ['last-administrator' as const] : []);
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="admin.md" open query={ready()} onGrant={async () => ({ ok: true })} onRevoke={onRevoke} refreshView={refreshView} onWarnings={warnings} />);
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(screen.getByRole('button', { name: '추가' }));
    const toast = await screen.findByRole('status');
    await user.click(within(toast).getByRole('button', { name: '회수' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('authoritative-new'));

    await user.click(screen.getByRole('button', { name: /직접 사용자 회수/ }));
    expect(warnings).toHaveBeenCalledWith({ entryId: 'entry-1' });
    const gate = await screen.findByRole('alertdialog');
    expect(gate.textContent).toContain('마지막 관리 권한자');
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it('enables toast revoke only for one exact direct principal and requested-level match, bound to context', async () => {
    fetchPrincipals.mockResolvedValue([principal({ id: 'person-new' })]);
    const refreshed = deferred<ShareViewBody>();
    const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'exact.md', open: true, query: ready(), contextKey: 'owner-a:1', onGrant: async () => ({ ok: true as const }), onWarnings: async () => [], refreshView: () => refreshed.promise };
    const { rerender } = render(<ShareModal {...props} />);
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect((screen.getByRole('button', { name: '추가 중…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ShareModal {...props} contextKey="owner-b:2" />);
    await act(async () => refreshed.resolve(view({ rows: [
      { entryId: 'ambiguous-1', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
      { entryId: 'ambiguous-2', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
    ] })));
    expect(screen.queryByRole('button', { name: '회수' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('retries only metadata GET after an ambiguous authoritative match and never re-grants', async () => {
    fetchPrincipals.mockResolvedValue([principal({ id: 'person-new' })]);
    const onGrant = vi.fn(async () => ({ ok: true as const }));
    const refreshView = vi.fn()
      .mockResolvedValueOnce(view({ rows: [
        { entryId: 'one', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
        { entryId: 'two', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
      ] }))
      .mockResolvedValueOnce(view({ rows: [
        { entryId: 'final-id', principalId: 'person-new', principalName: '같은 이름', principalKind: 'user', level: 'view', inherited: false, source: null },
      ] }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="retry.md" open query={ready()} contextKey="owner:1" onGrant={onGrant} onWarnings={async () => []} refreshView={refreshView} />);
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(screen.getByRole('button', { name: '추가' }));
    await user.click(await screen.findByRole('button', { name: '회수 대상 다시 확인' }));
    expect(onGrant).toHaveBeenCalledTimes(1);
    expect(refreshView).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '회수' })).toBeDefined();
  });

  it('shows the editor capability limitation instead of an endless metadata retry', async () => {
    fetchPrincipals.mockResolvedValue([principal({ id: 'person-new' })]);
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready('n1', view({ level: 'edit', rows: null }))} onGrant={async () => ({ ok: true })} onWarnings={async () => []} refreshView={async () => view({ level: 'edit', rows: null })} />);
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect((await screen.findByRole('status')).textContent).toContain('현재 권한에서는 회수 대상을 확인할 수 없습니다');
    expect(screen.queryByRole('button', { name: '회수 대상 다시 확인' })).toBeNull();
  });

  it('clears pending when a modal closes and reopens on the same node', async () => {
    fetchPrincipals.mockResolvedValue([principal()]);
    const pending = deferred<ShareActionResult>();
    const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'pending.md', query: ready(), onGrant: () => pending.promise, onWarnings: async () => [] };
    const { rerender } = render(<ShareModal {...props} open />);
    const current = within(screen.getByRole('dialog'));
    await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, '같은');
    await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
    await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
    await user.click(current.getByRole('button', { name: '추가' }));
    rerender(<ShareModal {...props} open={false} />);
    rerender(<ShareModal {...props} open />);
    await act(async () => { pending.resolve({ ok: true }); await pending.promise; });
    expect((screen.getByRole('button', { name: '추가' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not announce grant success before settlement and exposes no enabled fake toast revoke', async () => {
    fetchPrincipals.mockResolvedValue([principal()]);
    const grant = deferred<ShareActionResult>();
    const onGrant = vi.fn(() => grant.promise);
    const user = userEvent.setup();
    render(<ShareModal
      nodeId="n1"
      nodeName="회의록.md"
      open
      query={ready()}
      onGrant={onGrant}
      onWarnings={async () => []}
    />);
    await user.type(screen.getByRole('combobox', { name: '사용자·그룹 검색' }), '같은');
    await user.click(await screen.findByRole('option', { name: /같은 이름.*사용자/ }));
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(onGrant).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/권한을 부여했습니다/)).toBeNull();
    expect((screen.getByRole('button', { name: '추가 중…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { grant.resolve({ ok: false }); await grant.promise; });
    expect((await screen.findByRole('alert')).textContent).toContain('권한을 부여하지 못했습니다.');
    expect((screen.getByRole('button', { name: '추가' }) as HTMLButtonElement).disabled).toBe(false);

    const success = vi.fn(async () => ({ ok: true as const }));
    cleanup();
    fetchPrincipals.mockResolvedValue([principal()]);
    render(<ShareModal nodeId="n1" nodeName="회의록.md" open query={ready()} onGrant={success} onWarnings={async () => []} />);
    await user.type(screen.getByRole('combobox', { name: '사용자·그룹 검색' }), '같은');
    await user.click(await screen.findByRole('option', { name: /같은 이름.*사용자/ }));
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect((await screen.findByRole('status')).textContent).toContain('권한을 부여했습니다.');
    expect(screen.queryByRole('button', { name: '회수' })).toBeNull();
  });

  it('requires L2 for group/file and every directory grant, with no mutation on cancel', async () => {
    const group = principal({ id: 'g1', kind: 'group', name: '설계 그룹' });
    fetchPrincipals.mockResolvedValue([group]);
    const onGrant = vi.fn(async () => ({ ok: true as const }));
    const refresh = vi.fn(async () => view({ nodeKind: 'directory', reached: 19 }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="d1" nodeName="긴 디렉토리" nodeKind="directory" open query={ready('d1', view({ nodeKind: 'directory' }))} onGrant={onGrant} onWarnings={async () => []} refreshView={refresh} />);
    await user.type(screen.getByRole('combobox', { name: '사용자·그룹 검색' }), '설계');
    await user.click(await screen.findByRole('option', { name: /설계 그룹.*그룹/ }));
    await user.click(screen.getByRole('button', { name: '추가' }));
    const gate = await screen.findByRole('alertdialog');
    expect(gate.textContent).toContain('적용 하위 19개');
    expect(gate.textContent).toContain('긴 디렉토리');
    expect(gate.textContent).toContain('설계 그룹');
    await user.click(within(gate).getByRole('button', { name: '취소' }));
    expect(onGrant).not.toHaveBeenCalled();
  });

  it('hides break from editors and uses fresh L2/L3 context for admin break/import', async () => {
    const breakAction = vi.fn(async () => ({ ok: true as const }));
    const refresh = vi.fn(async () => view({ nodeKind: 'directory', reached: 23, level: 'admin' }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="d1" nodeName="자료실" nodeKind="directory" open query={ready('d1', view({ nodeKind: 'directory', reached: 12 }))} refreshView={refresh} onBreakInheritance={breakAction} />);
    await user.click(screen.getByTestId('break-inheritance'));
    const gate = await screen.findByRole('alertdialog');
    expect(gate.textContent).toContain('23');
    const token = within(gate).getByRole('textbox');
    await user.type(token, '12');
    expect((within(gate).getByRole('button', { name: '실행' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(token);
    await user.type(token, '23');
    await user.click(within(gate).getByRole('button', { name: '실행' }));
    expect(breakAction).toHaveBeenCalledTimes(1);
  });
});

describe('issue #65 — scoped sharing visual contract', () => {
  it('scopes dialog, scrolling, wrapped rows, targets, focus, and forced colors', async () => {
    const css = await readFile('src/styles/shell.css', 'utf8');
    expect(css).toContain('[data-share-dialog]');
    expect(css).toContain('max-width: 560px');
    expect(css).toContain('max-height: calc(100dvh - 48px)');
    expect(css).toContain('[data-share-body]');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain('outline: 2px solid');
    expect(css).toContain('outline-offset: 2px');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
