// 실제 브라우저에서 클릭이 눌린 그 줄에 커서를 놓는지 확인한다 (FR-EDITOR-007 AC-7).
//
// CM6 는 블록 위젯의 높이를 `getBoundingClientRect` 로 재는데 그 값은 `margin`
// 을 포함하지 않는다. 블록 위젯에 세로 `margin` 이 있으면 heightmap 이 DOM 보다
// 그 여백만큼 짧게 잡히고, 그 아래의 모든 줄에서 heightmap 좌표와 DOM 좌표가
// 어긋난다. 클릭의 y 좌표는 heightmap 으로 줄을 찾으므로, 어긋난 만큼 커서가
// 눌린 줄보다 아래 줄에 놓인다.
//
// 같은 함정이 표에서는 이미 잡혀 있다 — `inline-preview.css` 의 `.cm-atomic-table`
// 이 `margin` 대신 `padding` 을 쓰는 이유가 그 주석에 증상까지 적혀 있다.
//
// vitest 는 happy-dom 에서 레이아웃을 재지 않는다. `getBoundingClientRect` 가
// 언제나 0 을 돌려주므로 heightmap 과 DOM 의 어긋남 자체가 성립하지 않는다.
// 그래서 이 판정은 진짜 브라우저가 아니면 잴 수 없다.
//
// 이 시험은 서버를 띄우지 않는다. 이미 떠 있는 데모에 붙는다.
//
// 종료 코드: 0 = 세 자리 모두 눌린 줄에 놓였다 / 1 = 어긋났다 / 2 = 재지 못했다.
// 2 를 1 과 섞지 않는다 — 스크롤 사고나 데모 부재를 어긋남으로 오독하면
// 고칠 것이 없는 곳을 고치게 된다.
//
// 사용: npm run dev --workspace @doculight/editor 로 데모를 띄운 뒤
//       node test/heightmap-drift-check.mjs [--headed]

import { chromium } from 'playwright';

const URL = process.env.EDITOR_URL ?? 'http://localhost:3399/';
const HEADED = process.argv.includes('--headed');

// 3399 에 뜨는 것이 둘이다 — 저장소 루트의 `npm run dev` 는 web 앱을 같은
// 포트에 올린다. 화면 정체를 확인하지 않으면 web 앱의 부재를 어긋남으로
// 오독한다. `.demo-toggle` 은 editor 데모에만 있다.
const DEMO_MARKER = '.demo-toggle';

// 데모 문서에서 각 자리를 찾는 토막. 줄번호로 적지 않는다 — 데모 문서가
// 자라면 줄번호는 조용히 틀려지지만 이 토막들은 함께 움직인다.
const PARAGRAPH_MARKER = '[[위키링크]]';
const QUOTE_MARKER = '인용문입니다.';
const TABLE_SEPARATOR = '|---|';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** 판정을 내릴 수 없는 상태. 「어긋났다」가 아니라 「재지 못했다」다. */
class Unmeasurable extends Error {}

function unmeasurable(message) {
  throw new Unmeasurable(message);
}

const browser = await chromium.launch({ headless: !HEADED });
let exitCode = 2;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cm-editor', { timeout: 15_000 });

  // --- 붙은 화면이 editor 데모인지 먼저 확인한다. 아니면 판정을 내리지 않는다.
  if ((await page.locator(DEMO_MARKER).count()) === 0) {
    unmeasurable(
      `editor 데모가 ${URL} 에 떠 있지 않다. ` +
        '`npm run dev --workspace @doculight/editor` 로 띄우라. ' +
        '(저장소 루트의 `npm run dev` 는 web 앱을 같은 포트에 올린다.)',
    );
  }

  // 어긋남을 만드는 것이 mermaid 위젯이므로 그것이 다 서기 전에는 재지 않는다.
  await page.waitForSelector('.dl-mermaid svg', { timeout: 20_000 });
  await page.waitForTimeout(1500); // 마지막 다이어그램 렌더 여유

  // CM6 의 EditorView 를 DOM 에서 되찾는다. `EditorView.findFromDOM` 이 하는
  // 일과 같되, 페이지 안에는 그 모듈이 없으므로 같은 경로를 직접 걷는다.
  const VIEW = `(() => {
    const content = document.querySelector('.cm-content');
    let tile = content?.cmTile;
    while (tile?.parent) tile = tile.parent;
    return tile?.view ?? null;
  })()`;

  // 재는 자리는 문서 끝머리에 있고 CM6 는 뷰포트 밖 줄을 렌더하지 않는다.
  // 재는 것마다 그 영역을 먼저 화면에 들여야 좌표가 뜻을 갖는다.
  async function bringTailIntoView() {
    await page.evaluate(`(() => {
      const scroller = document.querySelector('.cm-scroller');
      scroller.scrollTop = scroller.scrollHeight;
      return null;
    })()`);
    await page.waitForTimeout(450);
  }

  // 토막이 놓인 줄 번호. 문서는 데코레이션과 무관하게 언제나 원문을 들고
  // 있으므로 위젯이 서 있든 걷혔든 같은 값이 나온다.
  function lineOf(marker) {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const doc = view.state.doc;
      const index = doc.toString().indexOf(${JSON.stringify(marker)});
      return index < 0 ? null : doc.lineAt(index).number;
    })()`);
  }

  // 표가 걸친 줄 범위. 구분선을 찾은 뒤 위아래로 `|` 로 시작하는 줄을 따라간다.
  function tableRangeOf() {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const doc = view.state.doc;
      const index = doc.toString().indexOf(${JSON.stringify(TABLE_SEPARATOR)});
      if (index < 0) return null;
      const sep = doc.lineAt(index).number;
      let from = sep;
      let to = sep;
      while (from > 1 && doc.line(from - 1).text.trimStart().startsWith('|')) from--;
      while (to < doc.lines && doc.line(to + 1).text.trimStart().startsWith('|')) to++;
      return { from, to };
    })()`);
  }

  const cursorLine = () =>
    page.evaluate(`(() => {
      const view = ${VIEW};
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    })()`);

  // 한 줄이 화면에서 차지하는 상자의 한가운데. `coordsAtPos` 는 DOM 을 걸어
  // 실제 클라이언트 좌표를 돌려준다 — 이것이 사용자가 보는 자리다.
  // 클릭은 그 좌표를 heightmap 으로 되돌려 줄을 찾으므로, 둘이 어긋나면
  // 눌린 줄과 커서가 놓이는 줄이 달라진다.
  function spotOfLine(n) {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const line = view.state.doc.line(${n});
      const head = view.coordsAtPos(line.from);
      if (!head) return null;
      const tail = view.coordsAtPos(line.to) ?? head;
      const top = Math.min(head.top, tail.top);
      const bottom = Math.max(head.bottom, tail.bottom);
      return {
        x: Math.round(head.left + 6),
        y: Math.round((top + bottom) / 2),
        top: Math.round(top),
        bottom: Math.round(bottom),
      };
    })()`);
  }

  // heightmap 이 잡은 줄의 위치와 DOM 이 실제로 그린 위치의 차. 판정은 커서가
  // 어디에 놓이느냐로 내리지만, 이 값이 있어야 실패가 「몇 px 때문인지」 읽힌다.
  function driftAtLine(n) {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const line = view.state.doc.line(${n});
      const dom = view.coordsAtPos(line.from);
      if (!dom) return null;
      const block = view.lineBlockAt(line.from);
      return Math.round(dom.top - (view.documentTop + block.top));
    })()`);
  }

  // 한 자리를 실제 마우스로 누르고 커서가 어느 줄에 놓이는지 잰다.
  // 좌표를 얻지 못하면 그 줄이 화면 밖이라는 뜻이므로 판정하지 않는다.
  async function clickLineAndReadCursor(n, label) {
    await bringTailIntoView();
    const spot = await spotOfLine(n);
    if (!spot) {
      unmeasurable(`${label}(${n}행)의 화면 좌표를 얻지 못했다 — 그 줄이 화면 밖이라 재지 못했다.`);
    }
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(350);
    return { spot, landed: await cursorLine() };
  }

  const paragraphLine = await lineOf(PARAGRAPH_MARKER);
  const quoteLine = await lineOf(QUOTE_MARKER);
  const tableRange = await tableRangeOf();

  if (paragraphLine === null || quoteLine === null || tableRange === null) {
    unmeasurable(
      '데모 문서에서 fixture 를 찾지 못했다 ' +
        `(문단 ${paragraphLine}, 인용 ${quoteLine}, 표 ${tableRange ? '있음' : '없음'}). ` +
        'demo/App.tsx 의 문단·인용문·표가 사라졌는지 확인하라.',
    );
  }

  await bringTailIntoView();
  const drift = await driftAtLine(tableRange.from);
  console.log(
    `heightmap 어긋남: 표 첫 줄(${tableRange.from}행)에서 ${drift}px ` +
      '(DOM 이 heightmap 보다 이만큼 아래에 그려진다)\n',
  );

  // --- ① 문단 — 눌린 그 줄에 커서가 놓인다
  const paragraph = await clickLineAndReadCursor(paragraphLine, '문단');
  check(
    `① 문단(${paragraphLine}행)을 누르면 커서가 그 줄에 놓인다`,
    paragraph.landed === paragraphLine,
    `커서 ${paragraph.landed}행 (누른 자리 y=${paragraph.spot.y}, 줄 상자 ${paragraph.spot.top}-${paragraph.spot.bottom})`,
  );

  // --- ② 인용 — 눌린 그 줄에 커서가 놓인다
  const quote = await clickLineAndReadCursor(quoteLine, '인용');
  check(
    `② 인용(${quoteLine}행)을 누르면 커서가 그 줄에 놓인다`,
    quote.landed === quoteLine,
    `커서 ${quote.landed}행 (누른 자리 y=${quote.spot.y}, 줄 상자 ${quote.spot.top}-${quote.spot.bottom})`,
  );

  // --- ③ 표 — 칸을 누르면 커서가 표가 걸친 줄에 놓인다
  //
  // 표는 칸마다 하나의 DOM 을 갖는 블록 위젯이라 「그 줄」이 한 줄이 아니라
  // 표가 걸친 범위다. 칸 클릭은 사용자가 실제로 하는 제스처이고, 어긋남이
  // 있으면 이 클릭이 표를 지나 아래 줄로 라우팅된다.
  await bringTailIntoView();
  const cells = page.locator('.cm-atomic-table td');
  const cellCount = await cells.count();
  if (cellCount === 0) {
    unmeasurable('표 위젯이 서 있지 않다 — 칸을 누를 대상이 없어 판정을 내리지 못했다.');
  }
  await cells.first().click();
  await page.waitForTimeout(400);
  const tableLanded = await cursorLine();
  check(
    `③ 표(${tableRange.from}-${tableRange.to}행)의 칸을 누르면 커서가 표 줄에 놓인다`,
    tableLanded >= tableRange.from && tableLanded <= tableRange.to,
    `커서 ${tableLanded}행 (표 ${tableRange.from}-${tableRange.to}행, 칸 ${cellCount}개)`,
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  // 예상 못 한 예외도 「재지 못했다」다 — 타임아웃·페이지 오류를 어긋남으로
  // 세면 고칠 것이 없는 곳을 고치게 된다.
  console.error(error instanceof Unmeasurable ? error.message : error);
  exitCode = 2;
} finally {
  await browser.close();
}

process.exit(exitCode);
