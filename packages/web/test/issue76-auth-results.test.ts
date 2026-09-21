import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchIdentity, requestLogout, requestPasswordChange } from '../src/api/client.js';

const response = (body: unknown, status: number) => new Response(
  status === 204 ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
);

afterEach(() => vi.unstubAllGlobals());

describe('IR-SHELL-009 explicit authentication results', () => {
  it.each([
    [{}, { kind: 'malformed' }],
    [{ userId: '' }, { kind: 'malformed' }],
    [{ userId: 7 }, { kind: 'malformed' }],
  ])('returns a malformed identity result for %j', async (body, expected) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response(body, 200))));
    await expect(fetchIdentity()).resolves.toEqual(expected);
  });

  it.each([400, 401, 500])('returns an explicit identity HTTP %s result', async (status) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({}, status))));
    await expect(fetchIdentity()).resolves.toEqual({ kind: 'http-error', status });
  });

  it.each([
    ['logout', 400], ['logout', 401], ['logout', 500],
    ['password', 400], ['password', 401], ['password', 500],
  ] as const)('returns an explicit %s HTTP %s result', async (operation, status) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({ rule: 'wrong-password' }, status))));
    const result = operation === 'logout'
      ? requestLogout()
      : requestPasswordChange({ current: 'old', next: 'new' });
    await expect(result).resolves.toEqual({ kind: 'http-error', status, rule: 'wrong-password' });
  });
});
