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
/** useAutosave 의 2초 debounce 경계를 실제로 지나 중복 PUT 유무를 센다. */
const 저장경계 = 2_300;

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);
  const doc = await makeDocument(page, '# IME 시험\n\n');
  let 저장요청수 = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/documents/${doc.id}`) 저장요청수 += 1;
  });

  try {
    await openInEditor(page, doc.id, doc.name);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');

    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      window.__issue57CompositionEvents = [];
      for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) {
        document.addEventListener(type, (event) => window.__issue57CompositionEvents.push({ type, data: event.data ?? null, inputType: event.inputType ?? null, trusted: event.isTrusted }), true);
      }
      window.__issue57OuterSubmits = 0;
      document.addEventListener('submit', (event) => { window.__issue57OuterSubmits += 1; event.preventDefault(); }, true);
    });

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

    const 이벤트초기화 = () => page.evaluate(() => { window.__issue57CompositionEvents = []; });
    const 이벤트 = () => page.evaluate(() => window.__issue57CompositionEvents ?? []);
    const 이벤트순서 = async () => {
      const observed = await 이벤트();
      const names = observed.map((event) => event.type);
      return {
        observed,
        valid: names.indexOf('compositionstart') >= 0 && names.indexOf('compositionupdate') > names.indexOf('compositionstart') && names.indexOf('compositionend') > names.indexOf('compositionupdate'),
      };
    };
    const cmCaret = () => page.evaluate(() => {
      const content = document.querySelector('.cm-content');
      const selection = getSelection();
      if (!content || !selection?.anchorNode || !content.contains(selection.anchorNode)) return -1;
      const range = document.createRange(); range.selectNodeContents(content); range.setEnd(selection.anchorNode, selection.anchorOffset); return range.toString().length;
    });

    const 본문 = () =>
      page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
    const 서버본문 = () =>
      page.evaluate(async (id) => (await (await fetch(`/api/documents/${id}`)).json()).body ?? '', doc.id);

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

    const initialEvents = await 이벤트순서();
    check('Playwright/CDP live 조합이 start→update→end 순서로 관측된다', initialEvents.valid, JSON.stringify(initialEvents.observed));

    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End');
    const liveBeforeTheme = await 본문(); const liveCaretBeforeTheme = await cmCaret(); await 이벤트초기화();
    await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '계', selectionStart: 1, selectionEnd: 1 });
    await page.evaluate(() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; });
    await cdp.send('Input.insertText', { text: '계' });
    const liveAfterTheme = await 본문(); const liveCaretAfterTheme = await cmCaret();
    check('live 조합 commit과 caret가 theme 변경 뒤 정확하다', liveAfterTheme === `${liveBeforeTheme}계` && liveCaretAfterTheme === liveCaretBeforeTheme + 1, `caret ${liveCaretBeforeTheme}/${liveCaretAfterTheme}`);
    check('live theme 조합 event ordering이 유지된다', (await 이벤트순서()).valid, JSON.stringify(await 이벤트()));
    await waitUntil(서버본문, (body) => body === liveAfterTheme, { timeout: 10_000 });

    const liveBeforeCancel = await 본문(); const liveCaretBeforeCancel = await cmCaret(); const liveCancelSaveBefore = 저장요청수; await 이벤트초기화();
    await cdp.send('Input.imeSetComposition', { text: '취', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await page.waitForTimeout(저장경계);
    check('live 조합 취소가 본문/caret를 보존하고 저장하지 않는다', await 본문() === liveBeforeCancel && await cmCaret() === liveCaretBeforeCancel && 저장요청수 - liveCancelSaveBefore === 0, `caret ${liveCaretBeforeCancel}/${await cmCaret()} · save PUT delta=${저장요청수 - liveCancelSaveBefore}`);

    const liveBeforeEnter = await 본문(); const liveCaretBeforeEnter = await cmCaret(); const liveEnterSaveBefore = 저장요청수; await 이벤트초기화();
    await cdp.send('Input.imeSetComposition', { text: '입', selectionStart: 1, selectionEnd: 1 });
    await page.keyboard.press('Enter');
    await cdp.send('Input.insertText', { text: '입' });
    const liveEnterEvents = await 이벤트();
    await waitUntil(서버본문, (body) => body === `${liveBeforeEnter}입`, { timeout: 10_000 });
    check('live 조합 중 Enter가 exact text/caret, submit 0, save PUT 1을 만든다', await 본문() === `${liveBeforeEnter}입` && await cmCaret() === liveCaretBeforeEnter + 1 && liveEnterEvents.filter((event) => event.type === 'compositionend').length === 1 && await page.evaluate(() => window.__issue57OuterSubmits) === 0 && 저장요청수 - liveEnterSaveBefore === 1, `delta=${JSON.stringify((await 본문()).slice(liveBeforeEnter.length))} · caret ${liveCaretBeforeEnter}/${await cmCaret()} · save PUT delta=${저장요청수 - liveEnterSaveBefore} · ${JSON.stringify(liveEnterEvents)}`);

    await page.getByRole('button', { name: '소스' }).click();
    const source = page.getByRole('textbox', { name: '원문' });
    await source.click(); await source.press('Control+End');
    const sourceBefore = await source.inputValue(); const sourceCaretBefore = await source.evaluate((element) => element.selectionStart); await 이벤트초기화();
    await 조합(['ㅅ', '소', '솟'], '소스');
    const sourceAfter = await source.inputValue(); const sourceCaretAfter = await source.evaluate((element) => element.selectionStart);
    check('source 조합 commit의 exact text/caret가 맞다', sourceAfter === `${sourceBefore}소스` && sourceCaretAfter === sourceCaretBefore + 2, `caret ${sourceCaretBefore}/${sourceCaretAfter}`);
    check('source 조합이 start→update→end 순서로 관측된다', (await 이벤트순서()).valid, JSON.stringify(await 이벤트()));
    await waitUntil(서버본문, (body) => body === sourceAfter, { timeout: 10_000 });

    const sourceBeforeCancel = await source.inputValue(); const sourceCaretBeforeCancel = await source.evaluate((element) => element.selectionStart); const sourceCancelSaveBefore = 저장요청수; await 이벤트초기화();
    await cdp.send('Input.imeSetComposition', { text: '취소', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await page.waitForTimeout(저장경계);
    check('source 조합 cancel이 exact bytes/caret를 보존하고 저장하지 않는다', await source.inputValue() === sourceBeforeCancel && await source.evaluate((element) => element.selectionStart) === sourceCaretBeforeCancel && 저장요청수 - sourceCancelSaveBefore === 0, `caret ${sourceCaretBeforeCancel}/${await source.evaluate((element) => element.selectionStart)} · save PUT delta=${저장요청수 - sourceCancelSaveBefore}`);

    const sourceBeforeEnter = await source.inputValue(); const sourceCaretBeforeEnter = await source.evaluate((element) => element.selectionStart); const sourceEnterSaveBefore = 저장요청수; await 이벤트초기화();
    await cdp.send('Input.imeSetComposition', { text: '입', selectionStart: 1, selectionEnd: 1 });
    await page.keyboard.press('Enter');
    await cdp.send('Input.insertText', { text: '입' });
    const sourceAfterEnter = await source.inputValue();
    const outerSubmit = await page.locator('body').getAttribute('data-accepted');
    const sourceEnterEvents = await 이벤트();
    await waitUntil(서버본문, (body) => body === sourceAfterEnter, { timeout: 10_000 });
    check('source 조합 중 Enter가 exact text/caret, submit 0, save PUT 1을 만든다', sourceAfterEnter === `${sourceBeforeEnter}입\n` && await source.evaluate((element) => element.selectionStart) === sourceCaretBeforeEnter + 1 && outerSubmit === null && await page.evaluate(() => window.__issue57OuterSubmits) === 0 && sourceEnterEvents.filter((event) => event.type === 'compositionend').length === 1 && 저장요청수 - sourceEnterSaveBefore === 1, `delta=${JSON.stringify(sourceAfterEnter.slice(sourceBeforeEnter.length))} · caret ${sourceCaretBeforeEnter}/${await source.evaluate((element) => element.selectionStart)} · save PUT delta=${저장요청수 - sourceEnterSaveBefore} · ${JSON.stringify(sourceEnterEvents)}`);

    // 조합한 글자가 **저장까지** 가는지 본다. 화면에만 서고 디스크에 다른
    // 것이 들어가면 사용자는 다시 열었을 때 그것을 알게 된다.
    const 저장된본문 = await waitUntil(
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
      저장된본문.includes('한글입력') && !/[ㄱ-ㅎㅏ-ㅣ]/.test(저장된본문),
      `서버 본문 길이 ${저장된본문.length}`,
    );

    note('(이 증거는 격리된 Playwright-owned Chromium의 CDP `Input.imeSetComposition`/`Input.insertText`로 생성한 synthetic/CDP 조합이며, native OS IME 증거가 아니고 IR-EDITOR-002 AC5를 승격하지 않는다)');
  } finally {
    await removeDocument(page, doc.id);
  }
});
