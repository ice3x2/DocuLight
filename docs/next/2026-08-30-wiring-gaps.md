# 배선 공백 다섯을 닫았다 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-30 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 각 기준의 「브라우저 잔여」를 닫는다. 그 과정에서 드러나는 결함은 그 자리에서 고친다 |
| 현재 상태 | 기준 6·12 잔여 닫음 · 배선 결함 다섯 전부 수정 · 브라우저 잔여 넷 남음 · 워킹트리 clean |
| SSOT | `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` |
| 다음 세션 첫 행동 | `new-file`·`new-directory` 배선(작음)을 닫고 브라우저 잔여로 넘어간다 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 자율적으로 이어갈 수 있도록 정리한 것이다.
> 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` 를 정독한다.
3. `git status --porcelain` 이 **빈 출력**인지 확인한다. 무언가 보이면 그 사이 누가 작업한 것이다.
4. **`new-file`·`new-directory` 배선을 먼저 닫는다.** 트리 컨텍스트 메뉴 아홉 중 남은 둘이고,
   서버 라우트(`POST /api/nodes`)와 client 함수(`createNode`)가 이미 있어 배선만 이으면 닿는다.
   완료 조건은 아래 「남은 작업 전체 목록」에 적었다.
5. 그다음 브라우저 잔여 넷으로 넘어간다. **기준 4 를 권한다** — 이 회차에 공유 화면이 배선돼
   화면에서 권한을 주고 거둘 수 있게 됐으므로, 막혀 있던 두 계정 시나리오가 이제 성립한다.

## 1. 최종 작업 목표

원장(`C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` §4, 690~712행)의 Phase 1
수용 기준 열셋을 전건 통과시킨다. 열셋은 2026-08-29 에 모두 탐침 또는 브라우저 검사를
지났고, 남은 것은 각 기준의 「브라우저 잔여」다.

**이 회차가 그 목표의 성격을 바꿨다.** 잔여를 닫으려고 화면을 실제로 재기 시작하자
**부품은 있는데 제품에 붙지 않은 자리**가 연달아 드러났고, 그것이 이 회차 작업의
대부분이 됐다. 다섯 번 다 시험은 전건 초록이었다.

**완료 조건**: 잔여 각각에 대해 ⓐ 브라우저 검사 또는 진입점 시험이 서고 ⓑ 그 시험이
뮤테이션 탐침에 물며 ⓒ 회귀 진입점에 등록되어 전건 통과한다.

## 2. 현재까지 완료한 작업

이 회차의 커밋은 아홉이다. 직전 핸드오프의 마지막 커밋은 `65a5f96` 이다.

- [x] **기준 6·12 브라우저 잔여** — 커밋 `d73ef79`.
      `C:\Work\git\DocuLight2.0\packages\web\test\merge-view-check.mjs` (판정 7).
      브라우저 컨텍스트 둘이 같은 문서를 차례로 저장해 충돌을 실제로 만들고, 병합 화면과
      버전 비교 화면 양쪽에서 `.cm-mergeView` 의 기하와 `.cm-changedLine` 을 잰다.
      ⚠️ 미검증 — 독립 검증이 주장 8건 전부 「참」, 거짓 0건·확인불가 0건으로 판정했다.
      그 판정은 세션 안의 서브에이전트 회신이라 저장소에 산출물이 없다 —
      `kiwi/waves.jsonl` 의 마지막 기록은 2026-08-29 이고 `docs/analysis` 에 08-30 항목이
      0건이다. **다음 세션이 확인하려면 같은 축을 다시 검증해야 한다.**
- [x] **KaTeX 스타일시트 부재 수정** — 커밋 `f37159f`, 요구 `FR-EDITOR-010` AC 4/4.
      `C:\Work\git\DocuLight2.0\packages\editor\test\math-render-check.mjs` (판정 4).
- [x] **제품이 편집기 스타일을 얹지 않던 문제 수정** — 같은 커밋, 요구 `IR-EDITOR-001` AC 4/4.
      `C:\Work\git\DocuLight2.0\packages\web\test\editor-styles-check.mjs` (판정 3) 과
      `C:\Work\git\DocuLight2.0\packages\web\test\editor-styles-assembly.test.ts` (3항).
- [x] **트리 메뉴 삭제 배선** — 커밋 `c615f6a`, 요구 `IR-SHELL-005` AC 4/4.
      같은 커밋이 `screen-wiring.test.tsx` 에 **아홉 항목의 배선 상태를 붙드는 명시 목록**을 세웠다.
- [x] **이름 변경·이동·복사** — 커밋 `754c184`(요구) · `b618834`(서버) · `cc164eb`(이름 변경 화면) ·
      `155ff18`(이동·복사 화면) · `52c424d`(낡은 서술 정정). 요구 `FR-SHELL-015` AC 5/5.
      ⚠️ 미검증 — 독립 검증이 주장 8건 전부 「참」, 거짓 0건·확인불가 0건으로 판정했다.
      위와 같은 사유로 저장소에 그 판정의 산출물이 없다. 다만 **인용한 커밋 다섯의 역할과
      `FR-SHELL-015` AC 5/5 는 저장소에서 각각 확인된다.**
- [x] **공유 화면 배선** — 커밋 `e0551c6`. 증거 `IR-ACL-002` VE-3 · `IR-ACL-003` VE-3 ·
      `FR-CONFIRM-014` VE-2 · `FR-CONFIRM-018` VE-3.
      문서 전용 자리표 `packages/web/src/document/ShareModal.tsx` 를 삭제하고 두 진입점이
      `packages/web/src/acl/ShareModal.tsx` 하나를 열게 했다.
- [x] **전체 회귀** — `cd C:/Work/git/DocuLight2.0 && npm test` (2026-08-30 실행, exit 0,
      editor 253 통과 + 1 건너뜀 / server 1343 통과 / web 568 통과)
- [x] **타입 검사** — `cd C:/Work/git/DocuLight2.0 && npm run typecheck` (2026-08-30 실행, exit 0)
- [x] **web 브라우저 검사** — `DOCULIGHT_E2E_USER=e2e DOCULIGHT_E2E_PASS=e2e-pass-2026
      npm run test:browser:all` (packages/web 에서 2026-08-30 실행, **22/22 통과**, exit 0).
      공유 배선 커밋 `e0551c6` **이후에** 실행한 값이다.
- [x] **editor 브라우저 검사** — `EDITOR_URL=http://localhost:3401/ npm run test:browser:all`
      (packages/editor 에서 2026-08-30 실행, **29/29 통과**, exit 0). 커밋 `f37159f` 시점의
      값이며 그 뒤 `packages/editor` 를 건드리지 않았다. **커밋 `e0551c6` 이후로는 재실행하지 않았다.**
- [x] **SRS 검증** — MCP `validate_spec` (2026-08-30 실행, 오류 0 · 경고 1).
      그 경고는 `SRS-W072`(문서 번호 중복)이며 이 회차와 무관한 선재 항목이다.

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| "기준 2 의 잔여 일곱은 인라인 데코레이션이라 위젯 기하가 걸리지 않는다" | **틀렸다.** 코드블록은 `packages/editor/src/core/code-blocks.ts` 가 `block: true` 로, display 수식은 `src/core/math-decoration.ts` 가 `block: block.display` 로 세우는 **블록 replace 위젯**이다. 그 오판 위에서 잔여를 좁히려던 판단을 독립 검토가 소스로 반증했고, **반증된 자리가 곧 결함이 있던 자리였다** |
| "이름 변경·이동·복사는 서버에 실행 라우트가 없다 → 조작 자체가 없다" | 앞 절반은 참이고 뒤가 **틀렸다.** `packages/server/src/app/node/node-service.ts` 에 `renameNode`(227행)·`moveNode`(252행)·`copyNode`(370행) 가 권한 판정·이름 충돌 접미사·자기 자손 방어·경로 길이 검사·감사 기록까지 갖춘 채 있었다. `workspace-api.ts` 가 그 파일에서 `createNode` 하나만 가져왔을 뿐이다 |
| "공유는 부품이 다 있으나 그것을 쓸 화면이 자리표다" | **절반만 맞았다.** 자리표는 `document/ShareModal.tsx` 였고, 진짜 화면 `acl/ShareModal.tsx` 는 **202행짜리 완성품에 시험까지 있는데 어디에도 마운트되지 않은** 상태였다. `grep -rn "acl/ShareModal" packages/web/src/` 가 0건을 돌려줬다 |
| "`heightmap-drift-check.mjs` 가 클릭 좌표 축을 문서 전역으로 잰다" | **틀렸다.** `packages/editor/test/heightmap-drift-check.mjs:241-243` 이 재는 것은 표 첫 줄·문단·인용 **세 줄**뿐이고, 코드블록에는 별도 판정 ④ 가 따로 있다 |

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master`. origin 은 같은 기계의 `B:/work/git/DocuLight2.0.git` 이며 기계 밖 원격은 없다.
- 미커밋 파일: **이 핸드오프 문서와 `docs/next/LATEST.md` 둘.** 그 밖은 clean 이다
  (커밋 `e0551c6` 직후 `git status --porcelain` 이 빈 출력이었다).
- **HEAD 해시를 여기 적지 않는다** — 이 문서를 커밋하면 그 값이 바뀌므로 적는 순간 틀린 값이 된다.
  이 회차의 마지막 코드 커밋은 `e0551c6` 이고 `git log --oneline -10` 으로 확인한다.

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| **SSOT** | `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` | 기준 열셋의 확정 상태와 「브라우저 잔여」 목록, 그리고 미결 표 |
| 원장 | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` §4 (690~712행) | 수용 기준 열셋의 원문 |
| 직전 핸드오프 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-30-browser-remainder.md` | 브라우저 검사 절차와 함정 목록. **그 절차는 지금도 유효하다** |

**배선 상태를 붙드는 자리**: `C:\Work\git\DocuLight2.0\packages\web\test\screen-wiring.test.tsx`
— `아직_닿지_않음` 맵(545행에서 시작, 파일은 952행)이 **아직 닿지 않는 일곱**을 사유와 함께
담고, 601행의 `it.each` 가 `CONTEXT_MENU_ITEMS` 의 **아홉**을 하나씩 눌러 그 맵과 대조한다. **목록에 없는 항목이 끊기면 실패하고, 목록에 있는 항목이 닿게 되면 「그 줄을 지워라」는
안내와 함께 실패한다.** 양방향으로 물린다.

**참고 선례 (배선을 이을 때 이 모양을 따른다)**

- `C:\Work\git\DocuLight2.0\packages\web\src\tree\DocumentTree.tsx` — 메뉴 항목을 콜백에 잇는 자리.
  `favorite`·`delete`·`rename`·`move`·`copy`·`share`·`new-version` 일곱이 이미 거기 있다
- `C:\Work\git\DocuLight2.0\packages\web\src\shell\AppShell.tsx` — 상태를 들고 부품을 세우는 자리.
  `RenamePrompt`·`RelocationDialog`·`ShareModal` 이 `{상태 !== null && (<부품 .../>)}` 꼴로 서 있다
- `C:\Work\git\DocuLight2.0\packages\web\src\App.tsx` — 핸들러와 쿼리 무효화. `AppShell` 은 API 를
  직접 부르지 않고 `App` 이 데이터를 내려준다
- `C:\Work\git\DocuLight2.0\packages\server\test\arch\assembly.test.ts` — 「진입점에서 도달하는가」를
  재는 방벽의 원형. 사유를 적은 허용목록을 두는 방식이 여기서 왔다

## 5. 확정된 결정 (변경 금지)

1. **부품이 있으면 새로 만들지 않는다** — **확정**. 이 회차에 다섯 번 확인됐다.
   (근거: 커밋 `f37159f`·`c615f6a`·`b618834`·`155ff18`·`e0551c6` 의 메시지와 diff)
2. **노드 조작은 DB 를 먼저, 디스크를 나중에 옮긴다** — **확정**.
   (근거: `C:\Work\git\DocuLight2.0\packages\server\src\app\watch\file-watch.ts:179` 가
   「노드가 이미 그 경로를 갖고 있으면 우리가 옮긴 것」으로 서버발 이동을 무시한다.
   뒤집으면 정상 이동이 신규 노드로 판정되어 권한과 이력이 끊긴다. 그 사유를
   `packages/server/src/app/node/node-service.ts` 의 `place` 주석에 적어 두었다)
3. **판정을 라우트에 다시 적지 않는다** — **확정**. 권한·이름 충돌·게이트는 서비스가 소유하고
   라우트는 401·400·403 매핑과 디스크 추종만 한다.
   (근거: `packages/server/src/http/routes/workspace-api.ts` 의 세 라우트와 `refuse` 헬퍼)
4. **거절 사유를 응답 본문에 싣지 않는다** — **확정**. 권한 부족과 부재를 다른 코드로 가르면
   그 차이가 경로 열거 오라클이 된다. (근거: 같은 파일의 `refuse` 와 그 주석)
5. **공유 화면은 하나다** — **확정**. 문서 전용 자리표를 삭제했다.
   (근거: `IR-ACL-003` AC-5 「같은 지정 방식을 문서와 디렉토리 양쪽에 쓴다」와 커밋 `e0551c6`)
6. **기준 10 의 브라우저 잔여는 실재하지 않는다** — **확정**. 원장 문면이 겉모습을 요구하지 않고,
   「깨진 이미지」는 `SEC-ATTACH-002` AC-6 으로 **AC-5(참조 경로)** 의 축이다.
   (근거: SSOT 의 기준 10 절과 `docs/spec/15.attachments.srs.md` Implementation Notes)
7. **`SEC-STORAGE-007` 은 phase-2 로 이관한다** — **확정**. (근거: `kiwi/waves.jsonl` 의 `R-W5-STORAGE-007`)

## 6. 미결정·유예 항목

- **원장 §4 가 인증 축을 수용 기준에 넣지 않은 문제** — 로그인(R57·R60·R60-b) · 로그아웃(R145) ·
  비밀번호 변경(R144) 중 어느 것도 열셋에 없다. 원장 스스로 그 사실을 §4 위 인용 블록에 적고
  「다음 개정에서 ① 기준을 추가할지 ② 추가하지 않을 사유를 여기 남길지 판정하라」고 지시했다.
  **원장을 고치는 일이라 사용자 결정이 필요하다.**
- **기준 1 의 실제 볼트 재실행** — 개인 데이터가 필요하고 2026-08-24 증거가 살아 있다.
  결정 방법: 사용자가 사본 경로를 줄 때만 수행.
- **기준 2 의 인라인 다섯(헤딩·강조·목록·링크·인용)** — 브라우저가 아니면 잴 수 없는 축이
  남아 있는지 아직 이름을 대지 못했다. 결정 방법: 착수 전에 「happy-dom 이 이것을 왜 못 재는가」를
  한 문장으로 댈 수 있는지 확인한다. 못 대면 잔여가 아니므로 SSOT 에서 뺀다.
- **`hasHiddenDescendant` 가 두 곳에 다른 구현으로 있다** — `node-service.ts:540`(이동)과
  `trash-service.ts:88`(삭제). 조사가 발견해 보고만 했고 손대지 않았다. 결정 방법: 통합할지
  각자 두는 근거가 있는지 판정한 뒤 착수.

## 7. 남은 작업 전체 목록

### 배선 (작음 — 부품이 이미 있다)

- [ ] **`new-file`·`new-directory` 를 트리 메뉴에 잇는다** — 완료 조건: 두 항목을 누르면 그 노드
      아래에 문서/디렉토리가 생기고, `screen-wiring.test.tsx` 의 `아직_닿지_않음` 목록에서 두 줄이
      **지워진다**. 서버 라우트 `POST /api/nodes` 와 client `createNode` 가 이미 있다.
      이름을 무엇으로 할지는 판단이 필요하다 — 트리 상단 「새 노트」 버튼은 `제목 없음.md` 로
      고정돼 있고 자리도 고를 수 없다(`App.tsx` 의 `createNote`).
- [ ] **즐겨찾기 해제** — 완료 조건: 즐겨찾기 탭에서 해제할 수 있다. 서버에 `DELETE /api/favorites/:nodeId`
      가 있으나 `client.ts` 에 대응 함수가 **없다**(`grep -n "avorite" packages/web/src/api/client.ts`
      가 `fetchFavorites`·`addFavorite` 둘만 돌려준다). 요구가 있는지 먼저 확인한다.

### 브라우저 잔여 (넷)

- [ ] **기준 4 — 두 계정의 화면 차이** — 완료 조건: 권한이 다른 두 계정이 같은 주소를 열어 서로 다른
      트리를 본다. **이 회차에 공유 화면이 배선돼 화면에서 권한을 줄 수 있게 됐으므로 이제 성립한다.**
      harness 에 두 번째 계정을 받는 자리를 더해야 한다.
- [ ] **기준 11 — 삭제→복구 화면 왕복** — 완료 조건: 트리에서 삭제하고 휴지통 화면에서 복구하면
      원위치에 서고 버전 이력이 남아 있다. **삭제 배선은 이 회차에 이었다.**
- [ ] **기준 8 — `DataTransfer` 드래그와 clipboard paste** — 완료 조건: 실제 드롭과 붙여넣기로
      파일이 올라가고 `.res` 아래 해시 이름으로 저장된다. 아래 「함정」에 Playwright 제약을 적었다.
- [ ] **기준 3 — `[[` autocomplete 팝업** — 완료 조건: 편집기에 `[[` 를 치면 후보 팝오버가 뜨고
      키보드로 고를 수 있으며 고른 결과가 본문에 링크로 들어간다.

### 조건부

- [ ] **기준 2 의 인라인 다섯** — 위 「미결정」의 판정을 먼저 한다.

## 8. 다음 세션 지시서

1. `new-file`·`new-directory` 배선 → 검증: `screen-wiring.test.tsx` 의 `아직_닿지_않음` 에서
   두 줄을 지우고 `npx vitest run test/screen-wiring.test.tsx` 가 통과한다. 지우지 않으면
   「이제 닿는다 — 목록에서 그 줄을 지워라」는 안내와 함께 실패하므로, 그 실패가 곧 신호다.
2. 뮤테이션 탐침 → 검증: `DocumentTree.tsx` 의 해당 분기를 빼면 그 시험만 죽고 나머지 web
   스위트는 통과한다. **패키지 전체 스위트로 돌린다.**
3. 회귀 → 검증: `cd C:/Work/git/DocuLight2.0 && npm test` 가 exit 0.
   **`npm run typecheck` 와 동시에 돌리지 마라** (아래 함정 참조).
4. 브라우저 잔여 기준 4 착수 → 검증: 두 계정이 서로 다른 트리를 보는 것을 계산된 DOM 으로 잰다.

## 9. 거버넌스·게이트·함정

### 규칙

- **요구 변경은 speckiwi MCP 로만.** `docs/spec/*.srs.md` 를 손으로 고치지 않는다
- **새 요구는 `Stability=draft` 로 선다.** 사용자가 2026-08-29 에 「draft 를 evolving 으로 올려
  구현하는 것을 언제나 승인한다」고 지시했으므로 다시 묻지 않는다
- **결정은 서브에이전트에 위임한다** (2026-08-29 사용자 지시). 권장·추천이 붙어 있으면 1명이
  타당성만 검토하고 자동 결정, 없으면 5명 위원회
- **새 시험을 쓰면 뮤테이션 탐침을 돌린다** — 반드시 **패키지 전체 스위트**로
- **커밋 메시지에 AI 시그니처를 넣지 않는다.** 제목에 `Phase n`·`Step n` 같은 단계 표식도 금지
- 볼트는 개인 데이터 — 사본만 쓰고 본문을 로그·보고서에 싣지 않는다

### 이번 세션에 실제로 밟은 함정

- ⚠️ 미검증 — **`npm test` 와 `npm run typecheck` 를 동시에 돌리면 허위 실패가 난다.**
  (확인하려면 두 명령을 실제로 돌려야 하고 그 실행이 산출물을 만들어 워킹트리 주장을
  깨뜨리므로 검증에서 실행하지 않았다. 다음 세션이 겪으면 이 항목이 참임을 알게 된다.) 자원 경합으로
  editor 1항·server 1항·web 3항이 죽었다가 **직렬로 다시 돌리자 전부 통과**했다.
  독립 검증 서브에이전트도 같은 현상을 겪었다. **회피**: 순차로 돌린다.
- ⚠️ 미검증 (가리킨 시험 항 둘의 실재는 확인됐다) — **server 스위트에 간헐 실패가 둘 있다** — `test/app/reconciliation/resilience.test.ts` 의
  `REL-STORAGE-001 AC-4` 와 `test/app/watch/file-watch.test.ts` 의 `AC-1`. 회차마다
  나타났다 사라진다. **회피**: 단독으로 다시 돌려 재현되는지 먼저 본다.
- **KaTeX CSS 를 들이면 표 클릭이 한 줄 밀린다.** `.katex-display` 의 `margin: 1em 0` 이
  CM6 heightmap 에 들어가지 않기 때문이다. mermaid 에서 이미 겪은 결함이며 대책도 같다 —
  여백을 바깥 컨테이너의 `padding` 으로 옮긴다. **회피**: 블록 위젯에 margin 을 주지 않는다.
- **Playwright 의 `dispatchEvent` 로는 붙여넣기를 낼 수 없다.** playwright-core 번들 전체에
  `ClipboardEvent` 문자열이 0회이고 이벤트 종류 표에 `paste` 가 없어 일반 `Event` 로 만들어져
  `clipboardData` 가 버려진다. `drop` 은 `DragEvent` 로 매핑돼 있어 된다. **회피**:
  `page.evaluate` 안에서 `new ClipboardEvent('paste', { clipboardData })` 를 직접 만들어
  dispatch 한다. **그것이 실제로 핸들러에 닿는지는 확인하지 않았다 — 기준 8 착수 시 먼저 확인하라.**
- **python `print` 에 엠대시를 넣으면 콘솔 인코딩에서 터진다** (`cp949`). 파일 쓰기는 그 앞에서
  끝나므로 반영은 되지만 스크립트가 exit 1 로 나간다. **회피**: `print` 는 ASCII 로만 쓴다.
- ⚠️ 미검증 (그 오기는 이미 고쳐져 저장소에 남아 있지 않다) — **유니코드 이스케이프로 한글을 쓰면 틀리기 쉽다.** 이 회차에 「옮기면」이 「옷기면」이,
  「얹혀」가 「얻혀」가 됐다. **회피**: MCP 도구의 문자열 인자에 한글을 **직접** 쓴다 — 잘 들어간다.
- **로그인은 15분 창에 10회로 제한되고 web 검사 다섯이 한 번에 5회를 쓴다.** 한 창에 두 번은
  돌지 못한다. **회피**: API 서버를 재기동하면 in-memory limiter 가 즉시 초기화된다.
- **두 패키지의 브라우저 검사가 둘 다 기본으로 3399 를 본다.** **회피**: editor 데모를
  `npx vite --port 3401 --strictPort` 로 띄우고 `EDITOR_URL=http://localhost:3401/` 을 넘긴다.

### 테스트 실행 명령 (복붙 가능)

```bash
cd C:/Work/git/DocuLight2.0 && npm test            # editor 253+1skip / server 1343 / web 568
cd C:/Work/git/DocuLight2.0 && npm run typecheck   # exit 0 — 위와 동시에 돌리지 마라
```

브라우저 검사는 서버·web·계정이 필요하다. 그 절차는
`C:\Work\git\DocuLight2.0\docs\next\2026-08-30-browser-remainder.md` 의 「브라우저 검사를
돌리는 절차」에 복붙 가능한 형태로 있고 **지금도 유효하다**. 계정은 `e2e` /
`e2e-pass-2026` 이며 데이터 디렉터리는 세션 스크래치패드 아래 `e2e-data` 다.

## 10. 리스크·잔존 이슈

- **같은 부류의 배선 공백이 더 있을 수 있다.** 이 회차에 다섯을 찾았고 전부 「부품과 시험은
  있는데 진입점에서 도달하지 않는다」였다. 배선 감사가 보고한, 진입점에서 도달하지 않는
  컴포넌트가 아직 남아 있다 — `src/shell/RelocationDialog.tsx` 와 `src/acl/RelocationPreview.tsx`
  는 이 회차에 이었으나, `src/principal/OffboardingCard.tsx` · `src/workspace/WorkspaceList.tsx` 는
  그대로다. 영향: 화면에서 못 하는 조작이 더 있을 수 있다 / 대응: 같은 방식으로 감사한다.
- **`client.ts` 에 호출부 0건인 함수가 셋 남아 있다.** 배선 감사 시점(커밋 `c615f6a` 이전)에
  아홉이었고 이 회차에 **여섯**을 이었다 — `moveNodeToTrash`·`fetchShareView`·`grantShare`·
  `revokeShare`·`breakInheritance`·`inheritFromParent`. 남은 셋은 `fetchOffboarding`·
  `fetchAccessors`·`fetchMovePreview` 이며 이것은 추정이 아니라 실측이다.
  **`fetchMovePreview` 는 이 회차에 경로 문자열만 고쳤고(`move-preview` → `relocation-preview`)
  호출부는 여전히 0건이다** — `RelocationDialog` 의 `relocation` 소품이 optional 이고
  `AppShell` 이 그것을 넘기지 않으므로 이동·복사 화면에 접근자 프리뷰가 아직 서지 않는다.
  대응: 프리뷰를 세울 때 그 함수를 잇는다. 그때가 경로 정정이 실제로 시험되는 첫 순간이다.
- **editor 브라우저 검사를 커밋 `e0551c6` 이후 재실행하지 않았다.** 그 커밋이 `packages/editor` 를
  건드리지 않았으므로 영향이 없다고 **추정**한다. 대응: 다음 회차에 한 번 돌려 확인한다.
- **기계 밖 원격이 없다** — `origin` 은 같은 기계의 `B:` 드라이브다. 기계·디스크 장애에 사본이
  함께 사라진다. 대응: 원격 추가는 사용자 결정 사항이다.
