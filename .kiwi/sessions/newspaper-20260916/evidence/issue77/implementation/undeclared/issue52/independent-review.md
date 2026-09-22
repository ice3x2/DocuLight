# GitHub #52 independent review

## 판정

**FAIL — Critical 0, High 0, Medium 2, Low 1.**

기준은 `7fe1b32` 대비 현재 diff, GitHub #52 원문, `FR-SHELL-013`, `FR-SHELL-014`, `IR-SHELL-009` AC-3, `astra-decision.md`이다. `FR-SHELL-013`과 `FR-SHELL-014`의 Stability는 `evolving`, `IR-SHELL-009`는 `stable`이며, Astra가 허용한 실제 HTTP 문법 연결 외에 새 검색 정책을 만들지 않는 범위는 지켜졌다.

## 발견사항

### Medium 1 — 키보드로 선택한 검색 결과에 요구된 focus 표현이 나타나지 않는다

`packages/web/src/styles/shell.css:361`은 결과 행의 초점선을 `[data-search-result]:focus-visible`에만 건다. cmdk는 입력에 DOM 초점을 유지하고 결과 행은 `aria-selected`/`data-selected`로 활성화하므로 이 선택자는 키보드 결과 이동 중 일치하지 않는다.

실제 `AppShell` fixture를 Playwright 500×400에서 열어 검색 입력에 초점을 둔 뒤 `ArrowDown`을 눌렀다. 선택은 `search-0`에서 `search-1`로 이동했고 결과 행은 `aria-selected=true`였지만 다음처럼 초점선이 없었다.

```json
{
  "active": false,
  "activeTag": "INPUT",
  "outlineStyle": "none",
  "outlineWidth": "3px",
  "aria": "true"
}
```

이는 Astra §6의 “focus는 선택 표식에 추가되는 2px 초점선·2px 분리 영역”과 §9의 cmdk 키보드 경로를 충족하지 않는다. 선택 배경과 2px 세로 표식만 보이고 focus와 selected를 동시에 구분할 수 없다. 체크인된 `newspaper-search-layout-check.cjs`에는 `ArrowDown`, 활성 결과, 결과 focus 스타일 assertion이 전혀 없어 회귀가 통과한다.

재현: fixture에서 검색 탭 → 검색 입력 focus → `ArrowDown` → `[data-search-result][data-selected=true]`의 computed `outlineStyle`과 `document.activeElement` 확인.

### Medium 2 — 같은 본문 위치를 공유하는 OR 항이 발췌를 중복한다

`packages/server/src/app/document/search-service.ts:218-234`의 `matchedExcerpts`는 중복 키를 `axis + excerpt.text + page`로 만든다. `bodyExcerpts`가 검색 항 길이에 따라 서로 다른 끝 위치의 문자열을 반환하므로 같은 시작 위치를 맞힌 OR 항도 텍스트가 한 글자 다르면 서로 다른 일치 지점으로 취급된다.

독립 서버 probe에서 본문을 다음처럼 만들고 `query='alpha | alph'`, `axes=['body']`로 실제 `search`를 호출했다.

```text
0123456789012345678901234alphaABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
```

한 위치만 일치하지만 결과는 다음 두 발췌를 반환했다.

```json
[
  {"axis":"body","text":"56789012345678901234alphaABCDEFGHIJKLMNOPQRST"},
  {"axis":"body","text":"56789012345678901234alphaABCDEFGHIJKLMNOPQRS"}
]
```

이는 Astra §12.1의 “여러 OR 가지가 같은 일치 지점을 공유해도 조립 때문에 복제하지 않는다”를 위반한다. PDF 본문도 같은 `bodyExcerpts` 결과를 사용하므로 동일 경계가 적용된다. 현재 회귀 테스트는 완성된 발췌 문자열이 같은 경우만 Set으로 검사하여 실제 위치가 같고 문자열 길이가 다른 경우를 놓친다.

재현: 긴 앞뒤 문맥 안의 `alpha` 한 번을 `alpha | alph`로 본문 검색하고 반환 발췌 수를 확인한다. 기대 1, 실제 2이다.

### Low 1 — 필터 옵션 hover 표면이 동결된 디자인 토큰과 다르다

`packages/web/src/styles/shell.css:309`의 `[data-search-filter-option]:hover`는 `background: var(--surface-selected)`를 사용한다. Astra §4는 체크박스 행 hover에 `surface-control`을 명시한다. 체크 상태는 실제 체크 표시와 `aria-checked`로 이미 표현되므로 hover에 selected 표면을 사용하는 것은 상태 표현도 혼동한다. 제품 동작과 접근 가능한 체크 상태는 유지되지만 승인된 시각 계약과 다르다.

## 요구사항 및 동작 검증

다음 항목은 독립 실행에서 통과했다.

- 실제 `App`의 `useSearch`는 query와 axes를 query key에 모두 포함하고, 빈 query 또는 axes 0개에서 요청을 끈다. `App → AppShell → SearchPanel`은 idle/loading/success/error를 분리하며 loading은 결과 region에만 `aria-busy=true`를 둔다.
- 현재 요청 실패는 빈 결과로 위장되지 않고 안전한 ErrorState와 기존 `refetch()` retry를 표시한다. 늦은 이전 query 응답은 현재 query 결과를 덮지 않았다. retry는 현재 query/axes를 보존한다.
- 입력과 필터는 같은 줄에서 각각 36px, 필터 폭 48px, 간격 8px였다. 가시 라벨과 설명은 cmdk가 만든 실제 input id에 연결된다. 결과만 스크롤하며 검색 영역과 설정 행은 움직이지 않았다.
- Radix popover는 240px, 12px padding, 6px radius, 4px side offset과 viewport 제한을 사용한다. 네 checkbox 행은 최소 36px이고 네 축 순서·기본 name·저장 복원·즉시 적용·모두 해제 안내가 유지된다. native checkbox Space, Escape 닫기, 트리거 focus 복원이 통과했고 문서 열기 누출은 없었다.
- 결과는 제목 1개, workspace, 서버 발췌 순서의 계층을 유지하고 경로를 합성하지 않는다. 긴 한글/무공백 문자열은 결과 region에 가로 overflow를 만들지 않았고 그룹 내부 별도 scrollbar도 없다. 상한, pagination, clamp, 강조 정책은 추가되지 않았다.
- loading 중에도 입력/필터는 enabled이며 readonly가 아니다. 전용 문법 오류 계약이 없으므로 input invalid를 만들지 않는다. 결과는 disabled 행을 합성하지 않는다.
- 합성 composition 중 Enter는 open/submit 0회였고 composition 종료 뒤 별도 Enter는 결과를 한 번 열었다. 실제 OS 한국어 IME 후보창은 검증하지 못했다.
- 태그 두 진입점의 기존 검색 탭/query 경로, 결과 순서, 권한 필터, 숨김·삭제·예약 경로와 workspace 경계 회귀가 통과했다.

서버는 기존 `domain/search/query.ts`의 `parseQuery`를 `search()` 시작에서 요청당 한 번 호출하며 별도 파서를 만들지 않았다. OR/AND, 그룹별 최소 길이, 혼용 우선순위, literal 괄호, 빈/연속 pipe의 기존 처리, 선택 축 간 same-document AND, 미선택 축 배제, case-insensitive 부분 일치를 확인했다. 거부 질의와 axes 0개는 HTTP 200 `{documents:[]}`이며 본문/PDF를 읽지 않고, name-only 검색도 본문/PDF를 읽지 않는다. 복합 PDF는 문서당 한 번 추출되고 페이지 번호가 유지된다. 실제 Express `/api/search` 테스트는 HTTP 200과 결과 assertion까지 도달한다.

## Playwright와 회귀 실행

- `node packages/web/test/newspaper-search-layout-check.cjs`: PASS. 1280×720, 1440×900, 1920×1080의 light/dark 100%와 persistent isolated Chromium extension의 `chrome.tabs.setZoom(2)` genuine 200%를 실행했다. CSS zoom, deviceScaleFactor, 절반 viewport, CDP emulation은 사용하지 않았다.
- 독립 Playwright keyboard/popover probe: 선택 이동, 결과 scrollTop 변화, checkbox Space, Escape focus 복원, popover viewport 내부 배치는 통과했다. 이 probe에서 Medium 1을 재현했다.
- 검색 targeted web: 3 files, 30/30 PASS.
- 검색/parser/service/실제 HTTP targeted server: 3 files, 44/44 PASS.
- full web: 65 files, 711/711 PASS. Happy DOM의 기존 비치명적 `URL is not a constructor` trace가 있었으나 실패를 숨기지 않았다.
- full editor: 21 files, 253 PASS, 1 skipped.
- web typecheck: PASS.
- web build: PASS, 2,980 modules. 기존 bundle-size warning만 있었다.
- #47~#51 회귀: shared UI 13 assertions PASS, shell PASS, tree PASS, naming-state PASS, theme runtime 5 checks PASS.
- full server: 138 files 중 137 PASS, 1 FAIL; 1,433/1,434 tests PASS. 실패는 `install-assembly.test.ts`의 `/theme-bootstrap.js` expected 200, actual 503이다.

서버 전체 실패는 임의 면책하지 않았다. `7fe1b32`의 분리된 임시 worktree에서 web을 새로 build한 뒤 같은 install-assembly 테스트를 실행해 동일한 `/theme-bootstrap.js` 503을 재현했다(11/12 PASS). 검색 diff는 install gate, 해당 테스트, web public/index를 변경하지 않는다. 따라서 이 실패는 #52가 만든 회귀는 아니지만 저장소 기준선에 실제로 존재하는 결함이다.

## TDD chronology 감사

원시 RED는 관련 assertion까지 도달했고 최종 구현보다 선행했다.

- UI state/layout/IME RED 04:29:29, browser geometry RED 04:30:10은 CSS 04:33:07 및 최종 SearchPanel보다 앞선다.
- 실제 service/HTTP RED 04:34:22는 Express OR assertion과 service OR/min-length/dedupe assertion 네 곳에서 실패했다. 서버 비용 RED 04:35:33은 복합 PDF `calls=2`에서 실패했고 `search-service.ts` 04:35:37보다 앞선다.
- 실제 App state wiring RED 04:36:16은 loading assertion까지 도달했다.
- visible-label 테스트는 04:41:23에 저장되고 RED 04:41:30에서 실제 `for`/cmdk input id 불일치로 실패한 뒤 SearchPanel 04:41:38에 복원됐다.

기존 테스트 약화는 찾지 못했다. `tag-panel.test.tsx`의 변경은 요구된 새 placeholder 문구에 locator를 맞춘 것이며 태그 탐색 assertion을 제거하지 않는다. 다만 최종 checker가 keyboard result focus를 검증하지 않아 Medium 1을 잡지 못했고, dedupe 테스트가 문자열 identity만 보아 Medium 2의 실제 위치 중복을 잡지 못했다. 발견사항을 포함하므로 최종 PASS로 판정할 수 없다.

## 한계

Playwright fixture는 shipped `AppShell`과 `SearchPanel`을 사용하지만 인증된 실제 backend와 한 프로세스에서 연결한 E2E는 아니다. 실제 Express 검색은 별도의 HTTP 통합 테스트로 검증했다. 합성 composition은 이벤트 경계를 검증할 뿐 실제 OS 한국어 IME 후보창 증거가 아니다.
