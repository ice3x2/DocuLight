import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

// @req IR-SHELL-006
export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return <span data-slot="badge" data-variant={variant} className={cn('dl-badge', className)} {...props} />;
}
