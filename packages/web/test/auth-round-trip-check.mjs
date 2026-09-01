// 브라우저에서 실제로 로그인하고 로그아웃하고 비밀번호를 바꾼다
// (원장 §4 **수용 기준 14**, 검증 방법 `Playwright E2E`).
//
// **이 검사는 다른 web 검사와 전제가 정반대다.** 나머지 여덟은 로그인된
// 상태를 전제로 출발하려고 `_web-harness.mjs` 의 `login` 이 **API 로** 세션을
// 세운다. 그 지름길은 재려는 것이 편집 화면의 거동일 때 옳지만, 여기서는
// 로그인 화면 자체가 대상이라 쓸 수 없다 — API 로 붙으면 그 화면이 자리표여도
// 통과한다. 2026-09-01 이전이 정확히 그 상태였다.
//
// **비밀번호를 바꾸는 대상은 이 검사가 만든 계정이다.** 환경변수로 받은
// 계정의 비밀번호를 바꾸면 그 값이 검사를 돌린 사람의 손을 떠나고, 다음
// 회차는 옛 값으로 붙지 못한다. 만든 계정은 삭제할 수단이 없으므로
// (`R101` 이 계정 삭제를 폐기했다) 이름에 시각을 넣어 겹치지 않게 한다.
//
// **로그인 예산.** 로그인은 15분 창에 10회로 제한되고 이 검사가 그중 다섯을
// 쓴다(준비 1 · 화면 로그인 1 · 잘못된 자격 1 · 새 계정 1 · 바뀐 비밀번호 1).
// 나머지 web 검사 여덟이 아홉을 쓰므로 **한 창에 전부를 돌리지 못한다** —
// 창이 열릴 때까지 기다리거나 API 서버를 재기동한다.
//
// 사용: 서버·web·계정을 갖춘 뒤
//       DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/auth-round-trip-check.mjs [--headed]

import { runBrowserChecks, waitUntil, login, unmeasurable, WEB_URL } from './_web-harness.mjs';

/** 로그인 화면이 지금 서 있는가 — 비밀번호 입력의 존재로 잰다. */
const 로그인화면인가 = () => document.querySelector('input[name="password"]') !== null;

/** 앱 화면이 지금 서 있는가 — 트리의 존재로 잰다. */
const 앱화면인가 = () => document.querySelector('[role="tree"]') !== null;

/** 화면의 경고 문구. 없으면 빈 문자열. */
const 경고문구 = () =>
  [...document.querySelectorAll('[role="alert"]')]
    .map((el) => (el.textContent ?? '').trim())
    .join(' ');

/**
 * 그 조건이 참이 될 때까지 기다린다.
 *
 * 참이 되지 않아도 던지지 않는다 — 뒤따르는 `check` 가 그 사실을 판정으로
 * 기록해야, 「무엇이 어긋났는가」가 예외 메시지가 아니라 실패한 판정으로 남는다.
 */
const 기다린다 = (page, 조건) =>
  waitUntil(() => page.evaluate(조건), (참인가) => 참인가 === true, { timeout: 10_000 });

/** 이름·비밀번호를 화면에 쳐 넣고 제출한다. API 를 부르지 않는다. */
async function 화면에서로그인(page, name, password) {
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

await runBrowserChecks(async ({ page, check }) => {
  const 시각 = `${Date.now()}`;
  const 계정 = { name: `auth-e2e-${시각}`, password: `pw-${시각}` };
  const 새비밀번호 = `next-${시각}`;

  // 준비 — 환경변수 계정(슈퍼유저)으로 붙어 시험용 계정을 하나 만든다.
  await login(page);
  const 등록 = await page.evaluate(async (하나) => {
    const res = await fetch('/api/roster/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(하나),
    });
    return { ok: res.ok, status: res.status };
  }, 계정);
  if (!등록.ok) {
    unmeasurable(
      `시험용 계정을 만들지 못했다 (${등록.status}). 환경변수 계정이 슈퍼유저여야 한다.`,
    );
  }

  // 준비한 세션을 끊는다 — 남겨 두면 로그인 화면이 아예 뜨지 않는다.
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

  await 기다린다(page, 로그인화면인가);
  check(
    'AC-1: 인증되지 않으면 로그인 화면이 선다',
    await page.evaluate(로그인화면인가),
    'name · password 입력이 실재한다',
  );

  // ── 잘못된 자격 ────────────────────────────────────────────────
  await 화면에서로그인(page, 계정.name, '이건-틀린-비밀번호');
  await waitUntil(() => page.evaluate(경고문구), (문구) => 문구.length > 0, { timeout: 5_000 });

  const 거절문구 = await page.evaluate(경고문구);
  check(
    '틀린 자격은 안내와 함께 거절된다',
    거절문구.length > 0 && !(await page.evaluate(앱화면인가)),
    거절문구 === '' ? '안내가 비었다' : `안내: ${거절문구}`,
  );

  // ── 실제 로그인 (R57) ──────────────────────────────────────────
  await page.fill('input[name="password"]', '');
  await 화면에서로그인(page, 계정.name, 계정.password);
  await 기다린다(page, 앱화면인가);

  check(
    'R57: 화면에서 자격을 입력해 로그인된다',
    (await page.evaluate(앱화면인가)) && !(await page.evaluate(로그인화면인가)),
    '트리가 서고 로그인 폼이 사라진다',
  );

  // ── 로그아웃 (R145) ────────────────────────────────────────────
  await page.click('[data-shell="settings-corner"] button');
  await page.click('[role="tab"]:has-text("계정")');
  await page.click('button:has-text("로그아웃")');
  await 기다린다(page, 로그인화면인가);

  check(
    'R145: 로그아웃하면 그 브라우저의 인증 상태가 풀린다',
    (await page.evaluate(로그인화면인가)) && !(await page.evaluate(앱화면인가)),
    '설정 모달의 로그아웃이 실제로 세션을 끊는다',
  );

  // 로그아웃이 진짜인지 **주소를 새로 열어** 확인한다 — 화면만 바꾸고 쿠키가
  // 남아 있으면 새로고침 한 번으로 앱이 다시 열린다.
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await 기다린다(page, 로그인화면인가);
  check(
    'R145 의 뒤끝 — 새로 열어도 로그인 화면이다',
    await page.evaluate(로그인화면인가),
    '쿠키가 실제로 지워졌다',
  );

  // ── 비밀번호 변경 (R144) ───────────────────────────────────────
  await 화면에서로그인(page, 계정.name, 계정.password);
  await 기다린다(page, 앱화면인가);

  await page.click('[data-shell="settings-corner"] button');
  await page.click('[role="tab"]:has-text("계정")');
  await page.click('button:has-text("비밀번호 변경")');
  await page.fill('input[name="current"]', 계정.password);
  await page.fill('input[name="next"]', 새비밀번호);
  await page.click('button:has-text("바꾸기")');

  // 서버가 그 계정의 모든 세션을 끊으므로 이 브라우저도 로그인 화면으로 간다.
  await 기다린다(page, 로그인화면인가);
  check(
    'R144: 비밀번호를 바꾸면 그 세션이 끊긴다',
    await page.evaluate(로그인화면인가),
    '바꾼 뒤 로그인 화면으로 돌아간다',
  );

  await 화면에서로그인(page, 계정.name, 새비밀번호);
  await 기다린다(page, 앱화면인가);
  check(
    'R144 의 뒤끝 — 새 비밀번호로 다시 로그인된다',
    await page.evaluate(앱화면인가),
    '바뀐 값이 실제 검증 경로를 지난다',
  );
});
