# 검색 계열 결정 확정과 wave-7 서버 계층 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-23 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | Phase 1 의 wave 9개 중 남은 4개(6·7·8·9)를 완주해 원장 §4 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | **`blocked` 요구가 0건이다.** `draft` 요구도 0건. 이번 세션 커밋 9개(`f3dcbbb`~`60f2f45`). 워킹트리 clean |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` 와 원장 `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` |
| 다음 세션 첫 행동 | 아래 「0. 다음 세션의 첫 행동」 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 이어갈 수 있도록 쓴 것이다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git -C C:/Work/git/DocuLight2.0 status --porcelain` 로 워킹트리를 확인한다. 「3. 현재 상태」와 어긋나면 사용자에게 한 줄로 알린다.
3. SpecKiwi MCP `get_active_target` 으로 활성 target 이 `phase-1` 인지 확인한다.
4. **wave-7 의 남은 요구 15건을 이어서 구현한다.** 착수 지점은 아래 「7. 남은 작업」의 **B-2**(`PrincipalPicker` 와 주체 검색) 다 — 나머지 화면 요구가 전부 그 공용 컴포넌트를 전제하므로 그것부터 세운다.
5. wave-7 이 끝나면 wave-8(확인 등급 33건) → wave-9(감사·재조정·컷오버 34건) 순으로 진행한다.

---

## 1. 최종 작업 목표

Phase 1 은 **wave 9개**로 분해돼 있고 배정의 정본은 `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` 이다.

**완료 조건**: 원장 §4 Phase 1 수용 기준 13개 각각에 대해 (a) 자동 시험이 그것을 재고 (b) 통과하며 (c) 해당 요구의 `#### Verification Evidence` 표에 그 시험이 적혀 있다. 수용 기준 1번(실제 볼트 읽기·편집)과 7번(한글 IME)은 수동 검증 기록으로 대체한다.

| wave | 이름 | 요구 | 수용기준 | 상태 |
| --- | --- | --- | --- | --- |
| 1~5 | (모노레포·ACL 코어·인증·셸·본문 표면) | 139 | 2·4·6·7·8·9·10·11·12·13 | 완료 (`pass-with-carried-residuals`) |
| **6** | 찾기 계열 — 링크·백링크·태그·전역 검색·MCP | 18 | 3·5 | **미착수 · 차단 해소됨** |
| **7** | 권한·주체 관리 화면과 이동·복사 | 26 | 4·9·10 | **진행 중 — 26건 중 11건** |
| **8** | 확인 등급 | 33 | — | **미착수** |
| **9** | 감사·재조정·1.0 컷오버 (Phase 1 종료 관문) | 34 | 1·13 | **미착수** |

**wave-6 의 차단이 이번 세션에 전부 풀렸다.** `wave-assignment.json` 의 wave-6 `blocked_notes` 세 줄은 **낡았다** — `FR-SHELL-013`·`FR-SHELL-014`·`FR-SHELL-011` 이 전부 해소됐다. 그 파일은 고치지 않았다.

---

## 2. 이번 세션에 한 일

커밋 9개. `git -C C:/Work/git/DocuLight2.0 log --oneline 103a158..60f2f45` 로 확인 가능.

| 커밋 | 내용 |
| --- | --- |
| `f3dcbbb` | 막힌 것을 주니어용으로 풀어 쓴 보고서(`docs/next/2026-08-22-blockers-for-juniors.md` — 파일 실존 확인). ⚠️ 미검증 — 「DocuLight 뷰어로 띄웠다」와 「검증 서브에이전트가 27건 전건 TRUE」는 커밋 본문에 적혀 있을 뿐 저장소에 산출물·로그가 없다. 확인할 방법: 없다(세션 밖에서 대조 불가). 그 두 문장을 다른 판단의 근거로 쓰지 마라 |
| `76a5784` | `IR-ACL-001`·`SEC-ACL-015` — 접근자 지표를 `접근 가능`/`ACL 접근자` 둘로 분리 |
| `aa736fe` | `FR-ACL-003`·`FR-PRINCIPAL-004`·`FR-PRINCIPAL-010` — 주체 축 일괄 회수 |
| `3978561` | 적대 검증이 찾은 결함 수정 (아래 「적대 검증이 찾은 것」) |
| `0f3ee97` | `FR-ACL-004`(시뮬레이션)·`FR-ACL-005`(상속 끊김 목록·되돌리기) |
| `20ab36d` | `FR-ACL-002`·`FR-ACL-006` — 이동·복사 프리뷰 |
| `9725eeb` | 원장 `R155`~`R159` 신설 · `IR-SHELL-002` 개정(카테고리 13→14) |
| `b1f4ec7` | 원장 `R160`·`R161` 신설 · `G38`·`G36`⑥ 종결 · `FR-SHELL-013` 차단 해제 |
| `60f2f45` | `FR-ACL-001`·`SEC-SHELL-003` — 복사가 본문·첨부까지 옮겨 심는다 |

### 검증 (2026-08-23 실행)

| 명령 (cwd `C:/Work/git/DocuLight2.0`) | 결과 |
| --- | --- |
| `NODE_ENV=development npm run typecheck` | error 0 |
| `NODE_ENV=production npx vitest run --root packages/server` | 763 passed |
| `NODE_ENV=production npx vitest run --root packages/web` | 252 passed |
| `NODE_ENV=production npx vitest run --root packages/editor` | 237 passed / 1 skipped |
| SpecKiwi MCP `validate_spec` | errors 0 / warnings 1 (`SRS-W072` — 기존) |

### 요구 상태 (MCP `get_active_target` 실측, 2026-08-23)

| 지표 | 값 |
| --- | --- |
| total | 253 |
| `blocked` | **0** |
| `draft` | **0** |
| `verified` | 18 |
| `implemented` | 50 |
| `in_progress` | 30 |
| `planned` | 155 |

### 적대 검증이 찾은 것 (`3978561`)

검증 서브에이전트가 `76a5784`·`aa736fe` 를 적대 검증해 결함을 찾았고 전부 고쳤다.

- **[HIGH] 일괄 회수의 `관리` 문턱을 어떤 시험도 재지 않았다.** 문턱을 `=== 'admin'` 에서 `!== null` 로 낮춰도 전 스위트가 통과했다. 이웃 시험이 부여 대상을 *문서*로 잡아 워크스페이스에서의 레벨이 애초에 `null` 이었기 때문이다. 워크스페이스에 편집·보기를 주는 시험 둘을 더했다.
- 미리보기 행 순서가 무작위였다(`granted_at` 초 단위 동률을 불투명 ID 가 갈랐다). 결정적 순서를 넣고, 그것을 재던 시험이 행 하나뿐이라 순서를 뒤집어도 살아남던 것을 셋으로 늘렸다.
- 증거의 `Covers` 가 재는 것보다 넓게 적힌 자리 둘을 고쳤다 — `FR-PRINCIPAL-010`(AC-1 → AC-2·AC-3), `FR-PRINCIPAL-004`(AC-1~3 → `-`, 세 AC 가 전부 문구를 요구하는데 서버는 문구를 만들지 않는다).
- 주석 하나가 거짓이었다 — 「권한은 워크스페이스 단위로 한 번씩 잰다」는 선별에만 참이고 실행은 항목마다 다시 잰다.

---

## 3. 현재 상태

- 브랜치 `master`. `git status --porcelain` **비어 있음** — 2026-08-23 확인.
- 이 핸드오프 문서와 `docs/next/LATEST.md` 는 이 문서를 쓰는 시점에 생기므로 다음 세션의 `git status` 에는 그 둘이 미커밋으로 보인다.
- 원격(`origin/master`)은 `28f7686` 로 로컬보다 한참 뒤처져 있다. **push 하지 않았다.**

---

## 4. 관련 문서·코드 (절대경로)

| 무엇 | 경로 |
| --- | --- |
| SSOT 진입점 | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` |
| **원장** | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` |
| wave 배정 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` |
| wave-7 설계 기준선 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\design-baseline\wave-7.md` |
| 막힌 것 주니어용 보고서 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-22-blockers-for-juniors.md` (⚠️ 이번 세션 결정 이전에 쓴 것이라 「막혀 있다」는 서술이 낡았다) |
| 셸 SRS | `C:\Work\git\DocuLight2.0\docs\spec\08.app-shell.srs.md` |
| ACL SRS | `C:\Work\git\DocuLight2.0\docs\spec\10.access-control.srs.md` |
| 확인 등급 SRS | `C:\Work\git\DocuLight2.0\docs\spec\11.confirmation-grades.srs.md` |
| 감사 SRS | `C:\Work\git\DocuLight2.0\docs\spec\12.audit-log.srs.md` |
| 주체 SRS | `C:\Work\git\DocuLight2.0\docs\spec\16.principal.srs.md` |

### 이번 세션이 새로 만든 소스

| 파일 | 무엇 |
| --- | --- |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\accessor-service.ts` | 접근자 지표 둘 + 명단 문턱. `tallyOf` 와 `servableAncestryOf` 를 외부에 연다 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\bulk-revoke-service.ts` | 주체 축 일괄 회수(미리보기·실행) |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\admin-scope.ts` | `managedWorkspacesOf` — 세 화면이 공유하는 「내가 관리하는 워크스페이스」 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\simulation-service.ts` | 특정 주체 관점 유효 권한 시뮬레이션 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\inheritance-audit-service.ts` | 상속 끊김 목록 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\relocation-preview-service.ts` | 이동·복사 프리뷰 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\node\node-paths.ts` | `chainIndex`·`pathIndex` — 메모리에서 사슬·경로를 엮는다 |

### 이번 세션이 고친 소스

- `C:\Work\git\DocuLight2.0\packages\server\src\app\node\node-service.ts` — `copyNode` 를 **비동기 깊은 복사**로 바꿨다. 목적지가 판별 합집합(`{parentId}` 또는 `{workspaceId}`)이고 반환에 `copied` 개수가 붙는다
- `C:\Work\git\DocuLight2.0\packages\server\src\app\attachment\attachment-service.ts` — `replicateAttachments` 추가
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\acl\acl-entry.ts` — `grantedAt` 칸 추가
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\ports\acl-repository.ts` — `entriesOfPrincipal` 추가
- `C:\Work\git\DocuLight2.0\packages\web\src\shell\shell-contract.ts` — `색인 대기열` 카테고리(열넷째) 추가

### 선례로 쓸 시험

- `C:\Work\git\DocuLight2.0\packages\server\test\app\node\deep-copy.test.ts` — 요구가 정하지 않은 축(tombstone 복사)을 **규칙을 지어내지 않고 관측 거동만 고정**한 예
- `C:\Work\git\DocuLight2.0\packages\server\test\app\acl\bulk-revoke.test.ts` — 문턱을 재는 시험이 실제로 그 문턱을 재는지 확인한 예(무해한 이웃 시험이 문턱을 못 재던 자리)

---

## 5. 확정된 결정 (변경 금지)

이번 세션에 **사용자가 직접 정한 것**과 그것을 원장 조항으로 옮긴 결과다. 재논의 대상이 아니다.

| # | 결정 | 조항 |
| --- | --- | --- |
| 1 | **검색 필터 기본값은 `이름` 하나.** 나머지 셋(본문·태그·첨부 이름)은 꺼진 채 시작하고, 마지막 조합을 브라우저에 캐시한다. 캐시는 정본이 아니다 | `R155` |
| 2 | **결과 건수는 언제나 「거른 뒤」의 수.** 거르기 전 개수·분모·「N건 중 M건」 표기를 어느 표면에도 두지 않는다 | `R156` |
| 3 | **텍스트 색인은 비동기 백그라운드로 갱신.** 실체가 없거나 볼 수 없는 노드의 색인 항목은 결과에서 무조건 제외(fail-closed) | `R157` |
| 4 | **색인 대기열 화면은 설정 모달의 열넷째 카테고리**(인스턴스 구역, 슈퍼유저 전용) | `R157-a` |
| 5 | **한정어 없는 `대기열` 을 지시어로 쓰지 않는다** — `재조정 대기열` / `색인 대기열` | `R157-b` |
| 6 | **Phase 1 은 화면 최신성 폴링·푸시를 두지 않는다.** 새로고침이 수단이다. 해소가 아니라 **유예** | `R158` |
| 7 | **목록 이름순 정렬** — 자연 정렬 · 대소문자·악센트 무시 · 로케일 **`ko` 고정** · 디렉토리 먼저 · 비교 함수는 공용 한 자리 | `R159` |
| 8 | **한국어 일치 단위는 겹치는 2글자(bigram) 파생 색인.** 어절 경계에 본문에 없는 표지를 끼운다. 저장 엔진은 SQLite FTS5 유지 | `R160` |
| 9 | **트리에 서는 비-md 노드는 첫째 축(「이름」)으로 흡수.** 체크박스는 넷 그대로. **PDF 는 본문 축의 확장**이며 색인에 페이지 번호를 함께 싣는다. 페이지 이동은 `R146` 이 뷰어를 Phase 2 에 두어 **Phase 1 에 서지 않는다** | `R161` |
| 10 | **`FR-ACL-001` AC-5 는 「재작성한다」에서 「재작성하지 않는다」로 개정됐다** — 첨부 링크가 워크스페이스 기준 절대경로에 내용 해시 이름이라 같은 문자열이 대상에서 그대로 해석된다 | — |
| 11 | **`FR-SHELL-011` 은 빈도순에서 이름순으로 뒤집혔고 `draft` 가 풀렸다** | `R159` |

### 이전 세션에서 확정돼 계속 유효한 것

- 검색 질의: AND 가 `|` 보다 강하게 결합 · 괄호 미지원 · 최소 길이는 파이프로 나뉜 묶음마다 독립 판정 (`R149-f`)
- 검색 넷째 축은 `.res` 첨부의 **원본 파일명** (`R149-g`)
- 감사 보존 기본 365일 · `0` 은 무제한 · 감사 ≥ 휴지통 (저장 시점 양방향 거절) (`R154`·`R154-a`)
- 개인 설정 저장소는 (사용자, 항목) 쌍의 DB 행 (`DR-SHELL-002`)
- 사용자 이름이 곧 로그인 식별자이므로 본인은 개명 불가 (`R153`)

### 작업 방식 (계속 적용)

- **모든 검증은 서브에이전트로.** 자기 산출물을 자기가 검증하지 않는다. 검증자에게 내 결론을 넘기지 않는다
- **커밋 메시지에 AI 시그니처 금지.** `Phase {n}`·`Step {n}` 표식도 제목에 넣지 않는다
- **TDD 강제.** 실패 시험 먼저, red 확인 후 최소 구현
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다.** 이번 세션에 이 관행이 HIGH 결함 하나를 잡았다

---

## 6. 아직 열린 것

| 무엇 | 상태 |
| --- | --- |
| **`G36` ③** | **부분 종결.** 건수의 *의미*는 `R156` 으로 닫혔다. **상한 값 자체와 발췌 길이·강조 방식은 열려 있다.** 다만 `FR-SHELL-013` 의 어느 AC 도 그것을 요구하지 않아 차단이 아니다 |
| **`G14`·`G14-a`** | **Phase 1 한정 유예**(`R158`). 다섯 축의 갱신 계기는 Phase 2 로 넘어갔다 |
| **`G37`** | **열려 있다.** 보존 만료로 사라지는 감사 행을 참조하던 재조정 대기열 항목의 처분. 갈래 둘 — ⓐ 참조가 걸린 행은 만료에서 제외 ⓑ 대기열이 값을 자기 안에 복사. **wave-9 범위** |
| **`G15`·`G16`·`G23`·`G29`·`G30`·`G32`·`G33`·`G34`·`G35`** | 열려 있다. Phase 1 을 막지 않는다 |
| **PDF `#page=N` 프래그먼트** | **실측하지 않았다.** 표준이 아니라 브라우저 재량이다. Phase 2 착수 시 재고, 안 되면 `pdf.js` 뷰어 임베드(`R146`)로 간다 |
| **tombstone 복사** | 실체가 사라진 노드가 복사에 따라온다. **어느 AC 도 이 축을 정하지 않았다.** `deep-copy.test.ts` 가 관측 거동을 고정해 두었으니 정하면 그 시험이 먼저 깨진다 |

---

## 7. 남은 작업

### A. wave-7 나머지 15건 (요구 26건 중 11건 완료)

완료된 11건: `IR-ACL-001` · `SEC-ACL-015` · `FR-ACL-003` · `FR-PRINCIPAL-004` · `FR-PRINCIPAL-010` · `FR-ACL-004` · `FR-ACL-005` · `FR-ACL-002` · `FR-ACL-006` · `FR-ACL-001`(implemented) · `SEC-SHELL-003`

- [ ] **B-1** `wave-assignment.json` 의 wave-7 `requirement_ids` 26건 상태를 MCP `get_requirement` 로 재확인 — 완료 조건: 15건의 미완 목록이 확정됐다
- [ ] **B-2** `CON-PRINCIPAL-006`(단일 `PrincipalPicker`) + `SEC-PRINCIPAL-002`(계정 노출 범위·상태 배지) + `SEC-PRINCIPAL-003`(최소 질의 2자·상한 20건) — **여기부터 착수한다.** 완료 조건: 세 요구의 AC 가 시험으로 재어지고, 주체를 고르는 화면들이 이 컴포넌트 하나를 쓴다
- [ ] **B-3** `IR-ACL-002`(공유 모달의 상속 항목 읽기 전용 표시) · `IR-ACL-003`(사용자·그룹을 각각 검색해 추가) — 완료 조건: 두 요구의 AC 가 재어진다
- [ ] **B-4** `FR-PRINCIPAL-001`(사용자·그룹 관리) · `FR-PRINCIPAL-002`(그룹 삭제가 ACL 제거를 같은 트랜잭션에) · `FR-PRINCIPAL-009`(4상태 그대로 표시) — 완료 조건: 셋의 AC 가 재어진다
- [ ] **B-5** `FR-PRINCIPAL-003`(네 단계 오프보딩) · `CON-PRINCIPAL-004`(단일 컴포넌트·진행 상태 미저장) · `FR-PRINCIPAL-011`(시스템 그룹 회수의 확인 등급) — 완료 조건: 셋의 AC 가 재어진다
- [ ] **B-6** `FR-PRINCIPAL-005`(마지막 관리자 제거는 차단이 아니라 경고) · `FR-PRINCIPAL-006`(`관리자 없음` 배지) · `FR-PRINCIPAL-007`(생성 폼 `default` 초기 권한, 기본 `없음`) · `FR-PRINCIPAL-008`(비활성 계정 부여 시 확인 1단계) — 완료 조건: 넷의 AC 가 재어진다
- [ ] **B-7** wave-5 이월 `W5-04` — `FR-STORAGE-008` 의 **실물 이동** 축을 실제 이동으로 잰다(wave-5 는 이동 전 자리의 바이트 비교로 대신 쟀다)
- [ ] **B-8** 수용 기준 4·9·10 을 재는 시험 파일을 특정 — 완료 조건: 셋 각각에 대해 파일이 지목됐다

### B. wave-8 — 확인 등급 (요구 33건 · 막힌 것 없음)

- [ ] **C-1** 33건 상태 확인 → **C-2** `design-baseline\wave-8.md` 정독 → **C-3** TDD 구현. 완료 조건: 33건이 `implemented` 이상이고 증거가 적혀 있다

### C. wave-9 — 감사·재조정·1.0 컷오버 (요구 34건 · **Phase 1 종료 관문**)

- [ ] **D-1** 34건 상태 확인 → **D-2** `design-baseline\wave-9.md` 정독
- [ ] **D-3** `G37` 판정 — 완료 조건: 만료 처분이 원장에 조항으로 기록됐다
- [ ] **D-4** TDD 구현 · **D-5** 수용 기준 1번 수동 검증 기록 · **D-6** 수용 기준 13번 자동 검증

### D. wave-6 — 찾기 계열 (요구 18건 · **차단 해소됨**)

- [ ] **E-1** `R160` bigram 파생 색인 구현 — 완료 조건: 한국어 2자 질의가 어절 중간까지 걸리고 `FR-SHELL-014` 의 AC 가 통과한다
- [ ] **E-2** `R157` 비동기 색인 워커 + `R157-a` 색인 대기열 화면 — 완료 조건: 대기열 포트·워커·HTTP·화면이 서고 AC 가 재어진다. **`인스턴스 설정` 다섯 값에 섞지 마라**
- [ ] **E-3** `FR-SHELL-013` 구현(AC 열둘) · `R161` PDF 본문 색인(페이지 번호 포함)
- [ ] **E-4** MCP 서버 패키지 신설 — `wave-assignment.json` 의 wave-6 `existing_modules` 에 「MCP 서버 패키지 (이 wave 신설)」로 적혀 있다

### E. 증거가 비어 있는 것

- [ ] **F-1** `SEC-AUTH-002`~`SEC-AUTH-016` 15건 — MCP `get_active_target` 의 `missingEvidence` 가 이 15건을 지목한다(2026-08-23 실측). 완료 조건: 각 AC 가 어느 시험에 재어지는지 대조해 덮인 만큼만 기록. **이전 세션의 「전 AC 덮임 10건 / 부분 5건」 분류는 저장소에 근거가 없으므로 다시 조사하라**
- [ ] **F-2** `R21-a` 의 「`WHERE` 절 하나로 성립」 주장 정정 — ⚠️ 미검증. 정정 전에 그 주장이 실제로 틀렸는지 다시 확인하라

### F. 계약은 섰으나 구현이 0줄

- [ ] **G-1** `DR-SHELL-002`·`IR-SHELL-004` — 개인 설정 저장소(사용자별 DB 행)

### G. 자동 검증이 닿지 않는 자리

- [ ] **H-1** `FR-EDITOR-007` AC-7 브라우저 확인 — 현재 `C:\Work\git\DocuLight2.0\packages\editor\test\live-preview.test.tsx` 에 사유를 적어 `it.skip` 으로 남아 있다
- [ ] **H-2** 원장 §4 수용 기준 7번(한글 IME) 수동 검증

### H. wave 1~5 이월 잔여

- [ ] **I-1** `W5-01` — wave-4·5 가 독립 검증을 받지 못했다
- [ ] **I-2** `W5-03` — Playwright E2E 와 한글 IME 수동 체크리스트 미수행

### I. 소소한 잔존

- [ ] **J-1** `C:\Work\git\DocuLight2.0\packages\web\src\principal\PrincipalSearch.tsx` 디바운스 없음 — **B-2 에서 `PrincipalPicker` 로 흡수될 가능성이 높다**
- [ ] **J-2** 노드 영구 삭제 후 `favorite` 표에 죽은 행이 남음
- [ ] **J-3** `C:\Work\git\DocuLight2.0\packages\server\src\http\routes\workspace-api.ts` 의 `one()` 이 깊게 중첩된 JSON 배열에 500. ⚠️ 미검증 — 그 함수가 85~86행에 재귀 헬퍼로 실재하고 중첩 깊이만큼 재귀하는 것까지는 확인됐으나, 실제로 500 이 나오는지는 재현하지 않았다. 확인할 방법: 서버를 띄우고 깊게 중첩된 배열을 그 엔드포인트에 보낸다

### J. 배선이 안 된 것 — 다음 세션이 반드시 알아야 한다

이번 세션이 만든 서버 서비스 여섯은 **어떤 HTTP 라우트에도 연결되지 않았다.** `grep -rn "accessor-service|bulk-revoke-service|admin-scope|simulation-service|inheritance-audit-service|relocation-preview-service" packages/server/src/http/` 가 **0건**이고, 라우트 파일은 `auth.ts`·`documents.ts`·`workspace-api.ts` 셋뿐이다.

`previewRevocation`·`revokeAllFor`·`simulate`·`brokenInheritanceOf`·`movePreview`·`copyPreview` 여섯은 **정의 자리 하나뿐**이고 시험 밖에서 부르는 곳이 없다. `accessorsOf` 는 다르다 — 서버 소스 안에서 두 곳이 부른다: `packages\server\src\app\acl\inheritance-audit-service.ts:65`(행마다 `ACL 접근자` 수를 채운다)과 `packages\server\src\app\acl\relocation-preview-service.ts:91`(복사 프리뷰가 그대로 되돌려 준다). 그 둘도 라우트에는 닿지 않는다.

화면을 세울 때 라우트부터 붙여야 한다.

---

## 8. 다음 세션 지시서

1. **B-2 부터 시작한다** — `PrincipalPicker`·주체 검색 셋. 나머지 화면 요구가 전부 이 컴포넌트를 전제한다.
   → 검증: 세 요구의 AC 가 시험으로 재어지고 `NODE_ENV=production npx vitest run --root packages/web` 이 통과한다.
2. **각 묶음마다 TDD.** 실패 시험 먼저 → red 확인 → 최소 구현 → 뮤테이션 탐침으로 그 시험이 실제로 재는지 확인.
3. **묶음이 끝나면 커밋하고 검증 서브에이전트를 띄워 그 커밋 범위를 적대적으로 검증한다.** 이번 세션에 그 절차가 HIGH 결함 하나를 잡았다.
4. wave-7 이 끝나면 wave-8 → wave-9 순으로. wave-6 은 차단이 풀렸으나 새 인프라(bigram 색인·비동기 워커·MCP 패키지)가 커서 마지막에 둔다.

---

## 9. 게이트·함정

### 지켜야 할 규칙

- **SpecKiwi 황금률**: MCP mutation 을 부른 뒤 **같은 SRS 파일에 `Edit` 도구를 쓰지 않는다.**
- **`verified` 요구는 세분 편집이 막혀 있다.** 고치려면 `update_status` 로 내렸다가 개정 후 되돌린다 — 이번 세션에 `IR-SHELL-002` 가 그 경로를 밟았다.
- **설정 카테고리를 늘리려면 계약을 먼저 고친다.** 순서는 원장 `R24-a` 표 → 시험(red 확인) → `IR-SHELL-002` → 구현. 그 요구가 스스로 정한 규범이다.
- **`C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 읽기 전용.** `C:\Work\git\DocuLight` 자체는 git 저장소가 아니고 실제 루트는 그 하위 `DocLight` 다.
- 개발 서버 포트 **3399**(web), 3400(server dev API).

### 이번 세션에 실제로 밟은 함정

- **MCP 인자에 한글 유니코드 이스케이프를 쓰면 오타가 난다. 한글을 직접 넣어라.** ⚠️ 미검증 — 발생 횟수(이번 세션 2회·누적 4회)는 저장소로 확인되지 않는다. 오타가 같은 턴에 교정돼 어느 커밋 트리에도 남지 않았기 때문이다(`git grep` 으로 최근 30개 커밋을 훑어 0건). **횟수는 못 믿되 함정 자체는 실재한다** — 이스케이프를 쓰지 않으면 이 위험이 없다.
- **bash heredoc 에 긴 Python 을 넣으면 인용이 깨진다.** 스크래치패드(`C:\Users\beom\AppData\Local\Temp\claude\...\scratchpad\`)에 `.py` 파일로 쓰고 실행하라.
- **PowerShell here-string(`@'...'@`)을 bash 에 쓰면 커밋 메시지에 `@` 가 섞인다.** 이번 세션에 커밋 셋이 그렇게 오염돼 `git filter-branch` 로 고쳤다. 긴 커밋 메시지는 파일에 쓰고 `git commit -F` 를 쓴다.
- **`NODE_ENV` 가 이 셸에 `production` 으로 박혀 있다.** `npm install` 이 devDependencies 를 건너뛴다 — 설치가 필요하면 `NODE_ENV=development npm install --include=dev`. 반대로 `vitest` 는 `NODE_ENV=production` 으로 돌려야 한다(`vite.config.ts` 가 `mode==='test'` 일 때 덮는다).
- **`git checkout -- <path>` 는 untracked 파일을 되돌리지 못한다.** 뮤테이션 탐침 전에 `C:\Users\beom\AppData\Local\Temp\` 로 원본을 복사해 두고 그것으로 복원하라.
- **서브에이전트가 유휴 알림만 보내고 판정을 주지 않는 일이 잦다. 결과를 추정해 적지 말고 그 사실을 보고하라.** ⚠️ 미검증 — 이번 세션의 발생 건수(연구자 넷 중 셋·`pdf-research` 는 5회 요청 무응답)는 저장소에 산출물이 없어 대조 불가다. 확인할 방법: 없다. **대응책은 횟수와 무관하게 유효하다** — 판정을 못 받았으면 받지 못했다고 쓴다.
- **서브에이전트 임시 파일은 `C:\Users\beom\AppData\Local\Temp\` 아래에만.** 저장소 안에 프로브 파일을 만들면 소스 스캔 시험이 위반으로 잡는다.

---

## 10. 리스크

- **원격이 로컬보다 한참 뒤처져 있다**(`origin/master` = `28f7686`). 영향: 다른 곳에서 clone 하면 이번 세션 작업이 없다 / 대응: push 여부를 사용자에게 확인한다. 이번 세션은 push 하지 않았다.
- **`wave-assignment.json` 의 wave-6·wave-9 `blocked_notes` 가 낡았다.** wave-6 셋과 wave-9 하나(`OBS-AUDIT-011` / `G27`)가 전부 해소됐는데 파일은 그대로다 / 대응: 그 파일을 차단 판정의 근거로 쓰지 말고 MCP `get_active_target` 의 `blocked` 를 보라(2026-08-23 실측으로 **0건**).
- **이번 세션이 만든 서버 서비스가 어디에도 배선되지 않았다** — 위 「배선이 안 된 것」 참조.
- **`R160` 의 성능 수치는 합성 한국어 20,000 문서(50 MiB) 측정이다.** 실제 코퍼스가 아니므로 절대값이 아니라 갈래 간 상대 비교로만 읽어라.
- **wave 1~5 의 「완료」는 잔여를 안은 완료다**(`verdict: "pass-with-carried-residuals"`). `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` 의 `carried_residuals` 를 wave 착수 전에 읽는다.
