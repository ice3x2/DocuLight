// 진짜 입력 제스처가 핸들러까지 닿는지 확인한다
// (원장 §4 **수용 기준 8**의 드래그·붙여넣기 · **수용 기준 3**의 `[[` 자동완성).
//
// 두 기준의 브라우저 잔여가 같은 부류다 — **jsdom 시험은 이벤트를 합성해 넣는다.**
// `DataTransfer` 도 `ClipboardEvent` 도 값으로 지어 만들고, 자동완성 팝오버는
// 포털과 포커스에 걸려 판정이 실제와 갈릴 수 있다. 여기서는 브라우저가 실제로
// 만드는 이벤트와 실제로 그리는 팝오버를 본다.
//
// **셋을 한 검사에 묶는다.** 로그인은 15분 창에 10회로 제한되고 web 검사가 이미
// 그 창의 대부분을 쓴다 — 축마다 검사를 나누면 한 창에 전체를 돌리지 못한다.
// 세 판정 모두 「편집 화면의 입력이 서버까지 닿는가」라는 한 축의 다른 통로다.
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/input-gestures-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  openInEditor,
  WEB_URL,
} from './_web-harness.mjs';

/** 1×1 투명 PNG. 실제 이미지여야 서버가 받는다. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 그 파일 하나를 담은 `DataTransfer` 를 브라우저 안에서 만든다. */
const 파일담긴전송 = (base64, name, type) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type }));
  return dt;
};

await runBrowserChecks(async ({ page, check, note }) => {
  await login(page);

  const 문서 = await makeDocument(page, '# 제스처 시험\n\n여기에 붙인다\n', 'gesture');
  // 자동완성 판정은 **깨끗한 문서**에서 한다 — 붙여넣기가 본문을 바꾸면 그
  // 변경의 자동 저장이 뒤이어 돌고, 그 사이에 친 글자가 밀린다.
  const 링크문서 = await makeDocument(page, '# 링크 시험\n\n여기에 링크를 건다\n', 'gesture-link');
  // **떨구는 자리는 디렉토리여야 한다** — 파일 아래에는 아무것도 설 수 없고
  // `acceptedDrop` 이 그것을 `not-a-directory` 로 거절한다.
  const 담을곳 = await page.evaluate(async () => {
    const tree = await (await fetch('/api/tree')).json();
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: tree[0].workspace.id,
        parentId: null,
        kind: 'directory',
        name: `gesture-담을곳-${Date.now()}`,
      }),
    });
    return await res.json();
  });

  try {
    // ── 기준 8 — 트리에 실제로 떨군다 ────────────────────────────────
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });

    // 업로드가 나갔는지는 **네트워크로** 본다. 화면 변화로 재면 업로드가
    // 실패해도 트리가 그대로여서 「안 나갔다」와 「나갔는데 거절됐다」가
    // 갈리지 않는다.
    const 업로드요청 = [];
    page.on('request', (req) => {
      // 트리 드롭은 `POST /api/nodes/:id/uploads`, 편집기 붙여넣기는
      // `POST /api/documents/:id/attachments` 로 간다 — 두 경로가 다르다.
      if (
        req.method() === 'POST' &&
        /\/api\/(nodes\/[^/]+\/uploads|documents\/[^/]+\/attachments)/.test(req.url())
      ) {
        업로드요청.push(req.url());
      }
    });

    const 떨군곳 = page.getByRole('treeitem', { name: new RegExp(담을곳.name) }).first();
    await 떨군곳.waitFor({ timeout: 15_000 });
    await 떨군곳.evaluate(
      (el, [base64, 만들기]) => {
        // eslint-disable-next-line no-new-func
        const 전송 = new Function(`return (${만들기})`)()(base64, '떨군그림.png', 'image/png');
        el.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: 전송 }));
        el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: 전송 }));
      },
      [PNG_BASE64, 파일담긴전송.toString()],
    );

    const 드롭수 = await waitUntil(
      () => 업로드요청.length,
      (n) => n > 0,
      { timeout: 10_000 },
    );
    check(
      '기준 8 트리에 실제로 떨군 파일이 업로드로 나간다',
      드롭수 > 0,
      드롭수 > 0 ? `업로드 요청 ${드롭수}건` : '드롭이 업로드까지 닿지 않았다',
    );

    // ── 기준 8 — 편집기에 실제로 붙여넣는다 ──────────────────────────
    await openInEditor(page, 문서.id, 문서.name);
    업로드요청.length = 0;

    await page.locator('.cm-content').first().click();
    await page.locator('.cm-content').first().evaluate(
      (el, [base64, 만들기]) => {
        // eslint-disable-next-line no-new-func
        const 전송 = new Function(`return (${만들기})`)()(base64, '붙인그림.png', 'image/png');
        // **`ClipboardEvent` 를 직접 만든다.** Playwright 의 `dispatchEvent` 는
        // 그 종류를 모르고 일반 `Event` 로 만들어 `clipboardData` 를 버린다.
        el.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: 전송 }),
        );
      },
      [PNG_BASE64, 파일담긴전송.toString()],
    );

    const 붙여넣기수 = await waitUntil(
      () => 업로드요청.length,
      (n) => n > 0,
      { timeout: 10_000 },
    );
    check(
      '기준 8 편집기에 실제로 붙여넣은 그림이 업로드로 나간다',
      붙여넣기수 > 0,
      붙여넣기수 > 0 ? `업로드 요청 ${붙여넣기수}건` : '붙여넣기가 업로드까지 닿지 않았다',
    );

    // ── 기준 3 — `[[` 자동완성 팝오버 ───────────────────────────────
    // **문서를 새로 연다.** 앞 판정이 본문에 이미지 링크를 넣었고 그 변경의
    // 자동 저장이 아직 돌고 있어, 같은 화면에서 이어 치면 저장이 끼어드는
    // 순간 커서가 밀려 친 글자가 흩어진다. 두 축에 문서를 따로 주는 것은
    // 머지 뷰 검사가 같은 이유로 쓰는 방식이다.
    await openInEditor(page, 링크문서.id, 링크문서.name);
    await page.locator('.cm-content').first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    // **괄호는 넣고 질의는 친다.** `[` 를 키로 치면 편집기가 `]` 를 자동으로
    // 닫는데, 그 자동 닫기와 다음 `[` 가 겹쳐 `[[` 대신 `[` 하나만 남는 경우가
    // 있다 — 그러면 `matchBefore` 가 매치하지 않아 후보 API 가 200 에 1건을
    // 돌려주는데도 팝오버가 서지 않는다. 닫는 괄호까지 넣고 그 사이로 커서를
    // 옮기면 사용자가 `[[` 를 쳤을 때 편집기가 만들어 주는 상태와 같아진다.
    //
    // 질의는 **실제로 친다** — 자동완성 트리거는 타이핑에서 나므로, 여기까지
    // 삽입으로 넣으면 「치면 뜨는가」가 재어지지 않는다.
    await page.keyboard.insertText('[[]]');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('gesture', { delay: 40 });

    // **친 글자가 실제로 들어갔는지 먼저 본다.** 포커스가 편집기 밖에 있으면
    // 타이핑이 아무 데도 닿지 않고, 그때 팝오버가 안 서는 것은 자동완성의
    // 결함이 아니라 이 검사가 글자를 못 넣은 것이다. 둘을 갈라 두지 않으면
    // 실패 메시지가 엉뚱한 곳을 가리킨다.
    const 친글자 = await waitUntil(
      () => page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? ''),
      (t) => t.includes('[[gesture'),
      { timeout: 8_000 },
    );
    if (!친글자.includes('[[gesture')) {
      check(
        '기준 3 `[[` 를 실제로 치면 후보 팝오버가 뜬다',
        false,
        `친 글자가 본문에 들어가지 않았다 — 편집기에 포커스가 없다 (본문 끝: ${친글자.slice(-30)})`,
      );
      return;
    }

    const 팝오버 = await waitUntil(
      () =>
        page.evaluate(() => {
          const el = document.querySelector('.cm-tooltip-autocomplete');
          if (el === null) return { 있다: false, 후보: 0 };
          return { 있다: true, 후보: el.querySelectorAll('li').length };
        }),
      // 팝오버는 디바운스(120ms)와 서버 왕복 뒤에 선다 — 짧게 기다리면
      // 「안 뜬다」와 「아직 안 왔다」가 갈리지 않는다.
      (v) => v.있다 && v.후보 > 0,
      { timeout: 20_000 },
    );
    // 서지 않았으면 **왜인지**를 함께 남긴다 — 후보가 0건인 것과 팝오버가
    // 그려지지 않은 것은 다른 결함이고, 메시지가 그것을 가르지 않으면 다음
    // 사람이 엉뚱한 곳을 고친다.
    const 왜 = 팝오버.있다
      ? ''
      : await page.evaluate(async () => {
          const res = await fetch('/api/wiki-targets?q=gesture');
          const body = res.ok ? await res.json() : null;
          const 수 = Array.isArray(body) ? body.length : (body?.targets?.length ?? -1);
          return ` (후보 API ${res.status} · ${수}건 · 본문 끝 「${(
            document.querySelector('.cm-content')?.textContent ?? ''
          ).slice(-24)}」)`;
        });
    check(
      '기준 3 `[[` 를 실제로 치면 후보 팝오버가 뜬다',
      팝오버.있다 && 팝오버.후보 > 0,
      팝오버.있다 ? `후보 ${팝오버.후보}개` : `팝오버가 서지 않았다${왜}`,
    );

    if (팝오버.있다 && 팝오버.후보 > 0) {
      // 키보드로 고른다 — 마우스로 고르면 「키보드로 고를 수 있는가」가 재어지지
      // 않고, 그것이 기준 문면의 절반이다.
      await page.keyboard.press('Enter');
      // **원문이 아니라 링크가 섰는지를 본다.** 고른 뒤 커서가 링크 밖으로
      // 나가면 라이브 프리뷰가 그것을 위젯으로 접어 `[[` 가 화면에서
      // 사라진다 — 원문만 찾으면 성공한 경우에 실패한다.
      const 섬 = await waitUntil(
        () =>
          page.evaluate(() => {
            const 위젯 = document.querySelector('.cm-atomic-wiki-link');
            const 글 = document.querySelector('.cm-content')?.textContent ?? '';
            return { 위젯: 위젯?.textContent ?? null, 원문: /\[\[[^\]\n]+\]\]/.test(글) };
          }),
        (v) => v.위젯 !== null || v.원문,
        { timeout: 8_000 },
      );
      check(
        '기준 3 키보드로 고른 후보가 본문에 링크로 들어간다',
        섬.위젯 !== null || 섬.원문,
        섬.위젯 !== null
          ? `링크 위젯이 섰다 — ${섬.위젯}`
          : 섬.원문
            ? '본문에 링크 원문이 닫혔다'
            : '고른 뒤에도 링크가 서지 않았다',
      );
    }

    note('(세 축을 한 검사에 묶은 이유는 로그인 제한이다 — 축마다 나누면 한 창에 전체를 돌리지 못한다)');
  } finally {
    await removeDocument(page, 문서.id);
    await removeDocument(page, 링크문서.id);
    if (담을곳?.id !== undefined) await removeDocument(page, 담을곳.id);
  }
});
