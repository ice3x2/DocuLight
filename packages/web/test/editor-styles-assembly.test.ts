import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **편집기 스타일이 제품 진입점에서 도달하는가** (`IR-EDITOR-001` AC-3).
 *
 * 2026-08-30 실측: 편집기가 `styles.css` 를 exports 로 내보내고 데모는 그것을
 * 얹는데, **제품(web)은 어디서도 얹지 않았다.** 그래서 제품 화면에서 태그가
 * 칩으로 보이지 않고 수식이 세 벌 겹쳐 보였다. 그런데 데모를 재는 브라우저
 * 검사(`tag-chip-check.mjs`)는 그 상태에서도 **전건 초록**이었다 — 데모가
 * 자기 진입점에서 스타일을 직접 얹기 때문이다.
 *
 * `packages/server/test/arch/assembly.test.ts` 가 같은 부류를 잡으려고 세운
 * 방벽이고 그 교훈이 여기에도 그대로 적용된다: **판정은 「누가 가리키는가」가
 * 아니라 「진입점에서 도달하는가」다.**
 *
 * 브라우저 검사(`editor-styles-check.mjs`)가 같은 축을 화면에서 재지만 그것은
 * 서버와 계정이 있어야 돈다. 이 시험은 늘 도는 자리에 서서 재발을 막는다.
 */

const WEB_SRC = resolve(import.meta.dirname, '..', 'src');
const EDITOR = resolve(import.meta.dirname, '..', '..', 'editor');

/** 편집기가 내보내는 **하나뿐인** 스타일 진입점. */
const 스타일진입점 = resolve(EDITOR, 'src', 'styles', 'editor.css');

const IMPORT = /^\s*import\s+(?:[^'"]*\sfrom\s+)?['"]([^'"]+)['"]/gm;

/**
 * 진입점에서 import 를 따라가며 닿는 CSS 파일을 전부 모은다.
 *
 * 「누가 가리키는가」가 아니라 「도달하는가」를 재려면 그래프를 걸어야 한다 —
 * 진입점 파일 한 줄만 보면, 스타일을 얹는 모듈이 아무 데도 연결되지 않은
 * 상태를 통과시킨다.
 */
function 도달하는CSS(진입점: string): Set<string> {
  const 본것 = new Set<string>();
  const css = new Set<string>();
  const 대기 = [진입점];

  while (대기.length > 0) {
    const 파일 = 대기.pop() as string;
    if (본것.has(파일) || !existsSync(파일)) continue;
    본것.add(파일);

    const 본문 = readFileSync(파일, 'utf8');
    for (const [, 지정] of 본문.matchAll(IMPORT)) {
      // 패키지 이름으로 오는 스타일은 그 패키지의 exports 로 해석한다.
      if (지정 === '@doculight/editor/styles.css') {
        css.add(스타일진입점);
        continue;
      }
      if (!지정.startsWith('.')) continue;

      const 후보 = join(dirname(파일), 지정);
      if (후보.endsWith('.css')) {
        css.add(resolve(후보));
        continue;
      }
      // TS 의 ESM 관례상 `.js` 로 쓰지만 실체는 `.ts`/`.tsx` 다.
      const 뿌리 = 후보.replace(/\.js$/, '');
      for (const 확장 of ['.ts', '.tsx', '.js', '.jsx']) {
        const 실체 = `${뿌리}${확장}`;
        if (existsSync(실체)) {
          대기.push(실체);
          break;
        }
      }
    }
  }

  return css;
}

describe('IR-EDITOR-001 AC-3 — 편집기 스타일이 제품 진입점에서 도달한다', () => {
  it('제품 진입점에서 편집기의 스타일 진입점에 도달한다', () => {
    const 닿는것 = 도달하는CSS(join(WEB_SRC, 'main.tsx'));

    // 실패 메시지에 무엇에 닿았는지를 실어 보낸다 — 「false 가 아니다」만으로는
    // 스타일이 빠진 것인지 경로가 바뀐 것인지 갈리지 않는다.
    expect([...닿는것].sort()).toContain(스타일진입점);
  });

  it('데모와 제품이 같은 스타일 진입점을 쓴다', () => {
    // 두 진입점이 각자 목록을 가지면 한쪽에만 얹힌 시트가 생기고, 그러면
    // 데모를 재는 검사가 초록인 채로 제품만 조용히 어긋난다. 그 상태가 바로
    // 이 요구가 세워진 이유다.
    const 제품 = 도달하는CSS(join(WEB_SRC, 'main.tsx'));
    const 데모 = 도달하는CSS(join(EDITOR, 'demo', 'main.tsx'));

    expect([...데모]).toContain(스타일진입점);
    expect([...제품]).toContain(스타일진입점);
  });

  it('편집기 스타일 진입점이 필요한 시트를 자기 안에서 모은다', () => {
    // 진입점이 하나라는 것은 **그 하나를 얹으면 다 선다**는 뜻이다. 진입점
    // 파일이 나머지를 `@import` 로 끌어오지 않으면, 얹는 쪽이 목록을 다시
    // 갖게 되어 진입점이 하나가 아니게 된다.
    const 본문 = readFileSync(스타일진입점, 'utf8');
    expect(본문).toMatch(/@import\s+['"][^'"]*inline-preview\.css['"]/);
    expect(본문).toMatch(/@import\s+['"]katex\/dist\/katex\.min\.css['"]/);
  });
});
