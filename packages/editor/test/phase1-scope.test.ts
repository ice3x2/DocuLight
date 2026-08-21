import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = existsSync(resolve(process.cwd(), 'src/index.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/editor');
const WEB = resolve(ROOT, '..', 'web');

async function sourcesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourcesUnder(path)));
    else if (/\.(tsx?|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const allSources = async () => [
  ...(await sourcesUnder(join(ROOT, 'src'))),
  ...(await sourcesUnder(join(WEB, 'src'))),
];

const readAll = async (paths: readonly string[]) =>
  (await Promise.all(paths.map((p) => readFile(p, 'utf8')))).join('\n');

describe('CON-EDITOR-001 — 플러그인 시스템을 범위에서 제외한다', () => {
  it('AC-1: 서드파티 플러그인을 설치·활성화하는 자리가 없다', async () => {
    const text = await readAll(await allSources());

    // 플러그인 목록·설치·활성화를 다루는 코드가 하나라도 있으면 그것이
    // 곧 이 조항이 배제한 표면이다.
    expect(text).not.toMatch(/installPlugin|enablePlugin|pluginRegistry|loadPlugin/i);
  });

  it('AC-1: 설정 카테고리에 플러그인이 없다', async () => {
    const contract = await readFile(join(WEB, 'src/shell/shell-contract.ts'), 'utf8');

    expect(contract).not.toContain('플러그인');
  });
});

describe('CON-EDITOR-002 — Phase 1 범위는 편집·렌더링과 링크 계열이다', () => {
  it('AC-1: 위키링크 입력·자동완성이 산출물에 있다', async () => {
    expect(existsSync(join(ROOT, 'src/vendor/atomic-editor/wiki-links.ts'))).toBe(true);
  });

  it('AC-4: 태그가 산출물에 있다', async () => {
    expect(existsSync(join(ROOT, 'src/core/tags.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/core/tag-decoration.ts'))).toBe(true);
  });

  it('AC-2 · AC-3: 백링크와 아웃고잉 링크가 우측 탭으로 서 있다', async () => {
    const contract = await readFile(join(WEB, 'src/shell/shell-contract.ts'), 'utf8');

    expect(contract).toContain('백링크');
    expect(contract).toContain('아웃고잉 링크');
  });
});

describe('CON-EDITOR-004 — Phase 1 은 데스크탑 전용이다', () => {
  it('AC-1: 모바일·태블릿 전용 레이아웃이 없다', async () => {
    const text = await readAll(await allSources());

    // 좁은 화면 전용 분기를 두면 그것이 곧 이 조항이 배제한 레이아웃이다.
    expect(text).not.toMatch(/@media[^{]*max-width[^{]*(480|640|768)px/);
    expect(text).not.toMatch(/isMobile|isTablet|useMediaQuery/i);
  });
});

describe('CON-ARCH-006 AC-3 — 본문은 에디터 인스턴스에서 조회해 얻는다', () => {
  it('저장 요청을 만드는 자리가 본문을 상태에서 꺼내지 않는다', async () => {
    const autosave = await readFile(join(WEB, 'src/document/autosave.ts'), 'utf8');

    // 본문의 정본이 에디터라는 사실을 모듈 스스로 적어 두고, 그 칸이
    // 「꺼내 온 값을 잠시 담는 자리」임을 이름과 주석이 말한다.
    expect(autosave).toContain('CON-ARCH-006');
    expect(autosave).toMatch(/CodeMirror 에서 꺼내|정본은 언제나 에디터/);
  });

  it('본문 표면이 본문 문자열을 상태로 들고 있지 않다', async () => {
    const surface = await readFile(join(WEB, 'src/document/DocumentSurface.tsx'), 'utf8');

    expect(surface).not.toMatch(/useState<\s*string\s*>/);
  });
});
