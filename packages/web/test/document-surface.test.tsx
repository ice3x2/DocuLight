import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';
import {
  MODES,
  isMarkdown,
  nextMode,
  surfaceOf,
  type Mode,
} from '../src/document/surface-contract.js';

afterEach(cleanup);

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };
const png = { nodeId: 'n2', name: '그림.png', level: 'edit' as const };
const pdf = { nodeId: 'n3', name: '설계.pdf', level: 'edit' as const };

describe('FR-EDITOR-002 · FR-EDITOR-003 — 3상태 모드', () => {
  it('상태가 읽기·라이브 프리뷰·소스 셋이다', () => {
    expect(MODES).toEqual(['read', 'live', 'source']);
  });

  it('AC-1: 상단 토글로 보기와 편집이 같은 화면에서 전환된다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={md} />);

    expect(screen.getByRole('region', { name: '읽기' })).toBeDefined();

    await user.click(screen.getByRole('button', { name: '편집' }));

    expect(screen.getByRole('region', { name: '라이브 프리뷰' })).toBeDefined();
    expect(screen.queryByRole('region', { name: '읽기' })).toBeNull();
  });

  it('FR-EDITOR-003 AC-1: 편집 모드 안에서 라이브 프리뷰와 소스가 전환된다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={md} initialMode="live" />);

    await user.click(screen.getByRole('button', { name: '소스' }));

    expect(screen.getByRole('region', { name: '소스' })).toBeDefined();
  });

  it('FR-EDITOR-003 AC-3: 하위 토글이 본문을 바꾸지 않는다', () => {
    // 모드는 같은 문서를 다르게 그리는 일이다 — 본문을 건드리면 보기만
    // 바꿨는데 저장이 일어난다.
    expect(nextMode('live', 'source')).toBe('source');
    expect(nextMode('source', 'live')).toBe('live');
  });

  it('AC-2: 보기 화면과 올리는 화면을 먼저 고르게 하는 모드 선택이 없다', () => {
    render(<DocumentSurface file={md} />);

    expect(screen.queryByRole('button', { name: /업로드 모드|뷰어 모드/ })).toBeNull();
  });
});

describe('FR-EDITOR-004 — 보기 권한만 있으면 토글을 비활성으로 노출한다', () => {
  it('AC-1: 토글이 화면에 남는다 — 숨기지 않는다', () => {
    render(<DocumentSurface file={{ ...md, level: 'view' }} />);

    // 사라지면 그 문서가 편집 불가한 종류인 것으로 읽히고, 권한을 얻은
    // 뒤에도 사용자가 그것을 찾지 못한다.
    expect(screen.getByRole('button', { name: '편집' })).toBeDefined();
  });

  it('AC-2: 눌러도 편집 모드로 들어가지 않는다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={{ ...md, level: 'view' }} />);

    await user.click(screen.getByRole('button', { name: '편집' }));

    expect(screen.getByRole('region', { name: '읽기' })).toBeDefined();
    expect(screen.queryByRole('region', { name: '라이브 프리뷰' })).toBeNull();
  });

  it('권한이 없으면 토글이 비활성으로 표시된다', () => {
    render(<DocumentSurface file={{ ...md, level: 'view' }} />);

    expect(screen.getByRole('button', { name: '편집' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('FR-EDITOR-006 · FR-ATTACH-003 — 비-md 파일', () => {
  it('isMarkdown 이 확장자로 가른다', () => {
    expect(isMarkdown('회의록.md')).toBe(true);
    expect(isMarkdown('회의록.MD')).toBe(true);
    expect(isMarkdown('그림.png')).toBe(false);
    expect(isMarkdown('markdown')).toBe(false);
  });

  it('FR-EDITOR-006 AC-2: 비-md 파일에는 모드 토글이 없다', () => {
    render(<DocumentSurface file={png} />);

    expect(screen.queryByRole('button', { name: '편집' })).toBeNull();
  });

  it('FR-ATTACH-003 AC-1: 이미지는 본문 영역에 미리보기로 뜬다', () => {
    render(<DocumentSurface file={png} />);

    expect(surfaceOf(png.name)).toBe('image');
    expect(screen.getByRole('img', { name: '그림.png' })).toBeDefined();
  });

  it('FR-ATTACH-003 AC-2: 이미지가 아닌 것은 다운로드 링크만이다', () => {
    render(<DocumentSurface file={{ nodeId: 'n4', name: '설계.zip', level: 'edit' }} />);

    expect(surfaceOf('설계.zip')).toBe('download');
    expect(screen.getByRole('link', { name: /설계\.zip/ })).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('FR-ATTACH-003 AC-3: PDF 도 Phase 1 에서는 다운로드 링크만이다', () => {
    render(<DocumentSurface file={pdf} />);

    // 뷰어를 붙이면 Phase 2 로 미룬 조항이 Phase 1 에 들어온다.
    expect(surfaceOf(pdf.name)).toBe('download');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('link', { name: /설계\.pdf/ })).toBeDefined();
  });

  it('FR-ATTACH-002 AC-2: 확장자를 이유로 열리지 않는 파일이 없다', () => {
    // 알 수 없는 확장자도 다운로드로 열린다 — 못 여는 파일이 있으면
    // 사용자는 그것을 올릴 수 없는 것으로 읽는다.
    expect(surfaceOf('무엇인가.qqq')).toBe('download');
    expect(surfaceOf('확장자없음')).toBe('download');
  });
});

describe('FR-EDITOR-005 · FR-EDITOR-008 — 저장 거부와 병합', () => {
  it('FR-EDITOR-005 AC-1 · AC-3: 거부돼도 본문이 남고 사실이 표시된다', () => {
    render(<DocumentSurface file={md} initialMode="live" save="rejected" />);

    expect(screen.getByRole('region', { name: '라이브 프리뷰' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('저장');
  });

  it('FR-EDITOR-005 AC-2: 거부 상태에서 본문을 내려받을 수단이 있다', () => {
    render(<DocumentSurface file={md} initialMode="live" save="rejected" />);

    expect(screen.getByRole('button', { name: '내려받기' })).toBeDefined();
  });

  it('FR-EDITOR-008 AC-2 · AC-3: 충돌이면 병합 화면이 뜨고 양쪽을 대조한다', () => {
    render(<DocumentSurface file={md} initialMode="live" save="conflict" serverBody="# 남의 것" />);

    const merge = screen.getByRole('region', { name: '병합' });
    // 서버의 현재 내용이 **왼쪽**에 선다 — 오른쪽은 내가 편집 중인 것이다.
    // 자리를 지정해 보지 않으면 어느 쪽을 보고 있는지 시험이 말하지 못한다.
    expect(within(merge).getByLabelText('왼쪽').textContent).toContain('남의 것');
  });

  it('FR-EDITOR-008 AC-1: 잠금 안내가 없다 — 동시 편집이 막히지 않는다', () => {
    render(<DocumentSurface file={md} initialMode="live" />);

    expect(screen.queryByText(/다른 사용자가 편집 중|잠[겨금]/)).toBeNull();
  });

  it('저장된 상태에서는 배너도 병합도 뜨지 않는다', () => {
    render(<DocumentSurface file={md} initialMode="live" save="saved" />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('region', { name: '병합' })).toBeNull();
  });
});

describe('모드 전이', () => {
  it('편집 권한이 없으면 어떤 편집 모드로도 가지 않는다', () => {
    for (const to of ['live', 'source'] as Mode[]) {
      expect(nextMode('read', to, { canEdit: false })).toBe('read');
    }
  });

  it('편집 권한이 있으면 간다', () => {
    expect(nextMode('read', 'live', { canEdit: true })).toBe('live');
  });

  it('읽기로 돌아가는 것은 권한과 무관하다 — 못 읽게 만들 이유가 없다', () => {
    expect(nextMode('live', 'read', { canEdit: false })).toBe('read');
  });
});
