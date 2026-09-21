import assert from 'node:assert/strict';
import test from 'node:test';

import { assertEvidenceSecretFree, redactEvidenceSecrets } from './issue80-evidence-secrets.mjs';

const join = (...parts) => parts.join('');

test('IR-PRINCIPAL-002 evidence scanner rejects known credential and cookie forms', () => {
  const leaks = [
    join('설치 토큰', ': ', 'abcDEF_1234567890'),
    join('Authorization', ': ', 'Bearer ', 'eyJhbGciOiJIUzI1NiJ9.payload.signature'),
    join('Cookie', ': ', 'session=', 'abcDEF1234567890'),
    join('Set-Cookie', ': ', 'sid=', 'abcDEF1234567890; HttpOnly'),
  ];
  for (const leak of leaks) {
    assert.throws(() => assertEvidenceSecretFree([{ path: 'raw.txt', content: leak }]), /evidence secret detected/);
  }
});

test('IR-PRINCIPAL-002 evidence redaction is deterministic and accepted by the scanner', () => {
  const raw = [
    'marker',
    join('설치 토큰', ': ', 'abcDEF_1234567890'),
    join('Authorization', ': ', 'Bearer ', 'eyJhbGciOiJIUzI1NiJ9.payload.signature'),
    join('Set-Cookie', ': ', 'sid=', 'abcDEF1234567890; HttpOnly'),
    'failure identity',
  ].join('\n');
  const once = redactEvidenceSecrets(raw);
  const twice = redactEvidenceSecrets(once);
  assert.equal(once, twice);
  assert.match(once, /설치 토큰: \[REDACTED\]/);
  assert.match(once, /Authorization: Bearer \[REDACTED\]/);
  assert.match(once, /Set-Cookie: \[REDACTED\]/);
  assert.match(once, /marker/);
  assert.match(once, /failure identity/);
  assert.doesNotThrow(() => assertEvidenceSecretFree([{ path: 'raw.txt', content: once }]));
});

test('IR-PRINCIPAL-002 evidence scanner permits labels and explicit redaction markers', () => {
  assert.doesNotThrow(() => assertEvidenceSecretFree([{ path: 'safe.txt', content: [
    '설치 토큰: [REDACTED]',
    'Authorization: Bearer [REDACTED]',
    'Cookie: [REDACTED]',
    'passwordManagerUi: nonblocking-unverified',
  ].join('\n') }]));
});

test('IR-PRINCIPAL-002 evidence scanner decodes UTF-16LE PowerShell raw logs', () => {
  const leak = join('설치 토큰', ': ', 'utf16Secret_1234567890');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leak, 'utf16le')]);
  assert.throws(() => assertEvidenceSecretFree([{ path: 'powershell-raw.txt', content: utf16 }]), /install-token/);
  assert.equal(redactEvidenceSecrets(utf16), '설치 토큰: [REDACTED]');
});
