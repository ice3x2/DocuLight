import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';

afterEach(cleanup);

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };

describe('CON-ARCH-006 · FR-EDITOR-001 — 본문에 실제 편집기가 선다', () => {
  it('편집 모드에서 CodeMirror 가 마운트된다', () => {
    render(<DocumentSurface file={md} initialMode="live" body={'# 제목\n\n본문'} />);

    // 빈 `<div role="region">` 만 두면 토글은 도는데 편집할 것이 없다 —
    // 요구가 말하는 「같은 볼트의 문서를 브라우저에서 편집한다」가 거짓이 된다.
    expect(document.querySelector('.cm-content'), 'CodeMirror 가 없다').not.toBeNull();
  });

  it('읽기 모드에서도 본문이 보인다 — 보기 모드가 빈 화면이면 안 된다', () => {
    render(<DocumentSurface file={md} initialMode="read" body={'# 제목\n\n본문'} />);

    expect(screen.getByRole('region', { name: '읽기' }).textContent).toContain('본문');
  });

  it('본문을 React state 로 들지 않는다 — 정본은 편집기다', () => {
    render(<DocumentSurface file={md} initialMode="live" body={'# 제목'} />);

    // `body` 는 초기 문서를 넘기는 prop 이고 controlled value 가 아니다.
    // 그것을 재는 방법은 편집기가 그 값을 **한 번** 받아 자기 문서로
    // 삼았는지 보는 것이다.
    expect(document.querySelector('.cm-content')?.textContent).toContain('제목');
  });

  it('소스 모드에서는 원문이 그대로 보인다', () => {
    render(<DocumentSurface file={md} initialMode="source" body={'# 제목'} />);

    expect(screen.getByRole('region', { name: '소스' }).textContent).toContain('# 제목');
  });

  it('본문이 없으면 편집기를 세우지 않는다 — 아직 받아오는 중이다', () => {
    render(<DocumentSurface file={md} initialMode="live" />);

    expect(document.querySelector('.cm-content')).toBeNull();
  });
});

describe('FR-EDITOR-009 — 저장이 편집기를 갈아 끼우지 않는다', () => {
  /**
   * **본문 문자열이 편집기의 정체성이면 저장이 곧 재마운트다.**
   *
   * `AtomicCodeMirrorEditor` 의 계약은 명시적이다 — `documentId` 를 넘기지
   * 않으면 `markdownSource` 값이 정체성이 되고, 다른 문자열을 넘기면 새
   * 편집기가 선다. `DocumentSurface` 는 그것을 넘기지 않았고, 저장이
   * 성공하면 상위가 새 본문을 내려보내므로 그때마다 EditorView 가
   * destroy 되고 다시 만들어졌다.
   *
   * 관측된 결과가 그것이다(2026-08-24 실제 볼트 검증 §3.2) — 자동 저장
   * 3초 뒤 `document.activeElement` 가 편집기에서 빠지고, 이어 친 글자가
   * 문서에도 디스크에도 들어가지 않았다.
   *
   * 유지되는 쪽은 저장 왕복이 있어야 재어지므로 `autosave-wiring.test.tsx`
   * 가 맡는다. 여기는 **문서를 바꿀 때는 갈아 끼워야 한다**는 반대편을
   * 잰다 — 유지만 재면 아무것도 안 바뀌는 구현이 통과한다. 포커스와
   * 이어 친 글자 자체는 happy-dom 이 재지 못해 브라우저 검사가 맡는다.
   */

  it('문서를 바꾸면 새 편집기가 선다 — 앞 문서의 커서와 되돌리기가 새지 않는다', () => {
    const { rerender } = render(
      <DocumentSurface file={md} initialMode="live" body={'# 처음'} baseHash="h1" />,
    );
    const 처음 = document.querySelector('.cm-editor');

    rerender(
      <DocumentSurface
        file={{ nodeId: 'n2', name: '다른문서.md', level: 'edit' as const }}
        initialMode="live"
        body={'# 다른 문서'}
        baseHash="h9"
      />,
    );

    expect(document.querySelector('.cm-editor'), '문서를 바꿨는데 같은 편집기가 남았다').not.toBe(처음);
  });
});
