import { MergeView as CodeMirrorMergeView } from '@codemirror/merge';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button.js';

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

export function diffCueText(side: 'a' | 'b'): string {
  return side === 'a' ? '− 삭제' : '+ 추가';
}

function renderDiffCueLayer(merge: CodeMirrorMergeView, side: 'a' | 'b'): void {
  const editor = side === 'a' ? merge.a : merge.b;
  let layer = editor.dom.querySelector<HTMLElement>(':scope > .dl-diff-cue-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'dl-diff-cue-layer';
    editor.dom.append(layer);
  }
  const root = editor.dom.getBoundingClientRect();
  layer.replaceChildren();
  for (const chunk of merge.chunks) {
    const from = side === 'a' ? chunk.fromA : chunk.fromB;
    const to = side === 'a' ? chunk.toA : chunk.toB;
    const documentLength = editor.state.doc.length;
    const sourceFrom = Math.min(from, documentLength);
    const sourceTo = Math.min(to, documentLength);
    if (sourceTo <= sourceFrom) continue;
    const coords = editor.coordsAtPos(sourceFrom);
    if (!coords) continue;
    const cue = document.createElement('span');
    cue.className = `dl-diff-cue dl-diff-cue-${side}`;
    cue.setAttribute('role', 'note');
    cue.setAttribute('aria-label', diffCueText(side));
    cue.textContent = diffCueText(side);
    cue.style.top = `${coords.top - root.top}px`;
    layer.append(cue);
  }
}

function diffCueExtension(side: 'a' | 'b', getMerge: () => CodeMirrorMergeView | null): Extension {
  return EditorView.updateListener.of(() => {
    const merge = getMerge();
    if (merge) queueMicrotask(() => renderDiffCueLayer(merge, side));
  });
}

export function MergeView({
  label,
  left,
  right,
  onResolve,
  mode = 'conflict',
  leftLabel = '왼쪽',
  rightLabel = '오른쪽',
}: {
  label: string;
  /** 왼쪽 — 보관된 버전 또는 서버의 현재 내용. */
  left: string;
  /** 오른쪽 — 지금 편집 중인 본문. */
  right: string;
  onResolve?: (body: string) => void;
  mode?: 'conflict' | 'version';
  leftLabel?: string;
  rightLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CodeMirrorMergeView | null>(null);
  const [draftAlternative, setDraftAlternative] = useState(right);

  useEffect(() => setDraftAlternative(right), [right]);

  useEffect(() => {
    if (host.current === null) return;
    view.current = new CodeMirrorMergeView({
      a: {
        doc: left,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          diffCueExtension('a', () => view.current),
        ],
      },
      b: {
        doc: right,
        extensions: [
          EditorState.readOnly.of(mode === 'version'),
          EditorView.editable.of(mode !== 'version'),
          diffCueExtension('b', () => view.current),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && mode === 'conflict') setDraftAlternative(update.state.doc.toString());
          }),
        ],
      },
      parent: host.current,
    });
    const paneScrollers = host.current.querySelectorAll<HTMLElement>('.cm-mergeViewEditor .cm-scroller');
    const paneLabels = [leftLabel, rightLabel];
    paneScrollers.forEach((scroller, index) => {
      scroller.tabIndex = 0;
      scroller.dataset.mergePane = index === 0 ? 'left' : 'right';
      scroller.setAttribute('aria-label', `${paneLabels[index]} 내용 스크롤`);
    });
    queueMicrotask(() => {
      if (!view.current) return;
      renderDiffCueLayer(view.current, 'a');
      renderDiffCueLayer(view.current, 'b');
    });

    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [left, right, mode, leftLabel, rightLabel]);

  return (
    <div role="region" aria-label={label} data-merge-view data-merge-mode={mode}>
      {/* 원문을 접근성 트리에도 남긴다 — 머지 뷰의 DOM 은 가상 스크롤이라
          화면 밖 줄이 렌더되지 않고, 그러면 「나란히 대조한다」가 보는
          사람에게만 참이 된다. */}
      <pre className="dl-visually-hidden-source" aria-label={mode === 'conflict' ? leftLabel : `${leftLabel} 전체 원문`}>{left}</pre>
      <pre className="dl-visually-hidden-source" aria-label={mode === 'conflict' ? rightLabel : `${rightLabel} 전체 원문`}>{mode === 'conflict' ? draftAlternative : right}</pre>

      <div data-merge-viewport tabIndex={0} aria-label={`${label} 비교 영역`}>
        <div data-merge-headers aria-hidden="true"><span>{leftLabel}</span><span>{rightLabel}</span></div>
        <div ref={host} data-merge={mergeEngine()} />
      </div>

      {onResolve !== undefined && (
        <div data-merge-action>
          <span>오른쪽 내용을 확인한 뒤 저장하세요.</span>
          <Button variant="primary" onClick={() => onResolve(view.current?.b.state.doc.toString() ?? right)}>
            이 내용으로 저장
          </Button>
        </div>
      )}
    </div>
  );
}
