# wave-4 — 설계 발췌

| Field | Value |
| --- | --- |
| run_id | `2026-08-24.doculight2.phase1-remaining` |
| 원본 | `docs/plans/2026-08-24.remaining-work-order.md` |
| SSOT 절 | Wave 5 — 1.0 이행 |
| 좌표 | 74~82 행 |
| target | `phase-1` (wave-N target 을 새로 만들지 않는다 — 제약 C-01) |
| 설계 항목 | 8개 |

> 이 문서는 `/kiwi-srs` 의 `--research-doc` 입력이자 웨이브 종료 상호검증의 설계 계층 분모다. 여기 없는 것은 어느 계층에도 보이지 않는다.

## 1. 원본 발췌

## Wave 5 — 1.0 이행

| 순서 | 요구 | 남은 것 |
|---|---|---|
| 12 | `MIG-AUTH-002` | 계정 전원 `active` + `default` 그룹 · **bcrypt 해시 그대로 재사용** · 전역 API Key 무효화와 PAT 재발급 안내 |
| 13 | `MIG-AUTH-001` | 1.0 읽기 전용 동결 · `docsRoot` 전체(비-md 포함)를 기본 워크스페이스로 복사 · 벡터 인덱스는 옮기지 않고 재구축 |
| 14 | `CON-ARCH-002` AC-8 | 1.0 리포가 동결된 상태로 운영 가능한지 — 절차 판정이며 코드로 재지 않는다 |

**제약**: `C:\Work\git\DocuLight\DocLight`(1.0 저장소)는 **읽기 전용이며 수정 금지**다. AC-1 의 「동결」을 그 저장소를 고치지 않고 달성할 방법을 Wave 5 진입 시점에 먼저 정한다.

## 2. 이 wave 의 설계 항목 (검증 분모)

| id | 좌표 | 규범 문장 |
| --- | --- | --- |
| `DI-W4-01` | Wave 5:78 | MIG-AUTH-002 — 이관한 계정을 전원 active 로 두고 default 그룹에 넣는다 |
| `DI-W4-02` | Wave 5:78 | 1.0 의 bcrypt 해시를 그대로 재사용한다 |
| `DI-W4-03` | Wave 5:78 | 전역 API Key 를 무효화하고 PAT 재발급을 안내한다 |
| `DI-W4-04` | Wave 5:79 | MIG-AUTH-001 — 1.0 을 읽기 전용으로 동결한다. 수단은 운영 절차 문서 선언이다 (사용자 결정 3-A) |
| `DI-W4-05` | Wave 5:79 | 1.0 의 docsRoot 전체를 비-md 포함해 기본 워크스페이스로 복사한다 |
| `DI-W4-06` | Wave 5:79 | 벡터 인덱스는 옮기지 않고 재구축한다 |
| `DI-W4-07` | Wave 5:80 | CON-ARCH-002 AC-8 — 1.0 리포가 동결된 상태로 운영 가능한지 절차로 판정하며 코드로 재지 않는다 |
| `DI-W4-08` | Wave 5:82 | 1.0 저장소(C:/Work/git/DocuLight/DocLight)는 읽기 전용이며 수정하지 않는다 |

## 3. 이 wave 가 건드릴 기존 모듈

- `packages/server/src/app/auth/login-service.ts`
- `packages/server/src/app/workspace`
- `packages/server/src/infra/fs/document-store.ts`

## 4. 요구 범위

`--req-filter` 에 넣을 요구 ID: `MIG-AUTH-002` · `MIG-AUTH-001` · `CON-ARCH-002`
