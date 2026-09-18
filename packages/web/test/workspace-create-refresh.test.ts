import { describe, expect, it, vi } from 'vitest';

import { refetchWorkspaceCreationReads } from '../src/App.js';

describe('IR-WORKSPACE-001 — accepted creation refresh outcome', () => {
  it('reports a failed authoritative read instead of treating the settled promise as success', async () => {
    const refetchQueries = vi.fn((_filter: unknown, options?: { throwOnError?: boolean }) =>
      options?.throwOnError === true ? Promise.reject(new Error('refresh failed')) : Promise.resolve());

    const refreshed = await refetchWorkspaceCreationReads({ refetchQueries } as never);

    expect(refreshed).toBe(false);
    expect(refetchQueries).toHaveBeenCalledTimes(4);
    expect(refetchQueries.mock.calls.every((call) => call[1]?.throwOnError === true)).toBe(true);
  });
});
