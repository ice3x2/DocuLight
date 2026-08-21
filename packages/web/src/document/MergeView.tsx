import { MergeView as CodeMirrorMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';

/**
 * 나란히 대조하는 화면 (`IR-STORAGE-001` · `FR-EDITOR-008`).
 *
 * **버전 비교와 충돌 병합이 같은 컴포넌트다** (`IR-STORAGE-001` AC-3).
 * 둘을 따로 만들면 한쪽에만 손이 가서 같은 조작이 두 화면에서 다르게
 * 동작하게 된다 — 그런데 사용자에게는 둘 다 「나란히 놓고 고르는 일」이다.
 */

/** 이 화면이 서 있는 엔진. 조항이 이름으로 지목한 패키지다. */
export function mergeEngine(): string {
  return '@codemirror/merge';
}

export function MergeView({
  label,
  left,
  right,
  onResolve,
}: {
  label: string;
  /** 왼쪽 — 보관된 버전 또는 서버의 현재 내용. */
  left: string;
  /** 오른쪽 — 지금 편집 중인 본문. */
  right: string;
  onResolve?: (body: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CodeMirrorMergeView | null>(null);

  useEffect(() => {
    if (host.current === null) return;

    view.current = new CodeMirrorMergeView({
      a: { doc: left, extensions: [EditorState.readOnly.of(true)] },
      b: { doc: right, extensions: [EditorView.editable.of(true)] },
      parent: host.current,
    });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [left, right]);

  return (
    <div role="region" aria-label={label}>
      {/* 원문을 접근성 트리에도 남긴다 — 머지 뷰의 DOM 은 가상 스크롤이라
          화면 밖 줄이 렌더되지 않고, 그러면 「나란히 대조한다」가 보는
          사람에게만 참이 된다. */}
      <pre aria-label="왼쪽">{left}</pre>
      <pre aria-label="오른쪽">{right}</pre>

      <div ref={host} data-merge={mergeEngine()} />

      {onResolve !== undefined && (
        <button
          type="button"
          onClick={() => onResolve(view.current?.b.state.doc.toString() ?? right)}
        >
          이 내용으로 저장
        </button>
      )}
    </div>
  );
}
