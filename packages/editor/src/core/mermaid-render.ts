// Mermaid 렌더 경계.
//
// mermaid 본체는 SVG 를 실제로 측정하기 위해 진짜 DOM 을 요구한다. 그대로
// 호출하면 단위 테스트가 브라우저 없이는 돌지 않으므로, 렌더 호출을
// `MermaidRenderer` 함수 뒤로 밀어 주입 가능하게 둔다.
//
// mermaid 는 파싱 실패를 예외로 던진다. 그것은 이 모듈의 경계 바깥 사정이므로
// 여기서 값으로 변환해 위쪽이 분기문으로 다룰 수 있게 한다.

/** 코드와 고유 id 를 받아 SVG 문자열을 돌려준다. 실패 시 throw 한다. */
export type MermaidRenderer = (code: string, id: string) => Promise<string> | string;

export type MermaidResult = { svg: string } | { error: string };

export interface RenderedSize {
  w: number;
  h: number;
}

let moduleLoaded = false;

// 코드 → 마지막으로 관측된 렌더 크기.
//
// CM6 는 위젯이 뷰포트를 벗어나면 DOM 을 버리고 돌아올 때 `toDOM` 을 다시
// 부른다. 캐시가 없으면 위젯이 0 높이로 마운트됐다가 렌더 완료 후 부풀고,
// 그 높이 변화가 스크롤 애니메이션과 충돌해 관성 스크롤이 멈춘다.
// 마운트 시점에 크기를 미리 잡아 그 변화를 없앤다.
const sizeCache = new Map<string, RenderedSize>();

const sizeKey = (code: string, identity = '') => `${identity}\u0000${code}`;

export function isMermaidModuleLoaded(): boolean {
  return moduleLoaded;
}

export function getCachedSize(code: string, identity = ''): RenderedSize | undefined {
  return sizeCache.get(sizeKey(code, identity));
}

export function setCachedSize(code: string, size: RenderedSize, identity = ''): void {
  sizeCache.set(sizeKey(code, identity), size);
}

/**
 * 다이어그램 테마를 문서 테마에 맞춘다.
 *
 * 에디터 CSS 는 다크를 기본으로 두고 라이트를 `data-theme="light"` 로 opt-in
 * 받는다. 다이어그램도 같은 규약을 따라야 배경만 밝고 그림은 어두운 상태가
 * 생기지 않는다.
 *
 * 한계: mermaid 초기화는 1회뿐이라 실행 중 테마를 바꿔도 이미 적재된 뒤에는
 * 반영되지 않는다. 런타임 테마 전환을 붙일 때 함께 해결해야 한다.
 */
/**
 * DocuLight 다이어그램 팔레트.
 *
 * mermaid 기본 테마는 한 가지 연보라로 모든 노드를 칠해서, 흐름도의 단계가
 * 여럿일 때 서로 구분되지 않는다. 1·2·3차 색을 실제로 다른 계열로 벌려
 * 노드 종류가 눈으로 구분되게 한다.
 */
interface MermaidRenderConfig {
  themeVariables: Record<string, string>;
  fontFamily: string;
  fontSize: number;
  securityLevel: 'strict';
}

function captureMermaidConfig(): MermaidRenderConfig {
  const css = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const documentSurface = value('--surface-document', '#ffffff');
  const appSurface = value('--surface-app', '#f6f8fa');
  const controlSurface = value('--surface-control', '#eef0f2');
  const selected = value('--surface-selected', '#dbeafe');
  const warningSurface = value('--surface-warning', '#fff4cc');
  const text = value('--text-primary', '#1f2937');
  const border = value('--border-control', '#b8bec6');
  const warning = value('--status-warning', '#8a5a00');
  return {
    securityLevel: 'strict',
    fontFamily: value('--font-sans', '"Malgun Gothic", system-ui, sans-serif'),
    fontSize: 16,
    themeVariables: {
      background: documentSurface,
      primaryColor: selected,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: controlSurface,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: appSurface,
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      lineColor: border,
      textColor: text,
      edgeLabelBackground: documentSurface,
      noteBkgColor: warningSurface,
      noteBorderColor: warning,
      noteTextColor: warning,
      fontFamily: value('--font-sans', '"Malgun Gothic", system-ui, sans-serif'),
      fontSize: '16px',
    },
  };
}

export function mermaidConfigSignature(width: number): string {
  return JSON.stringify({ ...captureMermaidConfig(), width: Math.round(width) });
}

const themeSubscribers = new Set<() => void>();
let themeObserver: MutationObserver | undefined;
export function subscribeMermaidTheme(callback: () => void): () => void {
  themeSubscribers.add(callback);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => themeSubscribers.forEach((subscriber) => subscriber()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
  }
  return () => {
    themeSubscribers.delete(callback);
    if (themeSubscribers.size === 0) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
  };
}

let renderQueue: Promise<unknown> = Promise.resolve();

/** 동적 import 기본 구현. mermaid 는 최초 렌더 시점에만 적재된다. */
export const defaultMermaidRenderer: MermaidRenderer = async (code, id) => {
  const config = captureMermaidConfig();
  const { default: mermaid } = await import('mermaid');
  const task = async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: config.securityLevel,
      // `base` 는 themeVariables 를 그대로 받는 유일한 테마다. 다른 테마는
      // 자기 색을 먼저 깔아서 일부만 덮인다.
      theme: 'base',
      themeVariables: config.themeVariables,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      // 파싱에 실패하면 mermaid 는 "Syntax error in text" 그래픽을 문서에
      // 직접 붙인다. 우리는 오류를 위젯 안에서 표시하므로 그 경로를 끈다.
      // 끄지 않으면 에디터 바깥에 폭탄 아이콘이 떠서 남는다.
      suppressErrorRendering: true,
    });
    moduleLoaded = true;
    try {
      const { svg } = await mermaid.render(id, code);
      return svg;
    } finally {
    // mermaid 는 렌더용 임시 컨테이너를 문서에 붙였다가 성공 경로에서만
    // 치운다. 실패해도 남지 않게 우리가 확실히 제거한다.
    document.getElementById(id)?.remove();
    }
  };
  const result = renderQueue.then(task, task);
  renderQueue = result.then(() => undefined, () => undefined);
  return result;
};

export async function renderMermaid(
  code: string,
  id: string,
  renderer: MermaidRenderer = defaultMermaidRenderer,
): Promise<MermaidResult> {
  try {
    return { svg: await renderer(code, id) };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}
