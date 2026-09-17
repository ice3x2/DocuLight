import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuditViewBody, ReconciliationQueueBody } from '../src/api/client.js';
import { AuditLogPanel, type AuditReadState } from '../src/audit/AuditLogPanel.js';
import { AppShell } from '../src/shell/AppShell.js';

afterEach(() => cleanup());

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  occurredAt: '2026-09-18 10:00:00',
  operation: 'acl.grant',
  actor: '관리자 한범',
  target: '설계/아주 긴 감사 대상 문서.md',
  counterpart: null,
  ...over,
});

const audit = (over: Partial<AuditViewBody> = {}): AuditViewBody => ({
  groups: [
    {
      operation: 'acl.grant',
      actor: '관리자 한범',
      occurredAt: '2026-09-18 10:00:00',
      rows: [
        row('row-1', {
          subject: '문서 수신자 김하늘',
          level: 'edit',
          beforeValue: '<이전 값>',
          afterValue: '<바뀐 값>',
        }),
      ],
    },
  ],
  operations: ['acl.grant', '새로운.서버.조작'],
  ...over,
});

const queue = (count = 1): ReconciliationQueueBody => ({
  items: Array.from({ length: count }, (_, index) => ({ id: `finding-${index}`, type: 'unknown.future-type' })),
});

describe('GitHub #70 — 감사와 재조정 대기열의 독립 읽기 상태', () => {
  it('감사 실패 중에도 대기열로 이동하고 각 읽기만 다시 시도한다', async () => {
    const auditRetry = vi.fn();
    const queueRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <AuditLogPanel
        audit={{ state: 'error', onRetry: auditRetry }}
        queueState={{ state: 'ready', data: queue(2) }}
      />,
    );

    expect(screen.getByText('감사 로그를 불러오지 못했습니다.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '재조정 대기열' }));
    expect(screen.getAllByTestId('queue-item')).toHaveLength(2);

    rerender(
      <AuditLogPanel
        audit={{ state: 'ready', data: audit() }}
        queueState={{ state: 'error', onRetry: queueRetry }}
      />,
    );
    expect(screen.getByText('재조정 대기열을 불러오지 못했습니다.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(queueRetry).toHaveBeenCalledOnce();
    expect(auditRetry).not.toHaveBeenCalled();
  });

  it('loading은 busy이고 성공한 빈 결과와 구별된다', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogPanel
        audit={{ state: 'loading' }}
        queueState={{ state: 'loading' }}
      />,
    );

    expect(screen.getByRole('region', { name: '감사 로그 결과' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('기록된 감사 행이 없습니다.')).toBeNull();
    await user.click(screen.getByRole('button', { name: '재조정 대기열' }));
    expect(screen.getByRole('region', { name: '재조정 대기열 결과' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('미해소 항목이 없습니다.')).toBeNull();
  });
});

describe('GitHub #70 — 필터와 그룹 상세의 진실성', () => {
  it('대기열을 다녀와도 같은 첫 행 ID의 펼침 상태를 보존한다', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogPanel
        audit={{ state: 'ready', data: audit() }}
        queueState={{ state: 'ready', data: queue(1) }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /acl\.grant/ }));
    expect(screen.getByRole('button', { name: /acl\.grant/ }).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: '재조정 대기열' }));
    await user.click(screen.getByRole('button', { name: '감사 로그' }));
    expect(screen.getByRole('button', { name: /acl\.grant/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('권한 문맥이 바뀌면 같은 행 ID라도 이전 펼침 상태를 버린다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AuditLogPanel audit={{ state: 'ready', data: audit() }} contextKey="account-a:scope-a" />,
    );
    await user.click(screen.getByRole('button', { name: /acl\.grant/ }));
    expect(screen.getByRole('button', { name: /acl\.grant/ }).getAttribute('aria-expanded')).toBe('true');
    const detailTarget = screen.getByTestId('audit-row');
    detailTarget.tabIndex = 0;
    detailTarget.focus();

    rerender(<AuditLogPanel audit={{ state: 'ready', data: audit() }} contextKey="account-b:scope-b" />);
    expect(screen.getByRole('button', { name: /acl\.grant/ }).getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '감사 로그' })));
  });

  it('새 응답이 초점 소유 묶음을 제거하면 남은 안정 식별자 요약으로 초점을 복구한다', async () => {
    const user = userEvent.setup();
    const second = {
      operation: 'node.move', actor: '다른 관리자', occurredAt: '2026-09-18 11:00:00',
      rows: [row('row-2', { operation: 'node.move', actor: '다른 관리자' })],
    };
    const { rerender } = render(
      <AuditLogPanel audit={{ state: 'ready', data: audit({ groups: [...audit().groups, second] }) }} />,
    );
    await user.click(screen.getByRole('button', { name: /acl\.grant/ }));
    const detailTarget = screen.getAllByTestId('audit-row')[0]!;
    detailTarget.tabIndex = 0;
    detailTarget.focus();

    rerender(<AuditLogPanel audit={{ state: 'ready', data: audit({ groups: [second] }) }} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /node\.move/ })));
  });

  it('성공 응답에서 선택 조작이 사라지면 전체로 되돌리고 알린다', () => {
    const onOperation = vi.fn();
    render(
      <AuditLogPanel
        operation="사라진.조작"
        onOperation={onOperation}
        audit={{ state: 'ready', data: audit({ operations: ['acl.grant'] }) }}
        queueState={{ state: 'ready', data: queue(0) }}
      />,
    );

    expect(onOperation).toHaveBeenCalledWith('');
    expect(screen.getByRole('status').textContent).toContain('전체');
    expect(within(screen.getByLabelText('조작')).getAllByRole('option').map((one) => one.textContent)).toEqual([
      '전체',
      'acl.grant',
    ]);
  });

  it('disclosure 관계와 낱행의 각 사실을 의미 있는 라벨로 보인다', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogPanel
        audit={{ state: 'ready', data: audit() }}
        queueState={{ state: 'ready', data: queue(0) }}
      />,
    );

    const disclosure = screen.getByRole('button', { name: /acl\.grant/ });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.getAttribute('aria-controls')).toBeTruthy();
    await user.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');

    const detail = document.getElementById(disclosure.getAttribute('aria-controls')!);
    expect(detail).not.toBeNull();
    expect(within(detail!).getByText('문서 수신자 김하늘')).toBeDefined();
    expect(within(detail!).getByText('편집')).toBeDefined();
    expect(within(detail!).getByText('<이전 값>')).toBeDefined();
    expect(within(detail!).getByText('<바뀐 값>')).toBeDefined();
    expect(within(detail!).getByText('2026-09-18 10:00:00')).toBeDefined();
    expect(detail!.querySelector('[data-testid="audit-subject"]')?.previousElementSibling?.textContent).toBe('주체');
  });

  it('없는 선택 필드는 DOM에서 생략하고 null 대상만 중립 기호로 보인다', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogPanel
        audit={{
          state: 'ready',
          data: audit({
            groups: [
              {
                operation: 'node.create',
                actor: '관리자',
                occurredAt: '2026-09-18 11:00:00',
                rows: [row('row-empty', { operation: 'node.create', target: null })],
              },
            ],
          }),
        }}
        queueState={{ state: 'ready', data: queue(0) }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /node\.create/ }));
    const detail = screen.getByTestId('audit-row');
    expect(detail.querySelector('[data-testid="audit-subject"]')).toBeNull();
    expect(detail.querySelector('[data-testid="audit-level"]')).toBeNull();
    expect(detail.textContent).toContain('—');
    expect(detail.textContent).not.toMatch(/unknown user|알 수 없는 사용자/);
  });
});

describe('GitHub #70 — 감사 카테고리 배지 상태', () => {
  const renderSettings = (queueState: AuditReadState<ReconciliationQueueBody>) =>
    render(
      <AppShell
        viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }}
        audit={{ state: 'ready', data: audit() }}
        queueState={queueState}
      />,
    );

  it.each([
    [{ state: 'ready', data: queue(0) } as const, '0', '미해소 항목 0개'],
    [{ state: 'ready', data: queue(3) } as const, '3', '미해소 항목 3개'],
    [{ state: 'loading' } as const, '…', '미해소 항목 불러오는 중'],
    [{ state: 'error', onRetry: vi.fn() } as const, '!', '미해소 항목을 불러오지 못함'],
  ])('성공 0을 포함하고 loading/error에는 숫자를 가장하지 않는다', async (state, text, label) => {
    const user = userEvent.setup();
    renderSettings(state);
    await user.click(screen.getByRole('button', { name: '설정' }));

    const badge = await screen.findByTestId('queue-badge');
    expect(badge.textContent).toBe(text);
    expect(badge.getAttribute('aria-label')).toBe(label);
  });
});
