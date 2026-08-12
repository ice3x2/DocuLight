# @doculight/editor

DocuLight 2.0 마크다운 **라이브 프리뷰** 에디터.
커서가 닿지 않은 마크다운은 렌더된 모습으로, 커서가 닿으면 원문으로 보인다.

이 패키지 안에는 **에디터만** 있다. 백엔드 없이 독립 실행된다.

## 실행

```bash
npm install
npm run dev          # http://localhost:3399
```

> Windows 에서 `NODE_ENV=production` 이 잡혀 있으면 devDependencies 가 설치되지 않는다.
> `NODE_ENV=development npm install --include=dev` 로 설치한다.

## 검증

| 명령 | 대상 |
|---|---|
| `npm test` | 데코레이션 발행 로직 (happy-dom, 19건) |
| `npm run test:browser` | 실제 렌더·커서 왕복·DOM 누출 (Chromium, 8건) |
| `npm run test:browser:headed` | 위와 같되 브라우저 창을 띄운다 |
| `npm run typecheck` | 타입 |

`test:browser` 는 `npm run dev` 가 떠 있어야 한다. mermaid 는 SVG 를 실제로 측정하므로
진짜 브라우저가 아니면 렌더 자체가 성립하지 않는다.

## 구조

```
src/
├─ core/      프레임워크 중립 CodeMirror 6 확장 (R33-c)
├─ vendor/    atomic-editor 원본 — 수정 금지, UPSTREAM.md 참조
└─ styles/
demo/         브라우저 확인용 데모 앱
test/
```

**의존 방향은 한쪽이다** — `core/` 는 React 를 모른다. React 결합은 얇은 래퍼 한 겹으로 제한한다.

## 확장 추가하기

`vendor/` 를 고치지 않고 CM6 확장을 주입하는 것이 기본이다.

```tsx
import { AtomicCodeMirrorEditor, mermaidBlocks } from '@doculight/editor';

const extensions = useMemo(() => [mermaidBlocks()], []);  // 참조를 고정할 것 — 바뀌면 remount 된다

<AtomicCodeMirrorEditor documentId="doc-1" markdownSource={md} extensions={extensions} />
```

블록 위젯은 `StateField` 에서 발행해야 한다. CM6 는 ViewPlugin 발행을 거부한다.
`src/core/mermaid-blocks.ts` 가 그 본보기다.

### 렌더 경계는 주입 가능하다

```ts
mermaidBlocks({ renderer: async (code, id) => '<svg …></svg>' })
```

기본 구현은 `mermaid` 를 동적 import 한다. 테스트는 가짜 renderer 를 넣어 브라우저 없이 돈다.

## 문서

- 조사·설계 근거 — [`docs/research/editor/`](../../docs/research/editor/00.index.md)
- 요구사항 — [`docs/spec/02.feature-request-live-preview.md`](../../docs/spec/02.feature-request-live-preview.md)
- 현재 스텝 SDS — [`docs/spec/steps/editor-live-preview/design.md`](../../docs/spec/steps/editor-live-preview/design.md)

## 아직 없는 것

수식(KaTeX) · 소스 모드 · 첨부 붙여넣기 · 자동 저장 · 병합 뷰.
착수 순서는 [구현 계획](../../docs/research/editor/03.implementation-plan.md) §3 참조.
