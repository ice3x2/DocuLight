// 실제 브라우저에서 머지 뷰가 서는지 확인한다 (원장 §4 **수용 기준 6·12**).
//
// **이 두 기준은 같은 부품을 쓴다.** 충돌 병합과 버전 비교가 둘 다
// `src/document/MergeView.tsx` 한 곳을 지나므로(`IR-STORAGE-001` AC-3),
// 검사 하나가 두 기준의 「브라우저 잔여」를 함께 닫는다.
//
// **jsdom 계층이 이 축을 재지 못하는 이유는 구조적이다.** `MergeView` 는
// 원문을 `<pre aria-label="왼쪽">` · `<pre aria-label="오른쪽">` 로도 남긴다 —
// 머지 뷰의 DOM 이 가상 스크롤이라 화면 밖 줄이 렌더되지 않기 때문이며 그
// 자체는 옳은 배려다. 그런데 그 `<pre>` 때문에 **`@codemirror/merge` 를
// 세우는 코드를 통째로 지워도 jsdom 시험은 초록이다** — 「양쪽이 보인다」가
// `<pre>` 만으로 참이 되기 때문이다. 실제로 그 화면이 서는지는 여기서만
// 갈린다.
//
// 그래서 이 검사는 `<pre>` 를 보지 않고 `.cm-mergeView` **자신**을 본다 —
// 실재하는가, 기하가 있는가, 두 편집기에 각각의 본문이 들어갔는가, 그리고
// **차이가 실제로 표시되는가**(`.cm-changedLine`). 마지막 것이 「나란히
// 대조한다」의 실체이고 `<pre>` 로는 어떤 경우에도 나오지 않는다.
//
// 기준 6 의 문면은 「**두 세션이** 같은 문서를 편집·저장하면」이다. 지금까지의
// 시험은 충돌 응답을 값으로 주입해 왔다 — 그 주입은 서버가 정말 그 상황에서
// 충돌을 내는지 묻지 않는다. 여기서는 브라우저 탭 둘이 실제로 같은 문서를
// 열고 차례로 저장한다.
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/merge-view-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  openInEditor,
} from './_web-harness.mjs';

/** 자동 저장 디바운스보다 넉넉히. 저장이 **끝난 뒤**를 재야 한다. */
const 저장대기 = 8_000;

/**
 * 머지 뷰의 실체를 읽는다.
 *
 * **`<pre>` 를 세지 않는다.** 원문 사본은 접근성용이고 이 검사가 묻는 것은
 * 그 사본이 아니라 화면이다.
 */
const 머지뷰읽기 = () => {
  // 없을 때도 **같은 모양**으로 돌려준다 — 필드를 비우면 실패 메시지가
  // `undefined개` 로 나와, 재지 못한 것인지 0 인지 읽는 쪽이 갈리지 않는다.
  const 없음 = { 있다: false, 너비: 0, 높이: 0, 편집기수: 0, 편집기: [], 바뀐줄: 0, 지워진덩이: 0 };
  const root = document.querySelector('.cm-mergeView');
  if (root === null) return 없음;

  const box = root.getBoundingClientRect();
  const 편집기 = [...root.querySelectorAll('.cm-mergeViewEditor')].map(
    (el) => el.querySelector('.cm-content')?.textContent ?? '',
  );

  return {
    있다: true,
    너비: Math.round(box.width),
    높이: Math.round(box.height),
    편집기수: 편집기.length,
    편집기,
    바뀐줄: root.querySelectorAll('.cm-changedLine').length,
    지워진덩이: root.querySelectorAll('.cm-deletedChunk').length,
  };
};

/** 서버가 지금 들고 있는 본문. 화면에만 있고 저장 안 된 것을 가른다. */
const 서버본문 = (page, id) =>
  page.evaluate(
    async (nodeId) => (await (await fetch(`/api/documents/${nodeId}`)).json()).body ?? '',
    id,
  );

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);

  // 두 기준에 **문서를 따로 준다.** 충돌 상태의 화면과 버전 비교 화면이 같은
  // 탭에 겹치면 `.cm-mergeView` 가 어느 쪽 것인지 갈리지 않는다.
  const 충돌문서 = await makeDocument(page, '# 충돌 시험\n\n처음 줄\n', 'merge-conflict');
  const 버전문서 = await makeDocument(page, '# 버전 시험\n\n처음 판\n', 'merge-version');

  // 두 번째 세션. **로그인 상태를 복사해** 연다 — 로그인은 15분에 10회로
  // 제한되고, 검사 하나가 그것을 두 번 쓰면 나머지 검사가 창을 다 쓴다.
  // (`browser.newPage()` 가 만든 암묵 컨텍스트에는 페이지를 더 열 수 없어서
  // 별도 컨텍스트가 필요하다 — Playwright 가 그렇게 막는다.)
  const 둘째맥락 = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 1280, height: 900 },
      storageState: await page.context().storageState(),
    });
  const 둘째 = await 둘째맥락.newPage();

  try {
    await openInEditor(page, 충돌문서.id, 충돌문서.name);
    await openInEditor(둘째, 충돌문서.id, 충돌문서.name);

    beginMeasuring();

    // ── 기준 6 ── 두 세션이 같은 문서를 편집·저장한다.
    //
    // 먼저 첫째 탭이 저장한다. 이 저장이 서버의 해시를 바꾸므로 둘째 탭이
    // 들고 있던 baseHash 는 그 순간 낡은 것이 된다.
    await page.locator('.cm-content').click();
    await page.keyboard.type('첫째가 고침');

    const 첫째저장 = await waitUntil(
      () => 서버본문(page, 충돌문서.id),
      (body) => body.includes('첫째가 고침'),
      { timeout: 저장대기 },
    );
    if (!첫째저장.includes('첫째가 고침')) {
      note('(첫째 탭의 저장이 서버에 닿지 않았다 — 아래 충돌 판정이 서지 않는다)');
    }

    // 이제 둘째 탭이 자기 판본 위에서 편집한다. 서버는 그 사이 바뀌었다.
    await 둘째.locator('.cm-content').click();
    await 둘째.keyboard.type('둘째가 고침');

    const 충돌화면 = await waitUntil(
      () => 둘째.evaluate(() => document.body.textContent ?? ''),
      (text) => /병합이 필요/.test(text),
      { timeout: 저장대기 },
    );
    check(
      '기준 6 두 세션이 같은 문서를 저장하면 뒤엣것이 충돌한다',
      /병합이 필요/.test(충돌화면),
      /병합이 필요/.test(충돌화면)
        ? '둘째 탭에 병합 안내가 떴다'
        : '충돌이 나지 않았다 — 아래 판정들이 모두 이 자리에 매여 있다',
    );

    // 머지 뷰가 **실제로 선다.** 여기부터가 jsdom 이 재지 못하던 자리다.
    const 병합 = await waitUntil(
      () => 둘째.evaluate(머지뷰읽기),
      (v) => v.있다 && v.편집기수 >= 2 && v.높이 > 0,
      { timeout: 저장대기 },
    );
    check(
      '기준 6 병합 화면에 머지 뷰가 실제로 서고 기하를 갖는다',
      병합.있다 && 병합.너비 > 0 && 병합.높이 > 0,
      병합.있다
        ? `.cm-mergeView ${병합.너비}×${병합.높이}px · 편집기 ${병합.편집기수}개`
        : '.cm-mergeView 가 없다 — <pre> 사본만 있고 화면은 서지 않았다',
    );

    // 양쪽 본문이 **각각의 편집기 안**에 들어갔다. 한쪽에 둘 다 있거나
    // 한쪽이 비어 있으면 대조가 성립하지 않는다.
    const 왼쪽 = 병합.편집기?.[0] ?? '';
    const 오른쪽 = 병합.편집기?.[1] ?? '';
    check(
      '기준 6 서버 판본과 내 판본이 각각의 편집기에 들어간다',
      왼쪽.includes('첫째가 고침') && 오른쪽.includes('둘째가 고침'),
      `왼쪽 ${왼쪽.length}자(첫째 ${왼쪽.includes('첫째가 고침')}) · ` +
        `오른쪽 ${오른쪽.length}자(둘째 ${오른쪽.includes('둘째가 고침')})`,
    );

    // **차이가 표시된다.** 이것이 「나란히 대조한다」의 실체다 — 두 본문을
    // 그냥 나란히 두는 것과 다른 자리를 짚어 주는 것은 다르고, `<pre>` 두
    // 개로는 앞의 것까지만 된다.
    check(
      '기준 6 다른 자리가 머지 뷰에 표시된다',
      병합.바뀐줄 + 병합.지워진덩이 > 0,
      `바뀐 줄 ${병합.바뀐줄}개 · 지워진 덩이 ${병합.지워진덩이}개`,
    );

    // 해소가 **저장까지** 간다. 대조만 되고 해소가 안 되면 자동 저장이
    // 영영 멈춘 채로 남는다 (`FR-EDITOR-008` AC-4).
    //
    // **버튼이 없으면 그 자리에서 실패로 적고 넘어간다.** 곧장 누르면 병합
    // 화면이 서지 않은 회차에서 클릭이 시간 초과로 터지고, 그러면 뒤따르는
    // 기준 12 판정을 **아예 재지 못한 채** 검사가 끝난다 — 한 기준의 회귀가
    // 다른 기준의 측정을 데리고 가서는 안 된다.
    const 해소버튼 = 둘째.getByRole('button', { name: '이 내용으로 저장' });
    const 해소가능 = (await 해소버튼.count()) > 0;
    if (해소가능) await 해소버튼.first().click();

    const 해소후 = 해소가능
      ? await waitUntil(
          () => 서버본문(둘째, 충돌문서.id),
          (body) => body.includes('둘째가 고침'),
          { timeout: 저장대기 },
        )
      : '';
    check(
      '기준 6 병합 화면에서 고른 내용이 저장까지 간다',
      해소가능 && 해소후.includes('둘째가 고침'),
      해소가능
        ? `서버 본문 ${해소후.length}자 · 둘째의 편집 ${해소후.includes('둘째가 고침')}`
        : '병합 화면이 서지 않아 해소 버튼도 없다',
    );

    // ── 기준 12 ── 버전 비교도 같은 부품이다.
    //
    // 비교할 판본이 있으려면 저장이 한 번 더 있어야 한다 — 스냅샷은 저장
    // **이전** 본문을 남기므로, 문서를 만들며 한 PUT 만으로는 비교의 양쪽이
    // 같은 내용이 되어 차이가 0 이 된다.
    await openInEditor(page, 버전문서.id, 버전문서.name);
    await page.locator('.cm-content').click();
    await page.keyboard.type('다음 판으로 고침');
    await waitUntil(
      () => 서버본문(page, 버전문서.id),
      (body) => body.includes('다음 판으로 고침'),
      { timeout: 저장대기 },
    );

    await page.getByRole('button', { name: `${버전문서.name} 문서 메뉴` }).first().click();
    await page.getByRole('menuitem', { name: '버전 기록' }).first().click();

    const 비교버튼 = page.getByRole('button', { name: /판 비교$/ });
    const 판수 = await waitUntil(
      () => 비교버튼.count(),
      (n) => n > 0,
      { timeout: 저장대기 },
    );
    if (판수 === 0) {
      note('(보관된 버전이 없어 비교를 열지 못했다 — 아래 판정이 이 자리에 매여 있다)');
    } else {
      await 비교버튼.first().click();
    }

    const 비교 = await waitUntil(
      () => page.evaluate(머지뷰읽기),
      (v) => v.있다 && v.편집기수 >= 2 && v.높이 > 0,
      { timeout: 저장대기 },
    );
    check(
      '기준 12 버전 비교도 같은 머지 뷰로 실제로 선다',
      비교.있다 && 비교.너비 > 0 && 비교.높이 > 0 && 비교.편집기수 >= 2,
      비교.있다
        ? `.cm-mergeView ${비교.너비}×${비교.높이}px · 편집기 ${비교.편집기수}개 · 판 ${판수}개`
        : `.cm-mergeView 가 없다 (판 ${판수}개)`,
    );
    check(
      '기준 12 버전 비교에서도 다른 자리가 표시된다',
      비교.바뀐줄 + 비교.지워진덩이 > 0,
      `바뀐 줄 ${비교.바뀐줄}개 · 지워진 덩이 ${비교.지워진덩이}개`,
    );

    note('(두 기준은 `MergeView` 한 부품을 쓴다 — 이 검사 하나가 둘의 브라우저 잔여를 닫는다)');
  } finally {
    await removeDocument(page, 충돌문서.id);
    await removeDocument(page, 버전문서.id);
    await 둘째맥락.close();
  }
});
