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

// 문서의 한 줄을 뷰포트 가운데로 들인다.
//
// CM6 는 뷰포트 밖 줄을 DOM 에 두지 않으므로 목표 줄이 아직 없을 수 있다.
// 한 화면씩 내려가며 그 줄이 DOM 에 나타나기를 기다렸다가 가운데로 고정한다.
// 끝까지 내려가도 없으면 던진다 — 조용히 넘어가면 그 뒤의 단언이 무엇을
// 재고 있는지 알 수 없게 된다.
async function centerLineContaining(needle) {
  const findAndCenter = () =>
    page.evaluate((text) => {
      const line = [...document.querySelectorAll('.cm-line')].find((el) =>
        el.textContent?.includes(text),
      );
      if (!line) return false;
      line.scrollIntoView({ block: 'center' });
      return true;
    }, needle);

  for (let step = 0; step < 20; step += 1) {
    if (await findAndCenter()) {
      await page.waitForTimeout(1200); // 들어온 위젯이 그려질 여유
      return;
    }
    await page.locator('.cm-scroller').evaluate((el) => {
      el.scrollTop += el.clientHeight * 0.8;
    });
    await page.waitForTimeout(250);
  }
  throw new Error(`문서에서 줄을 찾지 못했다: ${needle}`);
}

const scrollToTop = async () => {
  await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(600);
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.cm-editor', { timeout: 15_000 });
await page.waitForSelector('.dl-mermaid svg', { timeout: 20_000 });
await page.waitForTimeout(1200); // 마지막 다이어그램 렌더 여유

// --- SDS-AC-1: 커서 밖 mermaid 블록이 다이어그램으로 렌더된다
const rendered = await page.locator('.dl-mermaid svg').count();
check('SDS-AC-1 다이어그램이 SVG 로 렌더된다', rendered >= 2, `svg ${rendered}개`);

// --- SDS-AC-3: js 펜스는 **mermaid** 위젯 대상이 아니다
//
// 데모가 `codeBlocks()` 도 얹으므로 이 펜스는 이제 코드 위젯(`pre.dl-code`)으로
// 선다 — 글자가 보이는지만 재면 어느 확장이 가져갔는지를 가리지 못한다. 그래서
// 「글자가 보인다」에 「다이어그램 안에 있지 않다」를 더한다. 재는 대상은 그대로
// 「mermaid 가 남의 언어를 가져가지 않는다」다.
const jsVisible = await page.getByText('const notMermaid = true;').count();
const jsInDiagram = await page
  .locator('.dl-mermaid', { hasText: 'const notMermaid = true;' })
  .count();
check(
  'SDS-AC-3 js 펜스는 mermaid 위젯으로 대체되지 않는다',
  jsVisible > 0 && jsInDiagram === 0,
  `보이는 자리 ${jsVisible}개, 다이어그램 안 ${jsInDiagram}개`,
);

// --- SDS-AC-4: 잘못된 mermaid 는 오류 표시로 떨어지고 페이지를 죽이지 않는다
//
// 세는 자리를 스크롤 top 에서 오류 블록이 실제로 있는 자리로 옮겼다. 단언은
// 그대로 "정확히 1개" 다 — 기준을 낮춘 것이 아니라 자를 옳은 곳에 댔다.
//
// 왜 옮겼나: mermaid 위젯의 heightmap 어긋남이 사라지면서 CM6 가 뷰포트 밖
// 블록 위젯을 정확히 언마운트하게 됐다. 종전에는 heightmap 이 DOM 보다 짧아
// CM6 가 필요보다 많이 렌더했고, 그 덕에 문서 아래쪽의 오류 블록이 top 에서도
// 잡혀 이 단언이 우연히 통과하고 있었다. 위 revealedCount 주석이 경고하는
// 그대로다 — 개수 변화의 대부분은 가상화이지 동작이 아니다. 오류 표시 동작
// 자체는 멀쩡하다 (오류 블록 자리에서 error 1개 + 정상 다이어그램 svg 2개).
//
// 자리를 찾는 방법은 문서의 고정 landmark 다: 오류 펜스 바로 앞 소제목을
// 가운데로 들이면 그 바로 아래가 오류 블록이다. "오류가 나올 때까지 훑는다"
// 가 아니다 — 훑는 대상은 landmark 줄뿐이고, 개수는 그 자리에서 딱 한 번
// 읽어 정확히 1개인지 본다.
await centerLineContaining('렌더 실패도 예외를 던지지 않습니다');
const errorBlocks = await page.locator('.dl-mermaid-error').count();
check('SDS-AC-4 렌더 실패가 오류 표시로 격리된다', errorBlocks === 1, `error ${errorBlocks}개`);

// 뒤따르는 단언들은 문서 top 에서 시작하는 것을 전제한다.
await scrollToTop();

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

// 남은 두 판정은 다이어그램의 **색**을 재므로, 색을 가진 다이어그램이 화면에
// 있는 자리에서 재야 한다. 문서 끝머리에서 재면 그 자리에 어떤 다이어그램이
// 남아 있는지가 문서 길이에 딸려 흔들린다 — 실제로 데모 문서가 길어지자 끝머리에
// 남는 것이 rect 없는 pie 와 렌더 실패 블록뿐이 되어, 색을 못 찾은 것이 「테마가
// 어긋났다」로 읽혔다. 위 SDS-AC-4 가 landmark 로 자리를 옮긴 것과 같은 이유이고
// 같은 처방이다. 단언은 그대로다 — 자를 옳은 곳에 댈 뿐이다.
await scrollToTop();
await page.waitForSelector('.dl-mermaid svg', { timeout: 20_000 });
await page.waitForTimeout(600);

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
