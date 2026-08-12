import { useMemo, useState } from 'react';

import { AtomicCodeMirrorEditor, mermaidBlocks } from '../src/index';

const SAMPLE = `# DocuLight 에디터 — Mermaid 라이브 프리뷰

커서를 다이어그램 블록 **밖**에 두면 렌더된 그림이 보이고,
블록 **안**으로 옮기면 원문이 드러납니다.

\`\`\`mermaid
graph TD
    A[요청서 02] --> B{기성 패키지가 있는가}
    B -->|없다| C[8~12일 직접 구현]
    B -->|있다| D[atomic-editor vendor]
    D --> E[계층 A · extensions 주입]
    D --> F[계층 B · 래퍼 교체]
    D --> G[계층 C · 코어 패치]
    E --> H[Mermaid · KaTeX · 첨부 · 저장]

    classDef start fill:#e0e7ff,stroke:#6366f1,stroke-width:2px,color:#1e1b4b
    classDef decide fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#451a03
    classDef drop fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#450a0a
    classDef pick fill:#dcfce7,stroke:#22c55e,stroke-width:2px,color:#052e16
    classDef work fill:#cffafe,stroke:#06b6d4,stroke-width:2px,color:#083344
    classDef done fill:#fae8ff,stroke:#c026d3,stroke-width:2px,color:#4a044e

    class A start
    class B decide
    class C drop
    class D pick
    class E,F,G work
    class H done
\`\`\`

## 다른 언어 펜스는 대상이 아닙니다

\`\`\`js
const notMermaid = true;
\`\`\`

## 시퀀스 다이어그램

\`\`\`mermaid
sequenceDiagram
    participant U as 편집자
    participant CM as CodeMirror
    participant W as MermaidWidget
    U->>CM: 커서를 블록 밖으로 이동
    CM->>W: toDOM()
    W-->>CM: SVG 삽입
    Note over CM,W: 크기를 캐시해 재마운트 시 높이 변화를 없앤다
\`\`\`

## 색이 여럿인 다이어그램

\`\`\`mermaid
pie showData
    title 남은 작업 비중
    "Mermaid (완료)" : 15
    "수식 KaTeX" : 15
    "소스 모드" : 10
    "첨부 업로드" : 20
    "자동 저장·충돌" : 20
    "병합 뷰" : 20
\`\`\`

\`\`\`mermaid
classDiagram
    class MermaidWidget {
        +string code
        +boolean readOnly
        +toDOM(view) HTMLElement
        +ignoreEvent(event) boolean
    }
    class MermaidRenderer {
        <<interface>>
        +render(code, id) Promise
    }
    MermaidWidget ..> MermaidRenderer : 주입받는다
\`\`\`

## 렌더 실패도 예외를 던지지 않습니다

\`\`\`mermaid
이건 mermaid 문법이 아닙니다 !!!
\`\`\`

## 나머지 라이브 프리뷰

**굵게** · *기울임* · ~~취소선~~ · \`인라인 코드\` · ==하이라이트==

- 목록 항목
- [ ] 태스크
- [x] 완료된 태스크

> 인용문입니다.

| 표 | 편집 |
|---|---|
| 셀을 | 클릭해 보세요 |

[[위키링크]] 와 [일반 링크](https://example.com) 도 동작합니다.
`;

export default function App() {
  const [readOnly, setReadOnly] = useState(false);

  // 참조가 바뀌면 에디터가 remount 된다 — 반드시 안정적으로 유지한다.
  const extensions = useMemo(() => [mermaidBlocks()], []);

  return (
    <div className="demo-shell">
      <header className="demo-bar">
        <strong>DocuLight 에디터 데모</strong>
        <span className="demo-hint">
          vendor 무수정 · <code>extensions</code> 주입만으로 Mermaid 추가
        </span>
        <label className="demo-toggle">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          보기 전용
        </label>
      </header>

      <main className="demo-editor">
        <AtomicCodeMirrorEditor
          documentId="demo"
          markdownSource={SAMPLE}
          readOnly={readOnly}
          extensions={extensions}
        />
      </main>
    </div>
  );
}
