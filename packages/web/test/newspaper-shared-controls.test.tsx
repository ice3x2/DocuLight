import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Button, Checkbox, Radio } from '../src/components/ui/index.js';
import { PrincipalPicker } from '../src/principal/PrincipalPicker.js';

describe('IR-SHELL-006 shared selection and loading controls', () => {
  it('preserves native checkbox and radio names, state, and refs', () => {
    const checkboxRef = createRef<HTMLInputElement>();
    const radioRef = createRef<HTMLInputElement>();

    render(
      <fieldset>
        <legend>Selection</legend>
        <label>
          <Checkbox ref={checkboxRef} name="notify" defaultChecked /> Notify
        </label>
        <label>
          <Radio ref={radioRef} name="theme" value="paper" defaultChecked /> Paper
        </label>
      </fieldset>,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Notify' });
    const radio = screen.getByRole('radio', { name: 'Paper' });
    expect(checkbox).toBe(checkboxRef.current);
    expect(radio).toBe(radioRef.current);
    expect(checkbox).toHaveProperty('name', 'notify');
    expect(checkbox).toHaveProperty('checked', true);
    expect(radio).toHaveProperty('name', 'theme');
    expect(radio).toHaveProperty('value', 'paper');
    expect(radio).toHaveProperty('checked', true);
  });

  it('communicates loading and prevents repeated activation while keeping its label', () => {
    render(<Button loading>Save document</Button>);

    const button = screen.getByRole('button', { name: 'Save document' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button).toHaveProperty('disabled', true);
    expect(button.querySelector('[data-slot="button-spinner"]')).not.toBeNull();
  });

  it('keeps search selection Enter inside the picker, including IME composition', () => {
    render(
      <form>
        <PrincipalPicker scope="node:n1" />
      </form>,
    );

    const input = screen.getByRole('combobox');
    const enter = createEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    const composingEnter = createEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    fireEvent(input, enter);
    fireEvent.compositionStart(input, { data: '한' });
    fireEvent(input, composingEnter);
    fireEvent.compositionEnd(input, { data: '한' });

    expect(enter.defaultPrevented).toBe(true);
    expect(composingEnter.defaultPrevented).toBe(true);
  });
});
