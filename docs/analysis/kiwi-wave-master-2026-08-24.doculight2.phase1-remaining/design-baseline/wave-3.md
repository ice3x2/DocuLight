# wave-3 — 설계 발췌

| Field | Value |
| --- | --- |
| run_id | `2026-08-24.doculight2.phase1-remaining` |
| 원본 | `docs/plans/2026-08-24.remaining-work-order.md` |
| SSOT 절 | Wave 4 — MCP 서버 패키지 (여섯이 한 덩어리) |
| 좌표 | 65~72 행 |
| target | `phase-1` (wave-N target 을 새로 만들지 않는다 — 제약 C-01) |
| 설계 항목 | 12개 |

> 이 문서는 `/kiwi-srs` 의 `--research-doc` 입력이자 웨이브 종료 상호검증의 설계 계층 분모다. 여기 없는 것은 어느 계층에도 보이지 않는다.

## 1. 원본 발췌

## Wave 4 — MCP 서버 패키지 (여섯이 한 덩어리)

| 순서 | 요구 | 남은 것 |
|---|---|---|
| 8 | `SEC-ARCH-001` · `IR-AUTH-002` | 패키지 골격과 인증. `Authorization: Bearer <PAT>` 가 **유일한** 경로이고 무인증 도구가 목록에 존재하지 않는다 |
| 9 | `SEC-ARCH-002` · `SEC-ARCH-003` | 인가. 읽기·벡터검색은 호출자 ACL 로 거르되 **걸러진 사실을 건수·순번·자리표시 어느 형태로도 노출하지 않고**, 쓰기는 결과 필터가 아니라 **실행 자체를 막는다** |
| 10 | `FR-ARCH-001` | 1.0 의 도구 이름·인자·출력 포맷·에러 코드를 계약으로 물려받되 소스는 이식하지 않는다. A-RAG 는 신규 작성 |
| 11 | `CON-SHELL-002` AC-3 · `SEC-ACL-006` AC-5 | 위가 서면 파생으로 닫힌다. `CON-SHELL-002` 의 AC-1·AC-2 는 이미 사실이다(검색 탭에 AI 토글이 없다) |

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
| `DI-W3-01` | Wave 1 이 남긴 것:31 | app/auth/token-service.ts 를 PAT 라우트와 설정 모달 tokens 패널로 배선한다 (SEC-AUTH-005 · SEC-AUTH-007) — 이 wave 의 나머지보다 먼저다 |
| `DI-W3-02` | Wave 1 이 남긴 것:29 | app/auth/signup-service.ts 를 가입 신청·승인 라우트와 두 화면으로 배선한다 (FR-AUTH-002 · SEC-AUTH-004) |
| `DI-W3-03` | Wave 1 이 남긴 것:30 | app/auth/password-service.ts 를 비밀번호 변경 라우트와 설정 모달 account 패널로 배선한다 (SEC-AUTH-018) |
| `DI-W3-04` | Wave 4:69 | SEC-ARCH-001 · IR-AUTH-002 — MCP 서버 패키지 골격과 인증을 세운다 |
| `DI-W3-05` | Wave 4:69 | Authorization: Bearer <PAT> 가 유일한 인증 경로이고 무인증 도구가 목록에 존재하지 않는다 |
| `DI-W3-06` | Wave 4:70 | SEC-ARCH-002 · SEC-ARCH-003 — 읽기와 벡터검색은 호출자 ACL 로 거른다 |
| `DI-W3-07` | Wave 4:70 | 걸러진 사실을 건수·순번·자리표시 어느 형태로도 노출하지 않는다 |
| `DI-W3-08` | Wave 4:70 | 쓰기는 결과 필터가 아니라 실행 자체를 막는다 |
| `DI-W3-09` | Wave 4:71 | FR-ARCH-001 — 1.0 의 도구 이름·인자·출력 포맷·에러 코드를 계약으로 물려받되 소스는 이식하지 않는다 |
| `DI-W3-10` | Wave 4:71 | A-RAG 는 신규 작성한다 |
| `DI-W3-11` | Wave 4:72 | CON-SHELL-002 AC-3 와 SEC-ACL-006 AC-5 를 위 구현의 파생으로 닫는다 |
| `DI-W3-12` | Wave 1 이 남긴 것:25 | 배선한 세 인증 모듈을 조립 방벽 허용목록에서 빼도 test/arch/assembly.test.ts 가 통과한다 |

## 4. 이 wave 가 건드릴 기존 모듈

- `packages/server/src/app/auth/token-service.ts`
- `packages/server/src/app/auth/signup-service.ts`
- `packages/server/src/app/auth/password-service.ts`
- `packages/server/src/domain/auth/token-scope.ts`
- `packages/server/test/arch/assembly.test.ts`
- `packages/web/src/settings`

## 5. 요구 범위

`--req-filter` 에 넣을 요구 ID: `SEC-ARCH-001` · `IR-AUTH-002` · `SEC-ARCH-002` · `SEC-ARCH-003` · `FR-ARCH-001` · `CON-SHELL-002` · `SEC-ACL-006` · `SEC-AUTH-005` · `SEC-AUTH-007` · `FR-AUTH-002` · `SEC-AUTH-004` · `SEC-AUTH-018`
