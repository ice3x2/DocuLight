import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { DocumentArea, type DocumentReadState } from '../src/document/DocumentArea.js';
import type { TabState } from '../src/document/tab-state.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const routes = new Map<string, (init?: RequestInit) => Response | Promise<Response>>();

beforeEach(() => {
  routes.clear();
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).split('?')[0]!;
    const requestInit = typeof Request !== 'undefined' && url instanceof Request ? { method: url.method } : init;
    return Promise.resolve(routes.get(path)?.(requestInit) ?? json(null, 404));
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('IR-SHELL-009 AC-5 session bootstrap precedence', () => {
  it('does not mount the protected shell before the fresh identity is established', async () => {
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    let finishIdentity!: (response: Response) => void;
    routes.set('/api/auth/me', () => new Promise<Response>((resolve) => { finishIdentity = resolve; }));
    render(<App queryClient={client()} />);
    await waitFor(() => expect(finishIdentity).toBeDefined());
    expect(document.querySelector('[data-shell="root"]')).toBeNull();

    finishIdentity(json({ userId: 'user-a' }));
    expect(await screen.findByRole('button', { name: '설정' })).toBeDefined();
  });

  it('keeps the protected shell unmounted when the initial identity request fails and exposes only a retry', async () => {
    let identityReads = 0;
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => {
      identityReads += 1;
      return json({}, 500);
    });
    render(<App queryClient={client()} />);

    const alert = await screen.findByRole('alert', { name: '로그인 계정 확인 오류' });
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
    await userEvent.setup().click(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(identityReads).toBe(2));
  });

  it.each([
    ['500', () => json({}, 500)],
    ['429', () => json({}, 429)],
    ['bare 503', () => json({}, 503)],
    ['transport rejection', () => Promise.reject(new TypeError('network unavailable'))],
  ])('%s terminal failure shows a retryable request error instead of loading/login/install', async (_label, response) => {
    let reads = 0;
    routes.set('/api/session', () => { reads += 1; return response(); });
    const user = userEvent.setup();
    render(<App queryClient={client()} />);

    const alert = await screen.findByRole('alert', { name: '애플리케이션 오류' });
    expect(alert.textContent).toContain('애플리케이션을 불러오지 못했습니다.');
    expect(alert.textContent).toContain('연결 상태를 확인한 뒤 다시 시도하세요.');
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
    expect(screen.queryByRole('main', { name: '로그인' })).toBeNull();
    expect(screen.queryByText(/설치 토큰/)).toBeNull();

    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(reads).toBe(2));
  });

  it('only authoritative uninstalled 503 opens installation', async () => {
    routes.set('/api/session', () => json({ state: 'uninstalled' }, 503));
    render(<App queryClient={client()} />);
    expect(await screen.findByRole('main', { name: '설치 마법사' })).toBeDefined();
    expect(screen.queryByRole('alert', { name: '애플리케이션 오류' })).toBeNull();
  });

  it('shows neutral authentication-ended copy only after this App established a session', async () => {
    let authorized = true;
    routes.set('/api/session', () => authorized
      ? json({ superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 })
      : json({}, 401));
    routes.set('/api/tree', () => json([]));
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByRole('button', { name: '설정' })).toBeDefined();
    await waitFor(() => expect(queryClient.getQueryData(['identity'])).toEqual({ kind: 'ok', userId: 'user-a' }));

    authorized = false;
    await queryClient.refetchQueries({ queryKey: ['session'] });
    expect(await screen.findByText('로그인이 해제되었습니다. 다시 로그인하세요.')).toBeDefined();
    expect(screen.getByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
  });

  it('does not invent an ended-session explanation on the first anonymous 401', async () => {
    routes.set('/api/session', () => json({}, 401));
    render(<App queryClient={client()} />);
    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
    expect(screen.queryByText('로그인이 해제되었습니다. 다시 로그인하세요.')).toBeNull();
  });
});

const tabState: TabState = {
  tabs: [{ nodeId: 'n1', name: '회의록.md', breadcrumb: ['기획팀', '회의록.md'], save: 'saved', level: 'edit' }],
  activeId: 'n1',
};

function area(readState?: DocumentReadState, body?: string) {
  return render(
    <DocumentArea
      state={tabState}
      onState={() => undefined}
      readStates={readState === undefined ? {} : { n1: readState }}
      bodies={body === undefined ? {} : { n1: body }}
      hashes={body === undefined ? {} : { n1: 'h1' }}
    />,
  );
}

describe('IR-SHELL-009 AC-5 document state ownership', () => {
  it('preserves one exact editor instance in an inert AT-hidden host while the requested URL owns loading, pending, and error', () => {
    const view = render(
      <DocumentArea state={tabState} onState={() => undefined} bodies={{ n1: 'EXACT-RETAINED' }} hashes={{ n1: 'h1' }} />,
    );
    const surface = document.querySelector('[data-document-surface]');
    expect(surface).not.toBeNull();

    view.rerender(<DocumentArea state={tabState} onState={() => undefined} bodies={{ n1: 'EXACT-RETAINED' }} hashes={{ n1: 'h1' }} requestedState={{ state: 'loading' }} />);
    const retained = document.querySelector('[data-retained-document-host]') as HTMLElement;
    expect(retained.hidden).toBe(true);
    expect(retained.hasAttribute('inert')).toBe(true);
    expect(retained.getAttribute('aria-hidden')).toBe('true');
    expect(retained.querySelector('[data-document-surface]')).toBe(surface);
    expect(screen.getByRole('status', { name: '문서를 불러오는 중입니다.' })).toBeDefined();

    view.rerender(<DocumentArea state={tabState} onState={() => undefined} bodies={{ n1: 'EXACT-RETAINED' }} hashes={{ n1: 'h1' }} requestedState={{ state: 'pending' }} />);
    expect(document.querySelector('[data-retained-document-host]')?.querySelector('[data-document-surface]')).toBe(surface);
    expect(screen.getByRole('status', { name: '문서 전환 확인 중입니다.' })).toBeDefined();

    view.rerender(<DocumentArea state={tabState} onState={() => undefined} bodies={{ n1: 'EXACT-RETAINED' }} hashes={{ n1: 'h1' }} requestedState={{ state: 'error', onRetry: () => undefined }} />);
    expect(document.querySelector('[data-retained-document-host]')?.querySelector('[data-document-surface]')).toBe(surface);
    expect(screen.getByRole('alert', { name: '문서 오류' })).toBeDefined();
  });
  it('no route and no tabs explains how to select a document', () => {
    render(<DocumentArea state={{ tabs: [], activeId: null }} onState={() => undefined} />);
    expect(screen.getByText('문서를 선택하세요.')).toBeDefined();
    expect(screen.getByText('왼쪽 목록에서 문서를 열 수 있습니다.')).toBeDefined();
  });

  it('an unavailable initial route has the indistinguishable exact copy and no action', () => {
    render(<DocumentArea state={{ tabs: [], activeId: null }} onState={() => undefined} missing />);
    const missing = screen.getByText('문서를 찾을 수 없습니다');
    expect(missing.closest('[data-slot="empty-state"]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toContain('권한');
  });

  it('does not mount the document surface while the initial body is pending', () => {
    area({ state: 'loading' });
    expect(screen.getByRole('status', { name: '문서를 불러오는 중입니다.' })).toBeDefined();
    expect(document.querySelector('[data-document-surface]')).toBeNull();
  });

  it('shows a safe exact-read retry for a failed initial body request', async () => {
    const retry = vi.fn();
    area({ state: 'error', onRetry: retry });
    const alert = screen.getByRole('alert', { name: '문서 오류' });
    expect(alert.textContent).toContain('문서를 불러오지 못했습니다.');
    expect(alert.textContent).toContain('연결 상태를 확인한 뒤 다시 시도하세요.');
    await userEvent.setup().click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-document-surface]')).toBeNull();
  });

  it('shows the same unavailable copy for an initial body 404', () => {
    area({ state: 'missing' });
    expect(screen.getByText('문서를 찾을 수 없습니다')).toBeDefined();
    expect(document.querySelector('[data-document-surface]')).toBeNull();
  });

  it('treats an authoritative empty string as a ready document', () => {
    area({ state: 'ready' }, '');
    expect(document.querySelector('[data-document-surface]')).not.toBeNull();
    expect(screen.queryByText('문서를 불러오는 중입니다.')).toBeNull();
  });
});

const TREE = [{
  workspace: { id: 'ws-1', name: '기획팀' },
  visibility: 'full',
  roots: [{ id: 'n1', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] }],
}];

function authenticated(tree: unknown = TREE) {
  routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
  routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
  routes.set('/api/tree', () => json(tree));
}

describe('IR-SHELL-009 AC-5 App document query handoff', () => {
  it('never commits old-owner document content after identity changes to another owner', async () => {
    authenticated();
    let serverOwner = 'a';
    routes.set('/api/documents/n1', () => json(serverOwner === 'a'
      ? { body: 'OWNER-A-SECRET', hash: 'a1' }
      : { body: 'OWNER-B-BODY', hash: 'b1' }));
    window.history.replaceState({}, '', '/d/n1');
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByText('OWNER-A-SECRET')).toBeDefined();
    const frames: string[] = [];
    const observer = new MutationObserver(() => {
      if ((queryClient.getQueryData(['identity']) as { userId?: string } | undefined)?.userId === 'user-b') {
        frames.push(document.body.textContent ?? '');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    serverOwner = 'b';
    queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-b' });
    await waitFor(() => expect(queryClient.getQueryData(['identity'])).toEqual({ kind: 'ok', userId: 'user-b' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    expect(frames.every((frame) => !frame.includes('OWNER-A-SECRET'))).toBe(true);
  });

  it('captures the mounted live draft before a spontaneous identity replacement tears down the old owner', async () => {
    authenticated();
    routes.set('/api/documents/n1', () => json({ body: 'OWNER-A-SAVED', hash: 'a1' }));
    window.history.replaceState({}, '', '/d/n1');
    const queryClient = client();
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);

    expect(await screen.findByText('OWNER-A-SAVED')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '편집', exact: true }));
    await user.click(screen.getByRole('button', { name: '소스', exact: true }));
    const source = screen.getByLabelText('원문') as HTMLTextAreaElement;
    await user.clear(source);
    await user.type(source, 'OWNER-A-LATEST-LIVE-BYTES');

    queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-b' });
    await waitFor(() => expect(document.querySelector('[data-document-surface]')).toBeNull());
    expect(document.body.textContent).not.toContain('OWNER-A-LATEST-LIVE-BYTES');
    expect(document.querySelector('textarea')?.value ?? '').not.toContain('OWNER-A-LATEST-LIVE-BYTES');

    queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-a' });
    const recovery = await screen.findByLabelText('로컬 편집 내용');
    expect((recovery as HTMLTextAreaElement).value).toBe('OWNER-A-LATEST-LIVE-BYTES');
    expect(document.querySelector('[data-document-surface]')).toBeNull();
  });

  it('uses fresh authority for each popstate and ignores a late older A-B-A resolver', async () => {
    const tree = [{
      workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [
        { id: 'n1', name: 'A.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: 'B.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    }];
    authenticated(tree);
    let treeReads = 0;
    const resolvers: Array<(response: Response) => void> = [];
    routes.set('/api/tree', () => {
      treeReads += 1;
      if (treeReads === 1) return json(tree);
      return new Promise<Response>((resolve) => { resolvers.push(resolve); });
    });
    routes.set('/api/documents/n1', () => json({ body: 'A', hash: 'a1' }));
    routes.set('/api/documents/n2', () => json({ body: 'B', hash: 'b1' }));
    window.history.replaceState({}, '', '/d/n1');
    render(<App queryClient={client()} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /A\.md/ }).getAttribute('aria-selected')).toBe('true'));

    window.history.replaceState({}, '', '/d/n2');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    window.history.replaceState({}, '', '/d/n1');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await waitFor(() => expect(treeReads).toBe(3));
    resolvers[1]!(json(tree));
    await waitFor(() => expect(screen.getByRole('tab', { name: /A\.md/ }).getAttribute('aria-selected')).toBe('true'));
    resolvers[0]!(json(tree));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('tab', { name: /A\.md/ }).getAttribute('aria-selected')).toBe('true');
    expect(window.location.pathname).toBe('/d/n1');
  });

  it('hides the prior body behind requested-target loading and retryable error states', async () => {
    const tree = [{
      workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [
        { id: 'n1', name: 'A.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: 'B.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    }];
    authenticated(tree);
    let treeReads = 0;
    let finish!: (response: Response) => void;
    routes.set('/api/tree', () => {
      treeReads += 1;
      return treeReads === 1 ? json(tree) : new Promise<Response>((resolve) => { finish = resolve; });
    });
    routes.set('/api/documents/n1', () => json({ body: 'OWNER-A-BODY', hash: 'a1' }));
    routes.set('/api/documents/n2', () => json({ body: 'OWNER-B-BODY', hash: 'b1' }));
    window.history.replaceState({}, '', '/d/n1');
    render(<App queryClient={client()} />);
    expect(await screen.findByText('OWNER-A-BODY')).toBeDefined();

    const acceptedMark = (window.history.state as { __doculight: { epoch: string; key: string; index: number } }).__doculight;
    const targetMark = {
      epoch: acceptedMark.epoch,
      key: `${acceptedMark.epoch}:pending-n2`,
      index: acceptedMark.index + 1,
    };
    window.history.pushState({ __doculight: targetMark }, '', '/d/n2');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    expect(await screen.findByRole('status', { name: '문서를 불러오는 중입니다.' })).toBeDefined();
    expect((document.querySelector('[data-retained-document-host]') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('[data-retained-document-host]')?.getAttribute('aria-hidden')).toBe('true');
    finish(json({}, 500));

    const error = await screen.findByRole('alert', { name: '문서 오류' });
    expect((document.querySelector('[data-retained-document-host]') as HTMLElement).hidden).toBe(true);
    const retry = within(error).getByRole('button', { name: '다시 시도' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(treeReads).toBe(3));
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(error.getAttribute('aria-busy')).toBe('true');
    finish(json(tree));
    expect(await screen.findByText('OWNER-B-BODY')).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('banner', { name: '문서 헤더' })));
  });

  it('forwards an initial GET failure and retries only that document GET', async () => {
    authenticated();
    let documentReads = 0;
    routes.set('/api/documents/n1', () => {
      documentReads += 1;
      return documentReads === 1 ? json({}, 500) : json({ body: '', hash: 'h2' });
    });
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));

    const alert = await screen.findByRole('alert', { name: '문서 오류' });
    expect(documentReads).toBe(1);
    expect(document.querySelector('[data-document-surface]')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(documentReads).toBe(2));
    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('banner', { name: '문서 헤더' }));
  });

  it('keeps the mounted editor instance when a later body refetch fails', async () => {
    authenticated();
    let fail = false;
    let reads = 0;
    routes.set('/api/documents/n1', () => {
      reads += 1;
      return fail ? json({}, 500) : json({ body: '보존할 본문', hash: 'h1' });
    });
    const queryClient = client();
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
    await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull());
    const surface = document.querySelector('[data-document-surface]');

    fail = true;
    await queryClient.refetchQueries({ queryKey: ['document', 'n1'] });
    const refreshNotice = (await screen.findAllByText('문서를 새로 불러오지 못했습니다.'))[0]!.closest('[data-slot="inline-notice"]')!;
    expect(document.querySelector('[data-document-surface]')).toBe(surface);
    const retry = within(refreshNotice as HTMLElement).getByRole('button', { name: '다시 시도' });
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(reads).toBe(3));
    await waitFor(() => expect(screen.queryAllByText('문서를 새로 불러오지 못했습니다.')).toHaveLength(0));
    expect(document.querySelector('[data-document-surface]')).toBe(surface);
    expect(document.body.textContent).toContain('보존할 본문');
  });

  it('evicts a mounted authoritative 404 and preserves only exact at-risk local bytes', async () => {
    authenticated();
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    let denied = false;
    routes.set('/api/documents/n1', () => denied
      ? json({}, 404)
      : json({ body: 'server body', hash: 'h1' }));
    const queryClient = client();
    const user = userEvent.setup();
    window.history.pushState({}, '', '/d/n1');
    render(<App queryClient={queryClient} />);

    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    fireEvent.change(await screen.findByLabelText('원문'), { target: { value: 'private unsaved suffix' } });
    denied = true;
    await queryClient.refetchQueries({ queryKey: ['document', 'n1'] });

    expect(await screen.findByText('문서를 찾을 수 없습니다')).toBeDefined();
    expect(document.querySelector('[data-document-surface]')).toBeNull();
    await waitFor(() => expect(document.querySelector('[data-document-area]')?.textContent).not.toContain('회의록.md'));
    const rescue = screen.getByRole('textbox', { name: '로컬 편집 내용' }) as HTMLTextAreaElement;
    expect(rescue.readOnly).toBe(true);
    expect(rescue.value).toBe('private unsaved suffix');

    denied = false;
    await user.click(within(await screen.findByRole('complementary', { name: '좌측 사이드바' })).getByRole('button', { name: /회의록\.md/ }));
    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
    expect((screen.getByRole('textbox', { name: '로컬 편집 내용' }) as HTMLTextAreaElement).value).toBe('private unsaved suffix');
  });

  it('treats an authoritative tree omission after ACL loss like mounted 404 recovery', async () => {
    authenticated();
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    routes.set('/api/documents/n1', () => json({ body: 'server body', hash: 'h1' }));
    let denied = false;
    routes.set('/api/tree', () => json(denied ? [] : TREE));
    const user = userEvent.setup();
    window.history.pushState({}, '', '/d/n1');
    render(<App queryClient={client()} />);

    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    fireEvent.change(await screen.findByLabelText('원문'), { target: { value: 'tree omission local bytes' } });
    denied = true;
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));

    expect(await screen.findByText('문서를 찾을 수 없습니다')).toBeDefined();
    await waitFor(() => expect(document.querySelector('[data-document-surface]')).toBeNull());
    expect((screen.getByRole('textbox', { name: '로컬 편집 내용' }) as HTMLTextAreaElement).value).toBe('tree omission local bytes');
  });

  it('classifies a requested ID as missing after an authoritative successful empty tree', async () => {
    authenticated([]);
    window.history.pushState({}, '', '/d/n-never');
    render(<App queryClient={client()} />);
    expect(await screen.findByText('문서를 찾을 수 없습니다')).toBeDefined();
    expect(screen.queryByText('문서를 선택하세요.')).toBeNull();
  });

  it('does not automatically repeat an unavailable document GET', async () => {
    authenticated();
    let reads = 0;
    routes.set('/api/documents/n1', () => { reads += 1; return json({}, 404); });
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
    expect(await screen.findByText('문서를 찾을 수 없습니다')).toBeDefined();
    expect(reads).toBe(1);
  });

  it('does not hide a document 500 behind an automatic query retry', async () => {
    authenticated();
    let reads = 0;
    routes.set('/api/documents/n1', () => { reads += 1; return json({}, 500); });
    const retryingClient = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
    render(<App queryClient={retryingClient} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    fireEvent.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
    await waitFor(() => expect(reads).toBe(1));
    expect(await screen.findByRole('alert', { name: '문서 오류' })).toBeDefined();
    expect(reads).toBe(1);
  });

  it('terminalizes the established owner when a document read returns 401', async () => {
    authenticated();
    routes.set('/api/documents/n1', () => json({}, 401));
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));

    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
  });

  it('does not present a stale successful tree as current after its refresh fails', async () => {
    let failTree = false;
    authenticated();
    routes.set('/api/tree', () => failTree ? json({}, 500) : json(TREE));
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    expect(await within(sidebar).findByRole('button', { name: /회의록\.md/ })).toBeDefined();

    failTree = true;
    await queryClient.refetchQueries({ queryKey: ['tree'] });
    expect(await within(sidebar).findByRole('alert')).toBeDefined();
    expect(within(sidebar).queryByRole('button', { name: /회의록\.md/ })).toBeNull();
  });

  it('guards same-tick duplicate retry activation while the exact GET is pending', async () => {
    authenticated();
    let reads = 0;
    let finish!: (response: Response) => void;
    routes.set('/api/documents/n1', () => {
      reads += 1;
      return reads === 1 ? json({}, 500) : new Promise<Response>((resolve) => { finish = resolve; });
    });
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
    const documentError = await screen.findByRole('alert', { name: '문서 오류' });
    const retry = within(documentError).getByRole('button', { name: '다시 시도' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(true));
    expect(retry.getAttribute('aria-busy')).toBe('true');
    expect(documentError.getAttribute('aria-busy')).toBe('true');
    finish(json({ body: '회복', hash: 'h2' }));
    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
  });
  it('treats root navigation as no selection and ignores a late document pop response', async () => {
    const tree = [{
      workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [
        { id: 'n1', name: 'A.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: 'B.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    }];
    authenticated(tree);
    let reads = 0;
    let finish!: (response: Response) => void;
    routes.set('/api/tree', () => {
      reads += 1;
      return reads === 2 ? new Promise<Response>((resolve) => { finish = resolve; }) : json(tree);
    });
    routes.set('/api/documents/n1', () => json({ body: 'A body', hash: 'a1' }));
    window.history.replaceState({}, '', '/d/n1');
    render(<App queryClient={client()} />);
    expect(await screen.findByText('A body')).toBeDefined();

    window.history.pushState({}, '', '/d/n2');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    expect(await screen.findByText('문서를 선택하세요.')).toBeDefined();
    await waitFor(() => expect(document.querySelector('[data-document-header]')).toBeNull());
    finish(json(tree));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('[data-document-header]')).toBeNull();
    expect(document.body.textContent).not.toContain('B body');
  });

  it('invalidates a late pop resolver when a newer tree selection wins', async () => {
    const tree = [{
      workspace: { id: 'ws-1', name: '공간' }, visibility: 'full', roots: [
        { id: 'n1', name: 'A.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: 'B.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n3', name: 'C.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    }];
    authenticated(tree);
    let treeReads = 0;
    let finish!: (response: Response) => void;
    routes.set('/api/tree', () => ++treeReads === 2
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : json(tree));
    routes.set('/api/documents/n1', () => json({ body: 'A body', hash: 'a1' }));
    routes.set('/api/documents/n3', () => json({ body: 'C body', hash: 'c1' }));
    window.history.replaceState({}, '', '/d/n1');
    render(<App queryClient={client()} />);
    expect(await screen.findByText('A body')).toBeDefined();

    window.history.pushState({}, '', '/d/n2');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await waitFor(() => expect(treeReads).toBe(2));
    await userEvent.setup().click(screen.getByRole('button', { name: /C\.md/ }));
    expect(await screen.findByText('C body')).toBeDefined();
    finish(json(tree));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.pathname).toBe('/d/n3');
    expect(screen.getByText('C body')).toBeDefined();
    expect(document.body.textContent).not.toContain('B body');
  });

  it('keeps the exact pending editor pane mounted while a pop replacement awaits confirmation', async () => {
    const tree = [{
      workspace: { id: 'ws-1', name: '공간' }, visibility: 'full', roots: [
        { id: 'n1', name: 'A.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: 'B.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    }];
    authenticated(tree);
    routes.set('/api/documents/n1', (init) => init?.method === 'PUT'
      ? json({}, 500)
      : json({ body: 'server A', hash: 'a1' }));
    routes.set('/api/documents/n1/session', () => json({ session: 'edit-1' }));
    routes.set('/api/documents/n2', () => json({ body: 'server B', hash: 'b1' }));
    window.history.replaceState({}, '', '/d/n1');
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    expect(await screen.findByText('server A')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    fireEvent.change(await screen.findByLabelText('원문'), { target: { value: 'EXACT-PENDING-PANE' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === '/api/documents/n1' && init?.method === 'PUT')).toBe(true));
    await waitFor(() => expect(document.querySelector('[data-document-header]')?.textContent).toContain('저장 거부됨'));

    const acceptedMark = (window.history.state as { __doculight: { epoch: string; key: string; index: number } }).__doculight;
    const targetMark = {
      epoch: acceptedMark.epoch,
      key: `${acceptedMark.epoch}:pending-n2`,
      index: acceptedMark.index + 1,
    };
    window.history.pushState({ __doculight: targetMark }, '', '/d/n2');
    fireEvent(window, new PopStateEvent('popstate', { state: window.history.state }));
    const confirmation = await screen.findByRole('alertdialog');
    const retainedSurface = document.querySelector('[data-document-surface]');
    expect((document.querySelector('[data-source-editor]') as HTMLTextAreaElement).value).toBe('EXACT-PENDING-PANE');
    const retainedHost = document.querySelector('[data-retained-document-host]') as HTMLElement;
    expect(retainedHost.hidden).toBe(true);
    expect(retainedHost.hasAttribute('inert')).toBe(true);
    expect(retainedHost.getAttribute('aria-hidden')).toBe('true');
    expect(retainedHost.querySelector('[data-document-surface]')).toBe(retainedSurface);

    await user.click(within(confirmation).getByRole('button', { name: '머무르기' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.querySelector('[data-retained-document-host]')?.hasAttribute('hidden')).toBe(false));
    expect(document.querySelector('[data-document-surface]')).toBe(retainedSurface);
    expect((document.querySelector('[data-source-editor]') as HTMLTextAreaElement).value).toBe('EXACT-PENDING-PANE');

    window.history.replaceState({ __doculight: targetMark }, '', '/d/n2');
    fireEvent(window, new PopStateEvent('popstate', { state: window.history.state }));
    const secondConfirmation = await screen.findByRole('alertdialog');
    await user.click(within(secondConfirmation).getByRole('button', { name: '그래도 열기' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /B\.md/ }).getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(document.querySelector('[data-document-content][data-state="active"]')?.textContent).toContain('server B'));
    expect(document.querySelector('[data-document-surface]')).not.toBe(retainedSurface);
  });
});

describe('IR-SHELL-009 AC-7~10 authentication boundary wiring', () => {
  it.each([
    ['malformed', () => json({})],
    ['http500', () => json({}, 500)],
    ['network', () => { throw new TypeError('identity network'); }],
  ])('keeps an established owner mounted and frozen when identity refetch becomes %s', async (_label, failure) => {
    let identityReads = 0;
    let sessionReads = 0;
    let writes = 0;
    routes.set('/api/session', () => { sessionReads += 1; return json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }); });
    routes.set('/api/auth/me', () => {
      identityReads += 1;
      if (identityReads === 1 || identityReads >= 3) return json({ userId: 'user-a' });
      return failure();
    });
    routes.set('/api/tree', () => json(TREE));
    routes.set('/api/documents/n1', () => json({ body: 'ESTABLISHED-EXACT-BYTES', hash: 'h1' }));
    routes.set('/api/nodes', () => { writes += 1; return json({ id: 'n2', name: 'new.md' }); });
    window.history.replaceState({}, '', '/d/n1');
    const queryClient = client();
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByText('ESTABLISHED-EXACT-BYTES')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    const surface = document.querySelector('[data-document-surface]');
    const source = await screen.findByLabelText('원문') as HTMLTextAreaElement;

    await queryClient.refetchQueries({ queryKey: ['identity'] });
    await waitFor(() => expect(document.querySelector('[data-auth-uncertainty]')).not.toBeNull());
    const uncertainty = document.querySelector('[data-auth-uncertainty]') as HTMLElement;
    expect(document.querySelector('[data-document-surface]')).toBe(surface);
    expect(source.value).toBe('ESTABLISHED-EXACT-BYTES');
    expect(source.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '새 노트' }));
    expect(writes).toBe(0);

    const before = { identityReads, sessionReads };
    const retry = within(uncertainty).getByRole('button', { name: '로그인 상태 다시 확인' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(identityReads).toBe(before.identityReads + 1));
    expect(sessionReads).toBe(before.sessionReads + 1);
    await user.click(await screen.findByRole('button', { name: '편집 계속' }));
    expect(document.querySelector('[data-document-surface]')).toBe(surface);
    expect(source.value).toBe('ESTABLISHED-EXACT-BYTES');
    expect(source.readOnly).toBe(false);
  });

  it('ends an established owner on identity 401 without exposing the mounted editor', async () => {
    let identityReads = 0;
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => ++identityReads === 1 ? json({ userId: 'user-a' }) : json({}, 401));
    routes.set('/api/tree', () => json(TREE));
    routes.set('/api/documents/n1', () => json({ body: 'TERMINAL-PRIVATE-BYTES', hash: 'h1' }));
    window.history.replaceState({}, '', '/d/n1');
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByText('TERMINAL-PRIVATE-BYTES')).toBeDefined();
    await queryClient.refetchQueries({ queryKey: ['identity'] });
    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-document-surface]')).toBeNull();
    expect(document.body.textContent).not.toContain('TERMINAL-PRIVATE-BYTES');
  });

  it('isolates the old editor when identity retry establishes a different owner', async () => {
    let identityReads = 0;
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => {
      identityReads += 1;
      if (identityReads === 1) return json({ userId: 'user-a' });
      if (identityReads === 2) return json({});
      return json({ userId: 'user-b' });
    });
    routes.set('/api/tree', () => json(TREE));
    routes.set('/api/documents/n1', () => json({ body: 'OWNER-A-RETRY-SECRET', hash: 'h1' }));
    window.history.replaceState({}, '', '/d/n1');
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByText('OWNER-A-RETRY-SECRET')).toBeDefined();
    await queryClient.refetchQueries({ queryKey: ['identity'] });
    await waitFor(() => expect(document.querySelector('[data-auth-uncertainty]')).not.toBeNull());
    const uncertainty = document.querySelector('[data-auth-uncertainty]') as HTMLElement;
    fireEvent.click(within(uncertainty).getByRole('button', { name: '로그인 상태 다시 확인' }));
    await waitFor(() => expect(queryClient.getQueryData(['identity'])).toEqual({ kind: 'ok', userId: 'user-b' }));
    expect(document.body.textContent).not.toContain('OWNER-A-RETRY-SECRET');
  });

  it.each([
    ['logout unknown', 'logout', 500],
    ['password rule failure', 'password', 400],
    ['password unknown', 'password', 500],
  ] as const)('%s keeps exact editor bytes frozen and retries with GET only after malformed identity 200', async (_label, operation, status) => {
    let identityReads = 0;
    let sessionReads = 0;
    let authPosts = 0;
    let writes = 0;
    routes.set('/api/session', () => {
      sessionReads += 1;
      return json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 });
    });
    routes.set('/api/auth/me', () => {
      identityReads += 1;
      return identityReads === 1 ? json({ userId: 'user-a' }) : json({});
    });
    routes.set('/api/tree', () => json(TREE));
    routes.set('/api/documents/n1', () => json({ body: 'EXACT-AUTH-EDITOR-BYTES', hash: 'h1' }));
    routes.set('/api/nodes', () => { writes += 1; return json({ id: 'n2', name: 'new.md' }); });
    routes.set('/api/auth/logout', () => { authPosts += 1; return json({}, status); });
    routes.set('/api/auth/password', () => {
      authPosts += 1;
      return status === 400 ? json({ rule: 'wrong-password' }, 400) : json({}, status);
    });
    window.history.replaceState({}, '', '/d/n1');
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    expect(await screen.findByText('EXACT-AUTH-EDITOR-BYTES')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    const source = await screen.findByLabelText('원문') as HTMLTextAreaElement;
    const originalSurface = document.querySelector('[data-document-surface]');
    expect(source.value).toBe('EXACT-AUTH-EDITOR-BYTES');

    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '계정' }));
    if (operation === 'logout') {
      await user.click(screen.getByRole('button', { name: '로그아웃' }));
    } else {
      await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
      await user.type(await screen.findByLabelText('현재 비밀번호'), 'current-value');
      await user.type(screen.getByLabelText('새 비밀번호'), 'next-value');
      await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    }

    await waitFor(() => expect(authPosts).toBe(1));
    expect(document.querySelector('[data-document-surface]')).toBe(originalSurface);
    expect(source.value).toBe('EXACT-AUTH-EDITOR-BYTES');
    expect(source.readOnly).toBe(true);
    const uncertainty = document.querySelector('[data-auth-uncertainty]') as HTMLElement | null;
    expect(uncertainty).not.toBeNull();
    await user.click(screen.getByRole('button', { name: '설정 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '새 노트' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toBe(0);
    expect(authPosts).toBe(1);
    const readsBeforeRetry = { identityReads, sessionReads };
    await user.click(within(uncertainty!).getByRole('button', { name: '로그인 상태 다시 확인' }));
    await waitFor(() => expect(identityReads).toBeGreaterThan(readsBeforeRetry.identityReads));
    expect(sessionReads).toBeGreaterThan(readsBeforeRetry.sessionReads);
    expect(authPosts).toBe(1);
    expect(source.value).toBe('EXACT-AUTH-EDITOR-BYTES');
  });

  it('blocks protected writes after an unknown logout and failed identity check', async () => {
    authenticated();
    let identityReads = 0;
    routes.set('/api/auth/me', () => ++identityReads === 1 ? json({ userId: 'user-a' }) : json({}, 500));
    routes.set('/api/auth/logout', () => json({}, 500));
    let writes = 0;
    routes.set('/api/nodes', () => { writes += 1; return json({ id: 'n2', name: '제목 없음.md' }); });
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '계정' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByText('현재 로그인 상태를 확인하지 못했습니다.')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '설정 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '새 노트' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toBe(0);
  });

  it('blocks protected writes when an established session refresh becomes uncertain', async () => {
    let sessionFailed = false;
    routes.set('/api/session', () => sessionFailed
      ? json({}, 500)
      : json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    let treeReads = 0;
    routes.set('/api/tree', () => { treeReads += 1; return json(TREE); });
    let writes = 0;
    routes.set('/api/nodes', () => { writes += 1; return json({ id: 'n2', name: '제목 없음.md' }); });
    const queryClient = client();
    render(<App queryClient={queryClient} />);
    expect(await screen.findByRole('button', { name: '새 노트' })).toBeDefined();
    sessionFailed = true;
    await queryClient.refetchQueries({ queryKey: ['session'] });
    await waitFor(() => expect(document.querySelector('[data-auth-uncertainty]')).not.toBeNull());
    await queryClient.invalidateQueries({ queryKey: ['tree'] });
    expect(treeReads).toBe(1);
    expect(await screen.findByText('현재 로그인 상태를 확인하지 못했습니다.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '새 노트' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes).toBe(0);
  });

  it('does not send voluntary logout until the exact live source draft is explicitly discarded', async () => {
    authenticated();
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    routes.set('/api/documents/n1', () => json({ body: 'server body', hash: 'h1' }));
    let logoutPosts = 0;
    routes.set('/api/auth/logout', () => { logoutPosts += 1; return new Response(null, { status: 204 }); });
    const user = userEvent.setup();
    const queryClient = client();
    window.history.pushState({}, '', '/d/n1');
    render(<App queryClient={queryClient} />);

    await waitFor(() => expect(document.querySelector('[data-document-surface]')).not.toBeNull());
    await waitFor(() => expect(queryClient.getQueryData(['identity'])).toEqual({ kind: 'ok', userId: 'user-a' }));
    await user.click(await screen.findByRole('button', { name: '편집' }));
    await user.click(screen.getByRole('button', { name: '소스' }));
    fireEvent.change(await screen.findByLabelText('원문'), { target: { value: 'latest source bytes' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '계정' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(logoutPosts).toBe(0);
    const handoff = await screen.findByRole('dialog', { name: '편집 내용 보관' });
    expect(handoff.textContent).toContain('편집 내용을 보관한 뒤 계속하세요.');
    expect(document.querySelector('[data-protected-shell]')?.hasAttribute('inert')).toBe(true);
    expect(handoff.contains(document.activeElement)).toBe(true);
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false);
    await user.click(within(handoff).getByRole('button', { name: '취소' }));
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
    expect((screen.getByLabelText('원문') as HTMLTextAreaElement).readOnly).toBe(false);
    expect((screen.getByLabelText('원문') as HTMLTextAreaElement).value).toBe('latest source bytes');
    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    const resumedHandoff = await screen.findByRole('dialog', { name: '편집 내용 보관' });
    await user.click(within(resumedHandoff).getByRole('button', { name: '편집본을 버리고 계속' }));
    await waitFor(() => expect(logoutPosts).toBe(1));
    expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
  });

  it('latches accepted logout immediately and ignores a late session 200', async () => {
    authenticated();
    routes.set('/api/auth/me', () => json({ userId: 'user-a' }));
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/logout', () => new Response(null, { status: 204 }));
    const queryClient = client();
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '계정' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
    queryClient.setQueryData(['session'], { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
  });
});
