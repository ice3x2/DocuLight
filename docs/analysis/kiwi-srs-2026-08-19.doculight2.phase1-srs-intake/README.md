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

1. **[MEDIUM] scope 문서 11개 전량의 §1 Scope Overview · §2 Scope Boundaries · §3 Assumptions and Constraints 가 스캐폴딩 문구 그대로다** (`Describe the scope.` · `- None`). §2 는 경계 선언이라 비어 있으면 다음 저작자가 요구사항을 어디 둘지 판정할 근거가 없다. `eval-fidelity.md` 참조.
2. **[MEDIUM] 소유권 포인터 2곳이 틀린 scope 를 지목한다** — `08.app-shell.srs.md:419` 와 `14.storage.srs.md:1437` 이 `ACL`·`EDITOR` 를 가리키는데 실제 소유자는 `WORKSPACE` 다(`R39`·`R80` 계열). 나머지 22곳은 정확하다.
3. **[MEDIUM] `OBS-AUDIT-002` 는 §29.1-⑦ 로 쪼개야 한다** — 보존 기간(공백 `G27` 로 막힘)과 불변성(막히지 않음)이 한 블록에 묶여 불변성 축까지 `blocked` 로 잠겼다.
4. 나머지 MEDIUM 4 · LOW 9 는 두 `eval-*.md` 에 있다.

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
