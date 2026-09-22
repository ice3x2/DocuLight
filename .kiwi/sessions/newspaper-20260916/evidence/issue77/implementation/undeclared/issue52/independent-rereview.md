# GitHub #52 independent rereview

## 판정

**FAIL — Critical 0, High 0, Medium 1, Low 1.**

이 재검토는 이전 `independent-review.md`의 Medium 2건과 Low 1건을 현재 diff, 원본 요구사항, Astra 결정, 원시 RED만으로 다시 반증했다. 이전 M2의 동일 source 위치 중복과 이전 L1의 filter hover token은 해소됐다. 이전 M1은 기본 Arrow 선택에서 focus 선이 생기도록 개선됐으나 focus 수명과 clipping 경계가 아직 계약을 충족하지 않는다.

## 발견사항

### Medium 1 — virtual focus 선이 실제 focus를 떠난 뒤 남고 scroll 경계에서 잘린다

현재 `SearchPanel`은 Arrow/Home/End에서 `data-keyboard-navigation=true`를 세우고 pointer 이동에서만 해제한다. CSS는 그 상태와 `aria-selected=true`만으로 결과 outline을 그린다. 따라서 검색 input에서 `Tab`으로 filter trigger에 실제 focus가 이동해도 결과 행의 focus outline이 남는다.

실제 shipped `AppShell` fixture를 Playwright 1280×720에서 검증한 결과다.

```json
{
  "keyboard": {
    "outline": "rgb(54, 91, 112) solid 2px",
    "active": "INPUT",
    "nav": "true"
  },
  "afterTab": {
    "outline": "rgb(54, 91, 112) solid 2px",
    "active": "BUTTON",
    "activeLabel": "검색 대상",
    "nav": "true"
  },
  "pointer": {
    "outline": "rgb(36, 37, 33) none 3px",
    "nav": null
  }
}
```

Pointer hover와 keyboard mode 분리는 동작하지만, Tab 이후에는 filter의 native focus ring과 결과의 가짜 virtual focus가 동시에 보인다. Astra §6의 focus 의미와 §9의 cmdk virtual focus 경계를 위반한다.

outline은 실제로도 잘린다. 첫 결과에 `Home`으로 이동했을 때 계산 기하는 다음과 같다.

```json
{
  "row": {"left":2,"top":126,"right":277},
  "region": {"left":0,"top":124,"right":279},
  "outline": {"width":2,"offset":2,"outerLeft":-2,"outerTop":122,"outerRight":281},
  "overflow": {"x":"auto","y":"auto"},
  "clipped": {"left":true,"top":true,"right":true}
}
```

결과 region padding은 2px인데 2px outline과 2px offset의 바깥 경계에는 4px가 필요하다. 체크인된 checker는 `box.left - 2 >= region.left`만 검사해 outline width를 계산에서 빠뜨리고, 위·아래 경계는 검사하지 않는다. 그래서 실제 clipping을 두고도 12환경이 PASS한다. 재현은 검색 input focus → `Home` 또는 Arrow 선택 → computed outline/box/region 확인, 이어 `Tab` → filter focus 상태에서 결과 outline 확인이다.

### Low 1 — source identity dedupe의 대표 발췌가 OR 항 순서에 따라 달라진다

동일 source start의 중복 개수는 올바르게 하나로 접혔고 별도 source offset은 유지된다. 그러나 `matchedExcerpts`가 query term 순서로 Map에 첫 발췌를 넣기 때문에 동치인 OR 질의의 항 순서를 뒤집으면 대표 excerpt 문자열이 달라진다.

동일 문서에 `alpha`가 두 위치 있는 독립 service probe 결과다.

```json
{
  "alpha | alph": [
    "56789012345678901234alphaABCDEFGHIJKLMNOPQRST",
    "RSTUVWXYZ0123456789 alpha"
  ],
  "alph | alpha": [
    "56789012345678901234alphaABCDEFGHIJKLMNOPQRS",
    "RSTUVWXYZ0123456789 alpha"
  ]
}
```

문서와 source identity, excerpt 개수와 배열 위치는 같지만 첫 excerpt가 한 글자 달라 전체 응답이 동일하지 않다. Astra §12.3의 “OR 가지 순서에 결과 의미가 달라지지 않음”과 결과 문자열 보존 경계에 남은 작은 불안정성이다. 영구 service/HTTP 테스트는 `alpha | alph` 한 방향의 길이 2만 검사해 역순을 잡지 않는다.

## 이전 발견사항 해소 여부

### 이전 M1

부분 해소다. input에 DOM focus가 남은 상태의 Arrow virtual selection은 이제 `aria-selected=true`, selected 배경, 2px 비색상 표식, solid 2px focus outline과 2px offset을 함께 표시한다. Pointer movement는 keyboard mode를 해제하고, composition Enter는 open 0회, composition 종료 뒤 별도 Enter는 선택 결과를 정확히 1회 연다. 위 Medium 1의 focus 이탈과 clipping 때문에 완전 해소로 판정하지 않았다.

### 이전 M2

핵심 결함은 해소됐다. 내부 `Match`만 `identity`를 가지며 API `SearchExcerpt` 필드는 변경되지 않았다. Markdown body는 `body:<source start>`, PDF는 `body:<page>:<source start>`, name/tag/attachment는 각 source와 offset을 구분한다. `alpha | alph`의 같은 첫 위치는 1개이고 두 번째 `alpha` 위치는 별도로 유지된다. 서로 다른 axis와 PDF page도 identity가 충돌하지 않는다. 권한, 문서 순서, name-only read 0, 거부 query/axes 0 read 0, body/PDF 문서당 1회 계약이 회귀하지 않았다. 위 Low 1은 대표값 선택의 추가 경계다.

### 이전 L1

해소됐다. 실제 Radix popover의 unchecked body option hover는 계산된 `--surface-control`과 같고 `--surface-selected`와 다르다. checked name은 native checked와 `aria-checked=true`를 유지한다. Checkbox keyboard focus에는 공통 2px visible focus 표현이 적용된다.

## TDD chronology 감사

세 수정 RED와 pointer RED는 모두 관련 assertion까지 도달했고 대상 구현보다 앞선다.

- `review-red-keyboard-virtual-focus.txt` 04:54:51: 실제 AppShell selected result에서 `outline-style none` 대 `solid`로 실패. CSS 최종 수정 04:56:26보다 앞선다.
- `review-red-overlap-identity.txt` 04:55:11: 영구 service와 실제 Express HTTP 테스트가 모두 3 excerpts 대 2에서 실패. `search-service.ts` 최종 수정 04:56:26보다 앞선다.
- `review-red-filter-hover-token.txt` 04:55:47: 실제 Radix option 계산색이 selected surface여서 control surface assertion에서 실패. CSS 수정보다 앞선다.
- `review-red-pointer-vs-keyboard-state.txt` 04:57:58: pointer reset 구현을 제거한 상태에서 영구 checker가 selected row의 solid outline 대 none에서 실패. `SearchPanel.tsx` 최종 수정 04:58:02보다 앞선다.

각 RED는 menu timing이나 fixture 준비 실패가 아니라 대상 assertion에서 실패한다. Pointer replay는 새 pointer reset만 제거한 뒤 최소 복원했고, service/HTTP overlap assertions와 Playwright focus/hover assertions는 현재 체크인 테스트에 남아 있다. 기존 테스트를 약화한 흔적은 없다. 다만 최종 checker의 clipping 계산이 outline width를 빠뜨리고 blur/Tab 수명을 검사하지 않으며, OR 역순도 영구 테스트에 없어 이번 잔여 결함을 잡지 못한다.

## 독립 실행 결과

- `node packages/web/test/newspaper-search-layout-check.cjs`: PASS. 1280×720, 1440×900, 1920×1080 light/dark 100%와 isolated persistent Chromium extension `chrome.tabs.setZoom(2)` genuine 200% 전부 실행. CSS zoom, deviceScaleFactor, half viewport, CDP emulation 없음.
- 독립 AppShell focus lifecycle/geometry Playwright probe: 기본 keyboard outline과 pointer reset PASS; Tab 후 stale outline과 4px 바깥 경계 clipping 재현.
- 독립 search service OR-order probe: source-position dedupe PASS; 역순 대표 excerpt 차이 재현.
- targeted web search/tag: 3 files, 30/30 PASS.
- targeted parser/service/actual Express HTTP: 3 files, 46/46 PASS.
- full web: 65 files, 711/711 PASS. 기존 nonfatal Happy DOM `URL is not a constructor` trace만 있었다.
- full server: 138 files 중 137 PASS, 1 FAIL; 1,435/1,436 PASS. 유일한 `/theme-bootstrap.js` expected 200/actual 503는 이전 clean `7fe1b32` 재현과 동일하고 새 검색 실패는 없다.
- editor: 21 files, 253 PASS, 1 skipped.
- web typecheck: PASS.
- web build: PASS, 2,980 modules; 기존 bundle-size warning만 있음.
- #47 shared UI: 13 assertions PASS.
- #50 shell checker: PASS.
- #51 tree checker: 체크인 파일을 변경하지 않고 연속 2회 PASS. 첫 실행 visibility race를 재현하지 못했으며 현재 #52 영향이나 배포 checker 안정성 결함의 증거가 없다.
- #51 naming-state checker: PASS.
- theme runtime: 5 checks PASS.
- `git diff --check 7fe1b32`: whitespace error 없음; line-ending warning만 있음.

## 한계

Playwright search fixture는 shipped `AppShell`과 `SearchPanel`을 사용하지만 인증된 실제 backend와 한 프로세스로 연결한 E2E는 아니다. 실제 Express 검색은 별도 HTTP 통합 테스트로 검증했다. 합성 composition은 이벤트 경계를 검증하지만 실제 OS 한국어 IME 후보창 증거는 아니다. 발견사항이 남아 있으므로 PASS로 판정하지 않는다.
