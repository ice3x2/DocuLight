# 남은 축을 오케스트레이터로 완주한다 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-09-02 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 사용자 지시: **다음 세션부터 오케스트레이터가 되어 남은 작업을 끊김없이 완성까지 자동으로 진행한다.** 구체적으로는 아래 「남은 작업 전체 목록」의 A·C·E 축을 순서대로 닫는다 |
| 현재 상태 | Phase 1 요구 242건이 `implemented`, 18건이 `verified`, `in_progress` 1건(그 하나는 Phase 2 사유로 정당하게 열려 있음). **워킹트리 clean — 이 핸드오프까지 커밋했다** |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` (원장) + `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` (수용 기준 대조표) |
| 다음 세션 첫 행동 | 원장 `G37` 을 판정한다 — 이 세션이 보존 일소를 배선하면서 그 공백이 이론에서 실제로 바뀌었다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 둘만 읽고** 자율적으로 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `C:\Work\git\DocuLight2.0\docs\analysis\phase1-acceptance-matrix.md` 의 「지금 서 있는 자리」 절을 정독한다 — 이 세션이 무엇을 닫았고 무엇을 남겼는지가 거기 있다.
3. `cd C:\Work\git\DocuLight2.0 && git status --porcelain && git log --oneline -3` 으로 워킹트리가 아래 「현재 워킹트리·저장소 상태」와 일치하는지 확인한다.
4. **`G37` 판정부터 시작한다.** 원장 `docs/spec/00.decision-log.md` 683행의 `G37` 항목을 읽고, 아래 「확정된 결정」의 판정 위임 규칙에 따라 결정한 뒤 원장에 판정 문단을 남긴다.
5. 그다음 아래 「다음 세션 지시서」의 순서를 그대로 따른다.

## 1. 최종 작업 목표

사용자 지시는 **「다음 세션부터 당신이 오케스트레이터가 되어서 작업을 끊김없이 완성까지 자동으로 진행할 것」**이다. 묻지 말고 진행하되, 아래 「거버넌스·게이트·함정」의 세 가지 예외에서만 멈춘다.

**완료 조건** — 아래 셋이 모두 참일 때 이 목표가 끝난 것이다.

1. 아래 「남은 작업 전체 목록」의 **A 축(Phase 1 잔여)과 C 축(원장 공백 중 Phase 1 이 연 것)이 전부 닫혔다.**
2. `implemented` 242건 중 **AC 전건이 자동 시험으로 재어지는 것들이 `verified` 로 승급됐다** (E-1). 승급하지 못한 것은 그 사유가 요구의 Implementation Notes 에 적혀 있다.
3. `npm run typecheck` 오류 0 · 세 패키지 vitest 전건 통과 · 브라우저 검사 열다섯 전건 통과가 유지된다.

**범위 밖** — D 축(Phase 2 요구 열하나)은 착수하지 않는다. 제약 C-04 와 원장 R55·R92 가 그것을 금지한다.

## 2. 현재까지 완료한 작업

이 세션이 한 일이다. **커밋 열둘** — `git log --oneline e92b471~1..HEAD | wc -l` 결과 12 (2026-09-02 실행). 전부 2026-09-01 자 타임스탬프다.

- [x] **원장 §4 에 수용 기준 14(인증 왕복) 신설** — 커밋 `e92b471`. 원장이 열어 둔 〔판정 필요 · 2026-08-19〕를 「① 기준을 추가한다」로 닫았다
- [x] **인증 축 네 겹 배선** — 커밋 `cd027e2`. 로그인 폼(자리표였음) · 로그아웃 `onClick`(없었음) · 비밀번호 변경 `onClick`(없었음) · `POST /api/auth/password`(라우트 자체가 없었음)
- [x] **즐겨찾기 해제·여는 링크·트리 토글** — 커밋 `30022ca`. `FR-SHELL-001` AC-5·AC-6, `FR-SHELL-003` AC-2 정정·AC-7 신설
- [x] **합성 볼트** — 커밋 `87c7d28`. `packages/server/test/support/synthetic-vault.ts` 와 `packages/server/test/app/reconciliation/synthetic-vault.test.ts`
- [x] **문서 원문 서빙을 조립에 배선 + 재조정 원자성 + 경로 N+1** — 커밋 `661a4bd`
- [x] **가입 신청·승인 (서버 라우트 여섯 + 화면 둘)** — 커밋 `c55f179`. 라우트는 `POST /signup` · `POST /instance/signup-mode` · `GET /instance/signup-mode` · `POST /roster/users/:userId/approve` · `.../reopen` · `.../status`. 화면은 `CredentialForm.tsx`·`SignupApproval.tsx` 신설이고 `LoginForm.tsx` 를 그 공용화로 삭제했다. `IR-AUTH-001` 을 `implemented` 로 승급
- [x] **저장 시 벡터 색인 + 보존 기간 일소 주기 작업** — 커밋 `d7d5077`
- [x] **브라우저 인증 왕복 검사** — 커밋 `c7e88c5`·`3d4d8e7`. `packages/web/test/auth-round-trip-check.mjs`, 11 판정
- [x] **검증** — `npm run typecheck` 오류 0 (2026-09-02 실행). `packages/server` 에서 `npx vitest run` 결과 **134 파일 1385 통과**, `packages/web` 에서 **55 파일 620 통과**, `packages/editor` 에서 **21 파일 253 통과 + 1 skip** (셋 다 2026-09-02 실행)
- [x] **브라우저 검사 열다섯 전건 통과** — web 아홉(인증 11 · focus 5 · ime 3 · search 4 · merge 7 · styles 3 · acl 8 · trash 5 · gestures 4) · editor 여섯(12·4·7·2·4·6). 2026-09-01~02 실행. **⚠️ 이 항은 서버·web·계정이 살아 있어야 재현된다** — 정적 대조(스크립트 수 15 · 각 스크립트의 성공 경로 `check()` 호출 수)는 2026-09-02 독립 검증에서 문서의 숫자와 하나도 어긋나지 않았으나, 실행 자체는 그 검증자가 재현하지 못했다
- [x] **배포 형태 검증** — `npm run build` 뒤 그 산출물을 서빙하는 서버(포트 3440)에 `WEB_URL` 을 걸어 web 검사 아홉을 다시 돌려 전건 통과. 2026-09-02 실행. **⚠️ 위와 같은 이유로 독립 검증자가 재현하지 못했다** — 절차는 `CLAUDE.md` 에 적혀 있으니 다음 세션이 직접 한 번 돌려 확인하라

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 「`walk()` 이 심링크 순환 방지가 없어 무한 재귀 위험」(독립 조사가 보고) | **위험이 아니다.** `readdir(withFileTypes)` 의 `Dirent.isDirectory()` 는 lstat 의미라 디렉토리 심링크에 거짓을 준다 — 따라가지 않는다. 이 기계에서는 `fs.symlinkSync` 가 `EPERM` 이라 시험도 못 세운다 |
| 「재조정이 경로 512바이트 상한을 우회하는 것은 결함」(독립 조사가 보고) | **결함이 아니다.** `FR-WORKSPACE-004` 의 주어가 「노드 생성·개명·업로드」이고 재조정은 그 셋이 아니다. `sed -n '/### FR-WORKSPACE-004/,/#### Acceptance/p' docs/spec/13.workspace.srs.md` 로 문면 확인 |
| 「`documents.ts` 에 `guardDotPath` 를 한 겹 더 두면 방어가 두터워진다」(내 판단) | **중복이었다.** 그 호출을 `if (false)` 로 무력화하고 `npx vitest run test/http/` 를 돌리니 249 항 전건 통과 — 죽는 항이 하나도 없었다. `isServable` 이 같은 것을 이미 막는다. 되돌렸다 |
| 「승인 조작을 `UserRoster` 에 넣는다」(내 초기 구현) | **설계와 어긋났다.** `docs/spec/04.screen-design-settings.md` §2.10 이 가입 승인을 **별도 카테고리**로 두었다. `SignupApproval.tsx` 로 옮겼다 |

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master`. **이 문서와 `LATEST.md` 까지 커밋했으므로 `git status --porcelain` 은 빈 출력이어야 한다.** 무언가 보이면 그 사이 누군가 작업한 것이니 저장소를 믿고 이 문서의 서술을 의심하라
- 이 핸드오프는 커밋 **`docs(next): 오케스트레이터 완주를 위한 핸드오프를 남긴다`** 로 저장소에 들어갔다. **해시를 적지 않는 이유는 이 문장이 그 커밋 안에 있기 때문이다** — 해시를 적으면 커밋할 때마다 자기 참조가 어긋난다
- 최신 커밋: 이 핸드오프를 담은 `docs(next): 오케스트레이터 완주를 위한 핸드오프를 남긴다`. 그 앞이 `f0b721b docs: 버전 실체 미결 행을 정정한다`, 그 앞이 `2d1de08 docs: 배포 형태에서 브라우저 검사를 돌리는 절차를 적는다`
- 원격: `origin` = `B:/work/git/DocuLight2.0.git`(경로 실재). `master` 에 upstream 이 **설정돼 있지 않아** `git status` 가 ahead/behind 를 알리지 않는다(`git rev-parse --abbrev-ref --symbolic-full-name @{u}` → `fatal: no upstream configured for branch 'master'`). 다만 `origin/master` 참조는 있어 실측된다: 원격은 `65a5f96` 이고 **로컬이 35 커밋 앞서며 뒤처진 것은 0** 이다(이 핸드오프와 대조표 정정 둘을 포함한 수. `git rev-list --count origin/master..HEAD` 로 재확인하라)
- 커밋 수: `git rev-list --count HEAD` 결과 371 (2026-09-02 실행)

## 4. 관련 문서·코드 (절대경로)

`<REPO>` = `C:\Work\git\DocuLight2.0`

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 원장 (SSOT) | `<REPO>\docs\spec\00.decision-log.md` | 모든 결정의 정본. **§3.2**(639행~)의 표가 미결 공백 `G8`~`G40`, **§4**(690행~)가 Phase 1 수용 기준 열넷 |
| 수용 기준 대조표 | `<REPO>\docs\analysis\phase1-acceptance-matrix.md` | 기준마다 무엇이 재고 있는지. 「지금 서 있는 자리」 절에 이 세션의 결과 |
| SRS 색인 | `<REPO>\docs\spec\00.index.md` | Target Map · 상태 요약 |
| 셸 화면 설계 | `<REPO>\docs\spec\03.screen-design-shell.md` | 트리·탭·컨텍스트 메뉴 |
| 설정 화면 설계 | `<REPO>\docs\spec\04.screen-design-settings.md` | §2.10 이 가입 승인 화면 |
| 저장소 규약 | `<REPO>\CLAUDE.md` | 브라우저 검사 절차 · 포트 규약 · 게이트 자동 승인 |

**조립 방벽** — `<REPO>\packages\server\test\arch\assembly.test.ts`. 이 파일의 `아직_배선되지_않음` Map 이 **「부품은 있는데 진입점에 붙지 않은」 것의 목록**이다. 이 세션이 여덟 중 다섯을 이었고 남은 셋은 의도된 것이다(사유가 그 Map 에 적혀 있다).

**이 세션이 만든 주요 파일**

| 절대경로 | 역할 |
| --- | --- |
| `<REPO>\packages\web\src\auth\CredentialForm.tsx` | 로그인·가입 신청이 공유하는 폼 |
| `<REPO>\packages\web\src\principal\SignupApproval.tsx` | 가입 승인 화면(두 탭) |
| `<REPO>\packages\server\src\app\retention\retention-loop.ts` | 감사·휴지통 보존 일소 주기 작업 |
| `<REPO>\packages\server\test\support\synthetic-vault.ts` | 옵시디언 볼트 성질 여섯을 합성 |
| `<REPO>\packages\web\test\auth-round-trip-check.mjs` | 인증·가입 왕복 브라우저 검사(11 판정) |
| `<REPO>\packages\server\test\http\documents-assembly.test.ts` | 운영 조립이 서빙·색인·보존을 세우는지 |
| `<REPO>\packages\server\test\infra\sqlite\node-paths.test.ts` | 경로 조회의 질의 수를 센다 |

## 5. 확정된 결정 (변경 금지)

1. **오케스트레이터로 자율 진행** — 사용자가 2026-09-02 에 「다음 세션부터 당신이 오케스트레이터가 되어서 작업을 끊김없이 완성까지 자동으로 진행할 것」이라고 지시했다 — **확정**. (근거: 이 문서의 「최종 작업 목표」)
2. **결정 게이트에서 권장안을 고른다** — 사용자가 2026-09-01 에 「결정 게이트가 나오면 항상 권장사항을 선택하시오」라고 지시했다 — **확정**. 권장이 없으면 가장 되돌리기 쉬운 쪽을 고른다. (근거: `<REPO>\CLAUDE.md` 「Gate decisions」 절이 같은 규칙을 이미 담고 있다)
3. **판정 위임** — 권장·추천이 붙은 결정은 서브에이전트 1명이 타당성만 검토하고 자동 채택한다. 권장이 없으면 5명 결정위원회를 띄운다 — **확정**. (근거: 사용자 지시 2026-08-29, `C:\Users\beom\.claude\projects\C--Work-git-DocuLight2-0\memory\decision-delegation-and-draft-gate.md`)
4. **`draft` 요구도 `evolving` 으로 구현하는 것은 상시 승인** — **확정**. (근거: 같은 메모리 파일)
5. **Phase 2 는 착수하지 않는다** — `CON-ACL-005`·`CON-EDITOR-003`·`CON-EDITOR-005`·`FR-ATTACH-007`~`011`·`FR-WORKSPACE-007`·`008`·`SEC-ATTACH-004` 열하나 — **확정**. (근거: 제약 C-04 와 원장 R55·R92. `docs/spec/00.index.md` 37행이 phase-2 를 `planned` 로 둔다)
6. **`SEC-STORAGE-007` AC-3 은 열어 둔다** — 워크스페이스 아카이브 조작 자체가 Phase 2 이므로 이 AC 는 phase-1 에서 닫을 수 없다 — **확정**. (근거: 그 요구의 Implementation Notes 2026-08-27 항이 제약 C-04 를 인용한다)
7. **`dot-path-guard.ts` 는 배선하지 않는다** — `documents.ts` 에 한 겹 더 두어 봤으나 무력화해도 죽는 항이 없어 `isServable` 과 중복임이 실측됐다 — **확정**. (근거: `packages/server/test/arch/assembly.test.ts` 의 허용목록 사유에 그 실측이 적혀 있다)
8. **`migration` 둘은 상시 조립에 걸지 않는다** — 일회성 도구이며 진입점은 `src/migrate.ts` 다 — **확정**. (근거: `MIG-AUTH-001` AC-3 이 「일회성」을 명시)

## 6. 미결정·유예 항목

- **`G37`(만료된 감사 행을 참조하는 재조정 대기열 항목)** — 갈래가 둘이고 원장이 「어느 쪽도 공짜가 아니므로 임의로 고르지 마라」고 적었다. 결정 방법: 위 「확정된 결정」 3번의 판정 위임 규칙(권장 없음 → 5명 위원회). **이 세션이 보존 일소를 실제로 돌게 만들었으므로 그 공백이 이론에서 실제로 바뀌었다** — 그래서 첫 순서다
- **`G32`(비밀번호 분실 복구)·`G33`(자격증명 변경의 세션·PAT 파급, 세션 수명 규정 부재)** — 이 세션이 R144·R145 를 구현했으나 파급 규정은 열려 있다. 결정 방법: 같은 판정 위임 규칙
- **기준 1 의 실제 볼트 경로** — 저장소에 없는 개인 데이터. 결정 방법: **사용자 확인만 가능**. 합성 볼트가 회귀는 막지만 실물 재검증을 대신하지 못한다
- **기준 7 의 한글 IME 수동 체크리스트** — 원장이 자동화를 명시적으로 배제했다. 결정 방법: 사용자 확인
- ~~`SEC-STORAGE-003` AC-4 가 버전 실체를 열거하지 않는 문제~~ — **미결이 아니다(2026-09-02 검증으로 확인).** AC-4 문면이 버전을 열거하지 않는 것은 사실이나, 그 자리를 `SEC-STORAGE-008`(「영구 삭제는 그 노드의 버전 이력도 함께 걷는다」)이 이미 소유하며 `Status=implemented` · AC-1~AC-6 전건 체크 · 증거 `packages/server/test/app/trash/trash.test.ts` 다. 코드로도 `hardDelete` 가 버전 디렉터리를 `rm(recursive)` 하고 `stores.versions.replaceAllOf(nodeId, [])` 를 부른다. **대조표(`phase1-acceptance-matrix.md`)의 미결 표에서도 이 행을 지워야 한다**

## 7. 남은 작업 전체 목록

### A. Phase 1 잔여 — 하나

- [ ] **A-1 `SEC-STORAGE-007` AC-3** — 완료 조건: **닫지 않는다.** 아카이브 조작이 Phase 2 라 이 AC 는 그 회차가 함께 세운다. 다음 세션이 할 일은 **이 사실이 요구의 Implementation Notes 에 적혀 있는지 확인**하는 것뿐이다(적혀 있다 — 2026-08-27 항)

### C. 원장 공백 중 이 제품이 실제로 연 것 — 셋

- [ ] **C-1 `G37` 판정** — 완료 조건: 원장 683행 `G37` 항목에 판정 문단이 추가되고, 그 판정이 갈래 ⓐ(참조 걸린 감사 행을 만료에서 제외) 또는 ⓑ(대기열 항목이 값을 복사) 중 하나를 결론형으로 못박는다. 판정에 따라 코드 변경이 필요하면 TDD 로 구현하고 뮤테이션 탐침으로 확정한다
- [ ] **C-2 `G33` 판정** — 완료 조건: 원장 679행 `G33` 의 네 갈래(①PAT 무효화 ②다른 기기 세션 ③로그아웃의 서버 측 무효화 ④현재 비밀번호 재입력)와 부수 발견(세션 수명 규정 부재)에 각각 결론이 적힌다. **③④는 이미 구현돼 있다** — `packages/server/src/http/routes/auth.ts` 의 `/auth/logout` 이 `logOut(stores, token)` 을 부르고, `password-service.ts` 가 현재 비밀번호를 요구한다. 판정은 그 구현을 조항으로 승격하는 형태가 된다 (의존성: 없음)
- [ ] **C-3 `G32` 판정** — 완료 조건: 원장 678행 `G32` 에 결론이 적힌다. 원장이 「Phase 2 이관도 결정의 한 형태」라고 적어 두었으므로 이관도 유효한 답이다 (의존성: 없음)

### E. 품질 축

- [ ] **E-1 `implemented` → `verified` 승급** — 완료 조건: 242건 각각에 대해 ① AC 전건이 체크돼 있고 ② 증거가 자동 시험을 가리키며 ③ 그 시험이 통과하면 `update_status(id, 'verified')`. 승급 못 한 것은 사유를 Implementation Notes 에 적는다. **bulk-finalize 도구를 만들거나 쓰지 않는다**(CLAUDE.md 금지). 규모가 크므로 scope 별로 나눠 진행하라
- [ ] **E-2 SRS 경고 하나 해소** — `docs/spec/02.feature-request-live-preview.md` 가 scope 문서 `02.product-architecture.srs.md` 와 앞 번호 2 를 공유한다(`SRS-W072`). 완료 조건: `speckiwi validate --fail-on-warning` 이 경고 0
- [ ] **E-3 `AclAuditPanel` 넷째 탭** — `packages/web/src/acl/AclAuditPanel.tsx:20` 이 「넷째 탭 자리가 비어 있다」고 적는다. `G15`(넓히기를 모아 보는 화면)와 같은 축이며 원장이 「Phase 2 이관 가능」이라 적었다. 완료 조건: `G15` 판정 결과에 따라 구현하거나 이관을 명문화한다

### D. Phase 2 — 착수 금지

`CON-ACL-005` · `CON-EDITOR-003` · `CON-EDITOR-005` · `FR-ATTACH-007`(PDF 뷰어) · `FR-ATTACH-008`(`.task`) · `FR-ATTACH-009`~`011`·`SEC-ATTACH-004`(댓글 넷) · `FR-WORKSPACE-007`·`008`(아카이브·복원). 열하나 전부 `stability=draft`, target `phase-2`.

원장 R92 가 여는 열린 목록에 그래프뷰·커맨드 팔레트·퀵스위처·분할 창·아웃라인·프론트매터도 있다.

### 나머지 원장 공백 — Phase 1 을 막지 않음

원장 §3.2 표에서 **취소선이 없는 주 항목은 열넷**이다 — `G14` · `G15` · `G16` · `G23` · `G29` · `G30` · `G32` · `G33` · `G34` · `G35` · `G36` · `G37` · `G39` · `G40`.

그중 **셋(`G37`·`G33`·`G32`)은 위 C 축이 이미 가져갔다.** 그래서 이 절에 남는 것은 **열하나**다 — `G14` · `G15` · `G16` · `G23` · `G29` · `G30` · `G34` · `G35` · `G36` · `G39` · `G40`. (`G26` 은 취소선으로 종결됐으나 그 본문이 「①과 ③은 그대로 열려 있다」고 적으므로 부분적으로 남는다.)

원장에서 **취소선으로 종결된 것**은 `G8`·`G9`·`G10`~`G13`·`G17`~`G22`·`G24`~`G28`·`G31`·`G38` 열아홉이며 **다시 열지 마라.**

⚠️ **원장 9행의 요약이 §3.2 표와 어긋난다 — 세 겹이다** (2026-09-02 독립 검증 실측).

1. 9행은 `| 남은 실질 공백 | **13건** …` 이라 적는데 §3.2 표의 열린 주 항목은 **열넷**이다.
2. 9행 말미가 *「`G30`·`G34`·`G35` 는 Phase 2 전용 축이다 — Phase 1 착수 판단에는 13건으로 세라」* 고 적는데, 14 − 3 = **11** 이라 자기 설명과도 산술이 맞지 않는다.
3. 9행이 **`G39`·`G40` 을 아예 언급하지 않는다.** 표에는 둘 다 있다.

**이 정합을 맞추는 것도 남은 작업이다.** C 축 셋(`G32`·`G33`·`G37`)을 닫으면 열린 주 항목이 열하나가 되므로, 그때 9행의 숫자와 그 말미 문장을 함께 고쳐라. 교차검증 사실 하나를 함께 남긴다 — 열린 14 + 종결 19 = 33 이고 `G8`~`G40` 이 정확히 33개 번호이므로, **표 안의 주 항목 번호는 빠짐도 중복도 없다.**

이 절의 열하나는 **Phase 2 준비 또는 운영 관측 축**이며 이 제품의 동작을 막지 않는다. C 축을 닫은 뒤 여유가 있으면 판정하되, 원장이 「Phase 1 을 막지 않는다」고 명시한 것(`G39`·`G40`)은 후순위다.

## 8. 다음 세션 지시서

1. **`G37` 을 판정한다** → 검증: 원장 `docs/spec/00.decision-log.md` 의 `G37` 행에 판정 문단이 있고 갈래 ⓐ/ⓑ 중 하나가 결론형으로 적혀 있다
2. **판정이 코드를 요구하면 TDD 로 구현한다** → 검증: 실패하는 시험을 먼저 보고(red), 최소 구현으로 green, 뮤테이션 탐침으로 그 시험이 실제로 무는지 확정. `cd C:\Work\git\DocuLight2.0\packages\server && npx vitest run` 전건 통과
3. **`G33` 을 판정한다** → 검증: 네 갈래 + 세션 수명에 각각 결론. ③④는 이미 구현돼 있으므로 조항 승격 형태가 된다
4. **`G32` 를 판정한다** → 검증: 결론이 적힌다. Phase 2 이관도 유효한 답이다
5. **원장 9행의 미결 공백 건수를 맞춘다** → 검증: C 축 셋을 닫은 뒤 `docs/spec/00.decision-log.md` 9행의 숫자가 §3.2 표의 열린 주 항목 수와 같다
6. **E-1 승급을 scope 별로 진행한다** → 검증: 각 scope 를 마칠 때마다 `mcp__speckiwi__summarize_target` 으로 `verified` 수가 늘고 `implementedNotVerified` 가 줄었는지 확인
7. **매 단계 끝에 전체 회귀** → 검증: 아래 「테스트 실행 명령」 셋이 전부 통과하고 `npm run typecheck` 오류 0

## 9. 거버넌스·게이트·함정

### 규칙

- **SpecKiwi**: 요구 변경은 MCP 로만. `docs/spec/*.srs.md` 를 손으로 고치지 않는다. 단 원장(`00.decision-log.md`)과 설계서(`03`·`04`·`05`)는 SRS 파일이 아니므로 직접 편집한다
- **TDD 강제**: 동작 변경은 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green. 실수로 구현을 먼저 썼으면 그것을 지우고 처음부터 다시 한다
- **뮤테이션 탐침 (C-14)**: 새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다. **반드시 패키지 전체 스위트로** — 좁게 돌리면 다른 항이 함께 죽는지 못 본다
- **커밋 메시지**: AI 시그니처 금지. 제목에 `Phase {n}`·`Step {n}` 같은 **작업 단계 표식** 금지. 단 「Phase 1 수용 기준」은 이 저장소의 고유명사이며 그 어구를 담은 커밋이 둘 있다(`8673b6e` `docs(analysis): Phase 1 수용 기준 13개의 시험 대조표를 세운다` · `e92b471` `docs: 인증 왕복을 Phase 1 수용 기준에 세우고 세 요구를 실물에 맞춘다`)
- **1.0 저장소** `C:\Work\git\DocuLight\DocLight` 은 읽기 전용 (제약 C-02)
- **개발 포트**: web dev 3399 · server dev API 3400 (제약 C-13)

### 멈추고 물어야 하는 세 가지

자율 진행 중에도 이 셋은 사용자에게 확인한다.

1. 저장소 밖으로 나가는 되돌리기 어려운 동작 — 1.0 저장소 편집, 외부 서비스 정지, force-push
2. **기존 시험을 약화하거나 지워서** 게이트를 통과하는 것, 또는 기존 public 계약을 깨는 것
3. 저장소에 없는 사실 — 실제 볼트 경로 같은 사용자 데이터

### 이 세션에 실제로 밟은 함정

- **Git Bash 의 `curl` 로 한글을 보내면 깨진다**(⚠️ 살아 있는 서버가 있어야 재현된다)**.** 설치 계정 이름을 한글로 주면 DB 에 `U+FFFD` 로 저장되고, 그러면 **브라우저에서만** 로그인이 401 로 실패한다(curl 은 같은 방식으로 깨뜨려 보내므로 200 이 나와 원인이 가려진다). → **설치 계정은 ASCII 로 만든다**
- **bash 변수명에 한글을 쓸 수 없다.** `local 파일="$1"` 은 `not a valid identifier` 로 죽는다 → 셸 변수는 영문으로
- **python heredoc 안의 `\\n` 이 실제 개행이 되어 TS 문자열을 깨뜨린 적이 있다** → 개행 리터럴이 필요하면 `chr(92) + "n"` 으로 조립하거나 Write 도구를 쓴다
- **`vitest` 를 저장소 루트에서 `--root packages/server` 로 돌리면 4항이 실패한다.** 그 항들이 `src` 를 cwd 기준 상대경로로 찾기 때문이다 → **반드시 `cd packages/server` 뒤에 `npx vitest run`**
- **로그인은 15분 창에 10회로 제한되고 web 검사 아홉이 한 번에 16회를 쓴다** → 한 창에 전부 돌지 못한다. API 서버를 재기동하면 즉시 풀린다(limiter 는 메모리, 계정은 DB)
- **`TaskStop` 이 `npx` 래퍼만 죽이고 실제 프로세스는 남는다**(⚠️ 이 세션의 관측이며 독립 검증자가 재현하지 못했다) → 포트가 계속 잡혀 있다. `netstat -ano | grep LISTENING | grep ":<포트> "` 로 PID 를 찾아 `taskkill //PID <PID> //F`
- **큰 fixture 가 다른 시험을 죽인다.** 1,300 파일을 직렬로 만들면 13초가 걸리고 그 부하가 감시자 시험 둘을 타임아웃시켰다(⚠️ 이 세션의 관측이며 지금은 병렬화돼 재현되지 않는다) → fixture 는 `Promise.all` 로 병렬화

### 테스트 실행 명령 (복붙 가능)

```
cd C:\Work\git\DocuLight2.0\packages\server && npx vitest run
cd C:\Work\git\DocuLight2.0\packages\web && npx vitest run
cd C:\Work\git\DocuLight2.0\packages\editor && npx vitest run
cd C:\Work\git\DocuLight2.0 && npm run typecheck
```

### 브라우저 검사 (서버·계정이 필요하다)

```
# 1) API 서버 — 데이터 디렉터리를 격리해 띄운다
cd C:\Work\git\DocuLight2.0\packages\server
DOCULIGHT_DATA_DIR=<임시경로> PORT=3420 npx tsx src/main.ts
# 2) 콘솔의 설치 토큰으로 verify-token → commit (superuserName 은 ASCII 로)
# 3) web dev
cd C:\Work\git\DocuLight2.0\packages\web
DOCULIGHT_API_ORIGIN=http://localhost:3420 npx vite --port 3421 --strictPort
# 4) 검사
WEB_URL=http://localhost:3421/ DOCULIGHT_E2E_USER=<이름> DOCULIGHT_E2E_PASS=<비밀번호> npm run test:browser:all
```

배포 형태로 재려면 `npm run build` 뒤 서버 하나만 띄우고 `WEB_URL` 을 그 포트로 준다 — 절차가 `<REPO>\CLAUDE.md` 에 적혀 있다.

## 10. 리스크·잔존 이슈

- **E-1 승급의 규모** — 242건이다. 영향: 한 세션에 다 못 끝날 수 있다. 대응: scope 별로 나누고, 매 scope 마다 커밋해 진척이 남게 한다
- **`G37` 이 실제 위험이 된 시점** — 이 세션이 `retention-loop.ts` 를 배선하기 전에는 보존 만료가 돌지 않아 그 공백이 이론이었다. 지금은 감사 행이 실제로 사라지고 그것을 참조하는 대기열 항목이 값을 잃을 수 있다. 영향: 재조정 대기열 화면이 빈 칸을 그릴 수 있다. 대응: C-1 을 첫 순서로 둔 이유가 이것이다
- **브라우저 검사의 로그인 예산** — 아홉이 16회를 쓴다. 영향: 한 창에 다 못 돌린다. 대응: API 서버 재기동으로 limiter 를 초기화한다
- **`math-render-check.mjs` AC-3 의 간헐 실패** — 2026-09-01 에 전체 실행에서 한 번 죽었다가 단독·재실행으로 통과했다. 영향: 거짓 실패. 대응: 실패한 검사를 단독으로 한 번 더 돌려 재현되는지 먼저 본다
- **로컬이 원격보다 35 커밋 앞서 있다** — `origin/master` 는 `65a5f96` 이고 뒤처진 것은 0 이다(2026-09-02 실측). upstream 이 없어 `git status` 가 그 사실을 알리지 않는다. 영향: 이 회차의 작업 전부가 아직 원격에 없다. 대응: push 는 저장소 밖으로 나가는 동작이므로 **사용자에게 확인한 뒤에만** 한다
