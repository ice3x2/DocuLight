---
run_id: 2026-08-25.doculight2.wave1-editor007.coder-0825
plan_run_id: 2026-08-25.doculight2.wave1-editor007
target: phase-1
last_phase: done
last_task: T-PH001-03
next_skill: null
state_ref: ../state.json
---

# T-PH001-03 — 뮤테이션 탐침과 판정 ③ 하향

REQ: `FR-EDITOR-007` (AC-7). 상세 탐침 기록은
`docs/analysis/kiwi-coder-2026-08-25.wave1-editor007.coder-0825/T-PH001-03.mutation-probes.md`.

## 1. 탐침 다섯의 결과

| 탐침 | 예상 | 실측 | 판정 |
| --- | --- | --- | --- |
| ① 선택 겹침 분기 제거 | ②③⑤ 사망 | ②·⑤ 새로 FAIL (③ 은 기준선에서 이미 FAIL) | 일치 |
| ② `tr.selection` 재구성 조건 되돌림 | 같은 항 사망 | ②·⑤ FAIL | 일치 |
| ③ 초점 게이팅 고정 | `read-only.test.tsx` 사망 | 10건 중 4건 FAIL | 일치 |
| ④ `ignoreEvent` 무조건 `true` | ② 만 사망, ⑤ 생존 | ② FAIL · ⑤ PASS | **일치 (핵심)** |
| ⑤ 편집 모드 전 이벤트 개방 | 키 입력이 문서 누출 여부 | **누출 없음** — 아무 시험도 죽지 않음 | 불일치 → 보고 |

## 2. 판정 ③ 하향

`observe()` 채널을 두어 `OBS+` / `OBS-` 로 출력하되 종료 코드에서 뺐다. 시험은 지우지 않았다.
사유(CM6 `posAtCoords(..., scanY)` 가 Text 블록을 만날 때까지 위젯 블록을 건너뛴다)를 그 자리에 적었다.
`node test/table-reveal-check.mjs` → **4/4, 종료 코드 0.**
하향 뒤에도 탐침 ① 을 다시 걸면 ②·⑤ 가 FAIL 하고 종료 코드가 1 이 된다 — 종료 코드가 여전히 회귀를 잡는다.

## 3. 회귀

| 스위트 | 결과 |
| --- | --- |
| `NODE_ENV=production npm test` (editor) | 237 통과 · 1 건너뜀 |
| (server) | 1248 통과 |
| (web) | 521 통과 |
| `test/browser-check.mjs` | 12/12 |
| `test/heightmap-drift-check.mjs` | 3/3 |
| `test/table-reveal-check.mjs` | 4/4 + 관찰 1 |

실패 0. 기준선과 동일.

## 4. 워킹트리

`table-widget.ts` 는 기준선 `bc3527d` 와 **바이트가 같다** (`git diff --exit-code` 통과, `PROBE` 표식 0건).
변경은 `packages/editor/test/table-reveal-check.mjs` 한 건 + sidecar 의 red/green evidence.

## 5. 남긴 것 (PM 이 가져갈 것)

- **탐침 ⑤ 의 불일치.** `ignoreEvent` 포인터 한정의 *사유* — 「모든 이벤트를 열면 칸 초점 상태의
  키 입력이 문서로 샌다」 — 가 실측으로 재현되지 않는다. 한정 자체는 해롭지 않다.
  계획 `§5.1 R-02` 와 `table-widget.ts` 의 `ignoreEvent` 주석이 같은 주장을 담고 있다.
  계획 수정은 이 Task 의 권한 밖이라 고치지 않았다.
- **sidecar 잔여 불일치.** `tdd.test_cases[]` 의 `TC-REQ-FR-EDITOR-007-AC7-08` 은 `test_symbol` 이
  아직 「AC-7 본 판정 — 화살표로…」다. 계획 `OQ-02` 가 정한 조정 범위(하향 + §5.4 기재)에
  이 필드가 없어 손대지 않았다.
