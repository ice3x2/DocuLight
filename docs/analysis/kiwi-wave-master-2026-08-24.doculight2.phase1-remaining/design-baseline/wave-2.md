# wave-2 — 설계 발췌

| Field | Value |
| --- | --- |
| run_id | `2026-08-24.doculight2.phase1-remaining` |
| 원본 | `docs/plans/2026-08-24.remaining-work-order.md` |
| SSOT 절 | Wave 3 — 저장소 기반 (MCP 의 선행) |
| 좌표 | 57~63 행 |
| target | `phase-1` (wave-N target 을 새로 만들지 않는다 — 제약 C-01) |
| 설계 항목 | 7개 |

> 이 문서는 `/kiwi-srs` 의 `--research-doc` 입력이자 웨이브 종료 상호검증의 설계 계층 분모다. 여기 없는 것은 어느 계층에도 보이지 않는다.

## 1. 원본 발췌

## Wave 3 — 저장소 기반 (MCP 의 선행)

| 순서 | 요구 | 남은 것 |
|---|---|---|
| 5 | `REL-STORAGE-002` | chokidar 파일 감시와 unlink+add 상관 판정. **fail-closed** — 해시 동일 + 짧은 시간 창만 인정, 아니면 신규 노드 + tombstone + 재조정 대기열 기재. 현재 감시 코드 자체가 없다 |
| 6 | `SEC-STORAGE-007` | 벡터 인덱스. 삭제·이동·아카이브와 **같은 처리 안에서** 동기 갱신하고, 없는 노드의 엔트리는 조회 시점에 무조건 제외 |
| 7 | `FR-SHELL-013` AC-4 | PDF 본문 추출과 페이지 번호를 실은 색인 항목. `pdf` 문자열이 서버·웹 어디에도 없다 |

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
| `DI-W2-01` | Wave 3:61 | REL-STORAGE-002 — chokidar 파일 감시를 세우고 unlink+add 를 이동으로 상관 판정한다 |
| `DI-W2-02` | Wave 3:61 | 그 판정은 fail-closed 다 — 해시 동일 + 짧은 시간 창만 이동으로 인정하고, 아니면 신규 노드와 tombstone 을 만들고 재조정 대기열에 기재한다 |
| `DI-W2-03` | Wave 3:62 | SEC-STORAGE-007 — 벡터 인덱스를 삭제·이동·아카이브와 같은 처리 안에서 동기 갱신한다 |
| `DI-W2-04` | Wave 3:62 | 없는 노드의 벡터 엔트리는 조회 시점에 무조건 제외한다 |
| `DI-W2-05` | Wave 3:63 | FR-SHELL-013 AC-4 — PDF 본문을 추출하고 페이지 번호를 실은 색인 항목을 만든다 |
| `DI-W2-06` | Wave 1 이 남긴 것:33 | http/routes/documents.ts 와 그 가드 둘(fail-closed.ts · dot-path-guard.ts)을 apiRouter 에 배선하고 SEC-STORAGE-006 서빙 가드와 함께 판정한다 |
| `DI-W2-07` | Wave 1 이 남긴 것:25 | 배선한 세 항목을 조립 방벽 허용목록에서 빼도 test/arch/assembly.test.ts 가 통과한다 |

## 4. 이 wave 가 건드릴 기존 모듈

- `packages/server/src/app/reconciliation/reconcile.ts`
- `packages/server/src/infra/fs/document-store.ts`
- `packages/server/src/http/routes/documents.ts`
- `packages/server/src/http/guards/fail-closed.ts`
- `packages/server/src/http/guards/dot-path-guard.ts`
- `packages/server/test/arch/assembly.test.ts`

## 5. 요구 범위

`--req-filter` 에 넣을 요구 ID: `REL-STORAGE-002` · `SEC-STORAGE-007` · `FR-SHELL-013`
