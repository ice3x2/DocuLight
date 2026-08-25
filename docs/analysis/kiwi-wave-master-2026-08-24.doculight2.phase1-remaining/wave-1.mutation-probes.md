# wave-1 뮤테이션 탐침 — 표 원문 노출 상태 시험

측정일 2026-08-25. 대상 `packages/editor/src/vendor/atomic-editor/__tests__/table-reveal-state.test.ts` 전 7 항.
겨눈 소스 `packages/editor/src/vendor/atomic-editor/table-widget.ts`.

제약 `C-14` — 「새 시험을 쓰면 대상 소스를 고의로 망가뜨려 그 시험이 죽는지 확인한다」.
이 시험들은 이미 서 있는 동작을 재는 특성 시험이라 red 선행이 성립하지 않는다.
그래서 red 를 **뮤테이션 탐침으로 대신 확보**했다 — 각 항이 겨누는 판정을 하나씩
되돌리고 그 항이 죽는지 본다. 죽지 않으면 그 항은 아무것도 재고 있지 않다.

방식: 되돌림 하나마다 `NODE_ENV=production npx vitest run <시험파일>` 를 돌려
항별 통과/실패를 json 리포터로 읽고, 매 회차 뒤 소스를 원문으로 되돌렸다.
기준선은 7/7 통과.

## 결과

| # | 시험 | 되돌린 것 | 그 시험 | 함께 죽은 항 |
|---|------|-----------|---------|--------------|
| M1 | 초점이 있으면 커서가 닿은 표만 드러나고 나머지 표는 위젯으로 선다 | `buildTableWidgets` 의 노출 조건에서 `selectionTouches` 연언 제거 (`revealable && selectionTouches(...)` → `revealable`) | **죽었다** | M2·M7 의 항 |
| M2 | 커서를 표에 올리면 위젯이 걷히고, 빼면 다시 선다 | `tableField.update` 의 선택-전용 갈래에서 재빌드 제거 (`revealChanged ? build : deco` → `deco`) | **죽었다** | M1·M3·M4·M7 의 항 |
| M3 | 초점을 잃으면 커서가 표에 있어도 위젯이 다시 선다 | `canRevealSource` 에서 초점 연언 제거 (`state.field(tableFocusField) && !readOnly` → `!readOnly`) | **죽었다** | M6 의 항 |
| M4 | 읽기 전용이면 초점이 있고 커서가 표에 있어도 원문이 드러나지 않는다 | `canRevealSource` 에서 `!readOnly` 연언 제거 (`focus && !readOnly` → `focus`) | **죽었다** | 없음 |
| M5 | 표에 닿지 않는 커서 이동은 데코레이션 집합을 다시 만들지 않는다 | `revealChanged` 에서 `revealedTableSignature` 비교 제거 (선택이 바뀌면 무조건 재빌드) | **죽었다** | M6 의 항 |
| M6 | 초점이 없으면 커서를 표에 올려도 다시 만들지 않는다 | `revealedTableSignature` 의 `if (!canRevealSource(state)) return ''` 조기 반환 제거 | **죽었다** | M1·M3·M4·M7 의 항 |
| M7 | 표를 떠나는 변경+선택 트랜잭션이 원문을 드러난 채 남기지 않는다 | 문서 변경 갈래에서 `|| revealChanged` 제거 | **죽었다** | 없음 |

7/7 이 겨눈 되돌림에 죽는다. 「함께 죽은 항」은 되돌림 하나가 여러 항이 공유하는
판정을 건드려 생긴 부수 사망이며, 각 항이 **자기 판정**에 죽는다는 사실을 흐리지
않는다.

## 살아남아서 고친 것 — 옛 M1

첫 회차에서 항 하나가 되돌림에 **살아남았다**.

- 옛 항: `초점이 있고 커서가 표 밖이면 위젯이 선다`
  ```ts
  const state = withFocus(stateOf(DOC, 0), true);
  expect(widgetCount(state)).toBe(1);
  ```
- 되돌림: 노출 조건에서 `selectionTouches` 를 통째로 뺐다 — 초점만 있으면 모든
  표의 원문이 드러나게 된다.
- 결과: **통과했다.** 즉 이 항은 초점이 켜진 동안의 노출 규칙을 재고 있지 않았다.

원인. 커서를 표 밖에 둔 채 초점만 켜면 `revealedTableSignature` 가 앞뒤로 모두
빈 문자열이라 `revealChanged` 가 서지 않고, `tableField` 는 데코레이션을 그대로
물려준다. 그래서 이 항이 실제로 재던 것은 **상태가 만들어질 때(초점 없음)의
결과**였고, `buildTableWidgets` 는 초점이 켜진 채로 단 한 번도 돌지 않았다.
`canRevealSource` 가 무엇을 하든 결과가 같으니 무엇도 잴 수 없다.

고침. 커서를 표 **안**에 두고 초점을 켜 규칙이 실제로 다시 돌게 하고, 커서가
닿지 않은 **다른** 표가 위젯으로 서 있는지를 잰다. 문서에 표를 하나 더 두어
「커서가 닿은 표만 드러난다」는 판정으로 세웠다 — 원래 의도(초점이 있고 커서가
닿지 않은 표는 선다)를 유지하면서, 재빌드를 강제해 비어 있지 않게 만든다.
고친 뒤 같은 되돌림에 죽는다(위 표 M1).

## 새로 세운 항 — 읽기 전용 축 (M4)

`canRevealSource` 의 `!readOnly` 연언을 겨누는 시험이 저장소에 0 건이었다.
읽기 전용에서 원문이 드러나지 않는다는 것은 이 wave 의 안전 조건인데 —
드러나면 사용자가 고칠 수도 없는 파이프 원문을 보게 된다 — 그것을 재는 자동
시험이 없었다.

`읽기 전용이면 초점이 있고 커서가 표에 있어도 원문이 드러나지 않는다` 를 세웠다.
같은 자리·같은 초점의 **편집 가능한** 상태가 원문을 드러낸다는 대조를 항 안에
함께 두어, 커서 위치를 잘못 짚어 공허하게 통과하는 길을 막았다. `!readOnly` 만
빼는 되돌림에 죽고, 다른 여섯 항은 그 되돌림에 살아남는다 — 이 항이 그 축을
혼자 잡고 있다는 뜻이다.

## 원상복구

모든 되돌림은 회차마다 즉시 취소했고, 마지막에 원문을 다시 썼다.
`git diff -- packages/editor/src/vendor/atomic-editor/table-widget.ts` 는 비어 있다.
이 fix 가 남긴 소스 변경은 시험 파일과 브라우저 시험 진입점·문서뿐이다.
