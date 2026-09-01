// 실제 브라우저에서 인라인 라이브 프리뷰가 **보이는가**를 확인한다
// (원장 §4 **수용 기준 2** 의 헤딩 · 강조 · 목록 · 링크 · 인용).
//
// vitest 쪽은 그 요소들이 서는지를 이미 잰다(`live-preview.test.tsx` 23항). 그
// 계층이 재지 못하는 것은 **그것이 주변 글자와 실제로 달라 보이는가**다 —
// happy-dom 은 스타일시트를 적용하지 않으므로 `getComputedStyle` 이 언제나
// 기본값을 돌려주고, 클래스만 붙고 규칙이 하나도 없는 상태에서 그 항들이 전건
// 통과한다. 이 저장소는 그 부류를 이미 두 번 겪었다 — `.dl-tag` 규칙이 0건이라
// 태그가 평범한 글자로 서 있었고, 제품이 편집기 스타일시트를 아예 얹지 않아
// 같은 일이 화면 전체에서 일어났다.
//
// **헤딩은 줄 높이까지 잰다.** 글자가 커지면 그 줄의 높이가 달라지고, 그것이
// CM6 heightmap 과 어긋나면 클릭이 눌린 줄보다 아래에 커서를 놓는다 — 표와
// 코드블록에서 이미 겪은 함정이며 `heightmap-drift-check.mjs` 가 그 셋을 잰다.
// 여기서는 헤딩 줄을 실제로 눌러 그 줄에 커서가 놓이는지 본다.
//
// 이 시험은 서버를 띄우지 않는다. 이미 떠 있는 데모에 붙는다.
//
// 사용: npm run dev --workspace @doculight/editor 로 데모를 띄운 뒤
//       node test/inline-preview-check.mjs [--headed]
//       (web 검사와 함께 돌릴 때는 포트를 나눈다 —
//        npx vite --port 3401 --strictPort 뒤 EDITOR_URL=http://localhost:3401/)

import { openDemo, runBrowserChecks, unmeasurable, VIEW } from './_browser-harness.mjs';

/** 데모 문서에서 헤딩 줄을 찾을 표지. */
const HEADING_TEXT = '## 나머지 라이브 프리뷰';

/**
 * 그 클래스를 가진 첫 요소와, 같은 화면의 **평범한 글자** 하나의 계산된 값.
 *
 * 절대값으로 재지 않는다 — 테마가 바뀌면 그 값이 흔들리고, 흔들릴 때마다
 * 시험이 깨지면 아무도 그것을 고치지 않게 된다. 재는 것은 **다른가**이며
 * 그것이 「달라 보인다」의 실질이다.
 */
const 견준다 = (selector, prop) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (el === null) return null;
  // 기준은 편집기 본문이다. 편집기 밖의 글자와 견주면 편집기 전체에 걸린
  // 스타일까지 차이로 세어져, 그 요소만의 차이가 묻힌다.
  const base = document.querySelector('.cm-content');
  if (base === null) return null;
  return {
    값: getComputedStyle(el).getPropertyValue(${JSON.stringify(prop)}),
    기준: getComputedStyle(base).getPropertyValue(${JSON.stringify(prop)}),
    글자: (el.textContent ?? '').slice(0, 20),
  };
})()`;

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  beginMeasuring();

  await openDemo(page);
  await page.waitForTimeout(1200); // 초기 파싱·데코레이션 마운트 여유

  // **재려는 줄을 화면 안으로 가져온다.** CM6 는 화면 밖 줄을 그리지 않으므로
  // (`.cm-gap` 이 그 자리를 대신한다) 스크롤하지 않으면 「데코레이션이 없다」와
  // 「아직 안 그렸다」가 갈리지 않는다. 다섯 요소는 데모 문서의 같은 구역에
  // 모여 있어 한 번의 스크롤로 함께 온다.
  const 자리잡힘 = await page.evaluate(`(() => {
    const view = ${VIEW};
    const index = view.state.doc.toString().indexOf(${JSON.stringify(HEADING_TEXT)});
    if (index < 0) return false;
    const block = view.lineBlockAt(view.state.doc.lineAt(index).from);
    view.scrollDOM.scrollTop = block.top - 60;
    return true;
  })()`);
  if (!자리잡힘) unmeasurable(`데모 문서에서 헤딩(${HEADING_TEXT})을 찾지 못했다.`);
  await page.waitForTimeout(600); // 스크롤 뒤 그려질 여유

  // ── 계산된 스타일 — 다섯이 주변 글자와 다르게 보이는가 ──────────────
  const 축들 = [
    ['헤딩이', '.cm-atomic-h2', 'font-size'],
    ['강조가', '.cm-atomic-strong', 'font-weight'],
    ['목록 표지가', '.cm-atomic-bullet', 'color'],
    ['인용이', '.cm-atomic-blockquote', 'border-left-width'],
    ['링크가', '.cm-atomic-link', 'color'],
  ];

  for (const [이름, selector, prop] of 축들) {
    const 잰것 = await page.evaluate(견준다(selector, prop));
    if (잰것 === null) {
      unmeasurable(
        `${이름.slice(0, -1)}(${selector})이 화면에 서지 않아 재지 못했다 — 데모 문서에 그 요소가 있는지 확인하라.`,
      );
    }
    check(
      `수용 기준 2 ${이름} 본문과 다르게 그려진다 (${prop})`,
      잰것.값 !== 잰것.기준 && 잰것.값 !== '' && 잰것.값 !== '0px',
      `${prop} ${잰것.값} ↔ 본문 ${잰것.기준} · 「${잰것.글자}」`,
    );
  }

  // ── heightmap — 헤딩 줄을 누르면 그 줄에 커서가 놓이는가 ───────────
  const 헤딩줄 = await page.evaluate(`(() => {
    const view = ${VIEW};
    const index = view.state.doc.toString().indexOf(${JSON.stringify(HEADING_TEXT)});
    if (index < 0) return null;
    return view.state.doc.lineAt(index).number;
  })()`);

  if (헤딩줄 === null) {
    unmeasurable(`데모 문서에서 헤딩(${HEADING_TEXT})을 찾지 못했다.`);
  }

  // **DOM 좌표를 CM6 에게 묻는다.** 클릭은 heightmap 으로 줄을 찾으므로, 둘이
  // 어긋나 있으면 여기서 얻은 자리를 눌러도 다른 줄에 커서가 놓인다 — 그
  // 어긋남이 정확히 이 판정이 겨누는 것이다.
  //
  // 줄의 **한가운데**를 누른다. 가장자리를 누르면 어긋남이 줄 높이의 절반보다
  // 작을 때 그대로 통과한다.
  const 좌표 = await page.evaluate(`(() => {
    const view = ${VIEW};
    const line = view.state.doc.line(${헤딩줄});
    const coords = view.coordsAtPos(line.from);
    if (coords === null) return null;
    return { x: coords.left + 20, y: (coords.top + coords.bottom) / 2 };
  })()`);

  if (좌표 === null) {
    unmeasurable('헤딩 줄의 화면 좌표를 얻지 못했다 — 그 줄이 화면 밖이라 재지 못했다.');
  }

  await page.mouse.click(좌표.x, 좌표.y);
  const 놓인줄 = await page.evaluate(`(() => {
    const view = ${VIEW};
    return view.state.doc.lineAt(view.state.selection.main.head).number;
  })()`);

  check(
    `수용 기준 2 헤딩 줄(${헤딩줄}행)을 누르면 그 줄에 커서가 놓인다`,
    놓인줄 === 헤딩줄,
    `커서가 ${놓인줄}행에 놓였다`,
  );

  note('(계산된 값을 절대값으로 재지 않는다 — 재는 것은 본문과 다른가이며 그것이 「달라 보인다」의 실질이다)');
});
