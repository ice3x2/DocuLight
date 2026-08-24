# phase-1 잔여 작업을 wave-master 로 완주 — 세션 핸드오프

| Field | Value |
| --- | --- |
| 작성일 | 2026-08-24 |
| 저장소 / 브랜치 | `C:\Work\git\DocuLight2.0` / `master` |
| 최종 작업 목표 | `phase-1` 의 남은 요구 15건을 구현·검증해 원장 §4 Phase 1 수용 기준 13개를 전건 통과시킨다 |
| 현재 상태 | `phase-1` 요구 253건 중 implemented 220 · verified 18 · in_progress 3 · planned 12 · blocked 0. 워킹트리는 이 문서와 `LATEST.md` 만 미커밋, origin 대비 ahead 160 |
| Active Target | `phase-1` (2026-08-24 MCP `get_active_target` 실측) |
| work-mode | `sdd` (2026-08-24 MCP `get_work_mode` 실측) |
| SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` (실행 순서) + `C:\Work\git\DocuLight2.0\docs\spec\` (요구 정본) |
| 다음 세션 첫 행동 | 「wave-master 를 그냥 부르면 안 되는 이유」를 읽고, 아래 호출 문자열을 그대로 쓴다 |

> 이 문서는 다음 세션이 **이 문서와 위 SSOT 만 읽고** 자율적으로 작업을 이어갈 수 있도록 정리한 것이다. 대화 히스토리에 의존하지 말 것.

---

## 0. 다음 세션의 첫 행동

1. 이 문서를 끝까지 읽는다.
2. `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` 를 정독한다 — 실행 순서의 SSOT 다.
3. 저장소 상태를 확인한다 — Bash 도구로 `cd /c/Work/git/DocuLight2.0 && git status --porcelain && git log --oneline -3`. 「현재 워킹트리·저장소 상태」의 허용 범위와 대조한다.
4. MCP `get_active_target` 과 `get_work_mode` 를 호출해 위 표의 값(`phase-1` / `sdd`)과 대조한다. Active Target 이 `phase-1` 이 아니면 `set_active_target phase-1` 로 고정한 뒤 진행한다.
5. **「wave-master 를 그냥 부르면 안 되는 이유」와 「wave-master 호출 규약」을 반드시 먼저 읽는다.** 인자 없이 부르면 낡은 run 의 wave-5 를 재개해 이미 끝난 작업을 다시 돈다.
6. 「wave-master 밖에서 먼저 할 일」의 두 건(브라우저 수동 검증)을 **wave-master 호출 전에** 처리한다.
7. 「wave-master 호출 규약」의 호출 문자열을 그대로 쓴다.

---

## 1. 최종 작업 목표

`phase-1` target 의 목표는 저장소에 이렇게 적혀 있다(`docs/spec/00.index.md` §3 Target Map):

> 원장(`00.decision-log.md`) §4 Phase 1 수용 기준 13개를 전건 통과시킨다. 1번(실제 볼트 읽기·편집)과 7번(한글 IME)만 수동 검증이고 나머지 11개는 자동 검증한다.

**완료 조건** — 다음 셋이 동시에 참이면 이 작업이 끝난 것이다.

1. MCP `summarize_target('phase-1')` 의 `countsByStatus` 에서 `planned` 와 `in_progress` 가 **둘 다 0**.
2. 원장 §4 수용 기준 13개 중 11개가 자동 시험으로 통과하고(각 기준에 대응하는 시험 파일 경로를 적을 수 있다), 2개(실제 볼트 읽기·편집 / 한글 IME)는 수동 검증 증거가 Verification Evidence 에 등록돼 있다.
3. MCP `validate_spec` 오류 0.

`verified` 승급은 완료 조건이 **아니다** — 「남은 작업 전체 목록」의 별도 축을 볼 것.

---

## 2. 현재까지 완료한 작업

- [x] 요구 저작 — `C:\Work\git\DocuLight2.0\docs\spec\` 의 scope 문서 11개. **`phase-1` target 요구가 253건이고, 저장소 전체 요구 블록은 264건이다**(차이는 `phase-2` 요구). 이 문서의 모든 개수는 별도 표기가 없으면 `phase-1` 한정이다.
- [x] 이전 wave-master run 의 wave-1~5 — 그 결과가 현재 `implemented` 220건이다
- [x] 설치 경로를 제품 조립에 세움 — 커밋 `d901d9a` `feat(server): 설치 경로를 운영 조립에 물리고 요청 제한의 출발지를 서버가 정한다`
- [x] 조립 방벽 신설 — `C:\Work\git\DocuLight2.0\packages\server\test\arch\assembly.test.ts`
- [x] 요청 제한 출발지 판정 재작성 — `C:\Work\git\DocuLight2.0\packages\server\src\http\rate-key.ts` (신규 파일)
- [x] 실행 순서 문서 갱신 — 커밋 `4792816`, `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md`
- [x] 전 패키지 시험 — Bash 도구로 `cd /c/Work/git/DocuLight2.0 && NODE_ENV=production npm test` (2026-08-24 실행). editor 237 통과 · 1 건너뜀 / server 1248 통과 / web 521 통과 / **실패 0**
- [x] 타입 검사 — `cd /c/Work/git/DocuLight2.0 && npm run typecheck` (2026-08-24 실행). 세 패키지 모두 오류 0
- [x] 명세 검증 — speckiwi MCP `validate_spec` (2026-08-24 실행). 오류 0 · 경고 1건(`SRS-W072`)

### 2.1 기억과 실제가 달랐던 항목

이 문서의 초안에 있었으나 독립 검증이 잡아낸 것들이다. 나머지를 얼마나 믿을지 판단하는 데 쓰라.

| 초안에 적었던 진술 | 실제 (확인 방법) |
| --- | --- |
| "조립 방벽 허용목록 **6개**" | **7개**다. `packages/server/test/arch/assembly.test.ts` 의 `아직_배선되지_않음` Map 항목을 세면 7이다 — 아래 표는 마지막 행이 가드 둘을 담아 6행으로 보인다 |
| "`FR-EDITOR-007` 의 나머지 열한 AC 는 **VE-1 이** 이미 덮었다" | VE-1 은 9건(AC-1~6·9·10·11), VE-2 가 AC-12, VE-3 가 AC-8 을 덮는다. MCP `get_requirement('FR-EDITOR-007')` 실측 |
| "`token-service.ts` 가 MCP wave 의 선행이라는 **저장소 근거가 없다**" | 있다. `docs/plans/2026-08-24.remaining-work-order.md` 의 「Wave 1 이 남긴 것」 표 `token-service.ts` 행이 "**Wave 4 의 선행이다** (MCP 인증이 PAT 하나뿐이므로)" 로 적고 있다 |
| "요구 저작 **253건** — `docs/spec/`" | 253 은 `phase-1` target 한정 수치다. `docs/spec/` 전체 요구 블록은 264건 |

---

## 3. 현재 워킹트리·저장소 상태

- 브랜치: `master`. origin(`B:/work/git/DocuLight2.0.git`) 대비 **ahead 160 / behind 0**
- HEAD: `4792816 docs(plans): Wave 1 종결을 반영하고 남은 순서를 실측으로 갱신한다`
- 미커밋 파일: 이 핸드오프 문서와 `docs/next/LATEST.md` 둘.
- **허용 범위**: 이 둘이 커밋되어 워킹트리가 완전히 clean 인 것도 정상이다. HEAD 가 `4792816` 이거나, 그 위에 이 문서를 담은 커밋이 1개 더 있으면 일치로 본다. 그 밖의 차이만 사용자에게 보고한다.
- 푸시: **하지 않았다.** 푸시 지시를 받은 적이 없다. 160건을 올릴지는 사용자 결정 사항이다.

---

## 4. 관련 문서·코드 (절대경로)

| 문서 | 절대경로 | 역할 |
| --- | --- | --- |
| 실행 순서 SSOT | `C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md` | Wave 3~6 의 순서와 근거. **wave-master 의 분해 입력** |
| 요구 정본 | `C:\Work\git\DocuLight2.0\docs\spec\` | scope 별 SRS 11개. MCP 로만 변경 |
| 요구 색인 | `C:\Work\git\DocuLight2.0\docs\spec\00.index.md` | Target Map · Scope Map · 완료 작업 로그 |
| 결정 원장 | `C:\Work\git\DocuLight2.0\docs\spec\00.decision-log.md` | 조항 R1~R167. §4 에 Phase 1 수용 기준 13개 |
| 직전 회차 보고 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-review-fix-loop-2026-08-24.doculight2.self-wave1\report.md` | 설치 경로 회차가 무엇을 고쳤나 |
| 거절 기록 | `C:\Work\git\DocuLight2.0\docs\analysis\kiwi-review-fix-loop-2026-08-24.doculight2.self-wave1\rejected_findings.log` | 고치지 않기로 한 것과 사유 |
| wave 저널 | `C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` | 이전 run 의 wave 상태. **함정 절을 먼저 읽을 것** |
| 파이프라인 저널 | `C:\Work\git\DocuLight2.0\kiwi\pipeline.jsonl` | 마지막 2줄이 2026-08-24 Wave 1 의 planner·pm 완료 |

**조립 방벽이 잡아 둔 「도달 못 하는 모듈」 7개** — 배선하는 순간 허용목록에서 빼야 하고, 안 빼면 방벽 시험이 죽는다. 정본은 `C:\Work\git\DocuLight2.0\packages\server\test\arch\assembly.test.ts` 의 `아직_배선되지_않음`.

| 도달 못 하는 모듈 | 세울 자리 |
| --- | --- |
| `packages/server/src/app/auth/signup-service.ts` | `FR-AUTH-002` · `SEC-AUTH-004` 의 가입 신청·승인 라우트와 두 화면 |
| `packages/server/src/app/auth/password-service.ts` | `SEC-AUTH-018` 의 비밀번호 변경 라우트와 설정 모달 account 패널 |
| `packages/server/src/app/auth/token-service.ts` | `SEC-AUTH-005` · `SEC-AUTH-007` 의 PAT 라우트와 설정 모달 tokens 패널 |
| `packages/server/src/app/audit/audit-retention.ts` | `R84-a` 의 감사 보존 일소 |
| `packages/server/src/http/routes/documents.ts` | 문서 원문 서빙 라우터 |
| `packages/server/src/http/guards/fail-closed.ts` **와** `packages/server/src/http/guards/dot-path-guard.ts` (2개) | 위 라우터의 가드 둘 |

---

## 5. 확정된 결정 (변경 금지)

| 확정도 | 뜻 |
| --- | --- |
| **확정** | 저장소에 근거가 있다 — 재논의 금지 |

1. **wave 는 `phase-1` target 위에서 돈다. `wave-N` target 을 새로 만들지 않는다** — **확정**. 근거: `docs/spec/00.index.md` §3 Target Map 에 target 이 `phase-1`·`phase-2` 둘뿐이고, `kiwi/waves.jsonl` 의 모든 이벤트가 `"target":"phase-1"` 이다. 이전 run 5개 wave 가 그렇게 돌았다.
   **이것은 `kiwi-wave-master` §4·§5 의 기본 경로에서 벗어난 일탈이다.** 그 스킬은 wave 마다 `wave-{n}` target 을 `/kiwi-srs` 로 등록하고 `--target wave-{n}` 을 명시 전달하라고 요구한다. 그대로 따르면 이미 `phase-1` 에 있는 요구를 새 target 에 중복 저작하게 되어 「한 사실은 한 곳에」(원장 `R124`)를 깬다. 그래서 아래 대체 규약으로 진행한다 — **이 규약이 없으면 다음 세션은 첫 wave 에서 멈춘다.**

   **대체 규약 (그대로 적용할 것)**
   - target 등록 단계(`/kiwi-srs` 호출)는 **건너뛴다.** 남은 15건은 이미 `phase-1` 안에 요구로 존재한다.
   - `/kiwi-pipeline` 에는 `--target phase-1` 을 전달하고, 그 wave 의 범위는 `--req-filter <그 wave 의 요구 ID 목록>` 으로 좁힌다.
   - `waves.jsonl` 의 `target` 필드에는 `phase-1` 을 쓴다.
   - **웨이브 종료 상호검증의 분모는 그 wave 에 배정한 요구 ID 목록으로 대체한다.** `phase-1` 전체(253건)를 분모로 쓰면 어느 wave 도 통과하지 못한다.
   - 매 wave 의 첫 이벤트 `notes` 에 이 일탈과 사유를 기록한다.

2. **낡은 run 은 닫지 않고 그대로 둔다** — **확정**. 근거: `kiwi-wave-master` §6 이 "재개 스캔은 **현재 run 의 `run_id` 와 일치하는 이벤트만**을 읽는다" 와 "**다른 run** 의 `complete` 는 이 run 의 완료로 읽지 않는다" 를 명시한다. 새 `run_id` 를 쓰면 낡은 run 은 영향을 주지 않는다.
   **`waves.jsonl` 에 낡은 run 을 닫는 `complete` 를 append 하지 마라** — 같은 §6 이 "`complete` 기록은 §5.5 상호검증을 통과한 뒤에만 append 하며, 통과 기록이 없는 `complete` 는 무효" 라고 못박는다. 검증 없이 쓰면 검증 기록 위조다. 손으로 편집하는 것도 금지(append-only).

3. **저장소 wave 가 MCP wave 보다 앞선다** — **확정**. 근거: `SEC-ARCH-002` 가 벡터검색 결과를 ACL 로 거르라고 요구하는데 그 인덱스가 `SEC-STORAGE-007` 이다.

4. **1.0 이행이 MCP wave 보다 뒤선다** — **확정**. 근거: `MIG-AUTH-002` AC-4 가 1.0 전역 API Key 를 유예 없이 끊는데 대체 경로가 PAT·MCP 다.

5. **`C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 읽기 전용이며 수정 금지** — **확정**. `MIG-AUTH-001` AC-1 의 「1.0 동결」을 그 저장소를 고치지 않고 달성할 방법을 1.0 이행 wave 진입 시점에 먼저 정한다.

6. **`OBS-AUDIT-001` AC-2 는 구현이 아니라 판정으로 닫혔다** — **확정**. 근거: 원장 `R165`, `docs/spec/12.audit-log.srs.md` Change Notes 2026-08-24 행. **아카이브 기능을 phase-1 에서 만들지 마라.**

7. **프록시 홉 수는 config 에 있고 기본은 끔이다** — **확정**. 근거: 원장 `R166`·`R166-a`·`R166-b`, `DR-SHELL-001` AC-2·AC-4. DB 인스턴스 설정으로 옮기지 마라.

8. **`token-service.ts` 배선(PAT 라우트·설정 모달)이 MCP wave 의 선행이다** — **확정**. 근거: `docs/plans/2026-08-24.remaining-work-order.md` 의 「Wave 1 이 남긴 것」 표 `token-service.ts` 행. `IR-AUTH-002` 가 MCP 인증을 `Authorization: Bearer <PAT>` 하나로 못박으므로 PAT 발급 화면 없이는 MCP 를 쓸 수 없다.

9. **상태 승급(`verified`)은 wave 실행 중에 하지 않는다** — **확정**. 근거: `waves-event.md` §2.3 이 라운드 진입 시 분모를 freeze 하고, "열거한 행 수가 `frozen_denominator` 와 다른 라운드는 두 검증자 **모두**에 대해 무효" 라고 규정한다. wave 도중 `update_status`·`check_acceptance_criteria` 를 넣으면 무효 라운드가 반복돼 `fail-cap` 으로 중단된다.

---

## 6. 미결정·유예 항목

- **160건 푸시 여부** — 푸시 지시를 받은 적이 없다. 결정 방법: 사용자 확인.
- **`SEC-AUTH-014` 를 어떻게 닫을 것인가** — AC-6·AC-7 에 증거가 없고, 그 요구 자신의 VE-2 가 AC-7 의 배타성을 미검증으로 적어 두었다. 결정 방법: `packages/server/src/app/install/install-service.ts` 의 모듈 전역 상태 셋(`liveToken` · `liveInstallSession` · `committing`)의 수명 규약을 함께 판정.
- **`--auto-integration` · `--auto-cost-warning` 을 줄지** — 첫 코딩 wave 에서 게이트가 뜬 뒤 사용자에게 물어 정한다. 아래 호출 규약 참조.

---

## 7. wave-master 밖에서 먼저 할 일 (브라우저 수동 검증 둘)

**이 둘을 wave 로 만들지 마라.** `kiwi-wave-master` §5.5 는 그 wave 의 증거 창에 `kiwi-review-fix-loop` 실행이 없으면 `complete` 로 기록하지 않고, 증거 번들은 `diff_window`·회귀 실행·plan 산출물을 필수 행으로 요구한다. 코드 변경이 0인 수동 검증 wave 는 그중 어느 것도 생산하지 못해 **첫 wave 에서 오케스트레이션 전체가 막힌다.**

메인 세션이 직접 처리한다.

- [ ] `FR-EDITOR-007` AC-7 — 표 요소의 「드러나는 절반」을 브라우저에서 확인. 완료 조건: MCP `add_verification_evidence` 로 수동 검증 증거를 등록하고 `check_acceptance_criteria` 로 AC-7 을 체크. AC-7 을 뺀 열한 AC 는 VE-1(AC-1~6·9·10·11) · VE-2(AC-12) · VE-3(AC-8) 셋이 나눠 덮는다. AC-7 만 happy-dom 이 CM6 재진입을 거부해 건너뛴 시험으로 남아 있다.
- [ ] `FR-EDITOR-001` AC-1·AC-2 — 실제 옵시디언 볼트를 기본 워크스페이스에 넣고 브라우저에서 읽고 편집. 완료 조건: 수동 검증 증거 등록. **증거 0건**이며 target goal 이 이 항목을 수동 검증으로 지정했다.

둘을 끝낸 뒤, 분해 입력 문서의 「Wave 2」 섹션을 아래 배제 표대로 `out_of_scope` 로 넘긴다.

---

## 8. wave-master 호출 규약

### 8.1 그냥 부르면 안 되는 이유

`C:\Work\git\DocuLight2.0\kiwi\waves.jsonl` 에 이전 run 이 남아 있다.

| run_id | wave | 마지막 상태 |
| --- | --- | --- |
| `2026-08-20.doculight2.phase1-implementation` | wave-1 ~ wave-4 | `complete` |
| 〃 | **wave-5** | **`in_progress`** (2026-08-22T16:00:00Z) |

wave-5 의 `scope` 는 저널에 `본문 표면 — 에디터·자동 저장·버전·충돌·첨부 (요구 35건)` 로 적혀 있고, `complete` 를 append 한 뒤 다시 `in_progress` 가 append 되어 마지막 이벤트가 `in_progress` 로 끝났다. ⚠️ **그 「35건」이 무엇인지는 확인할 수 없다** — wave-5 이벤트 4건 모두 `req_ids` 가 비어 있다.

그 범위 중 버전·첨부 축(`FR-STORAGE-*` · `FR-ATTACH-001`~`006` · `SEC-ATTACH-001`~`003` · `DR-ATTACH-001`~`003` · `REL-ATTACH-001`)은 현재 전건 `implemented` 다. **에디터 축은 아니다** — `FR-EDITOR-001` 과 `FR-EDITOR-007` 이 `planned` 이며, 그 둘이 곧 위 「wave-master 밖에서 먼저 할 일」의 두 건이다. 즉 낡은 wave-5 를 재개하면 이미 끝난 것 대부분을 다시 돌면서, 정작 남은 두 건은 수동 검증이라 그 사이클로는 닫히지 않는다.

`kiwi-wave-master` §6 은 "재개 대상 run 은 `complete` 로 끝나지 않은 **가장 최근 미완료** run 이며, `--run-id` 로 명시하면 그것이 우선한다" 이고 재개 지점은 첫 미완료 wave 다. 그러므로 **인자 없이 부르면 wave-5 를 재개한다.**

### 8.2 호출 문자열 (그대로 쓸 것)

```
/kiwi-wave-master --auto --max
  --run-id 2026-08-24.doculight2.phase1-remaining
  C:\Work\git\DocuLight2.0\docs\plans\2026-08-24.remaining-work-order.md
  --constraint "wave-N target 을 새로 만들지 않는다. /kiwi-pipeline 에 --target phase-1 과 --req-filter 로 범위를 좁히고, 상호검증 분모는 그 wave 의 요구 ID 목록으로 대체한다"
  --constraint "C:\Work\git\DocuLight\DocLight (1.0 저장소) 는 읽기 전용이며 수정 금지"
  --constraint "아카이브·복원은 phase-2 다. phase-1 에서 아카이브 기능을 만들지 않는다 (원장 R165)"
  --constraint "프록시 홉 수는 config 에 두고 기본은 끔이다. DB 인스턴스 설정으로 옮기지 않는다 (원장 R166)"
  --constraint "요구 변경은 speckiwi MCP 로만 한다. docs/spec/*.srs.md 를 손으로 고치지 않는다"
  --constraint "wave 실행 중에는 phase-1 에 status/AC mutation 을 넣지 않는다. verified 승급은 최종 검증 통과 후 별도로 한다"
  --constraint "커밋 메시지에 AI 시그니처를 넣지 않는다. 제목에 Phase n / Step n 같은 단계 표식도 금지"
```

- `--run-id` 값은 `kiwi/waves.jsonl` 에 아직 없다. §6 의 "재개 스캔은 현재 run 의 `run_id` 와 일치하는 이벤트만 읽는다" 에 따라 **일치하는 이벤트가 0건이므로 새 분해로 시작한다.** ⚠️ 신규 run 개시를 명시하는 별도 플래그는 스킬에 없다 — 이 도출은 그 문장에 근거한 것이며, 스킬이 낡은 run(`2026-08-20.doculight2.phase1-implementation`)의 wave 를 하나라도 읽으면 **즉시 중단하고 사용자에게 알린다.**
- **제약 전달은 선택이 아니다.** `wave-decomposition.md` §3 은 제약을 "사용자 프롬프트 · 대화 로그 · `--constraint` 인자" 에서 수집하는데, **다음 세션에는 대화 로그가 없다.** 넘기지 않으면 검증의 제약 계층이 공집합이 되어 위 결정들이 어느 계층에도 걸리지 않는다.
- `--drive` 는 **주지 않는다** — 미결정 3건이 사용자 결정을 요구한다.
- `--auto` 만으로는 첫 코딩 wave 의 kiwi-coder 게이트(`integration-test-user-consent` · `cost-warning-large-task`)에서 멈추는 것이 **정상**이다(스킬 §7.1). 그때 사용자에게 물어 `--auto-integration` · `--auto-cost-warning` 추가 여부를 정한다.

### 8.3 분해 커버리지 게이트 사전 지정

`wave-decomposition.md` §4 는 입력의 최상위 섹션 전량이 wave 에 배정되거나 `out_of_scope` 로 사유가 기록되기 전에는 target 등록에 진입하지 않는다. 분해 입력 문서에는 wave 가 아닌 최상위 섹션이 다섯 있다. 아래대로 배제한다.

| 섹션 | `exclusion_class` | 사유 |
| --- | --- | --- |
| 순서를 정한 두 제약 | `non-normative` | 순서의 근거이지 작업이 아니다 |
| ~~Wave 1~~ 종결 | `already-implemented` | 커밋 `d901d9a` 로 닫혔다 |
| Wave 2 (브라우저 수동 검증 둘) | `already-implemented` | wave-master 호출 **전에** 메인 세션이 처리한다 (위 「wave-master 밖에서 먼저 할 일」) |
| 별도 축 — 상태 승급 | `user-excluded` | wave 실행 중 금지 (결정 9번) |
| 운영 | `non-normative` | 푸시 여부는 사용자 결정 |

배제는 `--auto` 라도 사용자 확인 게이트(`out-of-scope-user-consent`)다. 위 표를 그대로 제시하고 승인을 받는다.

### 8.4 wave 번호 대응

문서의 Wave 번호와 스킬이 매길 저널 wave 이름은 **다르다.**

| SSOT 문서 | 이 run 의 저널 이름 |
| --- | --- |
| Wave 3 (저장소 기반) | `wave-1` |
| Wave 4 (MCP 패키지) | `wave-2` |
| Wave 5 (1.0 이행) | `wave-3` |
| Wave 6 (품질 후속) | `wave-4` |

⚠️ **저널의 `wave-5` 라는 이름은 낡은 run 의 것이며 이 run 과 무관하다.** `waves.jsonl` 을 읽을 때는 **항상 `run_id` 와 함께** 읽는다.

### 8.5 회귀 기준선

스킬 §2.1 의 preflight 회귀 기준선 캡처 명령을 **`cd /c/Work/git/DocuLight2.0 && NODE_ENV=production npm test` 로 고정**한다. 이 셸에는 `NODE_ENV` 가 이미 `production` 으로 있어, 다른 값으로 캡처하면 이후 모든 wave 검증이 유령 신규 실패를 보고 중단한다. 캡처 결과가 **실패 0**(= `baseline_failing_tests` 빈 배열)임을 확인한 뒤 진행하고, 실패가 나오면 진행하지 말고 사용자에게 보고한다.

---

## 9. 남은 작업 전체 목록

순서의 근거는 `docs/plans/2026-08-24.remaining-work-order.md` 에 있다. 완료 조건은 **그 요구의 AC 전건이 자동 시험으로 재어지고 통과**다.

### Wave 3 → 저널 `wave-1` — 저장소 기반 (MCP 의 선행)

- [ ] `REL-STORAGE-002` — chokidar 파일 감시와 unlink+add 상관 판정. fail-closed: 해시 동일 + 짧은 시간 창만 인정, 아니면 신규 노드 + tombstone + 재조정 대기열 기재.
- [ ] `SEC-STORAGE-007` — 벡터 인덱스. 삭제·이동과 **같은 처리 안에서** 동기 갱신하고, 없는 노드의 엔트리는 조회 시점에 무조건 제외.
- [ ] `FR-SHELL-013` AC-4 — PDF 본문 추출과 페이지 번호를 실은 색인 항목. 이 요구는 현재 `in_progress` 이며 이 AC 가 남은 부분이다.
- [ ] `packages/server/src/http/routes/documents.ts` · `fail-closed.ts` · `dot-path-guard.ts` 배선 — 완료 조건: 조립 방벽 허용목록에서 세 항목을 빼도 `test/arch/assembly.test.ts` 가 통과.

### Wave 4 → 저널 `wave-2` — MCP 서버 패키지

- [ ] `packages/server/src/app/auth/token-service.ts` 배선 (PAT 라우트 + 설정 모달 tokens 패널) — `SEC-AUTH-005` · `SEC-AUTH-007`. **이 wave 의 나머지보다 먼저** (결정 8번). 완료 조건: 허용목록에서 빼도 방벽 통과.
- [ ] `SEC-ARCH-001` · `IR-AUTH-002` — 패키지 골격과 인증. `Authorization: Bearer <PAT>` 가 **유일한** 경로이고 무인증 도구가 목록에 존재하지 않는다.
- [ ] `SEC-ARCH-002` · `SEC-ARCH-003` — 인가. 읽기·벡터검색은 호출자 ACL 로 거르되 **걸러진 사실을 건수·순번·자리표시 어느 형태로도 노출하지 않고**, 쓰기는 결과 필터가 아니라 **실행 자체를 막는다**.
- [ ] `FR-ARCH-001` — 1.0 의 도구 이름·인자·출력 포맷·에러 코드를 계약으로 물려받되 소스는 이식하지 않는다. A-RAG 는 신규 작성.
- [ ] `CON-SHELL-002` AC-3 · `SEC-ACL-006` AC-5 — 위가 서면 파생으로 닫힌다. `CON-SHELL-002` 의 AC-1·AC-2 는 이미 사실이다(검색 탭에 AI 토글이 없다). `SEC-ACL-006` 은 현재 `in_progress`.

### Wave 5 → 저널 `wave-3` — 1.0 이행

- [ ] `MIG-AUTH-002` — 계정 전원 `active` + `default` 그룹 · **bcrypt 해시 그대로 재사용** · 전역 API Key 무효화와 PAT 재발급 안내.
- [ ] `MIG-AUTH-001` — 1.0 읽기 전용 동결 · `docsRoot` 전체(비-md 포함)를 기본 워크스페이스로 복사 · 벡터 인덱스는 옮기지 않고 재구축.
- [ ] `CON-ARCH-002` AC-8 — 1.0 리포가 동결된 상태로 운영 가능한지. 절차 판정이며 코드로 재지 않는다. 현재 `in_progress`.

### Wave 6 → 저널 `wave-4` — 품질 후속 다섯

**요구 없이 코드를 고치지 않는다**(저장소 `CLAUDE.md`). 이 wave 는 **`/kiwi-srs` 로 다섯 건의 요구를 `phase-1` 에 먼저 신설한 뒤** 그 요구를 범위로 삼는다. 요구 없이 진행하면 검증 분모가 0 인 wave 가 되어 통과할 수 없다.

- [ ] 감사 패널의 원시 principal ID 노출
- [ ] 「설정 변경 전체」 필터 값 상실 (`R164-a` 에 상실로 기록됨)
- [ ] PAT 발급 행 미표시
- [ ] `auditView` 의 이중 질의
- [ ] `correlationId` 를 branded 타입으로

상세는 `docs/plans/2026-08-24.remaining-work-order.md` 의 Wave 6 표.

### 남은 배선 셋 (어느 wave 에 넣을지 분해 시점에 정한다)

허용목록 7개 중 Wave 3 이 셋(`documents.ts` · `fail-closed.ts` · `dot-path-guard.ts`), Wave 4 가 하나(`token-service.ts`)를 가져가므로 셋이 남는다.

- [ ] `packages/server/src/app/auth/signup-service.ts` — `FR-AUTH-002` · `SEC-AUTH-004`
- [ ] `packages/server/src/app/auth/password-service.ts` — `SEC-AUTH-018`
- [ ] `packages/server/src/app/audit/audit-retention.ts` — `R84-a` 의 감사 보존 일소

### 별도 축 — 상태 승급 (wave 실행 중 금지 · 결정 9번)

- [ ] `implemented` 220건 중 `verified` 는 18건. 승급 조건은 **AC 전건 체크 + 증거 1건 이상**이며 증거 누락은 0건이므로 남은 것은 대개 AC 체크다. **최종 검증이 `pass` 로 기록된 뒤 별도 세션에서 일괄 수행한다.**
- [ ] **`SEC-AUTH-014` 는 제외** — 위 미결정 절 참조.

---

## 10. 다음 세션 지시서

1. 「wave-master 밖에서 먼저 할 일」의 두 건을 브라우저로 확인하고 증거를 등록한다 → 검증: MCP `get_requirement('FR-EDITOR-007')` 의 AC-7 이 체크됐고, `FR-EDITOR-001` 에 Verification Evidence 가 1건 이상 있다.
2. 회귀 기준선을 캡처한다 → 검증: `cd /c/Work/git/DocuLight2.0 && NODE_ENV=production npm test` 가 실패 0.
3. 「wave-master 호출 규약」의 호출 문자열을 그대로 쓴다 → 검증: 스킬이 낡은 run 의 wave 를 하나라도 읽으면 **즉시 중단**하고 사용자에게 알린다.
4. 분해 결과가 위 「남은 작업 전체 목록」을 전부 덮는지 확인한다 → 검증: 어느 wave 에도 배정되지 않고 배제 사유도 없는 항목이 0건.
5. 배제 표를 제시하고 사용자 승인을 받는다 → 검증: 다섯 섹션 각각에 `exclusion_class` 가 기록됐다.
6. 각 wave 완료마다 전 패키지 회귀를 돌린다 → 검증: 실패 0.
7. 스킬이 최종 검증 `pass` 를 보고하면 **§1 완료 조건 셋을 각각 재확인한다** → 검증: (a) MCP `summarize_target('phase-1')` 의 `planned`·`in_progress` 가 0, (b) `docs/spec/00.decision-log.md` §4 의 수용 기준 13개를 한 건씩 대조해 11개의 자동 시험 경로와 2개의 수동 검증 증거를 적는다, (c) MCP `validate_spec` 오류 0. **셋 중 하나라도 어긋나면 완료로 보고하지 않는다.**

---

## 11. 거버넌스·게이트·함정

### 저장소 규약

- **요구 변경은 speckiwi MCP 로만.** `docs/spec/*.srs.md` 를 손으로 고치지 않는다.
- **황금률**: MCP mutation 뒤 **같은 SRS 파일에 `Edit` 도구를 쓰지 않는다.** 고칠 것이 있으면 MCP 를 다시 부른다.
- **요구 없이 코드를 고치지 않는다** — `CLAUDE.md` 가 "Implement behavior that is not covered by an SRS requirement" 를 금지한다.
- **커밋 메시지에 AI 시그니처 금지** — `Co-Authored-By` · `Generated with` · `[bot]` · `[ai]` · `noreply@anthropic.com` 어느 것도. 커밋 직후 `git log -1 --format="%B"` 로 확인한다. 제목에 `Phase {n}` · `Step {n}` 같은 단계 표식도 금지.
- **TDD 강제**: 동작 변경은 실패하는 시험을 먼저 쓰고 red 를 확인한 뒤 최소 구현으로 green.
- **새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다**(뮤테이션 탐침). 이번 회차에 이 절차가 **아무것도 재지 않는 시험 둘**을 잡아냈다.
- **검증은 서브에이전트로.** 자기 산출물을 자기가 검증하지 않고, 검증자에게 자기 결론을 전달하지 않는다.
- **개발 서버 포트 3399**(web), 3400(server dev API).

### 이번 세션에 실제로 밟은 함정

| 함정 | 회피 방법 |
| --- | --- |
| `NODE_ENV` 가 셸에 `production` 으로 있다 | vitest 를 `NODE_ENV=production npx vitest run ...` 로 돌린다 |
| Bash 도구는 호출마다 cwd 가 초기화된다 | 매번 절대경로로 `cd` 한다 |
| Python `str.replace` 는 패턴이 없어도 **조용히** 성공한다 | 치환 전에 반드시 `assert old in s`. 이것 때문에 방벽 수정이 적용 안 된 채 「고쳤다」로 읽힌 적이 있다 |
| Python 힙독 문자열 안의 `\n` 이 TS 파일에 진짜 개행으로 들어간다 | 까다로운 이스케이프는 `Write`/`Edit` 도구로 |
| 시험 파일 4개가 `ServerConfig` 리터럴을 갖는다 | config 칸을 늘리면 그 넷이 함께 깨진다 — `instance-settings.test.ts` 가 칸 수를 닫아 두었으므로 **요구를 먼저 고쳐야** 한다 |

### speckiwi MCP 의 런타임 동작 다섯

⚠️ **아래 다섯은 이번 세션의 MCP 호출에서 실제로 겪은 동작이며, 도구 스키마에는 선언돼 있지 않다.** 그래서 읽기 전용으로는 재확인할 수 없다 — 다음 세션은 각 도구를 `dryRun: true` 로 한 번 불러 확인할 수 있다.

| 동작 | 회피 방법 |
| --- | --- |
| `replace_acceptance_criteria` 는 `AC-n:` 접두를 자동으로 붙인다 | `text` 에 `AC-1:` 을 넣으면 `AC-1: AC-1:` 이 된다. 본문만 넣는다 |
| `add_verification_evidence` 의 `notes` 에 `\|` 나 개행을 넣으면 `MUTATION_DENIED` | 표 구분자와 개행을 빼고 쓴다 |
| `append_section_note` 의 섹션 이름은 snake_case | `Implementation Notes` 가 아니라 `implementation_notes` |
| `verified` 요구는 granular edit 을 거부한다 | `update_status` 로 `in_progress` 로 내린 뒤 고치고 다시 올린다 |
| MCP 의 시각은 UTC 다 | 로컬이 2026-08-24 새벽이면 Change Note 에 `2026-08-23` 이 찍힌다. 손으로 쓰는 원장 날짜를 그 값에 맞춘다 |

### 실행 명령

**Bash 도구 전용**이다.

```bash
cd /c/Work/git/DocuLight2.0 && NODE_ENV=production npm test
cd /c/Work/git/DocuLight2.0 && npm run typecheck
cd /c/Work/git/DocuLight2.0/packages/server && NODE_ENV=production npx vitest run test/arch/assembly.test.ts
```

PowerShell 도구로는 이렇게 쓴다 — `&&` 는 이 환경의 PowerShell 5.1 에서 파서 오류다.

```powershell
Set-Location C:\Work\git\DocuLight2.0; $env:NODE_ENV='production'; npm test
Set-Location C:\Work\git\DocuLight2.0; npm run typecheck
```

---

## 12. 리스크·잔존 이슈

- **낡은 wave 저널** — 영향: 인자 없는 `/kiwi-wave-master` 호출이 끝난 작업을 재실행한다. 대응: 「wave-master 호출 규약」의 `--run-id`.
- **wave-N target 일탈** — 영향: 스킬의 기본 경로와 다르므로, 스킬이 target 등록을 요구하는 지점에서 다음 세션이 판단을 요구받는다. 대응: 결정 1번의 대체 규약. 그래도 막히면 사용자에게 보고한다.
- **160건 미푸시** — 영향: 로컬 디스크 사고 시 전량 손실. 대응: 사용자에게 푸시 여부를 묻는다.
- **`SEC-AUTH-014` 를 닫을 수 없다** — 영향: 완주 시점에도 이 요구 하나가 `implemented` 에 머문다. 완료 조건 1번(`planned`·`in_progress` 0)에는 걸리지 않는다.
- **`validate_spec` 경고 1건(`SRS-W072`)** — `docs/spec/02.feature-request-live-preview.md` 가 scope 문서 `02.product-architecture.srs.md` 와 앞자리 번호를 공유한다. 이번 작업들과 무관한 기존 상태이며 오류가 아니다.
- **조립 방벽 허용목록 7개** — 영향: 배선하면서 허용목록에서 빼지 않으면 방벽 시험이 죽는다. 대응: 배선 작업의 완료 조건에 「허용목록에서 제거」를 넣었다.
- **`install-service.ts` 의 모듈 전역 상태 셋** — 한 프로세스에서 두 `InstallStores` 를 세우면 한쪽의 커밋이 다른 쪽을 `commit-in-flight` 로 거절한다. 지금은 vitest 가 파일별로 갈라 돌려 드러나지 않는다. 독립 재리뷰가 LOW 로 지적했고 사유와 함께 거절했다 — `docs/analysis/kiwi-review-fix-loop-2026-08-24.doculight2.self-wave1/rejected_findings.log` 참조.
