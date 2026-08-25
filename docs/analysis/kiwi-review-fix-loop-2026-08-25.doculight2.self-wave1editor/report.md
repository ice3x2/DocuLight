---
run_id: 2026-08-25.doculight2.self-wave1editor
mode: self
mode_flags: ["--base b73f70c", "--head HEAD", "--close-reqs", "--auto", "--drive", "--regression-baseline"]
pr_url: null
findings_total: 19
classified: { immediate_fix: 12, discussion_needed: 0, rejected: 3 }
fix_iter: 2
recheck_iter: 1
regression_pass: true
closed_reqs_count: 0
pr_responded: false
---

# 리뷰-수정 루프 보고 — 2026-08-25 · wave-1 (표 원문 노출)

## 1. 이 회차가 무엇을 잡았나

가장 큰 것부터 적는다.

### 완료 진술이 제품에서는 참이 아니었다

wave-1 은 「mermaid 여백이 만드는 heightmap 어긋남을 0 으로 만들었다」로 끝날 뻔했다. 리뷰가 **같은 결함이 코드블록에 그대로 남아 있음**을 잡았다.

- `.dl-code` 에 대응하는 CSS 가 저장소 어디에도 없어 UA 기본 `pre { margin: 1em 0 }` 이 살아 있었다.
- 더 나쁜 것은 **새로 만든 E2E 가 그것을 볼 수 없었다**는 점이다 — 데모는 `mermaidBlocks()` 만 조립하는데 제품은 `codeBlocks()` · `mathBlocks()` 까지 넣는다. 시험이 보는 화면과 제품이 도는 화면이 달랐다.

고친 뒤 데모가 제품과 같은 세 위젯을 조립하게 했고, 재는 자리 위쪽에 코드 펜스와 수식 블록을 넣었다. 수식은 실측 결과 결함이 없었다.

### 커서를 움직일 때마다 문서 전체를 훑고 있었다

`tableField.update` 의 재구성 조건이 편집 모드의 **모든 선택 변경**에서 `buildTableWidgets` 를 부르고, 그 안에서 `ensureSyntaxTree(state, doc.length, 200)` 와 문서 전체 `tree.iterate` 를 돌았다. **표가 하나도 없는 문서에서도** 그랬다.

「선택이 놓인 줄만 훑어 서명을 만들고 그 서명이 바뀔 때만 재구축」으로 좁혔고 캐럿 경로에서 200ms 예산을 뺐다.

| 문서 · 캐럿 200회 | 전 | 후 |
| --- | --- | --- |
| 표 없는 2000문단 | 49.9ms | **2.5ms** |
| 표 1개 | 재구축 200회 · 49.5ms | **재구축 0회** · 1.4ms |

### 이 회차가 스스로 만든 겉보기 회귀

`.dl-code` 를 고치며 `margin` 을 `padding` 으로 옮긴 것이 shiki 의 안쪽 `<pre>` 와 **margin collapsing 을 끊어** 세로 간격을 두 배로 만들었다. 재검증이 잡았고 실측으로 확인했다.

| | 원래 | 회귀 | 고친 뒤 |
| --- | --- | --- | --- |
| 코드블록 위·아래 간격 | 17px | **34px** | 17px |
| 위젯 바깥 상자 | 29px | 97px | 63px |
| 첫 프레임 → shiki 후 | — | 63 → 97px (튐) | 63 → 63px |

`.dl-code > pre { margin: 0 }` 로 안쪽 여백만 죽였다. **두 조건이 함께 서는 이유**는 `margin` 은 위젯 상자 밖으로 새어 `getBoundingClientRect` 에서 빠지지만 `padding` 은 상자 안이라는 것이다 — 여백 총량 1em 을 바깥 padding 하나로 몰면 겉보기는 종전과 같으면서 그 1em 이 전부 측정되는 상자 안에 들어온다.

이 결함이 `heightmap-drift-check` 를 빠져나간 이유는 그 시험이 **어긋남만 재고 간격은 재지 않았기** 때문이다. 판정 ④(겉보기 간격이 위젯이 선언한 padding 과 같은가)를 더했고 red/green 으로 확인했다.

### 리뷰어의 전제 하나가 반증됐다

리뷰는 「`mousedown` 을 열면서 칸 편집 경로 전체가 마우스로 도달 불가가 됐고 코드만 남았다」고 봤다. 브라우저 탐침이 그것을 뒤집었다.

- 칸의 **텍스트**를 누르면 → CM6 가 받아 원문이 드러난다 (AC-7 의 우선순위)
- 칸의 **여백**을 누르면 → `pointerdown` 의 `preventDefault` 가 호환 `mousedown` 을 억제해 초점이 칸으로 가고, 이어 친 글자가 실제로 문서를 바꾼다

죽은 코드가 아니다. 벤더 코드를 지우지 않고 두 자리의 동작 차이와 그 근거를 주석에 적었다.

## 2. 모드 결정 + 범위

셀프 모드. `--base b73f70c --head HEAD` (커밋 다섯, 4792 삽입). 회귀 기준선은 **상위가 pin 한 값**을 그대로 썼다 — 자기 시점 캡처를 하지 않았으므로 방금 만들어진 실패가 「기존 실패」로 분류될 여지가 없다.

## 3. Finding 인벤토리

| 라운드 | CRITICAL | HIGH | MEDIUM | LOW | 계 |
| --- | --- | --- | --- | --- | --- |
| 1차 리뷰 | 0 | 3 | 7 | 4 | 14 |
| 재검증 (새 finding) | 0 | **0** | 3 | 2 | 5 |

축 분포(1차): P1 2 · P2 2 · P4 1 · P6 4 · P7 3 · P8 2.

## 4. 3분류

`--auto` 의 severity 가드레일대로 HIGH·MEDIUM 전건을 `immediate_fix` 로, LOW 는 `rejected` 로 분류했다. 다만 **LOW-1 은 시험 실효 문제라 승격**해 함께 고쳤다 — 판정 하나가 노출 로직을 통째로 지워도 통과하고 있었다.

## 5. 적용된 fix

1차 라운드 11건 · 2차 라운드 1건.

| finding | 무엇을 고쳤나 |
| --- | --- |
| FND-001 | 재구성 판정을 선택 줄 서명 비교로 좁히고 캐럿 경로에서 `ensureSyntaxTree` 제거 |
| FND-002 | 칸 텍스트·여백 두 경로의 동작 차이를 실측해 주석에 명시 (코드 삭제 없음) |
| FND-003 | `.dl-code` CSS 신설 · 데모가 제품과 같은 세 위젯을 조립 · 수식은 결함 없음 확인 |
| FND-004 | 문서 변경 팔도 노출 변화를 보게 함 |
| FND-005 | 어긋남을 재고도 단언하지 않던 것에 판정을 세움 (`|drift| <= 1px`) |
| FND-006 | 진짜 회귀 신호를 「재지 못했다」로 삼키던 분기를 갈라냄 |
| FND-007 | CM6 코어에 `click` 핸들러가 없음을 확인하고 `click` 을 닫음 |
| FND-008 | `selection-touches.ts` 로 세 사본을 합침 (벤더 사본은 경계 때문에 남기고 사유 기록) |
| FND-009 | 초점 게이팅이 표에만 걸린 이유를 코드에 적음 |
| FND-010 | 뷰 없이 노출 규칙을 재는 vitest 6건 신설 |
| FND-011 | 판정 ① 이 초점 없는 시점에 재던 것을 고침 (한계도 정직하게 기록) |
| FND-102 | `.dl-code > pre { margin: 0 }` 로 겉보기 회귀 해소 + 간격 판정 추가 |

## 6. 재검증 결과

직전 14건 중 **resolved 9 · partially-resolved 2 · open 3(거절, 사유 성립)**.

재검증이 독립적으로 확인해 준 것 셋 — `browser-check` 의 판정 이동은 **약화가 아니라 교정**, 신규 vitest 6건은 `focusChangeEffect` 파셋을 실제로 통과하는 **진짜 경로**(mock 아님), **기존 시험이 느슨해진 자리 0건**.

## 7. 회귀 결과

| 항목 | 결과 |
| --- | --- |
| 전 패키지 | editor **243 통과**·1 건너뜀 / server 1248 / web 521 / **실패 0** |
| 기준선 대비 신규 실패 | **0** |
| 타입 검사 | 오류 0 |
| `table-reveal-check` · `heightmap-drift-check` · `browser-check` | 모두 종료 0 |

## 8. (PR 모드 아님)

## 9. 거절한 finding

`rejected_findings.log` 에 사유와 함께 적었다 — `.serena/` 무시 규칙(범위 밖이나 되돌리면 캐시가 `git status` 를 오염시킨다) · `reveal()` 주석 중복(선재) · `docs/spec` 날짜 접두 중복(MCP 도구의 500자 상한과 손 편집 금지가 함께 막는다).

## 10. 잔존 — 다음이 가져갈 것

| id | 내용 | 왜 지금 안 고치나 |
| --- | --- | --- |
| **FND-101** | **`packages/web` 이 `editor.css` · `inline-preview.css` · katex CSS 를 하나도 import 하지 않는다.** 빌드 산출물 CSS 에 해당 클래스가 0건이다. 이번 회차의 `.dl-mermaid-block` · `.dl-code` · `.cm-atomic-table` 이 **제품 화면에 닿지 않으며**, `<pre>` 의 UA margin 은 스타일시트와 무관하므로 코드블록 어긋남이 제품에 그대로 남는다 | 선재 결함이며 import 를 넣으면 제품 겉보기가 크게 달라져 별도 검증이 필요하다 |
| FND-103 | `07.editor.srs.md:733` 이 「`ignoreEvent` 를 mousedown 과 **click** 에 한정해 열어」라고 적는데 이번 수정이 `click` 을 닫았다 | 이 스킬은 §0.8 상 SRS mutation 권한이 없다. `/kiwi-srs-sync` 의 몫이다 |
| FND-104 (LOW) | `ensureSyntaxTree` 제거가 한 트랜잭션짜리 자기치유 창을 남긴다 | 관측되는 오작동이 없고 성능 이득이 크다 |
| FND-105 (LOW) | (재검증 인벤토리 참조) | — |
| 화살표로 표에 진입 | CM6 의 `posAtCoords(scanY)` 가 위젯 블록을 의도적으로 건너뛴다 | keymap 신설이 필요하며 wave 범위 밖. 시험은 기록성 관찰로 남겼다 |
| 칸 여백·이미지 클릭 경로 | 계획 §5.4 의 사전 조건을 충족해 남겼다 | 그 세 경로를 재는 시험이 저장소에 0건이다 |

## 11. REQ verified 전이 — **하지 않았다**

`--close-reqs` 를 받았고 §0.G7 의 차단 조건(회귀 fail · CRITICAL/HIGH 잔존 · draft · status 불일치)에는 **걸리지 않았다.** 그럼에도 `FR-EDITOR-007` 의 `verified` 전이를 **skip 했다.**

사유는 `FND-101` 이다. AC-7 의 증거 `VE-6` 은 **editor 데모에서 잰 것**이고 제품에서 잰 것이 아니다. 제품에는 editor 스타일이 배달되지 않아 코드블록 heightmap 어긋남이 남아 있으며, 그것이 표 클릭을 지나치게 만드는 바로 그 결함이다. 그 상태에서 「검증 완료」를 주는 것은 증거가 덮지 않는 범위를 덮었다고 적는 것이다.

`implemented` 는 유지된다. `verified` 는 `FND-101` 이 닫힌 뒤에 준다.

## 12. 메타

검증 서브에이전트 무응답이 이 회차에도 여러 번 있었다. 각 자식이 그 사실을 보고하고 기계적 독립 채널(뮤테이션 재탐침 · 주석 제거 후 diff 대조 · 반복 실행 · 계수)로 대체했으며, 받지 못한 보고의 내용은 어느 것도 인용하지 않았다.
