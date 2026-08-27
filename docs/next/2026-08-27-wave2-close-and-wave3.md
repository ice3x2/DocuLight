# wave-2 종료 검증과 wave-3 진입 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-27 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | 원장 §4 Phase 1 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | wave-1 종료(complete) · wave-2 구현 완료·**종료 검증 미완** · wave-3/4 미착수 |
| SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` (실행 순서) + `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` (진행 상태) |
| 다음 세션 첫 행동 | wave-2 의 **clean 라운드**를 돌려 wave 를 닫는다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 둘만 읽고** 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

`<REPO>` = `C:\Work\git\DocuLight2.0` 로 줄여 쓴다.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `<REPO>\kiwi\waves.jsonl` 의 마지막 3줄을 읽어 wave-2 가 `status: in_progress`, `phase: pipeline` 에 있음을 확인한다.
3. `git status --porcelain` 이 **비어 있고** `git log --oneline -1` 이 이 문서를 커밋한 행인지 확인한다. 어긋나면 이 문서가 낡은 것이다.
4. **wave-2 의 clean 라운드**를 돌린다 — 마지막 커밋 이후 수정 0 인 상태에서 검증자를 띄우고, 통과하면 `waves.jsonl` 에 `wave-verify`(verdict: pass)와 `complete` 를 append 한다.
5. 그 뒤 wave-3(MCP 서버 패키지, 요구 7건)으로 진입한다.

---

## 1. 최종 작업 목표

원장(`<REPO>\docs\spec\00.decision-log.md`) §4 Phase 1 수용 기준 **13개를 전건 통과**시킨다. `phase-1` target 의 `newWorkCandidates` 가 0 이 되고, 남은 요구가 전부 `implemented` 이상이면 이 작업이 끝난 것이다.

`verified` 일괄 승급은 **이 run 의 범위가 아니다** — 제약 C-07 이 wave 실행 중 금지하며, 최종 검증 통과 후 별도 세션의 몫이다.

---

## 2. 현재까지 완료한 작업

### wave-1 — `FR-EDITOR-007` (종료)

- [x] wave-1 을 `complete` 로 닫음 — `<REPO>\kiwi\waves.jsonl`, 라운드 12 에서 clean 성립
- [x] 표 라이브 프리뷰의 드러나는 절반(AC-7), 태그 칩 CSS(AC-10), 두 클릭 경로 통일(AC-11)
- [x] 상호검증이 **증거 결함 아홉**과 **커밋 서술 과장 넷**을 찾아 고침

### wave-2 — 저장소 기반 (구현 완료, 검증 미완)

- [x] `FR-SHELL-013` AC-4 — PDF 본문 검색 + 페이지 번호. 커밋 `3152ec6`
- [x] `REL-STORAGE-002` — 파일 감시 상관 판정. AC 6/6, 상태 `implemented`. 커밋 `07a1774` · `075b026` · `5ffb01d`
- [x] `SEC-STORAGE-007` — 벡터 인덱스 위생. AC **4/5**, 상태 `in_progress`. 커밋 `98b6811`
- [x] 새 의존성 둘 — `pdfjs-dist@^6.2.108`, `chokidar@^5.0.0` (`<REPO>\packages\server\package.json` 의 `dependencies`)
- [x] `.gitattributes` 신설 — 바이너리 자산의 CRLF 변환 차단. 커밋 `f8a59c7`
- [x] `CLAUDE.local.md` 신설 + `.gitignore` 등재 — 커밋 `e5705f2`

### 검증 실행 기록 (명령과 시점)

| 무엇 | 명령 | 시점 | 결과 |
| --- | --- | --- | --- |
| 전체 회귀 | `npm test` (repo root) | 2026-08-27, 커밋 `98b6811` 직전 | editor 253 통과·1 건너뜀 / server 1272 통과 / web 522 통과 / **실패 0** |
| server 회귀 | `cd packages/server && npx vitest run` | 2026-08-27, 커밋 `5ffb01d` 직전 | **1272 통과, 실패 0** |
| 타입 검사 | `npm run typecheck` | 2026-08-27, 커밋 `5ffb01d` 직전 | 오류 **0** |
| SRS 검증 | `npx speckiwi validate` | 2026-08-27, 커밋 `5ffb01d` 직전 | 오류 **0**, 경고 1(`SRS-W072`, 선재) |

**주의**: 마지막 `npm test`(전 패키지) 전체 실행은 `98b6811` 시점이다. 그 뒤 커밋 `a124049`·`5ffb01d` 는 `docs/spec`·`kiwi`·`packages/server` 만 건드렸고 server 는 단독으로 재실행해 1272 통과를 확인했다. **editor·web 은 `98b6811` 이후 재실행하지 않았다** — 그 둘의 소스가 바뀌지 않았으므로 유효하다고 판단했으나, 다음 세션이 clean 라운드에서 `npm test` 를 한 번 돌리면 확실해진다.

### 2.1 기억과 실제가 달랐던 항목

| 기록된 진술 | 실제 (확인 명령) |
| --- | --- |
| 커밋 `2198618` 본문 「위젯을 세우지 않는 되돌림에 **그 항만** 죽는다」 | **9항이 죽는다.** `cd packages/editor && npx vitest run` (전체 스위트). `live-preview.test.tsx` 파일 하나만 돌리고 전체에 대한 주장을 적었다. `--amend` 로 정정 → `1bbbcfc` |
| 커밋 `81319a3` 본문 「기다리는 것은 전제뿐이고 판정 대상인 노출 여부는 기다리지 않는다」 | **판정 대상의 여집합을 기다렸다.** 데모 문서의 표가 하나뿐이라 `widgets >= 1` 이 `!revealed` 와 동치. 커밋 `00cf43e` 가 고침 |
| 커밋 `81319a3` 본문 「술어가 **로컬 ws 소켓만** 거른다」 | **호스트를 보지 않아 평문 `ws://` 면 무엇이든 삼켰다.** 커밋 `d8a54d2` 가 오리진으로 좁힘 |
| `.gitattributes` 초안 주석 「변환되면 AC-4 시험이 깨진다」 | **깨지지 않는다.** 948바이트로 손상시킨 채 `npx vitest run test/app/document/search-service.test.ts` 를 돌려 19항 전부 통과. pdfjs 가 어긋난 xref 를 재구축한다. 커밋 `f8a59c7` 가 사유를 사실에 맞게 고침 |
| SRS 에 적은 「아카이브 조작 자체가 저장소에 없어 재지 못한다」 | **참이지만 이유가 아니다.** 제약 C-04 가 phase-1 에서 아카이브 기능을 금지한다. `docs\spec\14.storage.srs.md` 에 사유를 보강함 |

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master` — origin 대비 **behind 0**. ahead 수는 이 문서에 적지 않는다: 커밋할 때마다 바뀌어 문서가 곧바로 낡는다. `git rev-list --left-right --count origin/master...HEAD` 로 직접 확인하라 (왼쪽이 behind, 오른쪽이 ahead)
- 미커밋 파일: **없음(clean).** 이 핸드오프 문서와 `docs/next/LATEST.md` 는 이 문서를 쓴 직후 커밋했다
- 이 문서 직전의 코드 커밋: `5ffb01d fix(server): 감시자가 사이드카를 문서로 등재하던 것을 막는다`
- 커밋 여부 판단: **푸시하지 않았다.** 이 문서 커밋을 포함해 이 run 의 작업 전부가 로컬에만 있다. 푸시는 사용자 판단이다

---

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 실행 순서 SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` | wave 3·4·5 의 범위와 설계 기준선 |
| 진행 상태 SSOT | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | wave 별 상태·잔여·결정 기록 (append-only) |
| 제약 14건 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-24.doculight2.phase1-remaining\constraints.json` | 이 run 의 사용자 제약 |
| 원장 | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` | §4 Phase 1 수용 기준 13개 |
| 이전 핸드오프 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-24-wave-master-remaining-phase1.md` | 이 run 의 원 지시 |
| 사전 질의 답변 | `C:\Work\git\DocuLight2.0\docs\next\2026-08-25-answer-to-preflight-questions.md` | 사용자가 확정한 답 |

**wave-2 가 만든 코드** (전부 커밋됨):

- `C:\Work\git\DocuLight2.0\packages\server\src\domain\watch\correlation.ts` — 상관 판정 순수 함수
- `C:\Work\git\DocuLight2.0\packages\server\src\app\watch\relocation-service.ts` — 판정을 노드·ACL·대기열에 반영
- `C:\Work\git\DocuLight2.0\packages\server\src\app\watch\file-watch.ts` — chokidar 감시자
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\ports\vector-index.ts` — 벡터 인덱스 포트
- `C:\Work\git\DocuLight2.0\packages\server\src\infra\sqlite\vector-index-repository.ts` — SQLite 구현
- `C:\Work\git\DocuLight2.0\packages\server\src\app\search\vector-search.ts` — 조회 시 존재 확인(둘째 방어)
- `C:\Work\git\DocuLight2.0\packages\server\src\domain\ports\pdf-text.ts` + `src\infra\pdf\pdfjs-text.ts` — PDF 추출
- `C:\Work\git\DocuLight2.0\packages\server\src\infra\sqlite\migrations\021_vector_entry.sql` — 스키마

**참고 선례**: `C:\Work\git\DocuLight2.0\packages\server\test\arch\assembly.test.ts` — 조립 방벽. 새 서비스가 `main.ts` 에서 도달하지 않으면 실패한다. wave-2 에서 두 번 걸렸고 **닫은 방법이 서로 다르다**:

- `app/watch/file-watch.ts` — `main.ts` 에 **실제로 배선**했다 (`main.ts` 11행 import, 250행 `startFileWatch`)
- `app/search/vector-search.ts` — **허용목록에 등재**했다. 제품 소스 어디에서도 import 되지 않는다(`grep -rn "vector-search" packages/server/src` 0건). 그것을 부르는 표면인 MCP 의미 검색이 wave-3 의 `FR-ARCH-001` 이므로, 그 요구가 오면 허용목록의 그 줄을 지운다

---

## 5. 확정된 결정 (변경 금지)

1. **wave target 을 새로 만들지 않는다** — `phase-1` 위에서 `--req-filter` 로 좁힌다. **확정**. (근거: 제약 C-01, `constraints.json`)
2. **요구 변경은 speckiwi MCP 로만 한다** — `docs/spec/*.srs.md` 를 손으로 고치지 않는다. **확정**. (근거: 제약 C-06)
3. **커밋 메시지에 AI 시그니처·단계 표식을 넣지 않는다.** **확정**. (근거: 제약 C-09, 전역 `CLAUDE.md` §6)
4. **아카이브·복원은 phase-2 다** — phase-1 에서 아카이브 기능을 만들지 않는다. 그래서 `SEC-STORAGE-007` AC-3 은 이 run 에서 닫지 않는다. **확정**. (근거: 제약 C-04, 원장 R165)
5. **오케스트레이터 게이트는 묻지 않고 승인하며 권장안을 고른다.** **확정**. (근거: `<REPO>\CLAUDE.md` 「Gate decisions」 절)
6. **벡터 인덱스의 포트와 위생은 wave-2, 그 내용(A-RAG)은 wave-3.** **확정**. (근거: `waves.jsonl` 의 wave-2 진입 행 `decision` 객체, `FR-ARCH-001` AC-4)
7. **작업이 끝나 사용자 입력을 기다릴 때 doculight 로 짧게 보고한다.** **확정**. (근거: `<REPO>\CLAUDE.local.md`, 커밋되지 않는 기계별 지시)
8. **검증 서브에이전트를 같은 작업 트리에서 둘 이상 탐침시키지 않는다.** **유력(미확정)**. ⚠️ 저장소에 근거가 없다 — 이번 세션에서 한 검증자가 상호 오염을 보고했으나 `kiwi/waves.jsonl` 에 그 기록을 남기지 않았다. 그 파일의 「오염」 3건은 전부 이전 run(`2026-08-20.doculight2.phase1-implementation`)의 다른 사건이다. 착수 전에 한 번 확인하되, 규칙 자체는 `Agent` 의 `isolation: "worktree"` 로 값싸게 지킬 수 있다

---

## 6. 미결정·유예 항목

- **`FR-SHELL-013` 의 미체크 AC 열한 개** — 증거 `VE-1`·`VE-2` 가 덮는다고 그 문서가 적으면서도 체크 상자가 비어 있다. 이 wave 의 배정 범위가 AC-4 하나였으므로 건드리지 않았다. 결정 방법: 증거 본문을 읽어 각 AC 를 실제로 덮는지 판정한 뒤 `check_acceptance_criteria` 로 일괄 체크.
- **Change Notes 표의 정정** — `<REPO>\docs\spec\07.editor.srs.md` 의 `FR-EDITOR-007` Change Notes 2026-08-25 행이 「`ignoreEvent` 를 mousedown 과 **click** 에 한정해 열어」라고 적는데 현재 구현은 mousedown 하나만 연다. **MCP 에도 CLI 에도 그 표에 행을 더하는 경로가 없다**(`edit_requirement_table_rows` 는 `verification_evidence`·`trace_links` 만, `append_section_note` 는 그 섹션을 모른다, ⚠️ 미검증 — `npx speckiwi --help` 의 명령 목록에도 없다고 이 세션에서 관측했으나 저장소에 그 출력이 남아 있지 않다. 다음 세션이 직접 돌려 확인하라). 결정 방법: 사용자에게 최소 SRS-MD 손 패치를 승인받는다.
- **부하 흔들림의 원인** — editor·web vitest 가 부하가 걸린 기계에서 흔들린다. 이번 세션에도 web 3건이 전체 실행에서 실패하고 단독 실행에서 522 전건 통과했다. 원인 미규명. 결정 방법: 흔들리는 항의 공통 축을 찾는 별도 조사.

---

## 7. 남은 작업 전체 목록

### 검증 절차

- [ ] **wave-2 clean 라운드** — 마지막 커밋 이후 수정 0 인 상태에서 검증자를 돌려 통과 → `waves.jsonl` 에 `wave-verify`(verdict: pass) + `complete` append. 완료 조건: 그 두 행이 저널에 있고 회귀 실패 0
- [ ] wave-3 진입·실행·종료 검증
- [ ] wave-4 진입·실행·종료 검증
- [ ] **전체 wave 최종 검증** — 설계 기준선 전체 대비. 완료 조건: 원장 §4 수용 기준 13개 전건 통과

### 요구 12건 (`summarize_target('phase-1')` 의 `newWorkCandidates`, 2026-08-27 조회)

**wave-2 잔여 2건**

- [ ] `SEC-STORAGE-007` AC-3 — **이 run 에서 닫지 않는다**(제약 C-04). 완료 조건: phase-2 에서 아카이브 조작이 설 때 함께 세운다
- [ ] `FR-SHELL-013` 의 AC-4 를 뺀 열한 개 — 증거는 있고 체크만 비었다. 완료 조건: 각 AC 를 증거가 실제로 덮는지 판정하고 체크

**wave-3 — MCP 서버 패키지 7건**

- [ ] `SEC-ARCH-001` (MCP 호출 인증 필수)
- [ ] `SEC-ARCH-002` (읽기 도구·벡터검색 ACL 필터) — 의존성: wave-2 의 벡터 인덱스 포트
- [ ] `SEC-ARCH-003` (쓰기 도구 편집 권한 검사)
- [ ] `FR-ARCH-001` (1.0 AI·MCP 인계, 의미 검색 신규 작성) — 이 요구가 벡터 인덱스의 **내용**을 세운다
- [ ] `CON-SHELL-002` (AI 검색은 MCP 로만, 좌측 탭은 텍스트)
- [ ] `IR-AUTH-002`
- [ ] `SEC-ACL-006`

**wave-4 — 1.0 이행 3건**

- [ ] `MIG-AUTH-002` (전역 API Key 차단) — 의존성: PAT·MCP 가 먼저 서야 한다
- [ ] `MIG-AUTH-001` (읽기 전용 컷오버·콘텐츠 이행)
- [ ] `CON-ARCH-002` AC-8

### 이월 잔여 (wave 밖)

- [ ] `R-FND-101` — `packages/web` 이 editor 스타일을 하나도 import 하지 않아 `FR-EDITOR-007` 의 증거가 제품 화면에 닿지 않는다. Wave 6 배정
- [ ] `R-CHANGENOTE-GAP` — 위 「미결정」 절의 Change Notes 정정
- [ ] `R-LOAD-FLAKE` — 부하 흔들림 원인 규명
- [ ] `G-9` — 같은 coder 실행이 세 벌의 세션 디렉터리로 갈려 커밋됨. 기록으로만 남김
- [ ] `R-SELTOUCH-AXIS` — 경계 포함 성질을 자동으로 지키는 축이 수식·표·태그 셋뿐이고 코드블록·mermaid 는 브라우저 시험에만 있다
- [ ] `R-IMPLNOTE-1` — `07.editor.srs.md` 의 `FR-EDITOR-007` Implementation Notes 첫 불릿이 Status 를 `blocked` 라 적는다(실제는 `implemented`). 선재 문장

---

## 8. 다음 세션 지시서

1. **wave-2 clean 라운드를 돌린다.**
   - 검증자를 띄우되 **탐침은 한 명에게만** 허용한다(「함정」 절 참조). 다른 한 명은 읽기 전용.
   - 분모를 외부에서 고정해 넘긴다: REQ/AC **12**(`REL-STORAGE-002` 6 + `SEC-STORAGE-007` 5 + `FR-SHELL-013` AC-4 1), 설계 항목 **3**, 제약 **14**.
   - 창은 `git diff d8a54d2..HEAD`.
   - → 검증: 잔여 CRITICAL 0 · HIGH 0 이고 회귀 실패 0 이면 통과.
2. **`waves.jsonl` 에 두 행을 append 한다** — `wave-verify`(`verdict: pass`)와 `complete`.
   - → 검증: `tail -2 kiwi/waves.jsonl` 로 두 행 확인.
3. **wave-3 에 진입한다.** `<REPO>\docs\plans\2026-08-24.remaining-work-order.md` 의 「Wave 4 — MCP 서버 패키지」 절을 읽고 설계 기준선을 물질화해 `waves.jsonl` 에 진입 행을 쓴다.
   - → 검증: 그 행에 `design_items` 와 `req_ids` 7건이 있다.
4. **wave-3 를 TDD 로 구현한다.** 요구마다 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green 을 만든다. 새 시험마다 뮤테이션 탐침으로 실효를 확인한다(제약 C-14).
   - → 검증: 요구별 AC 체크 + 증거 등록 + `npx speckiwi validate` 오류 0.

---

## 9. 거버넌스·게이트·함정

### 규칙

- **TDD 강제**: 동작 변경은 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green 을 만든다 (제약 C-11).
- **요구 없이 코드를 고치지 않는다** (제약 C-12).
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다** (제약 C-14). **반드시 해당 패키지 전체 스위트로 재라** — 파일 하나만 돌리면 같은 기구를 쓰는 다른 항이 죽는 것을 놓친다.
- **조립 방벽**: 새 서비스는 `main.ts` 에서 도달해야 한다. 허용목록(`packages/server/test/arch/assembly.test.ts`)에 넣으려면 「검증 가능한 참조」를 담은 사유가 필요하다.
- 개발 서버 포트: web **3399** · server dev API **3400** (제약 C-13).

### 이번 세션에 실제로 밟은 함정

⚠️ 미검증 — 아래 표의 일곱 행 중 마지막(`Buffer` → `Uint8Array`)만 저장소 코드로 확인된다(`packages/server/src/app/document/search-service.ts:226-232`). 나머지 여섯은 세션 진행 중의 도구 사용 사건이라 저장소에 기록이 없고 반증도 불가하다. 그대로 믿기보다 **같은 상황이 오면 회피 방법을 시도해 보는 용도**로 읽어라.

| 함정 | 회피 방법 |
| --- | --- |
| **검증 서브에이전트 둘을 같은 트리에서 탐침시켜 서로의 측정을 오염시켰다.** 한 검증자가 「제가 만들지 않은 파일이 생겼고 제 측정 도중 다른 파일이 수정됐다」고 보고했다 | 탐침은 **한 명에게만** 허용하고 나머지는 읽기 전용. 또는 `Agent` 의 `isolation: "worktree"` 를 쓴다 |
| **커밋 전 탐침을 `git checkout` 으로 되돌려 미커밋 구현이 통째로 날아갔다** | 되돌리기 전에 `cp <파일> "$TEMP/<이름>.good"` 로 사본을 뜨고 그 사본으로 복구한다 |
| **Bash 힙독 안의 파이썬에서 `\n` 이탈이 풀려 문자열이 깨졌다** (세 번 발생) | `BS = chr(92); NL = BS + 'n'` 로 우회하거나 `sed` 로 그 줄만 고친다 |
| **`cd packages/server` 뒤 다음 Bash 호출의 cwd 가 유지돼 파일이 엉뚱한 곳에 생성됐다** (`packages/server/packages/server/...`) | 파일을 만드는 명령은 `cd /c/Work/git/DocuLight2.0 &&` 로 시작한다 |
| **`npm install --workspace <pkg> <dep>` 가 devDependencies 를 날려 vitest 가 사라졌다** | `npm install --include=dev` 로 복구한다. 새 의존성은 `npm install <dep> --workspace @doculight/server --include=dev` 로 넣는다 |
| **`/tmp` 가 다른 프로젝트와 공유돼 엉뚱한 내용이 읽혔다** | scratchpad(`$TEMP`) 를 쓴다 |
| **`readFile` 이 돌려준 `Buffer` 를 그대로 넘기니 pdfjs 가 거절했고, 그 예외가 포트 계약대로 빈 배열이 되어 조항이 조용히 꺼졌다** | 외부 라이브러리에 바이트를 넘길 때 `new Uint8Array(...)` 로 감싼다 |

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

- **증거 결함이 이 run 에서 열한 번 나왔다** — 「통과하지만 조항을 재지 않는 시험」. 매번 그것이 마지막이라 여겼고 열한 번 모두 틀렸다. 영향: 새 시험을 쓸 때마다 뮤테이션 탐침을 **전체 스위트로** 돌리지 않으면 같은 일이 반복된다. 대응: 제약 C-14 를 기계적으로 지킨다.
- **열한째 뒤에 실제 제품 결함이 있었다** — AC-6 시험이 감시자가 사건을 받기도 전에 단언해 통과했고, 사건을 기다리게 하자 `.workspace.json` 이 문서 노드로 등재되는 결함이 드러났다(커밋 `5ffb01d` 가 고침). 영향: 공허한 증거는 그 자체가 결함일 뿐 아니라 **다른 결함을 가린다**.
- **커밋 서술의 과장이 반복해서 나왔다** — 좁게 재고 넓게 주장하거나, 넓은 것을 좁게 서술한 것. ⚠️ 미검증 — **정확한 셈이 저장소 기록 안에서 갈린다**: `kiwi/waves.jsonl` 의 wave-1 `complete` 행은 `findings_total.commit_overclaims: 4` 를 wave-1 집계로 적고, wave-2 `pipeline` 행의 notes 는 wave-2 의 `.gitattributes` 사유를 「네 번째」라고 적는다. 둘을 합치면 run 누계가 4 인지 5 인지 정해지지 않는다. 위 「기억과 실제가 달랐던 항목」 표의 사례 넷이 커밋 해시와 함께 적혀 있으니 그것이 확인 가능한 하한이다. 영향: 커밋 메시지가 다음 회차의 근거로 쓰이면 그 과장이 전파된다. 대응: 「확인했다·모두·전부·유일한」이 든 문장은 그만큼 실제로 쟀는지 대조한다.
- **로컬에 36 커밋이 푸시되지 않았다.** 영향: 이 기계가 유일한 사본이다. 대응: 사용자 판단으로 푸시.
- **검증 서브에이전트 무응답이 잦다.** ⚠️ 미검증 — 이 세션에서 아홉 번으로 셌으나 저장소에 그 수를 담은 기록이 없다. `kiwi/waves.jsonl` 에 남은 누계는 wave-1 라운드 10 「네 번」·라운드 11 「다섯 번」·라운드 12 「여섯 번」이 전부이고 wave-2 행에는 언급이 없다. 영향: 검증을 기계적 채널로 대체해야 하는 경우가 잦다. 대응: 받지 못한 보고의 내용은 어느 것도 인용하지 않는다 — 이 세션은 그 규율을 지켰다.
