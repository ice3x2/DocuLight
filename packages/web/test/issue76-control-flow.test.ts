import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('IR-SHELL-009 predictable control flow', () => {
  it('does not synthesize exceptions for blocked authentication or a missing upload target', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    expect(source).not.toContain("Promise.reject(new Error('authentication uncertain'))");
    expect(source).not.toContain("Promise.reject(new Error('대상이 없다'))");
  });

  it('uses explicit client results for malformed identity and authentication HTTP outcomes', () => {
    const client = readFileSync('src/api/client.ts', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(client).not.toContain("throw new Error('malformed identity response')");
    expect(client.match(/async function authMutation[\s\S]*?\n}/)?.[0]).not.toContain('throw new ApiError');
    expect(app).toContain("case 'malformed':");
    expect(app).toContain("case 'http-error':");
  });
});
