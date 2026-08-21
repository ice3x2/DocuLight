# 최신 핸드오프

`C:\Work\git\DocuLight2.0\docs\next\2026-08-21-phase1-wave-implementation.md`

2026-08-21 작성(2차 갱신) · 목표: **wave 9개를 끝까지 완주해 완성된 제품을 만든다**

**현재 위치** — wave-1 의 9개 Phase 중 **8개 완료** (53 Task 중 35). 제품이 돈다.
`npm test` 가 editor 102 + server 96 으로 exit 0 이고, 빌드 산출물을 띄우면
SPA 가 200 · API 가 404 · 기본 워크스페이스 1개가 선다.

**남은 것** — `PH-009`(규약 검토 6건, 서브에이전트 판정 중) → wave-1 종료
상호검증 → wave-2~9(226 요구사항).

**다음 첫 행동** — `export NODE_ENV=development` 를 하고 PH-009 검토 판정을
받아 요구사항 Status 를 올리는 것부터. 아래 본문 §8 은 `T-PH004-01` 부터라고
적혀 있으나 그 구간은 끝났다 — **본문 §8 보다 이 줄이 최신이다.**

---

## 시작 전에 알아야 할 것 하나

**이 셸은 `NODE_ENV=production` 이 기본이다.** 그대로 `npm install` 하면 devDependencies 가
빠져 `vitest`·`vite` 가 사라지고 typecheck 가 깨진다. 문서 §9 함정 ①에 상세가 있다.

---

## 이전 문서

`docs/next/` 의 나머지는 이 작업의 **입력**이며 핸드오프가 아니다.

| 문서 | 역할 |
|---|---|
| `00.handoff.md` | 프로젝트 전반 · 작업 방식 제약 · 과거 개정 경위 |
| `01.design-completion.md` | 설계 완성의 범위와 순서 |
| `02.decision-gate.md` | 2026-08-19 사용자 결정 둘 (코드가 아니라 기능 · 전역 검색) |
| `03.wave-decision-gate.md` | 2026-08-20 wave 분해 결과와 결정 셋 |
