import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../src/components/ui/index.js';
import { ConfirmGate } from '../src/confirm/ConfirmGate.js';

afterEach(cleanup);

describe('IR-SHELL-008 Radix overlay adapters', () => {
  it('ships the inspected AlertDialog license in the production attribution', () => {
    const root = resolve(process.cwd(), 'src/main.tsx').endsWith('packages\\web\\src\\main.tsx')
      ? process.cwd()
      : resolve(process.cwd(), 'packages/web');
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).toContain("['@radix-ui/react-alert-dialog', 'LICENSE']");
    expect(readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toContain('@radix-ui/react-alert-dialog');
  });

  it('exposes an alert dialog with associated title and description', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete workspace</AlertDialogTitle>
          <AlertDialogDescription>This removes access for 3 users.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Delete workspace' });
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText('This removes access for 3 users.')).toBeDefined();
  });

  it('preserves Radix dialog, popover, and menu roles through shared adapters', () => {
    const dialog = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit name</DialogTitle>
          <DialogDescription>Choose a distinct name.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit name' })).toBeDefined();
    dialog.unmount();

    const popover = render(
      <Popover open>
        <PopoverTrigger>Open filters</PopoverTrigger>
        <PopoverContent>Filter options</PopoverContent>
      </Popover>,
    );
    expect(screen.getByText('Filter options').getAttribute('data-slot')).toBe('popover-content');
    popover.unmount();

    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>Rename</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeDefined();
  });
});

describe('FR-CONFIRM-001 shared confirmation presentation', () => {
  it('runs L1 immediately without rendering a confirmation surface', async () => {
    const confirm = vi.fn();
    render(
      <ConfirmGate open grade="L1" title="Refresh" onConfirm={confirm} onCancel={() => undefined} />,
    );

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('puts initial focus on cancel and reports one cancel for Escape', async () => {
    const cancel = vi.fn();
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmGate
          open={open}
          grade="L2"
          title="Delete workspace"
          description="This action cannot be undone."
          onConfirm={() => undefined}
          onCancel={() => { cancel(); setOpen(false); }}
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toBe(document.activeElement));
    await user.keyboard('{Escape}');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does not close or call cancel while an asynchronous confirm owns completion', async () => {
    let finish = () => undefined;
    const confirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const cancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmGate
        open
        grade="L2"
        title="Delete workspace"
        description="This action cannot be undone."
        onConfirm={confirm}
        onCancel={cancel}
      />,
    );

    const action = screen.getByRole('button', { name: '실행' });
    await user.click(action);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(action).toHaveProperty('disabled', true);
    finish();
    await waitFor(() => expect(action).toHaveProperty('disabled', false));
  });

  it('restores focus to a supplied logical successor after close', async () => {
    const successor = createRef<HTMLButtonElement>();
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={successor} type="button" onClick={() => setOpen(true)}>Open danger</button>
          <ConfirmGate
            open={open}
            grade="L2"
            title="Danger"
            description="Review the impact."
            restoreFocusRef={successor}
            onConfirm={() => undefined}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open danger' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(successor.current).toBe(document.activeElement));
  });
});
