// 실제 브라우저에서 Mermaid 라이브 프리뷰를 확인한다.
//
// vitest 는 happy-dom 에서 데코레이션 발행만 검증한다. mermaid 는 SVG 를
// 실제로 측정하므로 진짜 브라우저가 아니면 렌더 자체가 성립하지 않는다.
//
// 사용: npm run dev 를 띄운 뒤  node test/browser-check.mjs [--headed]

import { chromium } from 'playwright';

const URL = process.env.EDITOR_URL ?? 'http://localhost:3399/';
const HEADED = process.argv.includes('--headed');
const SHOT = 'test/browser-check.png';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

// 원문이 드러난 mermaid 블록의 수.
//
// 두 가지를 피하려고 이렇게 센다.
//  - 위젯 DOM 개수로 판정하지 않는다: CM6 는 뷰포트 밖 위젯을 언마운트하고
//    playwright 의 click 은 대상을 스크롤해 들이므로, 개수 변화의 대부분은
//    가상화이지 동작이 아니다.
//  - 특정 블록('graph TD')을 지목하지 않는다: 직전 단계가 남긴 선택 때문에
//    "첫 위젯"이 어느 다이어그램인지 달라져 검사가 순서에 의존하게 된다.
const SOURCE_MARKERS = ['graph TD', 'sequenceDiagram', 'pie showData', 'classDiagram'];
const revealedCount = () =>
  page.evaluate((markers) => {
    const text = document.querySelector('.cm-content')?.textContent ?? '';
    return markers.filter((marker) => text.includes(marker)).length;
  }, SOURCE_MARKERS);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.cm-editor', { timeout: 15_000 });
await page.waitForSelector('.dl-mermaid svg', { timeout: 20_000 });
await page.waitForTimeout(1200); // 마지막 다이어그램 렌더 여유

// --- SDS-AC-1: 커서 밖 mermaid 블록이 다이어그램으로 렌더된다
const rendered = await page.locator('.dl-mermaid svg').count();
check('SDS-AC-1 다이어그램이 SVG 로 렌더된다', rendered >= 2, `svg ${rendered}개`);

// --- SDS-AC-3: js 펜스는 위젯 대상이 아니다 (원문이 그대로 보인다)
const jsVisible = await page.getByText('const notMermaid = true;').count();
check('SDS-AC-3 js 펜스는 위젯으로 대체되지 않는다', jsVisible > 0);

// --- SDS-AC-4: 잘못된 mermaid 는 오류 표시로 떨어지고 페이지를 죽이지 않는다
const errorBlocks = await page.locator('.dl-mermaid-error').count();
check('SDS-AC-4 렌더 실패가 오류 표시로 격리된다', errorBlocks === 1, `error ${errorBlocks}개`);

// --- SDS-AC-2: 커서를 블록 안으로 옮기면 원문이 드러난다
await page.locator('.dl-mermaid').first().click();
await page.waitForTimeout(400);
const sourceShown = await revealedCount();
check(
  'SDS-AC-2 커서가 닿으면 위젯이 사라지고 원문이 드러난다',
  sourceShown === 1,
  `원문 열린 블록 ${sourceShown}개`,
);

// --- 커서를 빼면 다시 렌더된다 (왕복)
await page.keyboard.press('Control+End');
await page.waitForTimeout(800);
await page.locator('.cm-scroller').evaluate((el) => {
  el.scrollTop = 0;
});
await page.waitForTimeout(600);
const stillRevealed = await revealedCount();
check(
  '커서를 빼면 다이어그램이 복귀한다',
  stillRevealed === 0 && (await page.locator('.dl-mermaid svg').count()) >= 1,
  `원문 열린 블록 ${stillRevealed}개`,
);

// --- StrictMode 이중 마운트에서 CM 인스턴스가 하나인지 (수용기준 9)
const editors = await page.locator('.cm-editor').count();
check('수용기준 9 StrictMode 에서 CM 인스턴스가 1개', editors === 1, `cm-editor ${editors}개`);

// --- SDS-AC-9/10: 보기 전용에서는 클릭해도 원문이 드러나지 않는다
//
await page.locator('.demo-toggle input').check();
await page.waitForTimeout(800);
const roBefore = await revealedCount();
await page.locator('.dl-mermaid').first().click();
await page.waitForTimeout(600);
const roAfter = await revealedCount();
const roStillRendered = await page.locator('.dl-mermaid svg').count();
check(
  'SDS-AC-9/10 보기 전용에서 클릭해도 원문이 드러나지 않는다',
  roAfter === 0 && roBefore === 0 && roStillRendered >= 1,
  `원문 열린 블록 ${roBefore}→${roAfter}, 렌더 ${roStillRendered}개`,
);

// 편집 모드로 되돌리면 클릭이 다시 원문을 연다 (막는 대상은 읽기 전용뿐이다)
//
// 어느 다이어그램에 착지하든 상관없다 — 판정은 "원문이 열린 블록이 있는가"
// 이지 특정 블록이 아니다.
await page.locator('.demo-toggle input').uncheck();
await page.waitForTimeout(600);
await page.locator('.cm-scroller').evaluate((el) => {
  el.scrollTop = 0;
});
await page.waitForTimeout(600);
await page.locator('.dl-mermaid').first().click();
await page.waitForTimeout(600);
const editRevealed = await revealedCount();
check(
  '편집 모드에서는 클릭이 여전히 원문을 연다',
  editRevealed >= 1,
  `원문 열린 블록 ${editRevealed}개`,
);

await page.keyboard.press('Control+End');
await page.waitForTimeout(800);

// --- SDS-AC-8: 렌더 실패가 에디터 바깥에 DOM 을 남기지 않는다
// mermaid 는 파싱 실패 시 오류 그래픽을 스스로 문서에 붙인다. 그 잔여물이
// 에디터 밖에 떠 있으면 안 된다.
const leaked = await page.evaluate(() => {
  const root = document.getElementById('root');
  return [...document.body.querySelectorAll('svg, [id^="dmermaid"], [id^="dl-mermaid"]')]
    .filter((el) => !root?.contains(el))
    .map((el) => el.id || el.tagName);
});
check('SDS-AC-8 에디터 밖 DOM 잔여물 없음', leaked.length === 0, leaked.join(', '));

// --- 기본 테마가 라이트다 (배경과 다이어그램이 같은 방향이어야 한다)
//
// `.cm-editor` 의 배경은 transparent 라 측정 대상이 아니다 — 실제로 칠해지는
// 조상(body)을 본다.
const theme = await page.evaluate(() => {
  const luma = (color) => {
    const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
    return a === 0 ? -1 : (r * 299 + g * 587 + b * 114) / 1000;
  };
  const node = document.querySelector('.dl-mermaid svg .node rect, .dl-mermaid svg rect');
  return {
    attr: document.documentElement.dataset.theme ?? null,
    pageLuma: luma(getComputedStyle(document.body).backgroundColor),
    diagramLuma: node ? luma(getComputedStyle(node).fill) : -1,
  };
});
check(
  '기본 테마가 라이트이고 다이어그램도 같은 방향이다',
  theme.attr === 'light' && theme.pageLuma > 128 && theme.diagramLuma > 128,
  `attr=${theme.attr}, 페이지 ${Math.round(theme.pageLuma)}, 다이어그램 ${Math.round(theme.diagramLuma)}`,
);

// --- 다이어그램이 단색이 아니다 (팔레트가 실제로 먹었는지)
const fillVariety = await page.evaluate(() => {
  const fills = [...document.querySelectorAll('.dl-mermaid svg [fill]')]
    .map((el) => el.getAttribute('fill'))
    .filter((f) => f && f !== 'none' && !f.startsWith('url('));
  return new Set(fills).size;
});
check('다이어그램이 여러 색으로 칠해진다', fillVariety >= 3, `서로 다른 fill ${fillVariety}종`);

// --- 콘솔 오류 없음
check('페이지 오류 없음', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await page.keyboard.press('Control+Home');
await page.waitForTimeout(600);
await page.screenshot({ path: SHOT, fullPage: false });
console.log(`\n스크린샷: ${SHOT}`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length === 0 ? 0 : 1);
