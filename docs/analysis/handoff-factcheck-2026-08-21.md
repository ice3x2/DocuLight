# 핸드오프 사실 검증 (2026-08-21)

대상 문서 — `C:\Work\git\DocuLight2.0\docs\next\2026-08-21-phase1-wave-implementation.md`
검증 시점 — 2026-08-21 · 저장소 HEAD `b3fa3e9`
방침 — 테스트·빌드는 재실행하지 않고 **출처(실행 명령 + 시점)의 존재와 산출물 정합**으로 판정했다.

## 요약 — TRUE 76 · FALSE 5 · UNVERIFIABLE 6

---

## FALSE

| 절 | 문서의 주장 | 실제 (확인 명령과 출력) | 정정 |
| --- | --- | --- | --- |
| §2.1 | `- [x] **wave-1 계획** — 9 Phase · **53 Task** · AC 118개 중 커버 111 · 유예 7 (`0637c1e`)` — **53 Task 를 커밋 `0637c1e` 에 귀속** | `git show 0637c1e:docs/plans/…sidecar.json` → `phases 9 tasks 55 ac 118 cov 111 def 7`. 같은 조회를 `5b2df69` → 55, `f385556` → 55, `5a541b2` → **53**, `HEAD` → 53. `0637c1e` 커밋 제목 자체가 *"wave-1 실행 계획을 9 Phase **55 Task** 로 세운다"*. 55→53 은 `5a541b2`(eval H-3 처분으로 T-PH003-03/04 를 05/06 에 흡수)에서 일어났다 | 숫자(9 Phase · AC 118 · 커버 111 · 유예 7)는 현재도 참이지만 **Task 수 귀속이 틀렸다.** `0637c1e` 시점은 55 Task 이고 **53 Task 는 `5a541b2` 에서 확정**됐다 — 다음 줄의 `5a541b2` 항목과 합쳐 적어야 한다 |
| §3 | `**커밋 `c4ac5c4` 까지 push 완료**` | `git log --oneline -12` → tip 은 `b3fa3e9 docs(next): 세션 핸드오프를 구현 진척에 맞춰 다시 쓴다`. `git rev-list --left-right --count origin/master...HEAD` → `0	0`. `git branch -r -v` → `origin/master b3fa3e9` | **`b3fa3e9` 까지 push 완료** (ahead 0 · behind 0). `c4ac5c4` 는 그 한 단계 앞이다 |
| §3 | `미커밋: `kiwi/.status.json` (speckiwi 가 자동 갱신하는 지문 파일) 하나뿐` | `git status --porcelain` → `?? docs/analysis/handoff-factcheck-2026-08-21.md` (이 검증 파일) 한 줄뿐. `git ls-files kiwi/` → `.status.json`·`pipeline.jsonl`·`waves.jsonl` 전부 **추적 중이고 clean** — `.status.json` 은 `b3fa3e9` 에 함께 커밋됐다 | **워킹트리에 미커밋 변경이 없다.** (문서가 스스로 *"작성 시점 스냅샷이라 반드시 낡는다"* 고 경고한 자리이고, 실제로 낡았다) |
| §6 | `**`OPS-STORAGE-001` 검증 방법** — 백업 운영 요건이라 **자동 테스트로 닫히지 않는다.** 문서화/스크립트 택일. **PH-008 에서 결정**` | 사이드카 `open_questions` **OQ-03** = *"`OPS-STORAGE-001` 을 문서화로 닫을 것인가 스크립트로 닫을 것인가"* · `decision_taken`: *"**둘로 가른다 — AC-1·AC-4 는 운영 런북(문서)으로, AC-2·AC-3 은 자동 테스트로 닫는다**"* · `needs_user: false`. 계획 Task 도 이미 확정형이다 — `T-PH008-02 백업·복원 운영 런북을 쓴다 covers {"OPS-STORAGE-001":["AC-1","AC-4"]}`. `notes.md` §2.4 가 "스크립트로 닫지 않은 이유"까지 적었다 | **미결정이 아니다.** ① *"자동 테스트로 닫히지 않는다"* 는 **AC-2·AC-3 에 대해 거짓**이다 ② 문서화/스크립트 택일은 **이미 문서화(런북)로 결정**됐고 PH-008 은 그 결정의 **실행**(런북 작성)이다 |
| §6 | `**비-ASCII 케이스 폴딩** — … 원장에 규정 없음. … **PH-004(`T-PH004-07/08`)에서 로케일 독립 Unicode default case folding 채택 여부 결정**` | 사이드카 `open_questions` **OQ-06** = *"비-ASCII 케이스 폴딩 규칙을 무엇으로 하는가"* · `decision_taken`: *"**로케일 독립 유니코드 기본 케이스 폴딩(Unicode default case folding)을 쓴다. `toLowerCase` 를 쓰지 않는다**"* · `needs_user: false` | *"원장에 규정 없음"* 은 참이나 **채택 여부는 이미 결정됐다.** PH-004(T-PH004-07/08)는 그 결정의 **구현**이지 결정 지점이 아니다 |

---

## UNVERIFIABLE

| 절 | 주장 | 왜 확인할 수 없었나 |
| --- | --- | --- |
| §2.1 | wave 분해를 *"독립 담당자 3인이 **서로 보지 못한 채** 각자 분해"* 했다 | `wavesplit-a/b/c.json` 세 산출물의 실존과 `wave-assignment.json` 의 `adoption_method` 서술은 확인했으나, **작업 격리 여부는 저장소에 흔적이 남지 않는다.** 세 파일이 서로 다르다는 사실은 독립성의 증거가 아니다 |
| §9 ④ | Windows cmd 에서 `git cat-file -e <hash>^{commit}` 를 `shell=True` 로 돌리면 캐럿이 먹혀 **커밋 7개를 전부 「없음」으로 오탐**한다 | 이 세션은 Git Bash 로 `git rev-parse --verify --quiet` 를 썼고 **10개 해시 전건 OK** 였다. cmd + `shell=True` 조합의 오탐은 **과거 실행 기록이 저장소에 없어** 재현·반증 불가. (권고 자체 — `rev-parse` 를 쓰라 — 는 실제로 동작함을 확인했다) |
| §9 ⑤ | *"better-sqlite3 도 나타나지 않는다"* 검사에서 **주석**이 경계 위반으로 잡혔던 위양성 | 현재 `packages/server/src/domain/` 에는 **어떤 `from '…'` import 도 0건**이라(포트 인터페이스 4파일뿐) 그 위양성이 있었던 시점의 코드·검사 명령이 남아 있지 않다 |
| §9 ⑦ | `append_section_note` 가 날짜를 자동으로 붙이고 **500자 상한**이 있다 | MCP 도구의 런타임 동작이라 **호출 없이는 확인할 수 없고**, 확인하려면 SRS 를 변경해야 한다(검증 목적의 mutation 은 하지 않았다) |
| §9 ⑧ | 서브에이전트가 산출물 없이 **세 번** 죽었다 | 세션 이력 사실이라 저장소에 기록이 없다 |
| §10 | 원격이 로컬 백업뿐이라 *"디스크 손실에 대비가 없다"* | `origin = B:/work/git/DocuLight2.0.git` 단일 원격은 확인했다. 그러나 **`B:` 드라이브의 실체·별도 백업 정책 유무는 저장소 밖 사실**이라 판정 불가 |

---

## TRUE 로 확인한 것 (요약)

### 경로 실존 — 30/30

§4 표의 절대경로 12개 + 코드 트리 열거 파일·디렉토리 전부 실존. 단일 배치 `test -e` 로 확인했고 **MISSING 0건**이다.
`00.decision-log.md` · `kiwi/waves.jsonl` · wave-1 `plan.md`/`sidecar.json` · `eval.md` · `notes.md` · `T-PH002-02-hierarchy-review.md` · `T-PH002-03-queue-contract.md` · `wave-assignment.json` · `constraints-2.json` · `docs/next/00.handoff.md` · `package.json` · `tsconfig.base.json` · `packages/editor` · `packages/server/src/domain/ports` · `infra/sqlite/{database,migration-runner,audit-log-repository,finding-queue-repository}.ts` · `infra/sqlite/migrations` · `infra/fs/document-store.ts` · `config/config.ts` · `main.ts` · `test` · `packages/web/vite.config.ts` · `packages/editor/vite.config.ts` · `packages/editor/package-lock.json` · `docs/spec/91.03-history.md`.

### 수치 — 전건 일치

| 주장 | 실측 | 출처 |
|---|---|---|
| wave 9개 · 요구사항 250건 | `waves.length === 9`, Σ`requirement_ids` = **250** | `wave-assignment.json` |
| 원장 조항 350행 | `extracted_rows: 350` · `distinct_ids: 350` · `duplicate_ids: []` | `ledger-clauses.json` |
| 커버리지 `329 + 6 + 15 = 350` | Σ wave `design_items` = **329** (32+48+28+29+38+22+37+57+38) · `integration_items` **6** · `out_of_scope` **15** → **350** | `design-baseline.json` |
| 살아 있는 조항 346 · 미매핑 0 · 역방향 누락 0 | `mapped_count: 346` · `unmapped_live: []` · `unmapped_struck: 4` · `requirements_without_ledger_trace: []` · `dangling_clause_refs: []` | `clause-requirement-map.json` |
| wave-1 계획 9 Phase · **53** Task · AC 118 · 커버 111 · 유예 7 | `totals: {phases:9, tasks:53, ac_total:118, ac_covered:111, ac_deferred:7, ac_missing:0, reqs:24}` · `tasks` 배열 길이 53 · `deferred_ac` 길이 7 | 사이드카 |
| PH-001 **6** / PH-002 **3** / PH-003 **6** · 완료 15 · 남음 38 | `tasks_per_phase` = 6·3·6·12·8·6·4·2·6. 6+3+6=15, 53−15=**38** | 사이드카 |
| PH-004 12 · PH-005 8 · PH-006 6 · PH-007 4 · PH-008 2 · PH-009 6 (§7.1) | 위와 동일 | 사이드카 |
| trace 간선 **264** · 순서 위반 **4** | `dependency_audit.method` 가 *"…행 전량(264개)을 파싱"*. `resolved` 2 + `open` 2 = **4**. wave-1 둘은 닫힘, wave-4 둘(`FR-SHELL-004`→`SEC-WORKSPACE-004` · `FR-WORKSPACE-003`→`FR-WORKSPACE-002`)은 열려 있음 | `wave-assignment.json` |
| Rand A-B 91.9% · A-C 95.3% · B-C 92.7% · C 채택 | `adoption_method` 에 그대로. `docs/next/03.wave-decision-gate.md:27` 이 같은 값 | `wave-assignment.json` |
| vendor 테스트 파일 2→9 | 현재 `packages/editor` 테스트 파일 = `test/` 2개 + `src/vendor/atomic-editor/__tests__/` 7개 = **9** | 실측 |
| 케이스 27→102 · 실패 0 | 커밋 `f385556` 메시지가 *"수집 결과를 **러너 출력 그대로** 적는다 — 파일 2 -> 9, 케이스 27 -> 102, 실패 0, exit 0"* · *"검증: npm test 9파일 102 passed exit 0"* — **출처(명령+시점) 명시**, 파일 수 실측과 모순 없음 | 커밋 메시지 |
| §7.2 wave 별 요구 건수 31·25·24·35·18·26·33·34 | wave-2…wave-9 = 31·25·24·35·18·26·33·34. wave-1 24 포함 총 250. wave-2~9 합 **226** | `wave-assignment.json` |
| 확인 등급 wave 33건 (§1) | wave-8 = 33 | 같음 |
| 수용 기준 **13개** | `00.decision-log.md` §4 표에 1~13행 | 실측 |
| 범위 밖 15 = Phase 2 조항 11 + 취소선 4 (§5-2) | `exclusion_class` 집계 = `{user-excluded: 11, superseded: 4}`. 취소선 4 = `R27`·`R44-a`·`R106-b`·`R108-a` (`ledger-clauses.struck_ids` 와 일치) | `design-baseline.json` |
| 선언 제약 23건 C-01~C-23 (§4) | `constraints` 길이 23, id 가 C-01…C-23 연속 | `constraints-2.json` |
| eval.md CRITICAL 0 · HIGH 3 · MEDIUM 7 · LOW 5 (§4) | `eval.md:12-15` 표에 그대로 | 실측 |
| server `test/` 17 tests (§4) | 테스트 파일 4개(`document-store` 5 · `database` 3 · `reconciliation-finding` 7 · `main` 2) → `it(`/`test(` **17건**. §0-4 의 "server 4파일 17 passed" 와 일치 | 실측 |
| `R139` 계열 **8행** (§2.2) | `T-PH002-03-queue-contract.md` 가 145~152행 8개(`R139`~`R139-g`)를 열거하고 `grep -cE '^\| *(\*\*)?~*`?R139' → 8` 을 기록 | 실측 |
| `R139` 금지 칸 **8개** (§5-8) | queue-contract §3.2 표에 8행: `occurred_at`·`node_id`·`actor`·`resolved_at`·`resolver`·`workspace_id`·`status`/`is_resolved`·`path` | 실측 |

### 테스트·빌드 결과 (재실행하지 않음 — 출처 판정)

§2.2 의 `> **검증 (2026-08-21 실행)** — npm run typecheck 세 패키지 전건 exit 0 · npm test editor 9파일 102 passed + server 4파일 17 passed · exit 0` 은 **실행 명령과 시점을 밝혔고**, 산출물이 모순되지 않는다 —
`packages/` 아래 패키지가 정확히 셋(`editor`·`server`·`web`)이고 셋 다 `typecheck` 스크립트를 갖는다. `test` 스크립트는 editor·server 둘만 있어 "editor + server" 서술과 맞는다. editor 테스트 파일 9개·server 4개는 실측과 일치하고, server 17 케이스는 grep 계수와 일치한다. → **TRUE**.

### git

- 브랜치 `master` — `git rev-parse --abbrev-ref HEAD` → `master`
- 원격 `origin` = `B:/work/git/DocuLight2.0.git` — `git remote -v` 그대로
- 커밋 해시 **10건 전건 실존** — `git rev-parse --verify --quiet` 로 확인 (캐럿 함정을 피했다):
  `c4ac5c4` 영속 기반 · `1dfb045` 이름 검증 미결 값 확정 · `d8725f7` server/web 스캐폴드 · `5a541b2` 계획 HIGH 3 처분 · `f385556` 모노레포 골격 + vendor 테스트 · `0637c1e` wave-1 계획 · `0c1a3cf` 의존 간선 둘 · `5d90ac3` R33-a 서술 결함 · `192a9ea` R21 스윕 완결 · `f4f6de6` 9 wave 분해
- §2.1 의 커밋 귀속 중 `192a9ea`(R33-a 스윕) · `5d90ac3`(그 서술 결함 수정) · `0c1a3cf`(의존 간선 2건) · `5a541b2`(HIGH 3 처분) · `f385556`·`d8725f7`(PH-001) · `1dfb045`(PH-002) · `c4ac5c4`(PH-003) 은 **커밋 제목과 내용이 서술과 일치**한다

### 요구사항 ID · 원장 조항 ID

- 원장 조항 **70개 ID 전건 실존** (`R1`·`R3`·`R4`·`R20`·`R33-a`·`R40-f`·`R76-a`·`R76-b`·`R84-a`·`R102`·`R139` 포함, `ledger-clauses.json` 대조에서 MISS 0)
- 인용된 REQ-ID **13건 전건 실존** — `FR-WORKSPACE-004`·`FR-WORKSPACE-005`·`FR-WORKSPACE-002/003`·`CON-WORKSPACE-001`·`SEC-STORAGE-004/005/006`·`OPS-STORAGE-001`·`FR-SHELL-004/011`·`SEC-WORKSPACE-004`·`CON-ARCH-008`·`REL-STORAGE-001`
- 공백 ID `G11`·`G12`·`G14`·`G30`·`G31`·`G36` 전건 실존
- `npx speckiwi show <REQ-ID> --json` (§4) 이 실제로 동작한다

### §5 확정 결정

| # | 검증 |
|---|---|
| 5-9·5-10 `FR-WORKSPACE-004` | `npx speckiwi show FR-WORKSPACE-004 --json` → Implementation Notes 에 `[2026-08-21]` 두 항으로 **세 값과 예약어가 실제로 기록돼 있다**: 금지 문자 = Win32 예약 문자 `< > : " / \ \| ? *`(9) + 제어문자 `U+0000`–`U+001F` + 말단 공백·마침표 / 최대 이름 길이 = **UTF-8 255바이트** / 경로 총길이 = **워크스페이스 루트 기준 상대 255**. 예약어 = `CON`·`PRN`·`AUX`·`NUL`·`COM1`~`COM9`·`COM¹`·`COM²`·`COM³`·`LPT1`~`LPT9`·`LPT¹`·`LPT²`·`LPT³` · 판정은 **확장자를 뗀 basename 에 대소문자 무시**. 문서 서술과 **자구까지 일치** |
| 5-11 도메인 격리 | `packages/server/src/domain/` 은 포트 인터페이스 4파일(`audit-sink.ts`·`document-store.ts`·`finding-queue.ts`·`metadata-store.ts`)뿐이고 **`from '…'` import 가 통틀어 0건**이다 — `better-sqlite3`·`node:fs`·`express` import 자리 **0건** (주석 제외 조건 충족) |
| 5-12 server 진입점 | `packages/server/src/main.ts:10` `export function createApp(): Express` / `:18` `export function startServer(port: number)` — 분리돼 있다 |
| 5-7 `CON-WORKSPACE-001` | `T-PH002-02-hierarchy-review.md` §1 제목이 *"판정 — **깊이 상한이 아니다. 계층의 종류를 닫은 조항이다**"* 이고 §1 이 *"깊이 상한은 `R1`·`R3` 이 세운 이 제품의 존재 이유와 정면으로 충돌한다"* 를 적는다. §3 "깊이 카운팅 거부 코드 — **0건**". 사이드카 OQ-01 도 같은 결론 |
| 5-8 `R139` 대기열 | queue-contract §3.2 금지 칸 8개 + §"`audit_ref` 를 nullable 로 만들고 싶어지는 순간이 온다" 경고 |
| 5-2·5-3·5-4·5-5·5-6 | `constraints-2.json` C-21(PM2 복사 금지) · C-22(이중 게이트) · C-23(wave 전용 target 미생성 · 근거 `CON-ARCH-008`) · C-20(권장안 선택) 이 문서 서술과 일치 |
| 5-1 wave 순서 | `wave-assignment.json` 의 wave-1~9 이름이 골격 → ACL 코어 → 인증 → 셸 → 본문 → 찾기 → 권한 관리 → 확인 등급 → 감사 순 |

### 코드 실측 (§2.2 · §4)

- `packages/web/vite.config.ts` — `server.port: 3399`, `/api` → `http://localhost:3400` 프록시, 주석이 `C-09` 를 인용
- `packages/server/src/config/config.ts` — `docsRoot`·`databaseFile`·`port` 세 필드, `DEFAULT_PORT = 3400`
- `packages/server/src/infra/sqlite/database.ts:23-24` — `pragma('journal_mode = WAL')` · `pragma('foreign_keys = ON')`
- 마이그레이션 3개 — `001_init.sql`·`002_audit_log.sql`·`003_reconciliation_finding.sql` (SQLite 러너 + 대기열 + 감사 로그 최소형)
- `packages/server/src/infra/fs/document-store.ts:46-60` — 주석 *"경로 탈출은 fail-closed 다"* + 절대경로 거부 · `relative()` 로 `..` 이탈 거부
- `packages/server/package.json` — Express + better-sqlite3 / `packages/web/package.json` — Vite + React + TS (SSR 없음)
- `packages/editor/package.json` — `@codemirror/*` 다수 (CodeMirror 6 에디터)

### §9 함정 — 실측 가능한 셋 전건 참

- **① `NODE_ENV=production`** — `node -e "console.log(process.env.NODE_ENV)"` → `production`. **이 셸의 기본값이 맞다**
- **② 루트 `package.json` 에 `happy-dom`** — `devDependencies: { "happy-dom": "^20.10.6" }` 존재
- **③ 정규식 계수 56 vs 실제 75** — 커밋 `f385556` 메시지에 *"착수 전 정규식 계수는 vendor 케이스를 56 으로 셌으나 실제는 75 다. it.each 를 놓친 것"* 로 기록됨
- **`packages/editor/vite.config.ts` 의 `test.include`** — `['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}']` 로 **vendor 를 포함한다**. 주석까지 *"vendor 드롭의 테스트도 수집한다"*
- **⑥ `R139` 미확인 사례** — queue-contract 문서가 *"착수 전 판정 문서는 이 범위를 `R139-a`~`R139-f` 로 적었다. `R139-g` 가 빠져 있었고, 하필 그것이 대기열의 이름을 확정하는 조항이다"* 로 기록

### §9 그 밖의 규칙

- **`docs/spec/91.03-history.md` 동결** — `docs/next/00.handoff.md:47` 이 *"`R124-a` 스윕 대상에서 제외하며, 사실 오류를 발견해도 정정하지 않는다"* 로 못박음. 파일 실존
- **1.0 경로가 2.0 설정에 없다** — `.ts`/`.js`/`.json` 소스에서 `DocuLight[/\\]DocLight` 매칭은 `docs/plans/…sidecar.json` 의 외부 모듈 영향 서술 1건뿐이고 **런타임 설정에는 0건**. `config.ts` 주석이 `R21-b` 를 명시
- **`npx speckiwi validate` errors 0 · 경고 `SRS-W072`·`SRS-W023` 선재** — `show` 응답의 `diagnosticsSummary: {errors: 0, warnings: 2, byCode: {SRS-W072: 1, SRS-W023: 1}}`. `SRS-W023` 이 곧 §6 의 *"`FR-SHELL-011` `Stability=draft`"* 를 뒷받침한다

### §6·§8·§10 나머지

- **wave-4 depends_on 2건** — `dependency_audit.open` 에 정확히 그 둘, 각각 *"wave-4 착수 전에 판정하라"* 주석
- **유예 AC 7건** — `deferred_ac[]` 7건, **건마다 사유가 있다** (`DR-STORAGE-002` AC-3 · `FR-WORKSPACE-005` AC-3/AC-4 · `FR-WORKSPACE-006` AC-6 · `SEC-STORAGE-004` AC-3/AC-4 · `CON-ARCH-002` AC-7)
- **`G36` ③** — 원장 640행이 *"상한을 두면 「거른 뒤 N건」인지 「거르기 전 N건」인지가 갈리고, **후자면 존재 오라클이 된다**"* 로 문서 서술과 자구까지 일치
- **`G14`** — 원장 612~614행에 화면 최신성 공백이 `G14`·`G14-a`·`G14-b` 로 등재
- **§8 PH-004 12 Task** — `T-PH004-01`~`12` 가 red/green 6쌍이고, 각 쌍의 대상 REQ 가 표의 서술과 맞는다: 01/02 = `DR-STORAGE-003`+`SEC-STORAGE-001`(순차 정수 금지·UUIDv4 급 엔트로피·열거 불가) · 03/04 = `DR-STORAGE-003` AC-2~5(ID 유지 트랜잭션) · 05/06 = `FR-WORKSPACE-004` AC-1~8(이름 검증기) · 07/08 = `FR-WORKSPACE-005`(대소문자 동명 → 자동 접미사, *"거부가 아니다"*) · 09/10 = `SEC-STORAGE-005`(점 시작 이름 거부) · 11/12 = `SEC-STORAGE-004`(점 경로 가드)
- **§10 `packages/editor/package-lock.json` 추적 중** — `git ls-files --error-unmatch` → **TRACKED**
- **§10 계획 검증 잔여** — `notes.md` §4 머리가 *"MEDIUM·LOW 12건 중 10건을 고치고 2건을 사유와 함께 기각했다"*, 기각 둘은 §4.2 의 **M-6** 와 §4.3 의 **L-5** 다. 절 번호(§4.2·§4.3)까지 일치
  - ⚠ **원본의 소표는 「9 고침 + 1 기록 + 2 기각」이다** (§4.2 "6건 고침 · 1건 기각", §4.3 "3건 고침 · **1건 기록**(L-4) · 1건 기각"). 핸드오프는 `notes.md` 자신의 요약 문장을 그대로 옮긴 것이라 **인용은 정확**하지만, "10건 고침"의 한 건은 실제로는 `L-4` 의 **기록만**(RISK-16 등재)이다
- **§10 남은 규모** — wave-1 38 Task · wave-2~9 226 요구, 둘 다 위 수치와 일치

---

## 내가 확인하지 못한 것

1. **테스트·빌드를 재실행하지 않았다.** `editor 102 passed` · `server 17 passed` · `typecheck exit 0` 은 **출처 판정**으로 TRUE 로 뒀다 — 커밋 `f385556` 메시지의 러너 출력 기록과 §2.2 의 실행 시점 명시, 그리고 파일 수(9·4)·케이스 수(server 17) 실측 정합이 근거다. **현재 시점의 실제 통과 여부는 다음 세션이 §0-4 대로 직접 확인해야 한다.**
2. **`docs/spec/*.srs.md` 본문 전수를 읽지 않았다.** REQ-ID 실존은 파일·헤딩 매칭과 `speckiwi show` 로 확인했고, 개별 AC 문면은 `FR-WORKSPACE-004`(8개) 외에는 사이드카 `test_symbol` 을 경유해 간접 확인했다.
3. **MCP mutation 계열 도구의 런타임 동작**(§9 ⑦)은 호출하지 않았다.
4. **`B:` 드라이브 원격의 실체**는 URL 문자열만 확인했고 접근·백업 상태는 보지 않았다.

---

## 덧 — FALSE 는 아니지만 다음 세션이 밟을 자리

문서 자체의 거짓은 아니되, **두 산출물이 서로 어긋나 있어** 그대로 두면 §8 지시를 따르는 다음 세션이 틀린 값을 구현한다.

**`FR-WORKSPACE-004` AC-6 의 경로 총길이 — 요구사항은 255, 사이드카는 512.**

- §5-9 와 요구사항 Implementation Notes(`[2026-08-21]`): **워크스페이스 루트 기준 상대 경로 255**
- 사이드카 `T-PH004-05` / `T-PH004-06` 의 `TC-REQ-FR-WORKSPACE-004-AC6-*`: `expected_failure_signature = "relative path over **512** UTF-8 bytes accepted"`

사이드카는 2026-08-20 작성이고 세 값 확정은 2026-08-21 이라 **사이드카 쪽이 낡은 값**이다. 그런데 §8 은 *"§5-9·§5-10 의 값 그대로"* 라 하면서 동시에 *"각 Task 의 정확한 명세·test_case·`expected_failure_signature` 는 사이드카에 있다"* 고 가리킨다 — **두 지시를 함께 따르면 값이 갈린다.** `T-PH004-05` 를 쓰기 전에 어느 쪽이 정본인지 먼저 못박아야 한다(요구사항 기록이 SSOT 이므로 255 가 맞다).
