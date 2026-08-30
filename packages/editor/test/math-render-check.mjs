// 수식이 KaTeX 스타일시트 위에 서는지 실제 브라우저에서 확인한다
// (`FR-EDITOR-010`).
//
// **happy-dom 은 이 축을 원리상 잴 수 없다.** 그 환경은 스타일시트를 적용하지
// 않으므로 CSS 가 있든 없든 계산된 값이 같다. `math-blocks.test.ts` 가 재는
// 것은 `renderMath` 가 KaTeX 마크업 문자열을 돌려주는가까지이고, 그 마크업이
// 화면에서 **읽을 수 있는 상태로 서는가**는 그 계층 밖이다.
//
// KaTeX 는 글꼴 · 수직 정렬 · 분수와 근호의 배치를 전부 스타일시트로 세운다.
// 특히 두 가지가 CSS 없이는 성립하지 않는다.
//
// ① KaTeX 는 접근성을 위해 **MathML 사본과 HTML 렌더를 둘 다** 만들고,
//    `.katex-mathml` 을 1px 로 접어 화면에서 감춘다. 그 규칙이 없으면 같은
//    수식이 두 벌 나란히 보인다 — 사용자에게는 글자가 겹쳐 나온 것으로 읽힌다.
// ② 위첨자는 `.vlist` 의 배치 규칙으로 쌓아 올린다. 그 규칙이 없으면 지수가
//    기준선에 눌려 붙어 `mc^2` 와 `mc2` 가 구별되지 않는다.
//
// 그래서 이 검사는 마크업의 존재를 세지 않고 **계산된 스타일과 기하**를 잰다.
//
// 사용: `npm run dev` 로 editor 데모를 띄운 뒤
//       node test/math-render-check.mjs [--headed]
//       (web 앱이 3399 를 잡고 있으면 데모를 다른 포트에 띄우고
//        EDITOR_URL=http://localhost:3401/ 로 넘긴다)

import { runBrowserChecks, waitUntil, openDemo } from './_browser-harness.mjs';

/** 수식 블록은 문서 끝에 있다 — CM6 가상 스크롤이라 들여야 렌더된다. */
async function bringMathIntoView(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller');
    if (scroller !== null) scroller.scrollTop = scroller.scrollHeight;
  });
}

/**
 * 수식 하나의 렌더 상태를 읽는다.
 *
 * `selector` 로 블록 수식과 인라인 수식을 갈라 부른다 — 한쪽만 스타일시트를
 * 받는 상태를 두지 않는 것이 AC-4 다.
 */
const 수식읽기 = (selector) => {
  const host = document.querySelector(selector);
  const 없음 = { 있다: false };
  if (host === null) return 없음;

  const katex = host.querySelector('.katex');
  if (katex === null) return { 있다: false, 위젯은있다: true };

  const mathml = katex.querySelector('.katex-mathml');
  const html = katex.querySelector('.katex-html');
  const mathmlBox = mathml?.getBoundingClientRect() ?? null;

  // 위첨자가 실제로 위에 있는지는 **기하로** 잰다. 규칙 이름을 보면 KaTeX 가
  // 내부 구조를 바꿀 때 판정이 같이 흔들리는데, 「지수가 위에 있다」는 그
  // 구조가 바뀌어도 변하지 않는다.
  const 잎 = [...(html?.querySelectorAll('span') ?? [])].filter(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() !== '',
  );
  const 지수 = 잎.find((el) => (el.textContent ?? '').trim() === '2');
  const 기준 = 잎.find((el) => (el.textContent ?? '').trim() === 'c');

  return {
    있다: true,
    위젯은있다: true,
    글꼴: getComputedStyle(katex).fontFamily,
    mathml너비: mathmlBox === null ? null : Math.round(mathmlBox.width),
    mathml높이: mathmlBox === null ? null : Math.round(mathmlBox.height),
    지수있다: 지수 !== undefined && 기준 !== undefined,
    지수위: 지수 === undefined ? null : Math.round(지수.getBoundingClientRect().top),
    기준위: 기준 === undefined ? null : Math.round(기준.getBoundingClientRect().top),
  };
};

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await openDemo(page);
  await bringMathIntoView(page);

  // 위젯이 설 때까지 기다린다 — 스크롤 뒤 마운트라 고정 대기는 흔들린다.
  const 블록 = await waitUntil(
    () => page.evaluate(수식읽기, '.dl-math-block'),
    (v) => v.있다,
    { timeout: 10_000 },
  );

  if (!블록.있다) {
    note(
      블록.위젯은있다
        ? '(수식 위젯은 섰으나 그 안에 KaTeX 요소가 없다)'
        : '(수식 위젯을 찾지 못했다 — 데모 문서에 블록 수식이 있어야 한다)',
    );
  }

  beginMeasuring();

  // AC-1 — KaTeX 글꼴로 선다. 시스템 기본으로 떨어지면 스타일시트가 없는 것이다.
  check(
    'AC-1 수식이 KaTeX 글꼴로 렌더된다',
    (블록.글꼴 ?? '').includes('KaTeX'),
    `계산된 글꼴: ${블록.글꼴 ?? '(잴 수 없음)'}`,
  );

  // AC-2 — MathML 사본이 화면에서 접힌다. KaTeX 는 그것을 1px 로 만든다.
  // 접히지 않으면 같은 수식이 두 벌 보인다.
  check(
    'AC-2 MathML 사본이 화면에서 접혀 수식이 한 벌로 읽힌다',
    블록.mathml너비 !== null && 블록.mathml너비 <= 1 && 블록.mathml높이 <= 1,
    블록.mathml너비 === null
      ? 'MathML 사본을 찾지 못했다'
      : `사본 크기 ${블록.mathml너비}×${블록.mathml높이}px (접히면 1×1 이다)`,
  );

  // AC-3 — 지수가 기준선 위로 올라간다. 눌리면 두 top 이 같아진다.
  check(
    'AC-3 위첨자가 기준선 위로 쌓인다',
    블록.지수있다 && 블록.지수위 < 블록.기준위,
    블록.지수있다
      ? `지수 top ${블록.지수위} · 기준 글자 top ${블록.기준위}`
      : '지수와 기준 글자를 찾지 못했다',
  );

  // AC-4 — 인라인 수식도 같은 스타일시트 위에 선다. 블록만 고치고 인라인을
  // 두면 같은 문서 안에서 두 수식이 다르게 보인다.
  const 인라인 = await waitUntil(
    () => page.evaluate(수식읽기, '.dl-math-inline'),
    (v) => v.있다,
    { timeout: 10_000 },
  );
  check(
    'AC-4 인라인 수식도 같은 스타일시트 위에 선다',
    인라인.있다 && (인라인.글꼴 ?? '').includes('KaTeX') && 인라인.mathml너비 <= 1,
    인라인.있다
      ? `글꼴 ${인라인.글꼴} · 사본 ${인라인.mathml너비}×${인라인.mathml높이}px`
      : '인라인 수식을 찾지 못했다 — 데모 문서에 인라인 수식이 있어야 한다',
  );

  note('(계산된 스타일과 기하를 잰다 — 마크업의 존재는 happy-dom 계층이 이미 잰다)');
});
