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
