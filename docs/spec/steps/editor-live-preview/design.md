# SDS: Mermaid 라이브 프리뷰 블록 렌더

| Field | Value |
|---|---|
| Document Type | sds |
| Task | editor-live-preview |
| Target | (미지정 — Active Target 없음) |
| Status | draft |
| Date | 2026-08-12 |

## 1. Context & Scope

`packages/editor` 에 vendor 한 `atomic-editor` 는 라이브 프리뷰 7종을 제공하지만 Mermaid 가 없다
(기능 요청서 §3.1-9). 이 스텝은 ` ```mermaid ` 펜스를 커서 밖에서 다이어그램으로 렌더하고
커서가 블록에 닿으면 원문으로 되돌리는 CM6 확장을 추가한다.
경계: 수식·소스 모드·첨부·자동 저장·병합 뷰는 이 스텝의 범위가 아니다.

## 2. Goals / Non-goals

- Goal: ` ```mermaid ` 블록을 커서 밖에서 SVG 로, 커서 안에서 원문으로 표시한다.
- Goal: **vendor 디렉터리를 한 줄도 수정하지 않는다** — `extensions` prop 주입만으로 달성한다(계층 A 가설 검증).
- Goal: 브라우저에서 즉시 확인 가능한 데모를 함께 둔다.
- Non-goal: 수식(KaTeX)·소스 모드·첨부·자동 저장·병합 뷰.
- Non-goal: Mermaid 문법 오류의 상세 진단 UI — 오류 메시지 표시까지만.
- Non-goal: 다이어그램 편집 보조(팔레트·미리보기 창).

## 3. Architecture Decisions

- **Decision**: 블록 위젯을 `StateField` 로 발행한다 / basis: CM6 는 블록 위젯이 ViewPlugin 에서 나오는 것을 금지한다(vendor `image-blocks.ts` 주석) / trade-off: 뷰포트 밖 블록도 상태를 계산 / rejected: ViewPlugin — 런타임 오류.
- **Decision**: 렌더 SVG 크기를 URL 키 캐시에 보관하고 placeholder 에 미리 반영한다 / basis: 위젯이 마운트 후 커지면 heightmap 이 스크롤 애니메이션 중 자라 관성 스크롤이 멈춘다(`image-blocks.ts` `dimensionCache`) / trade-off: 캐시 무효화 필요 / rejected: 렌더 후 크기 확정 — 스크롤 붕괴.
- **Decision**: `mermaid` 를 동적 import 하고 최초 1회만 초기화한다 / basis: R33-c·기능 요청서 §4.4 번들 분리 요구 / trade-off: 첫 렌더 지연 / rejected: 정적 import — 초기 번들 비대.
- **Decision**: 커서 판정은 블록 전체 단위로 한다 / basis: 기능 요청서 §3.2 "멀티라인 블록 = 블록 전체" / trade-off: 없음 / rejected: 줄 단위.
- **Decision**: mermaid 호출을 `MermaidRenderer` 함수 뒤로 밀어 주입 가능하게 한다 / basis: 실제 mermaid 는 SVG 측정을 위해 진짜 DOM 을 요구하여 단위 테스트가 불가능하다(전역 CLAUDE.md §10.3 — 경계를 함수 뒤로) / trade-off: 간접 한 겹 / rejected: 테스트에서 실제 mermaid 호출 — 환경 의존.

## 4. Interfaces

- `mermaidBlocks(config?: MermaidBlocksConfig): Extension` — CM6 확장. `extensions` prop 에 주입한다.
- `MermaidBlocksConfig { renderer?: MermaidRenderer }` — 렌더 경계 주입. 생략 시 동적 import 기본 구현.
- `MermaidRenderer = (code: string, id: string) => Promise<string>` — SVG 문자열 반환. 실패 시 throw.
- `mermaidBlockField: StateField<DecorationSet>` — 위젯 데코레이션 발행 지점. 테스트가 직접 읽는다.
- `renderMermaid(code, id, renderer?): Promise<{ svg: string } | { error: string }>` — 예외를 값으로 변환하는 어댑터(전역 CLAUDE.md §9).
- `isMermaidModuleLoaded(): boolean` — 동적 import 발생 여부.
- `getCachedSize(code) / setCachedSize(code, size)` — placeholder 크기 캐시.
- `findMermaidBlocks(state: EditorState): MermaidBlock[]` — 순수 함수. 구문 트리에서 mermaid 펜스만 추출한다.
- `MermaidBlock { from: number; to: number; code: string }` — `from`/`to` 는 펜스 포함 블록 전체 범위.

## 5. Acceptance Contracts

- SDS-AC-1: WHEN 문서에 ` ```mermaid ` 펜스 블록이 있고 선택 영역이 그 블록 범위 밖에 있으면 THE SYSTEM SHALL 그 블록을 렌더된 다이어그램 위젯으로 대체한다.
- SDS-AC-2: WHEN 선택 영역이 mermaid 블록 범위 안에 있으면 THE SYSTEM SHALL 위젯을 발행하지 않고 원문을 그대로 노출한다.
- SDS-AC-3: WHEN 펜스의 언어 태그가 `mermaid` 가 아니면 THE SYSTEM SHALL 그 블록에 대해 위젯을 발행하지 않는다.
- SDS-AC-4: WHEN mermaid 코드가 문법상 렌더 불가하면 THE SYSTEM SHALL 위젯 자리에 오류 표시를 렌더하고 예외를 전파하지 않는다.
- SDS-AC-5: WHEN 같은 mermaid 코드가 다시 렌더되면 THE SYSTEM SHALL 캐시된 크기를 placeholder 에 적용하여 마운트 후 크기 증가가 발생하지 않게 한다.
- SDS-AC-6: WHEN 문서에 mermaid 블록이 하나도 없으면 THE SYSTEM SHALL `mermaid` 모듈을 import 하지 않는다.
- SDS-AC-7: WHEN 한 문서에 mermaid 블록이 여럿 있으면 THE SYSTEM SHALL 각 블록을 서로 독립적으로 판정·렌더한다.
- SDS-AC-8: WHEN mermaid 렌더가 실패하면 THE SYSTEM SHALL 에디터 DOM 바깥에 어떤 요소도 남기지 않는다.

## 6. Test Plan

| SDS-AC | Test file (planned) | Case summary |
|---|---|---|
| SDS-AC-1 | test/mermaid-blocks.test.ts | 커서를 블록 밖에 두고 위젯 데코레이션 1건 발행 확인 |
| SDS-AC-2 | test/mermaid-blocks.test.ts | 커서를 블록 안으로 옮기면 위젯 0건 |
| SDS-AC-3 | test/mermaid-blocks.test.ts | ` ```js ` · 언어 없는 펜스에서 위젯 0건 |
| SDS-AC-4 | test/mermaid-render.test.ts | 잘못된 코드 입력 시 `{ error }` 반환, throw 없음 |
| SDS-AC-5 | test/mermaid-render.test.ts | 동일 코드 2회 렌더 시 캐시 히트, 크기 동일 |
| SDS-AC-6 | test/mermaid-render.test.ts | 블록 0건 문서에서 동적 import 미발생 |
| SDS-AC-7 | test/mermaid-blocks.test.ts | 블록 2개 중 커서가 든 쪽만 원문, 나머지는 위젯 |
| SDS-AC-8 | test/browser-check.mjs | 렌더 실패 후 에디터 밖 DOM 잔여물 0건 (실제 브라우저 필요) |

## 7. Open Questions

- Active Target 이 비어 있어 `Target` 필드를 채우지 못했다. 승격 전에 target 지정이 필요하다.
- 커서가 블록에 닿았을 때 다이어그램을 **감출지 원문과 나란히 둘지** — 본 SDS 는 기능 요청서 §3.2 를 따라 감추는 쪽으로 확정했다. 옵시디언 실물 대조 시 재검토 대상.
