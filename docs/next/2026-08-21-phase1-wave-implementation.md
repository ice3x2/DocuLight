# DocuLight 2.0 Phase 1 구현 (wave-master) — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-21 (2차 갱신) |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | **wave 9개를 끝까지 완주해 완성된 제품을 만든다.** Phase 1 요구사항 250건 전건 구현 |
| 현재 상태 | **wave-1 의 9개 Phase 중 3개 완료 · 53 Task 중 15개 완료.** 코드가 돌고 있다 |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` (요구사항 원장) · `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` (wave 진행) |
| 다음 세션 첫 행동 | **`T-PH004-01` 부터.** 노드 ID 발급 red 테스트를 쓰고 red 를 확인한 뒤 green |

> 이 문서는 다음 세션이 **이 문서와 여기서 가리키는 문서만 읽고** 이어갈 수 있도록 정리한 것이다.
> 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git status --porcelain` 과 `git log --oneline -5` 로 §3 과 실제가 일치하는지 확인한다.
3. **`export NODE_ENV=development`** 를 먼저 한다 — §9 의 함정 ①이다.
4. `npm test` 로 기준선을 확인한다 → **editor 9파일 102 passed · server 4파일 17 passed · exit 0**.
5. 계획의 `T-PH004-01` 명세를 읽는다:
   ```
   node -e "const s=require('./docs/plans/2026-08-20.doculight2.wave-1.sidecar.json');const t=s.tasks.find(x=>x.id==='T-PH004-01');console.log(JSON.stringify(t,null,1))"
   ```
6. **red 를 먼저 쓰고 러너로 red 를 확인한 뒤** green 을 만든다. 이 순서를 지킨다.

---

## 1. 최종 작업 목표

**DocuLight 2.0 의 Phase 1 을 완주해 제품을 만든다.**

옵시디언의 편집·열람 경험을 웹으로 옮기고, 옵시디언에 없는 사용자·그룹 접근제어를 더한
사내 문서 시스템이다. 사내 단일 인스턴스 · 수백~수천 명 · 데스크탑 전용.

**완료 조건은 이중 게이트다** (사용자 결정 · `constraints-2.json` C-22):

1. 원장 §4 **수용 기준 13개** 전건 통과
2. **wave 9개** 전건 완주

둘 다 요구하는 이유 — 확인 등급 wave(33건)는 수용 기준 13개 중 어느 것도 닫지 않는다.
수용 기준만으로 판정하면 33건이 미구현으로 남은 채 「완료」가 된다.

---

## 2. 현재까지 완료한 작업

### 2.1 준비 단계 (문서·계획)

- [x] **wave 분해** — 독립 담당자 3인이 서로 보지 못한 채 각자 분해. 셋 다 독립으로 **9 wave** 를 골랐고 배정 검사(250/250 · 미배정 0 · 중복 0 · 수용 기준 13개 전량)를 전건 통과. 묶음 일치도(Rand) A-B 91.9% · A-C 95.3% · B-C 92.7% 로 C 가 중심이라 C 채택 — `docs/analysis/kiwi-wave-master-2026-08-20.doculight2.phase1-implementation/wave-assignment.json`
- [x] **설계 기준선** — 원장 조항 350행 전량 배정, 커버리지 게이트 PASS (329 + 6 + 15 = 350)
- [x] **조항→요구사항 추적 실측** — 살아 있는 조항 346건 전부 매핑(미매핑 0), 역방향 누락 0
- [x] **원장 `R33-a` 스윕 완결** — 커밋 `192a9ea` · 그 서술 결함 수정 `5d90ac3`
- [x] **wave-1 feasibility + 독립 검증** — CRITICAL 1 · HIGH 4 · MEDIUM 5 · LOW 6 전건 처분
- [x] **depends_on 전수 검사** — trace 간선 264개 중 순서 위반 4건 적발. wave-1 의 2건 수정(`0c1a3cf`), wave-4 의 2건은 그 wave 착수 전 판정으로 남김
- [x] **wave-1 계획** — 9 Phase · **53 Task** · AC 118개 중 커버 111 · 유예 7 (`0637c1e`)
- [x] **계획 독립 검증 + HIGH 3 처분** — `5a541b2`

### 2.2 구현 (코드)

- [x] **PH-001 모노레포 골격** (6 Task) — 커밋 `f385556` · `d8725f7`
  - 루트 `package.json` + npm workspaces · `tsconfig.base.json`
  - **잠자던 vendor 테스트를 켰다** — 파일 2→9, 케이스 27→**102**, 실패 0
  - `packages/server` (Express) · `packages/web` (Vite+React+TS SPA, 포트 3399) 스캐폴드
- [x] **PH-002 착수 전 결정 확정** (3 Task) — 커밋 `1dfb045`
  - `FR-WORKSPACE-004` 세 값 + 예약어 전량을 MCP 로 요구사항에 기록
  - `CON-WORKSPACE-001` 을 **계층의 종류 제한**으로 판정 (깊이 상한이 아니다)
  - `R139` 계열 **8행 전수** 대조로 재조정 대기열 계약 확정
- [x] **PH-003 영속 기반** (6 Task) — 커밋 `c4ac5c4`
  - SQLite 단일 메타데이터 저장소 (WAL + 외래키 강제) · 마이그레이션 러너
  - 재조정 대기열 (`reconciliation_finding` + 참조 테이블) · 감사 로그 최소형
  - `docsRoot` 문서 본문 저장소 (경로 탈출 fail-closed)
  - 포트 넷을 도메인이 소유 — **도메인이 인프라를 import 하는 자리 0건**

> **검증 (2026-08-21 실행)** — `npm run typecheck` 세 패키지 전건 exit 0 ·
> `npm test` editor 9파일 **102 passed** + server 4파일 **17 passed** · exit 0.

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치 `master`. 원격 `origin` = `B:/work/git/DocuLight2.0.git` (로컬 백업). **커밋 `c4ac5c4` 까지 push 완료**
- 미커밋: `kiwi/.status.json` (speckiwi 가 자동 갱신하는 지문 파일) 하나뿐
- **`git status --porcelain` 을 직접 읽어 실제와 대조하라** — 이 목록은 작성 시점 스냅샷이라 반드시 낡는다

---

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| **원장 (SSOT)** | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` | 요구사항의 진실. 조항 350행 · §4 수용 기준 13개 |
| **wave 저널** | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | 재개 지점 |
| **wave-1 계획** | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-20.doculight2.wave-1.plan.md` | 9 Phase · 53 Task 사람이 읽는 판 |
| **wave-1 사이드카** | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-20.doculight2.wave-1.sidecar.json` | **기계 판독용. Task 명세·AC 커버리지·TDD test_case 가 여기 있다** |
| 계획 검증 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-planner-2026-08-20.doculight2.wave-1\eval.md` | CRITICAL 0 · HIGH 3(처분됨) · MEDIUM 7 · LOW 5 |
| 처분 기록 | `...\kiwi-planner-2026-08-20.doculight2.wave-1\notes.md` | HIGH·MEDIUM·LOW 각각의 고침/기각 사유 |
| **계층 판정** | `...\kiwi-planner-2026-08-20.doculight2.wave-1\T-PH002-02-hierarchy-review.md` | `CON-WORKSPACE-001` 판정 — **구현 전에 읽어라** |
| **대기열 계약** | `...\kiwi-planner-2026-08-20.doculight2.wave-1\T-PH002-03-queue-contract.md` | `R139` 8행 대조 · 금지 칸 8개 |
| wave 배정 | `...\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` | 9 wave · 250건 · `dependency_audit` |
| **선언 제약** | `...\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\constraints-2.json` | 사용자 제약 23건 (C-01~C-23). **최신 아티팩트** |
| 프로젝트 전반 | `C:\Work\git\DocuLight2.0\docs\next\00.handoff.md` | 작업 방식 제약 · 과거 실패 유형 |

### 코드 (현재 존재하는 것)

```
C:\Work\git\DocuLight2.0\
  package.json                  루트 workspaces + happy-dom (§9 함정 ②)
  tsconfig.base.json            공통 컴파일러 옵션
  packages/editor/              CodeMirror 6 에디터 (기존 · src 는 wave-5 소유)
  packages/server/
    src/domain/ports/           MetadataStore · DocumentStore · AuditSink · FindingQueue
    src/infra/sqlite/           database.ts · migration-runner.ts · migrations/*.sql
                                audit-log-repository.ts · finding-queue-repository.ts
    src/infra/fs/               document-store.ts
    src/config/config.ts        docsRoot · databaseFile · port
    src/main.ts                 createApp / startServer (분리돼 있다)
    test/                       17 tests
  packages/web/                 Vite + React SPA (포트 3399, /api → 3400 프록시)
```

**요구사항 조회**: `npx speckiwi show <REQ-ID> --json`

---

## 5. 확정된 결정 (변경 금지)

1. **wave 구성**: 9개. 순서는 골격 → ACL 판정 코어 → 인증 → 셸 → 본문 → 찾기 → 권한 관리 → 확인 등급 → 감사
2. **범위 밖 15건**: Phase 2 조항 11 + 취소선 4 를 이 run 에서 구현하지 않음. 사용자 승인 완료
3. **1.0 PM2 배포 구성**: 파일로 **복사하지 않는다.** 읽기 전용 참고만 (C-21)
4. **Phase 1 종료 판정**: **이중 게이트** — 수용 기준 13개 **그리고** wave 9개 (C-22)
5. **wave target**: `wave-{n}` 전용 target 을 만들지 않고 `phase-1` 안에서 ID 부분집합으로 한정 (근거: 재저작은 `CON-ARCH-008` 위반이며 그것이 Phase 1 요구사항 자신이다. C-23)
6. **결정 게이트**: 사용자에게 묻지 않고 **권장안을 선택해 진행**한다. 게이트는 기록하되 답을 기다리지 않는다 (C-20)
7. **`CON-WORKSPACE-001`**: 경로 **깊이 상한이 아니다.** 계층의 **종류**를 닫은 조항이다. 깊이로 읽어 거부하면 옵시디언 볼트가 열리지 않아 `R1`·`R3` 을 깬다
8. **`R139` 대기열**: 참조 감사 행을 **nullable 로 만들지 않는다.** 금지 칸 8개 (계약 문서 참조)
9. **`FR-WORKSPACE-004` 세 값**: 금지 문자 = Win32 예약 문자 9 + 제어문자 + 말단 공백·마침표 / 최대 이름 길이 = **UTF-8 255바이트** / 경로 총길이 = **워크스페이스 루트 기준 상대 255**
10. **예약어 전량**: `CON`·`PRN`·`AUX`·`NUL`·`COM1~9`·**`COM¹²³`**·`LPT1~9`·**`LPT¹²³`**. 판정은 **확장자를 뗀 basename 에 대소문자 무시**
11. **아키텍처**: 도메인이 포트를 소유하고 인프라가 구현한다. **도메인은 `better-sqlite3`·`node:fs`·`express` 를 import 하지 않는다**
12. **server 진입점**: `createApp`(리스너 안 염) / `startServer`(엶) 분리. 뒤 Task 가 포트 없이 라우트를 시험할 수 있어야 한다

---

## 6. 미결정·유예 항목

- **`OPS-STORAGE-001` 검증 방법** — 백업 운영 요건이라 자동 테스트로 닫히지 않는다. 문서화/스크립트 택일. **PH-008 에서 결정**
- **비-ASCII 케이스 폴딩** — 터키어 `ı`/`I` 등. 원장에 규정 없음. 한글은 영향 없음. **PH-004(`T-PH004-07/08`)에서 로케일 독립 Unicode default case folding 채택 여부 결정**
- **wave-4 의 depends_on 위반 2건** — `FR-SHELL-004` → `SEC-WORKSPACE-004`(wave-6), `FR-WORKSPACE-003` → `FR-WORKSPACE-002`(wave-6). **wave-4 착수 전** 각각이 구현 의존인지 범위 경계 참조인지 판정
- **유예 AC 7건** — 사이드카 `deferred_ac[]` 에 사유가 건마다 있다
- **`FR-SHELL-011` `Stability=draft`** — `CLAUDE.md` 가 구현 전 중단을 요구. **wave-6 착수 전** evolving 이상으로 올리거나 override
- **`G36` ③ 검색 결과 상한** — 「거른 뒤」인지 「거르기 전」인지가 존재 오라클 여부를 가른다. **wave-6 착수 전.** 「거르기 전 N건」을 기본으로 구현하지 마라
- **`G14` 화면 최신성** — 갱신 계기 미확정. **wave-4 에서 한 번 정하고 wave-6 이 재사용**

---

## 7. 남은 작업 전체 목록

### 7.1 wave-1 — 38 Task 남음 (53 중 15 완료)

- [x] **PH-001** 모노레포 골격과 빌드 배선 (6)
- [x] **PH-002** 착수 전 결정 확정 (3)
- [x] **PH-003** 영속 기반 — SQLite 와 docsRoot (6)
- [ ] **PH-004** 노드 ID 와 이름 규칙 (**12**) — 아래 §8 이 상세
- [ ] **PH-005** 워크스페이스 계층·레이아웃·초기 상태 (8)
- [ ] **PH-006** 재조정과 대기열 연동 (6)
- [ ] **PH-007** 서빙 — 단일 프로세스와 fail-closed (4)
- [ ] **PH-008** 운영 구성과 런북 (2)
- [ ] **PH-009** 규약 검토와 정합성 판정 (6)
- [ ] **wave-1 종료 상호검증** — 검증자 2기 교차반박 통과 후 `waves.jsonl` 에 `complete`

### 7.2 wave-2 ~ wave-9 — 226건

각 wave 마다 **feasibility → 계획 → 구현 → 종료 검증** 사이클을 돈다.

| wave | 이름 | 요구 |
|---|---|---:|
| 2 | 주체와 ACL 판정 코어 (헤드리스 도메인) | 31 |
| 3 | 인증·세션·PAT·설치 마법사 | 25 |
| 4 | 셸 골격과 노드 조작 — 트리·탭·설정 모달·휴지통 | 24 |
| 5 | 본문 표면 — 에디터·자동 저장·버전·충돌·첨부 | 35 |
| 6 | 찾기 계열 — 링크·백링크·태그·전역 검색·MCP | 18 |
| 7 | 권한·주체 관리 화면과 이동·복사 | 26 |
| 8 | 확인 등급 — 파괴적 조작 앞의 마찰 | 33 |
| 9 | 감사 기록·재조정 대기열·1.0 컷오버 | 34 |

### 7.3 마무리

- [ ] **run 창 종료 리뷰** — 마지막 wave 완료 뒤 run 전체 커밋 창을 1회 리뷰
- [ ] **전체 wave 최종 검증** — 설계 기준선 전체 + 교차 항목 6개 대비
- [ ] **Phase 1 종료 판정** — 수용 기준 13개 **그리고** wave 9개 (§5-4)

---

## 8. 다음 세션 지시서 — PH-004 (12 Task)

`T-PH004-01` 부터 순서대로. **red → 러너로 red 확인 → green → 러너로 green 확인** 을 페어마다 반복한다.

| # | Task | 무엇 | 검증 |
|---|---|---|---|
| 1 | `T-PH004-01/02` | **노드 ID 발급** — UUIDv4 등 추측 불가 랜덤. **순차 정수 금지**(`R76-b` — URL 열거 오라클이 된다) | `npm test -w @doculight/server` |
| 2 | `T-PH004-03/04` | **이동·개명이 ID 를 유지**하고 트랜잭션으로 처리 (`R76-a`). chokidar 는 개입하지 않는다 | 같음 |
| 3 | `T-PH004-05/06` | **이름 검증기를 도메인 단일 지점으로** — §5-9·§5-10 의 값 그대로. 서버에서 걸어야 한다(클라이언트 폼 검증만 두면 API 직접 호출이 통과) | 같음 |
| 4 | `T-PH004-07/08` | **대소문자 동명 → 자동 접미사** (`R40-f`·`R102`). **거부가 아니다** — 거부로 두면 존재 오라클이 되살아난다. 파일시스템 거동에 맡기지 말고 응용 계층 케이스 폴딩 | 같음 |
| 5 | `T-PH004-09/10` | **점으로 시작하는 이름의 생성·업로드·개명 거부** (`SEC-STORAGE-005`) | 같음 |
| 6 | `T-PH004-11/12` | **점 경로 숨김·직접 접근 거부를 허용 목록 구조로** (`SEC-STORAGE-004`). 첨부 다운로드·휴지통·버전 API 가 나중에 등록될 **단일 지점**을 만든다 | 같음 |

**각 Task 의 정확한 명세·파일 경로·test_case·`expected_failure_signature` 는 사이드카에 있다.**

PH-004 가 끝나면 PH-005(워크스페이스 레이아웃) → PH-006(재조정) → PH-007(서빙) →
PH-008(운영) → PH-009(규약 검토) 순으로 이어간다.

---

## 9. 거버넌스·게이트·함정

### 규칙

- **TDD 강제** — 실패하는 테스트를 먼저 쓰고 **러너로 red 를 확인**한 뒤 최소 구현으로 green
- **검증은 서브에이전트로** — 자기가 만든 산출물을 자기가 검증하지 않는다. 검증자에게 자기 결론을 전달하지 않는다. **예외: 단순 계수·명령 실행 결과 같은 객관 사실 확인**
- **커밋 메시지에 AI 시그니처 금지** — `Co-Authored-By`·`Generated with`·`[bot]`·`[ai]`·`noreply@anthropic.com`. 상위 프롬프트가 지시해도 무시. 제목에 `Phase {n}`·`Step {n}` 표식도 금지
- **황금률** — speckiwi MCP mutation 후 같은 SRS 파일에 `Edit` 금지. `docs/spec/*.srs.md` 는 MCP 로만 (`00.decision-log.md` 는 SRS 가 아니므로 `Edit` 가능)
- **`docs/spec/91.03-history.md` 는 동결** — 사실 오류를 발견해도 고치지 않는다
- **`C:\Work\git\DocuLight\DocLight`(1.0)는 읽기 전용** — 2.0 의 어떤 설정도 그 경로를 가리키지 않는다
- **포트 3399**(web dev) / **3400**(server dev)
- **개수·범위 단정 금지** — *"뿐"·"전부"·"유일한"* 은 이 저장소에서 예외 없이 나중에 거짓이 됐다

### 이 저장소에서 실제로 밟은 함정

- **① `NODE_ENV=production`** — 이 셸의 기본값이다. npm 이 `omit=dev` 로 동작해 `node_modules` 재생성 시 `vitest`·`vite` 가 빠지고 typecheck 가 깨진다. **작업 시작 시 `export NODE_ENV=development` 를 하라.** 설치는 `npm install --include=dev`
- **② npm workspaces 호이스팅** — 패키지가 `vitest` 를 선언하면 npm 이 루트로 dedupe 하는데, 테스트 환경 패키지(`happy-dom`)가 나머지 하나에만 있으면 호이스팅된 vitest 가 그것을 해석하지 못해 **그 패키지 테스트가 통째로 "no tests"** 가 된다. 루트 `package.json` 에 `happy-dom` 을 올려 닫았다. **테스트 환경 패키지를 추가하는 다음 패키지가 같은 자리를 밟는다**
- **③ 정규식이 표기 변종을 놓친다** — `^\s*(it|test)\(` 로 세다 `it.each(` 를 놓쳐 vendor 케이스를 56 으로 셌는데 실제는 75 였다. **케이스 수를 미리 세지 말고 러너가 보고하게 하라**
- **④ Windows cmd 의 캐럿** — `git cat-file -e <hash>^{commit}` 를 `shell=True` 로 돌리면 `^` 가 이스케이프로 먹혀 **커밋 7개를 전부 「없음」으로 오탐**한다. `git rev-parse --verify --quiet` 를 쓰라
- **⑤ grep 경계 검사의 위양성** — *"better-sqlite3 도 나타나지 않는다"* 는 **주석**이 경계 위반으로 잡혔다. `import` 문만 세도록 좁혀라
- **⑥ 미확인을 적는 것으로 끝내면 안 된다** — *"`R139` 를 전량 읽지 않았다"* 고 신고해 놓고, **읽지 않은 그 문장이 정확히 그 권장을 무효화하는 문장**이었다. 미확인을 적을 때 **그것이 무엇을 떠받치고 있는지** 함께 보라
- **⑦ `append_section_note` 가 날짜를 자동으로 붙인다** — 본문에 또 쓰면 `[2026-08-20] [2026-08-20]` 이 된다. 500자 상한도 있다
- **⑧ 서브에이전트가 산출물 없이 죽는다** — 세션 한도·무응답으로 세 번 겪었다. **위임할 때 "먼저 뼈대를 쓰고 채워라"를 지시하라**

### 명령

```bash
export NODE_ENV=development
cd /c/Work/git/DocuLight2.0

npm test                          # 전체 (editor 102 + server 17)
npm test -w @doculight/server     # 서버만
npm run typecheck                 # 세 패키지
npm run build -w @doculight/web   # SPA 빌드
npm install --include=dev         # 의존성 (--include=dev 필수, 함정 ①)

npx speckiwi show <REQ-ID> --json # 요구사항 조회
npx speckiwi validate --json      # errors 0 · 경고 SRS-W072·SRS-W023 는 선재
```

---

## 10. 리스크·잔존 이슈

- **원격 저장소가 로컬 백업(`B:` 드라이브)뿐** — 되돌림 지점이 로컬에만 있다. 디스크 손실에 대비가 없다 (인지된 제약)
- **남은 규모가 크다** — wave-1 만 38 Task 남았고 wave-2~9 가 226 요구다. **여러 세션이 걸린다.** `waves.jsonl` 과 이 문서가 그 경계를 잇는다
- **`packages/editor/package-lock.json` 이 남아 있다** — 워크스페이스는 루트 lockfile 하나를 전제하는데 중첩 lockfile 이 추적 중이다. 지금은 무해하나 **`npm install` 을 `packages/editor` cwd 에서 돌리면 트리가 갈린다.** 계획의 rollback 노트가 의도적으로 남긴 것이라 건드리지 않았다
- **계획 검증의 MEDIUM·LOW 잔여** — 12건 중 10건 고침 2건 기각. 기각 둘(`M-6`·`L-5`)의 사유는 `notes.md` §4.2·4.3 에 있다
- **wave-1 유예 AC 7건이 뒤 wave 로 넘어간다** — 각각 어느 scope 소유인지 사이드카 `deferred_ac[]` 에 적혀 있다. **그 wave 가 그것을 받아야 한다**
