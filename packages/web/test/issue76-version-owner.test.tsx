import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VersionHistory } from '../src/document/VersionHistory.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IR-SHELL-009 exact owner guards for version history', () => {
  it('settles pending work while authorization is false and refetches when the same owner epoch resumes', async () => {
    let finishFirst!: (value: Response) => void;
    let finishSecond!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      if (fetcher.mock.calls.length === 1) finishFirst = resolve;
      else finishSecond = resolve;
    }));
    vi.stubGlobal('fetch', fetcher);
    const owner = { userId: 'user-a', generation: 4 };
    const view = render(<VersionHistory nodeId="n1" currentBody="current" owner={owner} authorizationPhase="active" authorizationEpoch={9} allowsProtected={() => true} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    view.rerender(<VersionHistory nodeId="n1" currentBody="current" owner={owner} authorizationPhase="uncertain" authorizationEpoch={9} allowsProtected={() => false} />);
    expect(document.querySelector('[data-version-history]')?.getAttribute('aria-busy')).toBeNull();
    finishFirst(json([{ seq: 1 }]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[data-version-list]')).toBeNull();
    view.rerender(<VersionHistory nodeId="n1" currentBody="current" owner={owner} authorizationPhase="active" authorizationEpoch={9} allowsProtected={() => true} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    finishSecond(json([{ seq: 1 }]));
    const row = await screen.findByRole('listitem');
    expect(within(row).getAllByRole('button').every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });
  it('does not dispatch list, compare, or restore after the owner phase closes', async () => {
    let allowed = false;
    const fetcher = vi.fn(() => Promise.resolve(json([])));
    vi.stubGlobal('fetch', fetcher);
    render(<VersionHistory nodeId="n1" currentBody="current" allowsProtected={() => allowed} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetcher).not.toHaveBeenCalled();

    cleanup();
    allowed = true;
    const secondFetcher = vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      if (path.endsWith('/versions')) return Promise.resolve(json([{ seq: 1 }]));
      return Promise.resolve(json({ seq: 1, body: 'old' }));
    });
    vi.stubGlobal('fetch', secondFetcher);
    render(<VersionHistory nodeId="n1" currentBody="current" allowsProtected={() => allowed} />);
    const row = await screen.findByRole('listitem');
    allowed = false;
    const buttons = within(row).getAllByRole('button');
    buttons[0]!.click();
    buttons[1]!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondFetcher).toHaveBeenCalledTimes(1);
  });

  it('drops late list and compare continuations after the exact owner closes', async () => {
    let allowed = true;
    let finishList!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finishList = resolve; })));
    render(<VersionHistory nodeId="n1" currentBody="current" allowsProtected={() => allowed} />);
    allowed = false;
    finishList(json([{ seq: 1 }]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[data-version-list]')).toBeNull();

    cleanup();
    allowed = true;
    let finishCompare!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      if (path.endsWith('/versions')) return Promise.resolve(json([{ seq: 1 }]));
      return new Promise<Response>((resolve) => { finishCompare = resolve; });
    }));
    render(<VersionHistory nodeId="n1" currentBody="current" allowsProtected={() => allowed} />);
    (await screen.findByRole('listitem')).querySelector('button')!.click();
    allowed = false;
    finishCompare(json({ seq: 1, body: 'old owner bytes' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[data-merge]')).toBeNull();
  });

  it('drops a late restore success and leaves replacement-owner focus untouched', async () => {
    let allowed = true;
    let finishRestore!: (value: Response) => void;
    const onRestored = vi.fn();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path.endsWith('/versions')) return Promise.resolve(json([{ seq: 1 }]));
      if (init?.method === 'POST') return new Promise<Response>((resolve) => { finishRestore = resolve; });
      return Promise.resolve(json(null, 404));
    }));
    render(<><button data-replacement>replacement</button><VersionHistory nodeId="n1" currentBody="current" onRestored={onRestored} allowsProtected={() => allowed} /></>);
    (await screen.findByRole('listitem')).querySelectorAll('button')[1]!.click();
    allowed = false;
    const replacement = document.querySelector<HTMLButtonElement>('[data-replacement]')!;
    replacement.focus();
    finishRestore(new Response(null, { status: 204 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRestored).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(replacement);
  });
});
