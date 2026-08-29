// web 앱 브라우저 시험이 함께 쓰는 기계장치.
//
// `packages/editor/test/_browser-harness.mjs` 의 모양을 따르고, 그 기계장치를
// **다시 만들지 않고 그대로 쓴다** — 브라우저를 띄우고 판정을 집계해 종료
// 코드로 내보내는 절차는 두 패키지가 같다. 여기에 더하는 것은 web 에만 있는
// 절차뿐이다: 로그인, 시험용 문서 준비, 그 문서를 화면에서 열기.
//
// **editor 검사와 무엇이 다른가.** editor 는 데모 페이지 하나에 붙으면 끝이지만
// web 은 서버가 있어야 한다 — 트리도 본문도 저장도 전부 API 를 지난다. 그래서
// 이 시험들은 서버가 이미 떠 있고 로그인할 수 있는 계정이 있다는 전제 위에
// 서며, 그 전제가 서지 않으면 「실패」가 아니라 「재지 못했다」로 나간다.
//
// **개인 데이터에 기대지 않는다.** 2026-08-24 수동 검증은 실제 옵시디언 볼트를
// 썼는데, 그 방식은 그 기계에서만 재현된다. 여기서는 시험이 자기 문서를 만들고
// 끝나면 지운다.
//
// 앞의 밑줄은 이 파일이 시험이 아니라 시험의 도구라는 표시다.

// 상대 URL 을 그대로 쓴다 — `pathname` 을 거쳐 다시 파일 URL 로 만들면
// Windows 에서 드라이브 문자가 한 번 더 붙어 `C:/C:/...` 가 된다.
const HARNESS = new URL('../../editor/test/_browser-harness.mjs', import.meta.url).href;

const { runBrowserChecks, waitUntil, unmeasurable, HEADED } = await import(HARNESS);

export { runBrowserChecks, waitUntil, unmeasurable, HEADED };

/** web 앱 주소. 저장소 관례상 3399 다. */
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3399/';

/**
 * 로그인 계정.
 *
 * **환경변수로 받는다.** 서버가 이미 설치를 마친 상태면 계정의 비밀번호를
 * 시험이 알 길이 없고, 값을 코드에 박으면 그 값이 곧 자격증명이 된다.
 */
const USER = process.env.DOCULIGHT_E2E_USER;
const PASS = process.env.DOCULIGHT_E2E_PASS;

const 안내 =
  'web 앱과 API 서버가 함께 떠 있어야 하고 로그인할 계정이 있어야 한다.\n' +
  '  1) 저장소 루트에서 `npm run dev` (web 3399)\n' +
  '  2) `npm run dev --workspace @doculight/server` (API 3400)\n' +
  '  3) 설치를 마친 뒤 그 계정을 환경변수로 준다:\n' +
  '     DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> node test/<검사>.mjs';

/**
 * 앱에 붙고 로그인한다.
 *
 * 로그인 화면을 거치지 않고 API 로 세션을 세운다 — 이 시험들이 재는 것은
 * 편집 화면의 거동이고, 로그인 화면은 아직 자리표다(`PreAuthScreen`).
 */
export async function login(page) {
  if (!USER || !PASS) unmeasurable(`로그인 계정이 주어지지 않았다.\n${안내}`);

  try {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  } catch {
    unmeasurable(`web 앱이 ${WEB_URL} 에 떠 있지 않다.\n${안내}`);
  }

  const ok = await page.evaluate(
    async ([name, password]) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      return res.ok;
    },
    [USER, PASS],
  );
  if (!ok) unmeasurable(`그 계정으로 로그인되지 않는다.\n${안내}`);
}

/**
 * 시험용 문서를 하나 만든다.
 *
 * 첫 워크스페이스의 루트에 만들고 노드 ID 를 돌려준다. 이름에 시각을 넣어
 * 앞 회차의 잔여와 부딪히지 않게 한다 — 부딪히면 서버가 접미사를 붙이는데
 * 그 자체는 옳지만 시험이 자기 문서를 못 찾는다.
 */
export async function makeDocument(page, body = '# 시험 문서\n', 이름접두 = 'e2e') {
  const made = await page.evaluate(
    async ([초기본문, 접두]) => {
      const tree = await (await fetch('/api/tree')).json();
      const first = tree[0];
      if (first === undefined) return { error: '볼 수 있는 워크스페이스가 없다' };

      const stamp = `${Date.now()}`;
      const created = await (
        await fetch('/api/nodes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceId: first.workspace.id,
            parentId: null,
            kind: 'file',
            name: `${접두}-${stamp}.md`,
          }),
        })
      ).json();
      if (created?.id === undefined) return { error: '문서를 만들지 못했다' };

      // 갓 만든 문서는 빈 본문이다. 잴 내용을 넣어 둔다.
      const read = await (await fetch(`/api/documents/${created.id}`)).json();
      await fetch(`/api/documents/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 초기본문, baseHash: read.hash }),
      });

      return { id: created.id, name: created.name };
    },
    [body, 이름접두],
  );

  if (made.error) unmeasurable(`${made.error}.\n${안내}`);
  return made;
}

/** 만든 문서를 지운다. 남기면 다음 회차가 남의 잔여 위에서 돈다. */
export async function removeDocument(page, nodeId) {
  await page.evaluate(async (id) => {
    await fetch(`/api/nodes/${id}`, { method: 'DELETE' });
  }, nodeId);
}

/**
 * 그 문서를 화면에서 열고 편집 모드로 들어간다.
 *
 * 트리를 클릭하지 않고 주소로 연다 — 트리에는 이름이 같은 노드가 여럿일 수
 * 있고, 이 시험이 재는 것은 트리 탐색이 아니다.
 */
export async function openInEditor(page, nodeId, name) {
  // **트리에서 누른다.** 사용자가 실제로 하는 경로이고, 주소로 여는 경로는
  // 트리가 도착한 뒤에만 성립해 시험이 그 타이밍에 딸려 흔들린다.
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name }).first().click();
  await page.waitForSelector('[role="region"]', { timeout: 15_000 });

  // 편집 모드로 들어간다 — 읽기 모드에는 CodeMirror 가 서지 않는 경로가 있어
  // 그것을 기다리면 열리지 않은 화면에서 시간만 쓴다.
  const edit = page.getByRole('button', { name: '편집' });
  if ((await edit.count()) > 0) {
    await edit.first().click().catch(() => {});
  }

  try {
    await page.waitForSelector('.cm-content', { timeout: 15_000 });
  } catch {
    // 왜 서지 않았는지를 안내에 담는다 — 타임아웃 스택만으로는 화면이
    // 안 열린 것인지 편집기가 안 선 것인지 갈리지 않는다.
    const 상태 = await page.evaluate(() => ({
      url: location.href,
      regions: [...document.querySelectorAll('[role=region]')].map((r) =>
        r.getAttribute('aria-label'),
      ),
      buttons: [...document.querySelectorAll('button')]
        .map((b) => (b.textContent ?? '').trim())
        .filter(Boolean)
        .slice(0, 10),
      글자: (document.body.textContent ?? '').slice(0, 120),
    }));
    unmeasurable(
      [
        '문서를 편집 화면에서 열지 못했다.',
        `  주소: ${상태.url}`,
        `  영역: ${상태.regions.join(', ') || '없음'}`,
        `  버튼: ${상태.buttons.join(' | ') || '없음'}`,
        `  화면: ${상태.글자}`,
        안내,
      ].join('\n'),
    );
  }
}

/** 지금 포커스를 가진 요소의 클래스. 비어 있으면 편집기 밖이다. */
export const ACTIVE_CLASS = `(() => document.activeElement?.className ?? '')()`;
