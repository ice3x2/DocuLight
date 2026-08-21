/**
 * 본문 표면의 **고정 열거와 전이** (`FR-EDITOR-002` · `FR-EDITOR-003` ·
 * `FR-EDITOR-004` · `FR-EDITOR-006` · `FR-ATTACH-003`).
 *
 * 컴포넌트 밖에 두는 이유는 이 값들이 요구이기 때문이다 — 상태가 셋이라는
 * 것도, 권한 없이는 편집 상태로 못 간다는 것도, 어떤 확장자가 어떻게
 * 열리는지도 전부 조항이 정한 것이다.
 */

/**
 * 화면 상태 셋 (`FR-EDITOR-003`).
 *
 * 옵시디언과 같은 3상태다 — 읽기 하나와 편집 안의 둘. 「보기/편집」이
 * 2상태로 보이는 것은 상단 토글의 모습이고, 실제 상태는 셋이다.
 */
export const MODES = ['read', 'live', 'source'] as const;

export type Mode = (typeof MODES)[number];

/** 편집 계열인가 — 상단 토글의 「편집」이 켜진 상태인가. */
export function isEditing(mode: Mode): boolean {
  return mode !== 'read';
}

export const MODE_LABEL: Readonly<Record<Mode, string>> = {
  read: '읽기',
  live: '라이브 프리뷰',
  source: '소스',
};

/**
 * 모드 전이 (`FR-EDITOR-004` AC-2).
 *
 * 편집 권한이 없으면 편집 계열로 **가지 않는다.** 토글을 비활성으로
 * 그리는 것만으로는 부족하다 — 키보드나 딥링크로 같은 전이를 부를 수 있고,
 * 그때 화면만 열리면 사용자는 저장될 것이라 믿고 글을 쓴다.
 *
 * 읽기로 돌아가는 것은 권한과 무관하다 — 못 읽게 만들 이유가 없다.
 */
export function nextMode(from: Mode, to: Mode, options: { canEdit?: boolean } = {}): Mode {
  const canEdit = options.canEdit ?? true;
  if (!canEdit && isEditing(to)) return from;
  return to;
}

/** 이 파일이 md 문서인가 (`FR-EDITOR-006`). */
export function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/**
 * 비-md 파일을 어떻게 여는가 (`FR-ATTACH-003`).
 *
 * `image` 는 본문 영역의 미리보기, `download` 는 링크 하나다. **모르는
 * 확장자는 `download` 다** — 못 여는 파일이 있으면 사용자는 그것을 올릴
 * 수 없는 것으로 읽는다(`FR-ATTACH-002` AC-2).
 *
 * PDF 도 `download` 다(AC-3). 뷰어를 붙이면 Phase 2 로 미뤄 둔 조항이
 * Phase 1 에 들어온다.
 */
export type Surface = 'markdown' | 'image' | 'download';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

export function surfaceOf(name: string): Surface {
  if (isMarkdown(name)) return 'markdown';

  const at = name.lastIndexOf('.');
  const extension = at <= 0 ? '' : name.slice(at + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'download';
}
