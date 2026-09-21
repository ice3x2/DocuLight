import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/api/client.js';
import { checkCurrentAuthentication } from '../src/auth/check-current-authentication.js';

const session200 = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

describe('IR-SHELL-009 AC-8~10 current session/identity check', () => {
  it.each([
    [new ApiError(401), undefined, { kind: 'ended' }],
    [new ApiError(500), undefined, { kind: 'uncertain' }],
    [new TypeError('network'), undefined, { kind: 'uncertain' }],
  ] as const)('classifies session failure %s without asking identity', async (sessionFailure, _unused, expected) => {
    const readIdentity = vi.fn();

    await expect(checkCurrentAuthentication(
      'user-a',
      vi.fn().mockRejectedValue(sessionFailure),
      readIdentity,
    )).resolves.toEqual(expected);
    expect(readIdentity).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'ok', userId: 'user-a' }, { kind: 'same-owner', userId: 'user-a', session: session200 }],
    [{ kind: 'ok', userId: 'user-b' }, { kind: 'different-owner', userId: 'user-b', session: session200 }],
  ] as const)('requires a valid identity after session 200: %o', async (identity, expected) => {
    await expect(checkCurrentAuthentication(
      'user-a',
      vi.fn().mockResolvedValue(session200),
      vi.fn().mockResolvedValue(identity),
    )).resolves.toEqual(expected);
  });

  it('returns the freshly verified session snapshot for owner replacement', async () => {
    await expect(checkCurrentAuthentication(
      'user-a',
      vi.fn().mockResolvedValue(session200),
      vi.fn().mockResolvedValue({ kind: 'ok', userId: 'user-b' }),
    )).resolves.toMatchObject({ kind: 'different-owner', userId: 'user-b', session: session200 });
  });

  it.each([
    [new ApiError(401), { kind: 'ended' }],
    [new ApiError(500), { kind: 'uncertain' }],
    [new TypeError('network'), { kind: 'uncertain' }],
    [new Error('malformed identity response'), { kind: 'uncertain' }],
  ] as const)('keeps identity failures distinct after session 200: %s', async (identityFailure, expected) => {
    await expect(checkCurrentAuthentication(
      'user-a',
      vi.fn().mockResolvedValue(session200),
      vi.fn().mockRejectedValue(identityFailure),
    )).resolves.toEqual(expected);
  });

  it.each([
    [{ kind: 'malformed' }, { kind: 'uncertain' }],
    [{ kind: 'http-error', status: 500 }, { kind: 'uncertain' }],
    [{ kind: 'http-error', status: 401 }, { kind: 'ended' }],
  ] as const)('classifies explicit identity result %o', async (identity, expected) => {
    await expect(checkCurrentAuthentication(
      'user-a',
      vi.fn().mockResolvedValue(session200),
      vi.fn().mockResolvedValue(identity),
    )).resolves.toEqual(expected);
  });
});
