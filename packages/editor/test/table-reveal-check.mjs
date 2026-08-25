// 실제 브라우저에서 표의 라이브 프리뷰 왕복을 확인한다 (FR-EDITOR-007 AC-7).
//
// AC-7 은 절반씩 나뉜다. 숨는 절반(커서가 표 밖이면 마크다운 기호가 사라진다)은
// 이미 동작하고, 드러나는 절반(커서를 표 줄에 올리면 원문이 드러난다)은 아직
// 서지 않았다. vitest 는 happy-dom 에서 데코레이션 발행만 검증하는데, 표는
// 각 칸이 contenteditable 인 WYSIWYG 위젯이라 커서 진입 자체가 브라우저의
// 초점·포인터 동작에 걸린다. 그래서 이 판정은 진짜 브라우저가 아니면 성립하지
// 않는다.
//
// 이 시험은 서버를 띄우지 않는다. 이미 떠 있는 데모에 붙는다.
//
// 사용: npm run dev --workspace @doculight/editor 로 데모를 띄운 뒤
//       node test/table-reveal-check.mjs [--headed]

import { chromium } from 'playwright';

const URL = process.env.EDITOR_URL ?? 'http://localhost:3399/';
const HEADED = process.argv.includes('--headed');

// 3399 에 뜨는 것이 둘이다 — 저장소 루트의 `npm run dev` 는 web 앱을 같은
// 포트에 올린다. 화면 정체를 확인하지 않으면 web 앱의 부재를 AC-7 의 실패로
// 오독한다. `.demo-toggle` 은 editor 데모에만 있다.
const DEMO_MARKER = '.demo-toggle';

// 표의 구분선 원문. 문서 전체에서 이 토막은 표 구분선 한 줄에만 있고,
// 위젯이 선 동안에는 위젯 DOM 어디에도 나타나지 않는다(칸은 `data-raw` 와
// 칸 텍스트만 갖는다). 그래서 이 토막의 등장이 곧 「원문이 드러났다」다.
const SEPARATOR = '|---|';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.cm-editor', { timeout: 15_000 });

// --- 붙은 화면이 editor 데모인지 먼저 확인한다. 아니면 판정을 내리지 않는다.
if ((await page.locator(DEMO_MARKER).count()) === 0) {
  await browser.close();
  console.error(
    `editor 데모가 ${URL} 에 떠 있지 않다. ` +
      '`npm run dev --workspace @doculight/editor` 로 띄우라. ' +
      '(저장소 루트의 `npm run dev` 는 web 앱을 같은 포트에 올린다.)',
  );
  process.exit(2);
}

await page.waitForTimeout(1200); // 초기 파싱·위젯 마운트 여유

// CM6 의 EditorView 를 DOM 에서 되찾는다. `EditorView.findFromDOM` 이 하는
// 일과 같되, 페이지 안에는 그 모듈이 없으므로 같은 경로를 직접 걷는다.
const VIEW = `(() => {
  const content = document.querySelector('.cm-content');
  let tile = content?.cmTile;
  while (tile?.parent) tile = tile.parent;
  return tile?.view ?? null;
})()`;

// 표가 놓인 줄 범위. 문서는 데코레이션과 무관하게 언제나 원문을 들고 있으므로
// 위젯이 서 있든 걷혔든 같은 값이 나온다.
const tableRange = await page.evaluate(`(() => {
  const view = ${VIEW};
  const doc = view.state.doc;
  const sepIndex = doc.toString().indexOf(${JSON.stringify(SEPARATOR)});
  if (sepIndex < 0) return null;
  const sepLine = doc.lineAt(sepIndex).number;
  let from = sepLine;
  let to = sepLine;
  while (from > 1 && doc.line(from - 1).text.trimStart().startsWith('|')) from--;
  while (to < doc.lines && doc.line(to + 1).text.trimStart().startsWith('|')) to++;
  return { from, to, sepPos: sepIndex + 2 };
})()`);

if (!tableRange) {
  await browser.close();
  console.error(
    '데모 문서에서 표 fixture 를 찾지 못했다. demo/App.tsx 의 표가 사라졌는지 확인하라.',
  );
  process.exit(2);
}

// 표는 문서 끝머리에 있고 CM6 는 뷰포트 밖 줄을 렌더하지 않는다. 재는 것마다
// 표 영역을 먼저 화면에 들여야 위젯 개수와 보이는 텍스트가 뜻을 갖는다.
async function bringTableIntoView() {
  await page.evaluate(`(() => {
    const scroller = document.querySelector('.cm-scroller');
    scroller.scrollTop = scroller.scrollHeight;
  })()`);
  await page.waitForTimeout(400);
}

function snapshot() {
  return page.evaluate(`(() => {
    const view = ${VIEW};
    const content = document.querySelector('.cm-content');
    const head = view.state.selection.main.head;
    return {
      revealed: content.textContent.includes(${JSON.stringify(SEPARATOR)}),
      widgets: document.querySelectorAll('.cm-atomic-table').length,
      cursorLine: view.state.doc.lineAt(head).number,
      focused: view.hasFocus,
    };
  })()`);
}

// 표 영역이 실제로 화면에 있는지. 위젯도 없고 원문도 없으면 그 순간의 측정은
// 「드러나지 않았다」가 아니라 「재지 못했다」다 — 둘을 섞으면 스크롤 사고가
// AC-7 실패로 둔갑한다.
function measurable(s) {
  return s.revealed || s.widgets > 0;
}

// 조건이 설 때까지 짧게 기다린다. 서면 즉시 돌아오고, 서지 않으면 상한까지만
// 기다린다 — 통과는 빠르고 실패는 일정하다.
async function waitForRevealed(timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshot();
    if (s.revealed) return s;
    if (Date.now() >= deadline) return s;
    await page.waitForTimeout(100);
  }
}

// 커서를 표 밖으로 빼는 실제 제스처. 표 위의 인용문을 누른다.
async function clickAboveTable() {
  await page.getByText('인용문입니다.').first().click();
  await page.waitForTimeout(300);
}

// --- ① 숨는 절반 — 커서가 표 밖이면 위젯이 서고 원문이 보이지 않는다 (회귀 방지)
await bringTableIntoView();
const idle = await snapshot();
check(
  '① 숨는 절반 — 커서가 표 밖이면 위젯이 서고 구분선 원문이 보이지 않는다',
  idle.widgets >= 1 && !idle.revealed,
  `위젯 ${idle.widgets}개, 원문 ${idle.revealed ? '보임' : '숨음'}`,
);

// --- ② AC-7 본 판정 (칸 클릭) — 칸을 누르면 구분선 원문이 드러난다
await page.locator('.cm-atomic-table td').first().click();
const afterCellClick = await waitForRevealed();
check(
  '② AC-7 본 판정 — 칸을 클릭하면 구분선 원문이 드러난다',
  afterCellClick.revealed,
  afterCellClick.revealed
    ? ''
    : `구분선 드러나지 않음 (커서 ${afterCellClick.cursorLine}행, 표 ${tableRange.from}-${tableRange.to}행, ` +
        `편집기 초점 ${afterCellClick.focused}${measurable(afterCellClick) ? '' : ', 표 영역이 화면 밖이라 재지 못했다'})`,
);

// --- ③ AC-7 본 판정 (화살표 이동) — 표 위 문단에서 ArrowDown 으로 내려간다
await clickAboveTable();
let arrowRevealed = false;
let arrowTouchedTable = false;
let arrowLast = await snapshot();
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  arrowLast = await snapshot();
  if (arrowLast.cursorLine >= tableRange.from && arrowLast.cursorLine <= tableRange.to) {
    arrowTouchedTable = true;
  }
  if (arrowLast.revealed) {
    arrowRevealed = true;
    break;
  }
  if (arrowLast.cursorLine > tableRange.to) break;
}
check(
  '③ AC-7 본 판정 — 화살표로 표 줄에 내려가면 구분선 원문이 드러난다',
  arrowRevealed,
  arrowRevealed
    ? ''
    : `구분선 드러나지 않음 (커서 ${arrowLast.cursorLine}행, 표 ${tableRange.from}-${tableRange.to}행, ` +
        `표 줄에 ${arrowTouchedTable ? '닿았다' : '닿지 못했다 — 위젯을 건너뛴다'}` +
        `${measurable(arrowLast) ? '' : ', 표 영역이 화면 밖이라 재지 못했다'})`,
);

// --- ④ 복귀 — 커서를 표 밖으로 빼면 위젯이 다시 서고 원문이 사라진다
await clickAboveTable();
await bringTableIntoView();
const afterLeave = await snapshot();
check(
  '④ 복귀 — 커서를 표 밖으로 빼면 위젯이 다시 서고 구분선 원문이 사라진다',
  afterLeave.widgets >= 1 && !afterLeave.revealed,
  `위젯 ${afterLeave.widgets}개, 원문 ${afterLeave.revealed ? '보임' : '숨음'}`,
);

// --- ⑤ 보조 (데코레이션 규칙) — 커서 진입 경로를 건너뛰고 선택만 옮긴다.
//
// 이 항은 AC-7 판정이 아니다. AC-7 은 사용자가 커서를 「올리는」 것을 요구하고
// 그 제스처는 ②·③ 이 잰다. 여기서는 진입 수단을 빼고 데코레이션 규칙 하나만
// 남겨, 실패가 어느 축의 것인지 갈라 보는 데 쓴다.
await page.evaluate(`(() => {
  const view = ${VIEW};
  view.focus();
  view.dispatch({ selection: { anchor: ${tableRange.sepPos} } });
})()`);
const afterDispatch = await waitForRevealed();
check(
  '⑤ 보조 — dispatch({selection}) 으로 커서를 놓아도 구분선 원문이 드러난다 (데코레이션 규칙)',
  afterDispatch.revealed,
  afterDispatch.revealed
    ? ''
    : `구분선 드러나지 않음 (커서 ${afterDispatch.cursorLine}행, 표 ${tableRange.from}-${tableRange.to}행, ` +
        `편집기 초점 ${afterDispatch.focused}${measurable(afterDispatch) ? '' : ', 표 영역이 화면 밖이라 재지 못했다'})`,
);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length === 0 ? 0 : 1);
