// 삭제와 복구를 실제 브라우저에서 왕복시킨다 (원장 §4 **수용 기준 11**).
//
// 기준 문면은 「삭제→복구 시 **원위치**·ACL·버전 이력이 보존된다」다. 서버
// 계층은 두껍게 서 있고(`trash.test.ts` 의 원위치·ACL·노드 ID·이름 충돌·부모
// 소실·보존 기간, 그리고 2026-08-30 에 더한 버전 이력 세 항) 판정 자체는 의심할
// 자리가 없다. 재지 않은 것은 **그 왕복을 사람이 화면에서 누를 수 있는가**다.
//
// **그 앞 절반이 2026-08-30 까지 아예 불가능했다.** 트리 컨텍스트 메뉴의 `삭제`
// 가 아무 API 도 부르지 않아 화면에서 문서를 지울 수 없었고, 휴지통은 되돌리기만
// 되고 무엇을 넣을 방법이 없었다. 배선을 잇고 `IR-SHELL-005` 로 세웠다. 이 검사가
// 재는 것은 그 배선 **이후**의 왕복 전체다.
//
// **원위치는 루트가 아니어야 잴 수 있다.** 루트에 두고 복구하면 「원래 자리로
// 돌아왔다」와 「어디로든 돌아왔다」가 갈리지 않는다 — 그래서 디렉토리를 하나
// 만들고 그 안에 문서를 둔다.
//
// **본문까지 본다.** 트리에 이름이 다시 서는 것만으로는 부족하다 — 노드 행만
// 되살리고 실체를 두고 오면 이름은 돌아오는데 열리지 않는 문서가 된다. 이
// 저장소는 그 부류를 이미 겪었다(만들기 라우트가 DB 노드만 세우던 자리).
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/trash-round-trip-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  removeDocument,
  WEB_URL,
} from './_web-harness.mjs';

/** 화면에 그려진 트리 항목의 이름들. */
const 트리이름들 = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

const 트리에있다 = (이름들, 이름) => 이름들.some((one) => one.includes(이름));

await runBrowserChecks(async ({ page, check, note }) => {
  await login(page);

  const 시각 = `${Date.now()}`;
  const 폴더이름 = `trash-집-${시각}`;
  const 문서이름 = `trash-문서-${시각}.md`;
  const 본문 = `# 휴지통 왕복\n\n지워졌다 돌아온다 ${시각}\n`;
  let 준비;

  try {
    준비 = await page.evaluate(
      async ([stampFolder, stampFile, 초기본문]) => {
        const tree = await (await fetch('/api/tree')).json();
        const first = tree[0];
        if (first === undefined) return { error: '볼 수 있는 워크스페이스가 없다' };

        const 만든다 = async (parentId, kind, name) => {
          const res = await fetch('/api/nodes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId: first.workspace.id, parentId, kind, name }),
          });
          return res.ok ? await res.json() : undefined;
        };

        const 폴더 = await 만든다(null, 'directory', stampFolder);
        if (폴더 === undefined) return { error: '디렉토리를 만들지 못했다' };
        const 문서 = await 만든다(폴더.id, 'file', stampFile);
        if (문서 === undefined) return { error: '문서를 만들지 못했다' };

        const read = await (await fetch(`/api/documents/${문서.id}`)).json();
        await fetch(`/api/documents/${문서.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: 초기본문, baseHash: read.hash }),
        });

        return {
          workspaceName: first.workspace.name,
          폴더,
          문서,
          경로: `${first.workspace.name}/${stampFolder}/${stampFile}`,
        };
      },
      [폴더이름, 문서이름, 본문],
    );

    if (준비.error) {
      check('기준 11 왕복을 잴 준비가 된다', false, 준비.error);
      return;
    }

    // ── 삭제 ─────────────────────────────────────────────────────────
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
    const 펼치기 = page.getByRole('button', { name: new RegExp(`${폴더이름}.*펼치기`) });
    if ((await 펼치기.count()) > 0) await 펼치기.first().click();

    const 삭제전 = await page.evaluate(트리이름들);
    check(
      '기준 11 지우기 전에는 그 자리에 서 있다',
      트리에있다(삭제전, 문서이름),
      `트리 항목 ${삭제전.length}개`,
    );

    // **트리에서 실제로 우클릭해 지운다.** API 를 부르면 배선이 끊겨도
    // 통과하고, 그 배선이 바로 어제까지 없던 자리다.
    await page.getByRole('treeitem', { name: new RegExp(문서이름) }).first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: '삭제' }).first().click();

    const 삭제후 = await waitUntil(
      async () => {
        await page.goto(WEB_URL, { waitUntil: 'networkidle' });
        const 펼침 = page.getByRole('button', { name: new RegExp(`${폴더이름}.*펼치기`) });
        if ((await 펼침.count()) > 0) await 펼침.first().click();
        return await page.evaluate(트리이름들);
      },
      (이름들) => !트리에있다(이름들, 문서이름),
      { timeout: 15_000 },
    );
    check(
      '기준 11 트리에서 고른 삭제가 그 문서를 트리에서 치운다',
      !트리에있다(삭제후, 문서이름),
      `트리 항목 ${삭제후.length}개`,
    );

    // ── 휴지통 화면 ──────────────────────────────────────────────────
    await page.getByRole('button', { name: '설정' }).first().click();
    await page.getByRole('tab', { name: '휴지통' }).first().click();

    const 복구버튼 = page.getByRole('button', { name: new RegExp(`${문서이름} 복구`) });
    const 보인다 = await waitUntil(
      () => 복구버튼.count(),
      (n) => n > 0,
      { timeout: 15_000 },
    );
    check(
      '기준 11 지운 문서가 휴지통 화면에 원래 경로와 함께 선다',
      보인다 > 0,
      보인다 > 0
        ? `복구 버튼 ${보인다}개 — 경로 ${준비.경로}`
        : '휴지통 화면에서 그 문서를 찾지 못했다',
    );
    if (보인다 === 0) return;

    // ── 복구 ─────────────────────────────────────────────────────────
    await 복구버튼.first().click();

    const 복구후 = await waitUntil(
      async () => {
        await page.goto(WEB_URL, { waitUntil: 'networkidle' });
        const 펼침 = page.getByRole('button', { name: new RegExp(`${폴더이름}.*펼치기`) });
        if ((await 펼침.count()) > 0) await 펼침.first().click();
        return await page.evaluate(트리이름들);
      },
      (이름들) => 트리에있다(이름들, 문서이름),
      { timeout: 15_000 },
    );
    check(
      '기준 11 복구가 그 문서를 **원래 디렉토리 아래**에 되돌린다',
      트리에있다(복구후, 문서이름) && 트리에있다(복구후, 폴더이름),
      `트리 항목 ${복구후.length}개 · 집 디렉토리 ${트리에있다(복구후, 폴더이름)}`,
    );

    // 이름이 돌아온 것과 문서가 돌아온 것은 다르다 — 노드 행만 되살리고
    // 실체를 두고 오면 열리지 않는 문서가 트리에 선다.
    const 되돌아온본문 = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}`);
      return res.ok ? (await res.json()).body : null;
    }, 준비.문서.id);
    check(
      '기준 11 되돌아온 문서의 본문이 그대로다 — 노드 ID 가 보존된다',
      되돌아온본문 !== null && 되돌아온본문.includes(시각),
      되돌아온본문 === null ? '본문을 읽지 못했다' : `본문 ${되돌아온본문.length}자`,
    );

    // 버전 이력은 `.versions/<노드ID>/` 에 노드 ID 로 놓이므로 왕복을
    // 따라온다. 화면에서 그것이 실제로 보이는지 본다 — 편집 세션당 한 판만
    // 남으므로(`R75-a`) 판이 아직 없을 수 있고, 그때는 이 자리가 무엇에
    // 매여 있는지를 남긴다.
    await page.getByRole('button', { name: 문서이름 }).first().click();
    await page.waitForSelector('[role="region"]', { timeout: 15_000 });
    const 문서메뉴 = page.getByRole('button', { name: `${문서이름} 문서 메뉴` });
    if ((await 문서메뉴.count()) > 0) {
      await 문서메뉴.first().click();
      await page.getByRole('menuitem', { name: '버전 기록' }).first().click();
      const 판수 = await waitUntil(
        () => page.getByRole('button', { name: /판 비교$/ }).count(),
        (n) => n > 0,
        { timeout: 8_000 },
      );
      if (판수 === 0) {
        note('(보관된 판이 없어 버전 축은 재지 못했다 — 편집 세션당 한 판이라 갓 만든 문서에는 아직 없다. 그 축은 `trash.test.ts` 의 `FR-STORAGE-006` 세 항이 잰다)');
      } else {
        check('기준 11 복구한 문서의 버전 기록이 화면에서 열린다', 판수 > 0, `판 ${판수}개`);
      }
    } else {
      note('(문서 메뉴를 찾지 못해 버전 축은 재지 못했다)');
    }
  } finally {
    if (준비 !== undefined && 준비.error === undefined) {
      await removeDocument(page, 준비.문서.id);
      await removeDocument(page, 준비.폴더.id);
    }
  }
});
