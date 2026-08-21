import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { hasUnscopedAdminTerm } from '../../../src/domain/principal/vocabulary.js';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

/**
 * 규칙 자신의 정의 자리.
 *
 * 금지 토큰을 금지하려면 그 토큰을 적을 수밖에 없다 — 주석을 훑지 않는
 * 것과 같은 이유다. 여기 말고 다른 파일을 이 목록에 넣지 마라: 예외가
 * 늘기 시작하면 방벽이 아니라 통과 목록이 된다.
 */
const RULE_DEFINITION = join('domain', 'principal', 'vocabulary.ts');

function sourceFiles(at: string): string[] {
  return readdirSync(at).flatMap((name) => {
    const full = join(at, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * 사용자에게 보이는 문구만 뽑는다.
 *
 * 주석은 뺀다 — 이 규칙은 화면 문구에 대한 것이고, 주석에서 규칙 자체를
 * 설명하려면 금지된 형태를 인용할 수밖에 없다.
 */
function userFacingStrings(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  // 한글이 든 문자열 리터럴 = 사용자에게 닿는 문구. 식별자·SQL·경로는
  // 한글을 담지 않으므로 이 조건 하나로 갈린다.
  return [...withoutComments.matchAll(/(['"`])((?:(?!\1)[\s\S])*?)\1/g)]
    .map((match) => match[2] ?? '')
    .filter((literal) => /[가-힣]/.test(literal));
}

describe('CON-PRINCIPAL-007 — 관리자를 단독으로 쓰지 않는다', () => {
  it('AC-1: src 의 어떤 사용자 문구에도 범위 없는 관리자 가 없다', () => {
    // 함수를 만들어 두고 부르지 않으면 규칙이 아니라 장식이다. 런타임마다
    // 부르는 대신 **소스 전량을 훑어** 배선한다 — 문구가 늘어나도 이
    // 방벽이 함께 자란다.
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(RULE_DEFINITION)) continue;

      for (const literal of userFacingStrings(readFileSync(file, 'utf8'))) {
        if (hasUnscopedAdminTerm(literal)) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${literal}`);
        }
      }
    }

    expect(offenders, `범위 수식어 없는 관리자:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('이 방벽이 실제로 무언가를 훑는다 — 표본이 비어 통과하는 것이 아니다', () => {
    const literals = sourceFiles(SRC).flatMap((file) =>
      userFacingStrings(readFileSync(file, 'utf8')),
    );

    // 훑을 것이 없으면 위 시험은 어떤 구현에서도 통과한다.
    expect(literals.length).toBeGreaterThan(20);
    // 그리고 검사기가 실제로 걸러낸다는 것도 여기서 확인한다.
    expect(hasUnscopedAdminTerm('관리자에게 문의하십시오')).toBe(true);
  });
});
