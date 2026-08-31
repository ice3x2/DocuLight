// 두 계정의 화면이 실제로 다르게 그려지는지 확인한다 (원장 §4 **수용 기준 4**).
//
// 기준 문면은 「**두 계정으로** R14(상속+가산) · R25(완전 숨김)이 검증된다」다.
// 지금까지의 시험은 요청자를 값으로 바꿔 서비스와 라우트를 불러 왔다 — 그
// 계층은 두껍게 서 있고(`effective-permission.test.ts` 19항 ·
// `visibility.test.ts` 12항 · 탐침에서 201항이 죽었다) **판정 자체는 의심할
// 자리가 없다.** 재지 않은 것은 그 판정이 **두 사람의 브라우저에 실제로 다른
// 트리로 도착하는가**이며, 그것은 서버 응답과 화면 사이에 배선이 이어져
// 있어야만 참이다. 이 저장소는 그 사이가 끊긴 자리를 여섯 번 겪었다.
//
// **그래서 API 응답을 보지 않고 화면의 `role="treeitem"` 을 센다.** `/api/tree`
// 를 부르면 서버 판정을 한 번 더 재는 것일 뿐이고, 그 사이가 끊겨도 통과한다.
//
// **회수까지 한 번에 잰다.** 준 것이 보이는 것과 거둔 것이 사라지는 것은 다른
// 축이고(`R59` 즉시성), 뒤엣것이 없으면 「한 번 보이면 영원히 보이는」 화면도
// 앞의 판정들을 전부 통과한다.
//
// **둘째 계정은 이 검사가 만든다.** 환경변수로 하나 더 받으면 검사를 돌리는
// 사람이 계정을 둘 준비해야 하고, 이름을 코드에 박으면 그것이 자격증명이
// 된다. 이름에 시각을 넣어 앞 회차의 잔여와 부딪히지 않게 한다.
//
// **탐침이 이 검사 안에 들어 있다.** 같은 판정 함수가 부여 전에는 「없다」,
// 부여 뒤에는 「있다」, 회수 뒤에는 다시 「없다」를 돌려주어야 통과한다 —
// 화면이 상태와 무관하게 같은 것을 그리면 셋 중 둘은 반드시 실패한다. 그래서
// 소스를 따로 망가뜨려 재확인하지 않는다. 서버 판정 자체를 겨누는 탐침은
// `effective-permission.ts` 에서 이미 돌렸고 201항이 죽었다.
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/acl-two-account-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  loginAs,
  removeDocument,
  WEB_URL,
} from './_web-harness.mjs';

/** 화면에 그려진 트리 항목의 이름들. API 가 아니라 **화면**을 센다. */
const 트리이름들 = () =>
  [...document.querySelectorAll('[role="treeitem"]')].map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

/** 그 이름이 화면 트리에 있는가. */
const 트리에있다 = (이름들, 이름) => 이름들.some((one) => one.includes(이름));

await runBrowserChecks(async ({ page, check, note }) => {
  await login(page);

  const 시각 = `${Date.now()}`;
  let 준비;
  let 둘째맥락;

  try {
    // 첫째가 세 자리를 만든다. 디렉토리 하나와 그 안의 문서 하나, 그리고
    // 권한을 주지 않을 문서 하나 — 마지막 것이 있어야 「전부 보인다」와
    // 「준 것만 보인다」가 갈린다.
    준비 = await page.evaluate(async (stamp) => {
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

      const 폴더 = await 만든다(null, 'directory', `acl-공유함-${stamp}`);
      if (폴더 === undefined) return { error: '디렉토리를 만들지 못했다' };
      const 자식 = await 만든다(폴더.id, 'file', `acl-자식-${stamp}.md`);
      if (자식 === undefined) return { error: '자식 문서를 만들지 못했다' };
      const 비밀 = await 만든다(null, 'file', `acl-비밀-${stamp}.md`);
      if (비밀 === undefined) return { error: '비교용 문서를 만들지 못했다' };

      // 둘째 계정. 슈퍼유저만 등록할 수 있고 첫째가 그 자격이다.
      const 계정 = { name: `acl-e2e-${stamp}`, password: `pw-${stamp}` };
      const 등록 = await fetch('/api/roster/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(계정),
      });
      if (!등록.ok) return { error: `둘째 계정을 만들지 못했다 (${등록.status})` };
      const { id: principalId } = await 등록.json();

      return {
        workspaceName: first.workspace.name,
        폴더,
        자식,
        비밀,
        계정,
        principalId,
      };
    }, 시각);

    if (준비.error) {
      note(`(준비하지 못했다 — ${준비.error})`);
      check('기준 4 두 계정의 화면을 잴 준비가 된다', false, 준비.error);
      return;
    }

    // 둘째 세션. 로그인 상태를 **복사하지 않는다** — 이 검사가 재려는 것이
    // 바로 다른 자격의 화면이므로, 여기서만은 두 번째 로그인이 필요하다.
    둘째맥락 = await page.context().browser().newContext({
      viewport: { width: 1280, height: 900 },
    });
    const 둘째 = await 둘째맥락.newPage();
    await loginAs(둘째, 준비.계정.name, 준비.계정.password);

    const 둘째트리 = async () => {
      await 둘째.goto(WEB_URL, { waitUntil: 'networkidle' });
      return await 둘째.evaluate(트리이름들);
    };

    // ── R25 완전 숨김 ────────────────────────────────────────────────
    const 처음 = await 둘째트리();
    check(
      '기준 4 R25 권한이 없으면 그 노드가 화면에 아예 없다',
      !트리에있다(처음, `acl-공유함-${시각}`) &&
        !트리에있다(처음, `acl-자식-${시각}`) &&
        !트리에있다(처음, `acl-비밀-${시각}`),
      `둘째의 트리 항목 ${처음.length}개 — 셋 다 없다: ${
        !트리에있다(처음, `acl-공유함-${시각}`) &&
        !트리에있다(처음, `acl-자식-${시각}`) &&
        !트리에있다(처음, `acl-비밀-${시각}`)
      }`,
    );

    // 첫째의 화면에는 같은 셋이 **있다.** 이 대조가 없으면 위 판정은
    // 「트리가 통째로 비어 있다」로도 참이 된다.
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
    const 첫째 = await page.evaluate(트리이름들);
    check(
      '기준 4 R25 같은 자리를 첫째는 본다 — 두 화면이 실제로 다르다',
      트리에있다(첫째, `acl-공유함-${시각}`) && 트리에있다(첫째, `acl-비밀-${시각}`),
      `첫째의 트리 항목 ${첫째.length}개 · 둘째 ${처음.length}개`,
    );

    // ── R14 상속 ─────────────────────────────────────────────────────
    const 부여 = await page.evaluate(
      async ([nodeId, principalId]) => {
        const res = await fetch(`/api/nodes/${nodeId}/share`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ principalId, level: 'view' }),
        });
        return { ok: res.ok, status: res.status };
      },
      [준비.폴더.id, 준비.principalId],
    );
    check('기준 4 첫째가 화면 경로로 권한을 준다', 부여.ok, `share 응답 ${부여.status}`);

    const 부여뒤 = await waitUntil(
      () => 둘째트리(),
      (이름들) => 트리에있다(이름들, `acl-공유함-${시각}`),
      { timeout: 10_000 },
    );
    check(
      '기준 4 준 자리가 둘째의 화면에 나타난다',
      트리에있다(부여뒤, `acl-공유함-${시각}`),
      `둘째의 트리 항목 ${부여뒤.length}개`,
    );
    check(
      '기준 4 R25 주지 않은 자리는 여전히 없다 — 준 것만 보인다',
      !트리에있다(부여뒤, `acl-비밀-${시각}`),
      `비밀 문서 노출 ${트리에있다(부여뒤, `acl-비밀-${시각}`)}`,
    );

    // 상속은 **그 아래**에서 성립한다. 디렉토리는 접힌 채 서므로 펼쳐야
    // 자식이 화면에 온다 — 접힌 상태로 세면 「상속이 안 됐다」와
    // 「아직 안 그렸다」가 갈리지 않는다.
    const 펼치기 = 둘째.getByRole('button', { name: new RegExp(`acl-공유함-${시각}.*펼치기`) });
    if ((await 펼치기.count()) > 0) await 펼치기.first().click();
    const 펼친뒤 = await 둘째.evaluate(트리이름들);
    check(
      '기준 4 R14 부모에 준 권한이 그 아래 문서까지 상속된다',
      트리에있다(펼친뒤, `acl-자식-${시각}`),
      `펼친 뒤 항목 ${펼친뒤.length}개 · 자식 노출 ${트리에있다(펼친뒤, `acl-자식-${시각}`)}`,
    );

    // ── 회수 ─────────────────────────────────────────────────────────
    const 회수 = await page.evaluate(
      async ([nodeId, principalId]) => {
        const view = await (await fetch(`/api/nodes/${nodeId}/share`)).json();
        // 상속으로 온 행은 `entryId` 가 없다 — 그 자리에서 거둘 수 없고
        // 부여가 있는 조상에서 거둬야 한다. 여기서 준 것은 이 노드의 것이다.
        const 항목 = (view?.rows ?? []).find(
          (one) => one.principalId === principalId && one.entryId !== null,
        );
        if (항목 === undefined) return { ok: false, status: 0, 사유: '거둘 부여 항목을 못 찾았다' };
        const res = await fetch(`/api/acl-entries/${항목.entryId}`, { method: 'DELETE' });
        return { ok: res.ok, status: res.status };
      },
      [준비.폴더.id, 준비.principalId],
    );
    check(
      '기준 4 첫째가 같은 화면에서 권한을 거둔다',
      회수.ok,
      회수.사유 ?? `회수 응답 ${회수.status}`,
    );

    const 회수뒤 = await waitUntil(
      () => 둘째트리(),
      (이름들) => !트리에있다(이름들, `acl-공유함-${시각}`),
      { timeout: 10_000 },
    );
    check(
      '기준 4 거둔 자리가 둘째의 화면에서 사라진다',
      !트리에있다(회수뒤, `acl-공유함-${시각}`) && !트리에있다(회수뒤, `acl-자식-${시각}`),
      `둘째의 트리 항목 ${회수뒤.length}개`,
    );

    note('(둘째 계정은 지우지 않는다 — 계정 삭제 경로가 아직 화면에 없다. 이름에 시각이 들어 있어 회차마다 다른 계정이 선다)');
  } finally {
    if (준비 !== undefined && 준비.error === undefined) {
      // 자식이 먼저다 — 부모를 지우면 그 아래가 함께 휴지통으로 간다.
      await removeDocument(page, 준비.자식.id);
      await removeDocument(page, 준비.폴더.id);
      await removeDocument(page, 준비.비밀.id);
    }
    if (둘째맥락 !== undefined) await 둘째맥락.close();
  }
});
