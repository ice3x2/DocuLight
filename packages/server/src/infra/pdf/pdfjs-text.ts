import type { PdfPageText, PdfTextExtractor } from '../../domain/ports/pdf-text.js';

/**
 * `pdfjs-dist` 로 PDF 에서 페이지별 글자를 뽑는다 (`FR-SHELL-013` AC-4).
 *
 * 이 파일이 라이브러리를 아는 유일한 자리다 — 도메인과 응용 계층은
 * `PdfTextExtractor` 포트만 본다.
 *
 * 모듈을 정적으로 import 하지 않고 첫 호출에 들여온다. pdfjs 는 무거워서,
 * PDF 가 하나도 없는 인스턴스가 그 비용을 기동마다 내지 않게 한다.
 */
let loading: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

const pdfjs = () => {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return loading;
};

export const pdfjsTextExtractor: PdfTextExtractor = {
  async extract(bytes: Uint8Array): Promise<readonly PdfPageText[]> {
    let task;
    let doc;
    try {
      const lib = await pdfjs();
      // 워커를 띄우지 않는다 — 서버에서는 요청 하나가 이미 자기 흐름을
      // 갖고 있고, 워커를 붙이면 그 수명을 우리가 관리해야 한다.
      task = lib.getDocument({ data: bytes, useSystemFonts: false });
      doc = await task.promise;
    } catch {
      // 읽을 수 없는 바이트다. 검색 한 건 때문에 조회 전체를 실패시키지
      // 않는다 — 포트가 정한 계약이다.
      return [];
    }

    const pages: PdfPageText[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        // 조각마다 사이에 공백을 넣지 않는다 — pdfjs 가 낱말 사이의 공백을
        // 이미 조각으로 싣기 때문에, 넣으면 낱말이 갈려 검색이 빗나간다.
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join('');
        pages.push({ page: n, text });
      }
    } finally {
      // 문서가 아니라 **적재 작업**을 닫는다. 문서 프록시에는 이 자리에서
      // 쓸 정리 함수가 없다.
      await task.destroy();
    }
    return pages;
  },
};
