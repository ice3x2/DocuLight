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
// 어긋남만으로는 부족하다. 어긋남을 0 으로 만드는 방법은 하나가 아니고 그중
// 하나는 겉보기 여백을 조용히 바꾼다 (④ 참조). 그래서 이 시험은 어긋남과
// 겉보기 간격을 함께 잰다.
//
// 종료 코드: 0 = 어긋남이 없고, 세 자리 모두 눌린 줄에 놓였으며, 코드블록의
// 세로 간격이 위젯이 선언한 여백과 같다 / 1 = 어긋났다 / 2 = 재지 못했다.
// 2 를 1 과 섞지 않는다 — 스크롤 사고나 데모 부재를 어긋남으로 오독하면
// 고칠 것이 없는 곳을 고치게 된다.
//
// **재지 못한 것과 회귀는 다르다.** 「재지 못했다」로 나가는 것은 시험이 스스로
// 그렇게 선언한 자리뿐이다 — 데브 서버가 없거나 붙은 화면이 데모가 아닌 경우와,
// 명시적으로 `unmeasurable()` 을 부르는 자리(줄이 화면 밖이다, fixture 가 문서에
// 없다). 그 밖의 예상 못 한 예외는 전부 1 로 나간다 — 그 자리에서 2 를 돌려주면
// 회귀가 「환경 탓」으로 조용히 묻힌다. 그 경계를 긋는 것이 `beginMeasuring()`
// 이고, 이 시험은 나머지 두 시험과 같은 자리에서 — 화면에 붙기 전에 — 긋는다.
//
// 사용: npm run dev --workspace @doculight/editor 로 데모를 띄운 뒤
//       node test/heightmap-drift-check.mjs [--headed]
//
// 브라우저를 띄우고 데모에 붙고 판정을 집계하는 기계장치는
// `_browser-harness.mjs` 에 있다. 이 파일에는 무엇을 재는지만 남는다.

import { VIEW, openDemo, runBrowserChecks, unmeasurable } from './_browser-harness.mjs';

// heightmap 과 DOM 좌표의 허용 차. 반올림 한 픽셀까지만 봐준다 — 이 시험이
// 잡은 재발이 38px 이었고, 되돌아오는 여백은 언제나 이보다 훨씬 크다.
const DRIFT_TOLERANCE_PX = 1;

// 데모 문서에서 각 자리를 찾는 토막. 줄번호로 적지 않는다 — 데모 문서가
// 자라면 줄번호는 조용히 틀려지지만 이 토막들은 함께 움직인다.
const PARAGRAPH_MARKER = '[[위키링크]]';
const CODE_MARKER = 'const answer: number = 42;';
const QUOTE_MARKER = '인용문입니다.';
const TABLE_SEPARATOR = '|---|';

await runBrowserChecks(async ({ page, check, beginMeasuring }) => {
  // 접속 실패와 「붙은 화면이 데모가 아니다」만 「재지 못했다」로 나간다 —
  // `openDemo` 가 그 둘을 안내 문구와 종료 코드 2 로 끝내고, 하네스가
  // `Unmeasurable` 을 이 경계보다 **먼저** 검사하므로 그 성질은 여기서
  // 보존된다. 명시적인 `unmeasurable()` 자리들(줄이 화면 밖이다, fixture 가
  // 문서에 없다)도 같은 이유로 종전대로 2 다.
  //
  // 그 밖의 예외는 여기서부터 전부 실패다. 위젯이 서지 않아 mermaid 를
  // 기다리다 시간이 다하거나 CM 의 뷰를 DOM 에서 되찾지 못하는 것은 환경
  // 사고가 아니라 회귀이고, 그것을 2 로 돌려주면 회귀가 「데브 서버 탓」으로
  // 조용히 묻힌다. 나머지 두 시험(`browser-check` · `table-reveal-check`)이
  // 긋는 경계도 같은 자리다 — 갈라 두면 같은 조건이 파일마다 다른 종료
  // 코드로 끝난다.
  beginMeasuring();

  // --- 붙은 화면이 editor 데모인지 먼저 확인한다. 아니면 판정을 내리지 않는다.
  await openDemo(page);

  // 어긋남을 만드는 것이 mermaid 위젯이므로 그것이 다 서기 전에는 재지 않는다.
  await page.waitForSelector('.dl-mermaid svg', { timeout: 20_000 });
  await page.waitForTimeout(1500); // 마지막 다이어그램 렌더 여유

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

  // heightmap 이 잡은 줄의 위치와 DOM 이 실제로 그린 위치의 차.
  //
  // **줄 상자끼리 견준다.** `coordsAtPos` 로 글자 상자를 재면 줄 높이와 글자
  // 높이의 차(leading)가 함께 들어와, 어긋남이 0 인 평범한 글줄에서도 2~3px 이
  // 나온다(헤딩처럼 글자가 크면 더 크다). 그 값으로는 「어긋나지 않았다」를
  // 단언할 수 없다 — 재는 축이 둘이 섞여 있기 때문이다. `domAtPos` 로 그 줄을
  // 그린 DOM(글줄이면 `.cm-line`, 블록 위젯이면 위젯의 바깥 상자)을 찾아 그
  // 상자의 top 을 heightmap 의 top 과 견주면 남는 것은 어긋남뿐이다.
  function driftAtLine(n) {
    return page.evaluate(`(() => {
      const view = ${VIEW};
      const line = view.state.doc.line(${n});
      const at = view.domAtPos(line.from);
      // 요소를 받으면 자식 index 로 한 번 내려간다 — 블록 위젯의 줄에서는 이
      // 자리가 곧 위젯의 바깥 상자다. (cm-content 자신은 위로 올라가 봐야
      // 줄 상자가 아니라 문서 전체다.)
      let node = at.node;
      if (node.nodeType === 1 && node.childNodes[at.offset]) node = node.childNodes[at.offset];
      if (node.nodeType === 3) node = node.parentNode;
      const el = node.closest ? node.closest('.cm-line, .cm-content > *') : null;
      if (!el) return null;
      const block = view.lineBlockAt(line.from);
      return Math.round(el.getBoundingClientRect().top - (view.documentTop + block.top));
    })()`);
  }

  // 한 줄을 화면 안으로 들인다. CM6 는 뷰포트 밖 줄을 렌더하지 않으므로 그
  // 줄의 DOM 을 재기 전에 반드시 부른다. heightmap 이 잡은 그 줄의 자리를
  // 스크롤러 좌표로 옮기는 것이라 위젯이 서 있든 걷혔든 같은 곳으로 간다.
  async function bringLineIntoView(n) {
    await page.evaluate(`(() => {
      const view = ${VIEW};
      const scroller = document.querySelector('.cm-scroller');
      const block = view.lineBlockAt(view.state.doc.line(${n}).from);
      scroller.scrollTop +=
        view.documentTop + block.top - scroller.getBoundingClientRect().top - 200;
      return null;
    })()`);
    await page.waitForTimeout(450);
  }

  // 코드블록 위젯의 겉보기 세로 간격과 그 위젯이 스스로 선언한 여백.
  //
  // 보이는 상자는 shiki 가 낸 안쪽 `<pre>` 다. 그것이 아직 오지 않았으면
  // (`CodeWidget.toDOM` 의 첫 프레임은 원문 텍스트뿐이다) 잴 축이 없으므로
  // `null` 을 돌려준다.
  function codeBlockSpacing() {
    return page.evaluate(`(() => {
      const outer = document.querySelector('.dl-code');
      const ink = outer && outer.firstElementChild;
      if (!ink) return null;
      const prev = outer.previousElementSibling;
      const next = outer.nextElementSibling;
      if (!prev || !next) return null;
      const style = getComputedStyle(outer);
      const box = (el) => el.getBoundingClientRect();
      return {
        padTop: Math.round(parseFloat(style.paddingTop)),
        padBottom: Math.round(parseFloat(style.paddingBottom)),
        above: Math.round(box(ink).top - box(prev).bottom),
        below: Math.round(box(next).top - box(ink).bottom),
      };
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
  const codeLine = await lineOf(CODE_MARKER);
  const tableRange = await tableRangeOf();

  if (paragraphLine === null || quoteLine === null || codeLine === null || tableRange === null) {
    unmeasurable(
      '데모 문서에서 fixture 를 찾지 못했다 ' +
        `(문단 ${paragraphLine}, 인용 ${quoteLine}, 코드 ${codeLine}, ` +
        `표 ${tableRange ? '있음' : '없음'}). ` +
        'demo/App.tsx 의 문단·인용문·코드블록·표가 사라졌는지 확인하라.',
    );
  }

  // --- ⓪ 원인 축 — heightmap 과 DOM 이 어긋나지 않는다
  //
  // ①~③ 은 사용자 관점(눌린 줄에 커서가 놓이는가)이고, 이 항은 그 원인을
  // 직접 잰다. 둘 다 있어야 한다: 클릭 판정은 줄 상자의 **한가운데**를 누르므로
  // 어긋남이 줄 높이의 절반보다 작으면 그대로 통과한다 — `padding` 이 일부만
  // `margin` 으로 되돌아가는 부분 재발은 클릭만으로는 잡히지 않는다.
  await bringTailIntoView();
  for (const [label, line] of [
    ['표 첫 줄', tableRange.from],
    ['문단', paragraphLine],
    ['인용', quoteLine],
  ]) {
    const drift = await driftAtLine(line);
    if (drift === null) {
      unmeasurable(`${label}(${line}행)의 화면 좌표를 얻지 못했다 — 그 줄이 화면 밖이라 재지 못했다.`);
    }
    check(
      `⓪ ${label}(${line}행)에서 heightmap 과 DOM 이 어긋나지 않는다`,
      Math.abs(drift) <= DRIFT_TOLERANCE_PX,
      `${drift}px (DOM 이 heightmap 보다 이만큼 아래에 그려진다, 허용 ±${DRIFT_TOLERANCE_PX}px)`,
    );
  }
  console.log('');

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
  const label = `③ 표(${tableRange.from}-${tableRange.to}행)의 칸을 누르면 커서가 표 줄에 놓인다`;
  if (cellCount === 0) {
    // **「재지 못했다」가 아니라 실패다.** 표 위젯이 서지 않는 것은 스크롤
    // 사고가 아니라 데코레이션 축의 회귀 신호다 — 노출 판정이 잘못 서서 초점
    // 없는 상태에서도 원문이 드러나면 정확히 이 모습이 된다. 표 영역은 바로
    // 위의 `bringTailIntoView()` 로 이미 화면에 들어와 있으므로 「화면 밖이라
    // 안 보인다」는 가설은 여기서 이미 배제돼 있다.
    check(label, false, '표 위젯이 서 있지 않다 — 칸이 0개다 (노출 판정 회귀)');
  } else {
    await cells.first().click();
    await page.waitForTimeout(400);
    const tableLanded = await cursorLine();
    check(
      label,
      tableLanded >= tableRange.from && tableLanded <= tableRange.to,
      `커서 ${tableLanded}행 (표 ${tableRange.from}-${tableRange.to}행, 칸 ${cellCount}개)`,
    );
  }

  // --- ④ 코드블록 — 겉보기 세로 간격이 위젯이 선언한 여백과 같다
  //
  // ⓪ 은 어긋남만 잰다. 그런데 어긋남을 0 으로 만드는 방법은 하나가 아니고,
  // 그중 하나 — 바깥 `margin` 을 `padding` 으로 바꾸기 — 는 겉보기를 조용히
  // 바꾼다. 코드블록 위젯 안에는 shiki 가 낸 또 하나의 `<pre>` 가 서고 그것도
  // UA `margin: 1em 0` 을 갖는데, 바깥에 `padding` 이 생기는 순간 둘의 margin
  // collapsing 이 끊겨 여백이 1em 에서 2em 으로 두 배가 된다. 어긋남은 0 인
  // 채로 화면만 달라지므로 ⓪ 도 ①~③ 도 그것을 보지 못한다. 실제로 그렇게
  // 한 번 빠져나갔다.
  //
  // 절대 픽셀로 적지 않는다. 위젯이 스스로 선언한 `padding` 을 기준으로 삼고
  // 「보이는 상자가 그 여백 자리에서 시작해 그 자리에서 끝나는가」만 본다 —
  // 폰트 크기가 바뀌면 기준도 함께 움직이고, 안쪽 여백이 새는 순간에만 깨진다.
  await bringLineIntoView(codeLine);
  const spacingLabel = `④ 코드블록(${codeLine}행)의 세로 간격이 위젯이 선언한 여백과 같다`;
  const spacing = await codeBlockSpacing();
  if (spacing === null) {
    // **「재지 못했다」가 아니라 실패다.** ③ 의 칸 0개와 같은 이유다 — 바로
    // 위에서 이 블록을 화면에 들였고 커서도 이 블록 밖(③ 이 누른 표 안)에
    // 있으므로 위젯은 서 있어야 하고 하이라이팅도 와 있어야 한다.
    check(
      spacingLabel,
      false,
      '코드블록 위젯이 서 있지 않거나 하이라이팅이 오지 않았다 (`.dl-code > pre` 부재)',
    );
  } else {
    check(
      spacingLabel,
      Math.abs(spacing.above - spacing.padTop) <= DRIFT_TOLERANCE_PX &&
        Math.abs(spacing.below - spacing.padBottom) <= DRIFT_TOLERANCE_PX,
      `위 ${spacing.above}px / 아래 ${spacing.below}px ` +
        `(위젯 padding ${spacing.padTop}/${spacing.padBottom}px, 허용 ±${DRIFT_TOLERANCE_PX}px)`,
    );
  }
});
