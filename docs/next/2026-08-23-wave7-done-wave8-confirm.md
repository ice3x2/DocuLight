# wave-7 의 planned 소진과 확인 등급 체계 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-23 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | Phase 1 의 wave 9개 중 남은 것을 완주해 원장 §4 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | **wave-7 의 `planned` 가 0건이 됐다 — 완주가 아니다.** 26건 중 15건 `implemented` · **11건 `in_progress`**. wave-8 은 33건 중 13건. **작업 커밋 11개**(`f449fe0..f745a42`) — 그 뒤 핸드오프 문서 커밋이 더 붙는다. 워킹트리 clean |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` 와 원장 `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` |
| 다음 세션 첫 행동 | 아래 「0. 다음 세션의 첫 행동」 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 이어갈 수 있도록 쓴 것이다.
>
> 검증 서브에이전트가 사실 주장 105건을 판정했다 — TRUE 95 / FALSE 4 / UNVERIFIABLE 6. **FALSE 4건은 이 문서에서 고쳤다**(가장 무거운 것은 「wave-7 완주」였고, 실제로는 11건이 `in_progress` 다). UNVERIFIABLE 은 아래에서 `⚠️ 미검증` 으로 표기했다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git -C C:/Work/git/DocuLight2.0 status --porcelain` 로 워킹트리를 확인한다. 「3. 현재 상태」와 어긋나면 사용자에게 한 줄로 알린다.
3. SpecKiwi MCP `get_active_target` 으로 활성 target 이 `phase-1` 인지 확인한다.
4. **먼저 wave-7 의 `in_progress` 11건을 닫는다.** 그 11건은 「남은 작업」의 첫 절에 이름과 남은 일이 적혀 있다. 전부 **서버 계층은 서 있고 HTTP 라우트나 화면이 없는 것**이다. 완료 조건: 11건이 `implemented` 가 되고 각각 증거가 적혀 있다.
5. 그다음 **wave-8 의 남은 확인 등급 요구 20건**을 구현한다. 착수 지점은 `FR-CONFIRM-005`(입력 폼은 관문이 아니다)와 `SEC-CONFIRM-001`(확인 단계가 존재 오라클이 되지 않는다) 다 — 둘 다 이미 선 `ConfirmGate` 부품에 시험을 붙이는 일이라 새 인프라가 없다.
6. wave-8 이 끝나면 wave-9(감사·재조정·컷오버) → wave-6(찾기 계열) 순으로 진행한다.

---

## 1. 최종 작업 목표

Phase 1 은 **wave 9개**로 분해돼 있고 배정의 정본은 `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` 이다.

**완료 조건**: 원장 §4 Phase 1 수용 기준 13개 각각에 대해 (a) 자동 시험이 그것을 재고 (b) 통과하며 (c) 해당 요구의 `#### Verification Evidence` 표에 그 시험이 적혀 있다. 수용 기준 1번(실제 볼트 읽기·편집)과 7번(한글 IME)은 수동 검증 기록으로 대체한다.

| wave | 이름 | 요구 | 상태 |
| --- | --- | --- | --- |
| 1~5 | 모노레포·ACL 코어·인증·셸·본문 표면 | 139 | 완료 (`pass-with-carried-residuals`) |
| **6** | 찾기 계열 — 링크·백링크·태그·전역 검색·MCP | 18 | **`FR-SHELL-014` 1건만 `implemented`, 나머지 17건 미착수 · 차단 없음** |
| **7** | 권한·주체 관리 화면과 이동·복사 | 26 | **`planned` 0건 · `implemented` 15 · `in_progress` 11** |
| **8** | 확인 등급 | 33 | **`implemented` 13 · `planned` 20** |
| **9** | 감사·재조정·1.0 컷오버 (Phase 1 종료 관문) | 34 | **`OBS-AUDIT-011` 1건만 `verified`, 나머지 33건 미착수** |

---

## 2. 이번 세션에 한 일

작업 커밋 11개(`f449fe0..f745a42`). 이 핸드오프 문서 자체의 커밋은 그 뒤에 붙으므로 HEAD 기준 총수는 이 표보다 크다 — 총수를 세지 말고 범위로 읽어라.

| 커밋 | 내용 |
| --- | --- |
| `70170ec` | `SEC-PRINCIPAL-002`·`SEC-PRINCIPAL-003`·`CON-PRINCIPAL-006` — `PrincipalPicker` 신설, 최소 2자·상한 20건 |
| `bae184c` | 적대 검증이 찾은 결함 수정 (아래 「적대 검증이 찾은 것」) |
| `750654a` | `DR-SHELL-002`·`IR-SHELL-004` — 개인 설정 저장소와 두 카테고리 |
| `92b6e79` | 원장 `R162`·`R163` 계열 신설 · 주체 검색에 부여 대상 스코프 도입 |
| `d90805f` | `SEC-AUTH-002`~`016` 15건 증거 대조 + 안 덮인 AC 4건을 시험으로 |
| `3d96bd8` | `FR-PRINCIPAL-001`·`002`·`009` — 슈퍼유저 전용 명부 |
| `01fcf66` | `IR-ACL-002`·`IR-ACL-003` — 공유 모달 |
| `916eef3` | `FR-PRINCIPAL-005`~`008` — 관리자 부재 배지·부여 경고 |
| `4c88af6` | `FR-PRINCIPAL-003`·`CON-PRINCIPAL-004`·`FR-PRINCIPAL-011` — 오프보딩 카드 |
| `d49f496` | 확인 등급 체계 — 도메인 `grade.ts` + 화면 `ConfirmGate.tsx` |
| `f745a42` | 확인 등급 13건 증거 기록 |

### 검증 (2026-08-23 실행)

| 명령 (cwd `C:/Work/git/DocuLight2.0`) | 결과 |
| --- | --- |
| `NODE_ENV=development npm run typecheck` | error 0 |
| `NODE_ENV=production npx vitest run --root packages/server` | 915 passed |
| `NODE_ENV=production npx vitest run --root packages/web` | 338 passed |
| SpecKiwi MCP `validate_spec` | errors 0 / warnings 1 (`SRS-W072` — 기존) |

`packages/editor` 는 이번 세션 커밋 11개에서 한 파일도 바뀌지 않았다(`git diff --name-only f449fe0..f745a42 | grep packages/editor` 가 0건). 그 스위트는 237 passed / 1 skipped 다.

### 요구 상태 (MCP `get_active_target` 실측, 2026-08-23)

| 지표 | 값 |
| --- | --- |
| total | 253 |
| `planned` | 125 |
| `implemented` | 79 |
| `in_progress` | 31 |
| `verified` | 18 |
| `blocked` | **0** |
| `missingEvidence` | **0** |

### 적대 검증이 찾은 것 (`bae184c`)

검증 서브에이전트가 `70170ec` 를 적대 검증했고 그 지적을 전부 고쳤다. ⚠️ 미검증 — 등급별 건수(CRITICAL 2 · HIGH 4 · MEDIUM 5)는 보고서가 저장소에 없어 대조할 수 없다. 확인할 방법: 없다. 다만 `bae184c` 의 diff 가 아래 서술과 정합적인 것은 `git show --stat bae184c` 로 확인된다.

- **[CRITICAL] 원장 `R112-d` 위반.** 슈퍼유저 전용 `사용자 관리` 카테고리에 중립어 `PrincipalPicker` 를 배치해 `rejected` 계정이 사라지고 `suspended` 가 `비활성` 으로 읽혔다. 그 화면은 4상태를 그대로 표시해야 한다. 배치를 뺐고, 나중에 `FR-PRINCIPAL-009` 로 별도 명부를 세웠다.
- **[CRITICAL] `SEC-PRINCIPAL-003` AC-4 를 어느 증거도 재지 않았다.** 「덮어쓸 경로 없음」을 **선언 인자 수**(`Function.length`)로 재고 있었는데, 기본값 인자와 prop 둘 다 그 검사를 그대로 빠져나간다. 값을 실제로 넘겨 보고 결과가 안 바뀌는 것으로 바꿨다.
- 「공백을 걷어낸다」를 재던 시험이 공허했다 — 걷어내지 않아도 같은 빈 목록이 나온다.
- 배지를 개수로만 재어 **빈 배지** 셋도 합격했다.
- 소스 스캔이 식별자 하나만 봐서 `fetch` 를 직접 부르는 두 번째 검색 부품이 통과했다.

---

## 3. 현재 상태

- 브랜치 `master`. `git status --porcelain` **비어 있음** — 2026-08-23 확인.
- 이 핸드오프 문서와 `docs/next/LATEST.md` 는 커밋 `e548aa9` 로 이미 들어갔고, 검증 판정을 반영한 수정이 그 뒤 한 번 더 커밋됐다.
- 원격(`origin/master`)은 `28f7686` 로 로컬보다 한참 뒤처져 있다. **push 하지 않았다.**

---

## 4. 관련 문서·코드 (절대경로)

| 무엇 | 경로 |
| --- | --- |
| SSOT 진입점 | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` |
| **원장** | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` |
| wave 배정 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` |
| 확인 등급 SRS | `C:\Work\git\DocuLight2.0\docs\spec\11.confirmation-grades.srs.md` |
| 감사 SRS | `C:\Work\git\DocuLight2.0\docs\spec\12.audit-log.srs.md` |
| ACL SRS | `C:\Work\git\DocuLight2.0\docs\spec\10.access-control.srs.md` |
| 주체 SRS | `C:\Work\git\DocuLight2.0\docs\spec\16.principal.srs.md` |
| 셸 SRS | `C:\Work\git\DocuLight2.0\docs\spec\08.app-shell.srs.md` |
| 직전 핸드오프 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-23-search-decisions-and-wave7.md` |

### 이번 세션이 새로 만든 소스

| 파일 | 무엇 |
| --- | --- |
| `C:\Work\git\DocuLight2.0\packages\server\src\domain\confirm\grade.ts` | 확인 등급 체계 — 도출·배정표·넓히기·보존 축소·새 버전 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\confirm\reach-service.ts` | 적용 하위 노드 수 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\principal\principal-search-service.ts` | 주체 검색(최소 2자·상한 20건·`rejected` 제외) |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\principal\search-scope.ts` | 검색 스코프 해석과 인가 (`R162`) |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\principal\roster-service.ts` | 슈퍼유저 전용 명부와 그룹 삭제 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\principal\offboarding-service.ts` | 오프보딩 카드(파생)와 회수 안내 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\acl\share-service.ts` | 공유 모달의 직접·상속 항목 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\workspace\admin-presence.ts` | 마지막 관리자 판정·adminless·부여 경고 |
| `C:\Work\git\DocuLight2.0\packages\server\src\app\settings\personal-settings.ts` | 개인 설정 셋 |
| `C:\Work\git\DocuLight2.0\packages\server\src\infra\sqlite\personal-setting-store.ts` | `personal_setting` 어댑터 |
| `C:\Work\git\DocuLight2.0\packages\server\src\infra\sqlite\migrations\017_personal_setting.sql` | 그 표 |
| `C:\Work\git\DocuLight2.0\packages\web\src\confirm\ConfirmGate.tsx` | 세 등급을 그리는 **하나뿐인** 확인 부품 |
| `C:\Work\git\DocuLight2.0\packages\web\src\principal\PrincipalPicker.tsx` | 주체를 고르는 **하나뿐인** 부품 |
| `C:\Work\git\DocuLight2.0\packages\web\src\principal\UserRoster.tsx` | 4상태 그대로 표시하는 명부 |
| `C:\Work\git\DocuLight2.0\packages\web\src\principal\GroupRoster.tsx` | 그룹과 멤버 |
| `C:\Work\git\DocuLight2.0\packages\web\src\principal\OffboardingCard.tsx` | 오프보딩 카드 (상태 없음) |
| `C:\Work\git\DocuLight2.0\packages\web\src\acl\ShareModal.tsx` | 공유 모달 |
| `C:\Work\git\DocuLight2.0\packages\web\src\acl\GrantConfirm.tsx` | 부여·회수 경고 |
| `C:\Work\git\DocuLight2.0\packages\web\src\workspace\WorkspaceList.tsx` | `관리자 없음` 배지 |
| `C:\Work\git\DocuLight2.0\packages\web\src\workspace\NewWorkspaceForm.tsx` | 생성 폼 |
| `C:\Work\git\DocuLight2.0\packages\web\src\settings\PersonalSettings.tsx` | 에디터·외모 카테고리 |

`packages/web/src/principal/PrincipalSearch.tsx` 는 삭제됐다 — `PrincipalPicker.tsx` 가 그 자리를 대신한다.

### 선례로 쓸 시험

- `C:\Work\git\DocuLight2.0\packages\server\test\app\principal\search-scope.test.ts` — 문턱을 재는 시험이 **그 문턱을 실제로 재는지** 확인한 예(워크스페이스에 직접 부여해야 잰다)
- `C:\Work\git\DocuLight2.0\packages\web\test\offboarding.test.tsx` — 소스 스캔에서 **낱말이 아니라 그리는 자리**를 세는 예. 낱말을 세면 규칙을 설명하는 주석이 위반으로 잡힌다
- `C:\Work\git\DocuLight2.0\packages\server\test\app\principal\roster.test.ts` — 원자성을 앱 코드가 아니라 **스키마 선언과 pragma** 로 재는 예

---

## 5. 확정된 결정 (변경 금지)

### 이번 세션에 3축 서브에이전트 심의로 확정한 것

| # | 결정 | 조항 |
| --- | --- | --- |
| 1 | **주체 검색은 부여 대상 스코프를 필수로 받는다.** 노드는 그 노드 `편집` 이상, 워크스페이스 관리자 지정은 그 워크스페이스 `관리`, 그룹 멤버 추가는 슈퍼유저 | `R162` |
| 2 | 대상이 없거나 자격이 없으면 **통일 404** — 「권한 없음」과 「없는 대상」을 가르지 않는다 | `R162-a` |
| 3 | 스코프는 조작의 대상이지 규칙 값이 아니다 — 최소 길이·상한은 여전히 인자로 받지 않는다 | `R162-b` |
| 4 | 결과 집합에 워크스페이스·접근 가능 여부 필터를 걸지 않는다 — 좁히면 그 목록이 접근자 명단 오라클이 된다 | `R162-c` |
| 5 | Phase 2 멘션 자동완성은 `R162` 로 닫히지 않는다 (`G35` ② 유보) | `R162-d` |
| 6 | **`R112-e` 의 단일 부품 제약은 `R112-b`(2자·20건)가 걸리는 화면에만 적용된다.** 슈퍼유저 전용 관리 화면은 명부 목록이며 별도 엔드포인트를 쓴다 | `R163` |
| 7 | 그 명부 엔드포인트는 슈퍼유저 외에 통일 404 로 답한다 | `R163-a` |
| 8 | `CON-PRINCIPAL-006` AC-2 의 판정은 「`R112-b` 가 걸리는 표면을 자체 구현했는가」로 한다 | `R163-b` |

3축(보안·엔터프라이즈 운영·아키텍처)이 결정 1에 **만장일치**, 결정 6에 실질 만장일치였다. 사용자가 알려 준 Phase 2 조직도(슈퍼유저가 관리자를 지정하면 그 관리자가 자기 하위 디렉토리에 부여)가 결정 1을 굳혔다 — 위임받은 사람이 갖는 것은 그 서브트리의 `편집` 이고 그것은 상속으로 이미 내려가므로, 위임이 깊어져도 조항 문면이 바뀌지 않는다.

### SRS 개정

- `CON-PRINCIPAL-006` **AC-3 을 개정했다** — 배지 문구·최소 질의 길이·결과 상한은 `PrincipalPicker` 안에, **상태 노출 범위는 서버가** 소유한다. 엔드포인트는 화면 없이도 부를 수 있어 부품에만 두면 규칙이 아니라 장식이 된다.
- `IR-SHELL-002` 는 이전 세션에 카테고리 13→14 로 개정됐다(그대로 유효).

### 이전 세션에서 확정돼 계속 유효한 것

- 검색 필터 기본값은 **`문서 제목`** 하나 · 마지막 조합을 브라우저에 캐시 (`R155`). `R161` 이 그 축을 「이름」으로 다시 읽게 했으나 그것은 **비-md 노드를 흡수하는 규칙**이지 필터 기본값의 이름이 아니다
- 결과 건수는 언제나 「거른 뒤」 (`R156`)
- 텍스트 색인은 비동기 백그라운드 · 색인 대기열은 설정 모달 열넷째 카테고리 (`R157`·`R157-a`·`R157-b`)
- Phase 1 은 폴링·푸시를 두지 않는다 — 유예다 (`R158`)
- 목록 이름순 정렬 · 로케일 `ko` 고정 · 디렉토리 먼저 (`R159`)
- 한국어 일치 단위는 겹치는 2글자(bigram) 파생 색인 (`R160`)
- 비-md 노드는 첫째 축으로 흡수 · PDF 는 본문 축의 확장 (`R161`)
- 감사 보존 기본 365일 · 감사 ≥ 휴지통 (`R154`·`R154-a`)

### 작업 방식 (계속 적용)

- **모든 검증은 서브에이전트로.** 자기 산출물을 자기가 검증하지 않는다
- **커밋 메시지에 AI 시그니처 금지.** 제목에 `Phase {n}`·`Step {n}` 표식도 넣지 않는다
- **TDD 강제.** 실패 시험 먼저, red 확인 후 최소 구현
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다.** 이번 세션에 이 관행이 결함 다섯을 잡았다

---

## 6. 아직 열린 것

| 무엇 | 상태 |
| --- | --- |
| **`G39`** | **신규.** 주체 검색 호출이 감사되지 않고 요청 빈도 제한이 없는데 `R162` 로 호출자 집합이 단조 증가한다. `R14`·`R14-c`·`R110` 으로 `편집` 부여는 쌓이기만 한다. **Phase 1 을 막지 않는다** |
| **`G40`** | **신규.** `R163` 명부 엔드포인트의 페이지네이션·정렬 기본값이 없다. **Phase 1 을 막지 않는다** |
| **`G37`** | 열려 있다. 보존 만료로 사라지는 감사 행을 참조하던 재조정 대기열 항목의 처분. **wave-9 범위** |
| **`G36` ③** | 부분 종결. 건수의 *의미*는 `R156` 으로 닫혔고 상한 값·발췌 길이는 열려 있다 |
| **`G14`·`G14-a`** | Phase 1 한정 유예 (`R158`) |
| **`G15`·`G16`·`G23`·`G29`·`G30`·`G32`·`G33`·`G34`·`G35`** | 열려 있다. Phase 1 을 막지 않는다 |
| **PDF `#page=N` 프래그먼트** | 실측하지 않았다. Phase 2 착수 시 재고 |
| **tombstone 복사** | 어느 AC 도 이 축을 정하지 않았다. `deep-copy.test.ts` 가 관측 거동을 고정해 두었다 |

---

## 7. 남은 작업

### A. wave-7 의 `in_progress` 11건 — **여기부터**

2026-08-23 실측. 전부 **서버 계층은 서 있고 HTTP 라우트나 화면이 없다.**

| 요구 | 남은 일 |
| --- | --- |
| `IR-ACL-001` · `SEC-ACL-015` | 접근자 지표 둘(`accessorsOf`)이 라우트에 닿지 않는다. `packages/server/src/app/acl/accessor-service.ts` |
| `FR-ACL-002` · `FR-ACL-006` | 이동·복사 프리뷰(`movePreview`·`copyPreview`)가 라우트에 닿지 않는다. `packages/server/src/app/acl/relocation-preview-service.ts` |
| `FR-ACL-003` · `FR-PRINCIPAL-004` · `FR-PRINCIPAL-010` | 주체 축 일괄 회수(`previewRevocation`·`revokeAllFor`)가 라우트에 닿지 않는다. `packages/server/src/app/acl/bulk-revoke-service.ts` |
| `FR-ACL-004` | 시뮬레이션(`simulate`)이 라우트에 닿지 않는다. `packages/server/src/app/acl/simulation-service.ts` |
| `FR-ACL-005` | 상속 끊김 목록(`brokenInheritanceOf`)이 라우트에 닿지 않는다. `packages/server/src/app/acl/inheritance-audit-service.ts` |
| `CON-PRINCIPAL-006` | AC-1 이 이름 댄 세 화면 중 공유 모달만 섰다. 워크스페이스 관리자 지정·그룹 멤버 추가가 남았다 |
| `SEC-SHELL-003` | 깊은 복사는 섰으나 복사 조작이 화면에서 실행되는 경로가 없다 |

- [ ] **A-1** 위 여섯 서비스에 HTTP 라우트를 붙인다. 완료 조건: `grep -rn "previewRevocation|revokeAllFor|simulate|brokenInheritanceOf|movePreview|copyPreview" packages/server/src/http/` 가 0건이 아니고, 각 라우트의 인가가 요청으로 재어진다
- [ ] **A-2** 그 라우트를 쓰는 화면을 세운다 — `권한 감사` 카테고리(시뮬레이션·상속 끊김·일괄 회수)와 트리 컨텍스트 메뉴(이동·복사 프리뷰)
- [ ] **A-3** 11건을 `implemented` 로 올리고 증거를 적는다

### B. wave-8 — 확인 등급 나머지 20건

`docs/spec/11.confirmation-grades.srs.md` 에서 `Status | planned` 인 것들이다. 2026-08-23 실측 목록:

`FR-CONFIRM-005` · `FR-CONFIRM-009` · `FR-CONFIRM-013` · `FR-CONFIRM-014` · `FR-CONFIRM-015` · `FR-CONFIRM-016` · `FR-CONFIRM-017` · `FR-CONFIRM-018` · `FR-CONFIRM-019` · `FR-CONFIRM-020` · `FR-CONFIRM-021` · `FR-CONFIRM-022` · `FR-CONFIRM-023` · `SEC-CONFIRM-001` · `SEC-CONFIRM-004` · `SEC-CONFIRM-005` · `SEC-CONFIRM-006` · `SEC-CONFIRM-007` · `DR-CONFIRM-001` · `CON-CONFIRM-001`

- [ ] **B-1** `FR-CONFIRM-005`(입력 폼은 관문이 아니다) · `SEC-CONFIRM-001`(확인 단계가 존재 오라클이 되지 않는다) — **여기부터.** 완료 조건: 두 요구의 AC 가 `ConfirmGate` 위의 시험으로 재어진다
- [ ] **B-2** `FR-CONFIRM-009`(오프보딩 멤버십 제거 L2 + 그룹 이름 전량 나열) · `FR-CONFIRM-013`(컨테이너 공통 상속 고지) — 완료 조건: 둘의 AC 가 재어진다
- [ ] **B-3** 나머지 16건의 AC 를 읽고 묶어 구현. 완료 조건: 20건이 `implemented` 이상이고 증거가 적혀 있다

### C. wave-9 — 감사·재조정·1.0 컷오버 (요구 34건 · **Phase 1 종료 관문**)

- [ ] **C-1** 34건 상태 확인 → **B-2** `docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\design-baseline\wave-9.md` 정독
- [ ] **C-3** `G37` 판정 — 완료 조건: 만료 처분이 원장에 조항으로 기록됐다
- [ ] **C-4** TDD 구현 · **C-5** 수용 기준 1번 수동 검증 기록 · **B-6** 수용 기준 13번 자동 검증

### D. wave-6 — 찾기 계열 (요구 18건 · 차단 없음)

- [ ] **D-1** `R160` bigram 파생 색인 — 완료 조건: 한국어 2자 질의가 어절 중간까지 걸린다. **`FR-SHELL-014` 는 이미 `implemented` 다** — 그 AC 를 새로 통과시키는 것이 아니라 기존 시험을 깨지 않는 것이 조건이다
- [ ] **D-2** `R157` 비동기 색인 워커 + `R157-a` 색인 대기열 화면. **`인스턴스 설정` 다섯 값에 섞지 마라**
- [ ] **D-3** `FR-SHELL-013` 구현(AC 열둘) · `R161` PDF 본문 색인(페이지 번호 포함)
- [ ] **D-4** MCP 서버 패키지 신설

### E. 화면 배선이 남은 것

이번 세션이 만든 부품 여럿이 **`App.tsx` 에 연결되지 않았다.** `grep -rn "ShareModal\|ConfirmGate\|OffboardingCard\|NewWorkspaceForm\|WorkspaceList" packages/web/src/App.tsx packages/web/src/shell/AppShell.tsx` 로 확인할 것.

- [ ] **E-1** `ShareModal` 을 트리 컨텍스트 메뉴에 잇는다
- [ ] **E-2** `ConfirmGate` 를 휴지통 영구 삭제·그룹 삭제·PAT 폐기 경로에 잇는다
- [ ] **E-3** `OffboardingCard` 를 `사용자 관리` 화면과 주체 일괄 회수 화면 양쪽에 잇는다 (`CON-PRINCIPAL-004` AC-2)
- [ ] **E-4** `NewWorkspaceForm`·`WorkspaceList` 를 `워크스페이스` 카테고리에 잇는다

배선되지 않은 서버 서비스도 남아 있다 — `previewRevocation`·`revokeAllFor`·`simulate`·`brokenInheritanceOf`·`movePreview`·`copyPreview` 여섯은 어떤 HTTP 라우트에도 닿지 않는다(이전 세션에 만든 것들이며 이번 세션에도 배선하지 않았다).

### F. `in_progress` 로 남은 31건

MCP `list_requirements --status in_progress` 로 목록을 얻는다. 대부분 **서버 계층만 서고 화면·라우트가 없는 것**이다.

### G. 자동 검증이 닿지 않는 자리

- [ ] **G-1** `FR-EDITOR-007` AC-7 브라우저 확인 — `C:\Work\git\DocuLight2.0\packages\editor\test\live-preview.test.tsx` 에 사유를 적어 `it.skip` 으로 남아 있다
- [ ] **G-2** 원장 §4 수용 기준 7번(한글 IME) 수동 검증

### H. wave 1~5 이월 잔여

- [ ] **H-1** `W5-01` — wave-4·5 가 독립 검증을 받지 못했다
- [ ] **H-2** `W5-03` — Playwright E2E 미수행
- [ ] **H-3** `W5-04` — `FR-STORAGE-008` 의 실물 이동 축

### I. 소소한 잔존

- [ ] **I-1** `C:\Work\git\DocuLight2.0\packages\web\src\principal\PrincipalPicker.tsx` 디바운스 없음 — 두 글자 이상에서 타건마다 요청이 나간다. 어느 AC 도 요청 빈도를 정하지 않는다
- [ ] **I-2** 노드 영구 삭제 후 `favorite` 표에 죽은 행이 남음
- [ ] **I-3** `C:\Work\git\DocuLight2.0\packages\server\src\http\routes\workspace-api.ts` 의 `one()` 이 깊게 중첩된 JSON 배열에 500. ⚠️ 미검증 — 재현하지 않았다. 확인할 방법: 서버를 띄우고 깊게 중첩된 배열을 그 엔드포인트에 보낸다

---

## 8. 다음 세션 지시서

1. **A-1 부터 시작한다** — wave-7 의 `in_progress` 11건에 라우트를 붙인다. 그다음이 wave-8 의 `FR-CONFIRM-005`·`SEC-CONFIRM-001` 이다.
   → 검증: 11건이 `implemented` 가 되고 `NODE_ENV=production npx vitest run --root packages/server` 이 통과한다.
2. **각 묶음마다 TDD.** 실패 시험 먼저 → red 확인 → 최소 구현 → 뮤테이션 탐침으로 그 시험이 실제로 재는지 확인.
3. **묶음이 끝나면 커밋하고 검증 서브에이전트를 띄워 그 커밋 범위를 적대적으로 검증한다.**
4. wave-8 이 끝나면 wave-9 → wave-6 순으로. wave-6 은 새 인프라(bigram 색인·비동기 워커·MCP 패키지)가 커서 마지막에 둔다.

---

## 9. 게이트·함정

### 지켜야 할 규칙

- **SpecKiwi 황금률**: MCP mutation 을 부른 뒤 **같은 SRS 파일에 `Edit` 도구를 쓰지 않는다.**
- **`verified` 요구는 세분 편집이 막혀 있다.** 고치려면 `update_status` 로 내렸다가 개정 후 되돌린다.
- **`C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 읽기 전용.** `C:\Work\git\DocuLight` 자체는 git 저장소가 아니고 실제 루트는 그 하위 `DocLight` 다.
- 개발 서버 포트 **3399**(web), 3400(server dev API).

### 이번 세션에 실제로 밟은 함정

- **MCP 인자에 한글 유니코드 이스케이프를 쓰면 오타가 난다. 한글을 직접 넣어라.** ⚠️ 미검증 — 발생 사례(「댑」→「댄」)는 같은 턴에 교정돼 저장소에 남지 않았다. 확인할 방법: 없다. **함정 자체는 이스케이프를 쓰지 않으면 성립하지 않는다.**
- **`append_section_note` 가 날짜를 자동으로 붙인다.** 본문에 날짜를 또 적으면 `[2026-08-22] [2026-08-23]` 처럼 두 번 찍힌다. 날짜를 적지 마라.
- **`append_section_note` 의 섹션 이름은 `implementation_notes` 형태다.** `Implementation Notes`·`implementation` 은 `unknown section` 으로 거절된다. `change_notes` 는 **존재하지 않는다** — Change Notes 표를 쓰는 MCP 도구가 없다.
- **`list_requirements` 의 `projection` 은 `ids`·`compact`·`full` 셋뿐이다.** `summary` 는 거절된다.
- **`edit_requirement_table_rows` 의 컬럼명은 소문자다** — `notes`·`covers`·`type`·`reference`. `Notes` 는 거절된다.
- **뮤테이션 탐침의 원본 복사는 탐침 직전에 뜬다.** 작업 전에 떠 두면 그 사이의 리팩터가 복원과 함께 되돌아온다. ⚠️ 미검증 — 이번 세션에 `roster-service.ts` 에서 그것을 겪었다는 서술은 워킹트리 사건이라 커밋 이력에 남지 않는다. 확인할 방법: 없다.
- **bash heredoc 에 긴 Python 을 넣으면 인용이 깨진다.** 스크래치패드(`C:\Users\beom\AppData\Local\Temp\claude\...\scratchpad\`)에 `.py` 파일로 쓰고 실행하라.
- **PowerShell here-string(`@'...'@`)을 bash 에 쓰면 커밋 메시지에 `@` 가 섞인다.** 긴 커밋 메시지는 파일에 쓰고 `git commit -F` 를 쓴다.
- **`NODE_ENV` 가 이 셸에 `production` 으로 박혀 있다.** 설치가 필요하면 `NODE_ENV=development npm install --include=dev`. `vitest` 는 `NODE_ENV=production` 으로 돌린다.
- **서브에이전트 임시 파일은 `C:\Users\beom\AppData\Local\Temp\` 아래에만.** 저장소 안에 프로브 파일을 만들면 소스 스캔 시험이 위반으로 잡는다.
- **소스 스캔 시험은 주석을 걷어내고 세라.** 「이 부품을 쓰지 마라」를 주석에 적으려면 그 이름을 인용할 수밖에 없어, 낱말을 세면 규칙을 설명한 파일이 위반으로 잡힌다.

---

## 10. 리스크

- **원격이 로컬보다 한참 뒤처져 있다**(`origin/master` = `28f7686`). 영향: 다른 곳에서 clone 하면 이번 세션 작업이 없다 / 대응: push 여부를 사용자에게 확인한다.
- **이번 세션이 만든 화면 부품 다섯이 앱에 배선되지 않았다** — 위 「화면 배선이 남은 것」 참조. 시험은 부품을 직접 렌더해 재므로 통과하지만, 브라우저에서는 그 화면들이 보이지 않는다.
- **`wave-assignment.json` 의 `blocked_notes` 가 낡았다.** 차단 판정의 근거로 쓰지 말고 MCP `get_active_target` 의 `blocked` 를 보라(2026-08-23 실측으로 **0건**).
- **`R160` 의 성능 수치는 합성 한국어 20,000 문서 측정이다.** 절대값이 아니라 갈래 간 상대 비교로만 읽어라.
- **wave 1~5 의 「완료」는 잔여를 안은 완료다**(`verdict: "pass-with-carried-residuals"`). `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` 의 `carried_residuals` 를 wave 착수 전에 읽는다.
