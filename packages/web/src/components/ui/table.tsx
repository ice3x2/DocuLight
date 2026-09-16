import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

// @req IR-SHELL-006
export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} data-slot="table" className={cn('dl-table', className)} {...props} />
  ),
);
Table.displayName = 'Table';

// @req IR-SHELL-006
export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} data-slot="table-header" className={cn('dl-table-header', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

// @req IR-SHELL-006
export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} data-slot="table-body" className={cn('dl-table-body', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

// @req IR-SHELL-006
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected = false, ...props }, ref) => (
    <tr
      ref={ref}
      aria-selected={selected || undefined}
      data-slot="table-row"
      data-state={selected ? 'selected' : undefined}
      className={cn('dl-table-row', className)}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

// @req IR-SHELL-006
export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, numeric = false, ...props }, ref) => (
    <th
      ref={ref}
      data-slot="table-head"
      data-numeric={numeric || undefined}
      className={cn('dl-table-head', className)}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

// @req IR-SHELL-006
export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric = false, ...props }, ref) => (
    <td
      ref={ref}
      data-slot="table-cell"
      data-numeric={numeric || undefined}
      className={cn('dl-table-cell', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';
