import fs from 'node:fs';

const allowlist = JSON.parse(fs.readFileSync(new URL('./issue87-red-allowlist.json', import.meta.url), 'utf8'));
const diagnosticPattern = /^(?<type>(?:Error|[A-Z][A-Za-z0-9]*(?:Error|Exception))):\s*(?<message>.+)$/gm;

const expectedBrowserSentinels = [
  { type: 'builds-complete', server: true, web: true },
  { type: 'fixture-complete', server: true, database: true, vault: true },
  { type: 'preview-post-timeout', method: 'POST', path: '/api/settings/retention-impact', timeoutMs: 30000 },
  { type: 'browser-red-complete', checkerExitCode: 87 },
];

function secondaryDiagnostics(report) {
  return [...`${report.stdout}\n${report.stderr}`.matchAll(diagnosticPattern)]
    .map(({ groups }) => ({ type: groups.type, message: groups.message }));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeVitestResult(result) {
  if (result.success !== false || (result.unhandledErrors?.length ?? 0) !== 0) {
    throw new Error('vitest result was not a clean expected RED');
  }
  const normalized = { total: result.numTotalTests, failed: [], passed: [] };
  for (const suite of result.testResults) {
    if (suite.message !== '') throw new Error('vitest suite contained an unexpected secondary error');
    for (const assertion of suite.assertionResults) {
      if (assertion.status === 'passed') {
        if (assertion.failureMessages.length !== 0) throw new Error('passing assertion contained an error');
        normalized.passed.push(assertion.fullName);
        continue;
      }
      if (assertion.status !== 'failed' || assertion.failureMessages.length !== 1) {
        throw new Error('vitest assertion had an unexpected status or secondary error');
      }
      const firstLine = assertion.failureMessages[0].split(/\r?\n/, 1)[0];
      const match = firstLine.match(/^([A-Za-z][A-Za-z0-9]*Error):\s*(.*)$/);
      normalized.failed.push({ id: assertion.fullName, errorType: match?.[1] ?? 'Error', message: match?.[2] ?? firstLine });
    }
  }
  return normalized;
}

export function parseSentinels(output) {
  return output.split(/\r?\n/).filter((line) => line.startsWith('ISSUE87_RED_SENTINEL '))
    .map((line) => JSON.parse(line.slice('ISSUE87_RED_SENTINEL '.length)));
}

export function validateRedReport(name, report) {
  const common = report.exitCode === 1 && report.signal === null && report.timedOut === false;
  let failureContract;
  if (name === 'server' || name === 'web') {
    const expected = allowlist[name];
    if (!same(report.structuredResult, expected)) throw new Error(`unexpected RED outcome for ${name}`);
    failureContract = { kind: 'vitest', failed: expected.failed.length, passed: expected.passed.length, total: expected.total };
  } else if (name === 'browser') {
    if (!same(report.sentinels, expectedBrowserSentinels)) throw new Error('unexpected RED outcome for browser');
    failureContract = { kind: 'playwright-response-timeout', method: 'POST', path: '/api/settings/retention-impact', timeoutMs: 30000 };
  } else {
    throw new Error(`unexpected RED outcome for ${name}`);
  }
  if (!common || secondaryDiagnostics(report).length !== 0) throw new Error(`unexpected RED outcome for ${name}`);
  return failureContract;
}
