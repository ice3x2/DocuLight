# Phase 1 검증 후속 — 세션 핸드오프

## ⚠️ 이 문서의 검증 상태

**독립 검증 서브에이전트가 응답하지 않았다.** 세 번의 마감 요청에 유휴 알림만 왔고 판정 JSON 은 오지 않았다. 따라서 이 문서는 **제3자 검증을 거치지 않았다.**

대신 저자가 명령으로 직접 확인한 것 (2026-08-22 실행):

| 확인한 것 | 명령 | 결과 |
| --- | --- | --- |
| 이 문서가 언급한 파일·디렉터리 경로 32개 | `for f in ...; do [ -e "$f" ] \|\| echo MISSING; done` | MISSING 0건 |
| 이 문서가 언급한 커밋 해시 13개 | `git cat-file -e <hash>^{commit}` | MISSING 0건 |
| 브랜치·워킹트리 | `git rev-parse --abbrev-ref HEAD`, `git status --porcelain` | `master` / 이 핸드오프 문서와 `LATEST.md` 둘만 미커밋 |
| 코드 심볼 (`knownHashes`·`onState`·`too-large`·`parentLevel`·`DocuLight 변경`·`it.skip` 등) | `grep -c` | 전부 존재. `DOCULIGHT_WEB_ROOT` 는 0건(제거됨이 맞음) |
| SRS 무결성 | SpecKiwi MCP `validate_spec` | errors 0 / warnings 2 (둘 다 기존 경고) |

**아직 검증되지 않은 것**: 「기억과 실제가 달랐던 항목」 절의 세션 내 서술(무엇을 언제 잘못 적었는지)은 대화 기록에만 근거하며 저장소로 확인할 수 없다. 시험 통과 수치는 실행 명령과 시점이 적혀 있으나 제3자가 재실행하지 않았다.

---


| Field | Value |
| --- | --- |
| 작성일 | 2026-08-22 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 Phase 1 수용 기준 13개를 전건 통과시킨다 (11개 자동 · 2개 수동) |
| 현재 상태 | 워킹트리 clean. 이번 세션 커밋 12개(`c6a4299`~`86c883a`). 자동 시험 1117개 통과 / 1 건너뜀 |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` 와 그것이 가리키는 scope SRS 문서들 |
| 다음 세션 첫 행동 | 이 문서 §8 의 **B-1**(`trash-view.ts` 행 단위 권한 판정 검증)부터 시작 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 자율적으로 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git -C C:\Work\git\DocuLight2.0 status --porcelain` 로 워킹트리가 clean 인지 확인한다. 아니면 §3 과 어긋난 것이므로 사용자에게 한 줄로 알린다.
3. SpecKiwi MCP `get_active_target` 으로 활성 target 이 `phase-1` 인지 확인한다.
4. §8 의 **B-1** 부터 착수한다 — `C:\Work\git\DocuLight2.0\packages\server\src\app\trash\trash-view.ts` 의 행 단위 권한 판정이 `FR-SHELL-007` AC-6 · `SEC-SHELL-001` AC-3 을 실제로 만족하는지 검증. 검증은 서브에이전트로 돌린다(§9).

## 1. 최종 작업 목표

target `phase-1` 의 goal(SpecKiwi 에 기록됨): *"원장(`00.decision-log.md`) §4 Phase 1 수용 기준 13개를 전건 통과시킨다. 1번(실제 볼트 읽기·편집)과 7번(한글 IME)만 수동 검증이고 나머지 11개는 자동 검증한다."*

**완료 조건**: 수용 기준 13개 각각에 대해 (a) 자동 시험이 그것을 재고 있고 (b) 그 시험이 통과하며 (c) 해당 요구의 `#### Verification Evidence` 표에 그 시험이 적혀 있다. 1번·7번은 수동 검증 기록으로 대체한다.

## 2. 현재까지 완료한 작업

이번 세션 커밋 12개. `git -C C:\Work\git\DocuLight2.0 log --oneline c6a4299^..86c883a` 로 확인 가능.

- [x] 편집 없이 Ctrl+S 시 본문이 지워지던 치명 결함 — 커밋 `c6a4299`
- [x] 즐겨찾기·새 버전 올리기·이름 충돌 안내·태그 클릭 배선 — 커밋 `42844f3`
- [x] 휴지통 워크스페이스 필터·범위 토글, 백링크·아웃고잉 링크 패널 — 커밋 `2e06b12`
- [x] 위키링크 자동완성, shiki 코드 하이라이팅 — 커밋 `d9839cf`
- [x] 사용자·그룹 검색(cmdk), config 를 포트·docsRoot·DB 경로 셋으로 환원 — 커밋 `41f8f4e`
- [x] 서버 상태를 `@tanstack/react-query` 로 이행 — 커밋 `8ebb349`
- [x] 커서가 놓인 줄에서 목록 마커가 원문으로 돌아오게 — 커밋 `b273f4f`
- [x] 탭 재개방 시 저장 전 본문이 보이던 문제 — 커밋 `7dbe97b`
- [x] 요구 9건에 검증 증거 기록 — 커밋 `1ce93b2`
- [x] 1차 검증 결함 5건 — 커밋 `0170179`
- [x] 이미 열린 문서 재클릭 시 재요청 안 함 — 커밋 `a918519`
- [x] 2차 검증 결함 8건 — 커밋 `ed21ffa`
- [x] 트리 메뉴 만들기가 부모 권한을 보도록 — 커밋 `86c883a`

### 검증 (2026-08-22 실행)

| 명령 | 결과 |
| --- | --- |
| `NODE_ENV=development npm run typecheck` (cwd `C:\Work\git\DocuLight2.0`) | error 0 |
| `NODE_ENV=production npx vitest run --root packages/editor` | 232 passed / 1 skipped (233) |
| `NODE_ENV=production npx vitest run --root packages/server` | 639 passed |
| `NODE_ENV=production npx vitest run --root packages/web` | 246 passed |
| `NODE_ENV=development node <scratchpad>\boot-e2e.mjs` | OK 13 / FAIL 0 |
| `NODE_ENV=development node <scratchpad>\wave5-e2e.mjs` | OK 17 / FAIL 0 |

`<scratchpad>` = `C:\Users\beom\AppData\Local\Temp\claude\C--Work-git-DocuLight2-0\4b34ab60-585f-4904-81c1-4e8f0bfebd94\scratchpad`.
**⚠️ 이 두 E2E 스크립트는 저장소 밖 임시 디렉터리에 있다.** 세션 임시 디렉터리라 다음 세션에서 사라졌을 수 있다 — 없으면 저장소 안(`scripts/`)으로 옮겨 다시 만들 것.

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 세션 중 "`pushState` 가 1884번 불려 제품에 렌더 루프가 있다" 고 적었음 | **제품 루프가 아니었다.** 시험 하네스의 `vi.spyOn(window.history,'pushState')` 가 원본을 되불러 재귀한 것. 스파이가 원본을 부르지 않게 바꾸자 `NODE_ENV=production npx vitest run --root packages/web screen-wiring` 21개 전부 통과 |
| 세션 중 "CON-ARCH-006 가드를 이름 기반으로 바꿔 민감도가 올라갔다" 고 커밋 메시지에 적었음 | **절반만 맞았다.** 이름 기반 단독은 `useState<string>(serverBody)` 같은 형태를 놓친다. 2차로 두 판정의 합집합 + 자가시험으로 고쳤고(커밋 `ed21ffa` 이전 `0170179`), 그 자가시험이 `editorValue` 정규식의 `\b` 가 백스페이스 문자로 들어가 죽어 있던 것을 즉시 잡아냈다 |

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master`. `git status --porcelain` 결과 **비어 있음(clean)** — 2026-08-22 확인.
- 이 핸드오프 문서(`C:\Work\git\DocuLight2.0\docs\next\2026-08-22-phase1-verification-followup.md`)와 `C:\Work\git\DocuLight2.0\docs\next\LATEST.md` 는 이 문서를 쓰는 시점에 새로 생기므로, 다음 세션의 `git status` 에는 그 둘이 미커밋으로 보인다.
- 커밋 여부 판단: 이 핸드오프 문서는 커밋해도 되고 안 해도 된다. 코드는 전부 커밋되어 있다.

## 4. 관련 문서·코드 (절대경로)

`<REPO>` = `C:\Work\git\DocuLight2.0`

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| SSOT 진입점 | `<REPO>\docs\spec\00.index.md` | scope SRS 목록 |
| 원장 | `<REPO>\docs\spec\00.decision-log.md` | 수용 기준 13개의 정본 |
| 라이브 프리뷰 요소표 | `<REPO>\docs\spec\02.feature-request-live-preview.md` | §3.1 이 9종 요소의 커서 안/밖 표시를 정한다 |
| 셸 SRS | `<REPO>\docs\spec\08.app-shell.srs.md` | `FR-SHELL-*` · `SEC-SHELL-*` · `DR-SHELL-001` |
| 에디터 SRS | `<REPO>\docs\spec\07.editor.srs.md` | `FR-EDITOR-*` · `CON-EDITOR-*` |
| 아키텍처 SRS | `<REPO>\docs\spec\02.product-architecture.srs.md` | `CON-ARCH-*` |

**B 단계 조사 대상 코드**
- `<REPO>\packages\server\src\app\trash\trash-view.ts` — 행 단위 권한 판정
- `<REPO>\packages\editor\src\vendor\atomic-editor\wiki-links.ts` — 자동완성 선택·삽입
- `<REPO>\packages\editor\src\core\tag-decoration.ts` — `FR-EDITOR-007` AC-10·AC-12
- `<REPO>\packages\server\src\app\settings\instance-settings.ts` — `DR-SHELL-001` AC-1·AC-3
- `<REPO>\packages\server\package.json` · `<REPO>\packages\server\src\http\static-spa.ts` — 배포 산출물에 `packages/web/dist` 동봉 여부

**참고 선례**
- `<REPO>\packages\web\test\screen-wiring.test.tsx` — 조작에서 서버까지 잇는 배선을 재는 시험의 본보기
- `<REPO>\packages\server\test\app\document\link-service.test.ts` — 질의 횟수를 세어 `CON-ACL-001` AC-4 를 재는 시험

## 5. 확정된 결정 (변경 금지)

1. **착수 순서는 B → A → C** — **유력(미확정)**. (사용자가 "권장 착수 순서대로 진행" 이라고 지시했고 그 순서는 이 문서 §7 의 B·A·C 다. 저장소에 근거 문서는 없음)
2. **본문 채택 판정은 해시로 한다** — **확정**. (근거: `<REPO>\packages\web\src\document\DocumentSurface.tsx` 의 `knownHashes` ref 와 `<REPO>\packages\web\test\body-adoption.test.tsx`)
3. **탭 상태의 소유자는 `App` 하나다. `DocumentArea` 는 controlled** — **확정**. (근거: `<REPO>\packages\web\src\document\DocumentArea.tsx` 의 `state`/`onState` prop, `<REPO>\packages\web\test\support\document-area.tsx`)
4. **서버 상태는 react-query 가 든다. QueryClient 소유는 `App`** — **확정**. (근거: `<REPO>\packages\web\src\App.tsx`, `<REPO>\packages\web\src\api\queries.ts`)
5. **config 는 포트·docsRoot·DB 경로 셋만 담는다. `DOCULIGHT_WEB_ROOT` 는 없앴다** — **확정**. (근거: `<REPO>\packages\server\src\config\config.ts`, `<REPO>\packages\server\test\app\settings\instance-settings.test.ts`)
6. **업로드 크기 판정은 라우트가 아니라 서비스가 든다** — **확정**. (근거: `<REPO>\packages\server\src\app\document\new-version.ts` 의 `too-large` 규칙)
7. **위키링크는 이름이 겹치면 같은 워크스페이스의 것을 고른다** — **확정**. (근거: `<REPO>\packages\server\src\app\document\link-service.ts` 의 `outgoingOf`)
8. **트리 메뉴의 만들기는 `parentLevel` 을 본다** — **확정**. (근거: `<REPO>\packages\web\src\tree\tree-contract.ts` 의 `enabledMenuItems`)
9. **모든 검증은 서브에이전트로 한다** — **확정**. (근거: `C:\Users\beom\.claude\CLAUDE.md` §5)
10. **커밋 메시지에 AI 시그니처를 넣지 않는다** — **확정**. (근거: `C:\Users\beom\.claude\CLAUDE.md` §6)

## 6. 미결정·유예 항목

- **`새 문서`·`새 디렉토리` 가 어디에 만드는가** — 형제로 만드는지 그 디렉토리 안에 만드는지 어느 요구도 정하지 않았다. 지금 활성 판정은 `parentLevel`(형제 생성 전제)이고 실행 핸들러는 아직 없다. 결정 방법: 사용자 확인 또는 `FR-SHELL-003` 개정.
- **웹 시험 간헐 실패 1건** — `<REPO>\packages\web\test\surface-gaps.test.tsx` 의 `vi.stubGlobal('URL', ...)` 가 같은 파일 뒤 시험에 새는 것으로 **추정**. 2026-08-22 에 3회 연속 재현 실패. 결정 방법: 다시 나타나면 그때 원인 확정.

## 7. 남은 작업 전체 목록

### B. 미조사 영역 검증 (먼저)

- [ ] **B-1** `trash-view.ts` 행 단위 권한 판정 — 완료 조건: `FR-SHELL-007` AC-6 과 `SEC-SHELL-001` AC-3 을 재는 시험이 있고 통과
- [ ] **B-2** `wiki-links.ts` vendor 내부(후보 선택 → 본문 삽입) — 완료 조건: `CON-EDITOR-002` AC-1 의 삽입 동작을 재는 시험이 있고 통과
- [ ] **B-3** `tag-decoration.ts` — 완료 조건: `FR-EDITOR-007` AC-10·AC-12 를 재는 시험이 있고 통과
- [ ] **B-4** `DR-SHELL-001` AC-1·AC-3 — 완료 조건: 설정이 DB 에서만 오고 재기동 후 유지됨을 재는 시험이 있고 통과
- [ ] **B-5** 배포 산출물에 `packages/web/dist` 동봉 여부 — 완료 조건: 동봉되면 그 근거를, 안 되면 결함으로 기록

### A. 차단된 요구 4건

- [ ] **A-1** `FR-SHELL-013` (좌측 검색이 무엇을 검색하는가) — 완료 조건: `Status` 가 `blocked` 를 벗어나고 AC 를 재는 시험 통과 (의존성: 없음. 단 `FR-EDITOR-007` AC-11 후단이 이것에 의존)
- [ ] **A-2** `FR-SHELL-014` (검색 결과 권한 필터) — 완료 조건: 동일 (의존성: A-1)
- [ ] **A-3** `IR-SHELL-002` (설정 카테고리 미확정 항목) — 완료 조건: 동일
- [ ] **A-4** `OBS-AUDIT-011` (감사 로그 보존 규칙) — 완료 조건: 동일

### C. 증거 없는 implemented 31건

- [ ] **C-1** `SEC-AUTH-002`~`SEC-AUTH-016` 15건 — 완료 조건: 각 요구의 `#### Verification Evidence` 에 그것을 재는 시험 파일이 적힘
- [ ] **C-2** `SEC-ACL-001`·`SEC-ACL-002`·`CON-ACL-002`·`SEC-ACL-004`·`SEC-ACL-005`·`CON-ACL-004`·`SEC-ACL-007`·`SEC-ACL-009`·`SEC-ACL-010`·`SEC-ACL-011`·`SEC-ACL-013` 11건 — 완료 조건: 동일
- [ ] **C-3** `FR-AUTH-001`·`FR-AUTH-002`·`CON-PRINCIPAL-001`·`DR-PRINCIPAL-001`·`CON-PRINCIPAL-003` 5건 — 완료 조건: 동일

### D. 자동 검증이 닿지 않는 자리

- [ ] **D-1** `FR-EDITOR-007` AC-7 표의 「커서 올리면 원문」 — 완료 조건: Playwright 또는 실제 브라우저에서 확인하고 그 결과를 증거로 기록. 현재 `<REPO>\packages\editor\test\live-preview.test.tsx` 에 사유를 적어 `it.skip` 으로 남아 있음
- [ ] **D-2** 원장 §4 수용 기준 1번(실제 볼트 읽기·편집)·7번(한글 IME) — 완료 조건: 수동 검증 기록

### E. 소소한 잔존

- [ ] **E-1** `<REPO>\packages\web\src\principal\PrincipalSearch.tsx` 디바운스 없음 — 완료 조건: 디바운스 추가 또는 "불필요" 판정 기록
- [ ] **E-2** 노드 영구 삭제 후 `favorite` 표에 죽은 행이 남음 — 완료 조건: FK/CASCADE 추가 또는 "무해" 판정 기록
- [ ] **E-3** `<REPO>\packages\server\src\http\routes\workspace-api.ts` 의 `one()` 이 깊게 중첩된 JSON 배열에 500 — 완료 조건: JSON 본문에 `one()` 을 쓰지 않도록 바꾸거나 "허용" 판정 기록
- [ ] **E-4** 웹 시험 간헐 실패(§6) — 완료 조건: 원인 확정 후 격리

## 8. 다음 세션 지시서

**B 부터. B 는 이미 쓴 코드의 진위를 정하는 일이라 가장 싸고, 여기서 결함이 나오면 A·C 의 대상이 바뀐다.**

1. **B-1** — `FR-SHELL-007` AC-6 과 `SEC-SHELL-001` AC-3 을 MCP `get_requirement` 로 읽는다. `<REPO>\packages\server\src\app\trash\trash-view.ts` 와 `<REPO>\packages\server\test\app\trash\` 아래 시험을 대조한다. 없는 축이 있으면 실패 시험부터 쓴다.
   → 검증: 그 두 AC 를 이름으로 언급하는 시험이 존재하고 `NODE_ENV=production npx vitest run --root packages/server` 통과.
2. **B-2 · B-3** — 같은 방식으로 `CON-EDITOR-002` AC-1(삽입 동작)과 `FR-EDITOR-007` AC-10·AC-12.
   → 검증: `NODE_ENV=production npx vitest run --root packages/editor` 통과.
3. **B-4 · B-5** — `DR-SHELL-001` AC-1·AC-3, 그리고 `packages/server` 의 `files` 필드·빌드 산출물 확인.
   → 검증: 시험 통과 또는 결함 기록.
4. B 에서 나온 결함을 전부 닫는다 → 커밋 → **검증 서브에이전트 1기**를 동기로 띄워 그 커밋 범위를 적대적으로 검증한다(§9).
5. B 가 끝나면 **A-1**(`FR-SHELL-013`)로 넘어간다. A 는 새 기능이라 가장 비싸므로, 착수 전에 그 요구가 왜 `blocked` 인지부터 `get_requirement` 로 읽는다.
6. C 는 기계적이다. `add_verification_evidence` MCP 도구로 요구마다 한 줄씩 채운다.

## 9. 거버넌스·게이트·함정

### 지켜야 할 규칙

- **SpecKiwi 황금률**: MCP mutation(`add_verification_evidence` 등) 을 부른 뒤 **같은 SRS 파일에 `Edit` 도구를 쓰지 않는다.** mutation 이 이미 그 파일을 고쳤다.
- **검증은 서브에이전트로**. 자기 산출물을 자기가 검증하지 않는다. 검증자에게 내 결론을 넘기지 않는다.
- **커밋 메시지에 AI 시그니처 금지**. 커밋 후 `git log -1 --format="%B" | grep -ciE "co-authored|generated|claude|bot|noreply"` 가 0 이어야 한다.
- **TDD 강제**. 동작 변경은 실패 시험 먼저, red 확인 후 최소 구현.
- **`C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 읽기 전용.** 2.0 의 어떤 설정도 그 경로를 가리키지 않는다.
- 개발 서버 포트 **3399**(web), 3400(server dev API).

### 테스트 실행 명령 (복붙 가능)

```bash
cd C:/Work/git/DocuLight2.0
NODE_ENV=development npm run typecheck
NODE_ENV=production npx vitest run --root packages/editor
NODE_ENV=production npx vitest run --root packages/server
NODE_ENV=production npx vitest run --root packages/web
```

### 이번 세션에 실제로 밟은 함정

- **`NODE_ENV` 가 이 셸에 `production` 으로 박혀 있다.** `npm install` 이 devDependencies 를 건너뛴다. 설치가 필요하면 `NODE_ENV=development npm install --include=dev`.
- **`vitest` 는 `NODE_ENV=production` 으로 돌려야 한다.** `packages/editor/vite.config.ts` 와 `packages/web/vite.config.ts` 가 `mode==='test'` 일 때 `process.env.NODE_ENV='test'` 로 덮는다.
- **Python heredoc 으로 소스를 고치면 `\n`·`\b`·`\s` 가 실제 제어문자로 들어간다.** `\b` 가 백스페이스로 들어가 정규식이 조용히 죽은 적이 있다. 정규식·문자열 리터럴을 넣을 때는 `Edit` 도구를 쓰거나, 스크립트를 스크래치패드에 파일로 쓰고 `python3 <파일>` 로 실행한다.
- **`userEvent.keyboard` 에서 `[` 는 키 이름의 시작이다.** `[[` 를 치려면 `'[[[[' ` 라고 쓴다.
- **CodeMirror 에 커서를 올리는 시험**: `act(() => view.focus())` 를 **먼저**, `view.dispatch({selection})` 는 `act` **밖**에서. 순서를 바꾸거나 둘 다 `act` 안에 넣으면 표 위젯에서 "Calls to EditorView.update are not allowed while an update is in progress" 가 난다.
- **`vi.spyOn(window.history,'pushState')` 에서 원본을 되부르면 happy-dom 이 재귀한다.** 기록만 하고 원본을 부르지 않는다.
- **vendor 파일(`<REPO>\packages\editor\src\vendor\atomic-editor\`)을 고칠 때는 표식을 남긴다.** `inline-preview.ts` 의 목록 마커 분기에 "DocuLight 변경" 주석이 있다. 상류 병합에서 사라지면 같은 결함이 되돌아온다.
- **서브에이전트에게 임시 파일 위치를 못박는다** — `C:\Users\beom\AppData\Local\Temp\` 아래에만. 저장소 안에 프로브 파일을 만들면 `architecture-contract.test.ts` 같은 소스 스캔 시험이 그것을 위반으로 잡는다.

## 10. 리스크·잔존 이슈

- **E2E 스크립트 2개가 저장소 밖에 있다** — 영향: 다음 세션에서 사라지면 `boot-e2e` 13검사·`wave5-e2e` 17검사를 잃는다 / 대응: 발견 즉시 `<REPO>\scripts\` 로 옮기고 커밋.
- **`linksOf` 는 문서를 열 때마다 접근 가능한 md 를 전부 디스크에서 읽는다** — 영향: 문서 수가 수천 개면 열기가 느려진다. 질의 횟수는 문서 수와 무관하게 만들었으나(`<REPO>\packages\server\test\app\document\link-service.test.ts` 가 문서 2개·22개 모두 12회임을 잰다) **파일 읽기 횟수는 여전히 문서 수에 비례한다** / 대응: 링크 색인이 필요해지면 그때 도입. 색인을 두면 본문과 어긋날 자리가 생기므로 지금은 본문이 유일한 정본이다.
- **`FR-EDITOR-007` AC-11 후단이 검증 불가능하다** — 조항이 "우측 태그 탭에서 클릭했을 때와 같은 결과다" 라고 하는데 우측 태그 탭이 아직 자리표시자(`<p>태그</p>`)라 비교 대상이 없다 / 대응: A-1(`FR-SHELL-013`) 이후에 다시 본다.
- **`Status=implemented` 인데 증거가 없는 31건** — 영향: "구현했다"는 주장의 출처가 제품 어디에도 없다 / 대응: C 단계에서 채운다.
