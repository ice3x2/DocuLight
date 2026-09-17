import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';
import { DocumentTree } from '../src/tree/DocumentTree.js';
import { NewVersionPrompt, type NewVersionResult } from '../src/tree/NewVersionPrompt.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const node = (overwriteIrreversible: boolean): TreeNodeView => ({
  id: overwriteIrreversible ? 'binary' : 'markdown',
  name: overwriteIrreversible ? '설계 원본.zip' : '회의록.md',
  kind: 'file',
  visibility: 'full',
  level: 'edit',
  parentLevel: 'edit',
  overwriteIrreversible,
  children: [],
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const focusTree = (roots: TreeNodeView[]): WorkspaceTreeView[] => [{
  workspace: { id: 'workspace', name: '워크스페이스' },
  visibility: 'full',
  roots,
}];

describe('IR-SHELL-010 AC-9 — 닫기 초점 fallback', () => {
  it('업로드 대상이 권한 변경으로 사라지면 현재 유효한 선택 행으로 돌아간다', async () => {
    const selected = { ...node(false), id: 'selected', name: '남은 문서.md' };
    const removed = { ...node(false), id: 'removed', name: '권한이 사라진 문서.md' };
    const view = render(<>
      <button type="button">외부 대상</button>
      <DocumentTree workspaces={focusTree([selected, removed])} />
    </>);

    await userEvent.click(screen.getByRole('treeitem', { name: /남은 문서/ }));
    screen.getByRole('button', { name: '외부 대상' }).focus();
    view.rerender(<>
      <button type="button">외부 대상</button>
      <DocumentTree
        workspaces={focusTree([selected])}
        focusRequest={{ nodeId: removed.id, sequence: 1 }}
      />
    </>);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /남은 문서/ })));
  });

  it('마지막 focus 행인 target만 사라지면 별도의 현재 aria-selected 행으로 돌아간다', async () => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const selected = { ...node(false), id: 'selected-current', name: '현재 선택 문서.md' };
    const removed = { ...node(false), id: 'removed-target', name: '권한이 사라진 대상.md' };
    const view = render(<DocumentTree workspaces={focusTree([selected, removed])} />);
    const targetRow = screen.getByRole('treeitem', { name: /권한이 사라진 대상/ });
    targetRow.focus();

    view.rerender(
      <DocumentTree
        workspaces={focusTree([selected])}
        focusRequest={{ nodeId: removed.id, sequence: 1 }}
      />,
    );
    const selectedRow = screen.getByRole('treeitem', { name: /현재 선택 문서/ });
    selectedRow.setAttribute('aria-selected', 'true');
    act(() => frame?.(0));

    expect(document.activeElement).toBe(selectedRow);
  });

  it('대상과 유효한 선택 행이 모두 없으면 문서 트리 region으로 돌아간다', async () => {
    const view = render(<>
      <button type="button">외부 대상</button>
      <DocumentTree workspaces={focusTree([node(false)])} />
    </>);
    screen.getByRole('button', { name: '외부 대상' }).focus();

    view.rerender(<>
      <button type="button">외부 대상</button>
      <DocumentTree
        workspaces={focusTree([])}
        focusRequest={{ nodeId: 'permission-removed', sequence: 1 }}
      />
    </>);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tree', { name: '문서 트리' })));
  });

  it('tree region도 사라졌으면 문서 트리 tab fallback을 호출한다', () => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const view = render(<>
      <button type="button" role="tab">문서 트리</button>
      <DocumentTree workspaces={focusTree([])} />
    </>);
    const tab = screen.getByRole('tab', { name: '문서 트리' });

    view.rerender(<>
      <button type="button" role="tab">문서 트리</button>
      <DocumentTree
        workspaces={focusTree([])}
        focusRequest={{ nodeId: 'permission-removed', sequence: 1 }}
        onFocusUnavailable={() => tab.focus()}
      />
    </>);
    screen.getByRole('tree', { name: '문서 트리' }).remove();
    act(() => frame?.(0));

    expect(document.activeElement).toBe(tab);
  });
});

describe('FR-ATTACH-003 · FR-EDITOR-006 — 이미지와 다운로드 전용 표면', () => {
  it('이미지는 실제 load/error 상태를 표시하고 같은 리소스로 다시 시도한다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={{ nodeId: 'wide', name: '투명 그림.png', level: 'view' }} />);

    const preview = screen.getByRole('region', { name: '이미지 미리보기' });
    const image = preview.querySelector('img[alt="투명 그림.png"]') as HTMLImageElement;
    expect(preview.getAttribute('aria-busy')).toBe('true');
    expect(within(preview).getByRole('status', { name: '이미지를 불러오는 중입니다.' })).toBeDefined();

    fireEvent.load(image);
    expect(preview.getAttribute('aria-busy')).toBeNull();
    expect(preview.getAttribute('data-image-state')).toBe('loaded');

    fireEvent.error(image);
    const error = within(preview).getByRole('alert', { name: '이미지 오류' });
    expect(error.textContent).toContain('이미지를 표시할 수 없습니다.');
    const firstSource = image.getAttribute('src');
    await user.click(within(error).getByRole('button', { name: '다시 시도' }));
    expect(image.getAttribute('src')).toBe(firstSource);
    expect(preview.getAttribute('aria-busy')).toBe('true');
  });

  it('PDF와 일반 파일은 native download 링크만 제공한다', () => {
    render(<DocumentSurface file={{ nodeId: 'pdf', name: '아주 긴 보고서.pdf', level: 'view' }} />);
    const link = screen.getByRole('link', { name: '아주 긴 보고서.pdf 내려받기' });
    expect(link.getAttribute('download')).toBe('아주 긴 보고서.pdf');
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.querySelector('iframe, object, embed, canvas')).toBeNull();
  });
});

describe('FR-SHELL-008 · FR-CONFIRM-005 · FR-CONFIRM-010 — 새 버전 선택과 L2 확인', () => {
  it('Markdown 선택은 확인 없이 원본 File을 한 번 전달한다', async () => {
    const onPick = vi.fn(async () => ({ status: 'success' as const }));
    render(<NewVersionPrompt node={node(false)} onPick={onPick} onCancel={vi.fn()} />);
    const selected = new File(['# 새 본문\n'], '다른 이름.md', { type: 'text/markdown' });

    await userEvent.upload(screen.getByLabelText('회의록.md 새 버전 파일'), selected);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(selected);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('binary 선택만으로 업로드하지 않고 취소 뒤 선택을 보존하며 명시 확인에서 한 번 전달한다', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn(async () => ({ status: 'success' as const }));
    render(<NewVersionPrompt node={node(true)} onPick={onPick} onCancel={vi.fn()} />);
    const selected = new File([new Uint8Array([0, 1, 2, 255])], '교체할 파일.bin');
    const input = screen.getByLabelText('설계 원본.zip 새 버전 파일');

    await user.upload(input, selected);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('교체할 파일.bin')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '새 버전 올리기' }));
    const alert = screen.getByRole('alertdialog', { name: '기존 파일을 교체하시겠습니까?' });
    expect(document.activeElement).toBe(within(alert).getByRole('button', { name: '돌아가기' }));
    await user.keyboard('{Escape}');
    expect(onPick).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).files?.[0]).toBe(selected);

    await user.click(screen.getByRole('button', { name: '새 버전 올리기' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '교체하기' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(selected);
  });

  it('target identity가 바뀌면 이전 선택과 동의를 폐기한다', async () => {
    const onPick = vi.fn(async () => ({ status: 'success' as const }));
    const view = render(<NewVersionPrompt node={node(true)} onPick={onPick} onCancel={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText('설계 원본.zip 새 버전 파일'), new File(['old'], 'old.bin'));

    view.rerender(
      <NewVersionPrompt
        node={{ ...node(true), id: 'other', name: '다른 대상.zip' }}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByRole('button', { name: '새 버전 올리기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('old.bin')).toBeNull();
  });
});

describe('IR-SHELL-010 — 실제 새 버전 요청의 상태와 결과', () => {
  it('결과 계약을 어긴 undefined 응답을 성공으로 발표하지 않는다', async () => {
    const onPick = vi.fn(async () => undefined as unknown as NewVersionResult);
    render(<NewVersionPrompt node={node(false)} onPick={onPick} onCancel={vi.fn()} />);

    await userEvent.upload(
      screen.getByLabelText('회의록.md 새 버전 파일'),
      new File(['same'], '계약 위반.md'),
    );

    const error = await screen.findByRole('alert', { name: '새 버전 업로드 오류' });
    expect(error.textContent).toContain('업로드 완료 여부를 확인하지 못했습니다.');
    expect(screen.queryByText('새 버전을 올렸습니다.')).toBeNull();
  });

  it('binary 재시도 결과가 실패면 다시 시도, 성공이면 닫기로 초점을 옮긴다', async () => {
    const user = userEvent.setup();
    const second = deferred<{ status: 'success' }>();
    const onPick = vi.fn()
      .mockResolvedValueOnce({ status: 'rejected', reason: 'too-large' })
      .mockReturnValueOnce(second.promise);
    render(<NewVersionPrompt node={node(true)} onPick={onPick} onCancel={vi.fn()} />);
    await user.upload(screen.getByLabelText('설계 원본.zip 새 버전 파일'), new File(['same'], '원래 선택.bin'));
    await user.click(screen.getByRole('button', { name: '새 버전 올리기' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '교체하기' }));

    const firstRetry = await screen.findByRole('button', { name: '다시 시도' });
    await waitFor(() => expect(document.activeElement).toBe(firstRetry));
    await user.click(firstRetry);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '교체하기' }));
    second.resolve({ status: 'success' });

    const close = await screen.findByRole('button', { name: '닫기' });
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it('닫은 뒤 부모가 정한 호출 지점 초점을 지연 타이머로 빼앗지 않는다', () => {
    vi.useFakeTimers();
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return <>
        <button type="button">호출 지점</button>
        <button type="button" role="treeitem" aria-selected="true">선택 행</button>
        {open ? <NewVersionPrompt
          node={node(false)}
          onPick={async () => ({ status: 'success' })}
          onCancel={() => {
            setOpen(false);
            setTimeout(() => screen.getByRole('button', { name: '호출 지점' }).focus(), 300);
          }}
        /> : null}
      </>;
    };
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '그만두기' }));
    vi.advanceTimersByTime(500);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '호출 지점' }));
  });

  it('실제 요청 동안 유지·busy·중복 방지를 표시하고 204 결과 뒤에만 성공을 유지한다', async () => {
    const user = userEvent.setup();
    const request = deferred<{ status: 'success' }>();
    const onCancel = vi.fn();
    const onPick = vi.fn(() => request.promise);
    render(<NewVersionPrompt node={node(false)} onPick={onPick} onCancel={onCancel} />);
    const selected = new File(['same'], '같은 파일.md');

    await user.upload(screen.getByLabelText('회의록.md 새 버전 파일'), selected);

    const prompt = screen.getByRole('dialog', { name: '새 버전 올리기' });
    expect(prompt.getAttribute('aria-busy')).toBe('true');
    expect(within(prompt).getByRole('status', { name: '새 버전 업로드 상태' }).textContent).toContain('새 버전을 올리는 중입니다.');
    expect((screen.getByLabelText('회의록.md 새 버전 파일') as HTMLInputElement).disabled).toBe(true);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(selected);
    expect(onCancel).not.toHaveBeenCalled();

    request.resolve({ status: 'success' });
    expect((await screen.findByRole('status', { name: '새 버전 업로드 상태' })).textContent).toContain('새 버전을 올렸습니다.');
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('거절 뒤 원래 File을 보존하고 md 명시 재시도만 같은 객체로 다시 보낸다', async () => {
    const user = userEvent.setup();
    const first = deferred<{ status: 'rejected'; reason: 'forbidden' }>();
    const second = deferred<{ status: 'success' }>();
    const onPick = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<NewVersionPrompt node={node(false)} onPick={onPick} onCancel={vi.fn()} />);
    const selected = new File(['same'], '원래 선택.md');
    await user.upload(screen.getByLabelText('회의록.md 새 버전 파일'), selected);
    first.resolve({ status: 'rejected', reason: 'forbidden' });

    const error = await screen.findByRole('alert', { name: '새 버전 업로드 오류' });
    expect(error.textContent).toContain('권한이 없어 새 버전을 올리지 못했습니다.');
    expect(screen.getByText('원래 선택.md')).toBeDefined();
    expect(onPick).toHaveBeenCalledTimes(1);

    await user.click(within(error).getByRole('button', { name: '다시 시도' }));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick.mock.calls[1]![0]).toBe(selected);
    second.resolve({ status: 'success' });
    expect((await screen.findByRole('status', { name: '새 버전 업로드 상태' })).textContent).toContain('새 버전을 올렸습니다.');
  });

  it('통신 실패는 완료 여부 불명 상태로 표시하고 원본 불변을 약속하지 않는다', async () => {
    const request = deferred<{ status: 'unknown' }>();
    render(<NewVersionPrompt node={node(false)} onPick={() => request.promise} onCancel={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText('회의록.md 새 버전 파일'), new File(['x'], '통신.md'));
    request.resolve({ status: 'unknown' });

    const error = await screen.findByRole('alert', { name: '새 버전 업로드 오류' });
    expect(error.textContent).toContain('업로드 완료 여부를 확인하지 못했습니다.');
    expect(error.textContent).not.toContain('원본은 변경되지 않았습니다');
  });

  it('binary 실패 재시도는 같은 File을 보존하되 매번 새 L2 확인 뒤에만 전송한다', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn().mockResolvedValue({ status: 'rejected', reason: 'too-large' });
    render(<NewVersionPrompt node={node(true)} onPick={onPick} onCancel={vi.fn()} />);
    const selected = new File(['same'], '원래 선택.bin');
    await user.upload(screen.getByLabelText('설계 원본.zip 새 버전 파일'), selected);
    await user.click(screen.getByRole('button', { name: '새 버전 올리기' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '교체하기' }));
    const error = await screen.findByRole('alert', { name: '새 버전 업로드 오류' });

    await user.click(within(error).getByRole('button', { name: '다시 시도' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const retryAlert = screen.getByRole('alertdialog', { name: '기존 파일을 교체하시겠습니까?' });
    expect(retryAlert.textContent).toContain('원래 선택.bin');
    await user.click(within(retryAlert).getByRole('button', { name: '교체하기' }));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick.mock.calls[1]![0]).toBe(selected);
  });

  it('업로드 수락 뒤 조회 실패는 조회만 다시 시도하고 POST를 반복하지 않는다', async () => {
    const user = userEvent.setup();
    const refresh = deferred<{ status: 'success' }>();
    const onPick = vi.fn().mockResolvedValue({ status: 'refresh-failed' });
    const onRetryRefresh = vi.fn(() => refresh.promise);
    render(<NewVersionPrompt node={node(false)} onPick={onPick} onRetryRefresh={onRetryRefresh} onCancel={vi.fn()} />);
    await user.upload(screen.getByLabelText('회의록.md 새 버전 파일'), new File(['same'], '조회.md'));

    const error = await screen.findByRole('alert', { name: '새 버전 업로드 오류' });
    expect(error.textContent).toContain('새 버전은 올라갔지만 화면을 새로 고치지 못했습니다.');
    await user.click(within(error).getByRole('button', { name: '화면 새로고침 다시 시도' }));
    expect(onRetryRefresh).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
    refresh.resolve({ status: 'success' });
    expect((await screen.findByRole('status', { name: '새 버전 업로드 상태' })).textContent).toContain('새 버전을 올렸습니다.');
  });

  it('대상 identity가 바뀌면 늦은 이전 결과를 새 대상에 표시하지 않는다', async () => {
    const request = deferred<{ status: 'success' }>();
    const view = render(<NewVersionPrompt node={node(false)} onPick={() => request.promise} onCancel={vi.fn()} />);
    await userEvent.upload(screen.getByLabelText('회의록.md 새 버전 파일'), new File(['same'], 'old.md'));
    view.rerender(<NewVersionPrompt node={{ ...node(false), id: 'other', name: '새 대상.md' }} onPick={() => Promise.resolve({ status: 'success' })} onCancel={vi.fn()} />);
    request.resolve({ status: 'success' });

    expect(await screen.findByLabelText('새 대상.md 새 버전 파일')).toBeDefined();
    expect(screen.queryByText('새 버전을 올렸습니다.')).toBeNull();
  });
});
