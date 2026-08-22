import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 이 패키지의 루트.
 *
 * `import.meta.url` 을 쓰지 않는다 — 번들러가 그것을 file URL 이 아닌
 * 가상 모듈 주소로 채우면 경로 해석이 조용히 엉뚱한 자리를 가리킨다.
 * 대신 cwd 에서 시작해 실제로 존재하는 자리를 고른다.
 */
const ROOT = existsSync(resolve(process.cwd(), 'src/index.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/editor');
const WEB = resolve(ROOT, '..', 'web');

async function sourcesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourcesUnder(path)));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const manifest = async (pkg: string) =>
  JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

describe('CON-ARCH-005 — 프레임워크 중립 패키지를 쓴다', () => {
  it('AC-1 · AC-2: 에디터가 @codemirror/* 위에 서고 파싱이 @lezer/markdown 이다', async () => {
    const deps = (await manifest(ROOT)).dependencies ?? {};

    expect(Object.keys(deps).some((name) => name.startsWith('@codemirror/'))).toBe(true);
    expect(deps['@lezer/markdown']).toBeDefined();
  });

  it('AC-3 · AC-4 · AC-6: 머지·수식·코드 하이라이팅이 지목된 패키지다', async () => {
    const deps = (await manifest(ROOT)).dependencies ?? {};

    expect(deps['@codemirror/merge'], '머지 패키지가 없다').toBeDefined();
    expect(deps['katex'], '수식 패키지가 없다').toBeDefined();
    expect(deps['shiki'], '하이라이팅 패키지가 없다').toBeDefined();
  });

  it('AC-5: 다이어그램이 mermaid 다', async () => {
    expect(((await manifest(ROOT)).dependencies ?? {})['mermaid']).toBeDefined();
  });

  it('AC-7: 이 패키지의 의존성에 프레임워크 종속 래퍼가 없다', async () => {
    const deps = (await manifest(ROOT)).dependencies ?? {};

    // `@uiw/react-codemirror` 류의 래퍼가 들어오면 에디터가 그 프레임워크에
    // 묶이고, 프레임워크를 바꾸는 순간 에디터를 다시 만들어야 한다.
    for (const name of Object.keys(deps)) {
      expect(name, `${name} 이 프레임워크 종속 래퍼로 보인다`).not.toMatch(
        /^@uiw\/react-|^react-codemirror|^vue-codemirror|^svelte-codemirror/,
      );
    }
  });
});

describe('CON-ARCH-006 — 본문의 정본은 CodeMirror 이고 React state 로 올리지 않는다', () => {
  it('AC-1 · AC-2: 본문 문자열을 controlled value 로 묶는 자리가 없다', async () => {
    const sources = [...(await sourcesUnder(join(ROOT, 'src'))), ...(await sourcesUnder(join(WEB, 'src')))];

    const offenders: string[] = [];
    for (const path of sources) {
      const text = await readFile(path, 'utf8');
      // `useState` 에 본문이 올라가는 형태와, 에디터에 `value=` 로 본문을
      // 주입하는 형태 둘 다 본문의 정본을 둘로 만든다.
      //
      // **선언된 이름으로 판정한다.** 파일 어딘가에 `본문` 이라는 낱말이
      // 있는지로 재면 그 낱말을 주석에 쓴 파일이 전부 걸리고, 타입을
      // 적지 않은 `useState('')` 는 그대로 빠져나간다 — 두 방향으로 다
      // 틀린다.
      if (/const\s*\[\s*\w*(body|content|본문)\w*\s*,[^\]]*\]\s*=\s*useState/i.test(text)) {
        offenders.push(path);
      }
      if (/<\s*\w*(Editor|CodeMirror)\b[^>]*\bvalue=/s.test(text)) offenders.push(path);
    }

    expect(offenders, `본문이 React state 로 올라간 자리: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('CON-ARCH-005 AC-6 — 코드 하이라이팅이 shiki 다', () => {
  it('shiki 를 실제로 부르는 자리가 있다', async () => {
    const highlight = await readFile(join(ROOT, 'src/core/code-highlight.ts'), 'utf8');

    // 의존성에 있는 것과 쓰이는 것은 다르다.
    expect(highlight).toContain("from 'shiki'");
  });

  it('그 자리가 확장 묶음에 들어 있다', async () => {
    const bundle = await readFile(join(ROOT, 'src/doculight-extensions.ts'), 'utf8');

    expect(bundle).toContain('codeHighlight');
  });
});
