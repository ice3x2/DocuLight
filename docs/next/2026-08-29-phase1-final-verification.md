# Phase 1 최종 검증 — 세션 핸드오프

> ## 검증 상태
>
> **검증 서브에이전트가 판정을 반환하지 않았다 — 이 문서는 독립 검증을 거치지 않았다.** 띄운 뒤 idle 알림이 왔으나 판정 JSON 이 오지 않았고, 재촉한 뒤에도 같았다. 받지 못한 보고의 내용은 어느 것도 인용하지 않았다.
>
> 대신 **작성자가 기계로 대조한 것**은 다음과 같다(2026-08-29 실행).
>
> | 무엇 | 명령 | 결과 |
> | --- | --- | --- |
> | 이 문서가 가리키는 경로 25개 | `test -e` | 전건 실존 |
> | 커밋 해시 9개 | `git cat-file -e` | 전건 실존 |
> | 라인 참조 7곳 (원장 690·712행 · 화면 설계 1335·829행 · `workspace-api.ts` 99행 · `vite.config.ts` 75행 · `search-service.test.ts` 235행) | `sed -n` · `grep -n` | 전건 일치 |
> | `packages/web` 브라우저 검사 0개 · `packages/editor` 4개 | `ls` · `wc -l` | 일치 |
> | `in_progress` 요구 둘(`FR-SHELL-013` · `SEC-STORAGE-007`) | MCP `list_requirements` | 일치 |
> | 브랜치 · 원격 차이 | `git rev-parse` · `git rev-list` | 일치 |
>
> **대조하지 못한 것**: 「확정된 결정」 열 항목이 저장소 근거와 어긋나지 않는지는 사람의 판단이 필요해 기계로 대조하지 못했다. 다음 세션이 그 절을 읽을 때 근거 괄호에 적힌 출처(제약 번호 · `waves.jsonl` 의 `decision` 객체 · 코드 경로)를 한 번 확인하라.
>
> 「이번 세션에 실제로 밟은 함정」 표의 여덟 행 중 다섯은 세션 진행 중의 도구 사용 사건이라 저장소에 기록이 없다. ⚠️ 미검증 — 그대로 믿기보다 **같은 상황이 오면 회피 방법을 시도해 보는 용도**로 읽어라. 나머지 셋(부하로 인한 타임아웃 · 술어가 조항보다 넓었던 것 · AC 대조 오류)은 저장소의 코드·시험·SRS Change Notes 로 확인할 수 있다.

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-29 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 Phase 1 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | 요구 구현은 거의 닫혔다(`newWorkCandidates` **2**). 남은 몸통은 **검증 기반**이다 — 13개 중 8개가 Playwright E2E 를 요구하는데 `packages/web` 에 브라우저 검사가 **하나도 없다** |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` §4 (690~712행, 수용 기준 13개 표) + `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` (진행 상태) |
| 다음 세션 첫 행동 | 수용 기준 13개 각각에 대해 「이미 재는 시험이 있는가」를 대조표로 만든다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 둘만 읽고** 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

`<REPO>` = `C:\Work\git\DocuLight2.0` 로 줄여 쓴다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git status --porcelain` 이 **비어 있는지** 확인한다. 이 문서를 커밋하기 전이면 이 파일 하나만 있어야 한다.
3. `<REPO>\docs\spec\00.decision-log.md` 의 **690~712행**을 읽는다 — 수용 기준 13개의 원문과 각각의 검증 방법이 그 표에 있다.
4. **13개 대조표를 만든다.** 기준마다 ⓐ 이미 그것을 재는 시험이 있는가 ⓑ 있다면 그 파일과 항 이름 ⓒ 없다면 무엇으로 재야 하는가. 이 표가 없으면 없는 시험을 새로 쓰면서 이미 있는 것을 또 쓴다.
5. 그 표가 서면 「남은 작업 전체 목록」 절의 순서대로 진행한다.

---

## 1. 최종 작업 목표

원장 `<REPO>\docs\spec\00.decision-log.md` §4 의 **수용 기준 13개를 전건 통과**시킨다. 그 절이 스스로 「아래 13개가 모두 통과하면 Phase 1 을 종료한다」고 선언하므로 이것이 종료 판정의 전량이다.

검증 방법의 분포는 그 표가 정한다.

| 방법 | 개수 | 번호 |
| --- | --- | --- |
| Playwright E2E | **8** | 2 · 3 · 4 · 6 · 8 · 10 · 11 · 12 |
| 통합 테스트 | 3 | 5 · 9 · 13 |
| 수동 검증 | 2 | 1(실제 볼트 읽기·편집) · 7(한글 IME) |

**완료 조건**: 13개 각각에 대해 판정 근거가 기록되고, 자동 검증 가능한 11개가 실제로 도는 시험을 갖는다.

`verified` 일괄 승급은 **이 run 의 범위가 아니다** — 제약 C-07 이 wave 실행 중 금지하며 최종 검증 통과 후 별도 세션의 몫이다.

---

## 2. 현재까지 완료한 작업

### 이번 세션 (2026-08-28 ~ 08-29)

- [x] **wave-4(1.0 이행) 완주** — 커밋 `ae89b63` · `de5b9f8` · `d92d206`
  - `MIG-AUTH-002` AC 5/5, `MIG-AUTH-001` AC 5/5 → 둘 다 `implemented`
  - 신규: `<REPO>\packages\server\src\migrate.ts`(일회성 진입점) · `src\app\migration\` 둘 · `src\domain\migration\legacy-accounts.ts` · `src\domain\ports\legacy-content.ts` · `src\infra\fs\legacy-content-importer.ts`
  - 운영 절차 런북: `<REPO>\docs\ops\1.0-freeze-and-cutover.md`
- [x] **wave-5(REST 표면 은닉·딥링크)** — 커밋 `44df07d` · `e3e6b0d` · `90ca409` · `1bea8f8`
  - `SEC-ACL-006` AC 6/6 → `implemented`
  - `CON-ARCH-002` AC 8/8 → `implemented`
  - 신규 시험: `<REPO>\packages\server\test\http\legacy-rest-acl.test.ts` · `<REPO>\packages\web\test\deep-link-hiding.test.tsx`
- [x] **정정 회차** — 커밋 `201e4d2` · `2953927`
  - `FR-SHELL-013` 을 `implemented`(12/12) 에서 **`in_progress`(10/12) 로 되돌렸다**
  - 신규 시험: `<REPO>\packages\web\test\search-wiring.test.tsx`(4항)
- [x] **이월 잔여 `R-LOAD-FLAKE` 해소** — 원인은 vitest 기본 5초 타임아웃이었다. `<REPO>\packages\web\vite.config.ts` 에 `testTimeout: 20_000`, `<REPO>\packages\server\test\app\document\search-service.test.ts` 의 PDF 항에 `20_000` 을 주었다. 단언은 바꾸지 않았다
- [x] **푸시** — `git push origin master` 실행. 실행 후 `git rev-list --left-right --count origin/master...HEAD` 결과 `0 0`

### 검증 실행 기록 (명령과 시점)

| 무엇 | 명령 | 시점 | 결과 |
| --- | --- | --- | --- |
| 전체 회귀 | `cd /c/Work/git/DocuLight2.0 && npm test` | 2026-08-28, 커밋 `201e4d2` 직전 | **exit 0** · editor 253 통과·1 건너뜀 / server 1324 통과 / web 534 통과 · 실패 0 |
| 타입 검사 | `cd /c/Work/git/DocuLight2.0 && npm run typecheck` | 같은 시점 | exit 0 · 오류 **0** |
| SRS 검증 | `cd /c/Work/git/DocuLight2.0 && npx speckiwi validate` | 같은 시점 | 오류 **0** · 경고 **1**(`SRS-W072`, 선재) |

**브라우저 시험은 이 세션에서 한 번도 실행하지 않았다.** 작업이 서버·web 유닛 축이라 editor 라이브 프리뷰를 건드리지 않았다.

### 요구 상태 (2026-08-29 MCP `summarize_target` 기준)

`implemented` 233 · `verified` 18 · `in_progress` 2 · `planned` 6 · `blocked` 5 · 합계 253.

`newWorkCandidates` 는 **둘**이다 — `FR-SHELL-013` 과 `SEC-STORAGE-007`.

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 「`FR-SHELL-013` AC 12/12 전건 체크」(이 세션이 한 번 그렇게 올렸다) | **틀렸다.** 그 판정은 시험 항 이름과 AC 문면을 대조했을 뿐 각 항이 무는지를 AC-1 외에 확인하지 않았다. `App.tsx` 의 `axesFrom(readAxes())` 를 끊고 `npx vitest run` 을 web 에서 돌리자 534항이 통째로 통과했다 — AC-7 이 재어지지 않았다는 뜻이다. 지금은 10/12 이고 status 는 `in_progress` 다 |
| 「서브에이전트 셋이 응답하지 않았다」 | **무응답이 아니라 지연이었다.** 종료 보고 뒤에 셋 다 판정을 보냈고 그중 하나가 위 오류를 잡았다 |
| 「푸시하면 사본이 생긴다」(내가 그렇게만 적었다) | **불완전했다.** 원격 `B:/work/git/DocuLight2.0.git` 는 네트워크 매핑이 아니라 **같은 기계의 로컬 드라이브**다(독립 조사가 `Get-PSDrive` 로 확인 — `DisplayRoot` 없음). 기계·디스크 장애에는 보호가 되지 않는다 |

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master` — origin 대비 **behind 0 / ahead 0**(커밋 `2953927` 시점에 `git rev-list --left-right --count origin/master...HEAD` 로 확인). 그 뒤 이 핸드오프 문서를 커밋하면 ahead 가 늘어난다
- 미커밋 파일: 이 문서(`<REPO>\docs\next\2026-08-29-phase1-final-verification.md`)와 `<REPO>\docs\next\LATEST.md` 둘. 그 밖에는 없다
- 원격: `origin` = `B:/work/git/DocuLight2.0.git`. **같은 기계의 로컬 드라이브다** — 기계 밖 원격은 등록되어 있지 않다

---

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 수용 기준 SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` | **§4 는 690~712행**. 13개 기준의 원문과 검증 방법 |
| 진행 상태 SSOT | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | wave 별 상태·잔여·결정 (append-only). 마지막 줄이 이 세션의 정정 기록 |
| 제약 14건 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-24.doculight2.phase1-remaining\constraints.json` | 이 run 의 사용자 제약 |
| 실행 순서 | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` | wave 별 범위와 설계 기준선 |
| 1.0 이행 런북 | `C:\Work\git\DocuLight2.0\docs\ops\1.0-freeze-and-cutover.md` | 이 세션이 새로 쓴 운영 절차. `MIG-AUTH-001` AC-1·AC-2 와 `CON-ARCH-002` AC-8 의 증거 |
| 화면 설계 | `C:\Work\git\DocuLight2.0\docs\spec\03.screen-design-shell.md` | 딥링크 404 문구는 **1335행**, 탭 유지 규칙은 **829행** |
| 직전 핸드오프 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-28-wave3-done-wave4.md` | wave-3 종료 시점 |

**브라우저 시험의 유일한 선례** (editor 패키지):

- `C:\Work\git\DocuLight2.0\packages\editor\test\browser-check.mjs` — Mermaid 라이브 프리뷰
- `C:\Work\git\DocuLight2.0\packages\editor\test\table-reveal-check.mjs` — 표 원문 드러내기
- `C:\Work\git\DocuLight2.0\packages\editor\test\heightmap-drift-check.mjs` — 위젯 기하 어긋남
- `C:\Work\git\DocuLight2.0\packages\editor\test\tag-chip-check.mjs` — 태그 칩의 **계산된 스타일**

네 개를 한 번에 도는 명령은 저장소 루트에서 `npm run test:browser:all` 이다. `playwright` 1.62.1 과 chromium 바이너리는 `<REPO>\packages\editor\node_modules` 에 있다(루트가 아니다).

**이번 세션이 만든 시험** (다음 세션이 확장할 자리):

- `C:\Work\git\DocuLight2.0\packages\server\test\http\legacy-rest-acl.test.ts` — REST 표면 셋의 권한 필터
- `C:\Work\git\DocuLight2.0\packages\web\test\deep-link-hiding.test.tsx` — 딥링크 은닉. `App` 을 렌더하고 fetch 를 스텁하는 패턴
- `C:\Work\git\DocuLight2.0\packages\web\test\search-wiring.test.tsx` — **나가는 요청을 관측하는** 패턴. 화면과 서버 사이 배선을 재는 자리에 재사용하라

---

## 5. 확정된 결정 (변경 금지)

1. **wave target 을 새로 만들지 않는다** — `phase-1` 위에서 요구를 좁힌다. **확정**. (근거: 제약 C-01)
2. **요구 변경은 speckiwi MCP 로만 한다** — `docs/spec/*.srs.md` 를 손으로 고치지 않는다. **확정**. (근거: 제약 C-06)
3. **커밋 메시지에 AI 시그니처·단계 표식을 넣지 않는다.** **확정**. (근거: 제약 C-09, 전역 `CLAUDE.md` §6)
4. **1.0 저장소(`C:\Work\git\DocuLight\DocLight`)는 읽기 전용이며 수정 금지.** **확정**. (근거: 제약 C-02)
5. **1.0 동결은 운영 절차 문서로 성립한다. 서비스 중단·프록시 차단은 쓰지 않는다.** **확정**. (근거: 제약 C-03, `waves.jsonl` 결정 `D-W4-02`, 런북 `docs/ops/1.0-freeze-and-cutover.md` §0)
6. **아카이브·복원은 phase-2 다** — `SEC-STORAGE-007` AC-3 을 이 run 에서 닫지 않는다. **확정**. (근거: 제약 C-04, 원장 R165)
7. **이행 도구는 제품 조립에 넣지 않는다.** 진입점은 `<REPO>\packages\server\src\migrate.ts` 하나이고, 조립 방벽이 그 도달을 별도 항으로 잰다. **확정**. (근거: `MIG-AUTH-001` AC-3, `waves.jsonl` 결정 `D-W4-03`)
8. **`SEC-ACL-006` 은 「권한 없는 노드에 대한 응답」만 덮는다.** 볼 수는 있으나 편집은 못 하는 경우의 403 은 위반이 아니다 — 그 사람은 존재를 이미 알아 열거 오라클이 서지 않는다. **확정**. (근거: 그 요구의 Requirement 문면, `<REPO>\packages\server\src\http\routes\workspace-api.ts` 92~101행의 정책 주석)
9. **오케스트레이터 게이트는 묻지 않고 승인하며 권장안을 고른다.** **확정**. (근거: `<REPO>\CLAUDE.md` 「Gate decisions」 절)
10. **작업이 끝나 사용자 입력을 기다릴 때 doculight 로 짧게 보고한다.** **확정**. (근거: `<REPO>\CLAUDE.local.md`)

---

## 6. 미결정·유예 항목

### 기계 밖 원격을 둘 것인가

지금의 `origin` 은 같은 기계의 `B:` 드라이브라 기계·디스크 장애에 사본이 함께 사라진다. **사용자 결정 사항이며 임의로 추가하지 마라.** 결정 방법: 사용자에게 묻는다.

### 원장 §4 가 인증 축을 빠뜨린 문제

원장 §4 의 인용 블록이 스스로 밝힌다 — 로그인(`R57`·`R60`·`R60-b`) · 로그아웃(`R145`) · 비밀번호 변경(`R144`) 중 어느 것도 13개에 없어서 「로그인할 수 없는 빌드도 이 관문을 통과」한다. 원장이 **판단하지 않고 열어 두었고**, 다음 개정에서 ① 기준을 추가할지 ② 추가하지 않을 사유를 남길지 판정하라고 적었다. 결정 방법: 사용자 확인. 이 판정 없이 13개만 통과시켜도 §4 의 문면은 만족한다.

### `FR-SHELL-013` AC-5 의 「검색창 오른쪽」을 무엇으로 잴 것인가

배치는 jsdom 이 재지 못한다. 결정 방법: 브라우저 검사가 서면 계산된 위치로 잰다(`tag-chip-check.mjs` 가 계산된 스타일을 재는 선례다). 그전에는 열어 둔다.

---

## 7. 남은 작업 전체 목록

### A. 수용 기준 13개 대조 (가장 먼저)

- [ ] **13개 × 「이미 재는 시험이 있는가」 대조표** — 완료 조건: 기준마다 ⓐ 판정 ⓑ 근거 시험의 절대경로와 항 이름 ⓒ 없으면 무엇이 필요한지가 적힌 표. **통합 테스트 셋(5·9·13)은 이미 서버 시험이 상당 부분 덮을 가능성이 있다** — 예컨대 기준 9 의 「전역 API Key 로는 어떤 요청도 성립하지 않는다」는 `<REPO>\packages\server\test\http\legacy-credentials.test.ts` 가 이 세션에서 세웠다. 새로 쓰기 전에 대조하라

### B. web 브라우저 검사 기반 (E2E 8개의 전제)

- [ ] **`packages/web` 에 브라우저 검사를 세운다** — 완료 조건: editor 의 `*-check.mjs` 넷과 같은 모양의 스크립트가 `packages/web` 에서 돌고 `npm run test:browser` 계열로 등록된다. 지금 그 패키지에 브라우저 검사가 **0개**다
- [ ] `FR-SHELL-013` **AC-5**(필터 버튼이 검색창 오른쪽) — 완료 조건: 계산된 위치로 재는 항이 서고 체크
- [ ] `FR-SHELL-013` **AC-12**(목록이 실제로 스크롤) — 완료 조건: 계산된 `overflow` 로 재는 항이 서고 체크. 지금 시험은 `data-scroll="y"` 표지 속성만 본다
- [ ] `FR-SHELL-013` → `implemented` — 완료 조건: AC 12/12 (의존성: 위 둘)

### C. 자동 검증 11개

- [ ] 기준 2·3·4·6·8·10·11·12 (Playwright E2E 8개) — 완료 조건: 각각 도는 시험과 판정 근거 (의존성: B)
- [ ] 기준 5·9·13 (통합 테스트 3개) — 완료 조건: 각각 도는 시험과 판정 근거. **A 의 대조에서 이미 있는 것으로 판정되면 그 사실을 근거로 기록하고 넘어간다**

### D. 수동 검증 2개 — 사용자 확인 필요

- [ ] 기준 1(실제 볼트를 넣고 브라우저에서 읽기·편집) — 완료 조건: 사용자가 결과를 확인해 줌. **볼트는 개인 데이터다. 사본만 쓰고 본문을 로그·보고서에 싣지 마라**
- [ ] 기준 7(한글 IME 조합이 편집 중 깨지지 않음) — 완료 조건: 사용자가 체크리스트를 확인해 줌

### E. 이월 잔여 (wave 밖)

- [ ] `SEC-STORAGE-007` AC-3 — 제약 C-04 로 **phase-2**. 이 run 에서 닫지 않는다
- [ ] `R-W4-INDEX-UNWIRED` — 문서 저장 경로가 `indexNode` 를 부르지 않아 색인이 **이행 시점에만** 선다. 새로 쓰거나 고친 문서는 의미 검색에 안 잡힌다. 조립 방벽 허용목록의 `app/search/index-node.ts` 가 그 자리를 표시한다
- [ ] `R-W3-EMBEDDING-LEXICAL` — 의미 검색이 학습된 임베딩이 아니라 문자 n-gram 이다. 「매출」과 「수익」이 가깝지 않다. phase-2
- [ ] `R-W3-PAT-SURFACE` — PAT 발급·폐기의 사용자 표면이 없다. `SEC-AUTH-005` 의 축
- [ ] `R-FND-101` — `packages/web` 이 editor 스타일을 하나도 import 하지 않아 `FR-EDITOR-007` 의 증거가 제품 화면에 닿지 않는다
- [ ] `R-CHANGENOTE-GAP` · `R-IMPLNOTE-1` · `R-W2-NOTE-DATE-DUP` — SRS 본문의 낡은 서술. **고칠 MCP 경로가 없어 사용자 승인이 필요하다**
- [ ] `R-SELTOUCH-AXIS` — 경계 포함 성질을 자동으로 지키는 축이 수식·표·태그 셋뿐이다
- [ ] `R-W4-MIGRATION-UNRUN` — 이행 도구를 실제 1.0 데이터에 대고 돌린 적이 없다. 실제 이행은 운영 시점에 런북대로 한다

---

## 8. 다음 세션 지시서

1. **수용 기준 13개 대조표를 만든다.**
   - `<REPO>\docs\spec\00.decision-log.md` 690~712행을 읽는다.
   - 기준마다 `grep -rn` 으로 관련 시험을 찾아 대조한다.
   - → 검증: 13행짜리 표가 서고, 각 행에 「있음(경로+항 이름)」이나 「없음(필요한 것)」이 적혀 있다.
2. **`packages/web` 브라우저 검사 기반을 세운다.**
   - `<REPO>\packages\editor\test\tag-chip-check.mjs` 의 모양을 따른다 — 계산된 스타일을 재는 선례다.
   - dev 서버는 `npm run dev` (루트, web 앱, 포트 3399). editor 데모와 **다른 앱**이므로 헷갈리지 마라.
   - → 검증: `packages/web` 에서 브라우저 검사가 하나 이상 돌고 종료 코드 0.
3. **`FR-SHELL-013` AC-5·AC-12 를 닫는다.**
   - → 검증: 두 AC 가 체크되고 status 가 `implemented`. `npx speckiwi validate` 오류 0.
4. **자동 검증 11개를 채운다.** 1번 대조표에서 「없음」으로 나온 것부터.
   - → 검증: 기준마다 도는 시험이 있고 그 근거가 기록됐다.
5. **수동 2개를 사용자에게 요청한다.**
   - → 검증: 사용자가 결과를 알려 주면 그것을 판정 근거로 기록한다.

---

## 9. 거버넌스·게이트·함정

### 규칙

- **TDD 강제**: 동작 변경은 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green 을 만든다 (제약 C-11).
- **요구 없이 코드를 고치지 않는다** (제약 C-12).
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다** (제약 C-14). **반드시 해당 패키지 전체 스위트로 재라.**
- **조립 방벽**: 새 서비스는 `main.ts` 에서 도달해야 한다. 도달하지 않는 것을 허용목록에 넣으려면 사유에 요구 ID(`XXX-YYY-000`)나 원장 조항(`R000`)이 들어가야 한다 — 파일명은 참조로 치지 않는다.
- 개발 서버 포트: web **3399** · server dev API **3400** (제약 C-13).

### 이번 세션에 실제로 밟은 함정

| 함정 | 회피 방법 | 확인 |
| --- | --- | --- |
| **AC 를 시험 항 이름과 대조만 하고 체크했다.** 12개를 한 번에 올리면서 탐침을 하나에만 돌렸고, 실제로는 넷이 재어지지 않고 있었다 | **AC 를 체크하기 전에 그 AC 를 겨눈 탐침을 돌려라.** 여러 개를 한 번에 올릴수록 위험하다 | 이 세션에서 실측 — `readAxes()` 를 끊어도 web 534항이 통째로 통과했다 |
| **시험 술어가 조항보다 넓었다.** 라우터 전체의 403 을 금지해 정당한 정책을 위반으로 잡았다 | 조항의 **문면이 무엇을 덮는지** 먼저 확인하고 술어를 그 범위로 좁혀라 | 이 세션에서 2회(403 술어 · AI 경계 술어) |
| **Bash 힙독 안 파이썬·TS 에서 `\\` 이탈이 풀려 정규식이 깨졌다** | 스크립트를 **`Write` 도구로** scratchpad 에 쓰고 `python <파일>` 로 실행한다. 짧으면 `chr(92)` 우회 | 이 세션에서 3회 |
| **힙독 자체가 깨져 파일이 아예 안 만들어졌다** | 긴 스크립트는 `Write` 도구를 쓴다. 힙독 뒤에는 `ls` 로 파일 생성을 확인한다 | 이 세션에서 1회 |
| **`cd packages/server` 뒤 다음 Bash 호출의 cwd 가 유지됐다** | 매번 절대 경로부터 시작한다 — `cd /c/Work/git/DocuLight2.0/packages/server && npx vitest run` | 이 세션에서 1회 |
| **부하가 시험을 죽였다.** 시험 파일이 하나 늘자 5초 경계의 항들이 넘어갔고, 타임아웃이 `cleanup` 을 막아 남은 DOM 이 다음 항을 깨뜨리는 연쇄가 됐다 | 단독 실행으로 갈라 보라. 단독 통과·전체 실패면 부하다. 창을 넓히되 단언은 바꾸지 마라 | 이 세션에서 규명 — `R-LOAD-FLAKE` 를 이것으로 닫았다 |
| **서브에이전트가 무응답인 줄 알았는데 지연이었다** | 재촉 뒤 **한 턴 더 기다려라.** 이 저장소가 일곱 번 「무응답」으로 기록한 것이 실은 지연일 수 있다 | 이 세션에서 실측 — 종료 보고 뒤 셋 다 도착했고 그중 하나가 오류를 잡았다 |
| **`append_section_note` 가 날짜를 자동으로 붙인다** | 본문에 날짜를 쓰지 마라. 쓰면 `[2026-08-28] [2026-08-28]` 이 된다 | 잔여 `R-W2-NOTE-DATE-DUP` 이 그 중복이다 |

### 테스트 실행 명령 (복붙 가능)

```bash
cd /c/Work/git/DocuLight2.0 && npm test
cd /c/Work/git/DocuLight2.0 && npm run typecheck
cd /c/Work/git/DocuLight2.0 && npx speckiwi validate
cd /c/Work/git/DocuLight2.0/packages/server && npx vitest run
cd /c/Work/git/DocuLight2.0/packages/web && npx vitest run
cd /c/Work/git/DocuLight2.0 && npm run test:browser:all
```

브라우저 시험은 **editor 데모 서버가 떠 있어야** 돈다: `npm run dev --workspace @doculight/editor`. 루트 `npm run dev` 는 **web 앱**이라 다른 화면을 잰다. 둘 다 포트 3399 를 쓰므로 하나만 뜰 수 있다.

---

## 10. 리스크·잔존 이슈

- **E2E 8개가 브라우저 검사 기반에 걸려 있다.** `packages/web` 에 브라우저 검사가 0개이므로, 그 기반을 세우기 전에는 수용 기준 8개를 닫을 수 없다. 영향: 남은 작업의 대부분이 이 하나에 직렬로 매달린다. 대응: 그것을 첫 작업으로 두어라.
- **사본이 이 기계를 벗어나지 못한다.** `origin` 이 같은 기계의 `B:` 드라이브다. 영향: 기계·디스크 장애에 저장소가 함께 사라진다. 대응: 기계 밖 원격 추가는 사용자 결정이다.
- **의미 검색이 이행 시점에만 색인된다.** 새로 쓰거나 고친 문서는 검색에 안 잡힌다(`R-W4-INDEX-UNWIRED`). 영향: 실사용에서 「검색이 안 된다」로 드러난다. 대응: 저장 경로에 `indexNode` 를 거는 작업.
- **이행 도구를 실제 데이터로 돌린 적이 없다.** 시험은 임시 디렉터리에서만 돌았다. 영향: 실제 1.0 볼트의 형태가 시험 픽스처와 다르면 그 자리에서 드러난다. 대응: 운영 시점에 런북대로 하되 먼저 사본으로 시험한다.
- **원장 §4 에 인증 축의 수용 기준이 없다.** 원장이 스스로 「로그인할 수 없는 빌드도 이 관문을 통과한다」고 적었다. 영향: 13개를 다 통과해도 로그인이 깨져 있을 수 있다. 대응: 최종 검증 때 그 사실을 함께 보고하라.
