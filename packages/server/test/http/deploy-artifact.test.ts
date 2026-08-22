import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_WEB_ROOT } from '../../src/http/static-spa.js';

/**
 * 배포 산출물이 웹 산출물을 실제로 찾는가 (`OPS-ARCH-001` AC-1 · `DR-SHELL-001` AC-2).
 *
 * 서빙 자체는 `static-spa.test.ts` 가 잰다. 다만 그 시험은 언제나
 * `webRoot` 를 **주입**하므로, 아무도 주입하지 않는 운영에서 기본값이
 * 어디를 가리키는지는 재지 않는다. 그 자리가 어긋나면 시험은 전부
 * 통과하면서 배포된 인스턴스만 빈 화면을 낸다.
 */

const REPO = resolve(import.meta.dirname, '../../../..');

describe('OPS-ARCH-001 — 정적 산출물의 기본 자리', () => {
  it('기본값이 이 저장소의 `packages/web/dist` 를 가리킨다', () => {
    expect(DEFAULT_WEB_ROOT).toBe(resolve(REPO, 'packages/web/dist'));
  });

  it('빌드 산출물에서 돌아도 같은 자리다 — 깊이가 같기 때문이다', async () => {
    // `rootDir: src` · `outDir: dist` 라 `src/http/x.ts` 는 `dist/http/x.js`
    // 가 된다. 기본값은 모듈 기준 상대 경로라 이 깊이가 어긋나는 순간
    // 운영에서만 자리가 밀린다 — 시험은 소스에서 도니 알아채지 못한다.
    // tsconfig 는 주석을 담으므로 JSON 으로 읽지 않는다 — 주석을 지우려고
    // 파서를 하나 들이면 그 파서가 이 시험의 새 고장 지점이 된다.
    const build = await readFile(resolve(REPO, 'packages/server/tsconfig.build.json'), 'utf8');
    const valueOf = (key: string) => new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(build)?.[1];

    const rootDir = valueOf('rootDir');
    const outDir = valueOf('outDir');

    expect(rootDir).toBe('src');
    expect(outDir).toBe('dist');
    // 그 둘이 같은 깊이여야 한다는 사실을 값으로 고정한다.
    expect(rootDir!.split('/')).toHaveLength(outDir!.split('/').length);
  });

  it('저장소 루트의 build 가 웹 산출물까지 만든다', async () => {
    // 서버만 빌드해 배포하면 그 자리가 비어 SPA 가 404 를 낸다.
    const root = JSON.parse(await readFile(resolve(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      workspaces: string[];
    };

    expect(root.scripts.build).toContain('--workspaces');
    expect(root.workspaces).toContain('packages/*');

    const web = JSON.parse(
      await readFile(resolve(REPO, 'packages/web/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(web.scripts.build).toBeDefined();
  });

  it('PM2 가 그 웹 산출물과 같은 저장소 안의 서버를 띄운다', async () => {
    // 배포 단위가 저장소 디렉토리 자체다 — 그래서 `packages/web/dist` 가
    // 「동봉」된다. 서버 산출물만 따로 옮기는 구성으로 바뀌면 이 시험이
    // 깨지고, 그때가 웹 산출물의 자리를 다시 정해야 하는 시점이다.
    const pm2 = await readFile(resolve(REPO, 'ecosystem.config.cjs'), 'utf8');

    expect(pm2).toContain("join(root, 'packages', 'server', 'dist', 'main.js')");
    expect(pm2).toContain('cwd: root');

    // 기본 웹 루트가 그 `root` 아래에 있다.
    expect(relative(REPO, DEFAULT_WEB_ROOT).startsWith(`..${sep}`)).toBe(false);
  });
});
