# kiwi-srs 실행 기록 — 2026-08-19

원장 `docs/spec/00.decision-log.md` 의 `R32` 를 이행해 조항 337행을 SpecKiwi 요구사항 256건으로 전개한 근거 일체다.

## 읽는 순서

| 파일 | 무엇인가 |
|---|---|
| `classification.json` | **여기부터 읽어라.** 무엇을 왜 이렇게 정했는지의 요약 — 심의 결정 7건, 실측 정정, 지시서와의 충돌 처리 |
| `ledger_measurement.json` | 원장 실측(조항 341 · Phase 1 325 · 공백 15). 결정적 스크립트 결과 |
| `gap_coupling.json` | 열린 공백이 실제로 무엇을 막는가 — 전개 착수 판단의 근거 |
| `scope_assignment.json` | 조항 → 11 scope 배정 전량. 미배정 0 · 중복 0 으로 검산됨 |
| `committee-brief.md` · `panel-1..3.md` | 구조 결정을 정한 독립 심의 3인. **소수 의견이 여기 살아 있다** |
| `authoring-brief.md` | 저작자 11인에게 준 규칙 |
| `authored-*.json` | scope 별 저작 결과 — 어떤 조항이 어떤 요구사항이 됐는가, 무엇을 쪼갰고 무엇을 흡수했는가 |
| `eval-fidelity.md` · `eval-rules.md` | 독립 검증 2인. **잔여 MEDIUM 7 · LOW 9 가 여기 있다** |
| `intent.json` · `code_context.json` · `existing_srs_context.json` | 사전조사 3인 |

## 남은 것 — 다음 세션이 집을 자리

검증이 낸 것 중 **고치지 않은 것**이다. HIGH 3 은 전건 수정했고 커밋 `7cf0144` 에 있다.

**MEDIUM 7 · LOW 9 는 2026-08-19 에 전건 처분했다**(커밋 `8a3e701`). 처분 내역은 `fix-g1.md`·`fix-g2.md`·`fix-g3.md` 에 있고 그중 **3건은 기각**이다 — 지적이 틀렸거나 고치는 것이 더 나빴다. 기각 사유는 각 요구사항 블록의 Implementation Notes 에도 남겨 다음 패스가 같은 지적을 반복하지 않게 했다.

기각된 것 중 하나가 특히 중요하다. *"예시 문구를 AC 로 못박은 자리와 안 못박은 자리의 처리가 갈린다"* 는 **허위 양성**이었다 — `R105-a` 는 문면을 직접 정하고(*"…항상 동일한 문구(「권한에 따라 일부 항목이 제외될 수 있습니다」)를 표시한다"*) `R106-c` 는 **「예:」로 표기**한다. 처리가 갈린 것이 원장을 정확히 따른 결과였고, 지적대로 「일관되게」 만들었으면 `R105-a` 가 정한 문면이 SRS 에서 사라졌을 것이다.

**남은 것은 없다.** 다음 라운드에서 새로 검증하면 새 지적이 나올 수 있다.

## 도구 공백 — 기존 요구사항에 Change Notes 를 추가할 수 없다

**2026-08-19 실측.** 개정 사유를 남기라는 것이 SRS-MD §21.3-⑥ 의 요구인데, **이미 등재된 요구사항에 Change Notes 행을 추가하는 MCP mutation 이 없다.**

| 시도 | 결과 |
|---|---|
| `add_requirement` 의 `changeNotes` | 신규 생성 전용 |
| `edit_requirement_fields` | 파라미터에 `changeNotes` 가 없다 |
| `edit_requirement_table_rows` | `section` enum 이 `verification_evidence`·`trace_links` 둘뿐 |
| `append_section_note` 에 `section: "Change Notes"` · `"change_notes"` | 둘 다 `USAGE: unknown section` 으로 거부 |

`append_section_note` 가 받는 section 값은 `implementation_notes` 계열이다. 그래서 이번 개정에서 **고친 요구사항들의 개정 사유는 Change Notes 가 아니라 Implementation Notes 에 날짜와 함께 들어갔다.** 손으로 파일을 고치는 것은 금지돼 있어(황금률 — mutation 이 SHA 스냅샷으로 stale-check 한다) 우회하지 않았다.

**다음에 이 자리를 만나면**: ① speckiwi 에 기능을 요청하거나 ② Implementation Notes 에 `[YYYY-MM-DD]` 접두로 남기는 지금 방식을 규약으로 굳히거나 ③ 개정을 `add_requirement` + `update_status(discarded)` 로 처리해 새 블록의 `changeNotes` 를 쓰는 세 갈래다. ③은 ID 가 바뀌므로 §11.4-③(표현을 고칠 때는 ID 유지)과 부딪힌다.

---

## 이 실행에서 확인된 것 — 도구·규칙의 사실

- **`Status` 열거에 `proposed` 가 없다.** 규칙서 §14.1 은 `planned`·`in_progress`·`blocked`·`implemented`·`verified`·`discarded` 뿐이다. kiwi-srs 스킬이 기본값으로 말하는 `proposed` 는 이 저장소에서 무효다.
- **`{{OQ-N}}` placeholder 문법과 요구 블록의 `Open Questions` 섹션은 이 규칙서에 존재하지 않는다.** 미결은 `00.index.md` §9 로 간다.
- **`priority`·`risk` 는 생략할 수 없다** — `add_requirement` 가 enum 으로 강제하고 미지정 시 `medium` 을 채운다. 따라서 §4 수용 기준이 지목하지 않은 요구사항의 `medium` 은 원장의 판단이 아니라 도구의 기본값이다.
- **요구사항 제목에 백틱을 쓰면 `SRS-E020` 으로 거부된다.**
- **`scaffold_scope` 는 scope 문서만이 아니라 `docs/spec` 의 모든 번호를 회피한다** — 규칙서 §5.2.2 문면(`scope 문서 중 최고 번호 +1`)과 어긋나므로 새 scope 를 만들 때는 dry-run 으로 실제 배정값을 먼저 확인하라.
- **`SRS-W072` 경고가 남아 있는 한 `speckiwi validate --fail-on-warning` 을 종료 조건으로 쓸 수 없다.** 원인은 `02.feature-request-live-preview.md` 이고 그 문서는 「별도 세션 진행 중」 표기라 손대지 않았다.

## 부수로 발견된 코드 결함 — SRS 작업 밖이라 고치지 않았다

`code_context.json` 이 근거다.

1. **`packages/editor/src/vendor/atomic-editor/wiki-links.ts`(597줄)가 배선되어 있지 않다** — `AtomicCodeMirrorEditor` 기본 확장 세트에 없고 `src/index.ts` 로 재수출되지도 않는다. `demo/App.tsx:102` 의 *"`[[위키링크]]` 도 동작합니다"* 는 코드와 어긋난다.
2. **vendor 테스트 7파일 56케이스가 수집되지 않는다** — `packages/editor/vite.config.ts` 의 `test.include: ['test/**/*.test.{ts,tsx}']` 가 vitest 기본 include 를 대체해 `src/` 하위 `__tests__` 가 매칭되지 않는다. **어떤 `implemented` 승격보다 이것이 먼저다** — 통과 증거가 없는 코드다.
3. **`ATOMIC_CODE_LANGUAGES`(139줄)가 어디서도 import 되지 않는다** — `codeLanguages` prop 기본값이 `[]` 라 `@codemirror/lang-*` 16개 의존성이 사실상 미사용이고 코드 펜스가 강조 없이 렌더된다.
