import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Button, Field, Input, Select, Textarea } from '../src/components/ui/index.js';

describe('newspaper foundation controls', () => {
  it('keeps buttons inert unless a caller explicitly submits', () => {
    const { rerender } = render(<Button>취소</Button>);

    const cancel = screen.getByRole('button', { name: '취소' });
    expect(cancel.getAttribute('type')).toBe('button');
    expect(cancel.getAttribute('data-variant')).toBe('primary');

    rerender(<Button type="submit">저장</Button>);
    expect(screen.getByRole('button', { name: '저장' }).getAttribute('type')).toBe('submit');
  });

  it('connects a persistent label, help, and error without owning field state', () => {
    const ref = createRef<HTMLInputElement>();

    render(
      <Field
        label="문서 이름"
        description="목록에서 구분할 이름입니다."
        error="문서 이름을 입력하세요."
      >
        <Input ref={ref} defaultValue="보존되는 값" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: '문서 이름' });
    expect(input).toBe(ref.current);
    expect((input as HTMLInputElement).value).toBe('보존되는 값');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const description = input
      .getAttribute('aria-describedby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(description).toBe('목록에서 구분할 이름입니다. 문서 이름을 입력하세요.');
  });

  it('preserves native input, textarea, and select semantics', () => {
    render(
      <>
        <Input aria-label="짧은 입력" />
        <Textarea aria-label="긴 입력" rows={3} />
        <Select aria-label="선택">
          <option value="paper">종이</option>
        </Select>
      </>,
    );

    expect(screen.getByRole('textbox', { name: '짧은 입력' }).tagName).toBe('INPUT');
    expect(screen.getByRole('textbox', { name: '긴 입력' }).tagName).toBe('TEXTAREA');
    expect(screen.getByRole('combobox', { name: '선택' }).tagName).toBe('SELECT');
  });

  it('preserves native composition state without injecting submit or selection side effects', () => {
    const keyEvents: boolean[] = [];
    let submissions = 0;

    render(
      <form onSubmit={(event) => { event.preventDefault(); submissions += 1; }}>
        <Input
          aria-label="한글 입력"
          onKeyDown={(event) => keyEvents.push(event.nativeEvent.isComposing)}
        />
        <Select aria-label="검색 선택기">
          <option value="paper">신문지</option>
        </Select>
        <Button>취소</Button>
      </form>,
    );

    const input = screen.getByRole('textbox', { name: '한글 입력' });
    input.focus();
    fireEvent.compositionStart(input, { data: '한' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(input, { data: '한' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: '검색 선택기' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(keyEvents).toEqual([true]);
    expect(submissions).toBe(0);
    expect(document.activeElement).toBe(input);
  });
});
