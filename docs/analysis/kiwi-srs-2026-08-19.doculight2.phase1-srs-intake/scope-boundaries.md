# scope 경계 저작 — §1·§2·§3 작성 근거

대상 11개 파일의 `## 1. Scope Overview` · `## 2. Scope Boundaries` · `## 3. Assumptions and Constraints` 를 Edit 로 교체했다.
`## 4. Requirements` 이후와 파일 상단 메타표는 한 줄도 건드리지 않았다 (git hunk 헤더가 11·17·21·25 네 자리에만 있음).

`mcp__speckiwi__validate_spec` 1회: **errors 0** / warnings 2 (`SRS-W072` 문서 번호 중복 · `SRS-W023` FR-SHELL-011 draft) — 둘 다 기존.

**`- None` 은 11개 어디에도 남기지 않았다**(`grep -c "^- None$"` 전 파일 0). In Scope 합계 **103건** · Out of Scope 합계 **124건**.

| 파일 | In | Out |
|---|---|---|
| `02.product-architecture` (ARCH) | 7 | 7 |
| `07.editor` (EDITOR) | 6 | 9 |
| `08.app-shell` (SHELL) | 11 | 12 |
| `09.auth` (AUTH) | 11 | 11 |
| `16.principal` (PRINCIPAL) | 11 | 9 |
| `10.access-control` (ACL) | 10 | 15 |
| `11.confirmation-grades` (CONFIRM) | 11 | 12 |
| `12.audit-log` (AUDIT) | 10 | 12 |
| `13.workspace` (WORKSPACE) | 9 | 11 |
| `14.storage` (STORAGE) | 10 | 14 |
| `15.attachments` (ATTACH) | 7 | 12 |

교차검증 자료: `docs/analysis/kiwi-srs-2026-08-19.doculight2.phase1-srs-intake/scope_assignment.json` (조항→scope 배정 258건). 이 파일로 두 곳의 오배정을 잡았다 (§끝 「판단이 갈렸던 자리」 참조).

---

## 공통 방침

1. **Out of Scope 항목은 「재진술」이 아니라 「포인터」로 썼다.** 원장 조항의 내용을 다시 적으면 `R124`(한 사실은 한 곳에)를 §2 에서 스스로 어긴다. 그래서 각 항목은 *무엇이 여기 없는가 + 어느 scope 가 갖는가 + (가능하면) 어느 Implementation Note 에서 왔는가* 만 담는다.
2. **공통 전제는 `ARCH` 가 소유하고 나머지는 가리킨다.** 다만 원장 조항의 실제 소유 scope 가 갈리므로 기계적으로 ARCH 로 몰지 않았다 —
   - `R19` 규모 · `R33` 계열 스택 · `R92` Phase 라벨 · `R124` 한 사실 한 곳 → `ARCH`
   - `R31` 데스크탑 전용 → `EDITOR`
   - `R4` 파일시스템 SSOT · `R20` SQLite → `STORAGE`
   각 문서는 자기 규정에 **실제로 영향을 주는 전제만** §3 에 넣고 소유 scope 를 명시했다.
3. **깊이를 균등하게 쓰지 않았다.** Out of Scope 항목 수는 실제 위임 수에 맞췄다 — `ACL` 15건 ↔ `EDITOR` 9건 ↔ `ARCH` 7건.

---

## 파일별 — §2 Out of Scope 항목과 근거

### `docs/spec/02.product-architecture.srs.md` (ARCH, 14 요구) — Out of Scope 7건

| 항목 | 근거 |
|---|---|
| PAT 의 발급·저장·스코프·무효화 → `AUTH` | `SEC-ARCH-001` Impl Note: *"PAT 규정은 인증 scope 가 소유한다"* |
| 완전 숨김 규칙의 정본 / 거부 응답이 존재를 드러내도 되는가 → `ACL` | `SEC-ARCH-002` Note(AC-4 자리) · `SEC-ARCH-003` Note 각 1문장 |
| 유효 권한의 정의와 계산 → `ACL` | 위 두 Note 에서 파생 (SEC-ARCH-002/003 이 그 값을 **쓰는** 쪽) |
| 벡터 인덱스 갱신 시점·삭제 노드 엔트리 배제 → `STORAGE` | `SEC-STORAGE-007` 이 그 축을 소유. ARCH 는 *결과*의 필터링만 |
| 플러그인 시스템 제외(`R15`) → `EDITOR` | scope_assignment.json: `R15 → EDITOR` (`CON-EDITOR-001`) |
| 멀티테넌트 SaaS · 고객사 온프레미스 배제(`R19`) | **이 scope 안의 `CON-ARCH-001` 이 이미 문면으로 담음** → 중복 방지를 위해 "여기서 다시 열거하지 않는다" 로 포인터 처리 |
| 성능 목표(응답 시간·처리량) | `CON-ARCH-001` Impl Note: *"이 조항은 성능 수치를 정하지 않는다 … 필요하면 별도 조항으로"* — **어느 scope 도 소유하지 않음**을 명시 |

### `docs/spec/07.editor.srs.md` (EDITOR, 13 요구) — Out of Scope 9건

| 항목 | 근거 |
|---|---|
| 링크 계열 4항목의 화면·권한 필터 → `WORKSPACE`(필터·인덱싱) / `SHELL`(백링크·아웃고잉·태그 탭) | `CON-EDITOR-002` Note + `FR-STORAGE-009` Note(*"EDITOR scope 는 R16 의 Phase 범위 선언만 갖는다"*) |
| 위키링크 해석 규칙·삽입 형식 → `STORAGE` | `FR-STORAGE-009` Note |
| 자동 저장 트리거·디바운스·충돌 판정 근거·중단/재개·**저장 거부 판정 자체** → `STORAGE` | `FR-EDITOR-005` Note ⑤ · `FR-EDITOR-008` Note ① |
| 문서 탭 거동(활성 탭 자동 교체·이탈 처리·분할 창 시 창별 귀속) → `SHELL` | `FR-EDITOR-005` Note ③ · `FR-EDITOR-008` Note ④ · `CON-EDITOR-003` Note ① |
| 비-md 본문 표시 형태 → `ATTACH` | `FR-EDITOR-006` Note ① |
| 편집 유효 권한의 정의·계산 → `ACL` | `FR-EDITOR-004` Note ②(*"이 화면 규칙을 권한 강제의 수단으로 삼아서는 안 된다"*) |
| Phase 2 가 열린 목록이라는 판정 규칙 → `ARCH` | `CON-EDITOR-003` Note(*"Phase 2 열거는 열린 목록이며 그 규칙은 아키텍처 scope 가 소유한다"*) |
| Target Map 의 `phase-1` 기술 → `00.index.md` | `CON-EDITOR-004` Note(*"Target Map 은 원장이 아니라 인덱스 문서가 소유한다"*) |
| **R15·R17·R31 은 위임 없음** | 셋 다 이 scope 가 직접 소유 → `- None` 대신 "In Scope 에 있다" 로 명시 |

### `docs/spec/08.app-shell.srs.md` (SHELL, 22 요구) — Out of Scope 12건

| 항목 | 근거 |
|---|---|
| 인증 전 화면(로그인·가입 폼·설치 마법사) → `AUTH` | `IR-SHELL-001` Note ① · `CON-SHELL-001` Note ① — 구조적 이유(기어가 셸에 속함)까지 옮김 |
| 각 설정 카테고리의 **내부** 화면 → `STORAGE`/`ACL`/`AUDIT`/`PRINCIPAL` | `IR-SHELL-002` Note ④ 가 넷을 열거(휴지통 목록·권한 감사 3종·감사 로그·인스턴스 설정). 사용자·그룹 관리는 `CON-SHELL-001` Note ② 로 확인 |
| 컨텍스트 메뉴 활성 판정 근거(권한 표 · 숨은 하위 게이트) → `ACL` | `FR-SHELL-003` Note ①② |
| 트리 **내용** 규칙(비-md 표시 / 워크스페이스 나란히) → `ATTACH` / `WORKSPACE` | `FR-SHELL-001` Note(*"두 규칙 모두 다른 scope 소유"*) |
| 휴지통 열람 범위·영구 삭제 필요 권한·자동 영구 삭제 → `STORAGE` | `FR-SHELL-007` Note ②③ · `SEC-SHELL-001` Note |
| 404 통일 규칙 → `ACL`(`SEC-ACL-006`) | `FR-SHELL-006` 요구 문면 + Note ① (문면이 직접 `SEC-ACL-006` 을 지목) |
| 노드 ID 가 추측 불가여야 한다는 규정 → `STORAGE` | `FR-SHELL-006` Note ② (딥링크가 그 성질에 **의존**) |
| 버전 생성 단위·상한 → `STORAGE` | `FR-SHELL-008` Note ③ |
| 새 버전 올리기의 확인 등급 → `CONFIRM` | `FR-CONFIRM-010` 제목이 그 규칙을 소유 |
| 태그 집계 원천의 표시 필터 → `WORKSPACE` | `SEC-WORKSPACE-004`(R80). `FR-SHELL-009` 는 그 필터를 **적용한다는 계약**만 |
| 휴지통 일괄 영구 삭제 미도입(`R142`) → `CONFIRM` | scope_assignment.json: `R142 → CONFIRM` (`CON-CONFIRM-001`) |
| 요청 버튼 미배치(`R103-a`) → `ACL` | `R103-a` 문면이 *"딥링크 404(R94·R99)"* 를 직접 지목 |

### `docs/spec/09.auth.srs.md` (AUTH, 27 요구) — Out of Scope 11건

| 항목 | 근거 |
|---|---|
| 인증 후 화면 골격(설정 모달 구조·사용자 관리 자리) → `SHELL` | `IR-AUTH-001` Note + `FR-AUTH-003` Note(*"인증 후 관리 기능이라 R24 가 정면 적용"*) |
| 사용자·그룹 관리 화면 자체·계정 수명주기·`R101` → `PRINCIPAL` | scope_assignment.json: `R101 → PRINCIPAL`(`CON-PRINCIPAL-003`) |
| 유효 권한 정의·계산 → `ACL` | `SEC-AUTH-008` 이 교집합의 한쪽 항으로 받아 쓸 뿐 |
| 완전 숨김 규칙 → `ACL` | `FR-AUTH-005`(0개 노드 화면)의 전제 조건 |
| 권한 요청 워크플로 Phase 2(`R103`) → `ACL` | `R103` 문면 *"Phase 1 은 안내 문구만 둔다"* 가 `FR-AUTH-005` 안내 화면의 근거 |
| 워크스페이스·기본 워크스페이스 생성 → `WORKSPACE` | scope_assignment.json: `R56 → WORKSPACE` |
| 설치 마법사 부여의 확인 등급 → `CONFIRM` | `FR-CONFIRM-019` Note: *"설치 마법사 자체의 토큰·차단 규칙은 AUTH scope 가 소유한다"* (역방향 진술) |
| 인증·계정 상태 변경의 감사 형식 → `AUDIT` | `OBS-AUDIT-003` 기준 ② |
| 인스턴스 설정 저장소 → `SHELL` | `R96`(`DR-SHELL-001`). AUTH 는 가입 모드가 그 저장소에 든다는 사실만 |
| 비밀번호 길이·복잡도 규칙 | `SEC-AUTH-018` Note: *"`04`-Q21 로 이미 열려 있는 별개 축"* — **소유자 없음** 명시 |
| 세션 만료 후 원래 URL 복귀 동선 | `IR-AUTH-001` Note: *"`03` §11-34 의 〔판단〕 상태"* — **소유자 없음** 명시 |

### `docs/spec/16.principal.srs.md` (PRINCIPAL, 22 요구) — Out of Scope 9건

| 항목 | 근거 |
|---|---|
| ACL 판정 규칙 전반 / 워크스페이스 `관리` 레벨의 성질 → `ACL` | `CON-PRINCIPAL-001` Note ②(*"워크스페이스 `관리` 레벨은 이 조항이 금지한 등급이 아니다"*) |
| 일괄 회수 **화면 자체** → `ACL` | `FR-ACL-003` Note 가 역으로 *"시스템 그룹을 대상에 포함하는지 … 는 주체 scope 가 소유"* 라고 적음 → 화면은 ACL, 대상 포함 여부는 PRINCIPAL |
| 확인 등급의 **배정 규칙** → `CONFIRM` | `FR-PRINCIPAL-002` Note ① · `FR-PRINCIPAL-007` Note ② · `FR-PRINCIPAL-011` 본문(*"여기서 다시 정의하지 않는다"*) |
| 계정 상태 게이트·로그인 문구·PAT 무효화 → `AUTH` | `CON-PRINCIPAL-003` Note ①(R58-d 사문화를 지적하되 처분은 넘김) |
| 워크스페이스 생성·삭제·아카이브와 폼 자체 → `WORKSPACE` | `FR-PRINCIPAL-007` 이 폼 안의 한 값만 소유 |
| 사용자·그룹 관리 화면의 자리 → `SHELL` | `IR-SHELL-002` 카테고리 조항 |
| 그룹 삭제·일괄 회수의 감사 형식·다건 입도 → `AUDIT` | `FR-ACL-003` Note 가 *"회수 다건의 감사 입도 → 감사 로그 scope"* |
| 거부 규칙 미도입(`R14-c`) → `ACL` | `R14-c` 문면: *"계정 정지는 ACL 이 아니라 principal 레벨 비활성화 게이트로 별도 처리"* — 두 축을 가른 조항이므로 경계로 기재 |
| 사용자 스키마(`G10`) | `SEC-PRINCIPAL-002` Note ② — **소유자 없음** 명시 |

### `docs/spec/10.access-control.srs.md` (ACL, 33 요구) — Out of Scope 15건

가장 위임이 많다. 근거는 대부분 각 요구의 Implementation Notes 마지막 문단(`10.access-control.srs.md` 245·358·648·705·765·825·889·1064·1180·1241·1302·1419·1477·1598·1717·1774행).

| 항목 | 근거 행 |
|---|---|
| 부여·회수·이동·복사·상속 끊기의 **확인 등급과 타이핑 토큰** → `CONFIRM` | 889·1064·1180·1241·1419·1477·1598·1717 (8개 요구가 각각 진술) |
| 부모 권한 가져오기(`R135`) → `CONFIRM` | 245·889 (*"그 조항은 이 scope 의 배정 밖이다"*) |
| 인원 수 시점 표기 금지 / 적용 하위 노드 수 지표 → `CONFIRM` | 1302 |
| 주체 다건 일괄 회수 허용 여부 → `CONFIRM`, 시스템 그룹 포함·오프보딩 진입 → `PRINCIPAL`, 회수 다건 감사 입도 → `AUDIT` | 1477 (한 문장이 세 scope 로 갈림 — 그대로 분해해 옮김) |
| 주체 검색 구체 규칙·`PrincipalPicker` → `PRINCIPAL` | 1774 |
| 감사 스키마·행위자·보존 / 경계 넘는 복사 감사 → `AUDIT` | 825·1180 |
| 이름 충돌 통일 규칙·안내 문구·덮어쓰기 별도 경로 → `SHELL` | 705 |
| 디렉토리 복사에서 무엇이 복사되는가 · 복사 항목 수 토스트 → `SHELL` | 1241 |
| 첨부 저장 구조·소유 판정 → `ATTACH` | 1241 |
| 워크스페이스가 상속 루트 · `관리` 레벨 부여 대상 → `WORKSPACE` | `SEC-WORKSPACE-001`/`002` (역방향) |
| 트리 컨텍스트 메뉴 표면 → `SHELL` | `FR-SHELL-003` (역방향) |
| ACL 만료일 미도입(`R110`) → `PRINCIPAL` | scope_assignment.json: `R110 → PRINCIPAL`(`CON-PRINCIPAL-005`) |
| 관리자로부터 문서를 숨기는 수단 — **제품이 제공하지 않음** | 765 (*"제품은 워크스페이스 안에서 관리자로부터 문서를 숨길 수단을 제공하지 않는다"*) |
| 넓히기를 모아 보는 화면 — **존재하지 않음(`G15`)** | 1598 |
| 접미사 형식·번호 증가 방식 · 응답 시간 동일성 정량 임계 — **소유자 없음** | 705·648 |

### `docs/spec/11.confirmation-grades.srs.md` (CONFIRM, 33 요구) — Out of Scope 12건

| 항목 | 근거 |
|---|---|
| 등급이 적용되는 **조작 자체의 정의**·권한 항목 스키마 → `ACL` | 816행(*"조작 자체의 정의(부여·회수·이동·복사·상속 끊기)는 ACL scope 가 소유"*) · 1560행 |
| 휴지통 보존 기본값·영구 삭제 권한·자동 영구 삭제 → `STORAGE` | 533행(*"이 요구는 축소 조작의 확인 절차만 정하고 기본값은 정하지 않는다"*) |
| 감사 로그 보존 기간 기본값 → `AUDIT` | 533행 + `G27` |
| 오프보딩 단계 정의 → `PRINCIPAL` | 1903행 Trace Link(*"2 단계가 1 단계의 자동 결과라는 사실은 그쪽이 소유한다"*) |
| 설치 마법사 토큰·차단 규칙 → `AUTH` | 1624행 |
| 워크스페이스 생성 폼·관리자 지정·`default` 초기 권한 → `WORKSPACE`/`PRINCIPAL` | 305행 |
| 새 버전 올리기 진입점·버전 단위/상한 → `SHELL`/`STORAGE` | `FR-SHELL-008`·`FR-STORAGE-003` (역방향) |
| 첨부 저장 구조·소유 판정 → `ATTACH` | `SEC-CONFIRM-006` 이 개수 미표시만 소유 |
| 접근자 지표 두 종류의 정의·권한 차등 → `ACL` | 412행(*"수치 자체의 스테일 문제는 확인 다이얼로그 재조회가 소유"* 의 대칭) + `IR-ACL-001` |
| 휴지통 통합 목록 화면 → `SHELL` | 359행(*"휴지통 통합 목록에서 행마다 권한이 갈리는 일괄 선택(R142)"*) |
| 확인 거친 조작의 감사 형식·다건 입도 → `AUDIT` | `OBS-AUDIT-008` |
| 넓히기 결과의 사후 관측 수단 — **제품에 없음(`G16`)** | 1505행 |

### `docs/spec/12.audit-log.srs.md` (AUDIT, 33 요구) — Out of Scope 12건

| 항목 | 근거 |
|---|---|
| 기록 대상이 되는 **조작 자체의 정의** → `STORAGE`/`ACL`/`WORKSPACE` | `OBS-AUDIT-003` 요구 문면(세 기준은 "무엇을 남기는가"만 판정) |
| 재조정 자체 → `STORAGE` | `REL-AUDIT-001` 요구 문면(*"재조정(R77 계열·R40-d)이 지목하는 …"*) |
| 감사·대기열 화면이 놓이는 구역·카테고리 구성·표시 권한 → `SHELL` | `IR-AUDIT-002` AC-3·AC-4(*"R24-a 의 구역·카테고리 구성과 표시 권한을 바꾸지 않는다"*) |
| 인스턴스 설정 값 저장소·설정 화면 → `SHELL` | `R96`(`DR-SHELL-001`) |
| 휴지통 보존 기본값·자동 영구 삭제 → `STORAGE` | `OBS-AUDIT-011` Note ②(*"R86 은 휴지통 기본 30일을 명시하는데 대응 문장이 없다"*) |
| 보존 기간 축소의 확인 등급 → `CONFIRM` | `OBS-AUDIT-011` Rationale(R115-e) |
| 완전 숨김 규칙 → `ACL` | `SEC-AUDIT-008`·`SEC-AUDIT-011` 이 그 규칙의 **적용 결과** |
| 첨부 저장 구조·소유 판정 → `ATTACH` | `OBS-AUDIT-009` 심의문(*"첨부는 노드가 아니고(R50-a) …"*) |
| 무기록 읽기 경로 **자체** → `ATTACH`(다운로드) / `ARCH`(MCP 읽기) | `R137-h` 문면이 `R48`·`R66-b`·`R22`·`R58-b` 를 지목. **`R137-h` 자체의 등재 자리는 AUDIT**(214행 Trace Link, 비규범 수용) — 그 사실도 함께 적음 |
| 오프보딩·회수 화면 → `PRINCIPAL`/`ACL` | `OBS-AUDIT-008` 이 입도만 소유 |
| 슈퍼유저 판정·계정 상태 → `PRINCIPAL`/`AUTH` | `SEC-AUDIT-006` 이 그 판정을 받아 씀 |
| 노드 ID 형식·안정성 → `STORAGE` | `SEC-AUDIT-002` 가 그 안정성에 의존 |

### `docs/spec/13.workspace.srs.md` (WORKSPACE, 19 요구) — Out of Scope 11건

| 항목 | 근거 행 |
|---|---|
| 워크스페이스 수명주기 조작의 주체 판정(`R29`) → `PRINCIPAL` | 973 |
| 생성 폼의 `default` 초기 권한 — 신규 폼 `없음`(`R111`) → `PRINCIPAL` / 설치 마법사 `편집`(`R83`) → `AUTH` | 914 (두 기본값이 다르다는 경고까지 옮김) |
| 생성 시점 부여의 확인 등급(`R136`) · `[생성]` 이 관문이 아님 → `CONFIRM` | 190 |
| 부여·회수의 확인 등급 / 감사 기록 / 시뮬레이션 화면 → `CONFIRM`/`AUDIT`/`ACL` | 303 |
| 우측 `태그` 탭의 내용·집계 단위(`R106`) → `SHELL` | 426 |
| 요청 버튼 미배치(`R103-a`) → `ACL` | 491·550 (두 요구가 각각 진술) |
| 자동 접미사 형식·안내 문구(`R102`) → `SHELL` | 855 |
| 재조정 대기열의 정체·스키마·소재·권한(`R139` 계열) → `AUDIT` | 733 |
| `.archive` 제외 + 무레코드 경로 거부 fail-closed(`R55-b`) → `STORAGE`, **하위이면서 Phase 1** | 1035 (감사 H13 부활 경고까지 옮김) |
| 재조정·노드 ID·휴지통·백업 → `STORAGE` | scope_assignment.json |
| 자동완성/백링크/검색 탭의 화면 자리 → `SHELL`, 위키링크 해석·삽입 → `STORAGE` | `FR-STORAGE-009` Note (역방향) |

### `docs/spec/14.storage.srs.md` (STORAGE, 29 요구) — Out of Scope 14건

| 항목 | 근거 행 |
|---|---|
| 충돌 이후 병합 화면 → `EDITOR` | 549·607 |
| 저장 거부 뒤의 화면(본문 보존·로컬 내보내기) → `EDITOR` | `FR-EDITOR-005` (역방향) |
| 새 버전 올리기 진입점 · 문서 헤더 메뉴 소재·md 전용 노출 → `SHELL` | 671·788 |
| 설정 화면 소재 · 설정 값 저장소 → `SHELL` | 729 |
| 여러 워크스페이스 통합 휴지통 화면·행 단위 판정 → `SHELL` | 904 |
| 자동 접미사 규칙 정본(`R102`) → `SHELL` | 966 |
| 삭제·복구·영구 삭제의 감사 형식 / 감사 보존 기간 → `AUDIT` | 967·1087 |
| 일괄 영구 삭제 미도입(`R142`) · 보존 축소/영구 삭제 확인 등급 → `CONFIRM` | scope_assignment.json |
| 경계 넘는 인덱싱(`R39`)·표시 필터(`R80`) → `WORKSPACE` / 백링크 탭(`R89`) → `SHELL` | 1438 |
| 첨부 저장 레이아웃·소유 판정·동반 삭제 → `ATTACH` | `FR-STORAGE-008` 이 결과만 소유 |
| 워크스페이스 물리 레이아웃·사이드카·아카이브 → `WORKSPACE` (단 `SEC-STORAGE-006` 은 Phase 1) | `FR-WORKSPACE-008` Note (역방향, 1035행) |
| 재조정 대기열 → `AUDIT` | `REL-AUDIT-001` |
| 누가 도달하는가의 판정 → `ACL` | `SEC-STORAGE-002`/`FR-STORAGE-006`/`SEC-STORAGE-003` 이 필요 권한으로 인용만 |
| MCP·벡터검색 결과 ACL 필터링 → `ARCH` | `SEC-ARCH-002` (역방향) |

### `docs/spec/15.attachments.srs.md` (ATTACH, 22 요구) — Out of Scope 12건

| 항목 | 근거 행 |
|---|---|
| 동명 파일 충돌 처리(`R102`) → `SHELL` | 76 |
| 비-md 모드 토글 숨김(`R91-③`) → `EDITOR` | 289 |
| 보기·편집 유효 권한 정의 · 완전 숨김 → `ACL` | `SEC-ATTACH-002` 가 "어느 노드의 권한을 보는가" 만 소유 |
| 문서 이동 시 첨부 미이동·본문 미재작성 → `STORAGE` | `FR-STORAGE-008` (역방향) |
| 노드 ID · 휴지통/영구 삭제 구분 → `STORAGE` | 567(*"삭제는 「영구 삭제」에만 발화한다"*) |
| 첨부 업로드·삭제의 감사 · 동반 삭제 무기록 판정(`R141-c`) → `AUDIT` | 567 · `OBS-AUDIT-009` |
| 첨부 다운로드 무기록 잔여 위험(`R137-h`)의 **등재 자리** → `AUDIT` | scope_assignment.json: `R137-h → AUDIT`. ATTACH 는 그 위험을 자기 문면에 적을 뿐 |
| 컨테이너 회수 시 첨부 영향 고정 문구 → `CONFIRM` | `SEC-CONFIRM-006` |
| 워크스페이스 루트 물리 레이아웃 → `WORKSPACE` | `DR-WORKSPACE-001` |
| Phase 2 파생 거동(`.task` 버전·충돌·감사 입도·모드 토글·색인) — `G34`, **어느 쪽도 답 없음** | 903 (*"`G34` 는 이 열거가 전량이 아니라고 스스로 밝힌다"* 까지 옮김) |
| PAT `읽기 전용` 스코프로 댓글(`G35`-④) → `AUTH` 축, 댓글 설정 변경 권한(`G35`-⑤) **소유자 없음** | 1130 |
| 해시 알고리즘·중복 제거·크기 제한 기본값/단위/`0`/거부 시점 — **소유자 없음** | 401·677 |

---

## 판단이 갈렸던 자리

1. **`- None` 을 정말 못 쓰는가.** `EDITOR` 는 자기 축의 제품 부정(`R15`·`R17`·`R31`)을 **직접 소유**해서 위임할 것이 없다. `- None` 대신 *"이 셋은 다른 scope 로 위임되지 않는다. 이 scope 가 직접 소유하므로 In Scope 에 있다"* 로 썼다 — 검증 가능한 진술이면서 다음 저작자에게 "여기 없는 게 아니라 위에 있다" 를 알려 준다.

2. **`R19`(멀티테넌트 아님)를 ARCH 의 Out of Scope 에 쓸 것인가.** 쓰면 `CON-ARCH-001` 문면과 같은 사실이 한 파일 안에서 두 번 적힌다(`R124` 위반). 그렇다고 빼면 다음 저작자가 §2 만 보고 판정할 수 없다. **포인터로 해결** — *"그 배제는 이 scope 안의 `CON-ARCH-001` 이 문면으로 담으므로 여기서 다시 열거하지 않는다."*

3. **`R35-a`(워크스페이스 관리자 지정) 오배정을 잡았다.** 초안에서 `WORKSPACE` 의 Out of Scope 에 *"관리자 지정 → `PRINCIPAL`"* 로 적었는데, `scope_assignment.json` 확인 결과 `R35-a → WORKSPACE` 였다. 근거였던 `FR-WORKSPACE-001` Note 의 *"두 조항 모두 이 scope 가 소유하지 않는다"* 에서 「두 조항」은 `R136`·`R111` 이지 `R35-a` 가 아니다. 수정하고 In Scope(`SEC-WORKSPACE-002` 줄)로 옮겼다.

4. **`R137-h`(읽기 무기록 잔여 위험) 소유자.** `15.attachments.srs.md` 가 두 자리에서 이 위험을 자기 문면에 적고 있어 ATTACH 소유로 읽기 쉬웠으나, `scope_assignment.json` 은 `R137-h → AUDIT` 이고 `12.audit-log.srs.md:214` 에 *"비규범(인지된 잔여 위험)으로 implementationNotes 에 수용"* Trace Link 가 있다. **초안을 뒤집어** AUDIT 의 Out of Scope 를 "읽기 경로 *자체*는 ATTACH/ARCH, 그 위험의 등재 자리는 여기" 로 다시 썼다.

5. **`FR-ACL-003` Note 한 문장이 세 scope 로 갈린다.** *"확인 등급과 타이핑 토큰, 시스템 그룹을 대상에 포함하는지, 다건 회수를 허용하는지, 오프보딩 흐름에서 이 화면으로 진입하는 방식, 회수 다건의 감사 입도는 각각 확인 등급·주체·감사 로그 scope 가 소유한다."* 「각각」의 대응이 1:1 이 아니라 5:3 이라 기계적으로 못 나눈다. `FR-CONFIRM-020`(주체 다건 일괄 회수를 허용한다) 제목으로 「다건 허용」을 CONFIRM 에 배정하고, 「시스템 그룹 포함」은 `FR-PRINCIPAL-010` 제목으로 PRINCIPAL 에 배정해 ACL·PRINCIPAL 양쪽 §2 에 대칭으로 적었다.

6. **`SEC-STORAGE-006`(무레코드 경로 거부)의 Phase 소속.** 계층상 아카이브(Phase 2)의 하위인데 실제로는 Phase 1 이다. `WORKSPACE`·`STORAGE` **양쪽** Out of Scope 에 이 예외를 적었다 — 한쪽에만 적으면 다른 쪽을 읽는 사람이 "아카이브가 Phase 2 니까 이것도" 로 읽고 감사 H13(레코드 없음 → 무제한 허용)이 되살아난다. `R124` 대비 중복이지만, 두 문서 모두 이미 자기 Implementation Note 에 그 경고를 갖고 있어 새 사실을 만든 것이 아니라 기존 경고를 §2 에서 가리킨 것이다.

7. **`CONFIRM` 의 In Scope 를 33건 전부 나열하지 않았다.** 배정표 계열(`FR-CONFIRM-006`~`019`)을 하나의 항목으로 묶고 조작명만 열거했다. 33줄짜리 In Scope 는 목록이지 경계가 아니다.

8. **"셸 scope"·"저장 scope" 같은 산문 표기를 §2 에서는 `SHELL`·`STORAGE` 코드 표기로 통일**했다. Implementation Notes 는 산문·코드가 섞여 있는데, §2 는 다음 저작자가 배정을 판정하는 자리라 문서 slug 와 1:1 로 대조되는 표기가 낫다고 봤다. Notes 본문은 손대지 않았다.
