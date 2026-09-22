# GitHub #60 최종 독립 검토

검토일: 2026-09-17
판정: **FAIL — Critical 0 / High 0 / Medium 2 / Low 1**

## 범위

GitHub issue #60 원문, `docs/spec/00.index.md`, `IR-SHELL-009`, `IR-AUTH-001`, `FR-CONFIRM-019`, `SEC-AUTH-010`–`SEC-AUTH-017`, `astra-decision.md`, HEAD 대비 현재 전체 diff와 신규 파일, issue60 원시 RED 및 구현·Playwright 증거를 서로 대조했다. 제품 코드는 수정하지 않았다.

## Findings

### Medium 1 — 12환경 브라우저 검사가 결정 문서의 필수 상태 행렬을 판별하지 않는다

`packages/web/test/newspaper-install-check.cjs:74-104`의 `drive()`는 1–4단계만 `inspect()`하고, L2를 연 뒤 fixture의 영구 pending Promise에서 끝난다. 독립 실행으로 다시 생성한 `install-matrix-latest/matrix.json`도 12개 환경 모두 `stages.length === 4`였다. 따라서 다음 필수 항목은 12환경 증거에 없다.

- 5단계 완료 화면과 Start의 도달성·기하·스크롤·초점
- 토큰 오류, 비밀번호 불일치, stage-4 commit 실패
- focus indicator의 2px/offset/viewport bounds와 control contrast
- 설치 화면의 synthetic composition 및 autofill DOM 값과 제출 횟수
- actual-200%의 pre/post DPR 기록

검사는 persistent context와 extension `chrome.tabs.setZoom(2)`를 실제로 사용하고 `getZoom === 2`와 CSS viewport 폭 비율을 확인하므로 실제 200% 방식 자체는 올바르다. `newspaper-install-product-check.mjs`도 1440×900 light의 실제 제품 happy path에서 완료와 Start를 확인한다. 그러나 단일 제품 환경의 happy path는 결정 문서가 명시한 “12 environments for each of the five stages plus … errors … pending and stage-4 commit failure”를 대체하지 않는다. `implementation-evidence.md`는 실제로 확인한 범위를 “각 환경에서 1–4단계”라고 써서 이 제한을 숨기지는 않았지만, 최종 수용 조건은 충족하지 못했다.

재현:

```text
npm run test:browser:install-newspaper
PASS (exit 0)

node -e "...matrix.evidence.map(x => x.stages.length)..."
12 environments; every stages.length = 4
```

### Medium 2 — strict TDD chronology가 최종 동작 대부분에 대해 성립하지 않는다

보존된 `red-install-wizard-newspaper.txt`는 구현 전 **7 tests / 7 failed**만 포함한다. 현재 `install-wizard-newspaper.test.tsx`는 **26 tests**이며, 원시 RED 뒤에 추가된 축에는 stale token response, 세 signup enum, 세 permission enum, open+edit 및 비경고 조합, invalid/transport/429 구분, 다섯 commit rule, `empty-password`의 invalid/focus가 포함된다. 이 최종 assertion들에 도달한 구현 전 RED 로그는 issue60 증거에 없다.

파일 시간도 최종 테스트 파일 `14:49:22`가 `InstallWizard.tsx` `14:49:10`보다 뒤여서, 최소한 최종 테스트 집합이 구현보다 먼저 고정되었다는 주장과 맞지 않는다. `ConfirmGate.tsx`는 `14:53:55`로 더 늦지만 별도 raw RED가 없어 어느 후행 assertion이 해당 shared 구현을 먼저 깨뜨렸는지 재생할 수 없다. AGENTS.md의 “test-after이면 구현을 모두 제거하고 test-first로 다시 진행” 규칙을 만족하는 제거→RED→최소 복원 기록도 없다.

원시 RED의 일곱 축은 진짜 구형 one-screen UI에서 접근 가능한 heading을 찾지 못해 실패했고, 첫 실패가 setup/menu timing이 아니라 대상 UI assertion에 도달했으므로 그 부분은 유효하다. 문제는 최종 26개 동작 전체로 chronology 주장을 확장할 수 없다는 점이다.

재현:

```text
red-install-wizard-newspaper.txt: 1 file, 7 tests, 7 failed
npm test -- --run test/install-wizard-newspaper.test.tsx --reporter=verbose
1 file, 26 tests passed
```

### Low 1 — 관련 install-assembly 회귀가 현재 트리에서 1건 실패한다

관련 서버 회귀 36건을 독립 실행했을 때 35건은 통과했지만 `SEC-AUTH-011 — AC-1: 빌드 산출물이 실제로 가리키는 자산 경로가 막히지 않는다`가 실패했다. 정확한 차이는 `/theme-bootstrap.js` 예상 200, 실제 503이다.

```text
npm test -- --run test/http/install-routes.test.ts test/http/install-gate.test.ts test/http/install-assembly.test.ts
Test Files 1 failed | 2 passed
Tests 1 failed | 35 passed
packages/server/test/http/install-assembly.test.ts:119
expected ["/theme-bootstrap.js", 503] to equal ["/theme-bootstrap.js", 200]
```

#60 diff는 server, install gate, Vite asset assembly를 변경하지 않아 이 실패를 #60이 새로 만든 것으로 귀속할 근거는 없다. 실제 disposable product 검사는 빌드된 앱으로 설치부터 첫 관리자 로그인까지 성공했다. 그래도 Astra checklist가 명시한 install-assembly regression은 현재 green이 아니므로 최종 회귀 증거에는 이 제한을 남긴다.

## 독립 실행 결과

- `npm test -- --run test/install-wizard-newspaper.test.tsx test/install-wizard.test.tsx test/confirm-gate.test.tsx` — 3 files, 63 passed.
- `npm test -- --run test/install-wizard-newspaper.test.tsx --reporter=verbose` — 1 file, 26 passed.
- `npm test -- --run` (`packages/web`) — 70 files, 797 passed.
- `npm run typecheck` (`packages/web`) — passed.
- `npm run test:browser:install-newspaper` — passed; 1280×720, 1440×900, 1920×1080 × light/dark × 100%/actual 200%, 12 environments and 24 screenshots regenerated.
- `npm run test:browser:install-product` — passed; server/web production build, disposable DB/docs, actual verify→commit 200→persistent completion→Start→login→shell, consumed token rejection.
- server install regressions — 35 passed, 1 pre-existing-scope assembly failure as described above.
- `git diff --check` — no whitespace errors.

## 보안·프로세스·범위 관찰

두 브라우저 검사 모두 Playwright가 새로 실행해 소유한 Chromium만 사용했다. 100%는 새 ephemeral context, 실제 200%는 격리 persistent profile과 전용 extension의 `chrome.tabs.setZoom(2)`를 사용했다. 기존 브라우저 attach, 외부 CDP endpoint, OS/HWND 입력 주입은 없었다. 프로세스를 이름으로 종료하지 않았고 각 runner가 소유한 Vite/server/browser만 닫았다.

제품 runner는 bootstrap 출력과 token announce를 억제하고 자격 값을 자식 환경변수로만 전달한다. `product-install-latest.json`에는 endpoint와 boolean 결과만 있고 토큰·비밀번호·세션 값은 없다. 독립 실행 뒤 `doculight-issue60-*` 임시 디렉터리는 0개였고 3421 listener도 남지 않았다. Native Windows IME 후보창과 실제 password-manager UI는 Playwright-only 제약상 검증하지 않았다는 증거 설명은 정직하다.

코드 범위는 기존 verify/commit API 계약을 사용하며 새 의존성이나 라이선스를 추가하지 않았다. 다섯 단계, fixed `workspace`, signup/permission enum, 단일 L2, pending dismiss 차단, safe error mapping, 완료 후 Start handoff의 자동 테스트와 실제 제품 happy path는 통과했다. 위 두 Medium이 남아 있으므로 최종 PASS로 판정할 수 없다.
