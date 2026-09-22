# Issue 78 independent final review

검토 대상은 live GitHub #78, `IR-ACL-004`, `grant-entry-capability-decision.md`, 현재 staged 제품 코드·테스트, raw RED/GREEN 로그와 제품 브라우저 증거다. 구현자 보고의 결론에 의존하지 않고 실제 diff와 증거 파일을 직접 대조했다.

## Findings history

요구사항 작성 단계에서는 다음 계약 누락과 모호성을 지적했다.

- H1: node·인증 주체·operation·modal generation이 바뀐 뒤 도착하는 grant/revoke/refetch 결과의 폐기 계약이 없었다.
- M1: duplicate tuple의 실제 ID·기존 `grantedBy`·행 수 불변, view/edit 분리 및 `SEC-ACL-009` trace가 충분하지 않았다.
- M2: 「정확히 한 번 DELETE」가 pending 중복 방지와 실패 후 사용자의 명시 재시도를 구분하지 않았다.
- 후속 M1: 존재하지 않는 `receipt 조회` 표현이 설계의 후속 조회(refetch)를 잘못 나타냈다.

최종 `IR-ACL-004`와 live #78은 위 항목을 모두 수정했다. 실제 ID와 기존 회수 정책, duplicate 불변성, 활성화당 DELETE 1회, pending 중복 차단, 실패 후 명시 재시도, 후속 조회 결과의 context 귀속을 직접 검증 가능한 AC로 둔다.

첫 구현 검토에서는 M1 한 건을 발견했다. in-flight grant/revoke 중 principal selection·selection invalidation·level 변경이 operation generation을 바꾸지만 `pending`을 해제하지 않아, 늦은 결과는 폐기되어도 modal이 계속 비활성화되는 문제였다. 수정 후 `supersedeOperation()`이 generation 증가, revoke-preparation token 폐기, pending/preparing 해제, gate/revoke target 정리를 함께 수행하며 세 경로가 모두 이 함수를 사용한다. 이전 generation의 `safeAction`과 revoke completion은 새 generation의 상태를 갱신하기 전에 반환한다.

이 수정의 raw RED인 `red-pending-generation.txt`는 replacement selection과 level-change revoke에서 2 failed/10 passed를 기록한다. `green-pending-generation-attempt1.txt`는 12/12, `green-pending-generation-focused.txt`는 관련 API·#65 lifecycle·screen wiring을 포함해 111/111을 기록한다. 구현 전 서버 RED, receipt UI 제거 후 재구축 RED, 후속 retry/refetch/lock/container RED도 각 로그에 보존되어 있다.

## Independent verification

현재 staged snapshot에서 다음을 독립 재실행했다.

- server receipt, route, repository identity: 3 files, 18/18 passed.
- web API client, receipt lifecycle, #65 lifecycle, screen wiring: 4 files, 111/111 passed.

저장된 최종 회귀 증거도 직접 확인했다.

- `full-web-pending-generation.txt`: 78 files, 933/933 passed.
- `typecheck-all-pending-generation.txt`: editor, server, web typecheck passed.
- server full suite: 140 files 중 139 files passed, 1440/1441 tests passed. 유일한 실패는 install 조립 시험에서 `/theme-bootstrap.js`가 기대한 200 대신 503을 반환한 기존 실패다. #78 diff는 install route, theme asset 또는 assembly fixture를 변경하지 않으며 focused rerun도 같은 실패를 재현하므로 #78과 비인과적이다. 이를 전체 server PASS로 간주하지 않는다.

코드 검토로 다음 계약을 확인했다.

- receipt의 `entryId`는 grant service/repository가 반환한 실제 ID다.
- `canRevoke`는 기존 domain policy를 재사용하고 DELETE는 실행 시 현재 권한을 다시 검사한다.
- comma-separated, case-insensitive `Prefer: return=representation`만 200 최소 receipt를 선택하며 무관한 preference와 기존 요청은 204를 유지한다.
- receipt는 정확히 `entryId`, `canRevoke`만 포함하고 editor share view의 `rows=null`을 유지한다.
- duplicate tuple은 ID, 기존 `grantedBy`, 행 수를 유지하고 view/edit tuple은 분리된다.
- malformed/missing receipt와 legacy 204는 accepted-without-receipt로 처리하며 grant POST를 자동 반복하지 않는다.
- receipt revoke의 pending 중복, 명시 재시도, stale completion, failed refetch 보존, container L2 확인 및 관리자 fresh exact-row fallback이 유지된다.

## Product browser evidence

`product-run-attempt6.txt`, `product-browser-observation.json`, `product-persistence.json`과 제품 runner를 직접 확인했다.

- Playwright가 새로 시작한 Chromium 두 개와 서로 격리된 context 두 개만 사용한다.
- editor 경로는 disposable persistent profile과 전용 extension을 사용한다.
- 같은 mounted dialog에서 `chrome.tabs.setZoom`/`getZoom`으로 1 → 2 → 1을 측정했고 `getZoomAt200`은 정확히 2다.
- editor-owned grant는 최소 200 receipt로 정확한 DELETE 한 번을 보낸 뒤 저장 행이 제거됐다.
- foreign duplicate는 `canRevoke:false`, enabled revoke 없음, DELETE 없음, 원래 grantor와 행 수 보존을 확인했다.
- editor의 share 응답은 전후 모두 `rows:null`이고 administrator 제품 경로도 실제 receipt와 DELETE를 통과했다.
- 기존 브라우저 연결, `connectOverCDP`, OS 입력 주입을 사용하지 않는다. runner가 소유한 server, browser/context, 임시 profile만 닫고 제거하며 `node.exe`/`nodex.exe` 이름 기준 일괄 종료나 다른 프로세스 kill을 사용하지 않는다.

native Windows IME 후보창, 브라우저 확장 UI, password-manager UI와 native dialog는 검증하지 않았다. 입력은 Playwright DOM 입력이며 extension은 실제 tab zoom 설정과 측정에만 사용됐다. legacy/malformed 서버 호환은 자동 client test로 검증했고 별도 구버전 서버 제품 배포는 실행하지 않았다. 이 한계는 #78의 receipt·권한·privacy 결론을 약화하지 않는다.

## Final decision

**C0/H0/M0/L0 — PASS.**

IR-ACL-004와 #78의 기능, 보안, privacy, compatibility, TDD, stale-context, L2 및 제품 브라우저 요구가 현재 staged 구현과 증거에서 충족된다. 새 finding은 없다.
