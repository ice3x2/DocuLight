import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocalRecoverySurface } from '../src/auth/LocalRecoverySurface.js';
import { DocumentArea } from '../src/document/DocumentArea.js';
import type { RecoveryRecord } from '../src/auth/auth-boundary.js';

const record: RecoveryRecord = {
  id: 'draft-1',
  nodeId: 'secret-node-id',
  revision: 'server-hash',
  mode: 'source',
  text: 'exact local bytes\n둘째 줄',
  userId: 'user-a',
  generation: 3,
  fileName: 'local-draft-1.md',
};

describe('IR-SHELL-009 AC-10 same-owner local recovery', () => {
  it('guards reload while an unresolved local recovery record exists', () => {
    const rendered = render(<LocalRecoverySurface records={[record]} onResolve={() => undefined} />);
    const pending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);

    rendered.rerender(<LocalRecoverySurface records={[]} onResolve={() => undefined} />);
    const resolved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(resolved);
    expect(resolved.defaultPrevented).toBe(false);
  });

  it('shows exact bytes without server names and resolves export only after acknowledgement', () => {
    const onResolve = vi.fn();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LocalRecoverySurface records={[record]} onResolve={onResolve} />);

    expect(screen.getByRole('heading', { name: '로컬 편집본 — 서버에 저장되지 않았습니다.' })).toBeDefined();
    const editor = screen.getByRole('textbox', { name: '로컬 편집 내용' }) as HTMLTextAreaElement;
    expect(editor.readOnly).toBe(true);
    expect(editor.value).toBe(record.text);
    expect(document.body.textContent).not.toContain(record.nodeId);
    expect(document.body.textContent).not.toContain(record.revision);

    const acknowledge = screen.getByRole('button', { name: '파일 보관을 확인하고 제거' });
    expect((acknowledge as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '로컬 파일로 다운로드' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local');
    expect((acknowledge as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(acknowledge);
    expect(onResolve).toHaveBeenCalledWith('draft-1');
  });

  it('supports explicit discard without a download', () => {
    const onResolve = vi.fn();
    render(<LocalRecoverySurface records={[record]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: '편집본 버리기' }));
    expect(onResolve).toHaveBeenCalledWith('draft-1');
  });
});

describe('FR-EDITOR-005 mounted-document local recovery', () => {
  it('guards reload until every mounted 404 recovery record is resolved', () => {
    const state = {
      tabs: [{ nodeId: 'secret-node-id', name: 'draft.md', breadcrumb: [], save: 'saved' as const, level: 'edit' as const }],
      activeId: 'secret-node-id',
    };
    const rendered = render(
      <DocumentArea
        state={state}
        onState={() => undefined}
        readStates={{ 'secret-node-id': { state: 'missing' } }}
        recovery={{ 'secret-node-id': [record] }}
      />,
    );
    const pending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);

    rendered.rerender(<DocumentArea state={state} onState={() => undefined} recovery={{}} />);
    const resolved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(resolved);
    expect(resolved.defaultPrevented).toBe(false);
  });
});
