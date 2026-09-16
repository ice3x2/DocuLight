import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Badge,
  EmptyState,
  InlineNotice,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../src/components/ui/index.js';

describe('IR-SHELL-006 shared management presentation', () => {
  it('keeps native table structure and numeric alignment intent', () => {
    render(
      <Table aria-label="Workspace usage">
        <TableHeader>
          <TableRow><TableHead>Path</TableHead><TableHead numeric>Bytes</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          <TableRow selected>
            <TableCell>C:/vault/아주-긴-한글-문서-경로.md</TableCell>
            <TableCell numeric>2048</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'Workspace usage' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getAllByRole('columnheader')[1]?.getAttribute('data-numeric')).toBe('true');
    expect(within(table).getAllByRole('cell')[1]?.getAttribute('data-numeric')).toBe('true');
    expect(within(table).getAllByRole('row')[1]?.getAttribute('data-state')).toBe('selected');
  });

  it('communicates badge and notice states with text and live-region semantics', () => {
    render(
      <>
        <Badge variant="success">Active</Badge>
        <InlineNotice variant="error" title="Could not load">Try again.</InlineNotice>
      </>,
    );

    expect(screen.getByText('Active').getAttribute('data-variant')).toBe('success');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Could not load');
    expect(alert.textContent).toContain('Try again.');
    expect(alert.querySelector('[data-slot="notice-marker"]')).not.toBeNull();
  });

  it('distinguishes loading and empty states', () => {
    render(
      <>
        <LoadingState label="Loading workspaces" />
        <EmptyState title="No workspaces" description="Create one to begin." />
      </>,
    );

    expect(screen.getByRole('status', { name: 'Loading workspaces' })).toBeDefined();
    expect(screen.getByText('No workspaces')).toBeDefined();
    expect(screen.getByText('Create one to begin.')).toBeDefined();
  });
});
