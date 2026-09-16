import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

// @req IR-SHELL-006
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    data-slot="checkbox"
    className={cn('dl-checkbox', className)}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';
