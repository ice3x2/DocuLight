// 실제 브라우저에서 한글 IME 조합이 편집 중 깨지지 않는지 확인한다.
//
// 원장 §4 **수용 기준 7** 이 이 축을 요구하고 `CON-ARCH-006` 이 그 원인 쪽을
// 소유한다 — 본문을 controlled `value` 로 묶으면 매 입력마다 React 렌더가
// 개입해 조합 중 DOM 이 교체되고, 그러면 조합이 끊긴다.
//
// **이 판정은 브라우저가 아니면 성립하지 않는다.** 조합은 OS 의 입력기가
// 만드는 상태이고 happy-dom 에는 그 상태가 없다. 여기서는 CDP 의
// `Input.imeSetComposition` 으로 그 단계를 그대로 재현한다 — 낱자 → 조합
// 중간 → 완성으로 이어지는 단계마다 편집기가 무엇을 하는지가 이 축이다.
//
// 2026-08-24 수동 검증이 같은 방법으로 한 번 쟀고 통과했다
// (`docs/analysis/2026-08-25.browser-manual-verification/`). 그 회차는 실제
// 옵시디언 볼트를 써서 그 기계에서만 재현됐다 — 여기서는 검사가 자기 문서를
// 만들어 아무 기계에서나 돌게 한다.
//
// 사용: DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/ime-composition-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  openInEditor,
} from './_web-harness.mjs';

/** 조합 단계 사이의 간격. 입력기가 실제로 내는 속도에 맞춘다. */
const 조합간격 = 150;

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);
  const doc = await makeDocument(page, '# IME 시험\n\n');

  try {
    await openInEditor(page, doc.id, doc.name);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');

    const cdp = await page.context().newCDPSession(page);

    /**
     * 한 글자를 조합해 확정한다.
     *
     * `단계들` 은 입력기가 보여 주는 중간 상태이고 `확정` 은 그것이 굳은
     * 결과다. 중간 상태를 건너뛰고 완성만 넣으면 이 축이 재어지지 않는다 —
     * 깨지는 자리가 바로 그 중간이다.
     */
    const 조합 = async (단계들, 확정) => {
      for (const 단계 of 단계들) {
        await cdp.send('Input.imeSetComposition', {
          text: 단계,
          selectionStart: 단계.length,
          selectionEnd: 단계.length,
        });
        await page.waitForTimeout(조합간격);
      }
      await cdp.send('Input.insertText', { text: 확정 });
      await page.waitForTimeout(조합간격);
    };

    const 본문 = () =>
      page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');

    beginMeasuring();

    await page.keyboard.type('\n');
    await 조합(['ㅎ', '하', '한'], '한');
    await 조합(['ㄱ', '그', '글'], '글');
    await 조합(['ㅇ', '이', '입'], '입');
    await 조합(['ㄹ', '려', '력'], '력');

    const 친뒤 = await waitUntil(본문, (t) => t.includes('한글입력'), { timeout: 5_000 });

    // **한 번만 나와야 한다.** 조합이 끊기면 중간 상태가 확정 글자와 함께
    // 남아 「한한글글…」 같은 중복이 생긴다.
    const 횟수 = (친뒤.match(/한글입력/g) ?? []).length;
    check(
      '수용 기준 7 조합한 글자가 정확히 한 번 들어간다',
      횟수 === 1,
      `「한글입력」 ${횟수}회`,
    );

    // **낱자모가 남으면 안 된다.** 조합이 확정되지 못하고 끊긴 자리에
    // `ㅎ`·`ㅏ` 같은 낱자가 그대로 남는다.
    const 자모잔여 = /[ㄱ-ㅎㅏ-ㅣ]/.test(친뒤);
    check(
      '수용 기준 7 조합 중간의 낱자모가 남지 않는다',
      !자모잔여,
      자모잔여 ? `남은 글자: ${(친뒤.match(/[ㄱ-ㅎㅏ-ㅣ]/g) ?? []).join('')}` : '없음',
    );

    // 조합한 글자가 **저장까지** 가는지 본다. 화면에만 서고 디스크에 다른
    // 것이 들어가면 사용자는 다시 열었을 때 그것을 알게 된다.
    const 서버본문 = await waitUntil(
      () =>
        page.evaluate(
          async (id) => (await (await fetch(`/api/documents/${id}`)).json()).body ?? '',
          doc.id,
        ),
      (body) => body.includes('한글입력'),
      { timeout: 10_000 },
    );
    check(
      '수용 기준 7 조합한 글자가 저장까지 간다',
      서버본문.includes('한글입력') && !/[ㄱ-ㅎㅏ-ㅣ]/.test(서버본문),
      `서버 본문 길이 ${서버본문.length}`,
    );

    note('(조합은 CDP `Input.imeSetComposition` 으로 재현했다 — OS 입력기 없이 그 단계를 그대로 낸다)');
  } finally {
    await removeDocument(page, doc.id);
  }
});
