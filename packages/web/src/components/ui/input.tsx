import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input ref={ref} data-slot="input" className={cn('dl-input', className)} {...props} />
));
Input.displayName = 'Input';
