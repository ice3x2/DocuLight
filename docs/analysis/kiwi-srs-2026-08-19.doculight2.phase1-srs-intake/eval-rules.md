# 규약·품질 검증

검증 대상: `docs/spec/` 11개 scope SRS · 요구사항 블록 **256건** (파서 실측; 인덱스 §5·§6 합계와 일치).
규칙: `docs/rule/SRS-MD-Rules-v2.5.0.md` (§2.3 · §11 · §12 · §13 · §14 · §15 · §18 · §19 · §20 · §21 · §23 · §29).
검사 스크립트: `C:\Users\beom\AppData\Local\Temp\claude\C--Work-git-DocuLight2-0\4b34ab60-585f-4904-81c1-4e8f0bfebd94\scratchpad\check.mjs` (전건 파싱 · 위반 열거).

블록 분포 — ARCH 14 · EDITOR 13 · SHELL 20 · AUTH 28 · ACL 32 · CONFIRM 33 · AUDIT 30 · WORKSPACE 17 · STORAGE 26 · ATTACH 20 · PRINCIPAL 23 = 256.

---

## A 규약 전수 검사 결과

| 검사 | 대상 | 위반 | 비고 |
|---|---:|---:|---|
| A1 ID 형식 (§11.2 정규식) | 256 | **0** | 전건 `^(FR\|NFR\|IR\|DR\|SEC\|PERF\|REL\|OBS\|OPS\|MIG\|CON)-[A-Z0-9][A-Z0-9-]{1,24}-[0-9]{3,4}$` 만족 |
| A1 ID 중복 (§11.4-1) | 256 | **0** | 고유 ID 256개. `docs/spec` 내 다른 `.srs.md` 와도 충돌 없음 |
| A2 접두사 ↔ `Type` (§11.3 · §13-2) | 256 | **0** | prefix 집계와 Type 집계가 9종 전부 정확히 일치 |
| A3 scope 세그먼트 (§11.4-7) | 256 | **0** | 전건이 `00.index.md` §4 Scope Map 의 11 prefix 중 하나. 파일 선언 `Scope` 와 ID scope 불일치 0건 |
| A4 AC 형식 `- [ ] AC-{N}: ` (§21.1) | 1146 | **0** | AC 총 1146건 전건 형식 일치 |
| A4 AC 번호 연속성 (§21.2-2) | 256 | **0** | 전 블록 1부터 연속 |
| A4 AC 0건 블록 (§21.3-1) | 256 | **0** | 최소 1건 · 최대 12건 (분포: 1건×1, 2건×17, 3건×57, 4건×69, 5건×52, 6건×34, 7건×16, 8건×5, 9건×4, 12건×1) |
| A5 필수 메타 `Type`/`Target`/`Status` (§12.2) | 256 | **0** | 누락·빈값 0 |
| A5 메타 허용값 (§13 · §14.1 · §15) | 256 | **0** | `Status` planned 244 · blocked 12 / `Stability` stable 214 · evolving 30 · draft 12 / `Priority`·`Risk` 전건 허용값 / 미지 필드 0 |
| A5 필수 섹션 (§18.1) | 256 | **0** | `#### Requirement` · `#### Acceptance Criteria` 전건 존재·비어있지 않음. 섹션 중복 0 |
| A5 `implemented`/`verified` 증거 (§14.4) | 0 | **0** | 해당 status 0건 — 무발화 |
| A6 Trace Links 열 수 (§23.1) | 649 | **0** | 표 행 649건 전건 4열. `Type` 미허용값 0 · `Relation` 미허용값 0 · 자기참조 0 |
| A6 `Requirement` 참조 실재성 (§23.4-1) | 231 | **0** | 231건 전건이 실재 ID 를 가리킴. 죽은 참조 0. Trace 행 0개인 블록도 0 |
| A7 인덱스 §5 Status Summary | 6행 | **0** | planned 244 / blocked 12 / 나머지 0 — 실측과 일치 |
| A7 인덱스 §6 Type Summary | 9행 | **0** | constraint 31 · functional 94 · security 79 · operational 2 · data 19 · reliability 5 · interface 13 · migration 2 · observability 11 = 256 — 실측과 일치 |
| A7 인덱스 §2·§4 scope 등재 | 11 | **0** | 두 절 모두 11개 scope 전량 등재, prefix 동일 |

**A 계열 위반 0건.** `mcp__speckiwi__validate_spec(strict, failOnWarning)` 독립 확인 — `errors: 0`, `warnings: 2` (`SRS-W072` = 지시대로 기존 경고 제외, `SRS-W023` = `FR-SHELL-011` draft 가 활성 target `phase-1` 에 있다는 §15.3 규정대로의 경고이며 그 자체가 결함은 아니다).

파서가 `###` 헤딩 278개를 읽어 22개(`### In Scope` · `### Out of Scope`)를 요구사항 블록에서 제외했다 — §8.3 이 규정한 정상 구조이며 위반이 아니다.

---

## B 품질 발견

### [HIGH] 오프보딩 2단계에 대해 CONFIRM 과 PRINCIPAL 이 양립 불가능한 것을 단언한다
- **위치**: `docs/spec/11.confirmation-grades.srs.md:1876` · `:1886` — `FR-CONFIRM-023` ↔ `docs/spec/16.principal.srs.md:497` — `FR-PRINCIPAL-003`
- **인용**:
  - `FR-CONFIRM-023` 본문(11.…:1876): *"사용자 20명을 오프보딩하면 **앞 세 단계는 20회 개별 수행**하고 4 단계만 일괄 1회로 처리한다."*
  - `FR-CONFIRM-023` AC-3(11.…:1886): *"사용자 20명을 오프보딩하는 흐름에서 **1·2·3 단계의 확인은 사람당 각각 발생한다**."*
  - `FR-PRINCIPAL-003` AC-2(16.…:497): *"**PAT 무효화 단계는 별도 조작 없이** 계정이 `active` 가 아니게 된 결과로 **자동 수행된다**."*
- **무엇이 문제인가**: 2단계(PAT 무효화)는 `FR-PRINCIPAL-003` 에서 *조작이 아니다* — 1단계의 부수 결과다. 조작이 없으면 확인도 없고 "개별 수행" 도 없다. 그런데 `FR-CONFIRM-023` 은 2단계를 세어 확인이 사람당 발생한다고 단언한다. AC-3 을 테스트로 옮기는 사람은 2단계 확인을 찾다가 실패하고, 반대로 `FR-PRINCIPAL-003` AC-2 를 구현하면 AC-3 이 거짓이 된다. §20 Consistent 위반이고 두 AC 가 동시에 green 이 될 수 없다.
  결정적 증거는 `FR-CONFIRM-023` **자신의 Rationale**(11.…:1880)이다 — *"**1·3 단계**는 부분 실패 결과 조건(R73)에 걸려 부분 실패가 필연이다"* 로 1·3 만 조작으로 취급한다. 즉 근거는 2단계를 빼고 규범만 넣었다.
  두 블록 사이에 `Requirement` trace link 도 없다(`FR-CONFIRM-023` → `FR-CONFIRM-020`·`FR-CONFIRM-009` / `FR-PRINCIPAL-003` → `CON-PRINCIPAL-003`). §23.4 로 이 충돌이 그래프에 드러나지 않는다.
- **고치는 법**: `FR-CONFIRM-023` 의 본문과 AC-1·AC-3 에서 2단계를 빼고 `1·3 단계` 로 한정한다(Rationale 이 이미 그 범위다). AC-2 의 *"다건 회수 조작은 오프보딩 4 단계에만 제공된다"* 는 그대로 둔다. 두 블록에 `Requirement … related_to` 를 상호 추가해 오프보딩 단계 정본이 `FR-PRINCIPAL-003` 임을 명시한다. Change Notes 에 사유를 남긴다(§21.3-6).

### [HIGH] 같은 조작의 L3 배정이 CONFIRM 과 PRINCIPAL 두 곳에 복제됐고 정본 선언이 없다
- **위치**: `docs/spec/11.confirmation-grades.srs.md:437` (`FR-CONFIRM-006` 본문) · `:447` (AC-4) ↔ `docs/spec/16.principal.srs.md:1291` (`FR-PRINCIPAL-011` 본문) · `:1298` (AC-1)
- **인용**:
  - `FR-CONFIRM-006`: *"시스템은 다음 조작에 지정된 확인 등급을 적용한다 — … **기본 그룹을 주체로 하는 일괄 회수 L3**, …"* / AC-4: *"기본 그룹을 주체로 하는 일괄 회수는 타이핑 확인을 받는다."*
  - `FR-PRINCIPAL-011`: *"**`default` 그룹을 주체로 하는 일괄 회수는 L3 확인을 요구한다.** 슈퍼유저 그룹을 주체로 선택하면 …"* / AC-1: *"`default` 그룹을 주체로 한 일괄 회수는 실행 전에 L3 확인을 요구한다."*
- **무엇이 문제인가**: 같은 조작에 대한 같은 등급값이 두 scope 에 두 벌로 적혀 있다(§29.2-1·§29.2-3). 어느 쪽도 정본을 선언하지 않고, `Requirement` trace link 로 서로를 가리키지도 않는다(`FR-CONFIRM-006` → `FR-CONFIRM-002` 뿐, `FR-PRINCIPAL-011` → `FR-PRINCIPAL-010`·`SEC-PRINCIPAL-001` 뿐). 등급이 L3→L2 로 개정되면 한쪽만 고쳐지고 다른 쪽이 조용히 옛 값으로 남는다 — 비가역 파괴 조작의 타이핑 확인 유무가 갈린다.
  게다가 **같은 SRS 집합 안의 `CON-ARCH-008`(`docs/spec/02.product-architecture.srs.md:722`)이 이것을 금지한다** — *"같은 사실을 둘 이상의 자리에 적지 않는다. 같은 규칙이 여러 절에 필요하면 한 곳을 정본으로 두고 나머지는 그 정본을 참조한다"*, AC-2 *"참조하는 절은 정본이 어디인지를 명시한다"*. 즉 자기 규약 위반이다.
  주체 명칭도 갈렸다 — `기본 그룹`(CONFIRM) vs `` `default` 그룹``(PRINCIPAL). 같은 대상의 두 이름이 복제를 탐지 불가능하게 만든다(§20 Unambiguous).
  `FR-CONFIRM-003`(*"어떤 요구사항이 특정 조작의 확인 등급을 직접 지정하면 배정 기준으로 도출한 등급보다 그 직접 지정을 우선한다"*)이 scope 밖 등급 지정을 허용하지만, 그것은 **배정 기준(`FR-CONFIRM-002`)과 어긋나는 지정**을 다루는 규칙이지 **같은 값을 두 번 적는 것**을 허용하는 규칙이 아니다.
- **고치는 법**: `FR-PRINCIPAL-011` 본문·AC-1 에서 `L3` 값을 빼고 *"확인 등급은 확인 등급 배정표가 정한다"* 로 참조로 바꾼다 — 이 블록의 고유 규범(슈퍼유저 그룹 무효 안내, AC-2·AC-3)은 그대로 남는다. 양쪽에 `Requirement … related_to`(또는 `refines`)를 걸어 정본이 `FR-CONFIRM-006` 임을 명시한다. 주체 명칭을 `` `default` 그룹`` 한쪽으로 통일한다.

### [MEDIUM] `OBS-AUDIT-002` 는 §29.1-7 로 반드시 쪼개야 하는데 한 블록에 묶여 불변성 축까지 `blocked` 로 잠겼다
- **위치**: `docs/spec/12.audit-log.srs.md:102` (본문) · `:87` (블록 헤딩, `Status=blocked`)
- **인용**: 본문 — *"감사 로그의 행은 기록된 뒤 수정할 수 없고 삭제할 수 없다. 감사 로그의 보존 기간은 인스턴스 설정에서 지정한다. 보존 기간의 기본값, 휴지통 보존 기간(R86)과의 대소 관계, 값 0 의 의미는 원장이 정하지 않았으므로 그 축이 닫히기 전까지 이 요구사항은 진행할 수 없다."*
  Implementation Notes — *"**불변성 축 자체는 미결에 걸리지 않으므로 blocked 는 보존 기간 축에서만 발생한다.**"*
- **무엇이 문제인가**: 저작자 자신이 한 축은 진행 가능하고 다른 축만 막혔다고 적었다. §29.1-7(*"One part is implemented while another part is blocked"*)이 **쪼개라고 규정한** 바로 그 상태다. 지금 구조에서는 `Status=blocked` 가 블록 전체에 걸리므로, G27 과 무관한 불변성 규범(AC-1·AC-2)이 G27 이 닫힐 때까지 착수 대상에서 빠진다. 두 축은 검증 방법도 다르다(불변성 = 경로 부재 검사 / 보존 기간 = 설정 화면 동작) — §29.1-3 도 함께 걸린다.
  부수 문제: 본문 세 번째 문장은 *시스템 동작*이 아니라 *작업 상태 서술*("이 요구사항은 진행할 수 없다")이다. §19.1 의 문형에 어긋나고 Implementation Notes 와 같은 사실을 두 곳에 적는다(`CON-ARCH-008` 위반).
- **고치는 법**: 불변성(`OBS-AUDIT-002`, AC-1·AC-2 유지, `Status=planned`)과 보존 기간(새 ID, AC-3 이관, `Status=blocked` + G27 trace)으로 분리한다. §29.1 이 요구하는 분리이므로 새 ID 부여가 정당하다(§11.4-4). 본문에서 상태 서술 문장을 제거하고 blocked 사유는 Implementation Notes 한 곳에만 둔다.

### [MEDIUM] `FR-SHELL-006` 이 세 규범을 묶고, ACL 소유 규칙을 복제하면서 "복제하지 않는다"고 적었다
- **위치**: `docs/spec/08.app-shell.srs.md:553` (본문) · `:562` (AC-3) — `FR-SHELL-006`
- **인용**: 본문 — *"문서 딥링크(URL 라우팅)를 제공한다. URL 에는 경로가 아니라 노드 ID 를 사용하고, **권한 없는 노드에 대한 접근은 존재하지 않는 노드와 구별할 수 없는 404 로 응답한다.** 브라우저 뒤로·앞으로가 동작한다."*
  같은 블록 Implementation Notes — *"① 404 통일의 정본은 `ACL` scope 가 소유한다 … **이 요구가 그 규칙을 복제하지 않는다.**"*
- **무엇이 문제인가**: 두 가지다.
  (a) **§2.3 위반** — 세 개의 독립 규범이 한 블록에 있다: ① 딥링크 URL 이 노드 ID 를 쓴다 ② 권한 없는 노드는 구별 불가능한 404 ③ 브라우저 뒤로·앞으로가 동작한다. ①③ 은 라우팅 기능이고 ② 는 정보 은닉 보안 규범으로, 검증 방법과 소유 scope 가 다르다(§29.1-2·§29.1-3). `Type=functional` 한 값으로 ② 를 덮는 것도 §13-4 (기능 동작과 품질 기준이 함께 나오면 쪼갠다) 에 걸린다.
  (b) **선언과 문면의 모순** — Implementation Note 는 규칙을 복제하지 않는다고 단언하는데 본문과 AC-3 이 그 규칙을 그대로 복제한다. 반대편 `SEC-ACL-006`(`docs/spec/10.access-control.srs.md:615`)은 AC-6 에서 딥링크 표면까지 이미 덮는다 — *"딥링크로 권한 없는 노드를 열면 화면이 존재하지 않는 노드와 같은 404 를 보여준다."* 두 벌이다.
  게다가 `FR-SHELL-006` 의 Trace Links 에는 `Requirement` 행이 하나도 없다(원장 Doc 링크 2건뿐). "ACL scope 가 소유한다"는 소유권 주장이 그래프상 추적 불가능하다 — §2.6·§23.4 와 `CON-ARCH-008` AC-2 위반.
- **고치는 법**: 본문에서 404 문장을, AC 에서 AC-3 을 제거하고 `Requirement | SEC-ACL-006 | depends_on` 을 추가한다(딥링크 표면 커버리지는 `SEC-ACL-006` AC-6 에 이미 있다). 브라우저 뒤로·앞으로(AC-5)는 별도 요구로 분리할지 판정한다.

### [MEDIUM] `FR-ATTACH-011` 이 `PrincipalPicker` 규범과 구체값을 복제하고, 같은 블록이 그것을 금지한다
- **위치**: `docs/spec/15.attachments.srs.md:1040` (본문) · `:1048`–`:1050` (AC-2·AC-3·AC-4) — `FR-ATTACH-011`
- **인용**: 본문 — *"… 자체 검색 UI 를 만들지 않고 **단일 공용 컴포넌트 `PrincipalPicker` 로 구현한다**."* / AC-3 *"질의 길이가 2자 미만이면 결과를 조회하지 않는다."* / AC-4 *"자동완성 결과는 20건을 넘지 않는다."*
  정본 — `CON-PRINCIPAL-006`(`docs/spec/16.principal.srs.md:1062`): *"주체를 선택하는 모든 화면은 단일 공용 컴포넌트 `PrincipalPicker` 로 구현한다."* AC-3 *"… 최소 질의 길이·결과 상한은 `PrincipalPicker` 안에 정의된다."*
  같은 `FR-ATTACH-011` 의 Implementation Notes — *"AC-3·AC-4 의 2자·20건은 원장 R112-b 의 실제 값이지 이 요구가 정한 값이 아니다 — R112-e 가 그 값을 컴포넌트에 내장하므로 **댓글 쪽에서 다시 정의하지 마라.**"*
- **무엇이 문제인가**: Implementation Note 가 "다시 정의하지 마라" 라고 적은 값을 AC-3·AC-4 가 다시 정의한다. `CON-PRINCIPAL-006` 이 이미 *"주체를 고르는 모든 화면"* 을 덮으므로 멘션 자동완성은 그 규범에 자동으로 포함되고, 2자·20건은 `SEC-PRINCIPAL-003` 이 소유한다. §29.2-3 (단순 반복) 이며 `CON-ARCH-008` 위반이다. Trace Links 가 Doc(`R112-b`·`R112-e`)만 가리키고 `CON-PRINCIPAL-006`·`SEC-PRINCIPAL-003` 요구사항 ID 를 가리키지 않아 정본 관계가 그래프에 없다.
- **고치는 법**: 본문에서 컴포넌트 문장을, AC 에서 AC-3·AC-4 를 제거하고 `Requirement | CON-PRINCIPAL-006 | depends_on` · `Requirement | SEC-PRINCIPAL-003 | depends_on` 를 추가한다. 이 블록 고유 규범(AC-1 — `@` 로 자동완성이 열린다)만 남긴다. AC-2 는 정본 참조로 대체한다.

### [MEDIUM] `SEC-WORKSPACE-004` 의 AC-11·AC-12 는 시스템 명제가 아니라 테스트 작성 지시다
- **위치**: `docs/spec/13.workspace.srs.md:404` (AC-11) · `:405` (AC-12) — `SEC-WORKSPACE-004`, `Verification Method=Playwright E2E`
- **인용**:
  - AC-11: *"수용 기준 판정 E2E 는 판정 시점의 이 조항 열거를 읽어 표면마다 단언을 만들고, Phase 1 에 존재하지 않는 표면(그래프뷰 — R17 로 Phase 2)은 제외 사유와 함께 명시한다."*
  - AC-12: *"집계형 표면(태그)에 대해서는 목록 미노출과 수치 미가산을 각각 단언한다."*
- **무엇이 문제인가**: 둘 다 주어가 시스템이 아니라 **테스트 저자**다. "단언을 만든다" · "제외 사유와 함께 명시한다" 는 시스템 동작의 참·거짓이 아니라 산출물 작성 방식이므로 §21.3-3(조건·입력·기대 결과)을 만족하지 못하고 결정 가능한 명제가 아니다. AC-11 은 기대 결과가 둘이다(표면별 단언 생성 + 제외 사유 명시) — §21.3-2 위반. AC-12 는 AC-4(*"… 태그는 표시되지 않는다"*)와 AC-5(*"… 집계에 가산되지 않는다"*)를 그대로 되풀이해 §29.2-3 이다.
  블록 자체도 AC 12건으로 전 256건 중 최다이며 §29.1-5(*"A single AC list becomes too long"*) 에 걸린다. 특히 AC-9(`docs/spec/13.workspace.srs.md:402`)·AC-10(`:403`) — *"권한 없는 문서명을 수동으로 타이핑해 위키링크를 작성하는 것은 차단되지 않는다"* · *"그렇게 작성된 링크는 깨진 링크로 렌더된다"* — 는 필터링이 아니라 **입력을 막지 않는다는 반대 방향 규범**이라 별개 요구다.
- **고치는 법**: AC-11·AC-12 를 삭제하고, AC-11 이 담으려던 내용(열거를 읽어 표면별로 단언 · Phase 1 미존재 표면 제외)은 Implementation Notes 로 옮긴다 — 검증 방법에 대한 지시는 §25 의 자리다. AC-9·AC-10 은 별도 요구로 분리한다. 삭제 사유를 Change Notes 에 남긴다(§21.3-6).

### [MEDIUM] `OBS-AUDIT-004` AC-4 는 판정 가능한 명제가 아니다
- **위치**: `docs/spec/12.audit-log.srs.md:227` — `OBS-AUDIT-004`, `Verification Method=test`
- **인용**: *"AC-4: 제외된 조작마다 그 재현처가 무엇이며 그곳이 행위자와 시각을 모두 보이는지가 **판정된다**."*
- **무엇이 문제인가**: "판정된다" 는 시스템 동작이 아니라 절차 수행이다. 누가 언제 판정하면 만족되는지, 판정 결과가 어디에 남아야 하는지가 없어 pass/fail 을 결정할 수 없다 — `Verification Method=test` 인데 자동 테스트로 옮길 수 없다. 게다가 기대 결과가 둘이다(재현처 식별 + 행위자·시각 노출 확인) — §21.3-2·§21.3-3 위반.
  같은 블록의 AC-1·AC-2·AC-3 은 전부 결정 가능하므로 AC-4 만의 문제다.
- **고치는 법**: 시스템 명제로 다시 쓴다 — 예: *"AC-4: 기록에서 제외된 각 조작에 대해 그 재현처와 그 재현처가 행위자·시각을 보이는지가 이 요구사항의 Implementation Notes 에 기재되어 있다"* (= 검토로 검증) 로 바꾸고 `Verification Method` 를 `review` 로 조정하거나, AC-4 를 삭제하고 Implementation Notes 로 옮긴다.

### [LOW] AC 하나에 독립적인 기대 결과가 둘인 자리
- **위치·인용**:
  - `docs/spec/14.storage.srs.md:522` — `FR-STORAGE-001` AC-3: *"Ctrl+S 를 누르면 디바운스를 기다리지 않고 즉시 저장되며 **버전 스냅샷이 강제로 생성된다**."*
  - `docs/spec/12.audit-log.srs.md:288` — `OBS-AUDIT-005` AC-8: *"워크스페이스 생성이 감사 행을 남기고, **그 폼 안의 관리자 지정과 default 초기 권한 부여도 함께 기록된다**."*
  - `docs/spec/11.confirmation-grades.srs.md:452` — `FR-CONFIRM-006` AC-9: *"Phase 1 에는 휴지통 일괄 영구 삭제 조작이 존재하지 않으며, **그 L3 배정은 조작을 도입할 때 발효한다**."*
- **무엇이 문제인가**: §21.3-2 (*"One AC expresses only one expected result"*). 세 자리 모두 한쪽이 참이고 다른 쪽이 거짓일 수 있어 체크박스 하나로 상태를 표현할 수 없다. `FR-CONFIRM-006` AC-9 의 후단은 Phase 1 에서 검증 자체가 불가능하다(도입 시점 조건부).
- **고치는 법**: 각각 AC 두 건으로 쪼갠다. `FR-CONFIRM-006` AC-9 후단은 `CON-CONFIRM-001`(`docs/spec/11.confirmation-grades.srs.md:1645`)이 이미 조건부 규범을 소유하므로 그쪽 참조로 대체한다.
  (참고 — 이 축을 전수 정규식으로 훑어 20건을 검사했고, 나머지 17건은 *"X 하며 Y 하지 않는다"* 형태의 **한 명제를 양방향으로 못박은 것**이라 결함이 아니다. 예: `docs/spec/13.workspace.srs.md:400` AC-7, `docs/spec/14.storage.srs.md:109` AC-1.)

### [LOW] `FR-AUTH-004` 가 정책 모델과 설정 표면·영속화를 한 블록에 묶었다
- **위치**: `docs/spec/09.auth.srs.md:516` (본문) · `:527` (AC-5) — `FR-AUTH-004`
- **인용**: 본문 — *"시스템은 가입 모드 3종 … 을 지원하고, 인스턴스는 그중 하나를 활성 모드로 갖는다. **가입 모드는 설정 모달의 인스턴스 구역(슈퍼유저 전용)에서 설정하며 값은 DB 에 저장한다.**"*
- **무엇이 문제인가**: ① 가입 모드 3종의 정책 모델 ② 그 설정의 소재·권한·영속화 — 시스템 경계가 다르다(§29.1-2). AC-1 이 ① 이고 AC-2·AC-3·AC-4 가 ② 다. 또 AC-5(*"`가입 요청 + 슈퍼유저 승인` 모드에서 신청한 계정은 승인 전까지 `pending` 이며 로그인이 차단된다"*)의 후단은 `SEC-AUTH-003`(`docs/spec/09.auth.srs.md:166`) AC-2 가 소유한 규범의 반복이다.
- **왜 LOW 인가**: `Requirement | SEC-AUTH-003 | depends_on` trace link 가 이미 있어 정본 관계가 그래프에 드러나 있고, 세 하위 요구(`IR-AUTH-001`·`FR-AUTH-003`·`SEC-AUTH-003`)로 축이 이미 갈려 있다. 위의 HIGH 두 건과 달리 소유권이 추적 가능하다.
- **고치는 법**: 설정 표면·영속화 축을 별도 요구로 분리할지 판정한다. AC-5 는 `pending` 상태 배정만 남기고 로그인 차단은 `SEC-AUTH-003` 참조로 대체한다.

### [LOW] `SEC-AUTH-018` Implementation Notes 의 열거 번호가 ①②④ 로 ③ 을 건너뛴다
- **위치**: `docs/spec/09.auth.srs.md:1615` — `SEC-AUTH-018`
- **인용**: *"… ① 비밀번호 변경이 그 계정의 PAT 를 무효화하는가 … ② 다른 기기의 세션을 끊는가 … **④** 현재 비밀번호 재입력을 요구하는가."*
- **무엇이 문제인가**: ③ 이 없다. 인덱스 §9 의 `G33` 항목은 세 축(PAT 무효화 · 다른 기기 세션 · 로그아웃의 서버 측 무효화)을 열거하고 `SEC-AUTH-019`(`docs/spec/09.auth.srs.md:1645` Impl Notes)는 *"`G33` ③ 미결"* 로 ③ 을 로그아웃 축에 배정한다. 즉 여기서 ③ 은 이 블록 소관이 아니라서 건너뛴 것으로 보이지만, 표기가 그 사실을 말하지 않아 읽는 사람이 누락으로 읽는다.
- **고치는 법**: ④ 를 ③ 으로 고치고 `G33` 의 로그아웃 축은 `SEC-AUTH-019` 소관임을 한 문장으로 밝힌다. 규범에는 영향이 없다.

### [LOW] `FR-PRINCIPAL-005` 가 등급 이름 없이 확인 절차를 직접 지정한다
- **위치**: `docs/spec/16.principal.srs.md:663` (본문) · `:671` (AC-2) — `FR-PRINCIPAL-005`
- **인용**: *"워크스페이스의 마지막 `관리` 권한자를 제거하는 조작은 차단하지 않는다. 실행 전에 **확인 다이얼로그**로 그 사실을 경고한 뒤 요청자가 확인하면 진행한다."*
- **무엇이 문제인가**: `FR-CONFIRM-001`(`docs/spec/11.confirmation-grades.srs.md:47`)이 *"시스템은 조작의 확인 절차를 L1·L2·L3 세 등급 하나의 체계로 통일한다"* 고 선언했는데, 이 블록은 등급을 대지 않고 절차(`확인 다이얼로그` = L2 의 절차)를 직접 적는다. 이 조작은 `FR-CONFIRM-006` 배정표 9항목에도 없다. 절차만 적으면 배정표를 훑어도 이 조작이 잡히지 않는다.
- **왜 LOW 인가**: `FR-CONFIRM-002`(가역성·즉시성 2축 도출)가 등급을 도출할 수 있고 `FR-CONFIRM-003` 이 직접 지정을 열린 목록으로 허용하므로 규범 구멍은 아니다. 표기 일관성 문제다.
- **고치는 법**: 본문·AC-2 에 `L2` 를 명시하고 `Requirement | FR-CONFIRM-003 | depends_on` 을 추가한다.

---

## 검사했으나 문제 없던 축

- **B9 모호 어휘 — 전수 정규식**. AC 1146건 전건과 본문 256건 전건을 §19.4 목록(`적절`·`충분`·`빠르게`·`일관`·`사용자 친화`·`원활`·`최대한`·`가급적`·`필요시`·`appropriate`·`fast`·`seamless`·`sufficient`·`proper`·`quickly`·`user-friendly`·`robust`·`scalable` 등 30여 패턴)으로 훑었다. **AC 히트 4건은 전부 오탐** — `나중에` 가 전건 시간 순서를 뜻한다(예: `docs/spec/07.editor.srs.md:714` *"나중에 저장하는 세션"*, `docs/spec/09.auth.srs.md:1000` *"나중에 추가된 것이라도"*). 규칙 §19.4 자신이 *"'merge later' names a sequence"* 로 이 용법을 제외한다. **본문 히트 1건**은 `docs/spec/14.storage.srs.md:216` `SEC-STORAGE-001` *"UUIDv4 등 충분한 엔트로피"* 인데 바로 뒤 문장이 *"순차 정수를 노드 ID 로 쓰지 않는다"* 로 판정 기준을 못박고 AC 가 UUIDv4 를 지정하므로 §19.4 말미의 예외(*"make the criterion concrete in the Acceptance Criteria"*)를 충족한다 — 결함 아님.
- **B10 statement ↔ AC 모순**. 부정 표현이 든 본문 문장과 긍정 AC 를 어휘 겹침으로 대조해 후보 6건을 뽑아 전건 정독했다. 모두 AC 가 본문을 충실히 옮긴 것이다(예: `docs/spec/15.attachments.srs.md` `SEC-ATTACH-001` 은 본문의 거부 규범에 대해 AC-1 이 허용 케이스·AC-2 가 거부 케이스를 나눠 단언한 정상 쌍).
- **B11 AC 간 모순**. 같은 블록의 AC 쌍을 어휘 겹침 ≥0.42 + 극성 반전으로 훑어 후보 4건을 정독했다. 전부 **의도된 대칭 쌍**이다 — `SEC-ARCH-003`(권한 있음 → 실행 / 권한 없음 → 거부), `SEC-SHELL-001`(버튼 노출/미노출), `SEC-ATTACH-002`, `FR-SHELL-012`. 동시 만족 불가능한 쌍은 위 HIGH 1건(오프보딩 2단계) **외에 없다**.
- **B12 Status ↔ Stability 정합**. `Status=blocked` 12건 전건이 Implementation Notes 에 막힌 축을 명시하고 `Doc … related_to` 로 해당 `G{n}` 미결을 가리킨다(G8·G10·G27·G28·G31·G33·G34·G35). `Stability=draft` 12건 전건도 사유가 있다 — 11건은 `Target=phase-2`(`R92` 열린 목록), 1건(`FR-SHELL-011`, `docs/spec/08.app-shell.srs.md:998`)은 *"원장 문면에 〔판단 — 원장 근거 없음〕 마커가 붙어 있다"* 를 명시한다. 사유 없는 `blocked`·`draft` **0건**.
- **B13 경계 주제 중복 — 나머지 세 경계는 깨끗하다**.
  - **감사 스코프(AUDIT ↔ ACL)**: `OBS-ACL-001`(`docs/spec/10.access-control.srs.md:775`)이 기록 *대상*만 정하고 Implementation Notes 로 *"감사 로그의 스키마·행위자 값·보존 기간은 감사 로그 scope 가 소유한다"* 를 밝히며 AC-2 로 별도 저장소 금지를 단언한다. 분리 근거로 §29.1-3 을 명시 인용했다.
  - **첨부 권한(ATTACH ↔ ACL/STORAGE)**: `SEC-ATTACH-002`(판정 기준) / `SEC-ATTACH-003`(집행 시점) / `SEC-STORAGE-004`(닷파일 은닉의 예외 등재)가 각각 *"무엇을 판정하는가는 R66 이 소유한다 — 이 요구는 언제 판정하는가만 정한다"* · *"첨부 다운로드의 권한 판정 자체는 ATTACH scope 가 소유한다 — 이 요구는 그 엔드포인트가 예외라는 사실만 정한다"* 로 소유 경계를 적고 `Requirement` trace link 로 서로를 가리킨다.
  - **완전 숨김(ACL ↔ CONFIRM ↔ WORKSPACE)**: 본문에서 `완전 숨김` 을 규정하는 블록이 `SEC-ACL-005`(`docs/spec/10.access-control.srs.md:498`) **한 곳뿐**이고 CONFIRM·WORKSPACE 는 그 규범을 복제하지 않는다. `SEC-CONFIRM-001`·`SEC-WORKSPACE-004` 는 각자 다른 표면(확인 흐름 / 링크·검색 결과)에 대한 별개 규범이다.
  - 교차 파일 유사도 전수 스캔(Jaccard, 본문+제목)에서 **0.30 이상 쌍 0건**, 0.20 이상 4건이었고 그 4건을 정독해 위 HIGH·MEDIUM 으로 처분했다. 나머지 2건(`SEC-AUTH-017` ↔ `FR-PRINCIPAL-007` 의 default 그룹 초기 권한 기본값 `편집` vs `없음`)은 **모순이 아니다** — 전자는 설치 마법사·기본 워크스페이스, 후자는 통상 생성 폼이고 `SEC-AUTH-017` Impl Notes 가 *"이 `편집` 기본값은 부트스트랩 순간의 예외다 … 이 조항을 답습하지 않는다"* 로 경계를 못박았다.
- **§29.1-5 AC 과다**. AC 9건 이상 5건을 전건 정독했다. `SEC-WORKSPACE-004`(12건) 외 4건은 **템플릿 반복이라 정당하다** — `FR-EDITOR-007`(9건: 라이브 프리뷰 9요소를 요소별 1건), `FR-CONFIRM-006`(9건: 배정표 9조작을 조작별 1건), `OBS-AUDIT-005`(9건: 기록 대상 조작별 1건), `DR-AUDIT-001`(9건: 예약 주체 금지 3종 + 파생 6건). 쪼개면 오히려 배정표 정본이 흩어진다.
- **정독 범위**. 총 **43개 블록**을 전문 정독했다 — `blocked`·`draft` 18건 전량 + 표적 25건(`FR-SHELL-006`·`SEC-ACL-006`·`FR-ATTACH-011`·`CON-PRINCIPAL-006`·`FR-AUTH-004`·`SEC-AUTH-003`·`SEC-AUTH-017`·`FR-PRINCIPAL-003`·`FR-PRINCIPAL-005`·`FR-PRINCIPAL-007`·`FR-PRINCIPAL-011`·`SEC-WORKSPACE-004`·`CON-ARCH-008`·`FR-CONFIRM-001`·`FR-CONFIRM-002`·`FR-CONFIRM-006`·`FR-CONFIRM-009`·`FR-CONFIRM-023`·`OBS-AUDIT-004`·`OBS-AUDIT-005`·`OBS-ACL-001`·`DR-AUDIT-001`·`FR-STORAGE-001`·`SEC-STORAGE-004`·`SEC-ATTACH-002`·`SEC-ATTACH-003`).
- **보고하지 않은 것**. `Priority`/`Risk` 의 `medium` 은 지시대로 결함으로 세지 않았다 — 다수 블록이 Implementation Notes 에 *"우선순위는 원장이 배정한 바 없다 — 표의 medium 은 도구 기본값이다"* 를 명시해 저작자 판단이 아님을 밝힌다. `SRS-W072`(`02.feature-request-live-preview.md` 번호 중복)도 지시대로 제외했다.
