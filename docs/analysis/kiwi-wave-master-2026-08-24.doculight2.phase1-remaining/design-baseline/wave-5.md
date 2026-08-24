# wave-5 — 설계 발췌

| Field | Value |
| --- | --- |
| run_id | `2026-08-24.doculight2.phase1-remaining` |
| 원본 | `docs/plans/2026-08-24.remaining-work-order.md` |
| SSOT 절 | Wave 6 — 요구 밖 품질 후속 |
| 좌표 | 84~98 행 |
| target | `phase-1` (wave-N target 을 새로 만들지 않는다 — 제약 C-01) |
| 설계 항목 | 11개 |

> 이 문서는 `/kiwi-srs` 의 `--research-doc` 입력이자 웨이브 종료 상호검증의 설계 계층 분모다. 여기 없는 것은 어느 계층에도 보이지 않는다.

## 1. 원본 발췌

## Wave 6 — 요구 밖 품질 후속

감사 칸 계약 이행(`7e6319a`)이 남긴 다섯과, 2026-08-25 브라우저 확인 회차가 함께 잡은 둘.

**요구를 먼저 신설한 뒤 고친다.** 저장소 `CLAUDE.md` 가 「Implement behavior that is not covered by an SRS requirement」를 금지하므로, 요구 없이 코드를 고칠 수 없다. 또한 wave 로 실행할 경우 요구가 0건이면 검증 분모가 0 이 되어 그 wave 는 통과할 수 없다. `/kiwi-srs` 로 **일곱 건**을 `phase-1` 에 신설한 뒤 그 요구를 범위로 삼는다.

| 항목 | 성격 |
|---|---|
| 감사 패널의 원시 principal ID | 회수 행 이전값이 부여자 UUID 라 `uuid → -` 로 뜬다. 이름 해석을 넣으려면 서버 마스킹 규칙(`SEC-AUDIT-002`·`SEC-AUDIT-008`)을 함께 봐야 한다 |
| 「설정 변경 전체」 필터 값 | `settings.change` 를 다섯으로 가르며 잃었다. 필터의 접두 묶음 선택지로 되찾는다 (`R164-a` 에 상실로 기록됨) |
| PAT 발급 행 미표시 | 패널이 `beforeValue` 가 있을 때만 그려 이후값만 있는 발급 행의 스코프가 안 보인다 |
| `auditView` 의 이중 질의 | `inScope` 를 두 번 부르고 두 배열을 인덱스로 맞춘다. 개정 전부터 있던 결함이며 `ORDER BY` 한 줄에 깨진다 |
| `correlationId` 타입 | `string` 이라 아무 문자열이나 들어간다. branded 타입이면 런타임 비용 0 으로 약속이 참이 된다 |
| **저장 직후 편집기 포커스 상실** | 자동 저장이 성공하면 `document.activeElement` 가 편집기에서 빠지고, 이어 친 글자가 문서에 들어가지 않고 사라진다. 사용자가 다시 클릭해야 입력이 재개되며 잃은 글자에 대한 표시가 없다. 실측 근거는 `docs/analysis/2026-08-25.browser-manual-verification/README.md` §3.2 다. `CON-ARCH-006`·원장 `R33-d` 가 막으려던 결함 계열과 같은 자리이므로 그 축과 함께 판정한다 |
| **새 노트를 만들면 열 수 없다** | `POST /api/nodes` 가 DB 노드만 만들고 파일을 만들지 않아(`app/node/node-service.ts` 의 `createNode`), 만든 직후 그 문서를 열면 서버가 `ENOENT` 로 500 을 낸다. 화면의 「새 노트」 버튼도 같은 경로를 쓴다(`packages/web/src/App.tsx` 의 `createNote`). 같은 보고서 §4 참조 |

## 2. 「Wave 1 이 남긴 것」에서 이 wave 로 배정된 배선

그 절 자체는 `already-implemented` 로 배제하되, 표가 정한 배선은 배제하지 않고 이 wave 로 배정했다. 원본은 아래와 같다.

**Wave 1 이 남긴 것** — 조립 방벽(`packages/server/test/arch/assembly.test.ts`)이 진입점에서 도달하지 못하는 모듈 **일곱**을 허용목록에 잡아 두었다(아래 표는 마지막 행이 가드 둘을 담아 여섯 행이다). 각 항목은 아래 Wave 중 하나가 배선해야 하며, 배선하는 순간 허용목록에서 빼야 한다.

| 도달 못 하는 모듈 | 세울 자리 |
|---|---|
| `app/auth/signup-service.ts` | `FR-AUTH-002` · `SEC-AUTH-004` 의 가입 신청·승인 라우트와 두 화면 |
| `app/auth/password-service.ts` | `SEC-AUTH-018` 의 비밀번호 변경 라우트와 설정 모달 account 패널 |
| `app/auth/token-service.ts` | `SEC-AUTH-005` · `SEC-AUTH-007` 의 PAT 라우트와 설정 모달 tokens 패널 — **Wave 4 의 선행이다** (MCP 인증이 PAT 하나뿐이므로) |
| `app/audit/audit-retention.ts` | `R84-a` 의 감사 보존 일소. 휴지통 일소도 같은 상태이며 한 주기 작업으로 함께 세운다 |
| `http/routes/documents.ts` · `http/guards/fail-closed.ts` · `http/guards/dot-path-guard.ts` | 문서 원문 서빙 라우터와 그 가드 둘. `SEC-STORAGE-006` 서빙 가드와 함께 판정한다 |

## 3. 이 wave 의 설계 항목 (검증 분모)

| id | 좌표 | 규범 문장 |
| --- | --- | --- |
| `DI-W5-01` | Wave 6:88 | /kiwi-srs 로 일곱 건의 요구를 phase-1 에 먼저 신설하고 그 요구를 이 wave 의 범위로 삼는다 |
| `DI-W5-02` | Wave 6:92 | 감사 패널이 원시 principal ID 를 그대로 노출하지 않게 한다 — 서버 마스킹 규칙(SEC-AUDIT-002 · SEC-AUDIT-008)과 함께 판정한다 |
| `DI-W5-03` | Wave 6:93 | settings.change 를 다섯으로 가르며 잃은 「설정 변경 전체」 필터 값을 접두 묶음 선택지로 되찾는다 (R164-a) |
| `DI-W5-04` | Wave 6:94 | 감사 패널이 beforeValue 가 없는 PAT 발급 행도 그려 그 스코프가 보이게 한다 |
| `DI-W5-05` | Wave 6:95 | auditView 의 이중 질의를 없앤다 — inScope 를 두 번 부르고 두 배열을 인덱스로 맞추는 구조가 ORDER BY 한 줄에 깨진다 |
| `DI-W5-06` | Wave 6:96 | correlationId 를 branded 타입으로 바꿔 런타임 비용 0 으로 약속을 참으로 만든다 |
| `DI-W5-07` | Wave 6:97 | 자동 저장이 성공한 뒤에도 편집기가 포커스를 유지해 이어 친 글자가 유실되지 않게 한다 (CON-ARCH-006 · 원장 R33-d 축과 함께 판정) |
| `DI-W5-08` | Wave 6:98 | 새 노트를 만들면 그 문서를 열 수 있게 한다 — POST /api/nodes 가 DB 노드만 만들고 파일을 만들지 않아 ENOENT 500 이 난다 |
| `DI-W5-09` | Wave 1 이 남긴 것:32 | app/audit/audit-retention.ts 를 감사 보존 일소가 도는 자리에 배선한다 (R84-a) |
| `DI-W5-10` | Wave 1 이 남긴 것:32 | 휴지통 일소도 같은 상태이므로 한 주기 작업으로 함께 세운다 |
| `DI-W5-11` | Wave 1 이 남긴 것:25 | 배선한 audit-retention.ts 를 조립 방벽 허용목록에서 빼도 test/arch/assembly.test.ts 가 통과한다 |

## 4. 이 wave 가 건드릴 기존 모듈

- `packages/server/src/app/audit`
- `packages/server/src/app/audit/audit-retention.ts`
- `packages/server/src/app/trash/trash-service.ts`
- `packages/server/src/app/node/node-service.ts`
- `packages/web/src/audit`
- `packages/web/src/document/DocumentSurface.tsx`
- `packages/web/src/App.tsx`
- `packages/server/test/arch/assembly.test.ts`

## 5. 요구 범위

이 wave 는 /kiwi-srs 로 phase-1 에 요구 일곱 건을 먼저 신설하고, 반환된 ID 를 --req-filter 로 쓴다
