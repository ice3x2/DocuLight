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
const before = await page.locator('.dl-mermaid').count();
await page.locator('.dl-mermaid').first().click();
await page.waitForTimeout(400);
const after = await page.locator('.dl-mermaid').count();
const sourceShown = await page.getByText('graph TD').count();
check(
  'SDS-AC-2 커서가 닿으면 위젯이 사라지고 원문이 드러난다',
  after === before - 1 && sourceShown > 0,
  `위젯 ${before}→${after}, 원문 ${sourceShown}건`,
);

// --- 커서를 빼면 다시 렌더된다 (왕복)
await page.keyboard.press('Control+End');
await page.waitForTimeout(800);
const restored = await page.locator('.dl-mermaid').count();
check('커서를 빼면 다이어그램이 복귀한다', restored === before, `위젯 ${after}→${restored}`);

// --- StrictMode 이중 마운트에서 CM 인스턴스가 하나인지 (수용기준 9)
const editors = await page.locator('.cm-editor').count();
check('수용기준 9 StrictMode 에서 CM 인스턴스가 1개', editors === 1, `cm-editor ${editors}개`);

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
