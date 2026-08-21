# 최신 핸드오프

`C:\Work\git\DocuLight2.0\docs\next\2026-08-21-wave2-acl-core.md`

2026-08-21 작성 · 목표: **wave 9개를 끝까지 완주해 Phase 1 완성 제품을 만든다**

**현재 위치** — wave-1 `complete`(53 Task · 24 요구사항). wave-2(주체와 ACL 판정 코어, 31 요구사항) 미착수.

**다음 첫 행동** — `$env:NODE_ENV="development"` 를 하고 wave-2 의 31개 요구사항을 읽는 것부터.

---

## 시작 전에 알아야 할 것 하나

**이 셸은 `NODE_ENV=production` 이 기본이다.** 그대로 `npm install` 하면 devDependencies 가
빠져 `vitest`·`vite` 가 사라진다. 핸드오프 문서의 「거버넌스·게이트·함정」 절에 상세가 있다.

---

## 이전 문서

`docs/next/` 의 나머지는 이 작업의 **입력**이며 핸드오프가 아니다.

| 문서 | 역할 |
|---|---|
| `00.handoff.md` | 프로젝트 전반 · 작업 방식 제약 · 과거 개정 경위 |
| `01.design-completion.md` | 설계 완성의 범위와 순서 |
| `02.decision-gate.md` | 2026-08-19 사용자 결정 둘 (코드가 아니라 기능 · 전역 검색) |
| `03.wave-decision-gate.md` | 2026-08-20 wave 분해 결과와 결정 셋 |
| `2026-08-21-phase1-wave-implementation.md` | wave-1 구현 착수 시점의 핸드오프 (**낡음** — 위 문서가 최신) |
