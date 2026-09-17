import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionHistory } from '../src/document/VersionHistory.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let restored: string[];

beforeEach(() => {
  restored = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions')
        return Promise.resolve(
          json([
            { seq: 2, createdAt: '2026-08-22T02:00:00.000Z', author: 'u1' },
            { seq: 1, createdAt: '2026-08-22T01:00:00.000Z', author: 'u2' },
          ]),
        );
      if (path === '/api/documents/n1/versions/1') return Promise.resolve(json({ seq: 1, body: '# 예전 판' }));
      if (path === '/api/documents/n1/versions/2') return Promise.resolve(json({ seq: 2, body: '# 최근 판' }));
      if (path.endsWith('/restore') && init?.method === 'POST') {
        restored.push(path);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IR-STORAGE-001 — 버전 비교·복원', () => {
  it('목록 실패를 로딩으로 숨기지 않고 같은 요청을 다시 시도한다', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(json([]));
    }));
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    expect(await screen.findByText('버전 기록을 불러오지 못했습니다.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('보관된 버전이 없습니다.')).toBeDefined();
    expect(attempts).toBe(2);
  });

  it('AC-1: 버전 목록이 뜬다', async () => {
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('AC-1 · AC-3: 한 버전을 고르면 현재 본문과 나란히 선다', async () => {
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    await user.click(within(list).getAllByRole('button', { name: /비교/ })[0]!);

    const merge = await screen.findByRole('region', { name: '버전 비교' });
    // 충돌 병합과 **같은 컴포넌트**여야 한다 — 둘을 따로 만들면 같은
    // 조작이 두 화면에서 다르게 동작한다.
    expect(merge.querySelector('[data-merge]')).not.toBeNull();
    expect(within(merge).getByLabelText('보관된 2판 전체 원문').textContent).toContain('최근 판');
    expect(within(merge).getByLabelText('현재 본문 전체 원문').textContent).toContain('지금 판');
  });

  it('AC-2: 복원을 누르면 그 버전으로 되돌린다', async () => {
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    await user.click(within(list).getAllByRole('button', { name: /복원/ })[1]!);

    await waitFor(() => expect(restored).toEqual(['/api/documents/n1/versions/1/restore']));
  });

  it('작성자와 시각이 함께 보인다 — 「누가」가 없으면 어느 것을 고를지 알 수 없다', async () => {
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    expect(list.textContent).toContain('u1');
    expect(list.textContent).toContain('u2');
  });

  it('버전이 없으면 그렇게 말한다 — 빈 목록은 고장으로 읽힌다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json([]))));
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    expect(await screen.findByText(/보관된 버전이 없습니다/)).toBeDefined();
  });
});

describe('FR-SHELL-002 AC-2 · AC-3 — 문서 헤더 메뉴가 실제로 연다', () => {
  it('AC-3: 버전 기록을 고르면 그 화면이 뜬다', async () => {
    const { ControlledDocumentArea: DocumentArea } = await import('./support/document-area.js');
    const user = userEvent.setup();
    render(
      <DocumentArea
        initial={{
          tabs: [{ nodeId: 'n1', name: '회의록.md', breadcrumb: ['회의록.md'], save: 'saved' }],
          activeId: 'n1',
        }}
        bodies={{ n1: '# 지금 판' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '회의록.md 문서 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '버전 기록' }));

    expect(await screen.findByRole('list', { name: '버전 기록' })).toBeDefined();
  });

  it('AC-2: 공유를 고르면 그 문서의 공유 모달이 뜬다', async () => {
    const { ControlledDocumentArea: DocumentArea } = await import('./support/document-area.js');
    const user = userEvent.setup();
    render(
      <DocumentArea
        initial={{
          tabs: [{ nodeId: 'n1', name: '회의록.md', breadcrumb: ['회의록.md'], save: 'saved' }],
          activeId: 'n1',
        }}
        bodies={{ n1: '# 지금 판' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '회의록.md 문서 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '공유' }));

    // 설정 모달이 아니라 **그 문서의** 모달이어야 한다 — 설정 모달에 넣으면
    // 문서 하나를 고르는 자리가 인스턴스 설정과 섞인다(`CON-SHELL-001` AC-3).
    const share = await screen.findByRole('dialog', { name: /공유/ });
    expect(share.textContent).toContain('회의록.md');
  });
});

describe('OBS-AUDIT-004 — 감사 제외의 근거가 되는 재현처', () => {
  it('AC-4 · AC-5: 버전마다 행위자와 시각이 함께 보인다', async () => {
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    const 줄 = within(list).getAllByRole('listitem');

    // md 새 버전을 감사에서 빼는 근거가 「이 화면이 행위자와 시각을 영구히
    // 재현한다」는 것이다 — 둘 중 하나라도 없으면 그 제외가 근거를 잃는다.
    expect(줄.map((one) => one.textContent)).toEqual([
      expect.stringContaining('u1'),
      expect.stringContaining('u2'),
    ]);
    expect(줄[0]!.textContent).toContain('2026-08-22T02:00:00.000Z');
    expect(줄[1]!.textContent).toContain('2026-08-22T01:00:00.000Z');
  });

});

describe('IR-STORAGE-001 — 오류, 동시성 및 비교 표현', () => {
  it('복원 실패는 완료 콜백을 호출하지 않고 같은 버전 재시도를 제공한다', async () => {
    const onRestored = vi.fn();
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions') return Promise.resolve(json([{ seq: 1, createdAt: '2026-08-22T01:00:00.000Z', author: 'u1' }]));
      if (path.endsWith('/restore') && init?.method === 'POST') {
        attempts += 1;
        return attempts === 1 ? Promise.resolve(json({ message: 'failed' }, 500)) : Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(json(null, 404));
    }));
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" onRestored={onRestored} />);

    await user.click(await screen.findByRole('button', { name: '1판 복원' }));
    expect((await screen.findByRole('alert')).textContent).toContain('버전을 복원하지 못했습니다.');
    expect(onRestored).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(attempts).toBe(2);
  });

  it('복원 요청이 진행 중이면 행과 footer의 중복 제출을 한 번으로 억제한다', async () => {
    const onRestored = vi.fn();
    let finishRestore!: () => void;
    const pendingRestore = new Promise<void>((resolve) => { finishRestore = resolve; });
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions') return Promise.resolve(json([{ seq: 2, createdAt: '2026-08-22T02:00:00.000Z', author: 'u1' }]));
      if (path === '/api/documents/n1/versions/2') return Promise.resolve(json({ seq: 2, body: '# 최근 판' }));
      if (path.endsWith('/restore') && init?.method === 'POST') {
        calls += 1;
        return pendingRestore.then(() => new Response(null, { status: 204 }));
      }
      return Promise.resolve(json(null, 404));
    }));
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" onRestored={onRestored} />);

    await user.click(await screen.findByRole('button', { name: '2판 비교' }));
    await screen.findByRole('region', { name: '버전 비교' });
    const rowRestore = screen.getByRole('button', { name: '2판 복원' });
    const footerRestore = screen.getByRole('button', { name: '이 버전으로 복원' });
    act(() => {
      rowRestore.click();
      footerRestore.click();
    });

    expect(calls).toBe(1);
    finishRestore();
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
  });

  it('늦게 끝난 이전 버전 응답은 마지막으로 고른 비교를 덮어쓰지 않는다', async () => {
    let finishOlder!: (response: Response) => void;
    const older = new Promise<Response>((resolve) => { finishOlder = resolve; });
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions') return Promise.resolve(json([
        { seq: 2, createdAt: '2026-08-22T02:00:00.000Z', author: 'u1' },
        { seq: 1, createdAt: '2026-08-22T01:00:00.000Z', author: 'u2' },
      ]));
      if (path === '/api/documents/n1/versions/2') return older;
      if (path === '/api/documents/n1/versions/1') return Promise.resolve(json({ seq: 1, body: '# 마지막 선택' }));
      return Promise.resolve(json(null, 404));
    }));
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    await user.click(await screen.findByRole('button', { name: '2판 비교' }));
    await user.click(screen.getByRole('button', { name: '1판 비교' }));
    expect(await screen.findByLabelText('보관된 1판 전체 원문')).toBeDefined();
    finishOlder(json({ seq: 2, body: '# 늦은 응답' }));

    await waitFor(() => expect(screen.queryByLabelText('보관된 2판 전체 원문')).toBeNull());
    expect(screen.getByLabelText('보관된 1판 전체 원문').textContent).toContain('# 마지막 선택');
  });

  it('같은 버전 비교가 진행 중이면 반복 click을 한 요청으로 억제한다', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    let compareCalls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions') return Promise.resolve(json([{ seq: 2, createdAt: '2026-08-22T02:00:00.000Z', author: 'u1' }]));
      if (path === '/api/documents/n1/versions/2') { compareCalls += 1; return pending; }
      return Promise.resolve(json(null, 404));
    }));
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);
    const compare = await screen.findByRole('button', { name: '2판 비교' });

    act(() => { compare.click(); compare.click(); });
    expect(compareCalls).toBe(1);
    finish(json({ seq: 2, body: '# 보관된 판' }));
    expect(await screen.findByRole('region', { name: '버전 비교' })).toBeDefined();
  });

  it('A→B→A 비교에서 진행 중인 A 요청을 재사용하면서 마지막 A 선택을 지킨다', async () => {
    let finishA!: (response: Response) => void;
    let finishB!: (response: Response) => void;
    const pendingA = new Promise<Response>((resolve) => { finishA = resolve; });
    const pendingB = new Promise<Response>((resolve) => { finishB = resolve; });
    let aCalls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/versions') return Promise.resolve(json([
        { seq: 2, createdAt: '2026-08-22T02:00:00.000Z', author: 'u1' },
        { seq: 1, createdAt: '2026-08-22T01:00:00.000Z', author: 'u2' },
      ]));
      if (path === '/api/documents/n1/versions/2') { aCalls += 1; return pendingA; }
      if (path === '/api/documents/n1/versions/1') return pendingB;
      return Promise.resolve(json(null, 404));
    }));
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);
    const a = await screen.findByRole('button', { name: '2판 비교' });
    const b = screen.getByRole('button', { name: '1판 비교' });

    act(() => { a.click(); b.click(); a.click(); });
    expect(aCalls).toBe(1);
    finishB(json({ seq: 1, body: '# 중간 선택 B' }));
    finishA(json({ seq: 2, body: '# 마지막 선택 A' }));

    expect((await screen.findByLabelText('보관된 2판 전체 원문')).textContent).toContain('# 마지막 선택 A');
    expect(screen.queryByLabelText('보관된 1판 전체 원문')).toBeNull();
  });

  it('버전 비교는 두 읽기 전용 pane과 정확한 복원 footer를 사용한다', async () => {
    const user = userEvent.setup();
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);
    await user.click(await screen.findByRole('button', { name: '2판 비교' }));

    const merge = await screen.findByRole('region', { name: '버전 비교' });
    await waitFor(() => expect(merge.querySelectorAll('.cm-editor')).toHaveLength(2));
    expect([...merge.querySelectorAll('[contenteditable]')].every((one) => one.getAttribute('contenteditable') === 'false')).toBe(true);
    expect(within(merge).getByLabelText('보관된 2판 전체 원문').textContent).toContain('# 최근 판');
    expect(within(merge).getByLabelText('현재 본문 전체 원문').textContent).toContain('# 지금 판');
    expect(screen.getByRole('status').textContent).toContain('2판 비교 준비됨');
    expect(screen.getByRole('button', { name: '2판 비교' }).getAttribute('data-variant')).toBe('secondary');
    expect(screen.getByRole('button', { name: '2판 복원' }).getAttribute('data-variant')).toBe('ghost');
    expect(screen.getByRole('button', { name: '이 버전으로 복원' }).getAttribute('data-variant')).toBe('primary');
    expect(screen.getByText('현재 본문을 2판으로 바꿉니다.')).toBeDefined();
  });

});

describe('OBS-AUDIT-004 — 감사 제외의 근거가 되는 재현처', () => {

  it('AC-3: 그 재현처가 보존 기간으로 지워지지 않는다', async () => {
    // 기간 한정 재현은 재현이 아니다. 버전 목록에 만료·보존 기간이라는
    // 개념 자체가 없다는 것이 그 성질이다.
    render(<VersionHistory nodeId="n1" currentBody="# 지금 판" />);

    const list = await screen.findByRole('list', { name: '버전 기록' });
    expect(list.textContent ?? '').not.toMatch(/만료|보존 기간|일 후 삭제/);
  });
});
