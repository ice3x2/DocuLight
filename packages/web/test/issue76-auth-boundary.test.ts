import { describe, expect, it, vi } from 'vitest';

import {
  createAuthBoundary,
  createAuthAttemptLock,
  classifyAuthMutation,
  runProtected,
  type LiveDraftRegistration,
} from '../src/auth/auth-boundary.js';

it('does not let an old finally release a newer owner-generation-attempt lock', () => {
  const lock = createAuthAttemptLock();
  const oldAttempt = { userId: 'user-a', generation: 1, attempt: 1 };
  const newAttempt = { userId: 'user-b', generation: 2, attempt: 2 };
  expect(lock.acquire(oldAttempt)).toBe(true);
  lock.clear();
  expect(lock.acquire(newAttempt)).toBe(true);
  expect(lock.release(oldAttempt)).toBe(false);
  expect(lock.current()).toEqual(newAttempt);
  expect(lock.release(newAttempt)).toBe(true);
  expect(lock.current()).toBeNull();
});

const surface = (overrides: Partial<LiveDraftRegistration> = {}): LiveDraftRegistration => ({
  owner: { userId: 'user-a', generation: 4 },
  nodeId: 'node-a',
  revision: 'hash-a',
  mode: 'live',
  read: () => 'latest editor bytes',
  acknowledged: () => 'server bytes',
  state: () => 'saved',
  composing: () => false,
  freeze: vi.fn(),
  ...overrides,
});

describe('IR-SHELL-009 protected task gate', () => {
  it('does not dispatch while the owner attempt is uncertain', async () => {
    const boundary = createAuthBoundary();
    const owner = { userId: 'user-a', generation: 3 };
    boundary.activate(owner);
    const attempt = boundary.beginAttempt(owner)!;
    boundary.markChecking(attempt);
    boundary.markUncertain(attempt);
    let calls = 0;

    const result = await runProtected(boundary, owner, async () => { calls += 1; return 'secret'; });

    expect(result).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('drops a delayed continuation after its owner loses authority', async () => {
    const boundary = createAuthBoundary();
    const owner = { userId: 'user-a', generation: 3 };
    boundary.activate(owner);
    let finish!: (value: string) => void;
    let continued = false;
    const pending = runProtected(
      boundary,
      owner,
      () => new Promise<string>((resolve) => { finish = resolve; }),
      () => { continued = true; },
    );
    boundary.end();
    finish('old-owner-secret');

    expect(await pending).toBeUndefined();
    expect(continued).toBe(false);
  });
});

describe('IR-SHELL-009 AC-7 auth mutation preflight', () => {
  it('captures the live reader instead of the query body and freezes before returning', () => {
    const boundary = createAuthBoundary();
    const registration = surface();
    boundary.register(registration);

    const result = boundary.preflight({ userId: 'user-a', generation: 4 });

    expect(registration.freeze).toHaveBeenCalledWith(true);
    expect(result).toEqual({
      kind: 'drafts',
      records: [{
        id: expect.any(String),
        nodeId: 'node-a',
        revision: 'hash-a',
        mode: 'live',
        text: 'latest editor bytes',
      }],
    });
  });

  it('blocks composition and treats saving/conflict/rejected as at risk even with equal bytes', () => {
    const boundary = createAuthBoundary();
    boundary.register(surface({ owner: { userId: 'user-a', generation: 1 }, composing: () => true }));
    expect(boundary.preflight({ userId: 'user-a', generation: 1 })).toEqual({ kind: 'composition' });

    boundary.clearRegistrations();
    for (const state of ['saving', 'conflict', 'rejected'] as const) {
      boundary.register(surface({ owner: { userId: 'user-a', generation: 2 }, acknowledged: () => 'latest editor bytes', state: () => state }));
    }
    expect(boundary.preflight({ userId: 'user-a', generation: 2 })).toMatchObject({
      kind: 'drafts', records: [{ text: 'latest editor bytes' }, { text: 'latest editor bytes' }, { text: 'latest editor bytes' }],
    });
  });
});

describe('IR-SHELL-009 AC-8~10 mutation outcomes and quarantine isolation', () => {
  it.each([
    ['logout', 204, 'accepted'],
    ['logout', 400, 'unknown'],
    ['logout', 401, 'unknown'],
    ['password', 204, 'accepted'],
    ['password', 400, 'rejected'],
    ['password', 401, 'ended'],
    ['password', 500, 'unknown'],
  ] as const)('%s %s is %s', (operation, status, expected) => {
    expect(classifyAuthMutation(operation, status)).toBe(expected);
  });

  it('quarantines exact bytes for the old owner and discloses nothing to another account', () => {
    const boundary = createAuthBoundary();
    boundary.register(surface({ owner: { userId: 'user-a', generation: 7 } }));
    boundary.quarantine({ userId: 'user-a', generation: 7 });

    expect(boundary.recoveryFor('user-b')).toEqual([]);
    expect(boundary.recoveryFor('user-a')).toMatchObject([{ text: 'latest editor bytes', nodeId: 'node-a' }]);
    expect(boundary.recoveryFor('user-a')[0]?.fileName).toBe('local-draft-1.md');
  });

  it('captures only registrations owned by the exact user and generation', () => {
    const boundary = createAuthBoundary();
    boundary.register(surface({ owner: { userId: 'user-a', generation: 7 }, read: () => 'current owner bytes' }));
    boundary.register(surface({ owner: { userId: 'user-a', generation: 6 }, read: () => 'stale generation bytes' }));
    boundary.register(surface({ owner: { userId: 'user-b', generation: 7 }, read: () => 'other owner bytes' }));

    expect(boundary.quarantine({ userId: 'user-a', generation: 7 })).toMatchObject([
      { text: 'current owner bytes', userId: 'user-a', generation: 7 },
    ]);
    expect(boundary.recoveryFor('user-a').map(({ text }) => text)).toEqual(['current owner bytes']);
    expect(boundary.recoveryFor('user-b')).toEqual([]);
  });
});

describe('IR-SHELL-009 AC-8~13 owner/attempt operation gate', () => {
  it('allows protected work only for the exact active owner', () => {
    const boundary = createAuthBoundary();
    const owner = { userId: 'user-a', generation: 3 };
    expect(boundary.allowsProtected(owner)).toBe(false);
    boundary.activate(owner);
    expect(boundary.allowsProtected(owner)).toBe(true);
    expect(boundary.allowsProtected({ userId: 'user-a', generation: 2 })).toBe(false);
    expect(boundary.allowsProtected({ userId: 'user-b', generation: 3 })).toBe(false);
  });

  it('blocks synchronously from preflight through checking/uncertain until explicit resume', () => {
    const boundary = createAuthBoundary();
    const owner = { userId: 'user-a', generation: 3 };
    boundary.activate(owner);
    const attempt = boundary.beginAttempt(owner);
    expect(attempt).not.toBeNull();
    expect(boundary.phase()).toBe('preflight');
    expect(boundary.allowsProtected(owner)).toBe(false);
    expect(boundary.markPosting(attempt!)).toBe(true);
    expect(boundary.phase()).toBe('posting');
    expect(boundary.markChecking(attempt!)).toBe(true);
    expect(boundary.markUncertain(attempt!)).toBe(true);
    expect(boundary.phase()).toBe('uncertain');
    expect(boundary.resume(attempt!)).toBe(true);
    expect(boundary.phase()).toBe('active');
    expect(boundary.allowsProtected(owner)).toBe(true);
  });

  it('ignores obsolete attempt callbacks after terminal end or owner replacement', () => {
    const boundary = createAuthBoundary();
    const oldOwner = { userId: 'user-a', generation: 3 };
    boundary.activate(oldOwner);
    const oldAttempt = boundary.beginAttempt(oldOwner)!;
    expect(boundary.end(oldAttempt)).toBe(true);
    expect(boundary.phase()).toBe('ended');
    expect(boundary.markUncertain(oldAttempt)).toBe(false);

    const newOwner = { userId: 'user-b', generation: 4 };
    boundary.activate(newOwner);
    expect(boundary.resume(oldAttempt)).toBe(false);
    expect(boundary.allowsProtected(newOwner)).toBe(true);
    expect(boundary.allowsProtected(oldOwner)).toBe(false);
  });

  it('rejects every transition and continuation check from an old terminal attempt after a new login', () => {
    const boundary = createAuthBoundary();
    const oldOwner = { userId: 'user-a', generation: 3 };
    boundary.activate(oldOwner);
    const oldAttempt = boundary.beginAttempt(oldOwner)!;
    expect(boundary.markPosting(oldAttempt)).toBe(true);
    expect(boundary.end(oldAttempt)).toBe(true);

    const newOwner = { userId: 'user-b', generation: 4 };
    boundary.activate(newOwner);
    expect(boundary.markChecking(oldAttempt)).toBe(false);
    expect(boundary.end(oldAttempt)).toBe(false);
    expect(boundary.isCurrentAttempt(oldAttempt)).toBe(false);
    expect(boundary.phase()).toBe('active');
    expect(boundary.allowsProtected(newOwner)).toBe(true);
  });
});
