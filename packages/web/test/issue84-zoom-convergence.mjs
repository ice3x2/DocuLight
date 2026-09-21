const close = (actual, expected, tolerance = 0.01) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Wait for both the extension label and the rendered CSS coordinate system. */
export async function waitForZoomConvergence({ read, width, height, zoom, timeoutMs = 5000, pollMs = 16 }) {
  const expectedWidth = width / zoom;
  const expectedHeight = height / zoom;
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  let last = null;
  while (Date.now() <= deadline) {
    last = await read();
    const matches = close(last.browserZoom, zoom)
      && close(last.innerWidth, expectedWidth, 1)
      && close(last.innerHeight, expectedHeight, 1)
      && close(last.devicePixelRatio, zoom)
      && close(last.visualViewportWidth, expectedWidth, 1)
      && close(last.visualViewportHeight, expectedHeight, 1)
      && close(last.visualViewportScale, 1)
      && last.resolutionMatches === true;
    if (matches && previous !== null
      && close(previous.innerWidth, last.innerWidth, 0.01)
      && close(previous.innerHeight, last.innerHeight, 0.01)
      && close(previous.devicePixelRatio, last.devicePixelRatio, 0.001)) return last;
    previous = matches ? last : null;
    await sleep(pollMs);
  }
  throw new Error(`zoom convergence timeout: expected ${JSON.stringify({ width: expectedWidth, height: expectedHeight, zoom })}, last ${JSON.stringify(last)}`);
}
