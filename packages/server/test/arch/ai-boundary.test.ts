import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AI 검색은 MCP 표면에서만 닿는다 (`CON-SHELL-002` AC-1 · AC-3).
 *
 * 화면이 의미 검색을 부르지 않는다는 것을 **호출부로** 잰다. 화면 코드를
 * 읽어 「토글이 없다」를 확인하는 것만으로는 부족하다 — 토글 없이도 질의가
 * 그 경로로 갈 수 있고, 반대로 토글이 생겨도 부를 것이 없으면 그 화면은
 * 서지 않는다. 부를 수 있는 자리를 하나로 묶어 두는 것이 이 조항을 지키는
 * 방법이다.
 */

const SRC = join(process.cwd(), 'src');

/** `src` 아래 모든 `.ts` 파일. */
async function sources(root: string = SRC): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const at = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(at)));
    else if (entry.name.endsWith('.ts')) found.push(at);
  }
  return found;
}

/**
 * 그 파일이 의미 검색에 **닿는가**. 정의한 자리는 세지 않는다.
 *
 * 호출만 잡으면 참조로 넘기는 경로를 놓친다 — `() => semanticSearch` 를
 * 다른 곳에 건네면 호출 문법이 그 파일에 나타나지 않는다. 실측으로
 * 확인했다: 호출만 잡던 첫 판은 REST 라우터에 그 참조를 넣어도 죽지
 * 않았다. 그래서 식별자를 쓰는 것 자체를 본다.
 *
 * **타입만 들이는 것은 닿는 것이 아니다.** 타입은 런타임에 사라지므로 그
 * 파일이 의미 검색을 부를 길이 없다. 그것까지 세면 타입을 나눠 쓰는 것이
 * AI 표면을 하나 더 여는 것으로 잘못 읽힌다.
 */
function reachesSemanticSearch(body: string): boolean {
  if (/export async function semanticSearch/.test(body)) return false;
  if (/\bsemanticSearch\b/.test(body)) return true;
  return /^import (?!type )[^\n]*semantic-search\.js/m.test(body);
}

describe('의미 검색은 MCP 표면에서만 호출된다 (`CON-SHELL-002`)', () => {
  /**
   * **호출부가 정확히 하나다.**
   *
   * 개수만 세면 그 하나가 어디인지 갈리지 않으므로 자리까지 확인한다. MCP
   * 도구 실행부 밖에서 부르는 자리가 생기면 그것이 곧 두 번째 AI 표면이다.
   */
  it('AC-3: 의미 검색을 부르는 자리가 MCP 도구 실행부 하나다', async () => {
    const files = await sources();
    expect(files.length, '훑을 파일이 없어 이 항이 공허하다').toBeGreaterThan(10);

    const callers: string[] = [];
    for (const file of files) {
      if (reachesSemanticSearch(await readFile(file, 'utf8'))) {
        callers.push(file.slice(SRC.length + 1).replace(/\\/g, '/'));
      }
    }

    expect(callers, '의미 검색을 부르는 자리가 MCP 실행부 하나가 아니다').toEqual([
      'app/mcp/dispatch.ts',
    ]);
  });

  /**
   * **REST 표면에 그 경로가 없다** (AC-1).
   *
   * 좌측 검색 탭이 부르는 것은 REST 이므로, 그쪽에 의미 검색이 닿는 자리가
   * 없으면 화면의 질의가 그 경로로 갈 수 없다.
   */
  it('AC-1: REST 라우터 어디에도 의미 검색 호출이 없다', async () => {
    const routes = join(SRC, 'http', 'routes');

    for (const name of await readdir(routes)) {
      if (!name.endsWith('.ts') || name === 'mcp.ts') continue;
      const body = await readFile(join(routes, name), 'utf8');
      expect(reachesSemanticSearch(body), `http/routes/${name} 이 의미 검색을 부른다`).toBe(false);
    }
  });
});
