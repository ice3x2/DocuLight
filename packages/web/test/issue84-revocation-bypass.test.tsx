import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BulkRevokePanel, type BulkPlan } from '../src/acl/BulkRevokePanel.js';
import type { PrincipalRow, RevocationBody } from '../src/api/client.js';

afterEach(cleanup);

const warning = 'ACL 회수로 슈퍼유저 우회 접근은 제거되지 않음';
const subject = (id: string, system = false): PrincipalRow => ({ id, name: id, kind: system ? 'group' : 'user', status: 'active', system });
const response = (id: string, bypass: boolean): RevocationBody => ({
  subject: { id, aclRevokePreservesSuperuserBypass: bypass },
  scope: 'instance',
  rows: [{ entryId: `e-${id}`, workspaceId: 'ws', workspaceName: 'workspace', path: `${id}.md`, level: 'view', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }],
});
const plan = (selected: PrincipalRow, bypass: boolean): BulkPlan => ({ subjects: [{ subject: selected, response: response(selected.id, bypass) }] });

describe('IR-PRINCIPAL-005 revocation bypass UI', () => {
  it('shows authoritative bypass and generic system notices independently in the selected row and L3', async () => {
    const selected = subject('system-superuser', true);
    const stable = plan(selected, true);
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws" subjects={[selected]} plan={{ state: 'ready', data: stable }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn().mockResolvedValue(stable)} onRevokeSubject={vi.fn()} />);

    expect(screen.getByTestId('system-group-notice')).toBeDefined();
    expect(screen.getByTestId('superuser-bypass-notice').textContent).toContain(warning);
    await userEvent.setup().click(screen.getByRole('button', { name: /권한.*회수/ }));
    expect(within(await screen.findByRole('alertdialog')).getByText(warning)).toBeDefined();
  });

  it('does not infer bypass from a forged candidate and treats missing preview metadata as invalid', () => {
    const forged = { ...subject('system-superuser'), name: 'Superuser', aclRevokePreservesSuperuserBypass: true } as PrincipalRow;
    const missing = { ...response(forged.id, false) } as Partial<RevocationBody>;
    delete missing.subject;
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws" subjects={[forged]} plan={{ state: 'ready', data: { subjects: [{ subject: forged, response: missing as RevocationBody }] } }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} />);
    expect(screen.queryByTestId('superuser-bypass-notice')).toBeNull();
    expect((screen.getByRole('button', { name: /권한.*회수/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not expose a cross-paired authoritative warning when preview subject identity mismatches the selected item', () => {
    const selected = subject('selected-user');
    const crossPaired = {
      subjects: [{
        subject: selected,
        response: response('different-private-user', true),
      }],
    } as BulkPlan;

    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws" subjects={[selected]} plan={{ state: 'ready', data: crossPaired }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} />);

    expect(screen.queryByTestId('superuser-bypass-notice')).toBeNull();
    expect(screen.queryByText(warning)).toBeNull();
    expect((screen.getByRole('button', { name: /권한.*회수/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('invalidates typed consent when only bypass metadata changes before submit', async () => {
    const selected = subject('user-1');
    const initial = plan(selected, false);
    const changed = plan(selected, true);
    const preview = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(changed);
    const execute = vi.fn();
    render(<BulkRevokePanel contextKey="ctx" workspaceId="ws" subjects={[selected]} plan={{ state: 'ready', data: initial }} onPick={vi.fn()} onRemove={vi.fn()} onPreview={preview} onRevokeSubject={execute} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /권한.*회수/ }));
    const gate = await screen.findByRole('alertdialog');
    await user.type(within(gate).getByRole('textbox'), '1');
    await user.click(within(gate).getByRole('button', { name: /실행/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('변경');
  });
});
