import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AclAuditPanel } from '../src/acl/AclAuditPanel.js';
import { BulkRevokePanel } from '../src/acl/BulkRevokePanel.js';
import { InheritanceAuditPanel } from '../src/acl/InheritanceAuditPanel.js';
import { SimulationPanel } from '../src/acl/SimulationPanel.js';
import { revokeSubjectAndRefresh } from '../src/App.js';
import type { PrincipalRow, RevocationBody, RevocationRow } from '../src/api/client.js';

afterEach(cleanup);

const subject = (id: string, name = id): PrincipalRow => ({
  id,
  name,
  kind: 'user',
  status: 'active',
});

const row = (entryId: string, workspaceId = 'ws-1'): RevocationRow => ({
  entryId,
  workspaceId,
  workspaceName: '기획팀',
  path: `문서/${entryId}.md`,
  level: 'view',
  grantedBy: null,
  grantedAt: '2026-09-18T00:00:00.000Z',
});

const plan = (parts: Array<[PrincipalRow, RevocationBody]>) => ({
  subjects: parts.map(([selected, response]) => ({
    subject: selected,
    response: { ...response, subject: { id: selected.id, aclRevokePreservesSuperuserBypass: false } },
  })),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('issue #69 managed-scope and exact tab contract', () => {
  it('distinguishes loading, error, and confirmed empty without opening roster search', async () => {
    const retry = vi.fn();
    const view = render(<AclAuditPanel managedScope={{ state: 'loading' }} />);
    expect(screen.getByRole('status').textContent).toContain('관리 범위를 확인');
    expect(screen.queryByText(/워크스페이스가 없습니다/)).toBeNull();

    view.rerender(<AclAuditPanel managedScope={{ state: 'error', onRetry: retry }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '관리 범위 다시 시도' }));
    expect(retry).toHaveBeenCalledOnce();

    view.rerender(<AclAuditPanel managedScope={{ state: 'empty' }} />);
    expect(screen.getByText('관리 권한이 있는 워크스페이스가 없습니다.')).toBeDefined();
    expect(screen.queryByLabelText('사용자·그룹 검색')).toBeNull();
  });

  it('renders exactly the three ordered audit tabs', () => {
    render(<AclAuditPanel managedScope={{ state: 'ready', workspaceId: 'ws-1' }} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '권한 회수',
      '유효 권한 시뮬레이션',
      '상속 끊김',
    ]);
  });

  it('does not infer a managed scope from workspaceId or fabricate confirmed empty', () => {
    const LegacyAclAuditPanel = AclAuditPanel as unknown as (props: Record<string, unknown>) => JSX.Element;
    const view = render(<LegacyAclAuditPanel workspaceId="visible-only" />);
    expect(screen.getByRole('alert').textContent).toContain('관리 범위 정보를 사용할 수 없습니다');
    expect(screen.queryByLabelText('사용자·그룹 검색')).toBeNull();

    view.rerender(<LegacyAclAuditPanel />);
    expect(screen.getByRole('alert').textContent).toContain('관리 범위 정보를 사용할 수 없습니다');
    expect(screen.queryByText('관리 권한이 있는 워크스페이스가 없습니다.')).toBeNull();
  });
});

describe('issue #69 complete multi-subject revocation plan', () => {
  it('keeps a confirmed revoke result when one refresh fails and attempts every refresh', async () => {
    const removed = { scope: 'instance' as const, rows: [row('e-1')] };
    const refresh = vi.fn(async (target: 'revocation' | 'tree') => {
      if (target === 'revocation') throw new Error('refresh failed');
    });

    await expect(revokeSubjectAndRefresh('u-1', vi.fn().mockResolvedValue(removed), refresh)).resolves.toEqual({
      revocation: removed,
      refreshFailed: true,
    });
    expect(refresh.mock.calls.map(([target]) => target)).toEqual(['revocation', 'tree']);
  });

  it('groups every selected subject, retains zero-entry subjects, and totals unique entry ids', async () => {
    const first = subject('u-1', '첫 사람');
    const zero = subject('u-2', '빈 사람');
    render(
      <BulkRevokePanel
        contextKey="ctx"
        workspaceId="ws-1"
        subjects={[first, zero]}
        plan={{ state: 'ready', data: plan([[first, { scope: 'instance', rows: [row('e-1'), row('e-2')] }], [zero, { scope: 'instance', rows: [] }]]) }}
        onPick={vi.fn()}
        onRemove={vi.fn()}
        onPreview={vi.fn().mockResolvedValue(plan([[first, { scope: 'instance', rows: [row('e-1'), row('e-2')] }], [zero, { scope: 'instance', rows: [] }]]))}
        onRevokeSubject={vi.fn()}
      />,
    );

    expect(screen.getByTestId('revocation-group-u-1')).toBeDefined();
    expect(screen.getByTestId('revocation-group-u-2').textContent).toContain('회수할 ACL 항목이 없습니다');
    await userEvent.setup().click(screen.getByRole('button', { name: '권한 전부 회수' }));
    expect((await screen.findByTestId('revocation-tally')).textContent).toContain('주체 2개 · 항목 2건');
  });

  it('blocks incomplete, mixed-scope, and duplicate-owned plans', () => {
    const first = subject('u-1');
    const second = subject('u-2');
    const { rerender } = render(
      <BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first, second]} plan={{ state: 'loading' }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} />,
    );
    expect((screen.getByRole('button', { name: '권한 전부 회수' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first, second]} plan={{ state: 'ready', data: plan([[first, { scope: 'instance', rows: [row('same')] }], [second, { scope: 'managed-workspaces', rows: [row('same')] }]]) }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('미리보기를 새로고침');
    expect((screen.getByRole('button', { name: '권한 전부 회수' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rejects conflicting duplicate entry data instead of deduplicating it silently', () => {
    const first = subject('u-1');
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first]} plan={{ state: 'ready', data: plan([[first, { scope: 'instance', rows: [row('same'), { ...row('same'), path: '다른 경로.md' }] }]]) }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('미리보기를 새로고침');
    expect((screen.getByRole('button', { name: '권한 전부 회수' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('re-previews on open and submit, then executes frozen ids sequentially and stops after failure', async () => {
    const first = subject('u-1', '첫 사람');
    const second = subject('u-2', '둘째 사람');
    const stable = plan([[first, { scope: 'instance', rows: [row('e-1')] }], [second, { scope: 'instance', rows: [row('e-2')] }]]);
    const preview = vi.fn().mockResolvedValue(stable);
    const calls: string[] = [];
    const execute = vi.fn(async (id: string) => {
      calls.push(id);
      if (id === 'u-2') throw new Error('unknown');
      return { revocation: { scope: 'instance' as const, rows: [row('e-1')] }, refreshFailed: false };
    });
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first, second]} plan={{ state: 'ready', data: stable }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={preview} onRevokeSubject={execute} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByLabelText(/2 를 입력/), '2');
    await user.click(within(gate).getByRole('button', { name: '실행' }));

    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(calls).toEqual(['u-1', 'u-2']);
    const result = await screen.findByRole('list', { name: '회수 실행 결과' });
    expect(result.textContent).toContain('완료 · 실제 1건');
    expect(result.textContent).toContain('결과 확인 필요');
  });

  it('does not execute when equal-count entry identity changes before submit', async () => {
    const first = subject('u-1');
    const initial = plan([[first, { scope: 'instance', rows: [row('e-1')] }]]);
    const changed = plan([[first, { scope: 'instance', rows: [row('e-2')] }]]);
    const preview = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(changed);
    const execute = vi.fn();
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first]} plan={{ state: 'ready', data: initial }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={preview} onRevokeSubject={execute} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByLabelText(/1 를 입력/), '1');
    await user.click(within(gate).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('미리보기가 변경'));
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not fabricate a subject plan or completed outcome from legacy props', () => {
    const LegacyPanel = BulkRevokePanel as unknown as (props: Record<string, unknown>) => JSX.Element;
    render(<LegacyPanel workspaceId="ws-1" subjects={[subject('u-1')]} revocation={{ scope: 'instance', rows: [row('e-1')] }} onRevoke={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('회수 상태를 사용할 수 없습니다');
    expect(screen.queryByTestId('revocation-group-u-1')).toBeNull();
  });

  it.each([
    ['authentication', 'viewer-2:1:ready:ws-1:u-1'],
    ['managed scope', 'viewer-1:0:ready:ws-2:u-1'],
    ['ordered subjects', 'viewer-1:0:ready:ws-1:u-2'],
  ])('discards a deferred preview after %s identity changes', async (_kind, changedContext) => {
    const first = subject('u-1');
    const initial = plan([[first, { scope: 'instance', rows: [row('e-1')] }]]);
    const pending = deferred<ReturnType<typeof plan>>();
    const preview = vi.fn(() => pending.promise);
    const execute = vi.fn();
    const view = render(<BulkRevokePanel contextKey="viewer-1:0:ready:ws-1:u-1" workspaceId="ws-1" subjects={[first]} plan={{ state: 'ready', data: initial }} onPick={vi.fn()} onPreview={preview} onRevokeSubject={execute} onRemove={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: '권한 전부 회수' }));
    view.rerender(<BulkRevokePanel contextKey={changedContext} workspaceId={changedContext.includes('ws-2') ? 'ws-2' : 'ws-1'} subjects={changedContext.endsWith('u-2') ? [subject('u-2')] : [first]} plan={{ state: 'loading' }} onPick={vi.fn()} onPreview={preview} onRevokeSubject={execute} onRemove={vi.fn()} />);
    pending.resolve(initial);

    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops a frozen sequence and discards old results when context changes during execution', async () => {
    const first = subject('u-1');
    const second = subject('u-2');
    const stable = plan([[first, { scope: 'instance', rows: [row('e-1')] }], [second, { scope: 'instance', rows: [row('e-2')] }]]);
    const firstExecution = deferred<{ revocation: RevocationBody; refreshFailed: boolean }>();
    const execute = vi.fn((id: string) => id === 'u-1'
      ? firstExecution.promise
      : Promise.resolve({ revocation: { scope: 'instance' as const, rows: [row('e-2')] }, refreshFailed: false }));
    const view = render(<BulkRevokePanel contextKey="viewer-1:0:ready:ws-1:u-1,u-2" workspaceId="ws-1" subjects={[first, second]} plan={{ state: 'ready', data: stable }} onPick={vi.fn()} onPreview={vi.fn().mockResolvedValue(stable)} onRevokeSubject={execute} onRemove={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByLabelText(/2 를 입력/), '2');
    await user.click(within(gate).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    view.rerender(<BulkRevokePanel contextKey="viewer-2:1:ready:ws-1:u-1,u-2" workspaceId="ws-1" subjects={[first, second]} plan={{ state: 'loading' }} onPick={vi.fn()} onPreview={vi.fn()} onRevokeSubject={execute} onRemove={vi.fn()} />);
    await act(async () => {
      firstExecution.resolve({ revocation: { scope: 'instance', rows: [row('e-1')] }, refreshFailed: false });
      await firstExecution.promise;
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list', { name: '회수 실행 결과' })).toBeNull();
  });

  it.each([0, 1, 2])('preserves the exact three-subject partial outcome when POST index %i fails', async (failureIndex) => {
    const selected = [subject('u-1'), subject('u-2'), subject('u-3')];
    const stable = plan(selected.map((item, index) => [item, { scope: 'instance', rows: [row(`preview-${index + 1}`)] }]));
    const posted: string[] = [];
    const execute = vi.fn(async (id: string) => {
      posted.push(id);
      if (id === selected[failureIndex]!.id) throw new Error('POST failed');
      return {
        revocation: { scope: 'instance' as const, rows: [row(`removed-${id}`)] },
        refreshFailed: false,
      };
    });
    render(<BulkRevokePanel contextKey={`matrix:${failureIndex}`} workspaceId="ws-1" subjects={selected} plan={{ state: 'ready', data: stable }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn().mockResolvedValue(stable)} onRevokeSubject={execute} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByLabelText(/3 를 입력/), '3');
    await user.click(within(gate).getByRole('button', { name: '실행' }));

    const result = await screen.findByRole('list', { name: '회수 실행 결과' });
    expect(posted).toEqual(selected.slice(0, failureIndex + 1).map((item) => item.id));
    expect(execute).toHaveBeenCalledTimes(failureIndex + 1);
    expect(screen.getByText(`확정 합계 ${failureIndex}건`)).toBeDefined();
    for (let index = 0; index < selected.length; index += 1) {
      const item = result.querySelector(`[data-subject-id="${selected[index]!.id}"]`);
      expect(item).not.toBeNull();
      const expectedState = index < failureIndex ? 'completed' : index === failureIndex ? 'unconfirmed' : 'not-run';
      expect(item?.getAttribute('data-outcome-state')).toBe(expectedState);
      if (index < failureIndex) expect(item?.textContent).toContain(`removed-${selected[index]!.id}.md`);
    }
    for (const suffix of selected.slice(failureIndex + 1)) expect(execute).not.toHaveBeenCalledWith(suffix.id);
  });

  it('renders confirmed actual rows and reports refresh failure separately', async () => {
    const first = subject('u-1');
    const stable = plan([[first, { scope: 'instance', rows: [row('e-1'), row('e-2')] }]]);
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[first]} plan={{ state: 'ready', data: stable }} onPick={vi.fn()} onPreview={vi.fn().mockResolvedValue(stable)} onRevokeSubject={vi.fn().mockResolvedValue({ revocation: { scope: 'instance', rows: [row('e-2')] }, refreshFailed: true })} onRemove={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByLabelText(/2 를 입력/), '2');
    await user.click(within(gate).getByRole('button', { name: '실행' }));

    const result = await screen.findByRole('list', { name: '회수 실행 결과' });
    expect(screen.getByText('확정 합계 1건')).toBeDefined();
    expect(result.textContent).toContain('e-2.md');
    expect(result.textContent).toContain('회수는 완료되었지만 화면 새로고침에 실패했습니다');
  });

  it('moves focus to the next, previous, then picker when a focused subject is removed', async () => {
    function Controlled() {
      const [subjects, setSubjects] = useState([subject('u-1'), subject('u-2'), subject('u-3')]);
      return <BulkRevokePanel contextKey={`ctx:${subjects.map((one) => one.id).join(',')}`} workspaceId="ws-1" subjects={subjects} plan={{ state: 'loading' }} onPick={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} onRemove={(id) => setSubjects((was) => was.filter((one) => one.id !== id))} />;
    }
    render(<Controlled />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'u-2 제거' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'u-3 제거' })));
    await user.click(screen.getByRole('button', { name: 'u-3 제거' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'u-1 제거' })));
    await user.click(screen.getByRole('button', { name: 'u-1 제거' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('사용자·그룹 검색')));
  });

  it('uses the corrected irreversible system-group copy', () => {
    const system = { ...subject('g-1'), kind: 'group' as const, system: true };
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws-1" subjects={[system]} plan={{ state: 'loading' }} onPick={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByTestId('system-group-notice').textContent).toContain('걷힌 항목');
    expect(screen.getByTestId('system-group-notice').textContent).not.toContain('걷은 항목');
  });
});

describe('issue #69 simulation and inheritance truthfulness', () => {
  it('simulation hides a response for a different selected subject and distinguishes idle/error/empty', async () => {
    const retry = vi.fn();
    const selected = subject('u-1', '한범');
    const view = render(<SimulationPanel workspaceId="ws-1" selectedSubject={selected} query={{ state: 'ready', data: { subjectId: 'u-2', nodes: [] } }} />);
    expect(screen.getByRole('alert').textContent).toContain('선택한 주체와 일치하지 않습니다');
    view.rerender(<SimulationPanel workspaceId="ws-1" selectedSubject={selected} query={{ state: 'error', onRetry: retry }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '시뮬레이션 다시 시도' }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(<SimulationPanel workspaceId="ws-1" selectedSubject={selected} query={{ state: 'ready', data: { subjectId: 'u-1', nodes: [] } }} />);
    expect(screen.getByText('표시할 유효 권한 결과가 없습니다.')).toBeDefined();
  });

  it('never renders ready simulation data without selected subject identity and names local overflow', () => {
    render(<SimulationPanel workspaceId="ws-1" selectedSubject={null} query={{ state: 'ready', data: { subjectId: 'u-1', nodes: [{ nodeId: 'n-1', workspaceId: 'ws-1', workspaceName: '기획팀', path: '문서', level: 'view', source: 'direct' }] } }} onPick={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('시뮬레이션 주체를 선택');
    expect(screen.queryByRole('table')).toBeNull();

    cleanup();
    render(<SimulationPanel workspaceId="ws-1" selectedSubject={subject('u-1')} query={{ state: 'ready', data: { subjectId: 'u-1', nodes: [{ nodeId: 'n-1', workspaceId: 'ws-1', workspaceName: '기획팀', path: '문서', level: 'view', source: 'direct' }] } }} onPick={vi.fn()} />);
    expect(screen.getByRole('region', { name: '시뮬레이션 결과 표' })).toBeDefined();
  });

  it('inheritance loading/error are not empty and unsupported restoration stays disabled', () => {
    const retry = vi.fn();
    const view = render(<InheritanceAuditPanel query={{ state: 'loading' }} />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByText('상속이 끊긴 노드가 없습니다.')).toBeNull();
    view.rerender(<InheritanceAuditPanel query={{ state: 'error', onRetry: retry }} />);
    expect(screen.getByRole('alert')).toBeDefined();
    view.rerender(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [{ nodeId: 'n-1', workspaceId: 'ws-1', workspaceName: '기획팀', path: '닫힌방', aclAccessors: 0 }] } }} />);
    const button = screen.getByRole('button', { name: /상속으로 되돌리기/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('상속 변경의 영향을 확인할 수 없습니다.')).toBeDefined();
  });
});
