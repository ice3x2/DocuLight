# Issue 60 설치 마법사 구현 증거

> 독립 리뷰 보완(2026-09-17): `review-fix-evidence.md`를 참조한다. 브라우저 행렬은 이제 12개 환경 모두에서 5단계, 오류 경로, 초점 기하/대비, synthetic composition, native DOM 값 추출, 확대 전후 DPR을 단언한다. 구현 제거 상태의 RED 27/27 실패에서 GREEN 27/27 통과로 strict chronology를 다시 확보했다. 서버 설치 subset의 `/theme-bootstrap.js` 503은 새 제품 빌드 전후 동일하게 재현되며 #60 diff 밖이다.

## 요구사항 기준

- 작업 모드: `sdd`
- 활성 타깃: `phase-1`
- `IR-SHELL-009` — Status `in_progress`, Stability `stable`; AC-4 설치·미설치 라우팅과 설치 화면 범위
- `FR-CONFIRM-019` — Status `verified`, Stability `stable`; L2 확인 관문
- `SEC-AUTH-010`, `SEC-AUTH-011`, `SEC-AUTH-012`, `SEC-AUTH-015`, `SEC-AUTH-017` — Status `verified`, Stability `stable`; 설치 토큰·세션·입력·최초 관리자·정책 계약
- `SEC-AUTH-013` — Status `verified`, Stability `evolving`; 설치 API 오류 계약
- `SEC-AUTH-014` — Status `implemented`, Stability `stable`; 설치 상태 확인
- `IR-AUTH-001` — Status `verified`, Stability `stable`; 설치 전 pre-auth 경계

새 서버 동작이나 API 계약은 추가하지 않았다. 기존 `verify-token` 및 `commit` 요청과 첫 관리자 로그인을 그대로 사용했다.

## TDD First

- 구현 전 원시 RED: `red-install-wizard-newspaper.txt` — 1 file, 7 tests, 7 failed.
- 테스트 의도 독립 검토를 두 번의 별도 검토 축으로 반복했다.
  - 요구사항 의도: Critical 0 / High 0 / Medium 0 / Low 0
  - matcher·비동기 결정성·독립성·계약 커버리지: Critical 0 / High 0 / Medium 0 / Low 0
- 최소 구현 후 관련 GREEN: 3 files, 53 tests passed.
- 전체 웹 회귀: 70 files, 797 tests passed.
- 웹 TypeScript: `tsc --noEmit` passed.

## 실제 제품 검증

`product-install-latest.json`은 자가 포함형 실행기가 만든 임시 docs/SQLite와 임의 포트 서버에서 다음을 검증한 결과다.

- Playwright가 새로 실행하고 소유한 Chromium의 ephemeral context만 사용
- 미설치 화면과 shell 부재
- 실제 `/api/install/verify-token` 및 `/api/install/commit`
- HTTP 200 기존 commit 계약
- 완료 화면이 Start 전까지 유지됨
- Start 뒤 로그인 화면 전환
- 소비된 설치 토큰 재사용 거부
- 생성한 최초 관리자 계정 로그인과 shell 진입
- 임시 데이터, 서버 listener, 브라우저 프로세스 정리
- 토큰·비밀번호·계정 값을 증거에 기록하지 않음

## 화면 매트릭스

`install-matrix-latest/matrix.json`과 24개 PNG는 다음 조합을 모두 통과했다. 각 환경은 검토 및 pending 관문 화면을 각각 캡처한다.

- 1280×720, 1440×900, 1920×1080
- light, dark
- 100%: Playwright가 새로 실행한 headless Chromium과 ephemeral context 6개 환경
- 실제 200%: Playwright persistent Chromium profile과 전용 extension의 `chrome.tabs.setZoom(2)` 6개 환경

각 환경에서 1–4단계, 40px control, 640px 최대 폭, 안전 여백, 수평 overflow 부재, 본문 대비, 긴 한글 이름, `open+edit` 경고, L2 최초 Cancel 초점, Escape 취소와 설치 완료 버튼 초점 복원을 확인했다. 기존/기본 브라우저, 외부 CDP 연결, OS 입력 주입은 사용하지 않았다.

OS 입력이 금지되어 Windows 네이티브 IME 후보창 및 실제 비밀번호 관리자 UI는 이 증거의 측정 범위가 아니다. React composition/키보드 계약과 브라우저 DOM 자동완성 속성은 자동 테스트 범위에 포함된다.
