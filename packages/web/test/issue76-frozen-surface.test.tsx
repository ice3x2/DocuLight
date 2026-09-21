import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';
import type { LiveDraftRegistration } from '../src/auth/auth-boundary.js';

describe('IR-SHELL-009 frozen editor gate', () => {
  it('keeps one exact snapshot and blocks mode changes and local edits while frozen', async () => {
    let registration: LiveDraftRegistration | undefined;
    render(<DocumentSurface
      file={{ nodeId: 'n1', name: 'note.md', level: 'edit' }}
      initialMode="source"
      body="exact owner bytes"
      baseHash="h1"
      draftOwner={{ userId: 'user-a', generation: 1 }}
      registerDraft={(value) => { registration = value; return () => undefined; }}
      allowsProtected={() => true}
    />);
    expect(registration).toBeDefined();

    act(() => registration!.freeze(true));
    const source = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(source.readOnly).toBe(true);
    fireEvent.change(source, { target: { value: 'mutated after freeze' } });
    fireEvent.click(screen.getByRole('button', { name: '보기' }));

    expect(document.querySelector('[data-document-surface]')?.getAttribute('data-editor-mode')).toBe('source');
    expect(registration!.read()).toBe('exact owner bytes');
  });

  it('keeps merge resolution inert after freeze', () => {
    let registration: LiveDraftRegistration | undefined;
    const onSaved = vi.fn();
    render(<DocumentSurface
      file={{ nodeId: 'n1', name: 'note.md', level: 'edit' }}
      initialMode="source"
      body="local bytes"
      baseHash="h1"
      save="conflict"
      serverBody="server bytes"
      onSaved={onSaved}
      draftOwner={{ userId: 'user-a', generation: 1 }}
      registerDraft={(value) => { registration = value; return () => undefined; }}
      allowsProtected={() => true}
    />);
    act(() => registration!.freeze(true));
    const merge = document.querySelector('[data-merge]')!;
    expect([...merge.querySelectorAll('[contenteditable]')].every((node) => node.getAttribute('contenteditable') === 'false')).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
