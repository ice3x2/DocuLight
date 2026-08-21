# DocuLight 2.0 Phase 1 — wave-1 완주, wave-2 착수 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-21 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | wave 9개를 끝까지 완주해 Phase 1 완성 제품을 만든다 |
| 현재 상태 | wave-1 `complete` 기록 완료(53 Task · 24 요구사항). wave-2 미착수 — 계획 문서 없음 |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` (설계 원장) + `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` (SRS 인덱스) |
| 다음 세션 첫 행동 | `$env:NODE_ENV="development"` 후 wave-2 의 31개 요구사항을 읽고 계획을 세운다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 만 읽고** 자율적으로 이어갈 수 있도록 정리한 것이다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `git status --porcelain` 과 `git log --oneline -5` 로 아래 「현재 워킹트리·저장소 상태」와 일치하는지 확인한다. 어긋나면 저장소를 믿는다.
3. PowerShell 이면 `$env:NODE_ENV="development"` 를 먼저 실행한다. 이 셸의 기본값은 `production` 이고, 그대로 `npm install` 하면 devDependencies 가 빠진다.
4. `npm test` 로 기준선을 확인한다 — 아래 「테스트·빌드 실행 명령」의 기대값과 같아야 한다.
5. wave-2 착수. 아래 「다음 세션 지시서」의 1번부터.

---

## 1. 최종 작업 목표

원장 `docs/spec/00.decision-log.md` §4 의 Phase 1 수용 기준 13개를 전건 통과시킨다. 그 경로로 SRS `phase-1` target 의 요구사항 250건을 9개 wave 로 나눠 구현한다.

**완료 조건**: 250건 중 `blocked` 9건을 제외한 241건이 `implemented` 이상이고, 원장 §4 수용 기준 13개가 통과하며, 전체 wave 최종 검증이 통과한다.

**wave 분해 (확정, 재분해 금지)**

| wave | 요구 | 범위 | 상태 |
|---|---|---|---|
| 1 | 24 | 모노레포 골격과 영속 기반 | **complete** |
| 2 | 31 | 주체와 ACL 판정 코어 (헤드리스 도메인) | 미착수 |
| 3 | 25 | 인증·세션·PAT·설치 마법사 | 미착수 |
| 4 | 24 | 셸 골격과 노드 조작 — 트리·탭·설정 모달·휴지통 | 미착수 |
| 5 | 35 | 본문 표면 — 에디터·자동 저장·버전·충돌·첨부 | 미착수 |
| 6 | 18 | 찾기 계열 — 링크·백링크·태그·전역 검색·MCP | 미착수 |
| 7 | 26 | 권한·주체 관리 화면과 이동·복사 | 미착수 |
| 8 | 33 | 확인 등급 — 파괴적 조작 앞의 마찰 | 미착수 |
| 9 | 34 | 감사 기록·재조정 대기열·1.0 컷오버 (Phase 1 종료 관문) | 미착수 |

wave-1 의 요구 수가 22 에서 24 로 늘어난 것은 `REL-STORAGE-001`·`REL-AUDIT-001` 을 wave-9 에서 옮겨왔기 때문이다. **그 이동은 `wave-assignment.json` 에 이미 반영돼 있다** — 두 ID 는 wave-1 에만 있고 wave-9 의 34건에는 없다(9개 wave 합 = 250, 중복 0). wave-9 착수 시 걷어낼 중복은 없다.

---

## 2. 현재까지 완료한 작업

### wave-1 (53 Task · 9 Phase 전부)

- [x] PH-001~003 — 모노레포 골격, SQLite/파일시스템 영속 기반 — 커밋 `f385556`, `d8725f7`, `c4ac5c4`. ⚠️ 미검증 — 이 셋이 이전 세션의 것인지는 저장소에 세션 경계 기록이 없어 확인 불가. 커밋 날짜는 PH-004 와 같은 날이다.
- [x] PH-004 노드 ID 와 이름 규칙 (12 Task) — 커밋 `89e81f4`~`251933e`
- [x] PH-005 워크스페이스 계층·레이아웃·사이드카·기본 워크스페이스 (8 Task) — 커밋 `fed6f65` 까지
- [x] PH-006 재조정과 대기열 연동 (6 Task) — 커밋 `d9189d9` 까지
- [x] PH-007 서빙 — 단일 프로세스·fail-closed (4 Task) — 커밋 `d163212` 까지
- [x] PH-008 PM2 구성과 백업·복원 런북 (2 Task) — `C:\Work\git\DocuLight2.0\ecosystem.config.cjs`, `C:\Work\git\DocuLight2.0\docs\ops\backup-restore.md`
- [x] PH-009 규약 검토 6건 (6 Task) — 서브에이전트 판정, 결과를 요구사항 Verification Evidence 에 기록

### 검증

- [x] 독립 검증·검토 서브에이전트 **10기** 운용 — CRITICAL 2건 · HIGH 8건 발견, 전부 처분
- [x] wave-1 종료 상호검증 2회차 — 완결성 stance(4계층 고정 분모) + 보존 stance(diff 4부류)
- [x] PH-003 테스트 오염 감사 — 단언 27개 분류: 요구 24 / 구현 2 / 공허 1
- [x] wave-1 `complete` 기록 — `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` 마지막 줄, 이월 잔여 5건 명시

### 실행으로 확인한 것 (2026-08-21 실행)

- `NODE_ENV=production` 셸에서 `npm test` → **exit 0**. editor 10 files / 103 tests, server 20 files / 106 tests.
- `npm run typecheck` → **exit 0** (editor · server · web 세 패키지).
- `npx speckiwi validate --json` → **errors 0**, warnings 2 (`SRS-W072`, `SRS-W023` — 둘 다 wave-1 이전부터 있던 것).
- `npx speckiwi summary --target phase-1 --json` → `{planned:217, implemented:20, in_progress:4, blocked:9}`, `verified 0`.
- `npm run build` (production 셸) → 3개 패키지 전부 성공.
- 빌드 산출물 기동 — SPA `/` 200, `/api/nope` 404, 기본 워크스페이스 1개 생성.
- 볼트 E2E — 한글·공백·괄호·다단 중첩 문서 4개를 `docsRoot/<ws>/` 에 직접 넣고 재기동 → 4개 전부 등재, 서빙 200, 본문 바이트 일치, `.obsidian/app.json` 은 등재 0건·서빙 404.

### 2.1 기억과 실제가 달랐던 항목

이번 세션에서 **내가 사실로 적었다가 검증에서 뒤집힌 것들**이다. 다음 세션은 같은 종류의 기억을 의심하라.

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 커밋 `39838ad` 메시지: "문서 라우트 주석의 버전 불일치 서술을 걷어낸다" | **걷어내지 않았다.** 다음 커밋 `c4dc43b` 에서 실제로 고쳤다. `git show 39838ad --stat` |
| "루트 `npm test` green" | **셸에 `NODE_ENV=production` 이 있으면 red 였다** (editor 39건 실패). `NODE_ENV=production npm test` |
| sidecar `deferred_ac` 의 `DR-STORAGE-002 AC-3` 유예 사유 "세 조작의 테이블이 wave-1 에 없다" | **테이블 3개 모두 있다.** `packages/server/src/infra/sqlite/migrations/001_init.sql` 의 `principal`·`group_member`·`acl_entry` |
| `reconciliation-finding.test.ts` 의 AC-8 단언이 삭제 경로 부재를 잰다 | **아무것도 재지 않았다.** `Object.keys` 는 프로토타입 메서드를 못 본다 — `purgeExpired` 를 추가해도 통과했다 |
| `database.test.ts` AC-3 이 「전체 재기록 없이」를 잰다 | **재지 않았다.** 이 요구가 기각한 대안(전체 재기록 저장소)도 통과하는 단언이었다 |
| 커밋 `6b3c6f6` 이 sidecar 불일치를 고쳤다 | **per-req 만 고치고 `totals` 를 두고 갔다** — 같은 종류의 불일치를 AC 축에 새로 만들었다. `b119359` 에서 고침 |

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master`. origin(`B:/work/git/DocuLight2.0.git`)에 `5f54bac` 까지 push 완료.
- 미커밋 파일: **이 핸드오프 문서 자신**(`docs/next/2026-08-21-wave2-acl-core.md`)과 `docs/next/LATEST.md` 수정분. 그 외 없음.
- 최근 커밋 5개:
  - `5f54bac` chore(wave): wave-1 을 이월 잔여와 함께 complete 로 기록한다
  - `b119359` fix: 2회차 검증이 잡은 셋을 처분한다
  - `9d8f682` test(server): 공허한 단언 하나와 재지 않는 단언 하나를 실제로 재게 고친다
  - `18ad0ba` docs(spec): wave-1 요구사항에 추적 링크와 Status 를 기록한다
  - `6b3c6f6` fix(plan): 사실과 다른 유예 하나를 철회하고 Task 수를 실제와 맞춘다

---

## 4. 관련 문서·코드 (절대경로)

`<REPO>` = `C:\Work\git\DocuLight2.0`

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 설계 원장 (SSOT) | `<REPO>\docs\spec\00.decision-log.md` | 조항 `R1`~`R149`, 공백 `G8`~`G36`. 모든 설계 판단의 정본 |
| SRS 인덱스 | `<REPO>\docs\spec\00.index.md` | 11 scope 등록, 상태 요약 |
| wave 분해 | `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` | 9 wave × 요구사항 ID 목록 |
| 설계 기준선 | `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\design-baseline.json` | wave 별 원장 조항 배정 |
| 제약 | `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\constraints-2.json` | 사용자 제약 23건 (`C-01`~`C-23`) |
| wave 저널 | `<REPO>\kiwi\waves.jsonl` | wave 진행·검증 회차·완료 기록 (append-only) |
| wave-1 계획 | `<REPO>\docs\plans\2026-08-20.doculight2.wave-1.plan.md` | **wave-2 계획을 쓸 때 형식의 본보기** |
| wave-1 사이드카 | `<REPO>\docs\plans\2026-08-20.doculight2.wave-1.sidecar.json` | Task·coverage·deferred_ac 기계 판독 형식 |

**wave-1 이 만든 서버 코드** — `<REPO>\packages\server\src\`

- `domain\ports\` — 7개 포트를 도메인이 소유 (`audit-sink`, `document-store`, `finding-queue`, `metadata-store`, `node-repository`, `workspace-files`, `workspace-repository`)
- `domain\naming\` — 이름 규칙 (`naming-policy`, `name-validator`, `collision`, `case-folding`, `hidden-name-rule`, `validation-result`)
- `domain\reconciliation\vocabulary.ts` — 감사 조작명·대기열 유형명의 정의 지점
- `domain\workspace\` — `workspace.ts`, `quarantine.ts`, `archive.ts`
- `app\node\node-service.ts` — 생성·개명·이동·업로드 네 진입점
- `app\reconciliation\reconcile.ts` — 전체 재조정과 주기 루프
- `app\workspace\` — `create-workspace`, `restore-from-sidecar`, `bootstrap-default-workspace`, `quarantine-duplicate-sidecar`
- `infra\sqlite\` — 어댑터 + `migrations\001`~`005`
- `infra\fs\` — `document-store`, `workspace-layout`, `workspace-sidecar`
- `http\` — `server.ts`, `static-spa.ts`, `guards\dot-path-guard.ts`, `guards\fail-closed.ts`, `routes\documents.ts`
- `main.ts` — `createApp` / `bootstrap` / `startServer` 분리

**wave-2 가 손댈 자리 (추정)**: `principal`·`group_member`·`acl_entry` 테이블은 `001_init.sql` 에 이미 있다. wave-2 는 그 위에 도메인 포트와 판정 로직을 세운다. ⚠️ 미검증 — wave-2 요구사항 31건을 아직 읽지 않았으므로 이 배치가 맞는지 확인 후 진행하라.

---

## 5. 확정된 결정 (변경 금지)

1. **wave 경계**: 위 9 wave 분해대로 진행. 재분해 금지 — **확정**. (근거: `<REPO>\kiwi\waves.jsonl` 에 등재, `docs/next/03.wave-decision-gate.md`)
2. **wave 전용 target 을 만들지 않는다**: 모든 wave 가 `phase-1` target 안에서 요구사항 부분집합으로 범위를 한정한다 — **확정**. (근거: `constraints-2.json` C-23, `npx speckiwi active-target --json` 이 `phase-1` 반환)
3. **`verified` 로 올리지 않는다**: wave 종료 시 `implemented` 까지만. `verified` 판정은 Phase 1 종료 게이트의 몫 — **확정**. (근거: `<REPO>\kiwi\waves.jsonl` wave-1 complete 레코드의 `status.verified: 0`)
4. **경로 총길이 상한 512바이트** (워크스페이스 루트 기준 상대, UTF-8) — **확정**. (근거: `<REPO>\packages\server\src\domain\naming\naming-policy.ts` 의 `MAX_RELATIVE_PATH_BYTES`, `docs\spec\13.workspace.srs.md` 의 `FR-WORKSPACE-004` Implementation Notes)
5. **이름 상한 255바이트**(UTF-8) — **확정**. (근거: 같은 파일 `MAX_NAME_BYTES`)
6. **`CON-WORKSPACE-001` AC-4 는 「계층의 *종류*가 넷」으로 읽는다** — 경로 깊이 상한이 아니다. 깊이로 읽으면 `DR-WORKSPACE-001` AC-7(볼트를 그대로 넣는다)과 충돌한다 — **확정**. (근거: `docs\spec\13.workspace.srs.md` 의 `CON-WORKSPACE-001` VE-1, `<REPO>\packages\server\test\domain\workspace\hierarchy.test.ts` 마지막 테스트)
7. **운영 포트 3399, 개발 API 포트 3400** — 정의 지점은 각각 `<REPO>\packages\server\src\config\config.ts` 의 `DEFAULT_PORT` 와 `<REPO>\packages\server\.env.development` — **확정**.
8. **거부는 예외가 아니라 값으로 돌려준다** — `node-service.ts` 의 `Placed | Rejected` 판별 유니온 — **확정**. (근거: `constraints-2.json` C-13)
9. **PM2 `exec_mode: 'fork'`, `instances: 1`** — cluster 금지 — **확정**. (근거: `<REPO>\ecosystem.config.cjs`)
10. **1.0 저장소 `C:\Work\git\DocuLight\DocLight` 는 읽기 전용** — 수정 금지, 2.0 의 어떤 설정도 그 경로를 가리키지 않는다 — **확정**. (근거: `constraints-2.json` C-10/C-21)

---

## 6. 미결정·유예 항목

**wave-1 이 유예한 AC 6개** — `<REPO>\docs\plans\2026-08-20.doculight2.wave-1.sidecar.json` 의 `deferred_ac[]`

| 요구사항 | AC | 왜 유예 | 받을 곳 |
|---|---|---|---|
| `CON-ARCH-002` | AC-7 | 대응 엔드포인트와 권한 필터가 저장소에 0건 | 트리·원문·검색 엔드포인트 wave + ACL wave |
| `FR-WORKSPACE-005` | AC-3 | 안내 문구 정본은 `SEC-SHELL-002` 소유 | SHELL scope wave |
| `FR-WORKSPACE-005` | AC-4 | 「보이지 않는 상대」 판정에 권한 모델 필요 | **wave-2 (ACL)** |
| `FR-WORKSPACE-006` | AC-6 | 브라우저 읽기·편집 화면이 없음 | wave-5 (에디터) |
| `SEC-STORAGE-004` | AC-3 | 첨부 다운로드 엔드포인트 없음 | 첨부 wave |
| `SEC-STORAGE-004` | AC-4 | 휴지통·버전 API 없음 | wave-4 |

**wave-1 이 이월한 잔여 5건** — `<REPO>\kiwi\waves.jsonl` 마지막 줄 `carried_residuals`

- `C-08` — PH-003 이 test-first 가 아니었다(커밋 `c4ac5c4`). 되돌릴 수 없다. 오염 감사로 해악 2건을 찾아 커밋 `9d8f682` 에서 고쳤다. **PH-004 이후는 전부 red→green 순서를 지켰다.**
- `C-11` — MCP mutation 의 감사 추적이 원리적으로 부재. `dryRun` 이 기존 행과 바이트 단위로 같은 문자열을 내므로 손 편집과 구별할 수 없다.
- `C-01` — 모노레포 소스 레이아웃을 규정하는 요구사항이 `docs/spec` 에 없다. 결정 방법: ARCH scope 가 다시 열리는 wave 에서 요구사항 신설.
- `docs/plans/2026-08-20.doculight2.wave-1.validator.json` 이 구현 전 상태(errors 2). 계획 도구를 다시 돌려야 갱신된다.
- `SRS-W072` — `docs/spec/02.feature-request-live-preview.md` 가 scope 문서와 선두 번호 2 를 공유. 개명하면 참조 전량 스윕이 필요하다.

---

## 7. 남은 작업 전체 목록

- [ ] **wave-2** 주체와 ACL 판정 코어 (31 요구) — 완료 조건: 31건 전부 `implemented` 이상 + 종료 상호검증 통과 + `waves.jsonl` 에 `complete`
- [ ] **wave-3** 인증·세션·PAT·설치 마법사 (25) — 의존: wave-2
- [ ] **wave-4** 셸 골격과 노드 조작 (24) — 의존: wave-3
- [ ] **wave-5** 본문 표면 — 에디터·자동 저장·버전·충돌·첨부 (35) — 의존: wave-4
- [ ] **wave-6** 찾기 계열 (18) — 의존: wave-5
- [ ] **wave-7** 권한·주체 관리 화면과 이동·복사 (26) — 의존: wave-4, wave-2
- [ ] **wave-8** 확인 등급 (33) — 의존: wave-7
- [ ] **wave-9** 감사 기록·재조정 대기열·1.0 컷오버 (34) — 의존: 전부. 이 34건에 `REL-STORAGE-001`·`REL-AUDIT-001` 은 **들어 있지 않다**(wave-1 로 이동 완료). 그대로 34건으로 시작하라
- [ ] **전체 wave 최종 검증** — 설계 기준선 전체 대비. 완료 조건: 잔여 CRITICAL·HIGH 0
- [ ] **Phase 1 종료 이중 게이트** — wave 완주 + 원장 §4 수용 기준 13개. 그때 `implemented` → `verified` 승급

---

## 8. 다음 세션 지시서

1. **wave-2 요구사항 31건을 읽는다.**
   목록(확인 완료): `CON-ACL-001` `CON-ACL-002` `CON-ACL-003` `CON-ACL-004` `CON-PRINCIPAL-001` `CON-PRINCIPAL-002` `CON-PRINCIPAL-003` `CON-PRINCIPAL-005` `CON-PRINCIPAL-007` `DR-ACL-001` `DR-PRINCIPAL-001` `DR-PRINCIPAL-002` `SEC-ACL-001` `SEC-ACL-002` `SEC-ACL-003` `SEC-ACL-004` `SEC-ACL-005` `SEC-ACL-006` `SEC-ACL-007` `SEC-ACL-008` `SEC-ACL-009` `SEC-ACL-010` `SEC-ACL-011` `SEC-ACL-012` `SEC-ACL-013` `SEC-ACL-014` `SEC-ACL-016` `SEC-PRINCIPAL-001` `SEC-WORKSPACE-001` `SEC-WORKSPACE-002` `SEC-WORKSPACE-003`
   → 검증: `mcp__speckiwi__get_requirement` 로 31건의 AC 총수를 세어 적어 둔다. 그 수가 이후 모든 커버리지 판정의 분모다.

2. **Phase·Task 로 분해한다.** `<REPO>\docs\plans\2026-08-20.doculight2.wave-1.plan.md` 의 형식을 그대로 따른다 — Task 마다 `req_ids` · `files` · `depends_on_task` · `tdd.phase` · `acceptance_tests` · `trace_links`.
   → 검증: `type=code` Task 가 전부 red/green 쌍으로 나뉘어 있고, 각 green Task 의 `depends_on_task` 에 짝 red Task 가 들어 있다.

3. **TDD 로 구현한다.** Task 마다 실패 테스트 커밋(`test(server): …`) → 최소 구현 커밋(`feat(server): …`).
   → 검증: 각 red 커밋에서 `npx vitest run <파일>` 이 exit 1 이고, green 커밋에서 exit 0.

4. **wave 종료 상호검증.** 두 stance 를 **분리된 서브에이전트**로 돌린다 — 완결성(REQ/AC · 설계 · 제약 · 보존 네 계층, 분모를 사전에 고정해 전달) + 보존(diff 네 부류).
   → 검증: 두 보고의 롤업이 CLEAN 이고 잔여 CRITICAL·HIGH 0.

5. **`waves.jsonl` 에 `complete` 를 append 한다.** 이월 잔여가 있으면 `carried_residuals` 에 각각 처분과 소유 wave 를 적는다.
   → 검증: `python -c "import json,io; [json.loads(l) for l in io.open('kiwi/waves.jsonl',encoding='utf-8') if l.strip()]"` 가 예외 없이 끝난다.

---

## 9. 거버넌스·게이트·함정

### 규칙

- **TDD 강제**: 동작 변경은 실패 테스트 먼저. 실수로 구현을 먼저 썼으면 되돌리고 red 부터 다시 한다.
- **검증은 서브에이전트로**: 자기 산출물을 자기가 판정하지 않는다. 검증자에게 내 결론을 주지 않는다.
- **커밋 메시지에 AI 시그니처 금지**: `Co-Authored-By` · `Generated with` · `[bot]` · `noreply@anthropic.com`. 제목에 `Phase {n}` · `Step {n}` 표식 금지.
- **황금률**: speckiwi MCP mutation 후 같은 SRS 파일을 `Edit`/`Write` 로 고치지 않는다. SRS 는 MCP 로만 바꾼다.
- **결정 게이트는 묻지 않고 권장안을 선택한다** (사용자 지시).
- **「뿐」·「전부」·「유일한」·개수 단정을 쓰지 않는다** — 이 저장소에서 예외 없이 나중에 거짓이 됐다.
- **`docs/spec/91.03-history.md` 는 동결** — 사실 오류를 발견해도 고치지 않는다.

### 이번 세션에 실제로 밟은 함정

1. **`NODE_ENV=production` 이 셸 기본값이다.**
   - 증상 A: `npm install` 이 devDependencies 를 빠뜨려 `vitest`·`vite` 가 사라진다 → `npm install --include=dev` 로 복구.
   - 증상 B: editor 테스트 39건이 `act is not a function` 으로 깨진다. 커밋 `d0daaf2` 가 `packages/editor/vite.config.ts` 에서 테스트 모드일 때만 `NODE_ENV=test` 로 덮어 고쳤다. 방벽 테스트는 `<REPO>\packages\editor\test\test-environment.test.ts`.
2. **PowerShell 에서 `cmd; git commit` 은 앞 명령이 실패해도 커밋한다.** `if ($?) { git commit ... }` 으로 막는다. ⚠️ 미검증 — 이 세션에서 `typecheck` 실패를 두 번 통과시켰다고 기억하나, 저장소에 그 사건의 기록이 없어 확인 불가. 셸 동작 자체는 다음 세션이 `false; echo ran` 으로 1초에 재현할 수 있다.
3. **vitest 병렬 워커가 이 머신에서 시작에 실패했다.** ⚠️ 미검증 — 머신 상태 주장이라 저장소로 확인할 수 없다. 원인은 세션 이전부터 있던 node 프로세스 316개로 **추정**하며 실행으로만 재현된다. 대응은 확인됐다: `npx vitest run --no-file-parallelism` 으로 20파일 106테스트 전건 통과(테스트 파일 20개는 저장소로 확인 가능). 병렬 실행이 `[vitest-pool]: Failed to start forks worker` 를 내면 이 플래그를 써라.
4. **`Object.keys` 로 메서드 존재를 검사하면 항상 통과한다** — 프로토타입 메서드를 못 본다. `'name' in obj` 또는 프로토타입 사슬 순회를 쓴다.
5. **서브에이전트의 최종 보고가 메인 세션에 자동 전달되지 않는 경우가 있다.** ⚠️ 미검증 — 에이전트 런타임 동작이라 저장소로 확인할 수 없다. 이 세션에서는 idle 알림만 오고 보고가 오지 않은 경우가 반복됐다. 대응: `SendMessage` 로 "보고 본문을 `main` 에게 직접 보내라" 고 요청하고, 긴 보고는 결론부터 나눠 보내게 한다.
6. **`git diff` 가 binary 로 뜨면 소스에 원시 NUL 이 있다.** 테스트에 제어문자를 넣을 때는 리터럴이 아니라 `String.fromCharCode(0x00)` 를 쓴다.

### 테스트·빌드 실행 명령 (복붙 가능)

```powershell
cd C:\Work\git\DocuLight2.0
$env:NODE_ENV="development"
npm test          # 기대: editor 10 files/103 tests, server 20 files/106 tests, exit 0
npm run typecheck # 기대: exit 0
npm run build     # 기대: editor·server·web 3개 패키지 성공
npx speckiwi validate --json   # 기대: errors 0, warnings 2
```

서버만 돌릴 때 병렬 실패가 나면:

```powershell
cd C:\Work\git\DocuLight2.0\packages\server
npx vitest run --no-file-parallelism
```

---

## 10. 리스크·잔존 이슈

- **문서 서빙이 요청마다 워크스페이스 노드를 전량 메모리에 적재한다.** `<REPO>\packages\server\src\http\guards\fail-closed.ts` 가 `nodes.allIn(workspaceId)` 로 전 노드를 받아 선형 스캔하고 후보마다 `pathOf` 를 부른다. 요청 1건당 SQLite 질의가 대략 `노드 수 × 평균 깊이` 회. 영향: 문서가 많은 워크스페이스에서 응답이 느려진다. 대응: 경로→노드 조회 인덱스가 필요하다 — 어느 wave 가 받을지 미정.
- **`acl_entry.node_id` 에 외래키가 없다.** 의도된 것이며 `001_init.sql` 에 사유를 주석으로 적었다(워크스페이스 계층에도 ACL 이 붙으므로 두 종류의 ID 가 들어온다). **누락으로 보고 `REFERENCES node(id)` 를 추가하면 워크스페이스 단위 ACL 이 삽입 시점에 막힌다.**
- **`node.workspace_id` 에 외래키가 없다.** SQLite 는 기존 테이블에 FK 를 더할 수 없고 재작성은 마이그레이션 트랜잭션 안에서 안전하지 않다. 방어선은 `node-service.ts` 의 응용 계층 사전 검사뿐이며, 저장소로 직접 넣는 재조정 경로는 그 검사를 받지 않는다.
- **`(parent_id, 폴딩 이름)` 유니크 인덱스가 없다.** 이름 충돌 방어가 전적으로 인메모리다. 단일 프로세스에서는 문제없으나 다중 프로세스 배포로 가면 폴딩이 같은 형제가 남는다. `ecosystem.config.cjs` 가 `instances: 1` 이므로 현재는 발생하지 않는다.
- **원장 머리표와 `R92` 가 Phase 2 공백을 다르게 적는다** — 머리표는 `G30`·`G34`·`G35` 셋, `R92` 는 `G34`·`G35` 둘. `CON-ARCH-009` 만 읽는 구현자는 `G30` 판정을 얻지 못한다.
- **`docs/analysis/handoff-factcheck-2026-08-21.md` 에 낡은 값이 남아 있다** (`DEFAULT_PORT = 3400`, 마이그레이션 3개). 그 문서는 시점 기록이라 고치지 않았다. 값의 정본은 코드다.
