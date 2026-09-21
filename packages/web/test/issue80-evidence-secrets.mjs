const REDACTED = '[REDACTED]';

const rules = [
  {
    name: 'install-token',
    detect: /^설치 토큰:(?!\s*\[REDACTED\])\s*[^\s\r\n]+/gimu,
    redact: /^설치 토큰:\s*[^\s\r\n]+/gimu,
    replacement: `설치 토큰: ${REDACTED}`,
  },
  {
    name: 'authorization-bearer',
    detect: /^authorization:\s*bearer(?!\s+\[REDACTED\])\s+[^\s\r\n]+/gimu,
    redact: /^authorization:\s*bearer\s+[^\s\r\n]+/gimu,
    replacement: `Authorization: Bearer ${REDACTED}`,
  },
  {
    name: 'cookie-header',
    detect: /^cookie:(?![ \t]*\[REDACTED\])[ \t]*[^\r\n]+/gimu,
    redact: /^cookie:[ \t]*[^\r\n]+/gimu,
    replacement: `Cookie: ${REDACTED}`,
  },
  {
    name: 'set-cookie-header',
    detect: /^set-cookie:(?![ \t]*\[REDACTED\])[ \t]*[^\r\n]+/gimu,
    redact: /^set-cookie:[ \t]*[^\r\n]+/gimu,
    replacement: `Set-Cookie: ${REDACTED}`,
  },
  {
    name: 'csrf-header',
    detect: /^(?:x-csrf-token|csrf-token):(?!\s*\[REDACTED\])\s*[^\s\r\n]+/gimu,
    redact: /^(?:x-csrf-token|csrf-token):\s*[^\s\r\n]+/gimu,
    replacement: `X-CSRF-Token: ${REDACTED}`,
  },
  {
    name: 'credential-query',
    detect: /\b(?:access_token|refresh_token|session_token|install_token)=(?!\[REDACTED\])[^\s&#"']+/giu,
    redact: /\b(?:access_token|refresh_token|session_token|install_token)=[^\s&#"']+/giu,
    replacement: `credential_token=${REDACTED}`,
  },
];

export const decodeEvidenceContent = (content) => {
  if (!Buffer.isBuffer(content)) return String(content);
  if (content[0] === 0xff && content[1] === 0xfe) return content.subarray(2).toString('utf16le');
  return content.toString('utf8');
};

export function redactEvidenceSecrets(content) {
  let redacted = decodeEvidenceContent(content);
  for (const rule of rules) redacted = redacted.replace(rule.redact, rule.replacement);
  return redacted;
}

export function assertEvidenceSecretFree(entries) {
  const findings = [];
  for (const entry of entries) {
    const content = decodeEvidenceContent(entry.content);
    for (const rule of rules) {
      rule.detect.lastIndex = 0;
      if (rule.detect.test(content)) findings.push(`${entry.path}: ${rule.name}`);
    }
  }
  if (findings.length > 0) throw new Error(`evidence secret detected\n${findings.join('\n')}`);
}
