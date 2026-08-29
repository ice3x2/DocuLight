// 실제 브라우저에서 검색 화면의 기하를 확인한다 (`FR-SHELL-013` AC-5 · AC-12).
//
// 이 둘은 **계산된 기하**가 답이라 jsdom 이 원리상 재지 못한다.
//
//  - AC-5 는 필터 버튼이 「검색창 **오른쪽**」에 있기를 요구한다. 클래스 이름이나
//    DOM 순서로는 그것이 재어지지 않는다 — 오른쪽에 있다는 것은 화면 좌표의
//    사실이고, happy-dom 은 `getBoundingClientRect` 에 언제나 0 을 돌려준다.
//  - AC-12 는 결과가 넘칠 때 **목록이** 스크롤되기를 요구한다. 화면 전체가
//    스크롤되면 검색창이 위로 밀려 사라지므로 그 둘은 같지 않은데, 레이아웃이
//    없는 환경에서는 `overflow` 속성만 볼 수 있을 뿐 실제로 넘쳤는지가 갈리지
//    않는다.
//
// `search-filter.test.tsx` 가 그 둘을 covers 에 적고 있었으나 실제로는 표지
// 속성과 클릭 동작만 재고 있었다 — 2026-08-28 독립 판정이 그 공백을 지적했고
// 확인 결과 옳아 두 AC 의 체크가 해제됐다. 이 검사가 그 자리를 채운다.
//
// 사용: DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> \
//         node test/search-layout-check.mjs [--headed]

import {
  runBrowserChecks,
  waitUntil,
  login,
  makeDocument,
  removeDocument,
  WEB_URL,
} from './_web-harness.mjs';

/** 결과가 확실히 넘치도록 만드는 문서 수. */
const 문서수 = 25;

await runBrowserChecks(async ({ page, check, beginMeasuring, note }) => {
  await login(page);

  // 같은 낱말을 이름에 담은 문서를 여럿 만든다 — 기본 축이 `이름` 하나이므로
  // (AC-6) 축을 건드리지 않고도 결과가 쌓인다.
  const 표식 = `찾을낱말${Date.now()}`;
  const 문서들 = [];
  for (let i = 0; i < 문서수; i += 1) {
    // **이름**에 표식을 담는다 — 기본 축이 `이름` 하나이므로(AC-6) 본문에만
    // 넣으면 축을 켜지 않는 한 걸리지 않는다.
    문서들.push(await makeDocument(page, `# ${표식} ${i}\n`, 표식));
  }

  try {
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });

    // 검색 탭을 열고 질의를 친다.
    await page.getByRole('tab', { name: '검색' }).click();
    const 입력 = page.getByPlaceholder(/문서 제목|검색/).first();
    // 제어 입력이라 값을 밀어 넣으면 React 가 그 변경을 보지 못할 수 있다.
    await 입력.click();
    await 입력.type(표식, { delay: 10 });

    beginMeasuring();

    // ── AC-5 — 필터 버튼이 검색창 **오른쪽**에 있다.
    const 배치 = await page.evaluate(() => {
      const 버튼 = [...document.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes('검색 대상'),
      );
      const 입력 = document.querySelector('input[type="text"], input:not([type])');
      if (!버튼 || !입력) return null;
      const b = 버튼.getBoundingClientRect();
      const i = 입력.getBoundingClientRect();
      return {
        버튼왼쪽: Math.round(b.left),
        입력오른쪽: Math.round(i.right),
        세로겹침: Math.min(b.bottom, i.bottom) - Math.max(b.top, i.top) > 0,
      };
    });
    check(
      'AC-5 필터 버튼이 검색창 오른쪽에 선다',
      배치 !== null && 배치.버튼왼쪽 >= 배치.입력오른쪽 - 2 && 배치.세로겹침,
      배치 === null
        ? '버튼이나 입력을 찾지 못했다'
        : `버튼 left ${배치.버튼왼쪽} · 입력 right ${배치.입력오른쪽} · 같은 줄 ${배치.세로겹침}`,
    );

    // ── AC-5 — 누르면 팝오버가 열리고 체크박스 넷이 선다.
    await page.getByRole('button', { name: '검색 대상' }).click();
    const 체크박스수 = await page.getByRole('checkbox').count();
    check('AC-5 팝오버에 네 대상의 체크박스가 선다', 체크박스수 === 4, `체크박스 ${체크박스수}개`);

    // 팝오버를 닫는다 — 열린 채로 두면 목록 위를 덮어 스크롤 판정이 흔들린다.
    await page.keyboard.press('Escape');

    // ── AC-12 — 결과 목록이 **자기 안에서** 스크롤된다.
    const 스크롤 = await waitUntil(
      () =>
        page.evaluate(() => {
          // **결과 영역 자신**을 본다. 「화면 어딘가가 스크롤되는가」로 재면
          // 사이드바나 트리가 넘치는 것으로도 통과한다 — 실측으로 확인했다:
          // 결과 영역의 스크롤 표식을 떼어도 그 판정이 초록이었다.
          const 영역 = document.querySelector('[aria-label="검색 결과"]');
          const s = 영역 === null ? null : getComputedStyle(영역);
          return {
            영역있음: 영역 !== null,
            넘침: 영역 !== null && 영역.scrollHeight > 영역.clientHeight + 4,
            스크롤가능: s !== null && (s.overflowY === 'auto' || s.overflowY === 'scroll'),
            본문넘침: document.body.scrollHeight > window.innerHeight + 4,
            결과수: document.querySelectorAll('[data-testid="search-document"]').length,
          };
        }),
      (v) => v.결과수 > 5 && v.넘침,
      { timeout: 10_000 },
    );

    check(
      'AC-12 결과가 넘치면 결과 영역이 자기 안에서 스크롤된다',
      스크롤.영역있음 && 스크롤.넘침 && 스크롤.스크롤가능,
      `결과 문서 ${스크롤.결과수}개 · 영역 ${스크롤.영역있음} · 넘침 ${스크롤.넘침} · overflow-y 스크롤 ${스크롤.스크롤가능}`,
    );
    check(
      'AC-12 화면 전체가 스크롤되지 않는다 — 그러면 검색창이 밀려 사라진다',
      !스크롤.본문넘침,
      스크롤.본문넘침 ? 'body 가 뷰포트를 넘는다' : 'body 는 뷰포트 안이다',
    );

    note(`(문서 ${문서수}개를 만들어 결과를 넘치게 했다)`);
  } finally {
    for (const doc of 문서들) await removeDocument(page, doc.id);
  }
});
