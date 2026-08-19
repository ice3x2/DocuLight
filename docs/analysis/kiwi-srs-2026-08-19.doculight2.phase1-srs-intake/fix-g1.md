# fix-g1 — AUDIT · WORKSPACE · STORAGE 지적 개선 보고

작업일 2026-08-19 · 대상 `docs/spec/12.audit-log.srs.md` · `docs/spec/13.workspace.srs.md` · `docs/spec/14.storage.srs.md`
전 변경은 SpecKiwi MCP mutation 으로만 수행했다. `validate_spec` 결과 **errors 0 / warnings 2**(`SRS-W072`·`SRS-W023`, 둘 다 기존).

## 신규 ID 2건

| ID | 파일 | 출처 | Status / Stability |
|---|---|---|---|
| `OBS-AUDIT-011` — 감사 로그 보존 기간은 인스턴스 설정에서 지정한다 | `12.audit-log.srs.md` | `OBS-AUDIT-002` 에서 §29.1-⑦ 분리 | blocked / evolving |
| `FR-WORKSPACE-009` — 권한 없는 문서명의 수동 위키링크 작성은 막지 않는다 | `13.workspace.srs.md` | `SEC-WORKSPACE-004` AC-9·AC-10 분리 | planned / stable |

---

## M1 [MEDIUM] `OBS-AUDIT-002` 축 분리 — **맞았다**

**원장 확인.** `R84-a`: *"감사 로그는 **수정·삭제 불가**이며 보존 기간은 설정에서 지정한다"* — 한 조항에 두 축이 있다.
`G27`: *"감사 로그 보존 기간(R84-a)에 기본값이 없고 휴지통 보존(R86)과의 대소 관계도 없다 … `0` 의 의미(무제한/즉시)가 R84-a 에 없다"* — **막는 대상이 보존 기간뿐**이다. 불변성은 G27 문면 어디에도 없다.
지적대로 `Status=blocked` 가 블록 전체에 걸려 있어 `R137-g`·`R142-a`·`R134-b` 가 딛고 선 불변성 규범(AC-1·AC-2)이 G27 이 닫힐 때까지 착수 대상에서 빠졌다.

**고친 것.**

`OBS-AUDIT-002` (ID 유지 — §11.4-③)

| | before | after |
|---|---|---|
| Title | 감사 로그의 불변성과 보존 기간 | 감사 로그의 행은 기록된 뒤 수정·삭제할 수 없다 |
| Status | `blocked` | `planned` |
| Tags | audit-log, retention, immutability | audit-log, immutability |
| AC | AC-1·AC-2·AC-3 | AC-1·AC-2 (AC-3 이관) |
| Trace | R84-a / **G27** | R84-a / **`Requirement OBS-AUDIT-011 related_to`** |
| Verification Method | review (유지) | review (유지 — 경로 부재 검사) |

- 본문 3번째 문장 *"…그 축이 닫히기 전까지 이 요구사항은 진행할 수 없다"* 삭제 — §19.1 문형 위반(작업 상태 서술)이자 Implementation Notes 와의 `CON-ARCH-008` 중복. blocked 사유는 이제 `OBS-AUDIT-011` Implementation Notes 한 곳에만 있다.
- Implementation Notes 재작성: G27 3축 서술 전량을 `OBS-AUDIT-011` 로 옮기고, 이쪽에는 *"불변성 축은 G27 에 걸리지 않는다"* + 검증 방법 차이만 남겼다.
- **값 삭제 없음** — AC-3 문면·G27 3축 분석·`R141`/`R142-a` 조건부 근거·`R115-e` rationale 은 전부 `OBS-AUDIT-011` 로 그대로 옮겼다.

`OBS-AUDIT-011` — Verification Method 를 **`test`** 로 뒀다(지적이 든 §29.1-③ 근거: 보존 기간은 설정 화면 동작으로 판정, 불변성은 경로 부재 검사). 두 블록에 `Requirement … related_to` 상호 링크를 걸었다.

---

## M2 [MEDIUM] `OBS-AUDIT-004` AC-4 — **맞았다. 단, 삭제하지 않고 명제로 재작성했다**

**원장 확인.** `R137-a`: *"제외축 — 다른 화면이 행위자·시각까지 영구히 재현하면 기록하지 않는다"*.
지적대로 *"…판정된다"* 는 절차 수행이라 `Verification Method=test` 로 옮길 수 없고 기대 결과도 둘이었다.

**다만 지적대로 지우면 규범이 사라진다.** AC-3 은 *영구성* 축만 담는다 — **"행위자와 시각을 모두 보인다"** 축은 AC-4 에만 있었다. 지웠으면 `R137-a` 의 핵심 판별자가 수용 기준에서 증발한다. 그래서 삭제 대신 시스템 명제로 재작성하고 §21.3-② 대로 둘로 쪼갰다.

| | before | after |
|---|---|---|
| AC-4 | 제외된 조작마다 그 재현처가 무엇이며 그곳이 행위자와 시각을 모두 보이는지가 **판정된다**. | 제외의 근거가 되는 재현처가 그 조작의 **행위자를 표시한다**. |
| AC-5 | — | 제외의 근거가 되는 재현처가 그 조작의 **시각을 표시한다**. |

- 주어가 테스트 저자 → **시스템(재현처)** 으로 바뀌어 pass/fail 이 결정된다. `Verification Method=test` 를 유지했다(문서 명제가 아니라 시스템 명제이므로 `review` 로 낮출 이유가 없다).
- 절차 부분(*제외된 조작마다 재현처를 지목한다*)은 Implementation Notes 로 이관: *"제외를 새로 인정할 때는 그 재현처를 먼저 지목하고 AC-3·AC-4·AC-5 로 그 재현처를 검사한다 — 판정 절차이므로 수용 기준이 아니라 여기에 둔다."*
- 부수 효과(의도한 것): `G28`(R78 버전 사이드카에 행위자 칸 없음) 때문에 AC-4 는 현재 통과할 수 없다. 이것이 **공백을 테스트 실패로 드러내는** 올바른 상태다. Implementation Notes 를 *"그 조치 전까지 AC-4 는 통과할 수 없고, AC-1 의 제외도 정상 동작이 아니라 공백의 증상이다"* 로 갱신했다.

---

## M3 [MEDIUM] `SEC-WORKSPACE-004` AC 12건 — **맞았다. 전부 자리 이동, 삭제 0건**

**원장 확인 (⚠ 주의 사항 검증).** `00.decision-log.md:644` §4 수용 기준 3 문면:

> **`R80` 이 정한 표면 전부에서 권한 밖 문서가 걸러진다** — 표면 목록은 **R80 을 정본으로 두고 여기 열거하지 않는다**(R124 · 수용 기준 2 와 같은 형태). **E2E 는 판정 시점의 R80 열거를 읽어 표면마다 단언을 만들고, 집계형 표면은 목록 미노출과 수치 미가산을 각각 단언한다**

→ AC-11·AC-12 의 내용은 **원장 문면에 실재한다**. 지우지 않고 §25 자리(Implementation Notes)로 옮겼다.

**고친 것.** AC 12건 → **8건**.

| AC | 처리 |
|---|---|
| AC-1 ~ AC-8 | 유지 (필터링 규범) |
| AC-9·AC-10 | → **`FR-WORKSPACE-009` 신규 분리** (`R80-b`) |
| AC-11 | → Implementation Notes 이관 (E2E 작성 지시 + Phase 1 미존재 표면 제외 사유) |
| AC-12 | → 같은 Implementation Notes 항목에 흡수. AC-4·AC-5 되풀이(§29.2-③)라 수용 기준으로는 중복 |

이관된 Implementation Notes 항목(원장 문면 보존):
> 수용 기준 판정 E2E 는 판정 시점의 이 조항 열거를 읽어 표면마다 단언을 만들고, 집계형 표면(태그)에 대해서는 목록 미노출(AC-4)과 수치 미가산(AC-5)을 각각 단언하며, Phase 1 에 존재하지 않는 표면(그래프뷰 — R17 로 Phase 2)은 제외 사유와 함께 명시한다. 원장 §4 수용 기준 3 이 이 문면을 그대로 적는다 — 검증 방법 지시이므로 수용 기준이 아니라 여기에 둔다.

**`FR-WORKSPACE-009` 분리 근거.** `R80-b`: *"권한 없는 문서명을 **수동으로 타이핑해 위키링크를 거는 것은 막지 않는다.** 그 링크는 R42 대로 깨진 링크로 렌더된다"* — 필터링(무엇을 감추는가)과 방향이 반대인 규범(무엇을 막지 않는가)이다. Stability 를 `stable` 로 뒀다: 부모의 `evolving` 사유인 `G14-a`(렌더 갱신 시점)가 이 축에 걸리지 않는다.

**Trace 정리.** `SEC-WORKSPACE-004` 의 `R80-b` 행을 `informed_by` → `related_to` 로 바꾸고 *"그 규범은 FR-WORKSPACE-009 가 소유"* 라고 적어 `R124`(한 사실은 한 곳에)를 지켰다. 양쪽에 `Requirement … related_to` 상호 링크.

---

## M4 [MEDIUM] 소유권 포인터 오류 — **맞았다**

**배정표 확인** (`scope_assignment.json`): `R39` → **WORKSPACE** · `R80` → **WORKSPACE** · `R89` → **SHELL** · `R16` → **EDITOR** · `R106` → **SHELL**.
**원장 확인**: `R80` 이 *"`[[` 자동완성 후보"* 를 필터 대상 표면으로 직접 열거한다(자동완성 후보 필터 = R80 = WORKSPACE). `R89` = *"우측 사이드바를 신설한다 … 탭: 백링크 / 아웃고잉 링크 / 태그"*(백링크 탭의 존재 = SHELL). `R16` = Phase 1 범위 선언(EDITOR).
→ *"EDITOR·ACL scope 가 소유"* 는 **양쪽 다 틀렸다.** `ACL` scope 는 `R39`·`R80` 을 하나도 갖지 않는다.

위치: `docs/spec/14.storage.srs.md` `FR-STORAGE-009` Implementation Notes.

- before: `위키링크 자동완성·백링크 패널·워크스페이스 경계를 넘는 인덱싱(R39)과 표시 필터(R80)는 EDITOR·ACL scope 가 소유한다. 이 요구는 해석 규칙과 삽입 형식만 정한다.`
- after: `워크스페이스 경계를 넘는 인덱싱(R39)과 자동완성 후보를 포함한 표시 필터(R80)는 WORKSPACE scope 가 소유한다. 백링크 탭의 존재는 R89 로 SHELL scope 가 소유하고, EDITOR scope 는 R16 의 Phase 범위 선언만 갖는다. 이 요구는 해석 규칙과 삽입 형식만 정한다.`

같은 블록의 나머지 3개 항목(`R97-c` · 동명 문서 해석 우선순위 미결 · `R42`)은 손대지 않았다.

---

## L1 [LOW] 기대 결과 2개인 AC — 2자리 모두 분할

### ① `FR-STORAGE-001` AC-3 — **강제 스냅샷 근거는 원장에 있다. 지우지 않았다**

지시대로 먼저 원장을 확인했다. `R75`: *"저장은 옵시디언과 동일한 무버튼 자동 저장이다 … **Ctrl+S 는 "즉시 저장 + 버전 스냅샷 강제 생성"의 보조 수단**"* — 강제 스냅샷은 `R75` 본문에 명시돼 있다. `R75-a`(스냅샷 = 편집 세션 단위)는 그 **일반 규칙**이고 Ctrl+S 는 그 예외다(블록 Implementation Notes 도 *"Ctrl+S 의 강제 스냅샷은 그 세션 규칙의 예외다"* 라고 이미 적고 있었다). **근거가 있으므로 삭제하지 않고 분할만 했다.**

| | before | after |
|---|---|---|
| AC-3 | Ctrl+S 를 누르면 디바운스를 기다리지 않고 즉시 저장되며 **버전 스냅샷이 강제로 생성된다** | Ctrl+S 를 누르면 디바운스를 기다리지 않고 즉시 저장된다. |
| AC-4 | — | Ctrl+S 로 저장하면 편집 세션당 1회라는 스냅샷 규칙과 무관하게 버전 스냅샷이 생성된다. |

기존 AC-4~AC-6 → AC-5~AC-7 로 밀렸다. (`docs/` 전역 grep 결과 `FR-STORAGE-001 AC-n` 형태의 외부 참조 0건 — 번호 이동이 깨뜨리는 참조 없음을 사전 확인했다.)

### ② `OBS-AUDIT-005` AC-8

| | before | after |
|---|---|---|
| AC-8 | 워크스페이스 생성이 감사 행을 남기고, **그 폼 안의 관리자 지정과 default 초기 권한 부여도** 함께 기록된다 | 워크스페이스 생성이 감사 행을 남긴다. |
| AC-9 | — | 워크스페이스 생성 폼 안의 관리자 지정(R35-a)과 default 초기 권한 부여(R111)가 각각 부여 감사 행을 남긴다. |

기존 AC-9(설치 마법사) → AC-10. 조항 번호 `R35-a`·`R111` 을 AC 문면에 명시해 추적성을 올렸다(rationale 에만 있던 것).

---

## 고치지 않은 것

| 항목 | 사유 |
|---|---|
| `OBS-AUDIT-002` 의 `Stability=evolving` | 지시가 열거한 변경 목록(AC·Status·Trace)에 없었다. G27 trace 를 뺐으므로 evolving 의 표면적 사유가 사라졌고 `stable` 이 타당해 보이나, stability 는 lifecycle 결정이라 임의로 바꾸지 않았다. **판단 필요.** (blocker 는 아니다 — draft/deprecated 만 게이트에 걸린다) |
| `FR-STORAGE-001` AC-5(구 AC-4) *"자동 저장이 중단되고 배너로 안내된다"* | 기대 결과가 둘로 볼 여지가 있으나 검증 보고가 지목하지 않았고 맡은 범위 밖이다. **보고만 한다.** |
| `OBS-AUDIT-004`·`OBS-AUDIT-005`·`SEC-WORKSPACE-004`·`FR-STORAGE-001`·`FR-STORAGE-009` 의 Change Notes 행 | **MCP 도구 공백.** `append_section_note` 는 `change_notes` 섹션을 `unknown section` 으로 거부하고, `edit_requirement_table_rows` 는 `verification_evidence`·`trace_links` 만 지원한다. Change Notes 를 자동으로 남기는 것은 `update_status`·`update_stability` 의 `reason` 뿐이라, 상태 변경이 동반된 `OBS-AUDIT-002` 와 신규 2건만 Change Notes 를 갖는다. 손으로 표 행을 넣으려면 `Edit` 가 필요한데 금지 사항이라 하지 않았다. |

## 남은 흠 1건 (도구 아티팩트 · 검증 통과)

`append_section_note(mode:"replace")` 가 **여러 줄을 한 줄로 줄일 때 남는 줄을 빈 줄로 치환**하고 제거하지 않는다. 그 결과 빈 줄이 남았다:

- `docs/spec/12.audit-log.srs.md:255-257` (`OBS-AUDIT-004` Implementation Notes 뒤 — 빈 줄 2개 초과)
- `docs/spec/14.storage.srs.md:1442-1445` (`FR-STORAGE-009` Implementation Notes 뒤 — 빈 줄 3개 초과)

`validate_spec` errors 0 이고 `get_requirement` 의 `sectionLines` 파싱도 정상이다. 마크다운 렌더에도 영향 없다. **`Edit` 금지 + 타 담당자 동시 작업 중 stale 위험** 때문에 손대지 않았다. 전원 작업 종료 후 일괄 정리를 권한다.
