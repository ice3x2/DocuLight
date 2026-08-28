# wave-3 종료와 wave-4 실행 — 세션 핸드오프

> ## 검증 상태
>
> **검증 서브에이전트가 판정을 반환하지 않았다.** 이 세션에서 다섯 번째 무응답이며, 이전 회차들과 같은 양상(idle 알림만 오고 결과 JSON 이 오지 않음)이다. 받지 못한 보고의 내용은 어느 것도 인용하지 않았다.
>
> 대신 **기계적으로 대조한 것**은 다음과 같다(2026-08-28 실행).
>
> | 무엇 | 명령 | 결과 |
> | --- | --- | --- |
> | 이 문서가 가리키는 경로 20개 | `test -e` | 전건 실존 |
> | 커밋 해시 9개 | `git cat-file -e` | 전건 실존 |
> | 라인 참조 둘 (실행 순서 문서 74행 · `arag-probe.md` 524행) | `sed -n` · `wc -l` | 일치 |
> | 코드 심볼 다섯 (`indexNode` · `issueToken` · `authenticateToken` · `createOrOverwrite` · `embed`) | `grep -c` | 전건 실존 |
> | wave-3 요구 7건의 status 와 AC 체크 수 | `npx speckiwi show --json` | 문서 서술과 일치 |
> | `newWorkCandidates` 6건 | MCP `list_requirements` | 문서의 이월 목록과 일치 |
> | git 상태 (브랜치 · clean · behind 0) | `git status --porcelain` · `git rev-list` | 일치 |
>
> **대조하지 않은 것**: 「확정된 결정」 열한 항목이 저장소 근거와 어긋나지 않는지는 사람의 판단이 필요해 기계로 대조하지 못했다. 다음 세션이 그 절을 읽을 때 근거 괄호에 적힌 출처(제약 번호·`waves.jsonl` 의 `decision` 객체)를 한 번 확인하라.
>
> 「이번 세션에 실제로 밟은 함정」 표의 아홉 행 중 여섯은 세션 진행 중의 도구 사용 사건이라 저장소에 기록이 없다. ⚠️ 미검증 — 그대로 믿기보다 **같은 상황이 오면 회피 방법을 시도해 보는 용도**로 읽어라. 나머지 셋(`kind` CHECK 제약 · `Actor.id` · 새 문서의 빈 파일 선행)은 저장소 코드로 확인했다.


| Field | Value |
| --- | --- |
| 작성일 | 2026-08-28 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 Phase 1 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | wave-1·2·3 종료(complete) · **wave-4 진입 행만 기록, 구현 0** |
| SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` (실행 순서) + `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` (진행 상태) |
| 다음 세션 첫 행동 | `MIG-AUTH-001` AC-1 의 판정 방식을 정한 뒤 wave-4 를 TDD 로 구현한다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 둘만 읽고** 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

`<REPO>` = `C:\Work\git\DocuLight2.0` 로 줄여 쓴다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git status --porcelain` 이 **비어 있는지** 확인한다. 비어 있지 않으면 이 문서가 낡았거나 다른 세션이 작업한 것이다. (직전 커밋의 해시는 이 문서에 적지 않는다 — 문서를 고칠 때마다 바뀌어 곧바로 낡는다. 코드 쪽 마지막 커밋은 `a499578 feat: AI 검색을 MCP 표면 하나로 묶는다` 이고 그 뒤는 저널과 문서뿐이다.)
3. `<REPO>\kiwi\waves.jsonl` 의 **마지막 줄**을 읽는다 — wave-4 의 `srs-authoring` 진입 행이며 분모·설계 항목·결정 셋이 거기 있다.
4. **미결 하나를 먼저 정한다**: `MIG-AUTH-001` AC-1(「이행 시점부터 1.0 에서 문서를 편집하려는 시도가 거부된다」)을 무엇으로 판정할 것인가. 아래 「미결정·유예 항목」 절에 선택지가 있다.
5. 그 판정이 서면 wave-4 를 TDD 로 구현한다. 요구 순서는 `MIG-AUTH-002` → `MIG-AUTH-001` → `CON-ARCH-002` AC-8 이다.

---

## 1. 최종 작업 목표

원장(`<REPO>\docs\spec\00.decision-log.md`) §4 Phase 1 수용 기준 **13개를 전건 통과**시킨다. `phase-1` target 의 `newWorkCandidates` 가 0 이 되고 남은 요구가 전부 `implemented` 이상이면 이 작업이 끝난 것이다.

`verified` 일괄 승급은 **이 run 의 범위가 아니다** — 제약 C-07 이 wave 실행 중 금지하며 최종 검증 통과 후 별도 세션의 몫이다.

---

## 2. 현재까지 완료한 작업

### wave-3 — MCP 서버 패키지 (종료)

요구 7건, 수용 기준 **23/23** 전건 체크. `waves.jsonl` 에 `complete`(verdict: pass) 기록.

- [x] `SEC-ARCH-001` AC 3/3 — MCP 인증 필수. 커밋 `b7269b0`
- [x] `IR-AUTH-002` AC 4/4 — Bearer PAT 가 유일한 인증 수단. 커밋 `b7269b0`
- [x] `SEC-ARCH-002` AC 4/4 — 읽기·벡터검색 ACL 필터. 커밋 `d9b313d` · `7063f6a`
- [x] `SEC-ARCH-003` AC 3/3 — 쓰기 권한 검사. 커밋 `d9b313d`
- [x] `FR-ARCH-001` AC 5/5 — 1.0 도구 계약 인계 + 의미 검색 신규. 커밋 `7063f6a`
- [x] `CON-SHELL-002` AC 3/3 — AI 검색은 MCP 로만. 커밋 `a499578`
- [x] `SEC-ACL-006` AC-5 — 같은 은닉 규칙이 MCP 응답에도. 커밋 `d9b313d`

### wave-4 — 1.0 이행 (진입만)

- [x] 진입 행을 `waves.jsonl` 에 기록 — 커밋 `d7736b4`. 분모 확정: 요구 3 · AC 11 · 설계 항목 3 · 제약 14
- [ ] **구현은 0 이다.** 코드 한 줄도 쓰지 않았다

### 검증 실행 기록 (명령과 시점)

| 무엇 | 명령 | 시점 | 결과 |
| --- | --- | --- | --- |
| 전체 회귀 | `cd /c/Work/git/DocuLight2.0 && npm test` | 2026-08-28, 커밋 `a499578` 직전 | editor 253 통과·1 건너뜀 / server 1306 통과 / web 524 통과 / **실패 0 · 처리되지 않은 오류 0 · exit 0** |
| 타입 검사 | `cd /c/Work/git/DocuLight2.0 && npm run typecheck` | 2026-08-28, 같은 시점 | 오류 **0** |
| SRS 검증 | `cd /c/Work/git/DocuLight2.0 && npx speckiwi validate` | 2026-08-28, 커밋 `a499578` 직전 | 오류 **0**, 경고 1(`SRS-W072`, 선재) |

**주의**: 마지막 전체 회귀는 `a499578` 시점이다. 그 뒤 커밋 `13cbcc3`·`d7736b4` 는 `kiwi/waves.jsonl` 만 건드렸으므로 코드가 바뀌지 않았다. 브라우저 시험(`npm run test:browser:all`)은 **이 세션에서 한 번도 실행하지 않았다** — wave-3 이 서버 쪽 작업이라 라이브 프리뷰·위젯 기하를 건드리지 않았다.

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 이전 회차의 「server 1272 통과, 실패 0」 | **exit 1 이었다.** 시험 수는 맞지만 `Errors 3 errors` 가 있었고 npm 이 종료 코드 1 을 냈다. 시험 수만 보고 종료 코드와 `Errors` 행을 보지 않은 결과다 |
| `file-watch.ts` 주석 「닫기보다 먼저 표시한다」의 근거 | **실측되지 않았다.** 표시를 `close()` 뒤로 옮기는 탐침에도 그 항이 죽지 않았다. 창이 수 밀리초라 걸리지 않을 뿐이며, 그 사실을 주석에 적었다 |
| `main.ts` 주석 「감시자는 DB 를 쓰지 않고 기다린다」 | **둘 다 거짓이었다.** 감시자는 노드 저장소를 읽고, `stop()` 은 떠 있는 읽기를 기다리지 않았다 |
| 처음 쓴 `SEC-ARCH-003` 쓰기 관문 시험 | **관문을 통째로 없애도 죽지 않았다.** `saveDocument` 가 이미 노드 ACL 을 막으므로 이 계층이 기여하는 축은 PAT 스코프 하나였다 |
| 처음 쓴 `CON-SHELL-002` AI 경계 술어 | **참조로 넘기는 경로를 놓쳤다.** REST 라우터에 `() => semanticSearch` 를 넣어도 죽지 않았다 |

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master` — origin 대비 **behind 0**. ahead 수는 이 문서에 적지 않는다: 커밋할 때마다 바뀌어 문서가 곧바로 낡는다. `git rev-list --left-right --count origin/master...HEAD` 로 직접 확인하라(왼쪽이 behind, 오른쪽이 ahead)
- 미커밋 파일: **없음(clean).** 이 핸드오프 문서와 `docs/next/LATEST.md` 도 커밋했다
- **코드 쪽 마지막 커밋은 `a499578`** 이다. 그 뒤 커밋들은 `kiwi/waves.jsonl` 과 `docs/next/` 만 건드렸으므로 `packages/` 아래는 `a499578` 시점 그대로다
- **푸시하지 않았다.** 이 run 의 작업 전부가 로컬에만 있다. 푸시는 사용자 판단이다

---

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 실행 순서 SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` | wave 4·5·6 의 범위와 설계 기준선. wave-4 는 그 문서의 **「Wave 5 — 1.0 이행」** 절(74~83행)이다 |
| 진행 상태 SSOT | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | wave 별 상태·잔여·결정 (append-only). 마지막 줄이 wave-4 진입 행 |
| 제약 14건 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-24.doculight2.phase1-remaining\constraints.json` | 이 run 의 사용자 제약 |
| 원장 | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` | §4 Phase 1 수용 기준 13개 |
| 1.0 MCP 실측 조사 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-srs-2026-08-19.doculight2.phase1-srs-intake\arag-probe.md` | 524행. §D 가 도구 명세, §B-2 가 1.0 의 ACL 부재 |
| 사전 질의 답변 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-25-answer-to-preflight-questions.md` | 사용자가 확정한 답 |
| 직전 핸드오프 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-27-wave2-close-and-wave3.md` | wave-2 종료 시점 |

**wave-3 이 만든 코드** (전부 커밋됨):

- `C:\Work\git\DocuLight2.0\packages\server\src\http\routes\mcp.ts` — MCP JSON-RPC 표면과 인증 관문
- `C:\Work\git\DocuLight2.0\packages\server\src\app\mcp\tools.ts` — 도구 열넷의 계약(이름·인자·기본값)과 접두 규칙
- `C:\Work\git\DocuLight2.0\packages\server\src\app\mcp\dispatch.ts` — 도구 실행과 인가
- `C:\Work\git\DocuLight2.0\packages\server\src\app\mcp\readers.ts` — 읽기 도구의 공용 조각
- `C:\Work\git\DocuLight2.0\packages\server\src\app\search\semantic-search.ts` — 색인과 조회, ACL 필터
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\search\embedding.ts` — n-gram 벡터와 코사인 유사도

**wave-4 가 쓸 기존 코드**:

- `C:\Work\git\DocuLight2.0\packages\server\src\app\auth\token-service.ts` — `issueToken` · `authenticateToken`. PAT 재발급 안내가 이 위에 선다
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\auth\secret-token.ts` — 토큰 해시(sha256)
- `C:\Work\git\DocuLight2.0\packages\server\src\app\workspace\create-workspace.ts` — 기본 워크스페이스 생성
- `C:\Work\git\DocuLight2.0\packages\server\src\app\search\semantic-search.ts` — `indexNode` 가 벡터 인덱스 재구축의 단위다
- `C:\Work\git\DocuLight2.0\packages\server\src\main.ts` — 조립 지점

**1.0 저장소**: `C:\Work\git\DocuLight\DocLight` — 존재하고 읽을 수 있다(2026-08-28 `test -d` 로 확인). 제약 C-02 가 **수정을 금지**하므로 이행 도구는 읽기만 한다.

**참고 선례**: `C:\Work\git\DocuLight2.0\packages\server\test\arch\assembly.test.ts` — 조립 방벽. 새 서비스가 `main.ts` 에서 도달하지 않으면 실패한다. wave-3 에서 이 방벽이 **중복 구현 하나를 잡았다**(의미 검색이 `vector-search.ts` 의 일을 다시 함).

---

## 5. 확정된 결정 (변경 금지)

1. **wave target 을 새로 만들지 않는다** — `phase-1` 위에서 요구를 좁힌다. **확정**. (근거: 제약 C-01)
2. **요구 변경은 speckiwi MCP 로만 한다** — `docs/spec/*.srs.md` 를 손으로 고치지 않는다. **확정**. (근거: 제약 C-06)
3. **커밋 메시지에 AI 시그니처·단계 표식을 넣지 않는다.** **확정**. (근거: 제약 C-09, 전역 `CLAUDE.md` §6)
4. **1.0 저장소는 읽기 전용이며 수정 금지.** **확정**. (근거: 제약 C-02)
5. **1.0 동결은 운영 절차 문서로 선언한다. 서비스 기동 중단과 리버스 프록시 차단은 쓰지 않는다.** **확정**. (근거: 제약 C-03, 2026-08-25 사용자 결정 3-A)
6. **아카이브·복원은 phase-2 다** — 그래서 `SEC-STORAGE-007` AC-3 은 이 run 에서 닫지 않는다. **확정**. (근거: 제약 C-04, 원장 R165)
7. **오케스트레이터 게이트는 묻지 않고 승인하며 권장안을 고른다.** **확정**. (근거: `<REPO>\CLAUDE.md` 「Gate decisions」 절)
8. **MCP 는 별도 패키지가 아니라 `packages/server` 안에 있다.** **확정**. (근거: `waves.jsonl` wave-3 진입 행의 `decision` D-W3-01, 그리고 `OPS-ARCH-001` AC-2 가 Node 프로세스를 하나로 묶는다)
9. **1.0 의 무인증 표면(`POST /context`)을 재현하지 않는다.** 그 고유 도구 둘(`list_context_documents` · `search_documents`)은 이름을 유지한 채 주 목록으로 흡수했다. **확정**. (근거: `SEC-ARCH-001` AC-2, 코드로 이미 그렇게 서 있다)
10. **이행 도구는 일회성이며 제품 조립에 상시로 넣지 않는다.** **확정**. (근거: `MIG-AUTH-001` AC-3 이 「일회성 이행 도구」라고 명시)
11. **작업이 끝나 사용자 입력을 기다릴 때 doculight 로 짧게 보고한다.** **확정**. (근거: `<REPO>\CLAUDE.local.md`, 커밋되지 않는 기계별 지시)

---

## 6. 미결정·유예 항목

### `MIG-AUTH-001` AC-1 의 판정 방식 — **다음 세션이 먼저 정할 것**

조항: 「이행 시점부터 1.0 에서 문서를 편집하려는 시도가 거부된다.」

문제: 제약 C-02 가 1.0 저장소의 수정을 금지하므로 **그 안에 편집을 막는 코드를 넣을 수 없다.** 제약 C-03 은 서비스 기동 중단과 프록시 차단도 배제한다.

선택지 셋:

1. **절차 선언으로 성립한다고 판정** — 운영 절차 문서에 「이행 시점 이후 1.0 편집 금지」를 적고 그 문서의 존재를 증거로 삼는다. `CON-ARCH-002` AC-8 의 `Verification Method` 가 `review` 인 것과 같은 축이다.
2. **2.0 쪽에 잴 축이 있는지 찾는다** — 원장 조항과 `MIG-AUTH-001` 본문을 읽어 2.0 이 무언가를 거부해야 하는지 확인한다.
3. **재지 못한다고 판정하고 열어 둔다** — `SEC-STORAGE-007` AC-3 의 선례처럼 사유를 Implementation Notes 에 적고 체크하지 않는다.

결정 방법: `MIG-AUTH-001` 본문과 `Verification Method` 를 MCP `get_requirement` 로 읽고, 원장에서 그 조항의 근거(`docs/spec/00.decision-log.md`)를 확인한 뒤 판정한다. **재지 못하는 조항을 체크하지 않는 것이 이 저장소의 규율이다.**

### PAT 발급의 사용자 표면 부재

`MIG-AUTH-002` AC-5 가 「PAT 재발급 안내」를 요구하는데, **사용자가 토큰을 만들 화면이 아직 없다.** wave-3 이 저장소와 인증 경로는 조립에 넣었으나 발급 라우트와 설정 모달은 `SEC-AUTH-005`·`SEC-AUTH-007` 의 축이고 이 run 의 배정 밖이다. 안내가 가리킬 곳이 없다는 사실을 착수 시점에 함께 판정하라. 결정 방법: AC-5 의 문면이 「안내 제공」만 요구하는지, 실제 발급 경로까지 요구하는지 본문을 읽어 가른다.

### 부하 흔들림의 원인

editor·web vitest 가 부하가 걸린 기계에서 흔들린다. 이 세션에서도 탐침 중 PDF 항이 5522ms 로 한 번 실패했다가 재실행에서 통과했다. 원인 미규명. 결정 방법: 흔들리는 항의 공통 축을 찾는 별도 조사.

---

## 7. 남은 작업 전체 목록

### wave-4 — 1.0 이행 (요구 3건 · AC 11)

- [ ] **`MIG-AUTH-001` AC-1 판정 방식 결정** — 완료 조건: 위 「미결정」 절의 셋 중 하나를 고르고 그 근거를 `waves.jsonl` 에 `decision` 으로 기록
- [ ] `MIG-AUTH-002` AC 5개 — 계정 전원 `active` + `default` 그룹 · bcrypt 해시 그대로 재사용 · 전역 API Key 무효화 · PAT 재발급 안내. 완료 조건: AC 5개 체크 + 증거 등록
- [ ] `MIG-AUTH-001` AC 5개 — 1.0 읽기 전용 동결 · `docsRoot` 전체(비-md 포함) 복사 · 벡터 인덱스 재구축. 완료 조건: 같음 (의존성: `MIG-AUTH-002` 가 먼저)
- [ ] `CON-ARCH-002` AC-8 — 1.0 리포가 동결된 상태로 운영 가능한지. **절차 판정이며 코드로 재지 않는다**. 완료 조건: 판정 근거를 Implementation Notes 에 남기고 체크
- [ ] wave-4 종료 검증 → `waves.jsonl` 에 `wave-verify`(verdict) + `complete` append

### 전체 wave 최종 검증

- [ ] 원장 §4 수용 기준 13개 전건 통과 확인. 완료 조건: 13개 각각의 판정 근거가 기록됨. **1번(실제 볼트 읽기·편집)과 7번(한글 IME)은 수동 검증**이라 사용자 확인이 필요하다

### 이월 잔여 (wave 밖)

- [ ] `FR-SHELL-013` 의 AC-4 를 뺀 **열한 개** — 증거 `VE-1`·`VE-2` 가 덮는다고 그 문서가 적으면서 체크 상자가 비어 있다. 완료 조건: 각 AC 를 증거가 실제로 덮는지 판정하고 체크
- [ ] `SEC-ACL-006` 의 AC-5 를 뺀 **다섯 개**(AC-1~4 · AC-6) — REST 표면의 축
- [ ] `SEC-STORAGE-007` AC-3 — 제약 C-04 로 phase-2
- [ ] `R-W3-EMBEDDING-LEXICAL` — 의미 검색이 학습된 임베딩이 아니라 문자 n-gram 이다. phase-2 이월
- [ ] `R-W3-PAT-SURFACE` — PAT 발급·폐기의 사용자 표면 부재. Wave 6
- [ ] `R-FND-101` — `packages/web` 이 editor 스타일을 하나도 import 하지 않아 `FR-EDITOR-007` 의 증거가 제품 화면에 닿지 않는다. Wave 6
- [ ] `R-CHANGENOTE-GAP` — `07.editor.srs.md` 의 Change Notes 정정. MCP·CLI 에 그 표에 행을 더하는 경로가 없어 사용자 승인 필요
- [ ] `R-LOAD-FLAKE` — 부하 흔들림 원인 규명
- [ ] `R-SELTOUCH-AXIS` — 경계 포함 성질을 자동으로 지키는 축이 수식·표·태그 셋뿐이다
- [ ] `R-IMPLNOTE-1` — `07.editor.srs.md` 의 `FR-EDITOR-007` Implementation Notes 첫 불릿이 Status 를 `blocked` 라 적는다(실제는 `implemented`). 선재
- [ ] `R-W2-NOTE-DATE-DUP` — `REL-STORAGE-002` Implementation Notes 한 줄의 날짜 중복. 고칠 MCP 경로 없음
- [ ] **푸시 여부 결정** — 로컬에만 커밋이 쌓여 있다

---

## 8. 다음 세션 지시서

1. **`MIG-AUTH-001` AC-1 판정 방식을 정한다.**
   - MCP `get_requirement` 로 `MIG-AUTH-001` 본문과 `Verification Method` 를 읽는다.
   - 위 「미결정」 절의 선택지 셋 중 하나를 고른다.
   - → 검증: 고른 근거가 `waves.jsonl` 에 `decision` 객체로 append 됐다.
2. **`MIG-AUTH-002` 를 TDD 로 구현한다.**
   - 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green 을 만든다.
   - 1.0 계정 데이터를 어디서 읽는지 먼저 실측하라 — `C:\Work\git\DocuLight\DocLight` 아래에 `data` 디렉터리가 있다(2026-08-28 `ls` 로 확인). 그 안의 형식은 **이 세션에서 확인하지 않았다**.
   - → 검증: AC 5개 체크 + 증거 등록 + `npx speckiwi validate` 오류 0.
3. **`MIG-AUTH-001` 을 TDD 로 구현한다.**
   - 벡터 인덱스 재구축은 `packages/server/src/app/search/semantic-search.ts` 의 `indexNode` 를 노드마다 부르면 된다.
   - → 검증: AC 5개 판정(1번의 결정에 따라 AC-1 이 체크되거나 사유와 함께 열림).
4. **`CON-ARCH-002` AC-8 을 판정한다.** 절차 판정이므로 코드를 쓰지 않는다.
   - → 검증: 판정 근거가 Implementation Notes 에 있고 AC-8 이 체크됐다.
5. **wave-4 종료 검증을 돌린다.**
   - 분모: REQ/AC **11** · 설계 항목 **3** · 제약 **14**. 창은 `git diff d7736b4..HEAD`.
   - 새 시험마다 뮤테이션 탐침을 **server 전체 스위트**로 돌린다.
   - → 검증: 잔여 CRITICAL 0 · HIGH 0 · 회귀 실패 0 이면 `waves.jsonl` 에 `wave-verify`(verdict: pass) + `complete` append.

---

## 9. 거버넌스·게이트·함정

### 규칙

- **TDD 강제**: 동작 변경은 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green 을 만든다 (제약 C-11).
- **요구 없이 코드를 고치지 않는다** (제약 C-12).
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다** (제약 C-14). **반드시 해당 패키지 전체 스위트로 재라.**
- **조립 방벽**: 새 서비스는 `main.ts` 에서 도달해야 한다. 허용목록에 넣으려면 「검증 가능한 참조」를 담은 사유가 필요하다.
- 개발 서버 포트: web **3399** · server dev API **3400** (제약 C-13).

### 이번 세션에 실제로 밟은 함정

| 함정 | 회피 방법 | 확인 |
| --- | --- | --- |
| **회귀 판정에서 종료 코드와 `Errors` 행을 보지 않았다.** 시험 수만 보면 「1272 통과」인데 npm 은 exit 1 이었고 처리되지 않은 거부 셋이 있었다 | `npm test` 결과는 `exit code` 와 `Errors` 행·`Unhandled` 블록을 함께 본다 | 이 세션에서 실측 |
| **`cd packages/server` 뒤 다음 Bash 호출의 cwd 가 유지돼 루트에서 vitest 가 돌았다.** editor 시험까지 돌아 탐침과 무관한 실패가 났다 | 탐침·회귀는 `cd /c/Work/git/DocuLight2.0/packages/server && npx vitest run` 로 매번 절대 경로부터 시작한다 | 이 세션에서 3회 발생 |
| **Bash 힙독 안 파이썬에서 `\n` 이탈이 풀려 문자열이 깨졌다** | 스크립트를 scratchpad 파일로 쓰고 `python <파일>` 로 실행한다. 짧으면 `chr(92)` 로 우회 | 이 세션에서 2회 발생 |
| **파이썬 치환의 대상이 없어도 조용히 넘어가 탐침이 적용되지 않았다.** 탐침이 「안 문다」로 잘못 읽혔다 | 치환 전에 `assert s.count(old) == 1` 을 넣는다 | 이 세션에서 실측 |
| **`readDocument`·`saveDocument` 는 파일이 없으면 던진다.** `createNode` 는 노드만 만들고 파일을 만들지 않는다 | 새 문서는 빈 파일을 먼저 세운 뒤 `saveDocument` 로 보낸다 | `dispatch.ts` 의 `createOrOverwrite` 에 그렇게 되어 있다 |
| **노드 `kind` 의 값은 `'directory'` 이지 `'dir'` 이 아니다.** DB CHECK 제약이 `kind IN ('directory','file')` | 값을 쓸 때 `directory` 로 쓴다 | `SqliteError: CHECK constraint failed` 로 드러남 |
| **`Actor` 의 사용자 ID 는 `actor.id` 다.** `actor.requester.userId` 는 없다 | `actor.id` 를 쓴다 | 타입 오류로 드러남 |
| **HTTP 헤더에 한글을 넣을 수 없다** | 시험의 토큰 값 등은 ASCII 로 쓴다 | `Invalid character in header content` |
| **검증 서브에이전트가 판정을 반환하지 않는다.** wave-2 종료 라운드에서 셋이 넷 연속 idle 알림만 보냈다 | 판정을 위임하지 말고 **기계적 탐침과 구조 검사**로 세운다. wave-3 은 그 방식으로 완주했다 | 이 세션에서 실측 |

### 테스트 실행 명령 (복붙 가능)

```bash
cd /c/Work/git/DocuLight2.0 && npm test
cd /c/Work/git/DocuLight2.0 && npm run typecheck
cd /c/Work/git/DocuLight2.0 && npx speckiwi validate
cd /c/Work/git/DocuLight2.0/packages/server && npx vitest run
cd /c/Work/git/DocuLight2.0/packages/editor && npm run test:browser:all
```

브라우저 시험은 **editor 데모 서버가 떠 있어야** 돈다: `npm run dev --workspace @doculight/editor` (루트 `npm run dev` 는 web 앱이라 다른 화면을 잰다).

---

## 10. 리스크·잔존 이슈

- **증거 결함이 wave-3 에서 넷 나왔다** — 넷 모두 「다른 계층이 이미 막고 있어 이 계층의 관문이 없어도 통과하는」 같은 모양이었다. 영향: wave-4 에서도 기존 서비스(`login-service`·`token-service`) 위에 세우므로 같은 일이 반복될 수 있다. 대응: 새 관문을 세울 때마다 **그 관문만 없애는 탐침**을 돌려 무엇이 죽는지 본다. 아무것도 안 죽으면 그 관문이 기여하는 축을 따로 찾아 그것을 재는 항을 세운다.
- **의미 검색이 학습된 임베딩이 아니다** — 문자 n-gram 벡터라 「매출」과 「수익」이 가깝지 않다. `FR-ARCH-001` AC-4 는 「신규 작성물일 것」만 요구하므로 조항은 성립한다. 영향: 실사용에서 기대와 다를 수 있다. 대응: `packages/server/src/domain/search/embedding.ts` 의 `embed` 하나를 갈아 끼운다.
- **PAT 발급 화면이 없다** — MCP 인증은 서지만 사용자가 토큰을 만들 표면이 없다. 영향: `MIG-AUTH-002` AC-5(재발급 안내)가 가리킬 곳이 없을 수 있다.
- **로컬에만 커밋이 쌓여 있다** — 이 기계가 유일한 사본이다. 대응: 사용자 판단으로 푸시.
- **`SEC-ACL-006` 이 `in_progress` 인데 AC-5 만 체크됐다** — 나머지 다섯이 REST 표면의 축이라 이 run 밖이다. 영향: `newWorkCandidates` 에 계속 남는다. 최종 검증에서 그것이 미완으로 읽히지 않게 사유를 함께 보고하라.
