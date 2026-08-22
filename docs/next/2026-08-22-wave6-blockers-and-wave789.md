# wave-6 차단 해소와 wave 7·8·9 착수 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-22 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | Phase 1 의 wave 9개 중 남은 4개(6·7·8·9)를 완주해 원장 §4 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | wave 1~5 완료(전부 `pass-with-carried-residuals`). 이번 세션 커밋 10개(`3e4f477`~`a09cb3e`). 워킹트리 clean. `blocked` 요구는 `FR-SHELL-013` 하나 |
| SSOT | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` 와 그것이 가리키는 scope SRS 문서들 · 원장 `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` |
| 다음 세션 첫 행동 | 아래 「0. 다음 세션의 첫 행동」의 1번 — 막힌 것에 대한 주니어용 보고서를 작성해 도큐라이트로 띄운다 |

> 이 문서는 다음 세션이 **이 문서와 SSOT 만 읽고** 자율적으로 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

사용자 지시(2026-08-22): *"다음 세션부터 막힌 것에 대한 주니어 레벨도 이해할만한 수준의 보고서를 도큐라이트로 보여준 다음에 7,8,9 를 해결할 것"*

1. 이 문서를 끝까지 읽는다.
2. `git -C C:\Work\git\DocuLight2.0 status --porcelain` 로 워킹트리를 확인한다. 「3. 현재 워킹트리·저장소 상태」와 어긋나면 사용자에게 한 줄로 알린다.
3. SpecKiwi MCP `get_active_target` 으로 활성 target 이 `phase-1` 인지 확인한다.
4. **막힌 것에 대한 주니어용 보고서를 쓴다.** 대상은 아래 「6. 미결정·유예 항목」의 미결 공백 전량과 `FR-SHELL-013`. 요구 사항 셋 — ① 배경 지식 없이 읽히게 쓴다(REQ-ID 를 던지지 말고 그것이 무엇을 정하는 조항인지 한 줄로 풀어 쓴다) ② 갈래가 있으면 각 갈래의 대가를 함께 적는다 ③ 결정이 필요한 자리와 그냥 구현하면 되는 자리를 명시적으로 가른다. 파일은 `C:\Work\git\DocuLight2.0\docs\next\` 아래에 쓰고, MCP `mcp__doculight__open_markdown` 으로 띄운다.
5. 사용자가 보고서를 보고 판단한 뒤 **wave-7 → wave-8 → wave-9** 순으로 진행한다. wave-6 은 `FR-SHELL-013` 이 막혀 있어 뒤로 미룬다 — 그것이 사용자가 7·8·9 를 지목한 이유다.

## 1. 최종 작업 목표

Phase 1 은 **wave 9개**로 분해돼 있고 배정의 정본은 `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` 이다. wave 1~5 가 완료됐고 6·7·8·9 가 남았다.

**완료 조건**: 원장 `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` §4 Phase 1 수용 기준 13개 각각에 대해 (a) 자동 시험이 그것을 재고 있고 (b) 그 시험이 통과하며 (c) 해당 요구의 `#### Verification Evidence` 표에 그 시험이 적혀 있다. 수용 기준 1번(실제 볼트 읽기·편집)과 7번(한글 IME)은 수동 검증 기록으로 대체한다.

### wave 전체 (9개)

| wave | 이름 | 요구 | 수용기준 | 상태 |
| --- | --- | --- | --- | --- |
| 1 | 모노레포 골격과 영속 기반 | 24 | — | 완료 |
| 2 | 주체와 ACL 판정 코어 (헤드리스 도메인) | 31 | 4 | 완료 |
| 3 | 인증·세션·PAT·설치 마법사 | 25 | 9·13 | 완료 |
| 4 | 셸 골격과 노드 조작 — 트리·탭·설정 모달·휴지통 | 24 | 11 | 완료 |
| 5 | 본문 표면 — 에디터·자동 저장·버전·충돌·첨부 | 35 | 2·6·7·8·10·12 | 완료 |
| **6** | 찾기 계열 — 링크·백링크·태그·전역 검색·MCP | 18 | 3·5 | **미착수 · `FR-SHELL-013` 막힘** |
| **7** | 권한·주체 관리 화면과 이동·복사 | 26 | 4·9·10 | **미착수 · 막힌 것 없음** |
| **8** | 확인 등급 — 파괴적 조작 앞의 마찰 | 33 | — | **미착수 · 막힌 것 없음** |
| **9** | 감사 기록·재조정 대기열·1.0 컷오버 (Phase 1 종료 관문) | 34 | 1·13 | **미착수 · 막힌 것 없음** |

wave 1~5 는 전부 `verdict: "pass-with-carried-residuals"` 로 기록됐다 — 통과하되 잔여를 안고 넘겼다는 뜻이다. 저널은 `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` (15행).

## 2. 현재까지 완료한 작업 (이번 세션)

커밋 10개. `git -C C:\Work\git\DocuLight2.0 log --oneline 86c883a..a09cb3e` 로 확인 가능.

- [x] B 단계 — 미조사 영역 다섯(휴지통 · 위키링크 삽입 · 태그 · 설정 저장소 · 배포 산출물)의 판정 축을 실제로 재게 함 — 커밋 `3e4f477`
- [x] 감사 보존 만료 소멸 구현 + 부등식 불변식 — 커밋 `fdbab79`
- [x] 뮤테이션으로 찾은 중복 제거(보존 경계 계산 일원화) — 커밋 `4fcb195`
- [x] 적대 검증에서 나온 결함 반영 — 커밋 `3deaf0d` (⚠️ 미검증 — 「HIGH 1 · MEDIUM 3 · LOW 5」라는 심각도 분류는 커밋 본문에 없다. 본문은 HIGH 하나를 명시하고 나머지를 분류 없이 일곱 항목으로 나열한다)
- [x] ACL·인증·주체 요구에 검증 증거 — 커밋 `4db971a` (⚠️ 미검증 — 「16건」 계수의 근거가 저장소에 없다. 그 커밋은 `09.auth`·`10.access-control`·`16.principal` 세 파일에 `| VE-` 32행과 `| Status` 12행을 더한다)
- [x] 질의 문법 확정(`R149-f`) + 파서 구현 — 커밋 `857db90`
- [x] `R152` 를 받을 요구 둘 저작(`DR-SHELL-002`·`IR-SHELL-004`) — 커밋 `c769cfa`
- [x] 공백 종결 뒤 낡은 서술 다섯 자리 수정 — 커밋 `a300aef`
- [x] 첨부 원본 파일명 기록(`R149-g`·마이그레이션 `016`) — 커밋 `26ce4a7`
- [x] 위키링크·백링크 관문 유출 수정 — 커밋 `a09cb3e`

### 검증 (2026-08-22 실행)

| 명령 (cwd `C:\Work\git\DocuLight2.0`) | 결과 |
| --- | --- |
| `NODE_ENV=development npm run typecheck` | error 0 |
| `NODE_ENV=production npx vitest run --root packages/server` | 684 passed |
| `NODE_ENV=production npx vitest run --root packages/web` | 250 passed |
| SpecKiwi MCP `validate_spec` | errors 0 / warnings 2 (`SRS-W072`·`SRS-W023` — 둘 다 기존) |

`packages/editor` 는 커밋 `a09cb3e` 직전 실행에서 237 passed / 1 skipped 였다. 그 커밋이 건드린 파일 넷은 `docs/spec/13.workspace.srs.md` · `kiwi/.status.json` · `packages/server/src/app/document/link-service.ts` · `packages/server/test/app/document/link-servable.test.ts` 이며, `packages/` 아래는 `packages/server` 뿐이라 editor 결과는 그대로 유효하다 (`git show --stat --format="" a09cb3e` 로 확인).

### 요구 상태 변화

⚠️ 미검증 — **세션 시작 열은 출처가 없다.** 저장소 스냅샷으로 과거 시점 카운트를 되짚을 수단이 없으므로 그 값을 다른 판단의 근거로 쓰지 마라. 세션 끝 열은 SRS·원장 실측과 일치한다.

| 지표 | 세션 시작 (⚠️ 미검증) | 세션 끝 |
| --- | --- | --- |
| `verified` | 0 | **18** |
| `blocked` | 9 | **1** (`FR-SHELL-013`) |
| 원장 미결 공백 | 14 | **13** |
| 서버 시험 | 639 | **684** |

## 3. 현재 워킹트리·저장소 상태

- 브랜치 `master`. `git status --porcelain` 결과 **비어 있음(clean)** — 2026-08-22 확인.
- 이 핸드오프 문서와 `C:\Work\git\DocuLight2.0\docs\next\LATEST.md` 는 이 문서를 쓰는 시점에 생기므로, 다음 세션의 `git status` 에는 그 둘이 미커밋으로 보인다.
- 코드는 전부 커밋되어 있다. 이 핸드오프 문서는 커밋해도 되고 안 해도 된다.

## 4. 관련 문서·코드 (절대경로)

`<REPO>` = `C:\Work\git\DocuLight2.0`

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| SSOT 진입점 | `<REPO>\docs\spec\00.index.md` | scope SRS 목록 |
| 원장 | `<REPO>\docs\spec\00.decision-log.md` | 조항 `R*` 과 미결 공백 `G*` 의 정본. 수용 기준 13개도 여기 §4 |
| **wave 배정** | `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\wave-assignment.json` | wave 9개의 요구 ID·목표·수용기준·`blocked_notes` |
| wave 설계 기준선 | `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\design-baseline\wave-7.md` (8·9 도 같은 디렉터리) | 각 wave 가 만들 것의 설계 |
| wave 저널 | `<REPO>\kiwi\waves.jsonl` | wave 1~5 의 완료 기록과 이월 잔여 |
| 셸 SRS | `<REPO>\docs\spec\08.app-shell.srs.md` | `FR-SHELL-*`·`SEC-SHELL-*`·`DR-SHELL-*`·`IR-SHELL-*` |
| ACL SRS | `<REPO>\docs\spec\10.access-control.srs.md` | `SEC-ACL-*`·`CON-ACL-*` (wave-7 주력) |
| 확인 등급 SRS | `<REPO>\docs\spec\11.confirmation-grades.srs.md` | `FR-CONFIRM-*` (wave-8 주력) |
| 저장소 SRS | `<REPO>\docs\spec\14.storage.srs.md` | `FR-STORAGE-*`·`DR-STORAGE-*`·`SEC-STORAGE-*` |
| 인증 SRS | `<REPO>\docs\spec\09.auth.srs.md` | `SEC-AUTH-*`·`FR-AUTH-*` |
| 에디터 SRS | `<REPO>\docs\spec\07.editor.srs.md` | `FR-EDITOR-*`·`CON-EDITOR-*` |
| 감사 SRS | `<REPO>\docs\spec\12.audit-log.srs.md` | `OBS-AUDIT-*`·`REL-AUDIT-*` (wave-9 주력) |
| 워크스페이스 SRS | `<REPO>\docs\spec\13.workspace.srs.md` | `SEC-WORKSPACE-004`(표시 필터 정본) |
| 첨부 SRS | `<REPO>\docs\spec\15.attachments.srs.md` | `DR-ATTACH-*` |
| 주체 SRS | `<REPO>\docs\spec\16.principal.srs.md` | `CON-PRINCIPAL-*`·`DR-PRINCIPAL-*` |

**참고 선례**

- `<REPO>\packages\server\test\domain\search\query.test.ts` — AC 를 그대로 옮긴 시험. 조항이 수용 조건을 문장으로 갖고 있으면 번역이 필요 없다
- `<REPO>\packages\server\test\app\document\link-servable.test.ts` — 관문 유출을 재는 시험. 슈퍼유저로 돌려 「권한으로 뚫리지 않는 축」을 잰다
- `<REPO>\packages\server\test\app\audit\retention-invariant.test.ts` — 두 설정 사이의 불변식을 양방향으로 재는 시험
- `<REPO>\packages\server\src\app\document\link-service.ts` 의 `visibleMarkdown` — 질의 예산을 지키며 권한 판정하는 골격. wave-6 검색이 이것을 따른다

## 5. 확정된 결정 (변경 금지)

1. **wave 착수 순서는 7 → 8 → 9** — **유력(미확정)**. ⚠️ 미검증 — 사용자 지시(2026-08-22)이며 **저장소에 독립 근거가 없다.** `wave-assignment.json` 의 `order` 는 6→7→8→9 이고 순서 변경 기록이 없다. wave-6 은 `FR-SHELL-013` 이 막혀 뒤로 미룬다는 사실만 저장소로 확인된다. 착수 전에 사용자에게 한 번 확인하라
2. **다음 세션은 7·8·9 착수 전에 막힌 것 보고서를 도큐라이트로 먼저 보인다** — **유력(미확정)**. ⚠️ 미검증 — 사용자 지시(2026-08-22)이며 저장소에 근거 문서가 없다
3. **검색 질의는 AND 가 파이프보다 강하게 묶는다. 괄호는 지원하지 않는다. 최소 길이는 파이프로 나뉜 묶음마다 독립 판정** — **확정**. (근거: 원장 `R149-f`, `<REPO>\packages\server\src\domain\search\query.ts`)
4. **검색 대상 넷째 축은 `.res` 첨부의 원본 파일명이며 트리에 서는 비-md 노드의 이름이 아니다. `SEC-WORKSPACE-004` 표면 열거는 늘리지 않는다** — **확정**. (근거: 원장 `R149-g`)
5. **감사 보존은 기본 365일 · `0` 은 무제한 · 감사 보존은 휴지통 보존보다 짧게 저장할 수 없다(저장 시점 양방향 거절)** — **확정**. (근거: 원장 `R154`, `<REPO>\packages\server\src\domain\retention\retention.ts`)
6. **보존 기간이 지난 감사 행은 자동 소멸하며 그 소멸은 감사 기록 대상이 아니다** — **확정**. (근거: 원장 `R154-a`, `REL-AUDIT-003`)
7. **`에디터`·`외모` 카테고리의 항목은 셋이 전량이고 모두 개인 설정** — **확정**. (근거: 원장 `R152`, `IR-SHELL-004`)
8. **개인 설정 저장소는 (사용자, 항목) 쌍을 키로 하는 DB 행. 인스턴스 설정과 같은 표를 쓰지 않고 브라우저 로컬을 정본으로 쓰지 않는다** — **확정**. (근거: `DR-SHELL-002`)
9. **사용자 이름이 곧 로그인 식별자이므로 본인은 자기 이름을 바꿀 수 없다. `계정` 카테고리는 비밀번호 변경·로그아웃 둘이 전량** — **확정**. (근거: 원장 `R153`)
10. **모든 검증은 서브에이전트로 한다. 자기 산출물을 자기가 검증하지 않는다** — **확정**. (근거: `C:\Users\beom\.claude\CLAUDE.md` §5)
11. **커밋 메시지에 AI 시그니처를 넣지 않는다. 제목에 `Phase {n}`·`Step {n}` 표식을 넣지 않는다** — **확정**. (근거: `C:\Users\beom\.claude\CLAUDE.md` §6)
12. **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다** — **유력(미확정)**. ⚠️ 미검증 — 이 관행을 규정한 조항·규칙 문서가 저장소에 없다. 커밋 `3e4f477`·`3deaf0d`·`26ce4a7`·`a09cb3e` 본문이 뮤테이션 확인을 언급하나 그것이 근거의 전부다

## 6. 미결정·유예 항목

**다음 세션 첫 행동의 보고서 대상이 바로 이 목록이다.**

### 원장 미결 공백 — Phase 1 을 막는 것

- **`G36` ①** 검색 필터 팝오버의 기본값 — 네 대상(제목·본문·태그·첨부 이름) 중 처음에 무엇이 켜져 있는가. ⚠️ 미검증 — 심의 3인이 **전부 켜짐**을 지지했다고 이 세션 대화에 기록돼 있으나 **저장소 어디에도 그 기록이 없다.** 결정 방법: 다시 심의하거나 사용자 확인
- **`G36` ⑤** 텍스트 색인 갱신 시점 — ⚠️ 미검증 — 심의 3인이 **동기 갱신 + 존재하지 않는 노드는 결과에서 무조건 제외(fail-closed)** 를 지지했다고 이 세션 대화에 기록돼 있으나 저장소 어디에도 그 기록이 없다
- **`G36` ⑥** 트리에 서는 비-md 노드의 이름이 검색 대상 넷 중 어디에도 없다 — `R149-g` 로 넷째 축을 `.res` 전용으로 확정하면서 드러났다. 갈래 둘: ⓐ 첫째 축(「문서 제목」)을 「노드 이름」으로 읽어 흡수 ⓑ 다섯째 축 신설(체크박스가 다섯이 되고 「네 대상」 계수가 여러 곳에서 따라 움직인다)
- **`G38`** 한국어 질의의 일치 단위가 `R149-c` 의 최소 2자와 충돌 — 실측으로 열렸다. `trigram` 은 3자 미만 질의를 0건으로 돌려주고, `unicode61` 은 `회의` 가 `회의록`에 안 걸린다(접두 매칭을 붙이면 어절 선두만 걸린다). 갈래 셋: ⓐ `unicode61` + 접두 자동 부착 ⓑ `trigram` + 2자는 `LIKE` 스캔 ⓒ `R149-c` 의 2자를 3자로 개정. ⚠️ 미검증 — 판정자 `adj-tokenizer` 의 최종 판정을 받지 못했다고 이 세션 대화에 기록돼 있다. 서브에이전트 응답 여부는 저장소로 확인할 수단이 없다. 원장 `G38` 은 갈래 ⓐⓑⓒ 까지만 기록한다
- **`G37`** 보존 만료로 사라지는 감사 행을 참조하던 재조정 대기열 항목의 처분 — `R154` 로 만료가 실제 동작하게 되면서 열렸다. **wave-9 범위**
- **`G14`·`G14-a`** 화면 최신성 — 다른 사용자의 변경이 언제 화면에 반영되는지 규정이 없다. 자리는 넷(트리·검색 결과·즐겨찾기·우측 사이드바)이고 축은 다섯

### 그 밖

- **`CON-ACL-001` AC-4 와 청크 판정의 충돌** — AC-4 는 「한 요청의 권한 판정이 쿼리 2회」인데 검색이 청크 판정을 쓰면 질의가 청크 수만큼 늘어난다. ⚠️ 미검증 — 청크를 안 쓰면 **총 노드 32,766건에서 `too many SQL variables` 로 죽는다**는 실측(판정자 `adj-acl-sql`, md 29,000 성공 / 30,000 실패)이 이 세션 대화에만 있고 **저장소에 산출물이 없다.** 다음 세션이 쓰려면 다시 재야 한다. 둘 다 만족하는 구현이 없다는 판단도 그 수치 위에 선다. 결정 방법: `CON-ACL-001` 에 검색 표면용 AC 신설 또는 AC-4 의 예산 단위를 「판정 호출 1회당」으로 개정
- **`FR-SHELL-011`** `Stability=draft` — wave-6 배정. draft 인 채로는 구현 착수 금지(`CLAUDE.md` 규칙)

## 7. 남은 작업 전체 목록

### A. 다음 세션 첫 행동 — 보고서

- [ ] **A-1** 막힌 것 주니어용 보고서 작성 — 완료 조건: 위 「6. 미결정·유예 항목」 전량과 `FR-SHELL-013` 을 배경 지식 없이 읽히게 풀어 쓴 문서가 `<REPO>\docs\next\` 아래에 있고, `mcp__doculight__open_markdown` 으로 띄웠다

### B. wave-7 — 권한·주체 관리 화면과 이동·복사 (요구 26건 · 수용기준 4·9·10)

- [ ] **B-1** `wave-assignment.json` 에서 wave-7 의 `requirement_ids` 26건을 읽고 각각의 현재 `Status` 를 MCP `get_requirement` 로 확인 — 완료 조건: 26건의 상태 표가 만들어졌다
- [ ] **B-2** `<REPO>\docs\analysis\kiwi-wave-master-2026-08-20.doculight2.phase1-implementation\design-baseline\wave-7.md` 정독 — 완료 조건: 설계 기준선의 각 항목이 26건 중 어느 요구에 대응하는지 매핑됐다
- [ ] **B-3** TDD 로 구현 — 완료 조건: 26건 전건이 `implemented` 이상이고 각각 `#### Verification Evidence` 에 시험이 적혀 있다
- [ ] **B-4** wave-5 에서 이월된 `W5-04` 해소 — 완료 조건: `FR-STORAGE-008` 의 **실물 이동** 축을 실제 이동으로 잰다(wave-5 는 이동 전 자리의 바이트 비교로 대신 쟀고 그 사실을 저널에 남겼다)
- [ ] **B-5** 수용 기준 4·9·10 이 자동 시험으로 재어지는지 확인 — 완료 조건: 셋 각각에 대해 재는 시험 파일이 특정됐다

### C. wave-8 — 확인 등급 (요구 33건)

- [ ] **C-1** wave-8 의 `requirement_ids` 33건 상태 확인 — 완료 조건: B-1 과 동일 형태의 표
- [ ] **C-2** 설계 기준선 `design-baseline\wave-8.md` 정독
- [ ] **C-3** TDD 로 구현 — 완료 조건: 33건 전건이 `implemented` 이상이고 증거가 적혀 있다

### D. wave-9 — 감사 기록·재조정 대기열·1.0 컷오버 (요구 34건 · 수용기준 1·13 · **Phase 1 종료 관문**)

- [ ] **D-1** wave-9 의 `requirement_ids` 34건 상태 확인
- [ ] **D-2** 설계 기준선 `design-baseline\wave-9.md` 정독
- [ ] **D-3** `G37` 판정 — 완료 조건: 대기열이 참조하는 감사 행의 만료 처분이 원장에 기록됐다 (갈래 둘: ⓐ 참조가 걸린 행은 만료에서 제외 ⓑ 대기열이 필요한 값을 복사해 둔다)
- [ ] **D-4** TDD 로 구현 — 완료 조건: 34건 전건이 `implemented` 이상이고 증거가 적혀 있다
- [ ] **D-5** 수용 기준 1번(실제 볼트 읽기·편집) 수동 검증 — 완료 조건: 검증 기록이 남았다
- [ ] **D-6** 수용 기준 13번 자동 검증 — 완료 조건: 재는 시험이 특정됐다

### E. wave-6 — 찾기 계열 (요구 18건 · 수용기준 3·5)

- [ ] **E-1** `G36` ①⑤⑥ 과 `G38` 판정 — 완료 조건: 넷 다 원장에 기록됐다
- [ ] **E-2** `FR-SHELL-011` 의 `Stability` 를 draft 에서 올린다 — 완료 조건: draft 가 아니다
- [ ] **E-3** `FR-SHELL-013` 구현 — 완료 조건: `blocked` 를 벗어나고 AC 전건이 재어진다. ⚠️ 미검증 — 추정 규모는 서버 신규 8파일 약 900~1100줄 + 시험 약 600줄 + 마이그레이션 1개다(판정자 3인의 추정치가 그 범위에 모였다고 이 세션 대화에 기록돼 있다). **저장소에 그 추정을 담은 문서가 없다** — 착수 전에 다시 산정하라
- [ ] **E-4** MCP 서버 패키지 신설 — 완료 조건: `wave-assignment.json` 의 wave-6 `existing_modules` 에 「MCP 서버 패키지 (이 wave 신설)」이 적혀 있다. 그것이 서고 PAT 로 인증하며 호출자 ACL 로 결과가 갈린다

### F. 이 세션에서 답을 얻었다고 기록된 것 (⚠️ 전부 미검증 — 저장소에 근거가 없다)

- [ ] **F-1** `SEC-AUTH-002`~`SEC-AUTH-016` 15건 증거 — 완료 조건: 15건 각각의 AC 가 어느 시험에 재어지는지 대조하고, 전 AC 가 덮인 것은 `verified`, 부분만 덮인 것은 덮인 만큼만 기록. **⚠️ 미검증 — 이 세션 대화에는 전 AC 덮임 10건(`003`·`006`·`007`·`008`·`009`·`011`·`012`·`013`·`015`·`016`) / 부분 5건(`002`·`004`·`005`·`010`·`014`)이라는 분류가 있으나 저장소에 그 근거가 없다. 그 분류를 믿지 말고 다시 조사하라.** 저장소로 확인된 사실은 둘뿐이다 — 15건이 실존하고, 15건 모두 `#### Verification Evidence` 행이 0개다
- [ ] **F-2** `R21-a` 정정 — 완료 조건: 원장 조항의 「`WHERE` 절 하나로 성립」 주장이 정정됐고 인용 스윕 2곳(`<REPO>\docs\spec\02.product-architecture.srs.md` 의 `SEC-ARCH-002` Implementation Notes 와 Trace Links)이 함께 고쳐졌다. ⚠️ 미검증 — 그 주장이 틀렸다는 판정은 이 세션 대화에만 있고 저장소에 근거가 없다. 정정 전에 다시 확인하라
- [ ] **F-3** `G36` ③ 결과 상한 판정과 기록 — 완료 조건: 원장 `G36` ③ 이 종결되고 그 결론이 조항으로 기록됐다. ⚠️ 미검증 — 이 세션 대화에는 「랭크 순 청크 판정 후 통과분에만 상한 · 응답 DTO 에 적중 건수 칸을 두지 않는다」가 결론으로 기록돼 있으나 **저장소에 그 근거가 없고 원장 `G36` ③ 은 여전히 열려 있다.** 채택하려면 다시 판정하라
- [ ] **F-4** 시험 제목과 실제 단언이 어긋난 3곳 수정 — `<REPO>\packages\server\test\app\auth\login.test.ts:117` · `<REPO>\packages\server\test\app\auth\install.test.ts:281` · `<REPO>\packages\server\test\app\auth\install.test.ts:102`. 완료 조건: 제목의 AC 번호가 실제로 재는 AC 와 같다

### G. 계약은 섰으나 구현이 0줄

- [ ] **G-1** `DR-SHELL-002`·`IR-SHELL-004` 구현 — 완료 조건: 개인 설정 저장소(사용자별 DB 행)가 서고 두 요구의 AC 가 재어진다

### H. 자동 검증이 닿지 않는 자리

- [ ] **H-1** `FR-EDITOR-007` AC-7(표의 「커서 올리면 원문」) 브라우저 확인 — 현재 `<REPO>\packages\editor\test\live-preview.test.tsx` 에 사유를 적어 `it.skip` 으로 남아 있다
- [ ] **H-2** 원장 §4 수용 기준 7번(한글 IME) 수동 검증

### I. wave 1~5 의 이월 잔여

- [ ] **I-1** `W5-01` — wave-4·5 가 독립 검증을 받지 못했다. 완료 조건: 그 두 wave 의 산출물을 외부 검증자가 판정했다
- [ ] **I-2** `W5-03` — Playwright E2E 와 한글 IME 수동 체크리스트 미수행

### J. 소소한 잔존

- [ ] **J-1** `<REPO>\packages\web\src\principal\PrincipalSearch.tsx` 디바운스 없음
- [ ] **J-2** 노드 영구 삭제 후 `favorite` 표에 죽은 행이 남음
- [ ] **J-3** `<REPO>\packages\server\src\http\routes\workspace-api.ts` 의 `one()` 이 깊게 중첩된 JSON 배열에 500

## 8. 다음 세션 지시서

1. **A-1 보고서** — 「6. 미결정·유예 항목」을 주니어가 읽을 수 있게 풀어 쓴다. REQ-ID·조항 번호를 그대로 던지지 말고 그것이 무엇을 정하는지 한 줄로 옮긴다. 갈래마다 대가를 적는다.
   → 검증: 문서가 `<REPO>\docs\next\` 아래에 있고 `mcp__doculight__open_markdown` 호출이 성공했다.
2. **B-1·B-2** — wave-7 의 요구 26건 상태를 확인하고 설계 기준선을 읽는다.
   → 검증: 26건의 `Status` 표와 설계 기준선 ↔ 요구 매핑이 만들어졌다.
3. **B-3** — TDD 로 구현한다. 실패 시험 먼저, red 확인 후 최소 구현.
   → 검증: `NODE_ENV=production npx vitest run --root packages/server` 통과, 그리고 새 시험마다 대상 소스를 망가뜨려 죽는지 확인.
4. wave-7 이 끝나면 커밋하고 **검증 서브에이전트를 동기로 띄워** 그 커밋 범위를 적대적으로 검증한다.
5. wave-8 → wave-9 를 같은 절차로.

**F 계열(증거 기록)은 언제 해도 된다.** wave 진행 중 막히면 그쪽으로 돌리면 된다 — 다만 F-1 의 조사 결과는 이 세션 대화에만 있으므로 **다시 조사해야 한다.**

## 9. 거버넌스·게이트·함정

### 지켜야 할 규칙

- **SpecKiwi 황금률**: MCP mutation(`add_verification_evidence`·`update_status` 등)을 부른 뒤 **같은 SRS 파일에 `Edit` 도구를 쓰지 않는다.** mutation 이 이미 그 파일을 고쳤다.
- **검증은 서브에이전트로.** 자기 산출물을 자기가 검증하지 않는다. 검증자에게 내 결론을 넘기지 않는다.
- **커밋 메시지에 AI 시그니처 금지.** 커밋 후 `git log -1 --format="%B" | grep -ciE "co-authored|generated|claude|bot|noreply"` 가 0 이어야 한다.
- **TDD 강제.** 동작 변경은 실패 시험 먼저, red 확인 후 최소 구현.
- **`Stability=draft` 요구는 구현 착수 금지** — `FR-SHELL-011` 이 여기 해당한다.
- **`C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 읽기 전용.**
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
- **SpecKiwi MCP 인자에 한글 유니코드 이스케이프를 쓰지 마라.** 이번 세션에 두 번 오타가 났다 — 「낱말」이 「낙말」로, 「바꾼」이 「바꿋」으로. 한글을 그대로 넣으면 된다.
- **Python heredoc 으로 소스를 고치면 `\n`·`\b`·`\s` 가 실제 제어문자로 들어간다.** 정규식·문자열 리터럴을 넣을 때는 `Edit` 도구를 쓰거나 스크립트를 스크래치패드에 파일로 쓴다.
- **서브에이전트에게 임시 파일 위치를 못박는다** — `C:\Users\beom\AppData\Local\Temp\` 아래에만. 저장소 안에 프로브 파일을 만들면 소스 스캔 시험이 그것을 위반으로 잡는다.
- **`createNode` 는 점으로 시작하는 이름을 거부한다.** `.obsidian` 같은 자리를 시험에서 만들려면 `stores.nodes.create` 로 저장소에 직접 넣어야 한다.
- **서브에이전트가 유휴 알림만 보내고 판정을 주지 않는 일이 잦다.** 이번 세션에 여러 번 있었다. 마감을 재요청하되, 응답이 없으면 **결과를 추정해 적지 말고 그 사실을 보고한다.**
- **`git commit` 전에 세 패키지 시험을 각각 돌린다.** wave-5 저널에 exit code 를 찍기만 하고 커밋을 거기 걸지 않아 실패를 안은 커밋이 두 번 나갔다는 기록이 있다.

## 10. 리스크·잔존 이슈

- **wave 1~5 의 「완료」는 잔여를 안은 완료다** — 영향: 다음 wave 가 그 위에 쌓이므로 잔여가 복리로 커질 수 있다 / 대응: `<REPO>\kiwi\waves.jsonl` 의 `carried_residuals` 를 wave-7 착수 전에 읽는다.
- **wave-5 저널의 정정 기록** — 앞선 저널의 「AC 133/133」은 *이름이 시험에 등장하는지*를 센 값이고 충족 여부가 아니었다. 독립 검증자가 요구 원문과 코드를 대조해 낸 1라운드 실제 상태는 **238개 중 covered 159 / partial 67 / missing 12** 였다. 영향: 「전건 통과」류 수치를 그대로 믿으면 안 된다 / 대응: 수치를 인용하기 전에 그것이 무엇을 센 값인지 확인한다.
- **`search-results-multiple.png` 이 저장소에 없다**(`find` 0건, 판정자 `adj-attachment` 확인) — 영향: 원장 `R149-d` 가 검색 결과 표시 형식의 정본으로 그 화면을 인용하는데 확인할 수 없다. wave-6 의 결과 렌더링 설계가 그 위에 선다 / 대응: wave-6 착수 시 그 조항의 근거를 다시 세우거나 사용자에게 원본을 요청한다.
- **`CON-ACL-001` AC-4 충돌이 wave-6 을 막을 수 있다** — 영향: 총 노드 32,766건에서 예외로 **죽는다**(성능이 아니라 정확성 문제) / 대응: wave-6 착수 전에 AC 개정 여부를 정한다.
- **E2E 스크립트 2개가 저장소 안에 없다** — `<REPO>\scripts\` 디렉터리 자체가 존재하지 않는다(2026-08-22 `ls` 확인). 이전 핸드오프(`<REPO>\docs\next\2026-08-22-phase1-verification-followup.md`)가 그 둘을 세션 임시 디렉터리에서 저장소로 옮기라고 지목했으나 이번 세션에서 옮기지 않았다. 영향: `boot-e2e` 13검사·`wave5-e2e` 17검사가 저장소에 없어 다음 세션이 돌릴 수 없다 / 대응: 필요하면 다시 만든다.
