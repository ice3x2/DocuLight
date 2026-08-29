// 실제 브라우저에서 저장이 편집을 끊지 않는지 확인한다 (`FR-EDITOR-009`).
//
// AC-1 의 절반 — 저장이 편집기 **인스턴스**를 갈아 끼우지 않는다 — 는
// `autosave-wiring.test.tsx` 가 잰다. 여기가 재는 것은 그 계층이 재지 못한
// 나머지다: 저장이 끝난 뒤에도 포커스가 편집기에 남는가(AC-1), 이어 친
// 글자가 문서에 들어가는가(AC-2), 커서가 제자리인가(AC-3).
//
// **happy-dom 이 이 축을 재지 못한다는 것을 실측으로 확인했다.** 그 환경에서
// 저장 직후 `document.activeElement` 가 편집기에서 빠지는데, 그때 `.cm-editor`
// 는 한 개 그대로이고 `.cm-content` 도 같은 요소다. DOM 이 바뀌지 않았는데
// 포커스만 빠지므로 그것이 제품의 결함인지 그 환경의 한계인지 갈리지 않는다.
// 진짜 브라우저가 아니면 답이 나오지 않는 자리다.
//
// 근거가 된 관측은 2026-08-24 실제 볼트 검증이다
// (`docs/analysis/2026-08-25.browser-manual-verification/README.md` §3.2) —
// 자동 저장 3초 뒤 포커스가 빠지고 이어 친 글자가 문서에도 디스크에도
// 들어가지 않았다.
//
// 사용: 아래 셋을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/focus-retention-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  openInEditor,
} from './_web-harness.mjs';

/** 자동 저장 디바운스보다 넉넉히. 저장이 끝난 뒤를 재야 한다. */
const 저장대기 = 8_000;

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);
  const doc = await makeDocument(page, '# 시험 문서\n\n첫 줄\n');

  try {
    await openInEditor(page, doc.id, doc.name);

    // 편집기에 커서를 놓고 글자를 친다 — 여기까지가 준비다.
    await page.locator('.cm-content').click();
    await page.keyboard.type('가나');

    const 침후포커스 = await page.evaluate(() => document.activeElement?.className ?? '');
    if (!침후포커스.includes('cm-content')) {
      note(`(준비 실패: 타이핑 뒤 포커스가 ${침후포커스 || '없음'})`);
    }

    beginMeasuring();

    // 자동 저장이 돌 때까지 기다린다. 저장 상태 표시가 「저장됨」으로
    // 바뀌는 것을 신호로 삼는다 — 고정 대기는 기계 상태에 딸려 흔들린다.
    const 저장됨 = await waitUntil(
      () => page.evaluate(() => document.body.textContent ?? ''),
      (text) => /저장됨|저장 완료/.test(text),
      { timeout: 저장대기 },
    );
    if (!/저장됨|저장 완료/.test(저장됨)) {
      note('(저장 표시를 찾지 못했다 — 아래 판정은 시간이 지난 뒤의 상태다)');
    }

    // AC-1 — 저장이 끝나도 포커스가 편집기에 남는다.
    const 저장후포커스 = await page.evaluate(() => document.activeElement?.className ?? '');
    check(
      'AC-1 저장이 끝난 뒤에도 포커스가 편집기에 남는다',
      저장후포커스.includes('cm-content'),
      `활성 요소: ${저장후포커스 || '없음'}`,
    );

    // AC-2 — 이어 친 글자가 문서에 들어간다. 다시 클릭하지 않는다:
    // 사용자가 다시 눌러야 한다면 그것이 이 요구가 막으려는 상태다.
    await page.keyboard.type('다라');
    const 본문 = await page.evaluate(
      () => document.querySelector('.cm-content')?.textContent ?? '',
    );
    check(
      'AC-2 저장 직후에 이어 친 글자가 문서에 들어간다',
      본문.includes('가나다라'),
      `본문에 보이는 것: ${본문.slice(0, 40)}`,
    );

    // 디스크까지 갔는지는 서버에 되물어 확인한다 — 화면에만 있고 저장되지
    // 않으면 사용자는 그것을 알 길이 없다.
    const 서버본문 = await waitUntil(
      () =>
        page.evaluate(
          async (id) => (await (await fetch(`/api/documents/${id}`)).json()).body ?? '',
          doc.id,
        ),
      (body) => body.includes('가나다라'),
      { timeout: 저장대기 },
    );
    check(
      'AC-2 이어 친 글자가 저장까지 간다',
      서버본문.includes('가나다라'),
      `서버가 들고 있는 본문 길이 ${서버본문.length}`,
    );

    // AC-3 — 저장이 커서를 옮기지 않는다. 방금 친 글자 바로 뒤에 있어야
    // 한다: 커서가 문서 처음이나 끝으로 튀면 이어 쓰기가 엉뚱한 자리에
    // 들어간다.
    const 커서 = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.anchorNode;
      const line = node?.parentElement?.closest('.cm-line');
      return { offset: sel.anchorOffset, line: line?.textContent ?? '' };
    });
    check(
      'AC-3 저장이 커서를 옮기지 않는다',
      커서 !== null && 커서.line.includes('가나다라'),
      커서 === null ? '선택이 없다' : `커서가 있는 줄: ${커서.line.slice(0, 40)}`,
    );
    // AC-4 — 저장이 거절되거나 충돌해도 같다. 충돌을 만들려면 서버 쪽
    // 본문을 밖에서 갈아 끼운다 — 다른 사람이 같은 문서를 고친 상황이다.
    await page.evaluate(async (id) => {
      const read = await (await fetch(`/api/documents/${id}`)).json();
      await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: '# 남이 고침\n', baseHash: read.hash }),
      });
    }, doc.id);

    await page.keyboard.type('마바');
    const 충돌 = await waitUntil(
      () => page.evaluate(() => document.body.textContent ?? ''),
      (text) => /충돌/.test(text),
      { timeout: 저장대기 },
    );
    check(
      'AC-4 충돌해도 포커스가 편집기에 남는다',
      /충돌/.test(충돌) &&
        (await page.evaluate(() => document.activeElement?.className ?? '')).includes('cm-content'),
      /충돌/.test(충돌) ? '충돌 상태에서 포커스 유지' : '충돌이 나지 않아 이 판정이 서지 않았다',
    );
  } finally {
    await removeDocument(page, doc.id);
  }
});
