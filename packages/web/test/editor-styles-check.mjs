// 편집기 스타일이 **제품 화면**에 닿는지 확인한다 (`IR-EDITOR-001`).
//
// **데모를 재는 검사로는 이 축이 닫히지 않는다.** `packages/editor` 의
// `tag-chip-check.mjs` 는 태그가 칩으로 보이는지를 계산된 스타일로 재고
// 통과하는데, 그 검사가 붙는 화면은 데모다. 데모는 자기 진입점에서 편집기
// 스타일을 직접 얹으므로, 제품이 그것을 얹지 않아도 데모 검사는 초록이다.
// 데모와 제품의 진입점이 갈린 것이 바로 이 요구가 막으려는 상태이고, 그래서
// 판정은 **제품 화면 위에서** 서야 한다.
//
// jsdom 계층도 이 축을 재지 못한다 — 스타일시트를 적용하지 않으므로 규칙이
// 실렸든 안 실렸든 계산된 값이 같다. 클래스가 붙었는지만 보는 판정은 스타일이
// 통째로 빠진 화면에서도 통과한다.
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/editor-styles-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  openInEditor,
} from './_web-harness.mjs';

/** 태그와 수식을 함께 담는다 — 둘이 서로 다른 스타일시트에서 온다. */
const 본문 = [
  '# 스타일 시험',
  '',
  '본문에 #시험태그 가 있고 인라인 수식 $E = mc^2$ 도 있다.',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
].join('\n');

/**
 * 화면에 실린 스타일 규칙과 계산된 값을 읽는다.
 *
 * **클래스의 존재를 세지 않는다.** 클래스는 스타일이 통째로 빠진 화면에도
 * 그대로 붙어 있다 — 그것을 세는 판정이 이 결함을 놓쳐 온 이유다.
 */
const 스타일읽기 = () => {
  const 규칙 = [...document.styleSheets]
    .map((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText ?? '').join('\n');
      } catch {
        // 다른 출처의 시트는 규칙을 읽을 수 없다. 이 앱의 시트는 같은 출처다.
        return '';
      }
    })
    .join('\n');

  const 태그 = document.querySelector('.dl-tag');
  const 태그계산 = 태그 === null ? null : getComputedStyle(태그);

  const mathml = document.querySelector('.katex-mathml');
  const katex = document.querySelector('.katex');

  return {
    규칙에태그: 규칙.includes('dl-tag'),
    규칙에인라인프리뷰: 규칙.includes('cm-atomic'),
    규칙에katex: 규칙.includes('katex') || 규칙.includes('KaTeX'),
    태그있다: 태그 !== null,
    태그배경: 태그계산?.backgroundColor ?? null,
    태그반경: 태그계산?.borderRadius ?? null,
    수식글꼴: katex === null ? null : getComputedStyle(katex).fontFamily,
    mathml너비: mathml === null ? null : Math.round(mathml.getBoundingClientRect().width),
  };
};

/** 배경이 투명하면 칩이 아니다 — 기본값 그대로라는 뜻이다. */
const 칠해졌나 = (색) => 색 !== null && 색 !== 'rgba(0, 0, 0, 0)' && 색 !== 'transparent';

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);
  const doc = await makeDocument(page, 본문, 'editor-styles');

  try {
    await openInEditor(page, doc.id, doc.name);

    // 데코레이션이 설 때까지 기다린다 — 태그 요소가 서는 것이 그 신호다.
    const 잰것 = await waitUntil(
      () => page.evaluate(스타일읽기),
      (v) => v.태그있다,
      { timeout: 10_000 },
    );
    if (!잰것.태그있다) {
      note('(태그 데코레이션이 서지 않았다 — AC-1 판정이 이 자리에 매여 있다)');
    }

    beginMeasuring();

    // AC-1 — 태그가 칩으로 보인다. 계산된 값으로 재고 클래스로 재지 않는다.
    check(
      'AC-1 제품 화면에서 태그가 칩으로 보인다',
      칠해졌나(잰것.태그배경) && 잰것.태그반경 !== '0px',
      잰것.태그있다
        ? `배경 ${잰것.태그배경} · 테두리 반경 ${잰것.태그반경}`
        : '태그 요소가 없다',
    );

    // AC-2 — 편집기 스타일시트의 규칙이 실제로 실려 있다. 셋을 함께 본다:
    // 데코레이션 스타일(`editor.css`) · 인라인 프리뷰(`inline-preview.css`) ·
    // 수식 엔진의 스타일시트. 하나만 보면 나머지가 빠져도 통과한다.
    check(
      'AC-2 편집기 스타일 규칙이 제품 화면에 실려 있다',
      잰것.규칙에태그 && 잰것.규칙에인라인프리뷰 && 잰것.규칙에katex,
      `데코레이션 ${잰것.규칙에태그} · 인라인 프리뷰 ${잰것.규칙에인라인프리뷰} · 수식 ${잰것.규칙에katex}`,
    );

    // AC-3 은 구조에 대한 조항이라 화면에서 직접 재지 않는다. 다만 그 구조가
    // 무너지면 여기 세 판정 중 하나가 죽으므로, 이 검사가 그 파수를 맡는다.
    //
    // AC-4 — 수식도 같은 진입점을 지난다. 태그만 보면 스타일시트 하나가
    // 빠진 상태를 통과시킨다.
    check(
      'AC-4 수식도 같은 진입점에서 스타일을 받는다',
      (잰것.수식글꼴 ?? '').includes('KaTeX') &&
        잰것.mathml너비 !== null &&
        잰것.mathml너비 <= 1,
      `글꼴 ${잰것.수식글꼴 ?? '(없음)'} · MathML 사본 너비 ${잰것.mathml너비 ?? '(없음)'}px`,
    );

    note('(계산된 스타일을 잰다 — 클래스의 존재는 스타일이 빠진 화면에서도 참이다)');
  } finally {
    await removeDocument(page, doc.id);
  }
});
