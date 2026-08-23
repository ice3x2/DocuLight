# 2026-08-24 — 감사 결함 교정과 증거 일소

## §0. 다음 세션의 첫 행동

1. `C:\Work\git\DocuLight2.0` 에서 아래 세 명령으로 현 상태를 확인한다.
   ```
   cd C:\Work\git\DocuLight2.0 && npm run typecheck
   cd C:\Work\git\DocuLight2.0\packages\server && set NODE_ENV=production && npx vitest run
   cd C:\Work\git\DocuLight2.0\packages\web && set NODE_ENV=production && npx vitest run
   ```
   2026-08-24 실행 결과: typecheck **오류 0**, server **1186 통과**, web **500 통과**, editor **237 통과 1 skip**.
2. `§4. 열린 결정` 을 먼저 읽는다 — 그 결정이 나기 전에는 `OBS-AUDIT-008` AC-3 을 닫지 못한다.
3. `§5. 남은 작업` 에서 하나를 고른다.

## §1. 이 세션이 한 일 (한 줄)

적대적 검증이 드러낸 「시험은 통과하는데 제품에서는 0행」 결함들을 고치고, `phase-1` target 의 요구 상태를 `implemented 79 → 217` 으로 올렸다.

## §2. 고친 결함 (전부 커밋됨)

| 결함 | 무엇이 잘못돼 있었나 | 커밋 |
|---|---|---|
| 감사 기록기가 선택 인자 | 그룹 멤버십 두 라우트·가입 승인·재심사 복귀가 아무도 기록기를 넘기지 않아 **제품 경로에서 0행**이었다. 필수 인자로 승격 | `4c1c584` |
| 바이너리 새 버전 무기록 | 라우트까지 서 있는데 감사 행이 없었고, 증거는 "아직 서지 않았다"고 적혀 있었다 | `4c1c584` |
| 조작 필터가 죽어 있음 | 화면이 값을 서버로 넘기지 않아 드롭다운이 무동작이었고, 그 위의 AC 들이 공짜로 참이었다 | `4c1c584` |
| 재조정의 생성 조작명 분기 | 재조정은 `create`, 사람은 `node.create` 라 「생성」 필터가 둘 중 하나만 잡았다. `node.create` 로 통일 | `4c1c584` |
| 대상 역할 미표시 | 경계를 넘는 복사의 두 행이 화면에서 완전히 같아 「나갔다」와 「들어왔다」가 구별되지 않았다 | `4c1c584` |
| 역할 짝 조건이 스키마 밖 | 상대 노드 없이 대상 역할만 담은 행을 스키마가 받았다. 마이그레이션 `019` 트리거로 차단 | `976d1cd` |
| 감사 목록 순서 비결정적 | `ORDER BY occurred_at DESC, id DESC` 에서 `id` 가 무작위 UUID 라 같은 초의 행 순서가 열 때마다 달랐다. `rowid` 로 교체 | `976d1cd` |
| 설치 마법사 무기록 | default 초기 권한을 저장소에 직접 부여해 감사가 없었고, 최초 슈퍼유저 편입도 무기록이었다 | `8f0fc36` |
| 자동 저장 디바운스 | 800ms 로 서 있었으나 원장 `R75` 는 **~2초**를 제품 상수로 정했다. 2000ms 로 교정 | `2c5732d` |
| 워크스페이스 화면의 가져오기 버튼 | `inheritsAcl` 만 보고 있어 그 값이 없으면 워크스페이스 화면에도 섰다. 노드 종류를 함께 보게 수정 | `ac23100` |
| 본문 위키링크 무표식 | 편집기가 해석기를 받지 못해 본문 링크에 아무 표식도 붙지 않았다 | `8632b5d` |

공허했던 시험 넷도 고쳤다 — 업로드를 한 번도 부르지 않던 AC-6, 긍정 단언이 없던 복사 AC-6, `expect.anything()` 으로 길이 비교로 퇴화한 묶음 건수, 반환값을 버리던 영구 삭제 거절.

## §3. 새로 만든 기능

| 기능 | 소재 | 커밋 |
|---|---|---|
| 재조정 대기열 | `packages/server/src/app/reconciliation/queue-view.ts` · `packages/web/src/audit/AuditLogPanel.tsx` | `61fd680` |
| 태그 탭 | `packages/server/src/app/document/tag-service.ts` · `packages/web/src/search/TagPanel.tsx` | `752d739` |
| 전역 검색 (네 축 · 필터 팝오버) | `packages/server/src/app/document/search-service.ts` · `packages/web/src/search/SearchPanel.tsx` · `packages/web/src/search/search-axes.ts` | `eab72f2` |
| 위키링크 본문 해석 | `packages/web/src/document/wiki-link-resolve.ts` | `8632b5d` |
| 슈퍼유저 직접 등록 | `packages/web/src/principal/UserRoster.tsx` · `POST /api/roster/users` | `9592231` |

새 도메인 모듈 둘: `packages/server/src/domain/document/tag.ts`(태그 훑기) · `packages/server/src/domain/naming/name-order.ts`(이름순 비교, 로케일 `ko` 고정).

## §4. 열린 결정 — **아직 결정되지 않음**

`DR-AUDIT-002` 의 칸 계약을 어떻게 고칠 것인가. 세 사실이 그 문면을 거짓으로 만든다:

1. AC-7 「칸이 이 열하나」 — 대리 키 `id` 가 더 있어 실제로는 열둘이다. 그 `id` 는 `reconciliation_finding` 계열 두 테이블이 외래키로 참조하므로 없앨 수 없다.
2. AC-8 「주체·레벨은 acl_entry 조작의 행에서만」 — 코드가 그룹 멤버십·계정 상태·PAT 발급에서도 `subjectId` 를 채우고, 설정 변경은 **설정 키 문자열**을(`packages/server/src/app/settings/instance-settings.ts`), 토큰은 **PAT 스코프**를(`packages/server/src/app/auth/token-service.ts`) 그 칸들에 넣는다.
3. `IR-AUDIT-003` 의 묶음 키가 「같은 초 · 같은 조작 · 같은 행위자」라 서로 다른 두 조작이 한 묶음으로 접힌다(실측 재현됨).

선택지 셋 — (가) 계약을 「의미 칸 열하나 + 노출하지 않는 기반 칸」으로 다시 쓰고 AC-8 을 타입 규칙으로 바꾼다 / (나) 계약을 그대로 두고 코드를 맞춘다 / (다) 거짓으로 판명된 둘만 개정하고 새 칸은 만들지 않는다.

⚠️ 미검증 — 3축 서브에이전트 회의를 두 차례 띄웠으나 **응답을 받지 못했다.** 결정은 내려지지 않았고, 위 세 사실만 확인된 상태다. 이 결정이 나기 전에는 `OBS-AUDIT-008` AC-3(회수 감사 행이 `granted_by` 를 담는다)을 닫을 수 없다 — 담을 칸이 없기 때문이다.

## §5. 남은 작업 (`phase-1` target)

2026-08-24 기준: 총 253건 · **implemented 217 · verified 18 · in_progress 6 · planned 12 · blocked 0 · 증거 누락 0**.

### 큰 덩어리 (아직 코드가 없다)

| 요구 | 무엇이 없나 |
|---|---|
| `SEC-ARCH-001` · `SEC-ARCH-002` · `SEC-ARCH-003` · `FR-ARCH-001` · `IR-AUTH-002` · `CON-SHELL-002` | MCP 서버 패키지 자체 |
| `MIG-AUTH-001` · `MIG-AUTH-002` | 1.0 → 2.0 이행 절차 |
| `SEC-STORAGE-007` | 벡터 인덱스 |
| `REL-STORAGE-002` | 파일 감시와 unlink+add 상관 판정 |
| `FR-EDITOR-001` · `FR-EDITOR-007` | 옵시디언 동일성 판정 · 라이브 프리뷰 열 요소 |

### 부분 완료 (AC 하나만 남음)

| 요구 | 남은 AC | 왜 못 닫았나 |
|---|---|---|
| `FR-SHELL-013` | AC-4 | PDF 본문 추출기가 없다 — 페이지 번호를 실을 수 없다 |
| `OBS-AUDIT-008` | AC-3 | §4 결정 대기 |
| `OBS-AUDIT-001` | AC-2 일부 | 아카이브·복원 조작이 서지 않았다 |
| `FR-CONFIRM-019` | AC-6 | 설치 마법사 화면이 자리표다 |
| `SEC-ACL-006` | AC-5 | MCP 도구 응답 축 — MCP 부재 |
| `CON-ARCH-002` | — | 절차 요구이며 코드로 재지 않는다 |

## §6. 이 저장소에서 일할 때 걸린 함정

- **`NODE_ENV`** — 셸에 `production` 이 박혀 있다. vitest 를 그 값으로 돌려야 한다.
- **패키지 밖에서 vitest 를 돌리지 마라** — 저장소 루트에서 돌리면 jsdom 이 안 서서 `document is not defined` 가 난다. 반드시 `packages/<pkg>` 로 `cd` 한 뒤 돌린다.
- **Bash 도구의 작업 디렉터리는 호출마다 초기화된다** — 매번 절대 경로로 `cd` 한다.
- **Python heredoc 에서 `\n`** — 일반 문자열의 `\\n` 이 TS 파일에 **진짜 줄바꿈**으로 들어가 파서를 깬다. 까다로운 이스케이프는 `Edit` 도구를 쓴다.
- **typecheck 는 저장소 루트에서** — 패키지별로만 돌리면 다른 패키지의 오류를 놓친다. 실제로 한 번 그렇게 커밋했다가 바로 뒤에 고쳤다(`016d288`).
- **뮤테이션 탐침을 반드시 돌린다** — 이 세션에서 처음 죽지 않은 뮤턴트가 다섯 있었고, 그때마다 시험이 약했다(워크스페이스 단위로만 거르던 검색 권한 시험, 줄 바깥만 보던 툴팁 시험 등).

## §7. 확정된 결정 (재논의 대상 아님)

- 태그·검색의 권한 필터는 **조회 시점**에 건다. 색인을 두지 않는 이유는 색인과 권한이 어긋날 자리가 생기기 때문이다.
- 검색의 기본 축은 `이름` 하나다. 넷을 다 켜 두면 첫 질의가 인스턴스 전체를 읽는다.
- 저장된 축 조합이 깨졌으면 **기본값으로 돌아간다.** 부분적으로 살리면 사용자가 고른 적 없는 조합이 선다.
- 이름순 비교의 로케일은 `ko` 고정이며 비교 함수는 `domain/naming/name-order.ts` 한 자리다.
- 「무엇을 볼 수 있는가」 판정은 `link-service.ts` 의 `visibleMarkdown` 하나를 링크·태그가 함께 쓴다. 검색만 따로 두는 이유는 이름 축이 비-md 노드까지 덮기 때문이며, 그 사유가 `search-service.ts` 주석에 적혀 있다.
- 없는 문서와 권한 없는 문서는 **모든 표면에서 같은 값**으로 접힌다 — 아웃고잉 패널·본문 렌더·자동완성 셋 다.
