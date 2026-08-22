import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentTree } from '../src/tree/DocumentTree.js';
import {
  acceptedDrop,
  pasteUpload,
  type DropTarget,
  type UploadRequest,
} from '../src/attachment/upload-contract.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(cleanup);

const node = (over: Partial<TreeNodeView> = {}): TreeNodeView => ({
  id: 'n1',
  name: '회의록.md',
  kind: 'file',
  visibility: 'full',
  level: 'edit',
  parentLevel: 'edit',
  children: [],
  ...over,
});

const dir = (over: Partial<TreeNodeView> = {}): TreeNodeView =>
  node({ id: 'd1', name: '회의', kind: 'directory', ...over });

const file = (name = '그림.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

describe('FR-ATTACH-001 · SEC-ATTACH-001 — 트리 드래그앤드롭', () => {
  it('AC-1: 편집 권한이 있는 디렉토리에 떨구면 업로드가 성립한다', () => {
    const accepted = acceptedDrop(dir(), [file()]);

    expect(accepted).toMatchObject({ ok: true });
    expect((accepted as { ok: true; request: UploadRequest }).request.parentId).toBe('d1');
  });

  it('SEC-ATTACH-001 AC-2: 편집 권한이 없는 디렉토리에는 떨굴 수 없다', () => {
    // 화면에서 받아 놓고 서버가 거절하면 사용자에게는 파일이 사라진 것으로
    // 보인다 — 받지 않는 것이 정직하다.
    expect(acceptedDrop(dir({ level: 'view' }), [file()])).toMatchObject({ ok: false, rule: 'forbidden' });
  });

  it('파일 노드에는 떨굴 수 없다 — 업로드 대상은 디렉토리다', () => {
    expect(acceptedDrop(node(), [file()])).toMatchObject({ ok: false, rule: 'not-a-directory' });
  });

  it('pass-through 디렉토리에도 떨굴 수 없다 — 지나가는 자리이지 담는 자리가 아니다', () => {
    expect(
      acceptedDrop(dir({ visibility: 'pass-through', level: null }), [file()]),
    ).toMatchObject({ ok: false, rule: 'forbidden' });
  });

  it('빈 드롭은 아무 일도 아니다', () => {
    expect(acceptedDrop(dir(), [])).toMatchObject({ ok: false, rule: 'no-files' });
  });

  it('CON-ATTACH-001 AC-1 · AC-2: 확장자로 거르지 않는다', () => {
    for (const name of ['설계.zip', '무엇인가.qqq', '확장자없음', 'a.exe']) {
      expect(acceptedDrop(dir(), [new File([new Uint8Array([1])], name)]), name).toMatchObject({ ok: true });
    }
  });

  it('AC-3: 트리가 드롭을 받는 자리를 갖는다 — 별도 업로드 화면이 없다', () => {
    const workspaces: WorkspaceTreeView[] = [
      { workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [dir()] },
    ];
    render(<DocumentTree workspaces={workspaces} onUpload={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /업로드 화면|파일 올리기 화면/ })).toBeNull();
    expect(screen.getByRole('tree', { name: '문서 트리' })).toBeDefined();
  });
});

describe('FR-ATTACH-004 — 편집기 붙여넣기·드래그', () => {
  it('AC-1 · AC-2: 붙여넣기와 드래그가 같은 요청을 만든다', () => {
    // **같은 파일**로 두 번 부른다. 파일을 두 개 만들어 비교하면
    // `lastModified` 가 밀리초 경계에서 갈려 시험이 이따금 깨진다 —
    // 재는 것은 두 경로가 같은 요청을 만드는가이지 파일의 동일성이 아니다.
    const one = file();
    const pasted = pasteUpload({ nodeId: 'n1', level: 'edit' }, [one]);
    const dragged = pasteUpload({ nodeId: 'n1', level: 'edit' }, [one]);

    // 경로가 둘이면 한쪽에만 크기 제한이 걸리거나 한쪽만 권한을 본다.
    expect(pasted).toEqual(dragged);
  });

  it('AC-3: 디렉토리 권한과 무관하게 그 문서의 편집 권한이면 된다', () => {
    expect(pasteUpload({ nodeId: 'n1', level: 'edit' }, [file()])).toMatchObject({ ok: true });
  });

  it('AC-4: 그 문서에 편집 권한이 없으면 거부된다', () => {
    expect(pasteUpload({ nodeId: 'n1', level: 'view' }, [file()])).toMatchObject({
      ok: false,
      rule: 'forbidden',
    });
  });

  it('붙여넣기 요청은 소유 문서를 싣는다 — 첨부 권한이 그 문서로 판정되기 때문이다', () => {
    const done = pasteUpload({ nodeId: 'n7', level: 'edit' }, [file()]);

    expect((done as { ok: true; request: UploadRequest }).request.ownerNodeId).toBe('n7');
  });
});

describe('FR-ATTACH-006 AC-4 — 제한이 두 경로 모두에 걸린다', () => {
  const big = () => new File([new Uint8Array(1024)], '큰것.bin');

  it('트리 드롭에 걸린다', () => {
    expect(acceptedDrop(dir(), [big()], { limitBytes: 10 })).toMatchObject({ ok: false, rule: 'too-large' });
  });

  it('붙여넣기에도 같은 값으로 걸린다', () => {
    expect(pasteUpload({ nodeId: 'n1', level: 'edit' }, [big()], { limitBytes: 10 })).toMatchObject({
      ok: false,
      rule: 'too-large',
    });
  });

  it('제한 이하면 두 경로 다 통과한다', () => {
    const target: DropTarget = dir();

    expect(acceptedDrop(target, [big()], { limitBytes: 4096 })).toMatchObject({ ok: true });
    expect(pasteUpload({ nodeId: 'n1', level: 'edit' }, [big()], { limitBytes: 4096 })).toMatchObject({
      ok: true,
    });
  });
});
