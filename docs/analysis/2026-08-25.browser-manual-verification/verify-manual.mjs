// 브라우저 수동 검증 — FR-EDITOR-001 AC-1·AC-2 · FR-EDITOR-007 AC-7 · 원장 §4 수용 기준 7(한글 IME).
//
// packages/editor/test/browser-check.mjs 의 모양을 따른다.
// **볼트 본문을 출력하지 않는다** — 개인 문서이므로 길이·일치 여부만 낸다.
//
// 실측으로 확정한 화면 경로:
//   - 소스 모드는 `<textarea>` 다 (CodeMirror 가 아니다). 원문 전량이 보여 읽기 판정에 쓴다.
//   - 라이브 프리뷰 모드가 CodeMirror 다. 편집·표 데코레이션·IME 판정에 쓴다.
//   - 저장은 자동 저장이 한다. 저장이 끝나면 편집기가 포커스를 잃으므로
//     이어서 칠 때마다 다시 클릭한다.

import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const pw = await import(
  pathToFileURL('C:/Work/git/DocuLight2.0/packages/editor/node_modules/playwright/index.js').href
);
const chromium = pw.chromium ?? pw.default?.chromium;

const BASE = 'http://localhost:3399';
const 볼트원본 = 'C:/Work/Documents/Obsidian';
const WS_DIR =
  'C:/Users/beom/AppData/Local/Temp/claude/C--Work-git-DocuLight2-0/82fd649f-fe48-4b1f-a6e3-32c7fafa55b5/scratchpad/docs-root/339084e60234dec9e28a31c4fc424621';
const 읽기대상 = 'index.css.md';
const 표대상 = '표-검증.md';
const 표원문 = '앞 문단\n\n| 머리 | 둘 |\n| --- | --- |\n| 값 | 둘 |\n\n뒤 문단\n';

// 검증을 같은 자리에서 다시 돌릴 수 있게 두 파일을 먼저 되돌린다.
copyFileSync(`${볼트원본}/${읽기대상}`, `${WS_DIR}/${읽기대상}`);
writeFileSync(`${WS_DIR}/${표대상}`, 표원문, 'utf8');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const 파일 = (rel) => readFileSync(`${WS_DIR}/${rel}`, 'utf8').replace(/\r\n/g, '\n');

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 140)));

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'verifier', password: 'verify-pass-2026' }),
  });
});
await page.goto(BASE + '/', { waitUntil: 'networkidle' });

// 노드는 **경로**로 찾는다 — 같은 이름의 파일이 볼트에 여럿 있다.
const 노드표 = await page.evaluate(
  async ([경로들]) => {
    const tree = await (await fetch('/api/tree')).json();
    const 볼트 = tree.find((e) => e.workspace.name === '볼트');
    const map = {};
    let files = 0;
    const walk = (ns, prefix) => {
      for (const n of ns ?? []) {
        const p = prefix ? `${prefix}/${n.name}` : n.name;
        if (n.kind === 'file') {
          files += 1;
          if (경로들.includes(p) && map[p] === undefined) map[p] = n.id;
        }
        walk(n.children, p);
      }
    };
    walk(볼트.roots, '');
    return { map, files, workspaceId: 볼트.workspace.id };
  },
  [[읽기대상, 표대상]],
);
check(
  '볼트를 기본 워크스페이스에 그대로 넣었을 때 트리에 선다',
  노드표.files > 1000 && 노드표.map[읽기대상] !== undefined,
  `파일 ${노드표.files}개 색인 · ${읽기대상} ${노드표.map[읽기대상] ? '찾음' : '없음'}`,
);

const 모드클릭 = async (라벨) => {
  const b = page.locator('[aria-label="모드"] button', { hasText: 라벨 });
  await b.waitFor({ timeout: 8000 });
  await b.click();
  await page.waitForTimeout(900);
};
const 본문줄 = () =>
  page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent ?? '').join('\n'));
const 디스크대기 = async (rel, 조건, 초 = 20) => {
  for (let i = 0; i < 초 * 2; i += 1) {
    if (조건(파일(rel))) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

// ===================================================================
// FR-EDITOR-001 AC-1 — 볼트 문서를 브라우저에서 읽을 수 있다
// ===================================================================
await page.goto(`${BASE}/d/${encodeURIComponent(노드표.map[읽기대상])}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await 모드클릭('편집');
await 모드클릭('소스');
const 화면원문 = (await page.locator('textarea').first().inputValue()).replace(/\r\n/g, '\n');
const 디스크원문 = 파일(읽기대상);
check(
  'AC-1 볼트 문서의 원문이 브라우저에 그대로 뜬다',
  화면원문 === 디스크원문,
  `화면 ${화면원문.length}자 · 파일 ${디스크원문.length}자 · ${화면원문 === 디스크원문 ? '전문 일치' : '불일치'}`,
);

await 모드클릭('라이브 프리뷰');
await page.waitForSelector('.cm-content', { timeout: 15_000 });
const 라이브줄수 = await page.evaluate(() => document.querySelectorAll('.cm-line').length);
check('AC-1 라이브 프리뷰에서도 본문이 렌더된다', 라이브줄수 > 0, `보이는 줄 ${라이브줄수}개`);
await page.screenshot({ path: 'ac1-read.png' });

// ===================================================================
// FR-EDITOR-001 AC-2 — 같은 볼트 문서를 브라우저에서 편집할 수 있다
// ===================================================================
const 표식 = `DLVERIFY${Date.now()}`;
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\n' + 표식);
const 저장됨 = await 디스크대기(읽기대상, (s) => s.includes(표식));
check(
  'AC-2 브라우저에서 친 편집이 볼트 파일에 저장된다',
  저장됨,
  저장됨 ? `표식이 디스크에 반영 · ${디스크원문.length}자 → ${파일(읽기대상).length}자` : '20초 안에 반영되지 않음',
);

// 저장 직후 포커스가 빠지므로 다시 클릭한 뒤 되돌린다.
if (저장됨) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  for (let i = 0; i < 표식.length + 1; i += 1) await page.keyboard.press('Backspace');
  const 복원됨 = await 디스크대기(읽기대상, (s) => !s.includes(표식));
  check('AC-2 되돌린 편집도 같은 경로로 저장된다', 복원됨, 복원됨 ? '표식 제거 확인' : '표식이 남음');
  if (!복원됨) copyFileSync(`${볼트원본}/${읽기대상}`, `${WS_DIR}/${읽기대상}`);
}

// 저장 직후 포커스 상실을 값으로 고정한다 — 결함 보고의 근거다.
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\nFOCUSPROBE');
await 디스크대기(읽기대상, (s) => s.includes('FOCUSPROBE'));
await page.keyboard.type('LOST');
await page.waitForTimeout(1500);
const 포커스 = await page.evaluate(() => document.activeElement?.className || '(없음)');
const 이어친것 = (await 본문줄()).includes('FOCUSPROBELOST');
check(
  '[결함 관측] 저장 직후에도 편집기가 포커스를 유지한다',
  포커스.includes('cm-content') && 이어친것,
  `저장 뒤 활성 요소 "${포커스}" · 이어 친 글자 ${이어친것 ? '들어감' : '유실됨'}`,
);
copyFileSync(`${볼트원본}/${읽기대상}`, `${WS_DIR}/${읽기대상}`);

// ===================================================================
// FR-EDITOR-007 AC-7 — 표의 숨는 절반과 드러나는 절반
// ===================================================================
if (노드표.map[표대상] === undefined) {
  check('AC-7 표 검증 문서가 색인됐다', false, `${표대상} 를 트리에서 찾지 못했다`);
} else {
  await page.goto(`${BASE}/d/${encodeURIComponent(노드표.map[표대상])}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await 모드클릭('편집');
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.waitForTimeout(1200);

  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(1200);
  const 위젯수 = await page.evaluate(() => document.querySelectorAll('.cm-atomic-table').length);
  const 숨은본문 = await 본문줄();
  check(
    'AC-7 숨는 절반 — 커서가 없으면 표 기호가 숨고 표가 렌더된다',
    위젯수 >= 1 && !숨은본문.includes('---'),
    `표 위젯 ${위젯수}개 · 구분선 ${숨은본문.includes('---') ? '노출됨' : '숨음'}`,
  );
  await page.screenshot({ path: 'ac7-hidden.png' });

  // 커서를 표 안으로 넣는 수단 셋을 모두 시도한다 — 하나라도 드러나면 통과다.
  const 시도 = [];
  const 값칸 = page.locator('.cm-atomic-table').getByText('값', { exact: true }).first();
  if ((await 값칸.count()) > 0) {
    await 값칸.click();
    await page.waitForTimeout(1200);
    시도.push(['셀 클릭', (await 본문줄()).includes('---')]);
  }
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(600);
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1200);
  시도.push(['아래 화살표', (await 본문줄()).includes('---')]);

  await page.keyboard.press('Control+End');
  await page.waitForTimeout(400);
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(1200);
  시도.push(['위 화살표', (await 본문줄()).includes('---')]);

  const 드러남 = 시도.some(([, ok]) => ok);
  check(
    'AC-7 드러나는 절반 — 표에 커서를 올리면 구분선 원문이 드러난다',
    드러남,
    시도.map(([n, ok]) => `${n}:${ok ? '드러남' : '안 드러남'}`).join(' · '),
  );
  await page.screenshot({ path: 'ac7-revealed.png' });

  // ===================================================================
  // 원장 §4 수용 기준 7 — 한글 IME 조합이 편집 중 깨지지 않는다
  // ===================================================================
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  const 조합 = async (단계들, 확정) => {
    for (const 단계 of 단계들) {
      await cdp.send('Input.imeSetComposition', {
        text: 단계,
        selectionStart: 단계.length,
        selectionEnd: 단계.length,
      });
      await page.waitForTimeout(150);
    }
    await cdp.send('Input.insertText', { text: 확정 });
    await page.waitForTimeout(250);
  };
  await page.keyboard.type('\n');
  await 조합(['ㅎ', '하', '한'], '한');
  await 조합(['ㄱ', '그', '글'], '글');
  await 조합(['ㅇ', '이', '입'], '입');
  await 조합(['ㄹ', '려', '력'], '력');
  await page.waitForTimeout(1000);

  const ime본문 = await 본문줄();
  const 성공 = (ime본문.match(/한글입력/g) ?? []).length;
  const 자모잔여 = /[ㄱ-ㅎㅏ-ㅣ]/.test(ime본문);
  check(
    '수용 기준 7 한글 IME 조합이 편집 중 깨지지 않는다',
    성공 === 1 && !자모잔여,
    `「한글입력」 ${성공}회 · 낱자모 잔여 ${자모잔여 ? '있음' : '없음'}`,
  );
  await page.screenshot({ path: 'ime.png' });
}

console.log('\n=== 콘솔 오류 ===');
console.log(consoleErrors.slice(0, 8).join('\n') || '(없음)');
await browser.close();

const 실패 = results.filter((r) => !r.pass);
console.log(`\n${results.length - 실패.length}/${results.length} 통과`);
writeFileSync(
  'verify-result.json',
  JSON.stringify({ 실행: new Date().toISOString(), results }, null, 2),
  'utf8',
);
process.exit(0);
