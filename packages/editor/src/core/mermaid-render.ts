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

export function isMermaidModuleLoaded(): boolean {
  return moduleLoaded;
}

export function getCachedSize(code: string): RenderedSize | undefined {
  return sizeCache.get(code);
}

export function setCachedSize(code: string, size: RenderedSize): void {
  sizeCache.set(code, size);
}

/** 동적 import 기본 구현. mermaid 는 최초 렌더 시점에만 적재된다. */
export const defaultMermaidRenderer: MermaidRenderer = async (code, id) => {
  const { default: mermaid } = await import('mermaid');
  if (!moduleLoaded) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      // 파싱에 실패하면 mermaid 는 "Syntax error in text" 그래픽을 문서에
      // 직접 붙인다. 우리는 오류를 위젯 안에서 표시하므로 그 경로를 끈다.
      // 끄지 않으면 에디터 바깥에 폭탄 아이콘이 떠서 남는다.
      suppressErrorRendering: true,
    });
    moduleLoaded = true;
  }

  try {
    const { svg } = await mermaid.render(id, code);
    return svg;
  } finally {
    // mermaid 는 렌더용 임시 컨테이너를 문서에 붙였다가 성공 경로에서만
    // 치운다. 실패해도 남지 않게 우리가 확실히 제거한다.
    document.getElementById(id)?.remove();
  }
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
