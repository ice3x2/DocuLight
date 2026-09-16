import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/utils.js';
import { Button } from './button.js';

export type NoticeVariant = 'info' | 'success' | 'warning' | 'error';

const NOTICE_MARKER: Record<NoticeVariant, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '!',
};

export interface InlineNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  variant?: NoticeVariant;
}

// @req IR-SHELL-006
export function InlineNotice({ children, className, title, variant = 'info', ...props }: InlineNoticeProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      data-slot="inline-notice"
      data-variant={variant}
      className={cn('dl-inline-notice', className)}
      {...props}
    >
      <span data-slot="notice-marker" aria-hidden="true">{NOTICE_MARKER[variant]}</span>
      <div>
        <strong data-slot="notice-title">{title}</strong>
        {children === undefined ? null : <div data-slot="notice-description">{children}</div>}
      </div>
    </div>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

// @req IR-SHELL-006
export function EmptyState({ action, className, description, title, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn('dl-empty-state', className)} {...props}>
      <strong data-slot="empty-state-title">{title}</strong>
      {description === undefined ? null : <p data-slot="empty-state-description">{description}</p>}
      {action === undefined ? null : <div data-slot="empty-state-action">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  description?: ReactNode;
  label: string;
  onRetry?: () => void;
  title: ReactNode;
}

// @req IR-SHELL-006
export function ErrorState({ className, description, label, onRetry, title, ...props }: ErrorStateProps) {
  return (
    <div role="alert" aria-label={label} data-slot="error-state" className={cn('dl-error-state', className)} {...props}>
      <strong data-slot="error-state-title">{title}</strong>
      {description === undefined ? null : <p data-slot="error-state-description">{description}</p>}
      {onRetry === undefined ? null : <Button variant="secondary" onClick={onRetry}>다시 시도</Button>}
    </div>
  );
}

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

// @req IR-SHELL-006
export function LoadingState({ className, label, ...props }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={label}
      data-slot="loading-state"
      className={cn('dl-loading-state', className)}
      {...props}
    >
      <span data-slot="loading-state-marker" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
