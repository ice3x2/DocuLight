# wave-1 — 설계 발췌

| Field | Value |
| --- | --- |
| run_id | `2026-08-24.doculight2.phase1-remaining` |
| 원본 | `docs/plans/2026-08-24.remaining-work-order.md` |
| SSOT 절 | Wave 2-a — 표 라이브 프리뷰의 「드러나는 절반」 구현 |
| 좌표 | 45~55 행 |
| target | `phase-1` (wave-N target 을 새로 만들지 않는다 — 제약 C-01) |
| 설계 항목 | 4개 |

> 이 문서는 `/kiwi-srs` 의 `--research-doc` 입력이자 웨이브 종료 상호검증의 설계 계층 분모다. 여기 없는 것은 어느 계층에도 보이지 않는다.

## 1. 원본 발췌

### Wave 2-a — 표 라이브 프리뷰의 「드러나는 절반」 구현

**수동 검증으로 닫을 수 없는 항목이다.** 브라우저 확인 결과 숨는 절반만 동작하고, 커서를 표 안으로 넣는 수단 셋(셀 클릭 · 아래 화살표 · 위 화살표)을 모두 시도해도 구분선이 드러나지 않았다. 커서 진입 전후 화면이 바이트 단위로 동일했다.

원인은 구현 방식이 다르다는 것이다 — `code-blocks.ts`·`math-blocks.ts` 는 `selectionTouches` 로 커서가 닿으면 데코레이션을 걷지만, 표는 `packages/editor/src/vendor/atomic-editor/table-widget.ts` 의 **원자 위젯**이며 각 칸을 `contenteditable` 로 만드는 WYSIWYG 표 편집기다. `doculight-extensions.ts` 에는 표 확장이 아예 없다.

| 순서 | 요구 | 남은 것 |
|---|---|---|
| 3 | `FR-EDITOR-007` AC-7 | 표에도 `selectionTouches` 노출 규칙을 세운다. **먼저 정할 것** — 커서가 표에 닿았을 때 원문 노출과 기존 칸 편집 중 어느 쪽이 우선인가. 벤더 위젯을 고치는 일이므로 그 경계도 함께 판정한다 |

이 wave 는 저장소·MCP 축과 독립이므로 순서상 어디에 두어도 무방하다. 다만 `packages/editor` 만 건드리므로 다른 wave 와 충돌하지 않는다.

## 2. 이 wave 의 설계 항목 (검증 분모)

| id | 좌표 | 규범 문장 |
| --- | --- | --- |
| `DI-W1-01` | Wave 2 > Wave 2-a:53 | 표에도 selectionTouches 노출 규칙을 세워 커서가 닿으면 표의 마크다운 원문이 드러나게 한다 (FR-EDITOR-007 AC-7) |
| `DI-W1-02` | Wave 2 > Wave 2-a:53 | 착수 전에 커서가 표에 닿았을 때 원문 노출과 기존 칸 편집 중 어느 쪽이 우선인지 먼저 정한다 |
| `DI-W1-03` | Wave 2 > Wave 2-a:53 | 벤더 위젯(atomic-editor)을 고치는 일이므로 벤더 코드와 DocuLight 코드의 경계를 함께 판정한다 |
| `DI-W1-04` | Wave 2 > Wave 2-a:47 | 숨는 절반은 이미 동작하므로 회귀시키지 않는다 — 커서가 없을 때 표가 렌더되고 구분선이 숨는 상태를 유지한다 |

## 3. 이 wave 가 건드릴 기존 모듈

- `packages/editor/src/vendor/atomic-editor/table-widget.ts`
- `packages/editor/src/core/code-blocks.ts`
- `packages/editor/src/doculight-extensions.ts`
- `packages/editor/test/live-preview.test.tsx`

## 4. 요구 범위

`--req-filter` 에 넣을 요구 ID: `FR-EDITOR-007`
