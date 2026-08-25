// 브라우저 시험 셋이 함께 쓰는 기계장치.
//
// `browser-check.mjs` · `table-reveal-check.mjs` · `heightmap-drift-check.mjs`
// 는 무엇을 재는지가 서로 다르지만, 재기까지의 절차는 같다 — 브라우저를 띄우고,
// 3399 에 뜬 화면이 editor 데모인지 확인하고, 판정을 모아 마지막에 집계하고,
// 종료 코드로 결과를 내보낸다. 그 절차가 세 벌로 갈라져 있으면 한쪽만 고쳐지고
// 다른 쪽은 조용히 어긋난다 (실제로 접속 실패 처리가 그렇게 갈라져 있었다).
//
// 앞의 밑줄은 이 파일이 시험이 아니라 시험의 도구라는 표시다.
//
// **여기에는 기계장치만 둔다.** 무엇을 재는가 — fixture 를 찾는 토막, 스크롤
// 전략, 판정문 — 는 각 시험 파일에 남는다.

import { chromium } from 'playwright';

/** 데브 서버 주소. 시험마다 다른 화면에 붙일 일이 있어 환경변수로 연다. */
export const EDITOR_URL = process.env.EDITOR_URL ?? 'http://localhost:3399/';

/** `--headed` 를 주면 브라우저 창을 띄운 채 돌린다. */
export const HEADED = process.argv.includes('--headed');

// 3399 에 뜨는 것이 둘이다 — 저장소 루트의 `npm run dev` 는 web 앱을 같은
// 포트에 올린다. 화면 정체를 확인하지 않으면 web 앱의 부재를 판정 실패로
// 오독한다. `.demo-toggle` 은 editor 데모에만 있다.
const DEMO_MARKER = '.demo-toggle';

const demoMissing = (url) =>
  `editor 데모가 ${url} 에 떠 있지 않다. ` +
  '`npm run dev --workspace @doculight/editor` 로 띄우라. ' +
  '(저장소 루트의 `npm run dev` 는 web 앱을 같은 포트에 올린다.)';

/** 판정을 내릴 수 없는 상태. 「실패했다」가 아니라 「재지 못했다」다. */
export class Unmeasurable extends Error {}

/** 재지 못했음을 선언한다. 종료 코드 2 로 나간다. */
export function unmeasurable(message) {
  throw new Unmeasurable(message);
}

// CM6 의 EditorView 를 DOM 에서 되찾는다. `EditorView.findFromDOM` 이 하는
// 일과 같되, 페이지 안에는 그 모듈이 없으므로 같은 경로를 직접 걷는다.
// `page.evaluate` 에 넘길 문자열 안에 `${VIEW}` 로 끼워 쓴다.
export const VIEW = `(() => {
  const content = document.querySelector('.cm-content');
  let tile = content?.cmTile;
  while (tile?.parent) tile = tile.parent;
  return tile?.view ?? null;
})()`;

/**
 * 데모 화면에 붙는다. 이 시험들은 서버를 띄우지 않는다 — 이미 떠 있는 데모에
 * 붙을 뿐이다.
 *
 * 붙지 못한 것과 회귀는 다르다. 접속이 안 되거나 붙은 화면이 editor 데모가
 * 아니면 스택 트레이스가 아니라 안내로 끝낸다(`Unmeasurable` → 종료 코드 2).
 * 집계 실행(`npm run test:browser:all`)에서 앞 시험이 트레이스만 남기면 뒤의
 * 시험들이 왜 돌지 않았는지 사람이 읽어낼 수 없다.
 *
 * 편집기가 마운트되지 않는 것은 여기서 감싸지 않는다 — 화면은 떴는데 CM 이
 * 서지 않는 것은 재지 못한 것이 아니라 실패다. 그 예외를 어떻게 셀지는 각
 * 시험이 `beginMeasuring()` 을 어디에 두느냐로 정한다.
 */
export async function openDemo(page, url = EDITOR_URL) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
  } catch {
    unmeasurable(demoMissing(url));
  }
  await page.waitForSelector('.cm-editor', { timeout: 15_000 });
  if ((await page.locator(DEMO_MARKER).count()) === 0) {
    unmeasurable(demoMissing(url));
  }
}

/**
 * 브라우저를 띄워 `body` 를 돌리고, 판정을 집계해 종료 코드로 내보낸다.
 *
 * `body` 는 다음을 받는다.
 *  - `page` — 뷰포트 1280×900 의 새 페이지. 아직 아무 데도 붙지 않았다.
 *  - `check(name, pass, detail)` — 판정 하나. 종료 코드를 가른다.
 *  - `beginMeasuring()` — 이 지점부터 예상 못 한 예외를 「재지 못했다」가
 *    아니라 실패로 센다. 재는 자리를 다 찾은 뒤에 부르라. 부르기 전에 터진
 *    예외는 2 로, 부른 뒤에 터진 예외는 1 로 나간다 — 그 자리에서 2 를
 *    돌려주면 회귀가 「환경 탓」으로 조용히 묻힌다.
 *  - `note(line)` — 집계 줄 뒤에 덧붙일 줄. 종료 코드에 넣지 않는 관찰용이다.
 *
 * 종료 코드: 0 = 모든 판정 통과 / 1 = 판정 실패 / 2 = 재지 못했다.
 */
export async function runBrowserChecks(body) {
  const results = [];
  const notes = [];
  let measuring = false;

  const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  };

  const browser = await chromium.launch({ headless: !HEADED });
  let exitCode = 2;

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await body({
      page,
      check,
      beginMeasuring: () => {
        measuring = true;
      },
      note: (line) => notes.push(line),
    });

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} 통과`);
    for (const line of notes) console.log(line);
    exitCode = failed.length === 0 ? 0 : 1;
  } catch (error) {
    if (error instanceof Unmeasurable) {
      // 판정을 내릴 수 없다고 **시험이 스스로 선언한** 자리들.
      console.error(error.message);
      exitCode = 2;
    } else if (measuring) {
      // 재는 자리는 다 확인됐는데 그 뒤에 터졌다. 환경 문제로 뭉개지 않는다.
      console.error('재는 도중 예상 못 한 예외가 났다 — 실패로 센다.');
      console.error(error);
      exitCode = 1;
    } else {
      // 화면을 붙잡기도 전(접속·데모 확인·fixture 탐색)에 터졌다.
      console.error(error);
      exitCode = 2;
    }
  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}
