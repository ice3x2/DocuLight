import type { Extension } from '@codemirror/state';

import { mathBlocks } from './core/math-decoration.js';
import { mermaidBlocks } from './core/mermaid-blocks.js';
import { tagDecorations, type TagClick } from './core/tag-decoration.js';

/**
 * DocuLight 가 vendor 에디터 위에 얹는 확장 **전부**.
 *
 * vendor 편집기 파일을 고치지 않고 여기서 얹는 이유는 그쪽이 상류에서
 * 내려오는 코드이기 때문이다 — 고치면 다음 병합에서 이 변경이 조용히
 * 사라지거나 충돌한다.
 *
 * 묶음을 하나로 두는 것은 「제품이 실제로 쓰는 에디터 설정」이 한 곳에만
 * 있게 하기 위해서다. 화면마다 확장을 골라 붙이면 어느 화면에서 무엇이
 * 되는지가 갈리고, 그 갈림은 요구 대비 판정을 무의미하게 만든다.
 */
export function doculightExtensions(options: { onTagClick?: TagClick } = {}): Extension[] {
  return [mermaidBlocks(), mathBlocks(), tagDecorations(options.onTagClick)];
}

export type { TagClick };
