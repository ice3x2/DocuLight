// 실제 브라우저에서 본문 태그 칩의 겉모습과 노출 왕복을 확인한다
// (FR-EDITOR-007 AC-10).
//
// AC-10 은 「칩으로 렌더되고, 그 줄에 커서를 올리면 `#` 를 포함한 원문이
// 드러난다」다. 앞절반의 「칩으로」는 겉모습에 관한 요구이고, 겉모습은 클래스
// 이름이 아니라 **계산된 스타일**로만 잴 수 있다. vitest 쪽 항
// (`live-preview.test.tsx` 의 AC-10)은 `.dl-tag` 요소가 서고 그 글자가 `#회의`
// 인지를 재는데, 그것은 데코레이션 배선의 축이지 겉모습의 축이 아니다 —
// 실제로 `chip.className = 'dl-tag'` 는 붙어 있는데 저장소의 CSS 넷 어디에도
// `.dl-tag` 규칙이 0건이어서, 「칩」이 스타일 없는 `span` 으로 서 있고 평범한
// 글자와 구별되지 않는 채로 그 항이 통과하고 있었다. 그러니 두 축은 겹치지
// 않으며 둘 다 필요하다.
//
// 이 시험은 서버를 띄우지 않는다. 이미 떠 있는 데모에 붙는다.
//
// 사용: npm run dev --workspace @doculight/editor 로 데모를 띄운 뒤
//       node test/tag-chip-check.mjs [--headed]
//
// 언제 누가 돌리는가: 아무도 자동으로 부르지 않는다 — `npm test` 의 vitest
// include 는 `.mjs` 를 잡지 않고, 이 저장소에는 CI 가 없다(`.github/` 자체가
// 없다). 태그·라이브 프리뷰·에디터 스타일시트에 닿는 변경을 낸 사람이 커밋
// 전에 데브 서버를 띄운 채 저장소 루트에서 `npm run test:browser:all` 로
// 브라우저 시험 셋을 한 번에 돌린다.
//
// 브라우저를 띄우고 데모에 붙고 판정을 집계하는 기계장치는
// `_browser-harness.mjs` 에 있다. 이 파일에는 무엇을 재는지만 남는다.

import { VIEW, openDemo, runBrowserChecks, unmeasurable } from './_browser-harness.mjs';

// 데모 문서의 본문 태그. 이 토막은 문서 전체에서 그 한 줄에만 있다 — 펜스 안의
// `fill:#e0e7ff` 류는 `findTags` 가 보는 원문에서 이미 가려져 태그가 되지 않는다.
const TAG_TEXT = '#회의';

// 커서를 태그 줄 밖으로 뺄 자리. 태그 줄과 같은 화면에 들어오는 인용문이다.
const QUOTE_TEXT = '인용문입니다.';

// 색을 0-255 세 성분으로 눕힌다. 계산된 색은 형식이 한 가지가 아니다 —
// `color-mix()` 를 쓴 자리는 크롬에서 `color(srgb …)` 로, 나머지는 `rgb()` ·
// `rgba()` 로 돌아온다. 형식이 다르면 같은 색도 문자열로는 다르므로, 문자열을
// 그대로 견주면 아무것도 안 바뀌었는데 「달라졌다」가 나온다.
//
// `color()` 는 색공간 이름을 가리지 않고 성분만 읽는다. display-p3 를 srgb 로
// 읽는 것은 근사지만, 여기서 재는 것은 「얼마나 다른가」이므로 근사로 족하고,
// 색공간을 가려서 파싱에 실패하는 쪽보다 오탐이 안전한 방향으로 기운다.
// 퍼센트 표기와 색역 밖 음수 성분도 함께 받는다.
//
// 읽어내지 못한 값은 `null` 이다. 그 경우를 통과로 두면 파싱 실패가 곧
// 통과가 되므로, 부르는 쪽에서 구별 없음으로 다룬다.
const RGB_OF = `((value) => {
  const text = String(value ?? '');
  if (text === 'transparent') return [0, 0, 0];
  const fn = text.match(/^color\\(\\s*[a-z0-9-]+\\s+([^)]*)\\)/);
  if (fn) {
    const parts = fn[1].split('/')[0].trim().split(/\\s+/).slice(0, 3);
    if (parts.length < 3) return null;
    return parts.map((p) => {
      const n = Number(p.replace('%', ''));
      if (Number.isNaN(n)) return NaN;
      return Math.round(Math.min(255, Math.max(0, p.endsWith('%') ? n * 2.55 : n * 255)));
    });
  }
  const rgb = text.match(/^rgba?\\(([^)]*)\\)/);
  if (rgb) {
    const parts = rgb[1].split(',').slice(0, 3);
    if (parts.length < 3) return null;
    return parts.map((n) => Math.round(Number(n)));
  }
  return null;
})`;

// 알파를 뽑는다. 알파가 0 이면 RGB 성분이 무엇이든 화면에는 아무것도 그려지지
// 않으므로, 그 색은 「색이 없다」와 같다.
//
// 성분을 순서대로 훑어 마지막을 알파로 삼는 방식은 쓰지 않는다 — 그러면
// `color(display-p3 …)` 의 `3` 이 첫 성분으로 들어가 자리가 통째로 밀리고,
// 불투명한 색이 투명으로 읽힌다. 형식마다 알파가 있는 자리를 명시한다.
const ALPHA_OF = `((value) => {
  const text = String(value ?? '');
  if (text === 'transparent') return 0;
  const slashed = text.match(/\\/\\s*([\\d.]+)(%?)\\s*\\)\\s*$/);
  if (slashed) return slashed[2] === '%' ? Number(slashed[1]) / 100 : Number(slashed[1]);
  const rgba = text.match(/^rgba\\(([^)]*)\\)/);
  if (rgba) {
    const parts = rgba[1].split(',');
    return parts.length === 4 ? Number(parts[3]) : 1;
  }
  return 1;
})`;

// 배경은 알파와 색을 따로 걸지 않고 **바탕 위에 합성한 결과**로 잰다. 알파
// 하한과 색 부등호를 따로 두면 그 사이로 빠져나가는 값이 생긴다 — 진한 색을
// 3% 로 묽히면 알파는 하한을 넘고 원색은 바탕과 다르지만 합성 결과는 바탕과
// 사실상 같다. 합성해서 재면 그 경로가 한꺼번에 닫히고 판정도 단순해진다.
//
// 채널당 8 은 인접한 두 면의 색을 눈으로 갈라내기 시작하는 어림이다. 지금
// 칩(강조색 12%)은 이 값으로 18 이 나오고, 같은 색을 3% 로 묽히면 5 가 나와
// 걸린다.
const MIN_VISIBLE_DELTA = 8;

// 테두리·윤곽선·그림자는 바탕에 섞이지 않고 제 색으로 그려지므로 알파만 본다.
// 알파 0 만 걸러내면 `rgba(…, 0.002)` 짜리 선이 「구별된다」로 통과한다.
const MIN_VISIBLE_ALPHA = 0.05;

await runBrowserChecks(async ({ page, check, beginMeasuring }) => {
  // 접속 실패와 「붙은 화면이 데모가 아니다」만 「재지 못했다」로 나간다 —
  // `openDemo` 가 그 둘을 안내 문구와 종료 코드 2 로 끝낸다. 그 밖의 예외는
  // 여기서부터 전부 실패다. 화면은 떴는데 편집기가 마운트되지 않거나 CM 의
  // 뷰를 DOM 에서 되찾지 못하는 것은 환경 사고가 아니라 회귀이고, 그것을 2 로
  // 돌려주면 회귀가 「데브 서버 탓」으로 조용히 묻힌다.
  beginMeasuring();

  await openDemo(page);
  await page.waitForTimeout(1200); // 초기 파싱·위젯 마운트 여유

  // 태그가 놓인 줄. 문서는 데코레이션과 무관하게 언제나 원문을 들고 있으므로
  // 칩이 서 있든 걷혔든 같은 값이 나온다.
  const tagLine = await page.evaluate(`(() => {
    const view = ${VIEW};
    const doc = view.state.doc;
    const index = doc.toString().indexOf(${JSON.stringify(TAG_TEXT)});
    if (index < 0) return null;
    return { number: doc.lineAt(index).number };
  })()`);

  if (!tagLine) {
    unmeasurable(
      '데모 문서에서 본문 태그 fixture 를 찾지 못했다. ' +
        `demo/App.tsx 의 SAMPLE 에서 \`${TAG_TEXT}\` 가 사라졌는지 확인하라.`,
    );
  }

  // 태그 줄은 문서 끝머리에 있고 CM6 는 뷰포트 밖 줄을 렌더하지 않는다. 재는
  // 것마다 그 줄을 먼저 화면에 들여야 칩의 개수와 계산된 스타일이 뜻을 갖는다.
  async function bringTagIntoView() {
    await page.evaluate(`(() => {
      const scroller = document.querySelector('.cm-scroller');
      scroller.scrollTop = scroller.scrollHeight;
    })()`);
    await page.waitForTimeout(400);
  }

  // 「칩이 서 있는가」와 「원문이 드러났는가」는 서로의 부정이 아니다. 칩의
  // 글자도 `#회의` 라 텍스트 등장만으로는 갈리지 않는다 — 칩을 뺀 나머지
  // 텍스트에서 찾아야 원문이 드러난 것이다.
  function snapshot() {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const content = document.querySelector('.cm-content');
      const clone = content.cloneNode(true);
      for (const chip of clone.querySelectorAll('.dl-tag')) chip.remove();
      const head = view.state.selection.main.head;
      return {
        chips: content.querySelectorAll('.dl-tag').length,
        revealed: clone.textContent.includes(${JSON.stringify(TAG_TEXT)}),
        cursorLine: view.state.doc.lineAt(head).number,
      };
    })()`);
  }

  // 조건이 설 때까지 짧게 기다린다. 서면 즉시 돌아오고, 서지 않으면 상한까지만
  // 기다린다 — 통과는 빠르고 실패는 일정하다.
  async function waitFor(holds, timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = await snapshot();
      if (holds(s)) return s;
      if (Date.now() >= deadline) return s;
      await page.waitForTimeout(100);
    }
  }

  // 커서를 태그 줄 밖으로 빼는 실제 제스처. 문서 위쪽의 인용문을 누른다.
  async function clickAwayFromTag() {
    await page.getByText(QUOTE_TEXT).first().click();
    await page.waitForTimeout(300);
  }

  await bringTagIntoView();

  // 인용문도 태그와 같은 fixture 다. 없는 것을 누르러 가면 판정문 대신 30 초짜리
  // 타임아웃 트레이스가 남고, 사람은 표본이 어긋났다는 사실을 읽어내지 못한다.
  if ((await page.getByText(QUOTE_TEXT).count()) === 0) {
    unmeasurable(
      '데모 문서에서 인용문 fixture 를 찾지 못했다 — 커서를 태그 줄 밖으로 뺄 자리가 없다. ' +
        `demo/App.tsx 의 SAMPLE 에서 \`${QUOTE_TEXT}\` 가 사라졌는지 확인하라.`,
    );
  }

  await clickAwayFromTag();
  await bringTagIntoView();

  // --- ① 칩이 주변 글자와 시각적으로 구별된다
  //
  // 겉모습을 재는 자리다. 조항이 요구하는 「칩」은 **상자**다 — 태그 글자를
  // 둘러싼 무언가가 그려져야 주변 글자와 갈린다. 그래서 상자를 실제로 그리는
  // 수단만 통과 사유로 둔다: 칠해진 배경 · 테두리 · 윤곽선 · 그림자.
  //
  // 글자색과 모서리는 재되 판정에 넣지 않는다. 둘 다 상자를 그리지 않기
  // 때문이다 — 색만 다른 글자는 링크이지 칩이 아니고, 배경도 테두리도 없는
  // 상자의 둥근 모서리는 0 픽셀을 그린다. 이 둘을 통과 사유로 두면 상자를
  // 지워도 이 항이 살아남아, 이 시험이 대신하러 온 그 공허함이 되돌아온다.
  //
  // 클래스가 붙었는지는 여기서 재지 않는다. 그것을 재면 규칙이 0건이던 종전
  // 상태에서도 통과한다 — 이 항이 존재하는 이유가 바로 그것이다.
  const look = await page.evaluate(`(() => {
    const chip = document.querySelector('.dl-tag');
    if (!chip) return null;
    const line = chip.closest('.cm-line');
    const c = getComputedStyle(chip);
    const l = getComputedStyle(line);
    const rgbOf = ${RGB_OF};
    const alphaOf = ${ALPHA_OF};
    const paints = (color) => alphaOf(color) >= ${MIN_VISIBLE_ALPHA};
    const readable = (rgb) => rgb !== null && rgb.every((v) => !Number.isNaN(v));

    // 칩의 배경이 얹히는 바탕. 비교 상대를 .cm-line 으로 두면 안 된다 — 이
    // 저장소의 줄은 배경을 칠하지 않아서 그 비교가 「칩이 배경을 갖기만 하면
    // 된다」로 퇴화하고, 페이지와 똑같은 색을 칠한 보이지 않는 칩이 통과한다.
    // 실제로 칠해진 첫 조상까지 올라가야 사람이 보는 대비가 된다.
    let backdrop = 'rgb(255, 255, 255)';
    for (let node = chip.parentElement; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (alphaOf(bg) > 0) {
        backdrop = bg;
        break;
      }
    }

    // 칩 배경을 바탕 위에 합성한 결과가 바탕과 얼마나 다른가. 알파와 색을
    // 따로 걸지 않고 이 한 값으로 판정한다.
    const chipRgb = rgbOf(c.backgroundColor);
    const backRgb = rgbOf(backdrop);
    let bgDelta = 0;
    if (readable(chipRgb) && readable(backRgb)) {
      const a = alphaOf(c.backgroundColor);
      bgDelta = Math.max(
        ...chipRgb.map((v, i) => Math.abs(v * a + backRgb[i] * (1 - a) - backRgb[i])),
      );
    }
    const bgDiffers = bgDelta >= ${MIN_VISIBLE_DELTA};

    const borderDiffers =
      parseFloat(c.borderTopWidth) > 0 &&
      c.borderTopStyle !== 'none' &&
      paints(c.borderTopColor);

    // 윤곽선·그림자·배경 이미지도 상자를 그린다. 이것들을 빼면 테두리 대신
    // 그것들로 칩을 그린 정당한 재디자인이 근거 없이 실패하고, 그 압력은
    // 시험을 약화시키는 쪽으로 간다.
    const outlineDiffers =
      parseFloat(c.outlineWidth) > 0 && c.outlineStyle !== 'none' && paints(c.outlineColor);

    // 그림자도 나머지와 같은 엄격함으로 잰다. 「none 이 아니다」만 보면
    // \`box-shadow: 0 0 0 0 transparent\` 처럼 0 픽셀을 그리는 값이 통과한다 —
    // 그것은 transition 자리표시로 흔히 쓰이는 관용구다. 색이 보이고, 오프셋 ·
    // 흐림 · 번짐 중 하나라도 0 이 아니어야 실제로 무언가가 그려진다.
    const shadowColor = c.boxShadow.match(/rgba?\\([^)]*\\)|color\\([^)]*\\)/);
    const shadowLengths = c.boxShadow.match(/-?[\\d.]+px/g) ?? [];
    const shadowDiffers =
      c.boxShadow !== 'none' &&
      shadowColor !== null &&
      paints(shadowColor[0]) &&
      shadowLengths.some((v) => parseFloat(v) !== 0);

    // 그러데이션으로 칠한 칩은 계산된 backgroundColor 가 투명이라 위의 합성
    // 판정에 걸리지 않는다. 사람 눈에는 명백히 채워진 상자이므로 별도 축으로
    // 받는다. 안에 보이는 색이 하나도 없으면 그것도 0 픽셀이다.
    const imageColors = c.backgroundImage.match(/rgba?\\([^)]*\\)|color\\([^)]*\\)/g) ?? [];
    const imageDiffers =
      c.backgroundImage !== 'none' &&
      (imageColors.length === 0 || imageColors.some(paints));

    // 글자색은 기록만 한다 — 모서리(아래 radius)와 함께, 상자를 그리지 않으므로
    // 판정에 넣지 않는다.
    const chipColorRgb = rgbOf(c.color);
    const lineColorRgb = rgbOf(l.color);
    const colorDiffers =
      readable(chipColorRgb) &&
      readable(lineColorRgb) &&
      String(chipColorRgb) !== String(lineColorRgb);

    return {
      bgDiffers,
      bgDelta: Math.round(bgDelta),
      borderDiffers,
      outlineDiffers,
      shadowDiffers,
      imageDiffers,
      colorDiffers,
      chipBg: c.backgroundColor,
      backdrop,
      lineColor: l.color,
      chipColor: c.color,
      border: \`\${c.borderTopWidth} \${c.borderTopStyle} \${c.borderTopColor}\`,
      outline: \`\${c.outlineWidth} \${c.outlineStyle}\`,
      shadow: c.boxShadow,
      image: c.backgroundImage,
      radius: c.borderTopLeftRadius,
    };
  })()`);

  // 칩이 한 개도 서지 않은 것은 「재지 못했다」가 아니라 실패다. 화면은 떴고
  // 문서에 태그도 있는데 칩이 없다면 데코레이션이 죽은 것이고, 그것을 2 로
  // 돌려주면 회귀가 「환경 탓」으로 묻힐 뿐 아니라 그 순간 ② 도 함께 실행되지
  // 않아 노출 축까지 통째로 조용해진다 — 실제로 이 자리를 `unmeasurable` 로
  // 두었을 때 뮤테이션 탐침이 그 구멍을 잡아냈다.
  check(
    '① 칩이 상자로 그려져 주변 글자와 시각적으로 구별된다 — 배경·테두리·윤곽선·그림자·그러데이션 중 최소 하나',
    look !== null &&
      (look.bgDiffers ||
        look.borderDiffers ||
        look.outlineDiffers ||
        look.shadowDiffers ||
        look.imageDiffers),
    look === null
      ? '태그 칩(.dl-tag)이 화면에 한 개도 서지 않았다'
      : `배경 ${look.chipBg} 을 바탕 ${look.backdrop} 위에 합성한 차 ${look.bgDelta}/255 ` +
        `(${look.bgDiffers ? '다름' : '같음'}, 기준 ${MIN_VISIBLE_DELTA}), ` +
        `테두리 ${look.border} (${look.borderDiffers ? '있음' : '없음'}), ` +
        `윤곽선 ${look.outline} (${look.outlineDiffers ? '있음' : '없음'}), ` +
        `그림자 ${look.shadow} (${look.shadowDiffers ? '있음' : '없음'}), ` +
        `그러데이션 ${look.image} (${look.imageDiffers ? '있음' : '없음'}) ` +
        `/ 판정에 넣지 않는 관찰 — 글자색 ${look.chipColor} vs 줄 ${look.lineColor} ` +
        `(${look.colorDiffers ? '다름' : '같음'}), 모서리 ${look.radius}`,
  );

  // --- ② 커서를 태그 줄에 올리면 원문이 드러나고, 빼면 다시 칩이 된다
  //
  // 왕복 둘을 한 판정에 묶는다. 드러나기만 재면 데코레이션을 통째로 지워도
  // 통과하고, 걷히기만 재면 노출 경로가 죽어도 통과한다.
  // 커서를 올리는 제스처는 칩을 누르는 것이다. 칩이 없으면 그 제스처 자체가
  // 성립하지 않으므로 누르러 가지 않는다 — 없는 것을 누르러 가면 판정문 대신
  // 30 초짜리 타임아웃 트레이스가 남는다. 그 경우 아래 전건의 `idle.chips >= 1`
  // 이 거짓이라 이 항은 그대로 실패하고, 칩이 0 개였다는 사실이 detail 에 남는다.
  const idle = await snapshot();
  let afterClick = idle;
  let afterLeave = idle;
  if (idle.chips >= 1) {
    await page.locator('.dl-tag').first().click();
    afterClick = await waitFor((s) => s.revealed);
    await clickAwayFromTag();
    await bringTagIntoView();
    afterLeave = await waitFor((s) => s.chips >= 1);
  }

  // 복귀 절반에 `!afterLeave.revealed` 를 함께 문다. `chips` 는 문서 전체를
  // 세는 값이라, 표본에 태그가 하나 더 생기는 순간 「이 태그의 노출이 걷히지
  // 않는다」는 회귀가 다른 태그의 칩 하나로 가려진다.
  check(
    '② 커서를 태그 줄에 올리면 `#` 를 포함한 원문이 드러나고, 빼면 다시 칩이 된다',
    idle.chips >= 1 &&
      !idle.revealed &&
      afterClick.revealed &&
      afterLeave.chips >= 1 &&
      !afterLeave.revealed,
    `커서 밖 — 칩 ${idle.chips}개·원문 ${idle.revealed ? '보임' : '숨음'} / ` +
      `클릭 후 — 칩 ${afterClick.chips}개·원문 ${afterClick.revealed ? '보임' : '숨음'} (커서 ${afterClick.cursorLine}행, 태그 ${tagLine.number}행) / ` +
      `복귀 — 칩 ${afterLeave.chips}개·원문 ${afterLeave.revealed ? '보임' : '숨음'}`,
  );
});
