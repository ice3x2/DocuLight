import type { Extension } from '@codemirror/state';

import { highlightCode, isHighlightable } from './core/code-highlight.js';
import { mathBlocks } from './core/math-decoration.js';
import { pasteUploadExtension, type AttachUpload } from './core/paste-upload.js';
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
/**
 * 읽기 화면의 코드 하이라이팅 (`CON-ARCH-005` AC-6).
 *
 * 확장 묶음이 이것을 함께 낸다 — 소비자가 따로 가져다 쓰면 어떤 화면에서
 * 색이 붙고 어떤 화면에서 안 붙는지가 갈린다.
 */
export const codeHighlight = { highlightCode, isHighlightable };

export function doculightExtensions(
  options: { onTagClick?: TagClick; onAttach?: AttachUpload } = {},
): Extension[] {
  return [
    mermaidBlocks(),
    mathBlocks(),
    tagDecorations(options.onTagClick),
    // 업로드 콜백이 없으면 그 확장을 붙이지 않는다 — 붙여 두고 아무것도
    // 안 하면 붙여넣기가 조용히 삼켜진다.
    ...(options.onAttach === undefined ? [] : [pasteUploadExtension(options.onAttach)]),
  ];
}

export type { TagClick, AttachUpload };
