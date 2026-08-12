// ```mermaid 펜스의 라이브 프리뷰.
//
// 커서가 블록 밖이면 다이어그램 위젯으로 대체하고, 블록에 닿으면 원문을
// 그대로 노출한다. 판정 단위는 블록 전체다 (기능 요청서 §3.2 "멀티라인 블록").
//
// 블록 위젯은 ViewPlugin 에서 발행할 수 없다 — CM6 는 StateField 또는 필수
// facet 에서 나올 것을 요구한다. vendor 의 `image-blocks.ts` 와 같은 구조다.

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  Facet,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import {
  defaultMermaidRenderer,
  getCachedSize,
  renderMermaid,
  setCachedSize,
  type MermaidRenderer,
} from './mermaid-render';

export interface MermaidBlock {
  /** 펜스를 포함한 블록 시작 */
  from: number;
  /** 펜스를 포함한 블록 끝 */
  to: number;
  /** 펜스를 제외한 다이어그램 소스 */
  code: string;
}

export interface MermaidBlocksConfig {
  /** 렌더 경계 주입. 생략하면 mermaid 를 동적 import 한다. */
  renderer?: MermaidRenderer;
}

export const mermaidRendererFacet = Facet.define<MermaidRenderer, MermaidRenderer>({
  combine: (values) => (values.length ? values[values.length - 1] : defaultMermaidRenderer),
});

const ENSURE_PARSE_BUDGET_MS = 200;

/**
 * 구문 트리에서 mermaid 펜스만 골라낸다.
 *
 * 문서 전체 트리를 확보한 뒤 순회한다 — 부분 파싱 상태에서 순회하면 뒤쪽
 * 블록이 영구히 원문으로 남는다 (vendor `inline-preview.ts` 가 같은 이유로
 * `ensureSyntaxTree` 를 쓴다).
 */
export function findMermaidBlocks(state: EditorState): MermaidBlock[] {
  const tree =
    ensureSyntaxTree(state, state.doc.length, ENSURE_PARSE_BUDGET_MS) ?? syntaxTree(state);
  const blocks: MermaidBlock[] = [];

  tree.iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return;

      const info = node.node.getChild('CodeInfo');
      if (!info) return;
      if (state.doc.sliceString(info.from, info.to).trim() !== 'mermaid') return;

      const text = node.node.getChild('CodeText');
      blocks.push({
        from: node.from,
        to: node.to,
        code: text ? state.doc.sliceString(text.from, text.to) : '',
      });
    },
  });

  return blocks;
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

let widgetSeq = 0;

class MermaidWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.code === this.code;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('div');
    host.className = 'dl-mermaid';

    // 마운트 시점에 이전 렌더 크기를 잡아 둔다 — 렌더 완료 후 높이가 자라면
    // 스크롤 앵커와 충돌한다.
    const cached = getCachedSize(this.code);
    if (cached) host.style.minHeight = `${cached.h}px`;

    void this.paint(host, view.state.facet(mermaidRendererFacet));
    return host;
  }

  private async paint(host: HTMLElement, renderer: MermaidRenderer): Promise<void> {
    const result = await renderMermaid(this.code, `dl-mermaid-${widgetSeq++}`, renderer);

    if ('error' in result) {
      host.classList.add('dl-mermaid-error');
      host.textContent = result.error;
      return;
    }

    host.innerHTML = result.svg;

    const svg = host.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.height > 0) setCachedSize(this.code, { w: rect.width, h: rect.height });
  }

  /** 다이어그램 내부 클릭이 캐럿을 떨구지 않게 한다. */
  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const block of findMermaidBlocks(state)) {
    if (selectionTouches(state, block.from, block.to)) continue;
    ranges.push(
      Decoration.replace({
        widget: new MermaidWidget(block.code),
        block: true,
      }).range(block.from, block.to),
    );
  }

  return Decoration.set(ranges, true);
}

export const mermaidBlockField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(decorations, tr) {
    if (!tr.docChanged && tr.selection === undefined) return decorations.map(tr.changes);
    return buildDecorations(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function mermaidBlocks(config: MermaidBlocksConfig = {}): Extension {
  return [
    mermaidBlockField,
    config.renderer ? mermaidRendererFacet.of(config.renderer) : [],
  ];
}
