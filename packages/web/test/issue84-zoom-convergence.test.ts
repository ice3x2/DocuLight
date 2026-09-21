import { describe, expect, it, vi } from 'vitest';

import { waitForZoomConvergence } from './issue84-zoom-convergence.mjs';

const settled = (zoom: number, width: number, height: number) => ({
  browserZoom: zoom,
  innerWidth: width / zoom,
  innerHeight: height / zoom,
  devicePixelRatio: zoom,
  visualViewportWidth: width / zoom,
  visualViewportHeight: height / zoom,
  visualViewportScale: 1,
  resolutionMatches: true,
});

describe('issue #84 true browser zoom convergence', () => {
  it('waits through stale getZoom/render samples for 100→200→100 and viewport changes', async () => {
    const reads = [
      settled(1, 1280, 720), settled(1, 1280, 720),
      { ...settled(2, 1280, 720), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
      settled(2, 1280, 720), settled(2, 1280, 720),
      { ...settled(1, 1920, 1080), innerWidth: 960, innerHeight: 540, devicePixelRatio: 2 },
      settled(1, 1920, 1080), settled(1, 1920, 1080),
    ];
    const read = vi.fn(async () => reads.shift()!);

    await expect(waitForZoomConvergence({ read, width: 1280, height: 720, zoom: 1, timeoutMs: 100 })).resolves.toMatchObject({ innerWidth: 1280, devicePixelRatio: 1 });
    await expect(waitForZoomConvergence({ read, width: 1280, height: 720, zoom: 2, timeoutMs: 100 })).resolves.toMatchObject({ innerWidth: 640, devicePixelRatio: 2 });
    await expect(waitForZoomConvergence({ read, width: 1920, height: 1080, zoom: 1, timeoutMs: 100 })).resolves.toMatchObject({ innerWidth: 1920, devicePixelRatio: 1 });
    expect(read).toHaveBeenCalledTimes(8);
  });

  it('fails closed when browser zoom and CSS render state do not converge', async () => {
    const read = vi.fn(async () => ({ ...settled(2, 1280, 720), innerWidth: 1280, devicePixelRatio: 1 }));
    await expect(waitForZoomConvergence({ read, width: 1280, height: 720, zoom: 2, timeoutMs: 5, pollMs: 0 })).rejects.toThrow(/zoom convergence timeout/);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['false', false],
  ])('fails closed when resolutionMatches is %s', async (_label, resolutionMatches) => {
    const read = vi.fn(async () => {
      const sample = { ...settled(1, 1280, 720), resolutionMatches };
      if (resolutionMatches === undefined) delete (sample as { resolutionMatches?: boolean | null }).resolutionMatches;
      return sample;
    });

    await expect(waitForZoomConvergence({ read, width: 1280, height: 720, zoom: 1, timeoutMs: 100, pollMs: 0 })).rejects.toThrow(/zoom convergence timeout/);
  });
});
